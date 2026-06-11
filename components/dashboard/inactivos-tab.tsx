'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, MessageCircle, UserX } from 'lucide-react'
import { adminInsightsApi } from '@/lib/api'
import type { ClienteInactivo } from '@/lib/api'
import { formatCurrency } from '@/lib/utils/format'
import { toast } from 'sonner'

function whatsappUrl(telefono: string, nombre: string): string {
  const numero = telefono.replace(/\D/g, '')
  const msg = encodeURIComponent(
    `Hola ${nombre}, te escribimos de Distribuidora Patricia. Hace un tiempo que no nos hacés un pedido. ¿Te pasamos las ofertas de esta semana?`,
  )
  return `https://wa.me/54${numero}?text=${msg}`
}

export function InactivosTab() {
  const [clientes, setClientes] = useState<ClienteInactivo[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let mounted = true
    adminInsightsApi
      .getClientesInactivos()
      .then((d) => mounted && setClientes(d))
      .catch(() => mounted && toast.error('Error al cargar clientes inactivos'))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  const filtrados = useMemo(() => {
    if (!clientes) return []
    const q = query.toLowerCase()
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || c.vendedorNombre.toLowerCase().includes(q),
    )
  }, [clientes, query])

  if (loading) return <Skeleton className="h-80 rounded-2xl" />
  if (!clientes) return null

  return (
    <Card className="border-border/40 bg-white rounded-2xl shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-4 pb-2">
        <div>
          <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
            <UserX className="h-4 w-4 text-orange-500" />
            Clientes en fuga
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {clientes.length} clientes que cortaron su ritmo habitual de compra — ordenados por valor perdido
          </p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente o vendedor..."
            className="pl-8 h-8 rounded-xl text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-0">
        {filtrados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Ningún cliente en riesgo de fuga. Todos compran a su ritmo habitual.
          </p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto max-h-[min(560px,60vh)] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-muted-foreground border-b border-slate-100">
                    <th className="py-2 pr-2 font-medium">Cliente</th>
                    <th className="py-2 px-2 font-medium">Vendedor</th>
                    <th className="py-2 px-2 font-medium text-center">Sin comprar</th>
                    <th className="py-2 px-2 font-medium text-center">Compraba cada</th>
                    <th className="py-2 px-2 font-medium text-right">Compra promedio</th>
                    <th className="py-2 px-2 font-medium text-right">Deuda</th>
                    <th className="py-2 pl-2 font-medium text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c) => (
                    <tr key={c.clientId} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2 pr-2 font-medium text-foreground">{c.nombre}</td>
                      <td className="py-2 px-2 text-muted-foreground">{c.vendedorNombre || '—'}</td>
                      <td className="py-2 px-2 text-center font-bold text-orange-700">{c.diasSinComprar} días</td>
                      <td className="py-2 px-2 text-center text-muted-foreground">
                        {c.frecuenciaDias != null ? `${c.frecuenciaDias} días` : 'compra única'}
                      </td>
                      <td className="py-2 px-2 text-right">{formatCurrency(c.promedioCompra)}</td>
                      <td className="py-2 px-2 text-right">
                        {c.saldo > 0 ? (
                          <span className="text-amber-700">{formatCurrency(c.saldo)}</span>
                        ) : (
                          <span className="text-emerald-700">al día</span>
                        )}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {c.telefono && (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-6 rounded-xl text-[10px] gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          >
                            <a href={whatsappUrl(c.telefono, c.nombre)} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="h-3 w-3" />
                              Reactivar
                            </a>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="lg:hidden space-y-2 max-h-[min(560px,60vh)] overflow-y-auto">
              {filtrados.map((c) => (
                <div key={c.clientId} className="rounded-2xl border border-slate-100 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{c.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{c.vendedorNombre || 'Sin vendedor'}</p>
                    </div>
                    <span className="text-xs font-bold text-orange-700 shrink-0">{c.diasSinComprar} d sin comprar</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      Compraba cada {c.frecuenciaDias ?? '—'} d · prom. {formatCurrency(c.promedioCompra)}
                    </span>
                    {c.telefono && (
                      <a
                        href={whatsappUrl(c.telefono, c.nombre)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-emerald-700 flex items-center gap-1"
                      >
                        <MessageCircle className="h-3 w-3" /> Reactivar
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
