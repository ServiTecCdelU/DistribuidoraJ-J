import { describe, it, expect } from 'vitest'
import { montoDescuento, totalItemsNotaCredito } from './nota-credito'

describe('totalItemsNotaCredito', () => {
  it('suma precio por cantidad de cada ítem', () => {
    expect(totalItemsNotaCredito([{ price: 100, quantity: 2 }, { price: 50, quantity: 1 }])).toBe(250)
  })

  it('devuelve 0 sin ítems o con valores inválidos', () => {
    expect(totalItemsNotaCredito([])).toBe(0)
    expect(totalItemsNotaCredito([{ price: NaN, quantity: 3 }])).toBe(0)
  })
})

describe('montoDescuento', () => {
  it('calcula el porcentaje sobre la base', () => {
    expect(montoDescuento(10000, 10)).toBe(1000)
    expect(montoDescuento(999, 3)).toBe(29.97)
  })

  it('acota el porcentaje entre 0 y 100', () => {
    expect(montoDescuento(1000, 150)).toBe(1000)
    expect(montoDescuento(1000, -5)).toBe(0)
  })
})
