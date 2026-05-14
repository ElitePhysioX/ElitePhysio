// ═══════════════════════════════════════
// ElitePhysio Secure Worker
// All secrets live here - never in browser
// ═══════════════════════════════════════

const SB_URL = "https://akovtufhkfnjrzqvzdyv.supabase.co";
const SB_KEY = "REPLACE_WITH_NEW_SUPABASE_KEY"; // paste new key here
const ADMIN_PASSWORD = "REPLACE_WITH_YOUR_PASSWORD"; // set your admin password here

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type": "application/json"
};

function json(data, status=200){
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function sbFetch(path, method="GET", body=null){
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Prefer": "resolution=merge-duplicates"
    }
  };
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(SB_URL + "/rest/v1/" + path, opts);
  if(r.status === 204) return [];
  return r.json();
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if(request.method === "OPTIONS"){
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── Serve static files ──
    if(!path.startsWith("/api/")){
      return env.ASSETS.fetch(request);
    }

    let body = {};
    if(request.method !== "GET"){
      try{ body = await request.json(); }catch(e){}
    }

    // ── API Routes ──

    // Admin login - password checked server-side, never exposed
    if(path === "/api/admin-login"){
      if(body.password === ADMIN_PASSWORD){
        return json({ ok: true });
      }
      return json({ ok: false, error: "Wrong password" }, 401);
    }

    // Patient login - name + pin checked server-side
    if(path === "/api/patient-login"){
      const { name, pin } = body;
      const rows = await sbFetch("patients?select=*");
      const norm = s => (s||"").trim().toLowerCase().replace(/\s+/g," ");
      const entered = norm(name);
      let match = rows.find(p =>
        [norm(p.name), norm(p.name_he), norm(p.name+" / "+p.name_he), norm(p.name_he+" / "+p.name)]
          .some(n => n && n === entered) && p.pin === pin
      );
      // Partial match fallback
      if(!match){
        match = rows.find(p =>
          [norm(p.name), norm(p.name_he)].some(n => n && (n.includes(entered) || entered.includes(n)))
          && p.pin === pin
        );
      }
      if(match) return json({ ok: true, patient: match });
      return json({ ok: false, error: "Not found" }, 401);
    }

    // Get all patients (admin only - requires token)
    if(path === "/api/patients" && request.method === "GET"){
      const token = request.headers.get("Authorization");
      if(token !== "Bearer "+ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
      const rows = await sbFetch("patients?select=*&order=id.asc");
      return json(rows);
    }

    // Save patient (admin only)
    if(path === "/api/patients" && request.method === "POST"){
      const token = request.headers.get("Authorization");
      if(token !== "Bearer "+ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
      const result = await sbFetch("patients", "POST", body);
      return json({ ok: true });
    }

    // Delete patient (admin only)
    if(path.startsWith("/api/patients/") && request.method === "DELETE"){
      const token = request.headers.get("Authorization");
      if(token !== "Bearer "+ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
      const id = path.split("/")[3];
      await sbFetch("patients?id=eq."+id, "DELETE");
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  }
};
