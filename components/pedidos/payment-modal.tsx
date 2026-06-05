//components/pedidos/payment-modal.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/utils/format";
import type { Order, Client } from "@/lib/types";
import { Banknote, CreditCard, UserPlus, Loader2, ArrowLeftRight, AlertTriangle, PackageX, ChevronDown, ChevronUp, ShieldAlert, Package, Upload, ImageIcon, Camera, X as XIcon, ChevronDown as ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const generateOrderNumber = (createdAt: Date | string, index: number) => {
  const date = new Date(createdAt);
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const orderNum = (index + 1).toString().padStart(4, "0");
  return `${year}${month}${day}-${orderNum}`;
};

const calculateOrderTotal = (order: Order) => {
  const itemsTotal = order.items.reduce((acc, item) => {
    const base = item.price * item.quantity;
    const dto = item.itemDiscount ? (base * item.itemDiscount) / 100 : 0;
    return acc + base - dto;
  }, 0);
  const disc = (order as any).discount ?? 0;
  if (disc > 0) {
    const discAmt = (order as any).discountType === "percent"
      ? (itemsTotal * disc) / 100
      : disc;
    return Math.max(0, itemsTotal - discAmt);
  }
  return itemsTotal;
};

// Tipos de ajuste:
// - rotura: producto se rompió en el reparto → descuenta stock + registra pérdida en caja
// - faltante: error de armado, está en stock pero no se cargó → solo se quita del pedido (por unidad)
// - no_quiere: cliente no lo quiere → vuelve al stock, se quita del pedido (por unidad)
export type AdjustmentType = "rotura" | "faltante" | "no_quiere";

export interface ItemAdjustment {
  productId: string;
  productName: string;
  type: AdjustmentType;
  quantity: number;
  unitPrice: number;
}

type ItemAdj = {
  rotura: number;
  faltante: number;
  no_quiere: number;
};

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  clients: Client[];
  clientSearch: string;
  setClientSearch: (value: string) => void;
  selectedClientId: string;
  setSelectedClientId: (value: string) => void;
  onComplete: (adjustments: ItemAdjustment[], payments: { efectivo: number; transferencia: number; cuentaCorriente: number }, comprobanteFile?: File) => void;
  onReject?: () => void;
  processing: boolean;
  onNewClient: () => void;
}

export function PaymentModal({
  isOpen,
  onClose,
  order,
  clients,
  clientSearch,
  setClientSearch,
  selectedClientId,
  setSelectedClientId,
  onComplete,
  onReject,
  processing,
  onNewClient,
}: PaymentModalProps) {
  const [adjustments, setAdjustments] = useState<Record<string, ItemAdj>>({});
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  // Nuevos estados de pago multi-método
  const [efectivoAmount, setEfectivoAmount] = useState("");
  const [transferenciaAmount, setTransferenciaAmount] = useState("");
  const [cuentaCorrienteAmount, setCuentaCorrienteAmount] = useState("");
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState<string>("");

  useEffect(() => {
    setAdjustments({});
    setAdjustOpen(false);
    setPagoOpen(false);
    setEfectivoAmount("");
    setTransferenciaAmount("");
    setCuentaCorrienteAmount("");
    setComprobanteFile(null);
    setComprobantePreview("");
    setConfirmReject(false);
  }, [order?.id]);

  const handleComprobanteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComprobanteFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setComprobantePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const adjustmentsList = useMemo(() => {
    if (!order) return [];
    const list: ItemAdjustment[] = [];
    for (const [productId, adj] of Object.entries(adjustments)) {
      const item = order.items.find(i => i.productId === productId);
      if (!item) continue;
      const effectivePrice = item.price - (item.itemDiscount ? (item.price * item.itemDiscount) / 100 : 0);

      if (adj.rotura > 0) {
        list.push({ productId, productName: item.name, type: "rotura", quantity: adj.rotura, unitPrice: effectivePrice });
      }
      if (adj.faltante > 0) {
        list.push({ productId, productName: item.name, type: "faltante", quantity: adj.faltante, unitPrice: effectivePrice });
      }
      if (adj.no_quiere > 0) {
        list.push({ productId, productName: item.name, type: "no_quiere", quantity: adj.no_quiere, unitPrice: effectivePrice });
      }
    }
    return list;
  }, [adjustments, order]);

  const adjustmentDeduction = useMemo(() => {
    return adjustmentsList.reduce((acc, adj) => acc + adj.unitPrice * adj.quantity, 0);
  }, [adjustmentsList]);

  if (!order) return null;

  const getAdj = (productId: string): ItemAdj => adjustments[productId] || { rotura: 0, faltante: 0, no_quiere: 0 };

  const setAdjField = (productId: string, field: keyof ItemAdj, qty: number, maxQty: number) => {
    setAdjustments(prev => {
      const current = prev[productId] || { rotura: 0, faltante: 0, no_quiere: 0 };
      const otherFields = (Object.keys(current) as (keyof ItemAdj)[]).filter(k => k !== field);
      const usedByOthers = otherFields.reduce((acc, k) => acc + current[k], 0);
      const clamped = Math.max(0, Math.min(qty, maxQty - usedByOthers));
      return { ...prev, [productId]: { ...current, [field]: clamped } };
    });
  };

  const originalTotal = calculateOrderTotal(order);
  const total = Math.round(Math.max(0, originalTotal - adjustmentDeduction) * 100) / 100;
  const hasAdjustments = adjustmentsList.length > 0;

  // Montos ingresados
  const efectivo = Number(efectivoAmount || 0);
  const transferencia = Number(transferenciaAmount || 0);
  const cuentaCorriente = Number(cuentaCorrienteAmount || 0);
  const ingresado = efectivo + transferencia + cuentaCorriente;
  // Tolerancia por redondeo de centavos: se considera cubierto si falta menos de $1
  const TOLERANCIA_PAGO = 1;
  const faltante = total - ingresado;
  const cubierto = faltante <= TOLERANCIA_PAGO;
  const restante = cubierto ? 0 : Math.round(faltante * 100) / 100;

  const filteredClients = clients.filter((client) => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      (client.dni?.toLowerCase().includes(query) ?? false) ||
      client.name.toLowerCase().includes(query)
    );
  });

  const isValid = () => {
    const soloRoturas = adjustmentsList.length > 0 && adjustmentsList.every(a => a.type === "rotura");
    if (total <= 0 && !soloRoturas) return false;
    if (total <= 0 && soloRoturas) return true;
    if (!cubierto) return false;
    if (cuentaCorriente > 0 && !selectedClientId && !order.clientId) return false;
    return true;
  };

  // Contar items/unidades activos
  const activeItems = order.items.filter(i => {
    const adj = getAdj(i.productId);
    return i.quantity - adj.rotura - adj.faltante - adj.no_quiere > 0;
  });
  const activeUnits = order.items.reduce((acc, item) => {
    const adj = getAdj(item.productId);
    return acc + Math.max(0, item.quantity - adj.rotura - adj.faltante - adj.no_quiere);
  }, 0);

  // Resumen de ajustes por tipo
  const roturaCount = adjustmentsList.filter(a => a.type === "rotura").length;
  const faltanteCount = adjustmentsList.filter(a => a.type === "faltante").length;
  const noQuiereCount = adjustmentsList.filter(a => a.type === "no_quiere").length;

  // Botón "↓ resto" — completa el campo con el restante calculado sin ese campo
  const fillResto = (field: "efectivo" | "transferencia" | "cuentaCorriente") => {
    const others = {
      efectivo: efectivo,
      transferencia: transferencia,
      cuentaCorriente: cuentaCorriente,
    };
    // Excluir el campo actual del cálculo de "otros"
    const otherSum = Object.entries(others)
      .filter(([k]) => k !== field)
      .reduce((acc, [, v]) => acc + v, 0);
    const resto = Math.max(0, total - otherSum);
    const rounded = Math.round(resto * 100) / 100;
    if (field === "efectivo") setEfectivoAmount(rounded > 0 ? String(rounded) : "");
    else if (field === "transferencia") setTransferenciaAmount(rounded > 0 ? String(rounded) : "");
    else setCuentaCorrienteAmount(rounded > 0 ? String(rounded) : "");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl">Completar Pedido</DialogTitle>
        </DialogHeader>

        <div className="py-3 space-y-4">
          {/* Info del pedido */}
          <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {order.clientName || "Venta directa"}
              </p>
            </div>
          </div>

          {/* ── Ajustes: Roturas / Faltantes (primero) ── */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setAdjustOpen(!adjustOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Roturas / Faltantes
                {hasAdjustments && (
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                    {adjustmentsList.length}
                  </span>
                )}
              </span>
              {adjustOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>

            {adjustOpen && (
              <div className="divide-y max-h-60 overflow-y-auto">
                {order.items.map((item) => {
                  const adj = getAdj(item.productId);

                  const totalAdj = adj.rotura + adj.faltante + adj.no_quiere;
                  const hasAny = totalAdj > 0;

                  return (
                    <div key={item.productId} className={cn("px-3 py-2.5 space-y-2", hasAny && "bg-orange-50/40")}>
                      {/* Nombre + cantidad */}
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          "text-xs font-medium truncate flex-1",
                          totalAdj >= item.quantity ? "text-red-400 line-through" : "text-gray-900"
                        )}>
                          {item.name}
                        </p>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          x{item.quantity} · {formatPrice(item.price)}
                        </span>
                      </div>

                      {/* 3 opciones por unidad — botones grandes para mobile */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* Rotura */}
                        <div className="flex flex-col items-center gap-1 bg-orange-50 border border-orange-200 rounded-xl px-2 py-2">
                          <span className="text-[11px] text-orange-700 font-semibold flex items-center gap-0.5 whitespace-nowrap">
                            <ShieldAlert className="h-3 w-3 text-orange-500 shrink-0" /> Roto
                          </span>
                          <Input
                            type="number" inputMode="numeric" min={0} max={item.quantity}
                            value={adj.rotura || ""}
                            onChange={(e) => setAdjField(item.productId, "rotura", Number(e.target.value), item.quantity)}
                            placeholder="0"
                            className="w-full h-11 text-base font-semibold text-center bg-white border-orange-300"
                          />
                        </div>

                        {/* Faltante (error humano) */}
                        <div className="flex flex-col items-center gap-1 bg-purple-50 border border-purple-200 rounded-xl px-2 py-2">
                          <span className="text-[11px] text-purple-700 font-semibold flex items-center gap-0.5 whitespace-nowrap">
                            <Package className="h-3 w-3 text-purple-500 shrink-0" /> Faltante
                          </span>
                          <Input
                            type="number" inputMode="numeric" min={0} max={item.quantity}
                            value={adj.faltante || ""}
                            onChange={(e) => setAdjField(item.productId, "faltante", Number(e.target.value), item.quantity)}
                            placeholder="0"
                            className="w-full h-11 text-base font-semibold text-center bg-white border-purple-300"
                          />
                        </div>

                        {/* No lo quiere */}
                        <div className="flex flex-col items-center gap-1 bg-blue-50 border border-blue-200 rounded-xl px-2 py-2">
                          <span className="text-[11px] text-blue-700 font-semibold flex items-center gap-0.5 whitespace-nowrap">
                            <PackageX className="h-3 w-3 text-blue-500 shrink-0" /> No quiere
                          </span>
                          <Input
                            type="number" inputMode="numeric" min={0} max={item.quantity}
                            value={adj.no_quiere || ""}
                            onChange={(e) => setAdjField(item.productId, "no_quiere", Number(e.target.value), item.quantity)}
                            placeholder="0"
                            className="w-full h-11 text-base font-semibold text-center bg-white border-blue-300"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resumen ajustes */}
          {hasAdjustments && (
            <div className="flex flex-wrap gap-2 text-[10px]">
              {roturaCount > 0 && (
                <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                  {roturaCount} rotura{roturaCount > 1 ? "s" : ""} (descuenta stock)
                </span>
              )}
              {faltanteCount > 0 && (
                <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                  {faltanteCount} faltante{faltanteCount > 1 ? "s" : ""} (está en stock)
                </span>
              )}
              {noQuiereCount > 0 && (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                  {noQuiereCount} no quiere (vuelve al stock)
                </span>
              )}
            </div>
          )}

          {/* ── Sección de pagos multi-método (colapsable) ── */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setPagoOpen(!pagoOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-green-600" />
                Forma de pago
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  restante > 0 ? "bg-red-100 text-red-700" : ingresado > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                )}>
                  {restante > 0 ? `Restante: ${formatPrice(restante)}` : ingresado > 0 ? "Cubierto" : "Sin ingresar"}
                </span>
              </span>
              {pagoOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>

            {pagoOpen && (
            <div className="p-4 space-y-3 border-t bg-gray-50/50">
            {/* Efectivo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5 text-green-600" /> Efectivo
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    value={efectivoAmount}
                    onChange={(e) => setEfectivoAmount(e.target.value)}
                    placeholder="0"
                    className="pl-7 bg-white"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-2.5 text-xs gap-1 shrink-0 border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => fillResto("efectivo")}
                  title="Completar con el monto restante"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                  Resto
                </Button>
              </div>
            </div>

            {/* Transferencia */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5 text-violet-600" /> Transferencia
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    value={transferenciaAmount}
                    onChange={(e) => setTransferenciaAmount(e.target.value)}
                    placeholder="0"
                    className="pl-7 bg-white"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-2.5 text-xs gap-1 shrink-0 border-violet-300 text-violet-700 hover:bg-violet-50"
                  onClick={() => fillResto("transferencia")}
                  title="Completar con el monto restante"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                  Resto
                </Button>
              </div>
            </div>

            {/* Cuenta Corriente */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-blue-600" /> Cuenta Corriente
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    value={cuentaCorrienteAmount}
                    onChange={(e) => setCuentaCorrienteAmount(e.target.value)}
                    placeholder="0"
                    className="pl-7 bg-white"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-2.5 text-xs gap-1 shrink-0 border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => fillResto("cuentaCorriente")}
                  title="Completar con el monto restante"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                  Resto
                </Button>
              </div>
            </div>
            </div>
            )}
          </div>

          {/* Comprobante de transferencia */}
          {transferencia > 0 && (
            <div className="space-y-2 px-1">
              <Label className="text-xs font-semibold text-violet-800 flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Comprobante de transferencia
              </Label>
              {comprobantePreview ? (
                <div className="relative rounded-lg overflow-hidden border border-violet-200">
                  <img src={comprobantePreview} alt="Comprobante" className="w-full max-h-48 object-contain bg-gray-50" />
                  <button
                    type="button"
                    onClick={() => { setComprobanteFile(null); setComprobantePreview(""); }}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80"
                  >
                    <XIcon className="h-3.5 w-3.5 text-white" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col items-center gap-1.5 p-3 border-2 border-dashed border-violet-300 rounded-xl cursor-pointer bg-white hover:bg-violet-50 transition-colors">
                    <Camera className="h-6 w-6 text-violet-400" />
                    <span className="text-xs text-violet-600 font-medium">Sacar foto</span>
                    <input type="file" accept="image/*" capture="environment" onChange={handleComprobanteChange} className="sr-only" />
                  </label>
                  <label className="flex flex-col items-center gap-1.5 p-3 border-2 border-dashed border-violet-300 rounded-xl cursor-pointer bg-white hover:bg-violet-50 transition-colors">
                    <ImageIcon className="h-6 w-6 text-violet-400" />
                    <span className="text-xs text-violet-600 font-medium">Desde galería</span>
                    <input type="file" accept="image/*" onChange={handleComprobanteChange} className="sr-only" />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Cliente para cuenta corriente */}
          {cuentaCorriente > 0 && (
            <div className="space-y-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
              <Label className="text-sm font-semibold flex items-center gap-2 text-blue-900">
                <CreditCard className="h-4 w-4" /> Cliente (Cuenta Corriente)
              </Label>
              {order.clientId ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-blue-200">
                  <CreditCard className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-sm font-medium text-blue-900">
                    {order.clientName || clients.find(c => c.id === order.clientId)?.name || "Cliente del pedido"}
                  </span>
                </div>
              ) : (
                <>
                  <Input placeholder="Buscar por DNI o nombre..." value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)} className="bg-white" />
                  <div className="flex gap-2">
                    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                      <SelectTrigger className="flex-1 bg-white"><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                      <SelectContent>
                        {filteredClients.length === 0 ? (
                          <SelectItem value="" disabled>No se encontraron clientes</SelectItem>
                        ) : filteredClients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name} {client.dni ? `(${client.dni})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={onNewClient} className="flex-shrink-0">
                      <UserPlus className="h-4 w-4 mr-2" /> Nuevo
                    </Button>
                  </div>
                  {!selectedClientId && <p className="text-xs text-amber-600">Seleccioná un cliente para continuar</p>}
                </>
              )}
            </div>
          )}

          {/* Total */}
          <div className="p-4 bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl text-white">
            {hasAdjustments && (
              <div className="flex justify-between items-center mb-1 text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-400 line-through">{formatPrice(originalTotal)}</span>
              </div>
            )}
            {hasAdjustments && (
              <div className="flex justify-between items-center mb-2 text-sm">
                <span className="text-orange-400">Ajustes</span>
                <span className="text-orange-400">-{formatPrice(adjustmentDeduction)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Total</span>
              <span className="text-2xl font-bold">{formatPrice(total)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {activeItems.length} {activeItems.length === 1 ? "producto" : "productos"} · {activeUnits} unidades
            </p>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 h-11" onClick={onClose} disabled={processing}>
              Cancelar
            </Button>
            <Button
              className="flex-1 h-11 font-semibold"
              onClick={() => onComplete(adjustmentsList, { efectivo, transferencia, cuentaCorriente }, comprobanteFile ?? undefined)}
              disabled={processing || !isValid()}
            >
              {processing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</>
              ) : "Confirmar Pago"}
            </Button>
          </div>

          {/* Rechazar pedido — el cliente no lo quiso */}
          {onReject && (
            confirmReject ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-xs text-red-700 font-medium text-center">
                  ¿Rechazar el pedido? El stock vuelve a quedar disponible y no se cobra nada.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-10 border-gray-300"
                    onClick={() => setConfirmReject(false)}
                    disabled={processing}
                  >
                    No
                  </Button>
                  <Button
                    className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white font-semibold"
                    onClick={onReject}
                    disabled={processing}
                  >
                    {processing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rechazando...</>
                    ) : "Sí, rechazar"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="w-full h-10 text-red-600 hover:text-red-700 hover:bg-red-50 gap-2"
                onClick={() => setConfirmReject(true)}
                disabled={processing}
              >
                <PackageX className="h-4 w-4" />
                Cancelar pedido — el cliente no lo quiere
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
