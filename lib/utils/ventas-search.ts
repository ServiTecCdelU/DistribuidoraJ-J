// Búsqueda de ventas: por palabras (en cualquier orden), sin distinguir mayúsculas
// ni tildes del lado del cliente. Del lado del servidor arma el filtro `or` de PostgREST.

// Minúsculas y sin tildes: "Concepción" → "concepcion".
export function normalizarBusqueda(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Divide el texto en palabras. Quita los caracteres que rompen la sintaxis de
// filtros de PostgREST (comas, paréntesis, comillas, comodines).
export function tokenizarBusqueda(texto: string): string[] {
  return texto
    .replace(/[,()*%:"'\\]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// Filtro `or` para PostgREST: la venta coincide si CADA palabra aparece en alguna
// de las columnas, o si contiene alguno de los productos encontrados por nombre.
export function buildFiltroBusqueda(tokens: string[], cols: string[], productIds: string[] = []): string {
  const porPalabra = tokens.map((t) => `or(${cols.map((c) => `${c}.ilike.%${t}%`).join(",")})`);
  const textual = porPalabra.length === 1 ? porPalabra[0].slice(3, -1) : `and(${porPalabra.join(",")})`;
  const productos = productIds.map((id) => `items.cs.[{"productId":"${id}"}]`);
  return [textual, ...productos].join(",");
}

// IDs con los que un producto puede figurar en `items[].productId`
// (`prod_mp_123` en productos, `mp_123` en mayorista).
export function variantesProductId(id: string): string[] {
  return id.startsWith("prod_") ? [id, id.slice(5)] : [id];
}

interface VentaBuscable {
  id: string;
  clientName?: string;
  sellerName?: string;
  clientAddress?: string;
  deliveryAddress?: string;
  clientCuit?: string;
  clientPhone?: string;
  invoiceNumber?: string;
  remitoNumber?: string;
  hojaRutaNumber?: string;
  saleNumber?: number | string;
  items?: { name?: string; codigo?: string }[];
}

// Todas las palabras tienen que aparecer en algún dato de la venta o en un producto.
export function ventaCoincide(venta: VentaBuscable, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const datos = normalizarBusqueda(
    [
      venta.clientName, venta.sellerName, venta.clientAddress, venta.deliveryAddress,
      venta.clientCuit, venta.clientPhone, venta.id, venta.invoiceNumber,
      venta.remitoNumber, venta.hojaRutaNumber, venta.saleNumber,
    ].filter(Boolean).join(" "),
  );
  const productos = (venta.items || []).map((it) => normalizarBusqueda(`${it.name || ""} ${it.codigo || ""}`));
  return tokens
    .map(normalizarBusqueda)
    .every((w) => datos.includes(w) || productos.some((p) => p.includes(w)));
}
