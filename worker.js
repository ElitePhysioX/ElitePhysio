// ═══════════════════════════════════════
// ElitePhysio Secure Worker
// All secrets live here - never in browser
// ═══════════════════════════════════════

const SB_URL = "https://akovtufhkfnjrzqvzdyv.supabase.co";
const SB_KEY = "sb_publishable_CjOEaHEE44FTg41AOo4iBQ_1ox7cVxr";
const ADMIN_PASSWORD = "elitephysio39";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({}, CORS, {"Content-Type":"application/json"})
  });
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
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if(request.method === "OPTIONS"){
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── API Routes (secure, secrets never leave this worker) ──
    if(path.startsWith("/api/")){
      let body = {};
      if(request.method !== "GET"){
        try{ body = await request.json(); }catch(e){}
      }

      // Admin login
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
        if(!Array.isArray(rows)) return json({ ok:false, error:"DB error" }, 500);
        const norm = s => (s||"").trim().toLowerCase().replace(/\s+/g," ");
        const entered = norm(name);
        let match = rows.find(p =>
          [norm(p.name), norm(p.name_he)].some(n => n && (n === entered || n.includes(entered) || entered.includes(n)))
          && p.pin === pin
        );
        if(match) return json({ ok: true, patient: match });
        return json({ ok: false, error: "Not found" }, 401);
      }

      // Get all patients (admin only)
      if(path === "/api/patients" && request.method === "GET"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        const rows = await sbFetch("patients?select=*&order=id.asc");
        return json(rows);
      }

      // Save/update patient (admin only)
      if(path === "/api/patients" && request.method === "POST"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        await sbFetch("patients", "POST", body);
        return json({ ok: true });
      }

      // Delete patient (admin only)
      if(path.startsWith("/api/patients/") && request.method === "DELETE"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        const id = path.split("/")[3];
        await sbFetch("patients?id=eq."+id, "DELETE");
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    }

    // ── Serve all static files with no-cache for JS/CSS ──
    const response = await env.ASSETS.fetch(request);
    const url2 = new URL(request.url);
    if(url2.pathname.endsWith('.js') || url2.pathname.endsWith('.css')){
      const newResp = new Response(response.body, response);
      newResp.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      newResp.headers.set('Pragma', 'no-cache');
      return newResp;
    }
    return response;
  }
};
