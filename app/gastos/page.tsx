"use client";

import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { gastosApi, type GastoFijo, type GastoVariable } from "@/lib/api";
import { formatCurrency } from "@/lib/utils/format";
import { labelCategoria, periodoActual, esGastoFijoVigente } from "@/lib/gastos-constants";
import { GastoFijoModal } from "@/components/gastos/gasto-fijo-modal";
import { GastoVariableModal } from "@/components/gastos/gasto-variable-modal";
import { Plus, Pencil, Trash2, Repeat, CalendarDays, Wallet } from "lucide-react";
import { toast } from "sonner";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function GastosPage() {
  const [periodo, setPeriodo] = useState(periodoActual());
  const [fijos, setFijos] = useState<GastoFijo[]>([]);
  const [variables, setVariables] = useState<GastoVariable[]>([]);
  const [loading, setLoading] = useState(true);

  const [fijoModal, setFijoModal] = useState<{ open: boolean; gasto: GastoFijo | null }>({ open: false, gasto: null });
  const [varModal, setVarModal] = useState<{ open: boolean; gasto: GastoVariable | null }>({ open: false, gasto: null });
  const [confirm, setConfirm] = useState<{ open: boolean; tipo: "fijo" | "variable"; id: string; nombre: string }>({
    open: false, tipo: "fijo", id: "", nombre: "",
  });

  const [year, month] = useMemo(() => periodo.split("-").map(Number), [periodo]);

  const load = async () => {
    setLoading(true);
    try {
      const [f, v] = await Promise.all([gastosApi.getFijos(), gastosApi.getVariables(year, month)]);
      setFijos(f);
      setVariables(v);
    } catch {
      toast.error("No se pudieron cargar los gastos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const fijosVigentes = useMemo(() => fijos.filter((g) => esGastoFijoVigente(g, periodo)), [fijos, periodo]);
  const totalFijos = useMemo(() => fijosVigentes.reduce((a, g) => a + g.monto, 0), [fijosVigentes]);
  const totalVariables = useMemo(() => variables.reduce((a, g) => a + g.monto, 0), [variables]);
  const totalMes = totalFijos + totalVariables;

  const handleDelete = async () => {
    try {
      if (confirm.tipo === "fijo") await gastosApi.deleteFijo(confirm.id);
      else await gastosApi.deleteVariable(confirm.id);
      toast.success("Gasto eliminado");
      load();
    } catch {
      toast.error("No se pudo eliminar");
    } finally {
      setConfirm((c) => ({ ...c, open: false }));
    }
  };

  const defaultFechaVariable = `${periodo}-01`;

  return (
    <MainLayout title="Gastos" description="Gastos fijos y variables del negocio" allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Selector de mes */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-teal-600" />
            <span className="font-medium">
              {MESES[month - 1]} {year}
            </span>
          </div>
          <Input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value || periodoActual())}
            className="w-44 rounded-xl"
          />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label="Gastos fijos (vigentes)" value={totalFijos} icon={<Repeat className="h-5 w-5" />} tone="blue" />
          <KpiCard label="Gastos variables del mes" value={totalVariables} icon={<Wallet className="h-5 w-5" />} tone="amber" />
          <KpiCard label="Total del mes" value={totalMes} icon={<CalendarDays className="h-5 w-5" />} tone="teal" />
        </div>

        {loading ? (
          <DataTableSkeleton />
        ) : (
          <>
            {/* Gastos fijos */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Gastos fijos</h2>
                <Button onClick={() => setFijoModal({ open: true, gasto: null })} className="rounded-xl">
                  <Plus className="h-4 w-4 mr-1" /> Nuevo fijo
                </Button>
              </div>
              {fijos.length === 0 ? (
                <EmptyRow text="Sin gastos fijos cargados." />
              ) : (
                <div className="space-y-2">
                  {fijos.map((g) => {
                    const vigente = esGastoFijoVigente(g, periodo);
                    return (
                      <Card key={g.id} className={`rounded-2xl ${!vigente ? "opacity-60" : ""}`}>
                        <CardContent className="flex items-center justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{g.nombre}</p>
                              {!g.activo && <Badge tone="gray">Inactivo</Badge>}
                              {g.activo && !vigente && <Badge tone="gray">Fuera de vigencia</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {labelCategoria(g.categoria)}
                              {g.desde && ` · desde ${g.desde.slice(0, 7)}`}
                              {g.hasta && ` · hasta ${g.hasta.slice(0, 7)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-semibold tabular-nums">{formatCurrency(g.monto)}</span>
                            <RowActions
                              onEdit={() => setFijoModal({ open: true, gasto: g })}
                              onDelete={() => setConfirm({ open: true, tipo: "fijo", id: g.id, nombre: g.nombre })}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Gastos variables */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Gastos variables · {MESES[month - 1]}</h2>
                <Button onClick={() => setVarModal({ open: true, gasto: null })} className="rounded-xl">
                  <Plus className="h-4 w-4 mr-1" /> Nuevo gasto
                </Button>
              </div>
              {variables.length === 0 ? (
                <EmptyRow text="Sin gastos variables este mes." />
              ) : (
                <div className="space-y-2">
                  {variables.map((g) => (
                    <Card key={g.id} className="rounded-2xl">
                      <CardContent className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{g.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {labelCategoria(g.categoria)} · {g.fecha.split("-").reverse().join("/")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-semibold tabular-nums">{formatCurrency(g.monto)}</span>
                          <RowActions
                            onEdit={() => setVarModal({ open: true, gasto: g })}
                            onDelete={() => setConfirm({ open: true, tipo: "variable", id: g.id, nombre: g.nombre })}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <GastoFijoModal
        open={fijoModal.open}
        onOpenChange={(o) => setFijoModal((s) => ({ ...s, open: o }))}
        gasto={fijoModal.gasto}
        onSaved={load}
      />
      <GastoVariableModal
        open={varModal.open}
        onOpenChange={(o) => setVarModal((s) => ({ ...s, open: o }))}
        gasto={varModal.gasto}
        defaultFecha={defaultFechaVariable}
        onSaved={load}
      />
      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(o) => setConfirm((c) => ({ ...c, open: o }))}
        title="Eliminar gasto"
        description={`¿Eliminar "${confirm.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
      />
    </MainLayout>
  );
}

function KpiCard({
  label, value, icon, tone,
}: { label: string; value: number; icon: React.ReactNode; tone: "blue" | "amber" | "teal" }) {
  const tones: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50",
    amber: "text-amber-600 bg-amber-50",
    teal: "text-teal-600 bg-teal-50",
  };
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{formatCurrency(value)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "gray" }) {
  const tones: Record<string, string> = {
    gray: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function EmptyRow({ text }: { text: string }) {
  return (
    <Card className="rounded-2xl border-dashed">
      <CardContent className="p-6 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
