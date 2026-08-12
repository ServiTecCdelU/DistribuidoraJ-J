import { describe, it, expect } from 'vitest'
import { imputarComisiones, comisionesDelPago } from './comision-imputacion'

const c = (amount: number, dia: number) => ({
  commissionAmount: amount,
  createdAt: new Date(2026, 7, dia),
})

// Con saleTotal, para el comprobante (comisión al 10%).
const v = (amount: number, dia: number) => ({ ...c(amount, dia), saleTotal: amount * 10 })

describe('comisionesDelPago', () => {
  it('solo lista lo que el pago alcanza a cubrir', () => {
    const items = comisionesDelPago([v(1000, 1), v(1000, 2), v(1000, 3)], 0, 1500)
    expect(items).toHaveLength(2)
    expect(items[0].pagadoEnEstePago).toBe(1000)
    expect(items[1].pagadoEnEstePago).toBe(500)
  })

  it('el total pagado del comprobante coincide con lo entregado', () => {
    const items = comisionesDelPago([v(1000, 1), v(2000, 2)], 0, 1234)
    expect(items.reduce((s, i) => s + i.pagadoEnEstePago, 0)).toBeCloseTo(1234, 6)
  })

  it('no toca la venta ni la comisión originales', () => {
    const items = comisionesDelPago([v(1000, 1)], 0, 250)
    expect(items[0].commissionAmount).toBe(1000)
    expect(items[0].saleTotal).toBe(10000)
    expect(items[0].pagadoEnEstePago).toBe(250)
    expect(items[0].restante).toBe(750)
  })

  it('un segundo pago arranca donde quedó el anterior', () => {
    const todas = [v(1000, 1), v(1000, 2), v(1000, 3)]
    const items = comisionesDelPago(todas, 1500, 1000)
    expect(items).toHaveLength(2)
    expect(items[0].pagadoEnEstePago).toBe(500) // resto de la segunda
    expect(items[0].restante).toBe(0)
    expect(items[1].pagadoEnEstePago).toBe(500) // parte de la tercera
    expect(items[1].restante).toBe(500)
  })

  it('no lista nada si el pago es cero', () => {
    expect(comisionesDelPago([v(1000, 1)], 0, 0)).toHaveLength(0)
  })
})

describe('total pagado con pagos anulados', () => {
  // Mismo criterio que commissions-service: los anulados no suman.
  const totalPagado = (pagos: { montoPagado: number; anulado?: boolean }[]) =>
    pagos.reduce((s, p) => (p.anulado ? s : s + p.montoPagado), 0)

  it('anular un pago devuelve las comisiones a pendiente', () => {
    const comisiones = [c(1000, 1), c(1000, 2)]
    const pagos = [{ montoPagado: 1000 }, { montoPagado: 1000, anulado: true }]

    const { items } = imputarComisiones(comisiones, totalPagado(pagos))
    expect(items[0].estadoPago).toBe('pagado')
    expect(items[1].estadoPago).toBe('pendiente')
  })

  it('anular el único pago deja todo pendiente', () => {
    const { items } = imputarComisiones([c(1000, 1)], totalPagado([{ montoPagado: 1000, anulado: true }]))
    expect(items[0].estadoPago).toBe('pendiente')
    expect(items[0].montoImputado).toBe(0)
  })
})

describe('imputarComisiones', () => {
  it('sin pagos deja todo pendiente', () => {
    const { items } = imputarComisiones([c(1000, 1), c(2000, 2)], 0)
    expect(items.map((i) => i.estadoPago)).toEqual(['pendiente', 'pendiente'])
    expect(items.every((i) => i.montoImputado === 0)).toBe(true)
  })

  it('un pago chico deja la primera comisión en parcial', () => {
    const { items } = imputarComisiones([c(1000, 1), c(2000, 2)], 0.15)
    expect(items[0].estadoPago).toBe('parcial')
    expect(items[0].montoImputado).toBe(0.15)
    expect(items[1].estadoPago).toBe('pendiente')
  })

  it('paga en orden cronológico, no en el orden de la lista', () => {
    const { items } = imputarComisiones([c(2000, 5), c(1000, 1)], 1000)
    // La del día 1 se cubre primero aunque venga segunda en la lista.
    expect(items[1].estadoPago).toBe('pagado')
    expect(items[0].estadoPago).toBe('pendiente')
  })

  it('cubre varias y corta en la del medio', () => {
    const { items } = imputarComisiones([c(1000, 1), c(1000, 2), c(1000, 3)], 1500)
    expect(items.map((i) => i.estadoPago)).toEqual(['pagado', 'parcial', 'pendiente'])
    expect(items[1].montoImputado).toBe(500)
  })

  it('marca todo pagado cuando alcanza justo', () => {
    const { items, sobrante } = imputarComisiones([c(1000, 1), c(2000, 2)], 3000)
    expect(items.every((i) => i.estadoPago === 'pagado')).toBe(true)
    expect(sobrante).toBe(0)
  })

  it('el excedente queda como sobrante', () => {
    const { sobrante } = imputarComisiones([c(1000, 1)], 1500)
    expect(sobrante).toBe(500)
  })

  it('una devolución libera plata para las comisiones siguientes', () => {
    const { items } = imputarComisiones([c(1000, 1), c(-400, 2), c(1000, 3)], 1000)
    expect(items[0].estadoPago).toBe('pagado')
    expect(items[1].estadoPago).toBe('pagado')
    expect(items[2].montoImputado).toBe(400)
    expect(items[2].estadoPago).toBe('parcial')
  })

  it('isPaid solo es true cuando está totalmente cubierta', () => {
    const { items } = imputarComisiones([c(1000, 1), c(1000, 2)], 1200)
    expect(items[0].isPaid).toBe(true)
    expect(items[1].isPaid).toBe(false)
  })

  it('no pierde ni inventa plata', () => {
    const { items, sobrante } = imputarComisiones([c(1000, 1), c(2000, 2), c(500, 3)], 2200)
    const aplicado = items.reduce((s, i) => s + i.montoImputado, 0)
    expect(aplicado + sobrante).toBe(2200)
  })
})
