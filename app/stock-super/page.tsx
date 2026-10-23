"use client";

// /stock-super — stock compartido con el supermercado (solo admin).
// Los productos son los mismos y cada lado tiene su stock: aca se ven los dos y se
// mueve de uno al otro. Solo stock: precios, ventas y caja no se tocan.
// Lo arma el sistema del super (lib/kiosko-stock.ts → /api/stock-super).

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/format";
import { getAuthToken } from "@/services/auth-service";

type Direccion = "a_comercio" | "a_distribuidora";
type Estado = "pendiente" | "origen_ok" | "completa" | "fallida";

interface Fila {
  productoId: string;
  distId: string;
  nombre: string;
  codigo: string | null;
  stockComercio: number;
  stockDistribuidora: number | null;
}

interface Transferencia {
  id: string;
  nombre?: string;
  productoId: string;
  cantidad: number;
  direccion: Direccion;
  estado: Estado;
  pedidaEn: "comercio" | "distribuidora";
  usuario: string | null;
  error: string | null;
  createdAt: string;
}

interface Datos {
  productos: Fila[];
  transferencias: Transferencia[];
  errorDistribuidora?: string;
}

/** Filas que se dibujan a la vez: con miles de productos se busca. */
const FILAS_VISIBLES = 100;

const ESTADO: Record<Estado, { texto: string; clase: string }> = {
  completa: { texto: "Hecha", clase: "bg-emerald-100 text-emerald-800" },
  fallida: { texto: "No se hizo", clase: "bg-red-100 text-red-800" },
  pendiente: { texto: "A medio camino", clase: "bg-amber-100 text-amber-800" },
  origen_ok: { texto: "A medio camino", clase: "bg-amber-100 text-amber-800" },
};

const abierta = (t: Transferencia) => t.estado === "pendiente" || t.estado === "origen_ok";
const textoDireccion = (d: Direccion) => (d === "a_comercio" ? "Distribuidora → Super" : "Super → Distribuidora");
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function api<T>(init?: { method: "POST"; body: Record<string, unknown> }): Promise<T> {
  const token = await getAuthToken();
  if (!token) throw new Error("No autenticado");
  const res = await fetch("/api/stock-super", {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init ? { "Content-Type": "application/json" } : {}) },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo completar");
  return data as T;
}

export default function StockSuperPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await api<Datos>());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el stock");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    const filas = datos?.productos ?? [];
    if (palabras.length === 0) return filas;
    return filas.filter((f) => {
      const donde = normalizar(`${f.nombre} ${f.codigo ?? ""}`);
      return palabras.every((p) => donde.includes(p));
    });
  }, [datos, busqueda]);
  const abiertas = (datos?.transferencias ?? []).filter(abierta);

  const mover = async (fila: Fila, direccion: Direccion) => {
    const cantidad = Number(cantidades[fila.productoId] || "1");
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      toast.error("Poné una cantidad entera mayor a 0");
      return;
    }
    const disponible = direccion === "a_comercio" ? fila.stockDistribuidora : fila.stockComercio;
    if (disponible !== null && cantidad > disponible) {
      toast.error(`No alcanza: ${direccion === "a_comercio" ? "la distribuidora" : "el super"} tiene ${disponible}`);
      return;
    }
    setMoviendo(fila.productoId);
    try {
      const { transferencia: t } = await api<{ transferencia: Transferencia }>({
        method: "POST",
        body: { accion: "transferir", productoId: fila.productoId, cantidad, direccion },
      });
      if (t.estado === "completa") {
        toast.success(`${cantidad} × ${fila.nombre} · ${textoDireccion(direccion)}`);
        setCantidades((c) => ({ ...c, [fila.productoId]: "" }));
      } else if (t.estado === "fallida") {
        toast.error(t.error ?? "No se pudo mover el stock");
      } else {
        toast.warning("Quedó a medio camino: tocá “Reintentar” arriba.", { description: t.error ?? undefined });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo mover el stock");
    } finally {
      setMoviendo(null);
      await cargar();
    }
  };

  const reintentar = async () => {
    setReintentando(true);
    try {
      const { transferencias } = await api<{ transferencias: Transferencia[] }>({ method: "POST", body: { accion: "reintentar" } });
      const quedan = transferencias.filter(abierta).length;
      if (quedan === 0) toast.success("Listo: se completaron");
      else toast.warning(`Quedan ${quedan} sin completar`, { description: transferencias.find((t) => t.error)?.error ?? undefined });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reintentar");
    } finally {
      setReintentando(false);
      await cargar();
    }
  };

  return (
    <MainLayout title="Stock Super" description="Stock compartido con el supermercado" allowedRoles={["admin"]}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Los productos son los mismos, pero cada uno tiene su stock. Poné la cantidad y elegí para qué lado se mueve.
        </p>

        {abiertas.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {abiertas.length === 1 ? "Hay 1 movimiento" : `Hay ${abiertas.length} movimientos`} a medio camino (se cortó la conexión).
              Reintentar lo termina sin descontar dos veces.
            </p>
            <Button size="sm" className="rounded-xl" disabled={reintentando} onClick={() => void reintentar()}>
              {reintentando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Reintentar
            </Button>
          </div>
        )}

        {datos?.errorDistribuidora && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            El super no pudo leer el stock de la distribuidora ({datos.errorDistribuidora}).
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o código" className="rounded-2xl pl-9" />
          </div>
          <Button variant="outline" className="rounded-2xl" onClick={() => void cargar()} aria-label="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!datos && !error ? (
          <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
        ) : datos && (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Distribuidora</TableHead>
                  <TableHead className="text-right">Super</TableHead>
                  <TableHead className="w-24">Cantidad</TableHead>
                  <TableHead className="text-right">Mover</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.slice(0, FILAS_VISIBLES).map((f) => {
                  const ocupado = moviendo === f.productoId;
                  return (
                    <TableRow key={f.productoId}>
                      <TableCell>
                        <p className="font-medium">{f.nombre}</p>
                        {f.codigo && <p className="text-xs text-muted-foreground">{f.codigo}</p>}
                      </TableCell>
                      <TableCell className={cn("text-right text-base font-semibold tabular-nums", (f.stockDistribuidora ?? 0) <= 0 && "text-red-600")}>
                        {f.stockDistribuidora ?? "—"}
                      </TableCell>
                      <TableCell className={cn("text-right text-base font-semibold tabular-nums", f.stockComercio <= 0 && "text-red-600")}>
                        {f.stockComercio}
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          value={cantidades[f.productoId] ?? ""}
                          placeholder="1"
                          onChange={(e) => setCantidades((c) => ({ ...c, [f.productoId]: e.target.value.replace(/[^\d]/g, "") }))}
                          className="h-9 w-20 rounded-xl text-right"
                          aria-label={`Cantidad de ${f.nombre}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            disabled={ocupado || f.stockDistribuidora === null || f.stockComercio <= 0}
                            onClick={() => void mover(f, "a_distribuidora")}
                            title="Traer del super a la distribuidora"
                          >
                            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="mr-1 h-3.5 w-3.5" />} A la distri
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            disabled={ocupado || f.stockDistribuidora === null || f.stockDistribuidora <= 0}
                            onClick={() => void mover(f, "a_comercio")}
                            title="Mandar de la distribuidora al super"
                          >
                            Al super <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {datos.productos.length === 0 ? "El super todavía no tiene productos de la distribuidora." : "Nada coincide con la búsqueda."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {filtradas.length > FILAS_VISIBLES && (
              <p className="border-t p-3 text-center text-xs text-muted-foreground">
                Mostrando {FILAS_VISIBLES} de {filtradas.length}. Buscá para encontrar el resto.
              </p>
            )}
          </div>
        )}

        {datos && datos.transferencias.length > 0 && (
          <section className="space-y-2 rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Últimos movimientos</h2>
            <ul className="divide-y text-sm">
              {datos.transferencias.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.cantidad} × {t.nombre ?? t.productoId}</p>
                    <p className="text-xs text-muted-foreground">
                      {textoDireccion(t.direccion)} · {formatDateTime(new Date(t.createdAt))}
                      {t.usuario ? ` · ${t.usuario}` : ""}
                      {t.pedidaEn === "comercio" ? " · desde el super" : ""}
                    </p>
                    {t.error && t.estado !== "completa" && <p className="text-xs text-red-600">{t.error}</p>}
                  </div>
                  <Badge className={cn("rounded-xl", ESTADO[t.estado].clase)}>{ESTADO[t.estado].texto}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </MainLayout>
  );
}
