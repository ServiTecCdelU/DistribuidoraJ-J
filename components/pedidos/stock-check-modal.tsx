"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Package } from "lucide-react";

export interface StockCheckItem {
  productId: string;
  name: string;
  quantity: number;
  stock: number;
}

interface StockCheckModalProps {
  open: boolean;
  onClose: () => void;
  items: StockCheckItem[];
  onConfirm: (itemsSinStock: string[]) => void;
}

export function StockCheckModal({ open, onClose, items, onConfirm }: StockCheckModalProps) {
  const sinStock = items.filter((i) => i.stock < i.quantity);
  const conStock = items.filter((i) => i.stock >= i.quantity);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md w-[calc(100vw-1rem)] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3 border-b shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Verificar stock
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Sin stock */}
          {sinStock.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Sin stock suficiente ({sinStock.length})
              </p>
              <div className="space-y-1.5">
                {sinStock.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm">
                    <span className="font-medium text-red-800 truncate mr-2">{item.name}</span>
                    <span className="text-xs text-red-600 whitespace-nowrap">
                      {item.stock}/{item.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Con stock */}
          {conStock.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                Con stock ({conStock.length})
              </p>
              <div className="space-y-1.5">
                {conStock.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-sm">
                    <span className="font-medium text-green-800 truncate mr-2">{item.name}</span>
                    <span className="text-xs text-green-600 whitespace-nowrap">
                      {item.stock}/{item.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 pt-3 border-t space-y-2 shrink-0">
          {conStock.length > 0 ? (
            <Button
              className="w-full"
              onClick={() => onConfirm(sinStock.map((i) => i.productId))}
            >
              Generar remito sin los faltantes
            </Button>
          ) : (
            <p className="text-sm text-center text-red-600 font-medium">No hay productos con stock disponible</p>
          )}
          <Button variant="outline" className="w-full" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
