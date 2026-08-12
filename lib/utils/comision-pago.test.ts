import { describe, it, expect } from 'vitest'
import { calcularSaldo, calcularPago, montoSugerido } from './comision-pago'

describe('calcularSaldo', () => {
  it('es cero sin pagos', () => {
    expect(calcularSaldo([])).toBe(0)
    expect(calcularSaldo(null)).toBe(0)
  })

  it('acumula lo que se pagó de menos', () => {
    const saldo = calcularSaldo([
      { monto: 10000, montoPagado: 8000 },
      { monto: 5000, montoPagado: 4000 },
    ])
    expect(saldo).toBe(3000)
  })

  it('queda negativo cuando se pagó de más', () => {
    expect(calcularSaldo([{ monto: 10000, montoPagado: 12000 }])).toBe(-2000)
  })

  it('vuelve a cero cuando el pago siguiente salda la deuda', () => {
    const saldo = calcularSaldo([
      { monto: 10000, montoPagado: 8000 },
      { monto: 5000, montoPagado: 7000 },
    ])
    expect(saldo).toBe(0)
  })
})

describe('calcularPago', () => {
  it('sin monto explícito paga devengado más deuda anterior', () => {
    expect(calcularPago(10000, 3000)).toEqual({ pagado: 13000, saldoRestante: 0 })
  })

  it('pago de menos deja saldo pendiente', () => {
    expect(calcularPago(10000, 0, 6000)).toEqual({ pagado: 6000, saldoRestante: 4000 })
  })

  it('pago de más deja saldo negativo (adelanto)', () => {
    expect(calcularPago(10000, 0, 12000)).toEqual({ pagado: 12000, saldoRestante: -2000 })
  })

  it('un pago parcial arrastra la deuda anterior', () => {
    expect(calcularPago(5000, 4000, 6000)).toEqual({ pagado: 6000, saldoRestante: 3000 })
  })

  it('el adelanto previo reduce lo que hay que pagar', () => {
    expect(calcularPago(10000, -2000)).toEqual({ pagado: 8000, saldoRestante: 0 })
  })

  it('pagar cero deja todo pendiente', () => {
    expect(calcularPago(10000, 1000, 0)).toEqual({ pagado: 0, saldoRestante: 11000 })
  })
})

describe('montoSugerido', () => {
  it('suma deuda anterior', () => {
    expect(montoSugerido(10000, 3000)).toBe(13000)
  })

  it('nunca es negativo', () => {
    expect(montoSugerido(1000, -5000)).toBe(0)
  })

  it('redondea a dos decimales', () => {
    expect(montoSugerido(1000.555, 0)).toBe(1000.56)
  })
})
