'use client'

import type { Product } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format'
import { History, Pencil, CheckCircle2, EyeOff, Eye } from 'lucide-react'

function getStockColor(stock: number) {
  if (stock === 0) return 'destructive'
  if (stock < 10) return 'warning'
  return 'success'
}

export interface ProductListViewProps {
  products: Product[]
  onViewHistory: (product: Product) => void
  onEdit: (product: Product) => void
  onEnable: (product: Product) => void
  onDeactivate: (product: Product) => void
}

/**
 * Vista "Lista" de productos: tabla completa en desktop y tarjetas compactas en mobile.
 * Presentacional — recibe los productos y los handlers de acción por props.
 */
export function ProductListView({
  products,
  onViewHistory,
  onEdit,
  onEnable,
  onDeactivate,
}: ProductListViewProps) {
  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="overflow-x-auto hidden lg:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Código</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Descripción</th>
              <th className="text-left px-3 py-3 font-semibold text-muted-foreground">Categoría</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">Precio</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground">Stock</th>
              <th className="text-center px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">Lote</th>
              <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((product) => {
              const stockColor = getStockColor(product.stock);
              const isDisabled = (product as any).disabled;
              return (
                <tr
                  key={product.id}
                  className={cn(
                    "hover:bg-muted/20 transition-colors",
                    isDisabled && "opacity-50",
                  )}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {product.description || "—"}
                  </td>
                  <td className="px-3 py-2.5 font-medium max-w-[260px] truncate">
                    <span>{product.name}</span>
                    {isDisabled && (
                      <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">Deshabilitado</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {product.category}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-teal-600 whitespace-nowrap">
                    {product.unidadesPorBulto && product.seDivideEn && product.unidadesPorBulto > 0
                      ? formatCurrency(Math.round(product.price * product.seDivideEn / product.unidadesPorBulto * 100) / 100)
                      : formatCurrency(product.price)}
                    {product.unidadesPorBulto && product.seDivideEn && product.unidadesPorBulto > 0 && (
                      <span className="block text-[10px] font-normal text-muted-foreground">/ lote</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Badge
                      variant={stockColor === "destructive" ? "destructive" : stockColor === "warning" ? "secondary" : "outline"}
                      className={cn(
                        "text-xs font-medium",
                        stockColor === "warning" && "bg-amber-100 text-amber-800 border-amber-200",
                        stockColor === "success" && "bg-green-100 text-green-800 border-green-200",
                      )}
                    >
                      {product.stock}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {product.unidadesPorBulto ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors">
                            {product.seDivideEn && product.seDivideEn > 1
                              ? `${Math.floor(product.unidadesPorBulto / product.seDivideEn)} lotes`
                              : `${product.unidadesPorBulto}u`}
                            <Eye className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-3 text-xs space-y-1.5" side="left">
                          <p className="font-semibold text-foreground mb-2">Detalle de lote</p>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cantidad de unidades por bulto</span>
                            <span className="font-medium">{product.unidadesPorBulto}</span>
                          </div>
                          {product.seDivideEn && product.seDivideEn > 1 && (
                            <>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">mini bultos</span>
                                <span className="font-medium">{Math.floor(product.unidadesPorBulto / product.seDivideEn)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">cantidad de unidades por mini bulto</span>
                                <span className="font-medium">{product.seDivideEn}</span>
                              </div>
                              <div className="flex justify-between border-t pt-1.5 mt-1">
                                <span className="text-muted-foreground">Precio de cada mini bulto</span>
                                <span className="font-semibold text-teal-600">{formatCurrency(Math.round(product.price * product.seDivideEn / product.unidadesPorBulto! * 100) / 100)}</span>
                              </div>
                            </>
                          )}
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewHistory(product)} title="Historial">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(product)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {isDisabled ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" onClick={() => onEnable(product)} title="Habilitar">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700" onClick={() => onDeactivate(product)} title="Deshabilitar">
                          <EyeOff className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Vista compacta — mobile */}
      <div className="lg:hidden divide-y">
        {products.map((product) => {
          const stockColor = getStockColor(product.stock);
          const isDisabled = (product as any).disabled;
          const precio = product.unidadesPorBulto && product.seDivideEn && product.unidadesPorBulto > 0
            ? Math.round(product.price * product.seDivideEn / product.unidadesPorBulto * 100) / 100
            : product.price;
          return (
            <div
              key={product.id}
              className={cn("p-3 flex items-start gap-3", isDisabled && "opacity-50")}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{product.name}</span>
                  {isDisabled && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">Off</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground min-w-0">
                  <span className="font-mono shrink-0">{product.description || "—"}</span>
                  {product.category && <span className="truncate">· {product.category}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="font-semibold text-teal-600 text-sm whitespace-nowrap">
                    {formatCurrency(precio)}
                    {product.unidadesPorBulto && product.seDivideEn && product.unidadesPorBulto > 0 && (
                      <span className="text-[10px] font-normal text-muted-foreground"> / lote</span>
                    )}
                  </span>
                  <Badge
                    variant={stockColor === "destructive" ? "destructive" : stockColor === "warning" ? "secondary" : "outline"}
                    className={cn(
                      "text-xs font-medium",
                      stockColor === "warning" && "bg-amber-100 text-amber-800 border-amber-200",
                      stockColor === "success" && "bg-green-100 text-green-800 border-green-200",
                    )}
                  >
                    Stock {product.stock}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onViewHistory(product)} title="Historial">
                  <History className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(product)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                {isDisabled ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => onEnable(product)} title="Habilitar">
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700" onClick={() => onDeactivate(product)} title="Deshabilitar">
                    <EyeOff className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )
}
