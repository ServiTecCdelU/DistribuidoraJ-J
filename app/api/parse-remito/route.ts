import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js";
import Tesseract from "tesseract.js";

interface ParsedItem {
  rawName: string;
  quantity: number;
  lineIndex: number;
  codigo?: string;
}

// Extrae imagen JPEG embebida en el PDF (para PDFs escaneados)
function extractJpegFromPdf(buffer: Buffer): Buffer | null {
  // Buscar inicio de JPEG (FF D8 FF)
  let jpegStart = -1;
  for (let i = 0; i < buffer.length - 2; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      jpegStart = i;
      break;
    }
  }
  if (jpegStart === -1) return null;

  // Buscar fin de JPEG (FF D9)
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

// Parsea líneas del remito del proveedor
// Formato: CODIGO DEP ARTICULO BULTOS CANTIDAD PRECIO SUBTOTAL
// El código es de 7 dígitos, la cantidad tiene formato N.000 o N,000
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
    // Regex busca: número decimal + separador + número entero (.000)
    // Bultos (N.00 o N,00 con posible basura OCR) + Cantidad (N.000 o N,000)
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

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      return NextResponse.json({ error: "El archivo debe ser un PDF" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verificar firma PDF
    const header = buffer.slice(0, 5).toString("ascii");
    if (!header.startsWith("%PDF")) {
      return NextResponse.json({ error: "El archivo no es un PDF válido" }, { status: 400 });
    }

    // Intentar extraer texto nativo del PDF
    const pdfData = await pdf(buffer);
    let textLines: string[] = pdfData.text
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    // Si no hay texto, es un PDF escaneado → OCR
    if (textLines.length <= 1) {
      const jpeg = extractJpegFromPdf(buffer);
      if (!jpeg) {
        return NextResponse.json({
          error: "No se pudo extraer la imagen del PDF escaneado",
        }, { status: 400 });
      }

      const { data } = await Tesseract.recognize(jpeg, "spa");
      textLines = data.text
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);
    }

    const parsedItems = parseRemitoLines(textLines);

    return NextResponse.json({
      success: true,
      items: parsedItems,
      rawLines: textLines.slice(0, 100),
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
