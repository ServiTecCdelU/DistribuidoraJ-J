import { describe, it, expect } from 'vitest'
import {
  monthRange,
  dayRange,
  customRange,
  shiftMonth,
  filterByRange,
  monthLabel,
  toInputDate,
} from './comisiones-period'

describe('monthRange', () => {
  it('devuelve del 1 a fin de mes inclusive', () => {
    const { from, to } = monthRange(new Date(2026, 7, 12))
    expect(from.getDate()).toBe(1)
    expect(from.getMonth()).toBe(7)
    expect(to.getDate()).toBe(31)
    expect(to.getHours()).toBe(23)
  })

  it('respeta meses de 30 días', () => {
    expect(monthRange(new Date(2026, 3, 5)).to.getDate()).toBe(30)
  })

  it('respeta febrero bisiesto', () => {
    expect(monthRange(new Date(2024, 1, 5)).to.getDate()).toBe(29)
  })
})

describe('dayRange', () => {
  it('cubre el día completo', () => {
    const { from, to } = dayRange(new Date(2026, 7, 12, 15, 30))
    expect(from.getHours()).toBe(0)
    expect(to.getHours()).toBe(23)
    expect(to.getMilliseconds()).toBe(999)
  })
})

describe('customRange', () => {
  it('devuelve null sin fechas', () => {
    expect(customRange('', '')).toBeNull()
  })

  it('usa la misma fecha cuando falta el hasta', () => {
    const r = customRange('2026-08-01', '')!
    expect(r.from.getDate()).toBe(1)
    expect(r.to.getDate()).toBe(1)
    expect(r.to.getHours()).toBe(23)
  })
})

describe('shiftMonth', () => {
  it('retrocede de marzo 31 a febrero sin corrimiento', () => {
    const prev = shiftMonth(new Date(2026, 2, 31), -1)
    expect(prev.getMonth()).toBe(1)
  })

  it('cruza el año', () => {
    const next = shiftMonth(new Date(2026, 11, 1), 1)
    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(0)
  })
})

describe('filterByRange', () => {
  const items = [
    { createdAt: new Date(2026, 6, 31, 23, 59) },
    { createdAt: new Date(2026, 7, 1, 0, 0) },
    { createdAt: new Date(2026, 7, 31, 23, 59) },
    { createdAt: new Date(2026, 8, 1, 0, 0) },
  ]

  it('incluye los bordes del mes', () => {
    const res = filterByRange(items, monthRange(new Date(2026, 7, 15)))
    expect(res).toHaveLength(2)
  })

  it('devuelve todo cuando el rango es null', () => {
    expect(filterByRange(items, null)).toHaveLength(4)
  })
})

describe('monthLabel', () => {
  it('formatea mes y año en español', () => {
    expect(monthLabel(new Date(2026, 7, 1))).toBe('agosto 2026')
  })
})

describe('toInputDate', () => {
  it('formatea en hora local con ceros a la izquierda', () => {
    expect(toInputDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
