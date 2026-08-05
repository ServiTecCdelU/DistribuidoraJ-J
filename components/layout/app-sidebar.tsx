"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  Truck,
  MapPin,
  LogOut,
  Menu,
  X,
  Receipt,
  UserCheck,
  BarChart3,
  Banknote,
  Tag,
  Store,
  Percent,
  Wallet,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { signOut } from "@/services/auth-service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavGroup {
  label: string;
  items: {
    href: string;
    label: string;
    icon: any;
    roles: string[];
  }[];
}

function getRoleLabel(user: { role: string; employeeType?: string }): string {
  if (user.role === "admin") return "Admin";
  if (user.employeeType === "transportista") return "Transportista";
  if (user.employeeType === "ambos") return "Vendedor / Transportista";
  if (user.employeeType === "cobrador") return "Cobrador";
  if (user.employeeType === "vendedor_cobrador") return "Vendedor / Cobrador";
  return "Vendedor";
}

interface AppSidebarProps {
  hidden: boolean;
  onToggle: () => void;
}

export function AppSidebar({ hidden, onToggle }: AppSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { user } = useAuth();

  const employeeType = user?.employeeType;
  const isVendedor = employeeType === "vendedor" || employeeType === "ambos" || employeeType === "vendedor_cobrador";
  const isTransportista = employeeType === "transportista" || employeeType === "ambos";
  const isCobrador = employeeType === "cobrador" || employeeType === "vendedor_cobrador";

  const navGroups: NavGroup[] = [
    {
      label: "Operaciones",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
        { href: "/caja", label: "Caja de Reparto", icon: Banknote, roles: ["admin"] },
        { href: "/ventas", label: user?.role === "seller" ? "Mis Ventas" : "Ventas", icon: Receipt, roles: ["admin", ...(isVendedor ? ["seller"] : [])] },
        { href: "/ventas/nueva", label: "Nueva Venta", icon: ShoppingCart, roles: ["admin", ...(isVendedor ? ["seller"] : [])] },
        { href: "/pedidos", label: "Pedidos", icon: Truck, roles: ["admin", ...(isTransportista ? ["seller"] : [])] },
        { href: "/mis-pedidos", label: "Mis Pedidos", icon: Package, roles: [...(isVendedor ? ["seller"] : [])] },
        { href: "/comisiones", label: "Mis Comisiones", icon: Banknote, roles: [...(isVendedor || isTransportista ? ["seller"] : [])] },
        // { href: "/cobranzas", label: "Cobranzas", icon: Receipt, roles: [...(isVendedor ? ["seller"] : [])] },
        {
          href: "/cuenta-corriente",
          label: isCobrador ? "Cobranza" : user?.role === "seller" ? "Mis Clientes" : "Cuenta Corriente",
          icon: Users,
          roles: ["admin", ...(isVendedor || isCobrador ? ["seller"] : [])],
        },
        { href: "/mayorista", label: "Mayorista", icon: Store, roles: ["admin"] },
      ],
    },
    {
      label: "Catálogo",
      items: [
        { href: "/productos", label: "Productos", icon: Package, roles: ["admin"] },
        { href: "/descuentos", label: "Descuentos", icon: Percent, roles: ["admin"] },
        { href: "/clientes", label: "Clientes", icon: Users, roles: ["admin"] },
      ],
    },
    {
      label: "Finanzas",
      items: [
        { href: "/gastos", label: "Gastos", icon: Wallet, roles: ["admin"] },
      ],
    },
    {
      label: "Equipo & Análisis",
      items: [
        { href: "/empleados", label: "Empleados", icon: UserCheck, roles: ["admin"] },
        // { href: "/reportes", label: "Reportes", icon: BarChart3, roles: ["admin"] },
      ],
    },
  ];

  // Filtrar items por rol
  const filteredGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.roles.includes(user?.role ?? ""),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {/* HEADER MÓVIL */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-sidebar border-b border-sidebar-border sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-8 w-8 shrink-0 rounded-lg bg-sidebar-primary">
            <Store className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground">Distribuidora 002</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          className="text-sidebar-foreground"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* OVERLAY */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* BOTÓN MOSTRAR — flota fuera del sidebar cuando está oculto (solo desktop) */}
      {hidden && (
        <button
          type="button"
          onClick={onToggle}
          title="Mostrar barra de navegación"
          className="hidden lg:flex fixed top-4 left-4 z-40 h-9 w-9 items-center justify-center rounded-xl bg-sidebar text-sidebar-foreground border border-sidebar-border shadow-md hover:bg-sidebar-accent transition-colors"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* SIDEBAR — wrapper fijo (posición/ocultamiento) + contenido escalado al 80% en desktop */}
      <div
        className={cn(
          "fixed top-0 left-0 z-[70] lg:z-40 h-screen w-64 lg:w-[14.4rem] overflow-hidden transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          hidden ? "lg:-translate-x-full" : "lg:translate-x-0",
        )}
      >
      <aside
        className="h-screen lg:h-[125vh] w-64 lg:w-72 lg:origin-top-left lg:scale-[0.8] bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col"
      >
        {/* Header: Logo + User */}
        <div className="px-5 pt-5 pb-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center min-w-10 h-10 rounded-xl bg-sidebar-primary">
              <Store className="h-6 w-6 text-sidebar-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-base text-sidebar-foreground truncate">
                Distribuidora 002
              </h1>
              {user && (
                <p className="text-xs text-sidebar-foreground/50 truncate">
                  {getRoleLabel(user)} · {user.name?.split(" ")[0] || user.email?.split("@")[0]}
                </p>
              )}
            </div>
            {/* Ocultar barra — solo desktop */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex shrink-0"
              onClick={onToggle}
              title="Ocultar barra de navegación"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
            {/* Cerrar móvil */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden shrink-0"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Navegación agrupada */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto custom-scrollbar space-y-5">
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <p className="px-4 mb-2 text-xs uppercase tracking-widest font-semibold text-sidebar-foreground/40">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border bg-sidebar">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      </div>
    </>
  );
}
