//components/pedidos/order-card.tsx
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { formatPrice, formatDateTime as formatDate } from "@/lib/utils/format";
import type { Order } from "@/lib/types";
import { Eye, CheckCircle } from "lucide-react";
import { statusConfig } from "@/lib/order-constants";
import { cn } from "@/lib/utils";

const generateOrderNumber = (createdAt: Date | string, index: number) => {
  const date = new Date(createdAt);
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}${month}${day}-${(index + 1).toString().padStart(4, "0")}`;
};

interface OrderCardProps {
  order: Order;
  index: number;
  totalOrders: number;
  variant: "table" | "card";
  onViewDetails: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function OrderCard({
  order,
  index,
  totalOrders,
  variant,
  onViewDetails,
  isSelected,
  onToggleSelect,
}: OrderCardProps) {
  const config = statusConfig[order.status] || {
    label: order.status || "Desconocido",
    color: "text-gray-700",
    dotColor: "bg-gray-500",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
  };

  const productosResumen = order.items
    .map((i) => `${i.quantity}× ${i.name}`)
    .join(" · ");

  const StatusBadge = () => (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold shrink-0",
      config.bgColor, "border", config.borderColor
    )}>
      <div className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
      <span className={config.color}>{config.label}</span>
    </div>
  );

  if (variant === "table") {
    return (
      <tr className="hover:bg-muted/30 transition-colors group text-sm border-b border-border/50 last:border-0">
        {onToggleSelect && (
          <td className="pl-3 pr-1 py-3 w-8">
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-gray-300 accent-teal-600 cursor-pointer"
            />
          </td>
        )}
        {/* Fecha */}
        <td className="px-3 py-3 whitespace-nowrap">
          <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
        </td>
        {/* Productos */}
        <td className="px-3 py-3 max-w-[280px]">
          <p className="text-xs text-foreground truncate" title={productosResumen}>{productosResumen}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {order.items.length} {order.items.length === 1 ? "producto" : "productos"}
          </p>
        </td>
        {/* Dirección */}
        <td className="px-3 py-3 hidden md:table-cell">
          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
            {order.address && order.address !== "Retiro en local"
              ? order.address
              : <span className="italic">Retiro en local</span>}
          </p>
          {order.city && <p className="text-[10px] text-muted-foreground/70">{order.city}</p>}
        </td>
        {/* Estado */}
        <td className="px-3 py-3 whitespace-nowrap">
          <StatusBadge />
        </td>
        {/* Acción */}
        <td className="px-3 py-3 text-right">
          <Button
            variant="ghost" size="sm"
            onClick={onViewDetails}
            className="h-8 text-xs gap-1.5 text-primary hover:bg-primary/5"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ver</span>
          </Button>
        </td>
      </tr>
    );
  }

  // Mobile row (dentro de un card por cliente)
  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors border-b border-border/40 last:border-0",
        isSelected && "bg-teal-50/30"
      )}
      onClick={onViewDetails}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 mt-0.5 rounded border-gray-300 accent-teal-600 cursor-pointer shrink-0"
        />
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs text-foreground truncate" title={productosResumen}>{productosResumen}</p>
        {order.address && order.address !== "Retiro en local" && (
          <p className="text-[10px] text-muted-foreground truncate">{order.address}</p>
        )}
        <p className="text-[10px] text-muted-foreground">{formatDate(order.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <StatusBadge />
        <Button
          variant="ghost" size="icon"
          onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
          className="h-7 w-7 text-primary hover:bg-primary/5"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
