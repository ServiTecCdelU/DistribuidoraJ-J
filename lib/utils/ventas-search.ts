// Búsqueda de ventas: por palabras (en cualquier orden), sin distinguir mayúsculas
// ni tildes. En el servidor se filtra por la columna generada `busqueda` (ventas/pedidos).

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
