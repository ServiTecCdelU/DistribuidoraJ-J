export interface ListaRankingItem {
  key: string
  name: string
  value: number
  valueLabel: string
  detail?: string
}

interface ListaRankingProps {
  items: ListaRankingItem[]
  emptyText?: string
}

export function ListaRanking({ items, emptyText = 'Sin datos.' }: ListaRankingProps) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">{emptyText}</p>
  }

  const max = Math.max(1, ...items.map(it => it.value))

  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => {
        const pct = Math.max(2, Math.round((it.value / max) * 100))
        return (
          <li key={it.key} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="tabular-nums text-muted-foreground mr-1.5">{i + 1}.</span>
                <span className="font-medium text-foreground">{it.name}</span>
              </span>
              <span className="font-semibold tabular-nums text-foreground shrink-0">{it.valueLabel}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-teal-500 transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
              {it.detail && (
                <span className="w-32 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground truncate">{it.detail}</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
