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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPrice } from "@/lib/utils/format";
import type { Order, Client } from "@/lib/types";
import { Banknote, CreditCard, UserPlus, Loader2, Wallet, ArrowLeftRight, AlertTriangle, PackageX, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const generateOrderNumber = (createdAt: Date | string, index: number) => {
  const date = new Date(createdAt);
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const orderNum = (index + 1).toString().padStart(4, "0");
  return `${year}${month}${day}-${orderNum}`;
};

const calculateItemTotal = (item: { price: number; quantity: number; itemDiscount?: number }) => {
  const base = item.price * item.quantity;
  const dto = item.itemDiscount ? (base * item.itemDiscount) / 100 : 0;
  return base - dto;
};

const calculateOrderTotal = (order: Order) => {
  const itemsTotal = order.items.reduce((acc, item) => acc + calculateItemTotal(item), 0);
  const disc = (order as any).discount ?? 0;
  if (disc > 0) {
    const discAmt = (order as any).discountType === "percent"
      ? (itemsTotal * disc) / 100
      : disc;
    return Math.max(0, itemsTotal - discAmt);
  }
  return itemsTotal;
};

export interface ItemAdjustment {
  productId: string;
  type: "rotura" | "faltante";
  quantity: number;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  clients: Client[];
  clientSearch: string;
  setClientSearch: (value: string) => void;
  selectedClientId: string;
  setSelectedClientId: (value: string) => void;
  paymentType: "cash" | "credit" | "split";
  setPaymentType: (value: "cash" | "credit" | "split") => void;
  paymentMethod: "efectivo" | "transferencia";
  setPaymentMethod: (value: "efectivo" | "transferencia") => void;
  cashAmount: string;
  setCashAmount: (value: string) => void;
  onComplete: (adjustments: ItemAdjustment[]) => void;
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
  paymentType,
  setPaymentType,
  paymentMethod,
  setPaymentMethod,
  cashAmount,
  setCashAmount,
  onComplete,
  processing,
  onNewClient,
}: PaymentModalProps) {
  const [adjustments, setAdjustments] = useState<Record<string, { rotura: number; faltante: boolean }>>({});
  const [adjustOpen, setAdjustOpen] = useState(false);

  // Reset adjustments when order changes
  useEffect(() => {
    setAdjustments({});
    setAdjustOpen(false);
  }, [order?.id]);

  // Calculate adjusted total
  const adjustmentsList = useMemo(() => {
    if (!order) return [];
    const list: ItemAdjustment[] = [];
    for (const [productId, adj] of Object.entries(adjustments)) {
      if (adj.faltante) {
        const item = order.items.find(i => i.productId === productId);
        if (item) list.push({ productId, type: "faltante", quantity: item.quantity });
      }
      if (adj.rotura > 0) {
        list.push({ productId, type: "rotura", quantity: adj.rotura });
      }
    }
    return list;
  }, [adjustments, order]);

  const adjustmentDeduction = useMemo(() => {
    if (!order) return 0;
    let deduction = 0;
    for (const adj of adjustmentsList) {
      const item = order.items.find(i => i.productId === adj.productId);
      if (!item) continue;
      const unitPrice = item.price;
      const unitDiscount = item.itemDiscount ? (unitPrice * item.itemDiscount) / 100 : 0;
      const effectiveUnit = unitPrice - unitDiscount;
      deduction += effectiveUnit * adj.quantity;
    }
    return deduction;
  }, [adjustmentsList, order]);

  if (!order) return null;

  const toggleFaltante = (productId: string) => {
    setAdjustments(prev => {
      const current = prev[productId] || { rotura: 0, faltante: false };
      return { ...prev, [productId]: { ...current, faltante: !current.faltante } };
    });
  };

  const setRotura = (productId: string, qty: number, maxQty: number) => {
    setAdjustments(prev => {
      const current = prev[productId] || { rotura: 0, faltante: false };
      const clamped = Math.max(0, Math.min(qty, maxQty));
      return { ...prev, [productId]: { ...current, rotura: clamped } };
    });
  };

  const originalTotal = calculateOrderTotal(order);
  const total = Math.max(0, originalTotal - adjustmentDeduction);
  const cashAmountNum = Number(cashAmount || 0);
  const remainingAmount = Math.max(total - cashAmountNum, 0);
  const hasAdjustments = adjustmentsList.length > 0;

  const filteredClients = clients.filter((client) => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      (client.dni?.toLowerCase().includes(query) ?? false) ||
      client.name.toLowerCase().includes(query)
    );
  });

  const isValid = () => {
    if (total <= 0) return false;
    if (paymentType === "cash") return true;
    if (
      (paymentType === "credit" || paymentType === "split") &&
      !selectedClientId && !order.clientId
    )
      return false;
    if (paymentType === "split") {
      return cashAmountNum > 0 && cashAmountNum < total;
    }
    return true;
  };

  const activeItemCount = order.items.filter(i => {
    const adj = adjustments[i.productId];
    return !(adj?.faltante);
  }).length;

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
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Pedido</p>
                <p className="font-mono text-xs text-gray-700">
                  #{generateOrderNumber(order.createdAt, 0)}
                </p>
              </div>
              <p className="font-semibold text-gray-900">
                {order.clientName || "Venta directa"}
              </p>
            </div>
          </div>

          {/* Tipo de pago — 3 columnas compactas */}
          <RadioGroup
            value={paymentType}
            onValueChange={(v) => setPaymentType(v as "cash" | "credit" | "split")}
            className="grid grid-cols-3 gap-2"
          >
            <label
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all text-center",
                paymentType === "cash"
                  ? "border-green-500 bg-green-50/50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              )}
            >
              <RadioGroupItem value="cash" className="sr-only" />
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                paymentType === "cash" ? "bg-green-100" : "bg-gray-100"
              )}>
                <Banknote className={cn("h-4 w-4", paymentType === "cash" ? "text-green-600" : "text-gray-500")} />
              </div>
              <span className={cn("text-xs font-semibold", paymentType === "cash" ? "text-green-900" : "text-gray-700")}>
                Efectivo
              </span>
            </label>

            <label
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all text-center",
                paymentType === "credit"
                  ? "border-blue-500 bg-blue-50/50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              )}
            >
              <RadioGroupItem value="credit" className="sr-only" />
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                paymentType === "credit" ? "bg-blue-100" : "bg-gray-100"
              )}>
                <CreditCard className={cn("h-4 w-4", paymentType === "credit" ? "text-blue-600" : "text-gray-500")} />
              </div>
              <span className={cn("text-xs font-semibold", paymentType === "credit" ? "text-blue-900" : "text-gray-700")}>
                Cta. Cte.
              </span>
            </label>

            <label
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all text-center",
                paymentType === "split"
                  ? "border-amber-500 bg-amber-50/50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              )}
            >
              <RadioGroupItem value="split" className="sr-only" />
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                paymentType === "split" ? "bg-amber-100" : "bg-gray-100"
              )}>
                <Wallet className={cn("h-4 w-4", paymentType === "split" ? "text-amber-600" : "text-gray-500")} />
              </div>
              <span className={cn("text-xs font-semibold", paymentType === "split" ? "text-amber-900" : "text-gray-700")}>
                Parcial
              </span>
            </label>
          </RadioGroup>

          {/* Efectivo / Transferencia toggle */}
          {(paymentType === "cash" || paymentType === "split") && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button" size="sm"
                variant={paymentMethod === "efectivo" ? "default" : "outline"}
                className={cn("h-9 text-sm gap-2", paymentMethod === "efectivo" && "bg-emerald-600 hover:bg-emerald-700")}
                onClick={() => setPaymentMethod("efectivo")}
              >
                <Banknote className="h-4 w-4" /> Efectivo
              </Button>
              <Button
                type="button" size="sm"
                variant={paymentMethod === "transferencia" ? "default" : "outline"}
                className={cn("h-9 text-sm gap-2", paymentMethod === "transferencia" && "bg-violet-600 hover:bg-violet-700")}
                onClick={() => setPaymentMethod("transferencia")}
              >
                <ArrowLeftRight className="h-4 w-4" /> Transferencia
              </Button>
            </div>
          )}

          {/* Cliente para cta cte / split */}
          {(paymentType === "credit" || paymentType === "split") && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Cliente
              </Label>
              {order.clientId ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                  <CreditCard className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-sm font-medium text-blue-900">
                    {order.clientName || clients.find(c => c.id === order.clientId)?.name || "Cliente del pedido"}
                  </span>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Buscar por DNI o nombre..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="bg-white"
                  />
                  <div className="flex gap-2">
                    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                      <SelectTrigger className="flex-1 bg-white">
                        <SelectValue placeholder="Seleccionar cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredClients.length === 0 ? (
                          <SelectItem value="" disabled>No se encontraron clientes</SelectItem>
                        ) : (
                          filteredClients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name} {client.dni ? `(${client.dni})` : ""}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={onNewClient} className="flex-shrink-0">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Nuevo
                    </Button>
                  </div>
                  {!selectedClientId && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      Selecciona un cliente para continuar
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Split amount */}
          {paymentType === "split" && (
            <div className="space-y-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <Label htmlFor="cashAmount" className="text-sm font-semibold text-amber-900">
                Monto en efectivo
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">$</span>
                <Input
                  id="cashAmount"
                  type="number"
                  min="1"
                  max={total - 1}
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0"
                  className="pl-8 bg-white border-amber-300 focus:border-amber-500"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-amber-700">Efectivo:</span>
                <span className="font-semibold text-amber-900">{formatPrice(cashAmountNum)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-amber-700">A cuenta:</span>
                <span className="font-semibold text-amber-900">{formatPrice(remainingAmount)}</span>
              </div>
            </div>
          )}

          {/* Ajustes: Roturas y Faltantes */}
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
              <div className="divide-y max-h-52 overflow-y-auto">
                {order.items.map((item) => {
                  const adj = adjustments[item.productId] || { rotura: 0, faltante: false };
                  const isFaltante = adj.faltante;

                  return (
                    <div
                      key={item.productId}
                      className={cn(
                        "px-3 py-2 space-y-1.5",
                        isFaltante && "bg-red-50/50"
                      )}
                    >
                      {/* Nombre + cantidad */}
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          "text-xs font-medium truncate flex-1",
                          isFaltante ? "text-red-400 line-through" : "text-gray-900"
                        )}>
                          {item.name}
                        </p>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          x{item.quantity} · {formatPrice(item.price)}
                        </span>
                      </div>

                      {/* Controles */}
                      <div className="flex items-center justify-end gap-2">
                        {!isFaltante && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-orange-600 font-medium">Roto:</span>
                            <Input
                              type="number"
                              min={0}
                              max={item.quantity}
                              value={adj.rotura || ""}
                              onChange={(e) => setRotura(item.productId, Number(e.target.value), item.quantity)}
                              placeholder="0"
                              className="w-12 h-6 text-xs text-center px-1"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleFaltante(item.productId)}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all shrink-0",
                            isFaltante
                              ? "bg-red-100 text-red-700 border border-red-300"
                              : "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 border border-gray-200"
                          )}
                        >
                          <PackageX className="h-3 w-3" />
                          Faltante
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
                <span className="text-orange-400">Descuento ajustes</span>
                <span className="text-orange-400">-{formatPrice(adjustmentDeduction)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Total</span>
              <span className="text-2xl font-bold">{formatPrice(total)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {activeItemCount} {activeItemCount === 1 ? "producto" : "productos"}
              {" "}&middot;{" "}
              {order.items.filter(i => !adjustments[i.productId]?.faltante).reduce((acc, item) => {
                const roto = adjustments[item.productId]?.rotura || 0;
                return acc + item.quantity - roto;
              }, 0)} unidades
            </p>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={onClose}
              disabled={processing}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 h-11 font-semibold"
              onClick={() => onComplete(adjustmentsList)}
              disabled={processing || !isValid()}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Confirmar Pago"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
