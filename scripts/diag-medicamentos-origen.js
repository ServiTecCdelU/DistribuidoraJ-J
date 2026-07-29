require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, count } = await s
    .from("productos")
    .select("id, category", { count: "exact" })
    .ilike("category", "%medicamento%");
  console.log("Total medicamentos:", count);
  const manual = data.filter(r => !r.id.startsWith("prod_"));
  const mayorista = data.filter(r => r.id.startsWith("prod_"));
  console.log("Manual:", manual.length, manual.slice(0,5).map(r=>r.id));
  console.log("Mayorista:", mayorista.length, mayorista.slice(0,5).map(r=>r.id));
})();
