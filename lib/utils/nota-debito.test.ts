import { describe, it, expect } from 'vitest'
import {
  NOTA_DEBITO_TAG,
  descripcionNotaDebito,
  esNotaDebito,
  motivoNotaDebito,
} from './nota-debito'

describe('nota de débito', () => {
  it('detecta el tag al inicio de la descripción', () => {
    expect(esNotaDebito(`${NOTA_DEBITO_TAG} Flete`)).toBe(true)
    expect(esNotaDebito('Venta #1')).toBe(false)
    expect(esNotaDebito(undefined)).toBe(false)
  })

  it('extrae el motivo sin el tag', () => {
    expect(motivoNotaDebito(`${NOTA_DEBITO_TAG} Flete`)).toBe('Flete')
    expect(motivoNotaDebito(NOTA_DEBITO_TAG)).toBe('')
    expect(motivoNotaDebito('Venta #1')).toBe('')
  })

  it('arma la descripción con o sin motivo', () => {
    expect(descripcionNotaDebito('  Flete ')).toBe(`${NOTA_DEBITO_TAG} Flete`)
    expect(descripcionNotaDebito('')).toBe(NOTA_DEBITO_TAG)
  })
})
