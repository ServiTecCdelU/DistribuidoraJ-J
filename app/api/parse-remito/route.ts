import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js";

interface ParsedItem {
  rawName: string;
  quantity: number;
  lineIndex: number;
  codigo?: string;
}

// Detecta si un token es un número de cantidad válido
function parseQuantity(token: string): number | null {
  const cleaned = token.replace(/[.,]/g, "").trim();
  const num = parseInt(cleaned, 10);
  if (!isNaN(num) && num > 0 && num < 10000) return num;
  return null;
}

// Intenta parsear líneas de texto en items de remito
// Formato típico remito proveedor: CODIGO  DESCRIPCION  CANTIDAD  PRECIO  TOTAL
function parseRemitoLines(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];

  const linePatterns = lines.map((line) => {
    const tokens = line.split(/\s+/);
    const numbers: { index: number; value: number }[] = [];
    const words: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const q = parseQuantity(tokens[i]);
      if (q !== null && !tokens[i].includes("$")) {
        numbers.push({ index: i, value: q });
      } else if (isNaN(Number(tokens[i].replace(/[.,]/g, "")))) {
        words.push(tokens[i]);
      }
    }

    return { line, tokens, numbers, words };
  });

  // Filtrar líneas que parecen ser de productos (tienen palabras Y números)
  for (const { line, tokens, words, numbers } of linePatterns) {
    if (words.length >= 1 && numbers.length >= 1) {
      // La primera cantidad suele ser la cantidad pedida/entregada
      // Filtrar headers obvios
      const wordsJoined = words.join(" ").toLowerCase();
      if (
        wordsJoined.includes("cantidad") ||
        wordsJoined.includes("descrip") ||
        wordsJoined.includes("precio") ||
        wordsJoined.includes("total") ||
        wordsJoined.includes("subtotal") ||
        wordsJoined.includes("importe") ||
        wordsJoined.includes("unidad") ||
        wordsJoined.includes("codigo") ||
        wordsJoined.includes("cod.") ||
        wordsJoined.includes("remito") ||
        wordsJoined.includes("factura") ||
        wordsJoined.includes("fecha") ||
        wordsJoined.includes("cliente") ||
        wordsJoined.includes("cuit") ||
        wordsJoined.includes("domicilio") ||
        wordsJoined.includes("iva") ||
        words.length === 0
      ) {
        continue;
      }

      const rawName = words.join(" ").trim();
      const quantity = numbers[0].value;

      // Detectar código: primer token numérico (antes de la descripción) que no sea la cantidad
      // Patrón típico remito: CODIGO  DESCRIPCION  CANTIDAD  PRECIO  TOTAL
      let codigo: string | undefined;
      const firstToken = tokens[0]?.trim();
      if (firstToken && /^\d{2,}$/.test(firstToken) && numbers.length >= 2) {
        // El primer token es un número de 2+ dígitos y hay al menos 2 números en la línea
        // → probablemente es el código del producto
        codigo = firstToken;
      }

      if (rawName.length >= 3) {
        items.push({ rawName, quantity, lineIndex: items.length, codigo });
      }
    }
  }

  return items;
}

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

    const pdfData = await pdf(buffer);
    const textLines = pdfData.text
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    const parsedItems = parseRemitoLines(textLines);

    return NextResponse.json({
      success: true,
      items: parsedItems,
      rawLines: textLines.slice(0, 100),
    });
  } catch (error) {
    console.error("Error parsing remito PDF:", error);
    return NextResponse.json(
      { error: "Error al procesar el PDF" },
      { status: 500 }
    );
  }
}
