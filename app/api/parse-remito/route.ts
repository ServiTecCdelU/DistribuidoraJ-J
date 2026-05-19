import { NextRequest, NextResponse } from "next/server";

interface ParsedItem {
  rawName: string;
  quantity: number;
  lineIndex: number;
  codigo?: string;
}

// Parsea líneas del remito del proveedor
// Formato: CODIGO DEP ARTICULO BULTOS CANTIDAD PRECIO SUBTOTAL
function parseRemitoLines(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Regex: línea que empieza con código de 7 dígitos
  const codigoRegex = /^(0\d{6})\s/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(codigoRegex);
    if (!match) continue;

    const codigo = match[1];

    // Extraer el resto después del código
    const rest = line.slice(match[0].length).trim();

    // Buscar depósito (01, 02, etc.) al inicio — puede estar pegado al texto o separado
    const depMatch = rest.match(/^(?:O[lI1]|0[1-9])\s+/i);
    const afterDep = depMatch ? rest.slice(depMatch[0].length).trim() : rest;

    // Buscar patrón: BULTOS(N.00) seguido de CANTIDAD(N.000) en la línea
    // Bultos: 1-2 dígitos con .00 o ,00 (puede tener basura OCR pegada)
    // Cantidad: número entero con .000 o ,000
    const bultoCantRegex = /(\d{1,2})[.,](\d{2})\d?\s*\S{0,3}\s+(\d{1,4})[.,](000\d?|00)\b/;
    const bcMatch = afterDep.match(bultoCantRegex);

    if (!bcMatch) continue;

    const quantity = parseInt(bcMatch[3], 10);
    if (quantity <= 0 || quantity > 5000) continue;

    // El nombre es todo lo anterior al match de bultos/cantidad
    const nameEndIdx = afterDep.indexOf(bcMatch[0]);
    let rawName = afterDep.slice(0, nameEndIdx).trim();

    // Si la siguiente línea no empieza con código, puede ser continuación del nombre
    if (i + 1 < lines.length && !codigoRegex.test(lines[i + 1].trim())) {
      const nextLine = lines[i + 1].trim();
      // Solo agregar si parece texto (no números puros, no headers)
      if (nextLine.length > 1 && !/^\d+[.,]/.test(nextLine) && !nextLine.startsWith("SE RUEGA") && !nextLine.startsWith("Transporte")) {
        rawName += " " + nextLine;
      }
    }

    // Limpiar nombre
    rawName = rawName
      .replace(/[|]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (rawName.length < 3) continue;

    items.push({
      rawName,
      quantity,
      lineIndex: items.length,
      codigo,
    });
  }

  return items;
}

// Extrae imagen JPEG embebida en un PDF (para PDFs escaneados)
function extractJpegFromPdf(buffer: Buffer): Buffer | null {
  let jpegStart = -1;
  for (let i = 0; i < buffer.length - 2; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      jpegStart = i;
      break;
    }
  }
  if (jpegStart === -1) return null;

  let jpegEnd = -1;
  for (let i = buffer.length - 2; i > jpegStart; i--) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
      jpegEnd = i + 2;
      break;
    }
  }
  if (jpegEnd === -1) return null;

  return buffer.slice(jpegStart, jpegEnd);
}

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Si viene texto OCR del cliente, parsear directamente
    const ocrText = formData.get("ocrText") as string | null;
    if (ocrText) {
      const textLines = ocrText
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);
      const parsedItems = parseRemitoLines(textLines);
      return NextResponse.json({
        success: true,
        items: parsedItems,
        rawLines: textLines.slice(0, 100),
      });
    }

    // Si viene un PDF, extraer la imagen para OCR en el cliente
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const jpeg = extractJpegFromPdf(buffer);
    if (!jpeg) {
      return NextResponse.json({
        error: "No se pudo extraer la imagen del PDF. Verificá que sea un remito escaneado.",
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      needsOcr: true,
      imageBase64: jpeg.toString("base64"),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error parsing remito PDF:", msg, error);
    return NextResponse.json(
      { error: `Error al procesar el PDF: ${msg}` },
      { status: 500 },
    );
  }
}
