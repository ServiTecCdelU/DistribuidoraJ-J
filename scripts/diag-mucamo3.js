require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: v, error } = await s.from("ventas").select("*").eq("id","venta_elmucamo_3").maybeSingle();
  if (error) console.log("ERR", error.message);
  if (!v) return console.log("VENTA NO EXISTE");
  const { remito_pdf_base64, invoice_pdf_base64, items, ...rest } = v;
  console.log(JSON.stringify(rest).slice(0,1500));
})();
