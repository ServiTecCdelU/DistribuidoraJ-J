"use client";

import React, { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Client, Order } from "@/lib/types";
import {
  User,
  Store,
  Filter,
  Truck,
  Search,
  X,
  SlidersHorizontal,
  Calendar,
} from "lucide-react";
import { statusConfig, statusFlow } from "@/lib/order-constants";

interface OrdersFiltersProps {
  filterStatus: string;
  setFilterStatus: (value: string) => void;
  filterClient: string;
  setFilterClient: (value: string) => void;
  filterSeller: string;
  setFilterSeller: (value: string) => void;
  filterTransportista?: string;
  setFilterTransportista?: (value: string) => void;
  filterDate?: string;
  setFilterDate?: (value: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  clients: Client[];
  sellers: { id: string; name: string }[];
  transportistas?: { id: string; name: string }[];
  orders: Order[];
  children?: React.ReactNode;
}

export function OrdersFilters({
  filterStatus,
  setFilterStatus,
  filterClient,
  setFilterClient,
  filterSeller,
  setFilterSeller,
  filterTransportista,
  setFilterTransportista,
  filterDate,
  setFilterDate,
  searchQuery,
  setSearchQuery,
  clients,
  sellers,
  transportistas,
  orders,
  children,
}: OrdersFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const order of orders) {
      counts[order.status] = (counts[order.status] || 0) + 1;
    }
    return counts;
  }, [orders]);

  const getStatusCount = (status: string) => statusCounts[status] || 0;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterClient) count++;
    if (filterSeller) count++;
    if (filterTransportista && filterTransportista !== "all-transportistas") count++;
    if (filterDate) count++;
    return count;
  }, [filterClient, filterSeller, filterTransportista, filterDate]);

  const handleClearFilters = () => {
    setFilterClient("");
    setFilterSeller("");
    if (setFilterTransportista) setFilterTransportista("");
    if (setFilterDate) setFilterDate("");
  };

  return (
    <div className="space-y-3">
      {/* Fila 1: Status tabs (desktop) / Select (mobile) + botones de acción */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mobile: Select de estado */}
        <div className="sm:hidden flex-1">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusFlow.filter((s) => s !== "completed").map((status) => {
                const config = statusConfig[status];
                return (
                  <SelectItem key={status} value={status}>
                    {config.label} ({getStatusCount(status)})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: tabs de estado */}
        <div className="hidden sm:flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
          {statusFlow.filter((s) => s !== "completed").map((status) => {
            const count = getStatusCount(status);
            const config = statusConfig[status];
            const isActive = filterStatus === status;

            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all whitespace-nowrap min-w-fit text-sm ${
                  isActive
                    ? `${config.bgColor} ${config.borderColor} ${config.color} shadow-md ring-2 ring-offset-1`
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${config.dotColor}`} />
                <span className={`font-semibold ${isActive ? config.color : "text-gray-900"}`}>
                  {count}
                </span>
                <span className={`${isActive ? "opacity-90" : "text-gray-500"}`}>
                  {config.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Botones de acción (children) */}
        {children && (
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>

      {/* Fila 2: Buscador + toggle filtros */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente, vendedor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Selector de día (desktop: al lado del buscador; mobile: dentro del panel de filtros) */}
        {setFilterDate && (
          <div className="relative shrink-0 hidden sm:block">
            <Input
              type="date"
              value={filterDate || ""}
              onChange={(e) => setFilterDate(e.target.value)}
              className={`h-10 w-[125px] sm:w-[160px] ${filterDate ? "border-teal-500 ring-1 ring-teal-500/30 pr-8" : ""}`}
              title="Filtrar por día"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate("")}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                title="Quitar filtro de día"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Botón toggle filtros */}
        <Button
          variant={filtersOpen ? "default" : "outline"}
          size="icon"
          className={`shrink-0 h-10 w-10 relative ${filtersOpen ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}`}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && !filtersOpen && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Panel de filtros colapsable */}
      {filtersOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-gray-50/80 rounded-2xl border border-gray-200 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Cliente
            </label>
            <Select
              value={filterClient || "all-clients"}
              onValueChange={(value) =>
                setFilterClient(value === "all-clients" ? "" : value)
              }
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Todos los clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-clients">Todos los clientes</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" />
              Vendedor
            </label>
            <Select
              value={filterSeller || "all-sellers"}
              onValueChange={(value) =>
                setFilterSeller(value === "all-sellers" ? "" : value)
              }
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Todos los vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-sellers">Todos los vendedores</SelectItem>
                {sellers.map((seller) => (
                  <SelectItem key={seller.id} value={seller.id}>
                    {seller.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {transportistas && setFilterTransportista && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Transportista
              </label>
              <Select
                value={filterTransportista || "all-transportistas"}
                onValueChange={(value) =>
                  setFilterTransportista(value === "all-transportistas" ? "" : value)
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-transportistas">Todos</SelectItem>
                  <SelectItem value="unassigned">Sin asignar</SelectItem>
                  {transportistas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Día — solo mobile (en desktop vive al lado del buscador) */}
          {setFilterDate && (
            <div className="space-y-1.5 sm:hidden">
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Día
              </label>
              <div className="relative">
                <Input
                  type="date"
                  value={filterDate || ""}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className={`bg-white h-10 w-full ${filterDate ? "border-teal-500 ring-1 ring-teal-500/30 pr-8" : ""}`}
                />
                {filterDate && (
                  <button
                    onClick={() => setFilterDate("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    title="Quitar filtro de día"
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>
          )}

          {activeFilterCount > 0 && (
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-500 hover:text-gray-700"
                onClick={handleClearFilters}
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
