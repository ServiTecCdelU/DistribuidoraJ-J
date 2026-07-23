require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: manual, error: e1, count: c1 } = await s
    .from("productos")
    .select("id", { count: "exact" })
    .not("id", "like", "prod\\_%")
    .limit(10);
  console.log("MANUAL (not like prod\\_%):", c1, e1?.message);
  console.log(manual?.map((r) => r.id));

  const { data: mayo, error: e2, count: c2 } = await s
    .from("productos")
    .select("id", { count: "exact" })
    .like("id", "prod\\_%")
    .limit(10);
  console.log("MAYORISTA (like prod\\_%):", c2, e2?.message);
  console.log(mayo?.map((r) => r.id));

  const { count: total } = await s.from("productos").select("id", { count: "exact", head: true });
  console.log("TOTAL:", total);
})();
