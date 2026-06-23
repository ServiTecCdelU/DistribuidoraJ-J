import type { Client, Product, Sale, Seller, SellerCommission, Transaction, CartItem, Order, OrderStatus } from './types'
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProducts,
  getProductsByIds,
  getProductosConOfertas,
  getProductsPaginated,
  searchProducts,
  updateProduct,
  getProductStats,
  getProductCategories,
} from '@/services/products-service'
import type { ProductSearchParams, ProductSearchResult } from '@/services/products-service'
import {
  createClient,
  deleteClient,
  getClientById,
  getClientTransactions,
  getClients,
  getClientsPaginated,
  updateClient,
} from '@/services/clients-service'
import {
  getSales,
  getSalesPaginated,
  getSalesByDateRange,
  getSalesBySeller,
  getSalesByClient,
  getSaleById,
  processSale,
  saveBoletaToSale,
  saveRemitoToSale,
  updateSaleInvoice,
  updateSaleRemito,
} from '@/services/sales-service'
import { registerCashPayment, registerMayoristaPayment, saveReciboPdf, ensureReciboNumero, findReciboByNumero } from '@/services/payments-service'
import {
  getTransaccionesMayorista,
  getBalanceMayorista,
  addDeudaMayorista,
  addPagoMayorista,
  pagarBoleta,
} from '@/services/mayorista-cuenta-service'
import {
  createSeller,
  deleteSeller,
  getAllCommissions,
  getSellerById,
  getSellerCommissions,
  getSellers,
  updateSeller,
  resetCommissions,
  getPagosComisiones,
} from '@/services/sellers-service'
import type { PagoComision } from '@/services/sellers-service'
import { createInvoice, createRemito } from '@/services/invoice-service'
import {
  getOrders,
  getActiveOrders,
  getRemitoPdf,
  getOrdersPaginated,
  getOrdersByTransportista,
  getOrdersBySeller,
  updateOrderStatus,
  updateOrderItems,
  completeOrder,
  rejectOrder,
  createOrder,
  assignTransportista,
  removeTransportista,
  saveRemitoToOrder,
  markOrderStockDescontado,
  saveBoletaToOrder,
  updateCheckedItems,
  deleteOrder,
  deleteRemitoFromOrder,
  setClientOrdersHeld,
  setOrderHeld,
} from '@/services/orders-service'
import {
  getDashboardStats,
  getSalesLastDays,
  getLowStockProducts,
  getDebtors,
  getSalesByHourToday,
  getSalesLastMonths,
  getTopProducts,
  getProductDistribution,
  getDashboardData,
  getClientesActividad,
} from '@/services/dashboard-service'
import { logAudit, getAuditLog } from '@/services/audit-service'
import {
  getPriceLists,
  createPriceList,
  updatePriceList,
  deletePriceList,
} from '@/services/price-list-service'
import {
  getTransferConfig,
  saveTransferConfig,
} from '@/services/transfer-config-service'
import type { TransferConfig } from '@/services/transfer-config-service'
import { assignHojaRuta } from '@/services/hoja-ruta-service'
import {
  getClientsBySeller,
  getDebtClients,
  uploadComprobante,
  getComprobantes,
  getComprobantesBySeller,
  approveComprobante,
  rejectComprobante,
} from '@/services/cobranzas-service'
import {
  registrarFaltantes,
  quitarFaltantes,
  eliminarFaltante,
  getFaltantesByCliente,
} from '@/services/faltantes-service'
import type { Faltante } from '@/services/faltantes-service'
import {
  registrarDevolucion,
  saveReciboToDevolucion,
  getDevolucionesBySale,
  getDevolucionesBySeller,
  getDevolucionesByClient,
} from '@/services/devoluciones-service'
import type { Devolucion, DevolucionItem } from '@/services/devoluciones-service'
import {
  registrarDescuentoVenta,
  getDescuentosBySale,
  convertirPagoVenta,
} from '@/services/ajustes-venta-service'
import type { DescuentoVenta, ConversionPago, DireccionConversion } from '@/services/ajustes-venta-service'

export const productsApi = {
  async getAll(): Promise<Product[]> {
    return getProducts()
  },
  async getByIds(ids: string[]): Promise<Product[]> {
    return getProductsByIds(ids)
  },
  async getConOfertas(): Promise<Product[]> {
    return getProductosConOfertas()
  },
  async search(params: ProductSearchParams): Promise<ProductSearchResult> {
    return searchProducts(params)
  },
  async getPaginated(pageSize?: number, lastDoc?: any) {
    return getProductsPaginated(pageSize, lastDoc)
  },
  async getById(id: string): Promise<Product | undefined> {
    return getProductById(id)
  },
  async getStats() {
    return getProductStats()
  },
  async getCategories() {
    return getProductCategories()
  },
  async create(product: Omit<Product, 'id' | 'createdAt'>): Promise<Product> {
    return createProduct(product)
  },
  async update(id: string, updates: Partial<Product>): Promise<Product> {
    return updateProduct(id, updates)
  },
  async delete(id: string): Promise<void> {
    return deleteProduct(id)
  },
}

export const clientsApi = {
  async getAll(): Promise<Client[]> {
    return getClients()
  },
  async getPaginated(pageSize?: number, lastDoc?: any) {
    return getClientsPaginated(pageSize, lastDoc)
  },
  async getById(id: string): Promise<Client | undefined> {
    return getClientById(id)
  },
  async create(client: Omit<Client, 'id' | 'createdAt' | 'currentBalance'>): Promise<Client> {
    return createClient(client)
  },
  async update(id: string, updates: Partial<Client>): Promise<Client> {
    return updateClient(id, updates)
  },
  async delete(id: string): Promise<void> {
    return deleteClient(id)
  },
  async getTransactions(clientId: string): Promise<Transaction[]> {
    return getClientTransactions(clientId)
  },
}

export const salesApi = {
  async getAll(): Promise<Sale[]> {
    return getSales()
  },
  async getPaginated(pageSize?: number, lastDoc?: any) {
    return getSalesPaginated(pageSize, lastDoc)
  },
  async getByDateRange(startDate: Date, endDate: Date) {
    return getSalesByDateRange(startDate, endDate)
  },
  async getById(id: string): Promise<Sale | null> {
    return getSaleById(id)
  },
  async getBySeller(sellerId: string): Promise<Sale[]> {
    return getSalesBySeller(sellerId)
  },
  async getByClient(clientId: string): Promise<Sale[]> {
    return getSalesByClient(clientId)
  },
  async processSale(data: {
    clientId?: string
    clientName?: string
    clientPhone?: string
    sellerId?: string
    sellerName?: string
    items: CartItem[]
    paymentType: 'cash' | 'credit' | 'mixed'
    paymentMethod?: 'efectivo' | 'transferencia'
    cashAmount?: number
    creditAmount?: number
    source?: 'direct' | 'order'
    createOrder: boolean
    orderId?: string
    deliveryMethod: 'pickup' | 'delivery'
    deliveryAddress: string
    skipStock?: boolean
  }): Promise<Sale> {
    return processSale(data)
  },
  async emitInvoice(saleId: string, client?: { name?: string; phone?: string; email?: string }) {
    const invoice = await createInvoice({ saleId, client })
    await updateSaleInvoice(saleId, {
      invoiceNumber: invoice.invoiceNumber,
      invoicePdfUrl: invoice.pdfUrl,
      invoiceWhatsappUrl: invoice.whatsappUrl,
      afipData: invoice.afipData,
    })
    return invoice
  },
  async saveBoletaToSale(saleId: string, invoiceNumber: string, invoicePdfBase64: string, extra?: { afipData?: any }): Promise<void> {
    return saveBoletaToSale(saleId, invoiceNumber, invoicePdfBase64, extra)
  },
  async saveRemitoToSale(saleId: string, remitoNumber: string, remitoPdfBase64: string): Promise<void> {
    return saveRemitoToSale(saleId, remitoNumber, remitoPdfBase64)
  },
}

export const paymentsApi = {
  async registerCashPayment(data: {
    clientId: string
    amount: number
    description?: string
    debtTxId?: string
  }): Promise<Transaction> {
    return registerCashPayment(data)
  },
  async registerMayoristaPayment(data: {
    clientId: string
    amount: number
    description?: string
    debtTxId?: string
  }): Promise<Transaction> {
    return registerMayoristaPayment(data)
  },
  saveReciboPdf,
  ensureReciboNumero,
  findReciboByNumero,
}

export const mayoristaCuentaApi = {
  getTransacciones: getTransaccionesMayorista,
  getBalance: getBalanceMayorista,
  addDeuda: addDeudaMayorista,
  addPago: addPagoMayorista,
  pagarBoleta,
}

export const faltantesApi = {
  registrar: registrarFaltantes,
  quitar: quitarFaltantes,
  eliminar: eliminarFaltante,
  getByCliente: getFaltantesByCliente,
}

export type { Faltante }

export const devolucionesApi = {
  registrar: registrarDevolucion,
  saveRecibo: saveReciboToDevolucion,
  getBySale: getDevolucionesBySale,
  getBySeller: getDevolucionesBySeller,
  getByClient: getDevolucionesByClient,
}

export type { Devolucion, DevolucionItem }

export const ajustesVentaApi = {
  registrarDescuento: registrarDescuentoVenta,
  getDescuentosBySale,
  convertirPago: convertirPagoVenta,
}

export type { DescuentoVenta, ConversionPago, DireccionConversion }

export const invoiceApi = {
  async createInvoice(saleId: string, client?: { name?: string; phone?: string; email?: string }) {
    return salesApi.emitInvoice(saleId, client)
  },
}

export const remitoApi = {
  async createRemito(saleId: string) {
    const remito = await createRemito({ saleId })
    await updateSaleRemito(saleId, {
      remitoNumber: remito.remitoNumber,
      remitoPdfUrl: remito.pdfUrl,
    })
    return remito
  },
}

export const ordersApi = {
  async getAll(): Promise<Order[]> {
    return getOrders()
  },
  /** Pedidos activos sin PDFs base64 (liviano, para la página Pedidos) */
  async getActive(): Promise<Order[]> {
    return getActiveOrders()
  },
  /** PDF del remito on-demand */
  async getRemitoPdf(orderId: string): Promise<string | undefined> {
    return getRemitoPdf(orderId)
  },
  async getPaginated(pageSize?: number, lastDoc?: any) {
    return getOrdersPaginated(pageSize, lastDoc)
  },
  async getByTransportista(transportistaId: string): Promise<Order[]> {
    return getOrdersByTransportista(transportistaId)
  },
  async getBySeller(sellerId: string): Promise<Order[]> {
    return getOrdersBySeller(sellerId)
  },
  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return updateOrderStatus(id, status)
  },
  async updateItems(id: string, items: Order['items']): Promise<Order> {
    return updateOrderItems(id, items)
  },
  async completeOrder(id: string, saleId: string): Promise<Order> {
    return completeOrder(id, saleId)
  },
  async rejectOrder(id: string): Promise<Order> {
    return rejectOrder(id)
  },
  async assignTransportista(id: string, transportistaId: string, transportistaName: string): Promise<Order> {
    return assignTransportista(id, transportistaId, transportistaName)
  },
  async removeTransportista(id: string): Promise<Order> {
    return removeTransportista(id)
  },
  async saveRemitoToOrder(id: string, remitoNumber: string, remitoPdfBase64: string): Promise<Order> {
    return saveRemitoToOrder(id, remitoNumber, remitoPdfBase64)
  },
  async markStockDescontado(id: string): Promise<void> {
    return markOrderStockDescontado(id)
  },
  async saveBoletaToOrder(id: string, invoiceNumber: string, invoicePdfBase64: string): Promise<Order> {
    return saveBoletaToOrder(id, invoiceNumber, invoicePdfBase64)
  },
  async updateCheckedItems(id: string, checkedItems: string[]): Promise<void> {
    return updateCheckedItems(id, checkedItems)
  },
  async deleteOrder(id: string): Promise<void> {
    return deleteOrder(id)
  },
  async deleteRemito(id: string): Promise<Order> {
    return deleteRemitoFromOrder(id)
  },
  async setClientOrdersHeld(clientName: string, held: boolean): Promise<void> {
    return setClientOrdersHeld(clientName, held)
  },
  async setOrderHeld(id: string, held: boolean): Promise<void> {
    return setOrderHeld(id, held)
  },
  async createOrder(data: {
    clientId: string
    clientName: string
    sellerId?: string
    sellerName?: string
    items: CartItem[]
    address: string
    lat?: number
    lng?: number
    status: OrderStatus
    source?: string
    notes?: string
  }): Promise<Order> {
    return createOrder(data)
  },
}

export const sellersApi = {
  async getAll(): Promise<Seller[]> {
    return getSellers()
  },
  async getById(id: string): Promise<Seller | undefined> {
    return getSellerById(id)
  },
  async create(seller: Omit<Seller, 'id' | 'createdAt' | 'totalSales' | 'totalCommission'>): Promise<Seller> {
    return createSeller(seller)
  },
  async update(id: string, updates: Partial<Seller>): Promise<Seller> {
    return updateSeller(id, updates)
  },
  async delete(id: string): Promise<void> {
    return deleteSeller(id)
  },
  async getCommissions(sellerId: string): Promise<SellerCommission[]> {
    return getSellerCommissions(sellerId)
  },
  async getAllCommissions(): Promise<SellerCommission[]> {
    return getAllCommissions()
  },
  async resetCommissions(sellerId: string, sellerName: string, nota?: string): Promise<PagoComision> {
    return resetCommissions(sellerId, sellerName, nota)
  },
  async getPagosComisiones(sellerId: string): Promise<PagoComision[]> {
    return getPagosComisiones(sellerId)
  },
}

export const dashboardApi = {
  async getStats() {
    return getDashboardStats()
  },
  async getSalesLastDays(days = 7) {
    return getSalesLastDays(days)
  },
  async getLowStockProducts() {
    return getLowStockProducts()
  },
  async getDebtors() {
    return getDebtors()
  },
  async getSalesByHourToday() {
    return getSalesByHourToday()
  },
  async getSalesLastMonths(months = 6) {
    return getSalesLastMonths(months)
  },
  async getTopProducts(limit = 5) {
    return getTopProducts(limit)
  },
  async getProductDistribution() {
    return getProductDistribution()
  },
  async getDashboardData() {
    return getDashboardData()
  },
  async getClientesActividad(dias = 30) {
    return getClientesActividad(dias)
  },
}

export const auditApi = {
  log: logAudit,
  getAll: getAuditLog,
}

export const priceListApi = {
  getAll: getPriceLists,
  create: createPriceList,
  update: updatePriceList,
  delete: deletePriceList,
}

export const transferApi = {
  getConfig: getTransferConfig,
  saveConfig: saveTransferConfig,
}
export type { TransferConfig }

export const hojaRutaApi = {
  assign: assignHojaRuta,
}

export const cobranzasApi = {
  async getClientsBySeller(sellerId: string) {
    return getClientsBySeller(sellerId)
  },
  async getDebtClients(sellerId?: string) {
    return getDebtClients(sellerId)
  },
  async uploadComprobante(data: {
    clientId: string
    sellerId: string
    amount: number
    notes?: string
    file: File
  }) {
    return uploadComprobante(data)
  },
  async getComprobantes(filters?: { status?: string; sellerId?: string }) {
    return getComprobantes(filters)
  },
  async getComprobantesBySeller(sellerId: string) {
    return getComprobantesBySeller(sellerId)
  },
  async approveComprobante(id: string, reviewedBy: string) {
    return approveComprobante(id, reviewedBy)
  },
  async rejectComprobante(id: string, reason: string, reviewedBy: string) {
    return rejectComprobante(id, reason, reviewedBy)
  },
}

import {
  getGastosFijos,
  createGastoFijo,
  updateGastoFijo,
  deleteGastoFijo,
  getGastosVariables,
  createGastoVariable,
  updateGastoVariable,
  deleteGastoVariable,
} from '@/services/gastos-service'
import type { GastoFijo, GastoVariable } from '@/services/gastos-service'

export const gastosApi = {
  getFijos: getGastosFijos,
  createFijo: createGastoFijo,
  updateFijo: updateGastoFijo,
  deleteFijo: deleteGastoFijo,
  getVariables: getGastosVariables,
  createVariable: createGastoVariable,
  updateVariable: updateGastoVariable,
  deleteVariable: deleteGastoVariable,
}
export type { GastoFijo, GastoVariable }
