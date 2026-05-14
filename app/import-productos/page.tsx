"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface ParsedProduct {
  codigo: string;
  nombre: string;
  categoria: string;
}

function parseProductText(text: string): ParsedProduct[] {
  const lines = text.split("\n");
  const products: ParsedProduct[] = [];
  let currentCategory = "Sin categoría";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect category headers (lines that are all uppercase or start with "Grupo:" or "Rubro:")
    if (
      trimmed.startsWith("Grupo:") ||
      trimmed.startsWith("Rubro:") ||
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !/^\d/.test(trimmed))
    ) {
      const cat = trimmed.replace(/^(Grupo:|Rubro:)\s*/i, "").trim();
      if (cat) currentCategory = cat;
      continue;
    }

    // Try to match product lines: "CODIGO DESCRIPCION" or "CODIGO    DESCRIPCION    PRECIO    PACK"
    // The PDF format is: Codigo | Descripcion | Lista 2 | Un. Pack
    // Typical line: "1001    ALFAJOR TRIPLE CHOCOLATE    150.00    12"
    const match = trimmed.match(/^(\d{1,10})\s+(.+?)(?:\s+[\d.,]+\s*(?:\d+)?)?$/);
    if (match) {
      products.push({
        codigo: match[1],
        nombre: match[2].trim(),
        categoria: currentCategory,
      });
    }
  }

  return products;
}

export default function ImportProductosPage() {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(0);

  const handleParse = () => {
    const products = parseProductText(text);
    setParsed(products);
    if (products.length === 0) {
      toast.error("No se encontraron productos. Revisá el formato del texto.");
    } else {
      toast.success(`${products.length} productos encontrados`);
    }
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/import-productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productos: parsed }),
      });

      const data = await res.json();
      if (res.ok) {
        setImported(data.imported);
        toast.success(`${data.imported} productos importados correctamente`);
        setParsed([]);
        setText("");
      } else {
        toast.error(data.error || "Error al importar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Importar Productos desde Lista</h1>
      <p className="text-muted-foreground">
        Pegá el contenido del PDF de productos. El sistema detecta líneas con
        formato: <code>CODIGO DESCRIPCION [PRECIO] [PACK]</code>
      </p>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pegá acá el texto copiado del PDF..."
        rows={15}
        className="font-mono text-sm"
      />

      <div className="flex gap-3">
        <Button onClick={handleParse} disabled={!text.trim()}>
          Parsear texto
        </Button>
        {parsed.length > 0 && (
          <Button onClick={handleImport} disabled={loading} variant="default">
            {loading ? "Importando..." : `Importar ${parsed.length} productos`}
          </Button>
        )}
      </div>

      {imported > 0 && (
        <p className="text-green-600 font-medium">
          ✓ {imported} productos importados exitosamente
        </p>
      )}

      {parsed.length > 0 && (
        <div className="border rounded-2xl overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Nombre</th>
                  <th className="px-3 py-2 text-left">Categoría</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 100).map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1 font-mono">{p.codigo}</td>
                    <td className="px-3 py-1">{p.nombre}</td>
                    <td className="px-3 py-1 text-muted-foreground">{p.categoria}</td>
                  </tr>
                ))}
                {parsed.length > 100 && (
                  <tr className="border-t">
                    <td colSpan={3} className="px-3 py-2 text-center text-muted-foreground">
                      ... y {parsed.length - 100} más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
