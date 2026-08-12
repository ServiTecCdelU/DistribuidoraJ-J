"use client";

import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { PagoSuscripcionModal } from "@/components/perfil/pago-suscripcion-modal";
import { suscripcionApi, type Suscripcion } from "@/lib/api";
import { formatCurrency } from "@/lib/utils/format";
import {
  PLANES,
  labelPeriodo,
  periodoDe,
  resumirSuscripcion,
  type EstadoSuscripcion,
  type PagoSuscripcion,
} from "@/lib/utils/suscripcion";
import { Building2, CreditCard, Plus, Pencil, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const ESTADOS: { value: EstadoSuscripcion; label: string }[] = [
  { value: "activo", label: "Activo" },
  { value: "suspendido", label: "Suspendido" },
  { value: "cancelado", label: "Cancelado" },
];

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<Suscripcion>(suscripcionApi.vacia());
  const [pagos, setPagos] = useState<PagoSuscripcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pagoModal, setPagoModal] = useState<{ open: boolean; pago: PagoSuscripcion | null }>({
    open: false,
    pago: null,
  });
  const [confirm, setConfirm] = useState<{ open: boolean; id: string; periodo: string }>({
    open: false,
    id: "",
    periodo: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([suscripcionApi.get(), suscripcionApi.getPagos()]);
      setPerfil(s);
      setPagos(p);
    } catch {
      toast.error("No se pudo cargar el perfil");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resumen = useMemo(
    () =>
      resumirSuscripcion(
        {
          montoMensual: perfil.montoMensual,
          sucursales: perfil.sucursales,
          diaVencimiento: perfil.diaVencimiento,
          fechaInicio: perfil.fechaInicio,
          estado: perfil.estado,
        },
        pagos,
      ),
    [perfil, pagos],
  );

  const montoMes = perfil.montoMensual * Math.max(1, perfil.sucursales);

  const set = <K extends keyof Suscripcion>(key: K, value: Suscripcion[K]) =>
    setPerfil((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const guardado = await suscripcionApi.save(perfil);
      setPerfil(guardado);
      toast.success("Perfil guardado");
    } catch {
      toast.error("No se pudo guardar el perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await suscripcionApi.deletePago(confirm.id);
      toast.success("Pago eliminado");
      load();
    } catch {
      toast.error("No se pudo eliminar el pago");
    } finally {
      setConfirm((c) => ({ ...c, open: false }));
    }
  };

  const proximoPeriodo = resumen.periodosAdeudados[0] ?? periodoDe(new Date());

  return (
    <MainLayout title="Perfil" description="Datos de la distribuidora, plan y abono del sistema" allowedRoles={["admin"]}>
      <div className="space-y-6">
        {/* Resumen de estado */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Estado</p>
              <div className="mt-1 flex items-center gap-2">
                {resumen.alDia ? (
                  <CheckCircle2 className="h-5 w-5 text-teal-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                <span className="text-lg font-semibold">{resumen.alDia ? "Al día" : "Con deuda"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Meses pagados</p>
              <p className="mt-1 text-lg font-semibold">{resumen.mesesPagados}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(resumen.totalPagado)} acumulado</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Deuda</p>
              <p className={`mt-1 text-lg font-semibold ${resumen.deuda > 0 ? "text-red-600" : ""}`}>
                {formatCurrency(resumen.deuda)}
              </p>
              <p className="text-xs text-muted-foreground">{resumen.mesesAdeudados} mes(es)</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Abono mensual</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(montoMes)}</p>
              <p className="text-xs text-muted-foreground">Vence el {resumen.proximoVencimiento}</p>
            </CardContent>
          </Card>
        </div>

        {resumen.periodosAdeudados.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Meses impagos:</span>
            {resumen.periodosAdeudados.map((p) => (
              <Badge key={p} variant="outline" className="rounded-2xl border-amber-300">
                {labelPeriodo(p)}
              </Badge>
            ))}
          </div>
        )}

        {loading ? (
          <DataTableSkeleton columns={7} />
        ) : (
          <>
            {/* Datos de la distribuidora */}
            <Card className="rounded-2xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-teal-600" />
                  <h2 className="text-base font-semibold">Datos de la distribuidora</h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Razón social" id="razonSocial">
                    <Input
                      id="razonSocial"
                      value={perfil.razonSocial}
                      onChange={(e) => set("razonSocial", e.target.value)}
                    />
                  </Field>
                  <Field label="Nombre de fantasía" id="nombreFantasia">
                    <Input
                      id="nombreFantasia"
                      value={perfil.nombreFantasia}
                      onChange={(e) => set("nombreFantasia", e.target.value)}
                    />
                  </Field>
                  <Field label="CUIT" id="cuit">
                    <Input id="cuit" value={perfil.cuit} onChange={(e) => set("cuit", e.target.value)} />
                  </Field>
                  <Field label="Dirección" id="direccion">
                    <Input
                      id="direccion"
                      value={perfil.direccion}
                      onChange={(e) => set("direccion", e.target.value)}
                    />
                  </Field>
                  <Field label="Ciudad" id="ciudad">
                    <Input id="ciudad" value={perfil.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
                  </Field>
                  <Field label="Teléfono" id="telefono">
                    <Input
                      id="telefono"
                      value={perfil.telefono}
                      onChange={(e) => set("telefono", e.target.value)}
                    />
                  </Field>
                  <Field label="Email" id="email">
                    <Input
                      id="email"
                      type="email"
                      value={perfil.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            {/* Plan y abono */}
            <Card className="rounded-2xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-teal-600" />
                  <h2 className="text-base font-semibold">Plan y abono</h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Plan" id="plan">
                    <select
                      id="plan"
                      value={perfil.plan}
                      onChange={(e) => set("plan", e.target.value)}
                      className="h-9 w-full rounded-2xl border border-input bg-transparent px-3 text-sm"
                    >
                      {PLANES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Abono mensual por sucursal" id="montoMensual">
                    <Input
                      id="montoMensual"
                      type="number"
                      min={0}
                      value={perfil.montoMensual}
                      onChange={(e) => set("montoMensual", Number(e.target.value) || 0)}
                    />
                  </Field>
                  <Field label="Sucursales" id="sucursales">
                    <Input
                      id="sucursales"
                      type="number"
                      min={1}
                      value={perfil.sucursales}
                      onChange={(e) => set("sucursales", Number(e.target.value) || 1)}
                    />
                  </Field>
                  <Field label="Día de vencimiento" id="diaVencimiento">
                    <Input
                      id="diaVencimiento"
                      type="number"
                      min={1}
                      max={28}
                      value={perfil.diaVencimiento}
                      onChange={(e) => set("diaVencimiento", Number(e.target.value) || 10)}
                    />
                  </Field>
                  <Field label="Inicio del servicio" id="fechaInicio">
                    <Input
                      id="fechaInicio"
                      type="date"
                      value={perfil.fechaInicio ?? ""}
                      onChange={(e) => set("fechaInicio", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Estado del servicio" id="estado">
                    <select
                      id="estado"
                      value={perfil.estado}
                      onChange={(e) => set("estado", e.target.value as EstadoSuscripcion)}
                      className="h-9 w-full rounded-2xl border border-input bg-transparent px-3 text-sm"
                    >
                      {ESTADOS.map((e) => (
                        <option key={e.value} value={e.value}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Notas" id="notas">
                  <Input id="notas" value={perfil.notas} onChange={(e) => set("notas", e.target.value)} />
                </Field>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar perfil"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Historial de pagos */}
            <Card className="rounded-2xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">Pagos del abono</h2>
                  <Button size="sm" onClick={() => setPagoModal({ open: true, pago: null })}>
                    <Plus className="mr-1 h-4 w-4" />
                    Registrar pago
                  </Button>
                </div>

                {pagos.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Todavía no hay pagos registrados.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2">Período</th>
                          <th className="py-2">Monto</th>
                          <th className="py-2">Fecha</th>
                          <th className="py-2">Método</th>
                          <th className="py-2">Comprobante</th>
                          <th className="py-2">Estado</th>
                          <th className="py-2 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagos.map((p) => (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">{labelPeriodo(p.periodo)}</td>
                            <td className="py-2">{formatCurrency(p.monto)}</td>
                            <td className="py-2">{p.fechaPago ?? "—"}</td>
                            <td className="py-2">{p.metodo ?? "—"}</td>
                            <td className="py-2">{p.comprobante ?? "—"}</td>
                            <td className="py-2">
                              <Badge
                                variant="outline"
                                className={`rounded-2xl ${
                                  p.estado === "pagado"
                                    ? "border-teal-300 text-teal-700"
                                    : "border-amber-300 text-amber-700"
                                }`}
                              >
                                {p.estado === "pagado" ? "Pagado" : "Pendiente"}
                              </Badge>
                            </td>
                            <td className="py-2">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPagoModal({ open: true, pago: p })}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setConfirm({ open: true, id: p.id, periodo: p.periodo })}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <PagoSuscripcionModal
        open={pagoModal.open}
        onOpenChange={(open) => setPagoModal((m) => ({ ...m, open }))}
        pago={pagoModal.pago}
        defaultPeriodo={proximoPeriodo}
        defaultMonto={montoMes}
        onSaved={load}
      />

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) => setConfirm((c) => ({ ...c, open }))}
        title="Eliminar pago"
        description={`¿Eliminar el pago de ${confirm.periodo ? labelPeriodo(confirm.periodo) : ""}?`}
        onConfirm={handleDelete}
      />
    </MainLayout>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
