import { describe, it, expect } from 'vitest'
import { clasificarDeuda, diasDesde, esDiaDePago, diaDePagoInfo } from './deuda'

const AHORA = new Date('2026-06-16T12:00:00')
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86400000)

describe('clasificarDeuda', () => {
  it('sin fecha de deuda es normal', () => {
    expect(clasificarDeuda(undefined, AHORA)).toBe('normal')
  })

  it('dentro de los 7 días es normal', () => {
    expect(clasificarDeuda(hace(0), AHORA)).toBe('normal')
    expect(clasificarDeuda(hace(6), AHORA)).toBe('normal')
  })

  it('a los 7 días pasa a atrasado', () => {
    expect(clasificarDeuda(hace(7), AHORA)).toBe('atrasado')
    expect(clasificarDeuda(hace(14), AHORA)).toBe('atrasado')
  })

  it('a los 15 días pasa a moroso', () => {
    expect(clasificarDeuda(hace(15), AHORA)).toBe('moroso')
    expect(clasificarDeuda(hace(364), AHORA)).toBe('moroso')
  })

  it('al año pasa a incobrable', () => {
    expect(clasificarDeuda(hace(365), AHORA)).toBe('incobrable')
    expect(clasificarDeuda(hace(800), AHORA)).toBe('incobrable')
  })
})

describe('esDiaDePago', () => {
  it('es true solo en el día 7 exacto', () => {
    expect(esDiaDePago(hace(6), AHORA)).toBe(false)
    expect(esDiaDePago(hace(7), AHORA)).toBe(true)
    expect(esDiaDePago(hace(8), AHORA)).toBe(false)
  })

  it('sin fecha es false', () => {
    expect(esDiaDePago(undefined, AHORA)).toBe(false)
  })
})

describe('diaDePagoInfo', () => {
  it('cuenta los días que faltan dentro del plazo (verde)', () => {
    expect(diaDePagoInfo(hace(0), AHORA)).toEqual({ numero: 7, estado: 'falta' })
    expect(diaDePagoInfo(hace(6), AHORA)).toEqual({ numero: 1, estado: 'falta' })
  })

  it('el día 7 es hoy con 0', () => {
    expect(diaDePagoInfo(hace(7), AHORA)).toEqual({ numero: 0, estado: 'hoy' })
  })

  it('vencido muestra los días totales (no se reinicia) con su estado', () => {
    expect(diaDePagoInfo(hace(8), AHORA)).toEqual({ numero: 8, estado: 'atrasado' })
    expect(diaDePagoInfo(hace(14), AHORA)).toEqual({ numero: 14, estado: 'atrasado' })
    expect(diaDePagoInfo(hace(15), AHORA)).toEqual({ numero: 15, estado: 'moroso' })
    expect(diaDePagoInfo(hace(365), AHORA)).toEqual({ numero: 365, estado: 'incobrable' })
  })
})

describe('diasDesde', () => {
  it('cuenta días enteros transcurridos', () => {
    expect(diasDesde(hace(10), AHORA)).toBe(10)
  })

  it('nunca es negativo', () => {
    const futuro = new Date(AHORA.getTime() + 5 * 86400000)
    expect(diasDesde(futuro, AHORA)).toBe(0)
  })
})
