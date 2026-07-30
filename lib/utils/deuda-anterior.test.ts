import { describe, it, expect } from 'vitest'
import { clasificarDeuda } from './deuda'
import {
  DEUDA_ANT_TAG,
  descripcionDeudaAnterior,
  esDeudaAnterior,
  notaDeudaAnterior,
} from './deuda-anterior'

describe('esDeudaAnterior', () => {
  it('reconoce una deuda anterior por su tag', () => {
    expect(esDeudaAnterior(`${DEUDA_ANT_TAG} Factura de marzo`)).toBe(true)
  })

  it('no confunde una venta normal con una deuda anterior', () => {
    expect(esDeudaAnterior('Venta #123')).toBe(false)
    expect(esDeudaAnterior(undefined)).toBe(false)
  })
})

describe('notaDeudaAnterior', () => {
  it('devuelve el comentario sin el tag', () => {
    expect(notaDeudaAnterior(`${DEUDA_ANT_TAG} Factura 0001-00023`)).toBe('Factura 0001-00023')
  })

  it('devuelve vacío cuando no hay comentario', () => {
    expect(notaDeudaAnterior(DEUDA_ANT_TAG)).toBe('')
  })

  it('devuelve vacío para movimientos que no son deuda anterior', () => {
    expect(notaDeudaAnterior('Pago en efectivo')).toBe('')
  })
})

describe('descripcionDeudaAnterior', () => {
  it('agrega el tag al comentario', () => {
    expect(descripcionDeudaAnterior('  Factura de marzo ')).toBe(`${DEUDA_ANT_TAG} Factura de marzo`)
  })

  it('guarda solo el tag cuando no hay comentario', () => {
    expect(descripcionDeudaAnterior('')).toBe(DEUDA_ANT_TAG)
    expect(descripcionDeudaAnterior(undefined)).toBe(DEUDA_ANT_TAG)
  })

  it('es reversible con notaDeudaAnterior', () => {
    const desc = descripcionDeudaAnterior('Boleta vieja')
    expect(notaDeudaAnterior(desc)).toBe('Boleta vieja')
  })
})

// La deuda anterior queda como la deuda pendiente más antigua (debtSince) y define
// la clasificación del cliente según la fecha de la venta original que se cargó.
describe('clasificación según la fecha de la deuda anterior', () => {
  const ahora = new Date('2026-07-29T12:00:00')
  const haceDias = (dias: number) => new Date(ahora.getTime() - dias * 86400000)

  it('deuda de esta semana queda normal', () => {
    expect(clasificarDeuda(haceDias(3), ahora)).toBe('normal')
  })

  it('deuda de 10 días queda atrasado', () => {
    expect(clasificarDeuda(haceDias(10), ahora)).toBe('atrasado')
  })

  it('deuda de 2 meses queda moroso', () => {
    expect(clasificarDeuda(haceDias(60), ahora)).toBe('moroso')
  })

  it('deuda de más de un año queda incobrable', () => {
    expect(clasificarDeuda(haceDias(400), ahora)).toBe('incobrable')
  })
})
