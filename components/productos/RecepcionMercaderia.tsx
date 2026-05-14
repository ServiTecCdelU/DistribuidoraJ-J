"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Package, CheckCircle2, RefreshCw, Loader2, PackageCheck } from "lucide-react";
import {
  getPedidoMayoristaActivo,
  actualizarUnidadesRecibidas,
  actualizarEstadoPedidoMayorista,
} from "@/services/pedidos-mayorista-service";
import { getMayoristaProductos } from "@/services/mayorista-service";
import { registrarMovimiento, actualizarVentasPendientesFIFO } from "@/services/stock-service";
import type { PedidoMayorista, MayoristaProducto } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RecepcionItem {
  productoId: string;
  nombre: string;
  bultosPedidos: number;
  unidadesPedidas: number;
  unidadesRecibidas: number;
  unidadesPorBulto: number;
  bultosRecibidos: string;
}

const estadoLabel: Record<PedidoMayorista["estado"], string> = {
  borrador: "Borrador",
  enviado: "Enviado al mayorista",
  recibido_parcial: "Recepción parcial",
  cerrado: "Cerrado",
};
const estadoColor: Record<PedidoMayorista["estado"], string> = {
  borrador: "bg-muted text-muted-foreground",
  enviado: "bg-blue-100 text-blue-700",
  recibido_parcial: "bg-amber-100 text-amber-700",
  cerrado: "bg-emerald-100 text-emerald-700",
};

export function RecepcionMercaderia() {
  const [pedido, setPedido] = useState<PedidoMayorista | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RecepcionItem[]>([]);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [pedidoActivo, productos] = await Promise.all([
        getPedidoMayoristaActivo(),
        getMayoristaProductos(),
      ]);

      const map = new Map<string, MayoristaProducto>();
      productos.forEach((p) => map.set(p.id, p));

      setPedido(pedidoActivo);

      if (pedidoActivo) {
        setItems(
          pedidoActivo.productos.map((p) => {
            const prod = map.get(p.productoId);
            return {
              productoId: p.productoId,
              nombre: p.nombre,
              bultosPedidos: p.bultosPedidos,
              unidadesPedidas: p.unidadesPedidas,
              unidadesRecibidas: p.unidadesRecibidas,
              unidadesPorBulto: prod?.unidadesPorBulto ?? 1,
              bultosRecibidos: "",
            };
          })
        );
      }
    } catch {
      toast.error("Error al cargar pedido activo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleBultosChange = (idx: number, value: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, bultosRecibidos: value } : item))
    );
  };

  const handleConfirmarRecepcion = async () => {
    if (!pedido) return;

    const itemsConRecepcion = items.filter((item) => {
      const bultos = parseInt(item.bultosRecibidos, 10);
      return !isNaN(bultos) && bultos > 0;
    });

    if (itemsConRecepcion.length === 0) {
      toast.error("Ingresá la cantidad de bultos recibidos para al menos un producto");
      return;
    }

    setGuardando(true);
    try {
      for (const item of itemsConRecepcion) {
        const bultos = parseInt(item.bultosRecibidos, 10);
        const unidades = bultos * item.unidadesPorBulto;

        // Registrar movimiento apertura_bulto y actualizar stockLocal
        await registrarMovimiento({
          productoId: item.productoId,
          tipo: "apertura_bulto",
          cantidad: unidades,
          referencia: pedido.id,
        });

        // Actualizar ventas pendientes FIFO
        await actualizarVentasPendientesFIFO(item.productoId, unidades);
      }

      // Actualizar unidadesRecibidas en el pedido
      const productosActualizados = pedido.productos.map((p) => {
        const item = itemsConRecepcion.find((i) => i.productoId === p.productoId);
        if (!item) return p;
        const bultos = parseInt(item.bultosRecibidos, 10);
        const unidades = bultos * (items.find((i) => i.productoId === p.productoId)?.unidadesPorBulto ?? 1);
        return { ...p, unidadesRecibidas: p.unidadesRecibidas + unidades };
      });

      const todoRecibido = productosActualizados.every(
        (p) => p.unidadesRecibidas >= p.unidadesPedidas
      );
      const nuevoEstado: PedidoMayorista["estado"] = todoRecibido ? "cerrado" : "recibido_parcial";

      await actualizarUnidadesRecibidas(pedido.id, productosActualizados);
      await actualizarEstadoPedidoMayorista(pedido.id, nuevoEstado);

      toast.success(todoRecibido ? "Pedido completado y cerrado" : "Recepción parcial registrada");
      await cargar();
    } catch {
      toast.error("Error al registrar la recepción");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="text-center py-16 space-y-3">
        <PackageCheck className="h-12 w-12 text-muted-foreground mx-auto" />
        <p className="text-sm font-medium">No hay pedido activo al mayorista</p>
        <p className="text-xs text-muted-foreground">
          Los pedidos activos son los que están en estado "Enviado" o "Recepción parcial".
        </p>
        <Button variant="outline" size="sm" className="gap-2 rounded-xl mt-2" onClick={cargar}>
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header del pedido */}
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-teal-600" />
              Pedido del {pedido.fecha.toLocaleDateString("es-AR")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pedido.productos.length} producto{pedido.productos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", estadoColor[pedido.estado])}>
              {estadoLabel[pedido.estado]}
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={cargar}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabla de recepción */}
      <div className="rounded-2xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">
                Producto
              </th>
              <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">
                Pedido
              </th>
              <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">
                Recibido
              </th>
              <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground w-32">
                Bultos a ingresar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, idx) => {
              const bultosNum = parseInt(item.bultosRecibidos, 10);
              const unidadesNuevas =
                !isNaN(bultosNum) && bultosNum > 0 ? bultosNum * item.unidadesPorBulto : 0;
              const yaCompleto = item.unidadesRecibidas >= item.unidadesPedidas;

              return (
                <tr
                  key={item.productoId}
                  className={cn("hover:bg-muted/20", yaCompleto && "opacity-60")}
                >
                  <td className="px-3 py-2.5 font-medium max-w-[160px] truncate">
                    {item.nombre}
                    {yaCompleto && (
                      <CheckCircle2 className="inline h-3 w-3 text-emerald-600 ml-1.5" />
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">
                    {item.unidadesPedidas} uds
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right font-semibold",
                      item.unidadesRecibidas >= item.unidadesPedidas
                        ? "text-emerald-600"
                        : "text-amber-600"
                    )}
                  >
                    {item.unidadesRecibidas}
                    {unidadesNuevas > 0 && (
                      <span className="text-teal-600 ml-1">(+{unidadesNuevas})</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {!yaCompleto ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <Input
                          type="number"
                          min="0"
                          value={item.bultosRecibidos}
                          onChange={(e) => handleBultosChange(idx, e.target.value)}
                          className="w-20 h-7 text-xs text-right rounded-lg"
                          placeholder="0"
                        />
                        <span className="text-[10px] text-muted-foreground">
                          × {item.unidadesPorBulto} uds/bulto
                        </span>
                      </div>
                    ) : (
                      <span className="text-emerald-600 font-semibold text-xs">Completo</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button
        className="w-full rounded-xl gap-2"
        onClick={handleConfirmarRecepcion}
        disabled={guardando}
      >
        {guardando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Registrando...
          </>
        ) : (
          <>
            <PackageCheck className="h-4 w-4" /> Confirmar recepción
          </>
        )}
      </Button>
    </div>
  );
}
