// lib/types.ts
export type UserRole = "admin" | "seller" | "customer";
export type EmployeeType = "vendedor" | "transportista" | "ambos";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  sellerId?: string;
  employeeType?: EmployeeType;
  isActive: boolean;
  createdAt: Date;
}

export type InvoiceStatus = "pending" | "generated" | "sent_whatsapp";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  imageUrl: string;
  category: string;
  createdAt: Date;
  // Campos mayorista (almacenados en productos cuando viene de mayorista_productos)
  unidadesPorBulto?: number;   // Lote total (unidades que entran)
  seDivideEn?: number;         // Unidades por porción
  precioVenta?: number;        // Precio calculado con ganancia
  precioBase?: number;         // Costo/precio base del proveedor (productos manuales)
  gananciaGlobal?: number;     // % de ganancia aplicado
  gananciaIndividual?: boolean; // true = precio seteado individualmente
  codigo?: string;
  descuento?: number;          // % MÁXIMO de descuento que el vendedor puede aplicar; 0 = no admite
  regaloMismo?: boolean;       // permite regalar unidades del mismo producto
  regaloMismoMax?: number | null;   // tope de unidades a regalar (mismo); null = libre
  regaloOtroMax?: number | null;    // tope de unidades a regalar (otro); null = libre
  // Promo cruzada: "cada X comprados, regala N de OTRO producto"
  regaloProductoId?: string | null;     // id del producto que se regala
  regaloProductoNombre?: string | null; // nombre del producto regalado (cache para mostrar)
  productoId?: string;         // id en tabla productos (prod_mp_XXX) cuando el id es mayorista (mp_XXX)
}

export interface Client {
  id: string;
  codigo?: string;
  codigoExterno?: string;
  name: string;
  dni?: string;
  cuit: string;
  email: string;
  phone: string;
  address: string;
  addresses?: Array<{ city: string; address: string; lat?: number; lng?: number }>;
  taxCategory:
    | "responsable_inscripto"
    | "monotributo"
    | "consumidor_final"
    | "exento"
    | "no_responsable";
  creditLimit: number;
  currentBalance: number;
  currentBalanceMayorista?: number;
  sellerId?: string;
  sellerName?: string;
  debtClassification?: 'normal' | 'atrasado' | 'moroso' | 'incobrable';
  /** Día de visita/cobro asignado (lunes..domingo) */
  diaCobro?: string;
  /** Fecha de la deuda pendiente más antigua (entró a cuenta corriente). Define la clasificación automática. */
  debtSince?: Date;
  notes?: string;
  createdAt: Date;
}

export type DebtClassification = 'normal' | 'atrasado' | 'moroso' | 'incobrable';

export interface Transaction {
  id: string;
  clientId: string;
  type: "debt" | "payment";
  amount: number;
  description: string;
  date: Date;
  saleId?: string;
  cuenta?: 'minorista' | 'mayorista';
  /** Deudas: saldo pendiente del remito/venta (null = legacy sin backfill) */
  saldo?: number | null;
  /** Pagos: id de la transacción de deuda a la que se imputó */
  debtId?: string;
  /** Pagos: número de recibo emitido */
  reciboNumero?: string;
  /** Pagos: PDF del recibo (base64) */
  reciboPdfBase64?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  itemDiscount?: number; // % elegido por el vendedor (0..product.descuento)
  regalo?: number;       // unidades gratis del mismo producto (manual)
  regaloOtroCantidad?: number; // unidades del producto fijado a regalar (manual)
  cantidadStockLocal?: number;
  cantidadPendienteMayorista?: number;
}

export interface Sale {
  id: string;
  saleNumber?: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  clientCuit?: string;
  clientDni?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientTaxCategory?: Client["taxCategory"];
  sellerId?: string;
  sellerName?: string;
  source?: "direct" | "order";
  items: { productId: string; quantity: number; price: number; name: string; itemDiscount?: number; regalo?: number; esRegalo?: boolean; regaloDe?: string; codigo?: string }[];
  total: number;
  paymentType: "cash" | "credit" | "mixed";
  paymentMethod?: "efectivo" | "transferencia";
  cashAmount?: number;
  creditAmount?: number;
  comprobanteTransferencia?: string;
  status: "completed" | "pending" | "listo" | "pendiente";
  invoiceNumber?: string;
  remitoNumber?: string;
  hojaRutaNumber?: string;
  invoiceEmitted: boolean;
  invoiceStatus?: InvoiceStatus;
  invoicePdfUrl?: string;
  invoiceWhatsappUrl?: string;
  remitoPdfUrl?: string;
  remitoPdfBase64?: string;
  discount?: number;
  discountType?: "percent" | "fixed";
  orderId?: string;
  deliveryMethod?: "pickup" | "delivery";
  deliveryAddress?: string;
  createdAt: Date;
  invoiceDriveUrl?: string;
  invoiceDriveFileId?: string;
  remitoDriveUrl?: string;
  remitoDriveFileId?: string;
  itemsNoEntregados?: Array<{
    name: string;
    price: number;
    quantity: number;
    itemDiscount?: number;
    codigo?: string;
    motivo: 'rotura' | 'faltante' | 'no_quiso';
  }>;
}

export type City = "Concepcion del Uruguay" | "Colon" | "Gualeguaychu" | "San Salvador";

export const CITIES: City[] = ["Concepcion del Uruguay", "Colon", "Gualeguaychu", "San Salvador"];

export interface Order {
  id: string;
  saleId?: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  sellerId?: string;
  sellerName?: string;
  transportistaId?: string;
  transportistaName?: string;
  items: { productId: string; quantity: number; name: string; price: number; itemDiscount?: number; unidadesPorBulto?: number; seDivideEn?: number; precioUnitarioMayorista?: number }[];
  status: "pending" | "preparation" | "delivery" | "completed" | "rechazado";
  city?: City;
  address: string;
  lat?: number;
  lng?: number;
  deliveryMethod?: "pickup" | "delivery";
  remitoNumber?: string;
  remitoPdfBase64?: string;
  stockDescontado?: boolean;
  invoiceNumber?: string;
  invoicePdfBase64?: string;
  checkedItems?: string[];
  held?: boolean;
  notes?: string;
  discount?: number;
  discountType?: "percent" | "fixed";
  createdAt: Date;
  updatedAt: Date;
}

export type OrderStatus = "pending" | "preparation" | "delivery" | "completed" | "rechazado";

export interface Seller {
  id: string;
  name: string;
  email: string;
  phone: string;
  codigoVendedor?: string;
  employeeType: EmployeeType;
  commissionRate: number;
  transportistaCommissionRate?: number;
  isActive: boolean;
  totalSales: number;
  totalCommission: number;
  createdAt: Date;
}

export type AuditAction =
  | "sale_created"
  | "sale_invoiced"
  | "product_created"
  | "product_updated"
  | "product_deleted"
  | "client_created"
  | "client_updated"
  | "client_deleted"
  | "order_created"
  | "order_status_changed"
  | "cash_register_opened"
  | "cash_register_closed"
  | "payment_registered"
  | "price_list_updated";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  userId: string;
  userName: string;
  description: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export type PriceListType = "general" | "mayorista" | "especial";

export interface PriceList {
  id: string;
  name: string;
  type: PriceListType;
  description: string;
  // Multiplier: 1 = same price, 0.9 = 10% off, 1.1 = 10% markup
  multiplier: number;
  isActive: boolean;
  createdAt: Date;
}

export interface MayoristaProducto {
  id: string;
  codigoBarras?: string;
  codigo: string;
  nombre: string;
  precioUnitarioMayorista: number;
  rubro?: string;
  subrubro?: string;
  categoria: string;
  habilitado?: boolean;
  productoId?: string;
  updatedAt: Date;
  // Campos que viven en "productos" — poblados via join en getMayoristaProductos
  precioVenta: number;
  gananciaGlobal?: number;
  gananciaIndividual?: boolean; // true = precio seteado manualmente, saltear en "Aplicar a todos"
  stockLocal: number;
  unidadesPorBulto?: number;   // Lote total (era "lote"), almacenado en productos
  seDivideEn?: number;         // Unidades por porción, almacenado en productos
  descuento?: number;          // % descuento fijado por admin, almacenado en productos
}

export interface MayoristaPrefs {
  showCodigoBarras: boolean;
  showRubro: boolean;
  showSubrubro: boolean;
}

export interface StockMovimiento {
  id: string;
  productoId: string;
  tipo: "apertura_bulto" | "venta" | "ajuste" | "rotura" | "regalo";
  cantidad: number;
  referencia?: string;
  fecha: Date;
}

export interface PedidoMayorista {
  id: string;
  fecha: Date;
  estado: "borrador" | "enviado" | "recibido_parcial" | "cerrado";
  productos: {
    productoId: string;
    nombre: string;
    unidadesPedidas: number;
    unidadesRecibidas: number;
    bultosPedidos: number;
  }[];
}

export interface SellerCommission {
  id: string;
  sellerId: string;
  saleId: string;
  saleNumber?: string;
  clientName?: string;
  saleTotal: number;
  commissionRate: number;
  commissionAmount: number;
  isPaid: boolean;
  paidAt?: Date;
  createdAt: Date;
}

export type ComprobanteStatus = "pending" | "approved" | "rejected";

export interface ComprobantePago {
  id: string;
  clientId: string;
  clientName?: string;
  sellerId: string;
  sellerName?: string;
  amount: number;
  notes?: string;
  fileUrl: string;
  fileName?: string;
  status: ComprobanteStatus;
  rejectionReason?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  transactionId?: string;
  createdAt: Date;
}
