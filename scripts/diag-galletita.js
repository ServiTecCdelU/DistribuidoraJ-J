require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: p } = await s.from("productos").select("*").ilike("name", "%GALLETITA DELICIOSA%CHIPS%140%");
  console.log("productos:", JSON.stringify(p, null, 2));
})();
