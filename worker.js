// ═══════════════════════════════════════
// ElitePhysio Secure Worker
// ═══════════════════════════════════════

const SB_URL = "https://akovtufhkfnjrzqvzdyv.supabase.co";

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

async function sbFetch(SB_KEY, path, method="GET", body=null){
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Prefer": method==="PATCH" ? "return=minimal" : "resolution=merge-duplicates"
    }
  };
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(SB_URL + "/rest/v1/" + path, opts);
  if(r.status === 204 || r.status === 200 && method==="PATCH") return [];
  return r.json();
}

export default {
  async fetch(request, env) {
    // Use Cloudflare env secrets, fall back to hardcoded if not set
    const SB_KEY = (env&&env.SUPABASE_KEY) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrb3Z0dWZoa2ZuanJ6cXZ6ZHl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzQwODYsImV4cCI6MjA5NDMxMDA4Nn0.2J-NgkPEas1_SMYHHuovfrdTggUfJlyitRu5K-pbMSM";
    const ADMIN_PASSWORD = (env&&env.ADMIN_PASSWORD) || "elitephysio39";

    const url = new URL(request.url);
    const path = url.pathname;

    if(request.method === "OPTIONS"){
      return new Response(null, { status: 204, headers: CORS });
    }

    if(path.startsWith("/api/")){
      let body = {};
      if(request.method !== "GET"){
        try{ body = await request.json(); }catch(e){}
      }

      // Admin login
      if(path === "/api/admin-login"){
        if(body.password === ADMIN_PASSWORD){
          return json({ ok: true, sbKey: SB_KEY });
        }
        return json({ ok: false, error: "Wrong password" }, 401);
      }

      // Patient saves own profile (name, avatar, goals etc)
      if(path === "/api/patient-save-profile"){
        const { id, name, nameHe, age, sport, injury, notes, avatarId, firstLoginDone, pin } = body;
        if(!id) return json({ ok:false }, 400);
        const update = {};
        if(name!==undefined) update.name=name;
        if(nameHe!==undefined) update.name_he=nameHe;
        if(age!==undefined) update.age=age;
        if(sport!==undefined) update.sport=sport;
        if(injury!==undefined) update.injury=injury;
        if(notes!==undefined) update.notes=notes;
        if(avatarId!==undefined) update.avatar_id=avatarId;
        if(firstLoginDone!==undefined) update.first_login_done=firstLoginDone;
        if(pin) update.pin=pin;
        await sbFetch(SB_KEY, "patients?id=eq."+id, "PATCH", update);
        return json({ ok: true });
      }

      // Save custom exercise library (admin only) - stored as JSON in a dedicated system row
      if(path === "/api/save-custom-lib"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        // Use PATCH on the system row (id=0) - only update workout_plans, don't create a visible patient
        await sbFetch(SB_KEY, "patients?id=eq.0", "PATCH", {workout_plans: body.lib||[]});
        return json({ ok: true });
      }

      // Load custom exercise library
      if(path === "/api/load-custom-lib"){
        const rows = await sbFetch(SB_KEY, "patients?id=eq.0&select=workout_plans");
        if(Array.isArray(rows) && rows[0]) return json({ lib: rows[0].workout_plans||[] });
        return json({ lib: [] });
      }

      // Patient saves own workout history (no admin token needed, just their ID)
      if(path === "/api/patient-save-history"){
        const { id, workoutHistory } = body;
        if(!id) return json({ ok:false }, 400);
        await sbFetch(SB_KEY, "patients?id=eq."+id, "PATCH", { workout_history: workoutHistory||[] });
        return json({ ok: true });
      }

      // Patient login by ID (session restore)
      if(path === "/api/patient-login-by-id"){
        const { id } = body;
        if(!id) return json({ ok:false }, 400);
        const rows = await sbFetch(SB_KEY, "patients?select=*&id=eq."+id);
        if(Array.isArray(rows) && rows.length>0) return json({ ok:true, patient:rows[0] });
        return json({ ok:false }, 404);
      }

      // Patient login
      if(path === "/api/patient-login"){
        const { name, pin } = body;
        const rows = await sbFetch(SB_KEY, "patients?select=*&id=neq.0");
        if(!Array.isArray(rows)) return json({ ok:false, error:"DB error" }, 500);
        const norm = s => (s||"").trim().toLowerCase().replace(/\s+/g," ");
        const entered = norm(name);
        let match = rows.filter(p => p.name !== "__system__").find(p =>
          [norm(p.name), norm(p.name_he)].some(n =>
            n && (n === entered || n.includes(entered) || entered.includes(n))
          ) && p.pin === pin
        );
        if(match) return json({ ok: true, patient: match });
        return json({ ok: false, error: "Not found" }, 401);
      }

      // Get all patients (admin only)
      if(path === "/api/patients" && request.method === "GET"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        const rows = await sbFetch(SB_KEY, "patients?select=*&order=id.asc");
        return json(rows);
      }

      // Save patient (admin only)
      if(path === "/api/patients" && request.method === "POST"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        await sbFetch(SB_KEY, "patients", "POST", body);
        return json({ ok: true });
      }

      // Delete patient (admin only)
      if(path.startsWith("/api/patients/") && request.method === "DELETE"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        const id = path.split("/")[3];
        await sbFetch(SB_KEY, "patients?id=eq."+id, "DELETE");
        return json({ ok: true });
      }

      // Get appointments for a specific patient (no admin token — patients fetch own)
      if(path === "/api/patient-appts" && request.method === "POST"){
        const { patientId } = body;
        if(!patientId) return json([]);
        const rows = await sbFetch(SB_KEY, "appointments?select=*&patient_id=eq."+patientId+"&order=date.asc,time.asc");
        return json(Array.isArray(rows)?rows:[]);
      }

      // Update appointment date/time (admin only)
      if(path.startsWith("/api/appts/") && request.method === "PATCH"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        const id = path.split("/")[3];
        await sbFetch(SB_KEY, "appointments?id=eq."+id, "PATCH", body);
        return json({ ok: true });
      }

      // Get all appointments (admin only)
      if(path === "/api/appts" && request.method === "GET"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        const rows = await sbFetch(SB_KEY, "appointments?select=*&order=id.asc");
        return json(Array.isArray(rows)?rows:[]);
      }

      // Save appointment (admin only)
      if(path === "/api/appts" && request.method === "POST"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        await sbFetch(SB_KEY, "appointments", "POST", body);
        return json({ ok: true });
      }

      // Delete appointment (admin only)
      if(path.startsWith("/api/appts/") && request.method === "DELETE"){
        const token = (request.headers.get("Authorization")||"").replace("Bearer ","");
        if(token !== ADMIN_PASSWORD) return json({ error:"Unauthorized" }, 401);
        const id = path.split("/")[3];
        await sbFetch(SB_KEY, "appointments?id=eq."+id, "DELETE");
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    }

    // Serve static files
    const response = await env.ASSETS.fetch(request);
    if(url.pathname.endsWith('.js') || url.pathname.endsWith('.css')){
      const newResp = new Response(response.body, response);
      newResp.headers.set('Cache-Control', 'no-store');
      return newResp;
    }
    return response;
  }
};
