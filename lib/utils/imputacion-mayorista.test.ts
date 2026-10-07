import { describe, it, expect } from 'vitest'
import { calcularSaldosBoletas, descripcionPagoMayorista, type MovMayorista } from './imputacion-mayorista'

const deuda = (id: string, amount: number, date: string): MovMayorista => ({ id, type: 'debt', amount, date })
const pago = (id: string, amount: number, date: string, debtId?: string): MovMayorista => ({ id, type: 'payment', amount, date, debtId })

describe('calcularSaldosBoletas', () => {
  it('un pago por monto cubre primero las boletas más antiguas', () => {
    const s = calcularSaldosBoletas([
      deuda('b2', 500, '2026-10-02'),
      deuda('b1', 300, '2026-10-01'),
      pago('p1', 400, '2026-10-05'),
    ])
    expect(s.get('b1')).toBe(0)
    expect(s.get('b2')).toBe(400)
  })

  it('un pago imputado a una boleta solo baja esa boleta', () => {
    const s = calcularSaldosBoletas([
      deuda('b1', 300, '2026-10-01'),
      deuda('b2', 500, '2026-10-02'),
      pago('p1', 200, '2026-10-05', 'b2'),
    ])
    expect(s.get('b1')).toBe(300)
    expect(s.get('b2')).toBe(300)
  })

  it('el excedente de un pago imputado pasa a FIFO', () => {
    const s = calcularSaldosBoletas([
      deuda('b1', 300, '2026-10-01'),
      deuda('b2', 500, '2026-10-02'),
      pago('p1', 600, '2026-10-05', 'b2'),
    ])
    expect(s.get('b2')).toBe(0)
    expect(s.get('b1')).toBe(200)
  })

  it('si se paga de más todas las boletas quedan en cero', () => {
    const s = calcularSaldosBoletas([deuda('b1', 300, '2026-10-01'), pago('p1', 1000, '2026-10-05')])
    expect(s.get('b1')).toBe(0)
  })

  it('sin pagos el saldo es el monto de cada boleta', () => {
    const s = calcularSaldosBoletas([deuda('b1', 123.45, '2026-10-01')])
    expect(s.get('b1')).toBe(123.45)
  })
})

describe('descripcionPagoMayorista', () => {
  it('incluye medio, boleta, referencia y notas', () => {
    expect(descripcionPagoMayorista({ metodo: 'transferencia', boleta: 'Boleta 55', referencia: '998', notas: 'adelanto' }))
      .toBe('Pago transferencia · Boleta 55 · Ref. 998 — adelanto')
  })

  it('sin datos extra muestra solo el medio', () => {
    expect(descripcionPagoMayorista({ metodo: 'efectivo' })).toBe('Pago efectivo')
  })
})
