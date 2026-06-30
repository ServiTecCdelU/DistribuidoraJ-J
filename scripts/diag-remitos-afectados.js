require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const { execSync } = require("child_process");
const fs = require("fs");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sumItems = (arr) => (arr || []).reduce((a, it) => a + (it.price || 0) * (1 - (it.itemDiscount || 0) / 100) * (it.quantity || 0), 0);

const pdfTotal = (b64) => {
  try {
    fs.writeFileSync("scripts/_tmp.pdf", Buffer.from(b64, "base64"));
    const txt = execSync('pdftotext -layout scripts/_tmp.pdf - 2>NUL', { encoding: "utf8" });
    const m = txt.match(/Total:\s*\$\s*([\d.,]+)/);
    return m ? m[1] : "(?)";
  } catch { return "(err)"; }
};

(async () => {
  // Candidatos: ventas con items_no_entregados no vacío y remito_number
  const { data: ventas } = await supabase
    .from("ventas")
    .select("id, created_at, client_name, remito_number, total, items, items_no_entregados, remito_pdf_base64")
    .not("remito_number", "is", null)
    .not("items_no_entregados", "is", null)
    .order("created_at", { ascending: true });

  console.log("Candidatos (con remito + items_no_entregados):", (ventas || []).length, "\n");
  const afectados = [];
  for (const v of ventas || []) {
    const noEnt = v.items_no_entregados || [];
    if (noEnt.length === 0) continue;
    const original = (v.total || 0) + sumItems(noEnt);
    let pt = "(sin pdf)";
    if (v.remito_pdf_base64) pt = pdfTotal(v.remito_pdf_base64);
    const ptNum = parseFloat((pt || "0").replace(/\./g, "").replace(",", "."));
    const reducido = Math.abs(ptNum - (v.total || 0)) < 1;     // PDF muestra el total reducido => MAL
    const correcto = Math.abs(ptNum - original) < 1;
    const estado = reducido && original - (v.total || 0) > 0.5 ? "❌ MAL" : correcto ? "✅ OK" : "❓ revisar";
    console.log(`${estado}  ${v.remito_number}  ${v.created_at.slice(0,10)}  ${v.client_name}`);
    console.log(`     venta.total=${(v.total||0).toFixed(2)}  original=${original.toFixed(2)}  PDF=${pt}`);
    if (estado.includes("MAL")) afectados.push(v.id);
  }
  console.log("\nIDs afectados:", JSON.stringify(afectados));
  try { fs.unlinkSync("scripts/_tmp.pdf"); } catch {}
})();
