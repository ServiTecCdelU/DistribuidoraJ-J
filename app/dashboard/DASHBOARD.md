# Módulo Dashboard — funcionamiento

Referencia rápida de `app/dashboard/page.tsx` + `components/dashboard/*`. Solo `admin`.

## Qué hace

Panel de control del negocio en 6 vistas (tabs con pills, estado local `activeTab`):

| Tab | Componente | Qué muestra |
|-----|-----------|-------------|
| **Resumen** | inline en `page.tsx` | KPIs (ventas hoy con % real vs mismo día sem. pasada, stock bajo, deudores, pedidos), gráficos 7 días / por hora / 6 meses, top productos, pedidos pendientes, config alias transferencia. |
| **Cierre del día** | `resumen-dia-tab.tsx` | Vendido, efectivo/transferencia/cta cte, cobranzas vs deuda nueva (balance), comprobantes pendientes. Selector Hoy/Ayer/Anteayer. |
| **Morosidad** | `morosidad-tab.tsx` | Aging FIFO de deuda por cliente (0-30/31-60/61-90/+90), días desde último pago, reclamo por WhatsApp. |
| **Reposición** | `reposicion-tab.tsx` | Productos cuyo stock no cubre N días (7/14/21/30) según ventas de 28 días. Export Excel del pedido sugerido (unidades y bultos). |
| **Rentabilidad** | `rentabilidad-tab.tsx` | Ganancia bruta y margen % por producto/rubro/cliente (7/30/90 días). |
| **Clientes en fuga** | `inactivos-tab.tsx` | Clientes que superaron 2× su frecuencia habitual de compra (mín. 14 días), ordenados por valor perdido. Reactivación por WhatsApp. |

## Datos

- **Resumen**: `dashboardApi.getDashboardData()` (`services/dashboard-service.ts`) — ventas 6 meses,
  productos, pedidos, deudores en un batch. `salesWeekComparison` compara día a día contra la
  semana anterior real (14 días bucketizados).
- **Tabs nuevos**: `adminInsightsApi` (`services/admin-insights-service.ts`). Cada tab carga su
  data al montarse (solo se monta el tab activo).
- **Cálculos**: `lib/utils/admin-insights.ts` — funciones puras testeadas
  (`lib/utils/__tests__/admin-insights.test.ts`): `calcularAging` (FIFO, reconcilia saldos legacy
  mandando la diferencia a +90), `calcularVelocidad`/`calcularReposicion`, `calcularRentabilidad`,
  `estimarCosto` (lista mayorista → precio_base → derivado de ganancia_global → desconocido),
  `calcularInactividad`, `resumirVentasDia`.

## Caveats

- Costo de rentabilidad es **estimado**: productos sin costo conocido se marcan con ⚠
  (`costoIncompleto`) y solo cuentan facturación.
- Aging usa `transacciones` con `cuenta != 'mayorista'`; los saldos sin transacciones que los
  respalden se asignan a +90 días.
- Reposición no usa stock mínimo por producto: umbral dinámico = velocidad de venta × días a cubrir.
- WhatsApp asume números argentinos (`wa.me/54...`).
- Verificación de columnas contra BD: `node scripts/diag-admin-insights.js`.
