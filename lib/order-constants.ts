// lib/order-constants.ts
import type { OrderStatus } from "@/types";
import { Clock, Box, Truck, CheckCircle, Ban, XCircle } from "lucide-react";

export const statusConfig: Record<
  OrderStatus,
  {
    label: string;
    color: string;
    dotColor: string;
    bgColor: string;
    borderColor: string;
    icon?: any;
  }
> = {
  pending: {
    label: "Pendiente",
    color: "text-amber-700",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    icon: Clock,
  },
  preparation: {
    label: "Preparación",
    color: "text-blue-700",
    dotColor: "bg-blue-500",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: Box,
  },
  delivery: {
    label: "En Reparto",
    color: "text-orange-700",
    dotColor: "bg-orange-500",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    icon: Truck,
  },
  completed: {
    label: "Completado",
    color: "text-green-700",
    dotColor: "bg-green-500",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    icon: CheckCircle,
  },
  rechazado: {
    label: "Rechazado",
    color: "text-red-700",
    dotColor: "bg-red-500",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    icon: Ban,
  },
  // Anulado ≠ rechazado: el rechazo lo decide el cliente, la anulación corrige un error
  // de carga. Se diferencian visualmente (slate) para no confundirlos en la lista.
  anulado: {
    label: "Anulado",
    color: "text-slate-700",
    dotColor: "bg-slate-500",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    icon: XCircle,
  },
};

export const statusFlow: OrderStatus[] = [
  "pending",
  "preparation",
  "delivery",
  "completed",
];