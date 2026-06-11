import { describe, it, expect } from 'vitest'
import {
  calcularAging,
  calcularVelocidad,
  calcularReposicion,
  calcularRentabilidad,
  estimarCosto,
  calcularInactividad,
  resumirVentasDia,
  type TxLite,
} from '../admin-insights'

const HOY = new Date('2026-06-11T12:00:00')
const hace = (dias: number) => new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000)

describe('calcularAging', () => {
  it('devuelve buckets vacios si no hay saldo', () => {
    const buckets = calcularAging([], 0, HOY)
    expect(buckets).toEqual({ d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 })
  })

  it('bucketiza una deuda sin pagos por su antiguedad', () => {
    const txs: TxLite[] = [{ type: 'debt', amount: 1000, date: hace(45) }]
    const buckets = calcularAging(txs, 1000, HOY)
    expect(buckets.d31_60).toBe(1000)
    expect(buckets.d0_30).toBe(0)
  })

  it('los pagos cancelan primero la deuda mas vieja (FIFO)', () => {
    const txs: TxLite[] = [
      { type: 'debt', amount: 1000, date: hace(70) },
      { type: 'debt', amount: 500, date: hace(10) },
      { type: 'payment', amount: 1000, date: hace(5) },
    ]
    const buckets = calcularAging(txs, 500, HOY)
    expect(buckets.d61_90).toBe(0)
    expect(buckets.d0_30).toBe(500)
  })

  it('un pago parcial deja el resto de la deuda vieja pendiente', () => {
    const txs: TxLite[] = [
      { type: 'debt', amount: 1000, date: hace(100) },
      { type: 'payment', amount: 400, date: hace(50) },
    ]
    const buckets = calcularAging(txs, 600, HOY)
    expect(buckets.d90plus).toBe(600)
  })

  it('saldo sin transacciones que lo respalden va a +90 dias', () => {
    const txs: TxLite[] = [{ type: 'debt', amount: 200, date: hace(5) }]
    const buckets = calcularAging(txs, 1200, HOY)
    expect(buckets.d0_30).toBe(200)
    expect(buckets.d90plus).toBe(1000)
  })

  it('si las deudas registradas superan el saldo, cancela las viejas', () => {
    const txs: TxLite[] = [
      { type: 'debt', amount: 1000, date: hace(80) },
      { type: 'debt', amount: 500, date: hace(10) },
    ]
    const buckets = calcularAging(txs, 500, HOY)
    expect(buckets.d61_90).toBe(0)
    expect(buckets.d0_30).toBe(500)
  })
})

describe('calcularVelocidad / calcularReposicion', () => {
  it('calcula unidades por dia sumando items del mismo producto', () => {
    const vel = calcularVelocidad(
      [
        { productId: 'a', quantity: 14 },
        { productId: 'a', quantity: 14 },
        { productId: 'b', quantity: 7 },
      ],
      28,
    )
    expect(vel.get('a')).toBe(1)
    expect(vel.get('b')).toBe(0.25)
  })

  it('producto sin ventas tiene cobertura infinita y sugerido 0', () => {
    const r = calcularReposicion(50, 0, 14)
    expect(r.coberturaDias).toBe(Infinity)
    expect(r.sugerido).toBe(0)
  })

  it('sugiere reponer lo que falta para cubrir los dias pedidos', () => {
    // vende 2/dia, stock 10 → cubre 5 dias; para 14 dias necesita 28, faltan 18
    const r = calcularReposicion(10, 2, 14)
    expect(r.coberturaDias).toBe(5)
    expect(r.sugerido).toBe(18)
  })

  it('no sugiere nada si el stock ya cubre el periodo', () => {
    const r = calcularReposicion(100, 2, 14)
    expect(r.sugerido).toBe(0)
  })
})

describe('estimarCosto', () => {
  it('prioriza el precio de lista mayorista', () => {
    expect(estimarCosto({ precioListaMayorista: 80, precioBase: 70, precioVenta: 100, gananciaGlobal: 25 })).toBe(80)
  })
  it('usa precioBase para productos manuales', () => {
    expect(estimarCosto({ precioBase: 70 })).toBe(70)
  })
  it('deriva el costo desde la ganancia global', () => {
    expect(estimarCosto({ precioVenta: 125, gananciaGlobal: 25 })).toBe(100)
  })
  it('devuelve undefined si no hay forma de saber el costo', () => {
    expect(estimarCosto({ precioVenta: 100 })).toBeUndefined()
  })
})

describe('calcularRentabilidad', () => {
  const productos = new Map([
    ['p1', { nombre: 'Fernet', categoria: 'Bebidas', costo: 80 }],
    ['p2', { nombre: 'Galletitas', categoria: 'Almacen', costo: undefined }],
  ])

  it('calcula margen por producto', () => {
    const res = calcularRentabilidad(
      [{ clientId: 'c1', clientName: 'Juan', items: [{ productId: 'p1', quantity: 2, price: 100 }] }],
      productos,
    )
    const fila = res.porProducto[0]
    expect(fila.facturado).toBe(200)
    expect(fila.costo).toBe(160)
    expect(fila.margen).toBe(40)
    expect(fila.margenPct).toBe(20)
  })

  it('aplica descuento del item al facturado', () => {
    const res = calcularRentabilidad(
      [{ items: [{ productId: 'p1', quantity: 1, price: 100, itemDiscount: 10 }] }],
      productos,
    )
    expect(res.porProducto[0].facturado).toBe(90)
  })

  it('los regalos no facturan pero si cuestan', () => {
    const res = calcularRentabilidad(
      [{ items: [{ productId: 'p1', quantity: 1, price: 100, esRegalo: true }] }],
      productos,
    )
    expect(res.porProducto[0].facturado).toBe(0)
    expect(res.porProducto[0].costo).toBe(80)
    expect(res.porProducto[0].margen).toBe(-80)
  })

  it('marca costoIncompleto cuando el producto no tiene costo conocido', () => {
    const res = calcularRentabilidad(
      [{ items: [{ productId: 'p2', quantity: 1, price: 50 }] }],
      productos,
    )
    expect(res.porProducto[0].costoIncompleto).toBe(true)
    expect(res.totales.costoIncompleto).toBe(true)
  })

  it('agrupa por cliente y por categoria', () => {
    const res = calcularRentabilidad(
      [
        { clientId: 'c1', clientName: 'Juan', items: [{ productId: 'p1', quantity: 1, price: 100 }] },
        { clientId: 'c1', clientName: 'Juan', items: [{ productId: 'p1', quantity: 1, price: 100 }] },
      ],
      productos,
    )
    expect(res.porCliente).toHaveLength(1)
    expect(res.porCliente[0].facturado).toBe(200)
    expect(res.porCategoria[0].id).toBe('Bebidas')
  })
})

describe('calcularInactividad', () => {
  it('devuelve null sin compras', () => {
    expect(calcularInactividad([], HOY)).toBeNull()
  })

  it('cliente semanal con 30 dias sin comprar esta en riesgo', () => {
    const fechas = [hace(58), hace(51), hace(44), hace(37), hace(30)]
    const r = calcularInactividad(fechas, HOY)!
    expect(r.diasSinComprar).toBe(30)
    expect(r.frecuenciaDias).toBe(7)
    expect(r.enRiesgo).toBe(true)
  })

  it('cliente mensual al dia no esta en riesgo', () => {
    const fechas = [hace(70), hace(40), hace(10)]
    const r = calcularInactividad(fechas, HOY)!
    expect(r.enRiesgo).toBe(false)
  })

  it('compra unica usa umbral de 30 dias', () => {
    expect(calcularInactividad([hace(20)], HOY)!.enRiesgo).toBe(false)
    expect(calcularInactividad([hace(40)], HOY)!.enRiesgo).toBe(true)
  })
})

describe('resumirVentasDia', () => {
  it('separa efectivo, transferencia y cuenta corriente', () => {
    const r = resumirVentasDia([
      { total: 100, paymentType: 'cash', paymentMethod: 'efectivo' },
      { total: 200, paymentType: 'cash', paymentMethod: 'transferencia' },
      { total: 300, paymentType: 'credit' },
      { total: 400, paymentType: 'mixed', cashAmount: 250, creditAmount: 150, paymentMethod: 'efectivo' },
    ])
    expect(r.totalVendido).toBe(1000)
    expect(r.cantidadVentas).toBe(4)
    expect(r.efectivo).toBe(350)
    expect(r.transferencia).toBe(200)
    expect(r.cuentaCorriente).toBe(450)
  })
})
