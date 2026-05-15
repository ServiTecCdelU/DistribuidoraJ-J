/**
 * Script de migración: Firebase Firestore → Supabase PostgreSQL
 *
 * Ejecutar con: npx tsx scripts/migrate-to-supabase.ts
 */

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

// --- Firebase Admin ---
function getAdminApp() {
  const apps = getApps();
  if (apps.length) return apps[0];
  return initializeApp({
    credential: cert("./distribuidorap-patricia-firebase-adminsdk-fbsvc-db2a3e9e60.json"),
  });
}
const db = getFirestore(getAdminApp());

// --- Supabase Admin ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// --- Helpers ---
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function safeNumeric(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toISO(val: any): string | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val.toDate) return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  if (typeof val === "number") return new Date(val).toISOString();
  return null;
}

async function readCollection(name: string, retries = 8): Promise<{ id: string; data: any }[]> {
  const results: { id: string; data: any }[] = [];
  const pageSize = 100;
  let lastDoc: any = null;

  while (true) {
    let success = false;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        let query = db.collection(name).orderBy("__name__").limit(pageSize);
        if (lastDoc) query = query.startAfter(lastDoc);
        const snap = await query.get();
        if (snap.empty) { success = true; break; }
        snap.docs.forEach((d) => results.push({ id: d.id, data: d.data() }));
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < pageSize) { success = true; break; }
        success = true;
        console.log(`    ... ${results.length} docs leidos`);
        await sleep(3000);
        break;
      } catch (err: any) {
        if (err.code === 8 || err.details?.includes("Quota")) {
          const wait = Math.pow(2, attempt + 1) * 10000;
          console.log(`  ⏳ ${name}: rate limit, esperando ${wait / 1000}s (intento ${attempt + 1}/${retries})...`);
          await sleep(wait);
        } else {
          throw err;
        }
      }
    }
    if (!success || !lastDoc || (results.length > 0 && results.length % pageSize !== 0)) break;
  }

  console.log(`  📖 ${name}: ${results.length} docs`);
  return results;
}

async function upsertBatch(table: string, rows: any[], batchSize = 500) {
  if (rows.length === 0) {
    console.log(`  ⏭️  ${table}: 0 filas, saltando`);
    return;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      console.error(`  ❌ ${table} batch ${i}-${i + batch.length}:`, error.message);
      // Intentar uno por uno para identificar el problemático
      for (const row of batch) {
        const { error: e2 } = await supabase.from(table).upsert(row, { onConflict: "id" });
        if (e2) console.error(`    ❌ ${table} id=${row.id}:`, e2.message);
        else inserted++;
      }
    } else {
      inserted += batch.length;
    }
  }
  console.log(`  ✅ ${table}: ${inserted}/${rows.length} filas`);
}

// --- Migraciones por tabla ---

async function migrateProductos() {
  console.log("\n🔄 Migrando productos...");
  const docs = await readCollection("productos");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    name: d.name || d.nombre || "",
    description: d.description || d.descripcion || null,
    category: d.category || d.categoria || null,
    brand: d.brand || d.marca || null,
    code: d.code || null,
    price: safeNumeric(d.price) || 0,
    selling_price: safeNumeric(d.sellingPrice) || safeNumeric(d.precioVenta) || 0,
    stock: safeNumeric(d.stock) || 0,
    min_stock: safeNumeric(d.minStock) || 0,
    image_url: d.imageUrl || null,
    disabled: d.disabled || false,
    unidades_por_bulto: safeNumeric(d.unidadesPorBulto) || null,
    se_divide_en: d.seDivideEn || null,
    precio_venta: safeNumeric(d.precioVenta) || null,
    ganancia_global: safeNumeric(d.gananciaGlobal) || null,
    ganancia_individual: safeNumeric(d.gananciaIndividual) || null,
    codigo: d.codigo || null,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("productos", rows);
}

async function migrateMayoristaProductos() {
  console.log("\n🔄 Migrando mayorista_productos...");
  const docs = await readCollection("mayorista_productos");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    codigo: d.codigo || d.codigoBarras || null,
    descripcion: d.descripcion || d.nombre || null,
    precio_lista: d.precioUnitarioMayorista || d.precioLista || null,
    habilitado: d.habilitado || false,
    producto_id: d.productoId || null,
    stock_local: d.stockLocal || 0,
    stock_transito: d.stockTransito || 0,
    created_at: toISO(d.createdAt) || toISO(d.updatedAt) || new Date().toISOString(),
  }));
  await upsertBatch("mayorista_productos", rows);
}

async function migrateClientes() {
  console.log("\n🔄 Migrando clientes...");
  const docs = await readCollection("clientes");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    name: d.name || d.nombre || "",
    email: d.email || null,
    phone: d.phone || d.telefono || null,
    dni: d.dni || null,
    cuit: d.cuit || null,
    tax_category: d.taxCategory || d.condicionFiscal || null,
    credit_limit: d.creditLimit || 0,
    current_balance: d.currentBalance || 0,
    addresses: d.addresses || d.address ? (Array.isArray(d.addresses) ? d.addresses : []) : [],
    notes: d.notes || null,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("clientes", rows);
}

async function migrateVendedores() {
  console.log("\n🔄 Migrando vendedores...");
  const docs = await readCollection("vendedores");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    name: d.name || d.nombre || "",
    email: d.email || null,
    phone: d.phone || d.telefono || null,
    employee_type: d.employeeType || null,
    commission_rate: d.commissionRate || 10,
    transportista_commission_rate: d.transportistaCommissionRate || 10,
    total_sales: d.totalSales || 0,
    total_commission: d.totalCommission || 0,
    is_active: d.isActive !== undefined ? d.isActive : true,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("vendedores", rows);
}

async function migrateUsuarios() {
  console.log("\n🔄 Migrando usuarios...");
  const docs = await readCollection("usuarios");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    auth_uid: null, // Se actualiza al primer login en Supabase
    email: d.email || null,
    name: d.name || d.nombre || null,
    role: d.role || "customer",
    seller_id: d.sellerId || null,
    employee_type: d.employeeType || null,
    is_active: d.isActive !== undefined ? d.isActive : true,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("usuarios", rows);
}

async function migrateVentas() {
  console.log("\n🔄 Migrando ventas...");
  const docs = await readCollection("ventas");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    sale_number: d.saleNumber || null,
    client_id: d.clientId || null,
    client_name: d.clientName || null,
    client_phone: d.clientPhone || null,
    seller_id: d.sellerId || null,
    seller_name: d.sellerName || null,
    items: d.items || [],
    subtotal: d.subtotal || 0,
    tax: d.tax || 0,
    total: d.total || 0,
    payment_type: d.paymentType || null,
    cash_amount: d.cashAmount || null,
    credit_amount: d.creditAmount || null,
    status: d.status || "completed",
    source: d.source || "direct",
    order_id: d.orderId || null,
    delivery_method: d.deliveryMethod || "pickup",
    delivery_address: d.deliveryAddress || null,
    invoice_emitted: d.invoiceEmitted || false,
    invoice_number: d.invoiceNumber || null,
    invoice_status: d.invoiceStatus || null,
    invoice_pdf_base64: d.invoicePdfBase64 || null,
    invoice_pdf_url: d.invoicePdfUrl || null,
    invoice_whatsapp_url: d.invoiceWhatsappUrl || null,
    afip_data: d.afipData || null,
    remito_number: d.remitoNumber || null,
    remito_pdf_base64: d.remitoPdfBase64 || null,
    remito_pdf_url: d.remitoPdfUrl || null,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("ventas", rows);
}

async function migrateTransacciones() {
  console.log("\n🔄 Migrando transacciones...");
  const docs = await readCollection("transacciones");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    client_id: d.clientId || null,
    type: d.type || null,
    amount: d.amount || 0,
    description: d.description || null,
    sale_id: d.saleId || null,
    date: toISO(d.date) || toISO(d.createdAt) || new Date().toISOString(),
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("transacciones", rows);
}

async function migratePedidos() {
  console.log("\n🔄 Migrando pedidos...");
  const docs = await readCollection("pedidos");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    client_id: d.clientId || null,
    client_name: d.clientName || null,
    seller_id: d.sellerId || null,
    seller_name: d.sellerName || null,
    transportista_id: d.transportistaId || null,
    transportista_name: d.transportistaName || null,
    items: d.items || [],
    checked_items: d.checkedItems || [],
    status: d.status || "pending",
    address: d.address || null,
    lat: d.lat || null,
    lng: d.lng || null,
    source: d.source || null,
    sale_id: d.saleId || null,
    invoice_number: d.invoiceNumber || null,
    invoice_pdf_base64: d.invoicePdfBase64 || null,
    remito_number: d.remitoNumber || null,
    remito_pdf_base64: d.remitoPdfBase64 || null,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("pedidos", rows);
}

async function migrateComisiones() {
  console.log("\n🔄 Migrando comisiones...");
  const docs = await readCollection("comisiones");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    seller_id: d.sellerId || null,
    seller_name: d.sellerName || null,
    sale_id: d.saleId || null,
    sale_total: d.saleTotal || 0,
    commission_rate: d.commissionRate || 0.1,
    commission_amount: d.commissionAmount || 0,
    is_paid: d.isPaid || false,
    paid_at: toISO(d.paidAt) || null,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("comisiones", rows);
}

async function migrateCaja() {
  console.log("\n🔄 Migrando caja...");
  const docs = await readCollection("caja");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    date: d.date || null,
    type: d.type || null,
    amount: d.amount || 0,
    description: d.description || null,
    user_id: d.userId || null,
    user_name: d.userName || null,
    sale_id: d.saleId || null,
    payment_method: d.paymentMethod || null,
    metadata: d.metadata || null,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("caja", rows);
}

async function migrateAuditoria() {
  console.log("\n🔄 Migrando auditoria...");
  const docs = await readCollection("auditoria");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    action: d.action || "",
    entity_type: d.entityType || null,
    entity_id: d.entityId || null,
    user_id: d.userId || null,
    user_email: d.userEmail || d.userName || null,
    details: d.metadata || d.details || null,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("auditoria", rows);
}

async function migrateListasPrecios() {
  console.log("\n🔄 Migrando listas_precios...");
  const docs = await readCollection("listas_precios");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    name: d.name || "",
    description: d.description || null,
    multiplier: d.multiplier || 1.0,
    is_active: d.isActive !== undefined ? d.isActive : true,
    created_at: toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("listas_precios", rows);
}

async function migrateStockMovimientos() {
  console.log("\n🔄 Migrando stock_movimientos...");
  const docs = await readCollection("stock_movimientos");
  const rows = docs.map(({ id, data: d }) => ({
    mayorista_producto_id: d.productoId || null,
    tipo: d.tipo || "",
    cantidad: d.cantidad || 0,
    stock_anterior: d.stockAnterior || null,
    stock_posterior: d.stockPosterior || null,
    motivo: d.motivo || d.referencia || null,
    venta_id: d.ventaId || null,
    usuario_id: d.usuarioId || null,
    created_at: toISO(d.fecha) || toISO(d.createdAt) || new Date().toISOString(),
  }));
  // stock_movimientos usa SERIAL id, no TEXT id — insertar sin id
  if (rows.length === 0) {
    console.log("  ⏭️  stock_movimientos: 0 filas, saltando");
    return;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from("stock_movimientos").insert(batch);
    if (error) {
      console.error(`  ❌ stock_movimientos batch:`, error.message);
    } else {
      inserted += batch.length;
    }
  }
  console.log(`  ✅ stock_movimientos: ${inserted}/${rows.length} filas`);
}

async function migratePedidosMayorista() {
  console.log("\n🔄 Migrando pedidos_mayorista...");
  const docs = await readCollection("pedidos_mayorista");
  const rows = docs.map(({ id, data: d }) => ({
    id,
    estado: d.estado || "borrador",
    productos: d.productos || [],
    notas: d.notas || null,
    created_at: toISO(d.fecha) || toISO(d.createdAt) || new Date().toISOString(),
  }));
  await upsertBatch("pedidos_mayorista", rows);
}

async function migrateConfiguracion() {
  console.log("\n🔄 Migrando configuracion...");
  const docs = await readCollection("configuracion");
  const rows = docs.map(({ id, data: d }) => ({
    key: id,
    value: d,
  }));
  if (rows.length === 0) {
    console.log("  ⏭️  configuracion: 0 filas, saltando");
    return;
  }
  const { error } = await supabase
    .from("configuracion")
    .upsert(rows, { onConflict: "key" });
  if (error) console.error("  ❌ configuracion:", error.message);
  else console.log(`  ✅ configuracion: ${rows.length} filas`);
}

// --- Validación ---
async function validate() {
  console.log("\n📊 Validación de conteos:");
  const tables = [
    "productos", "mayorista_productos", "clientes", "vendedores",
    "usuarios", "ventas", "transacciones", "pedidos", "comisiones",
    "caja", "auditoria", "listas_precios", "stock_movimientos",
    "pedidos_mayorista", "configuracion",
  ];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
    if (error) console.log(`  ❌ ${t}: ${error.message}`);
    else console.log(`  ${t}: ${count} filas`);
  }
}

// --- Main ---
async function main() {
  console.log("🚀 Iniciando migración Firebase → Supabase\n");

  // Orden por dependencias FK (con delay para evitar rate limit)
  // productos ya migrado (1836 filas)
  // mayorista_productos se recarga desde Excel
  const migrations = [
    // migrateProductos, // YA MIGRADO
    // migrateMayoristaProductos, // SE RECARGA DESDE EXCEL
    // migrateClientes, // YA MIGRADO (3)
    // migrateVendedores, // YA MIGRADO (1)
    // migrateUsuarios, // YA MIGRADO (3)
    // migrateVentas, // 0 docs en Firestore
    // migrateTransacciones, // 0 docs en Firestore
    migratePedidos, // 9 docs
    // migrateComisiones, // 0 docs en Firestore
    migrateCaja, // 1 doc
    migrateAuditoria, // 1 doc
    // migrateListasPrecios, // 0 docs en Firestore
    // migrateStockMovimientos, // 0 docs en Firestore
    migratePedidosMayorista, // 1 doc
    migrateConfiguracion, // 2 docs
  ];

  for (const migrate of migrations) {
    await migrate();
    await sleep(2000);
  }

  await validate();

  console.log("\n✅ Migración completada");
}

main().catch((err) => {
  console.error("💥 Error fatal:", err);
  process.exit(1);
});
