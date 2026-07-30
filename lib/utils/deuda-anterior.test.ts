import { describe, it, expect } from 'vitest'
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
