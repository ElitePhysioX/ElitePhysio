// ═══════════════════════════════════════
// ElitePhysio Secure Worker
// ═══════════════════════════════════════

const SB_URL = "https://akovtufhkfnjrzqvzdyv.supabase.co";
const ALLOWED_ORIGIN = "https://elitephysio.korki900.workers.dev";
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Vary": "Origin"
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'"
};

function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({}, CORS, SECURITY_HEADERS, {"Content-Type":"application/json"})
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

// ── Crypto helpers (Web Crypto API, available natively in Workers) ──

function bufToHex(buf){
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function hexToBuf(hex){
  const bytes = new Uint8Array(hex.length/2);
  for(let i=0;i<bytes.length;i++) bytes[i] = parseInt(hex.substr(i*2,2), 16);
  return bytes;
}

async function hmacKey(secret){
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign","verify"]
  );
}

// Signed, tamper-proof session tokens: "<payloadBase64>.<hmacHex>"
// The server is the only one that can mint or validate these — a client
// can never forge a token for a different patient id or for "admin".
async function signToken(payload, secret){
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = btoa(unescape(encodeURIComponent(payloadStr)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return payloadB64 + "." + bufToHex(sig);
}

async function verifyToken(token, secret){
  if(!token || typeof token !== "string" || token.indexOf(".") === -1) return null;
  const idx = token.lastIndexOf(".");
  const payloadB64 = token.slice(0, idx);
  const sigHex = token.slice(idx+1);
  const key = await hmacKey(secret);
  const expectedSig = bufToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64)));
  if(!timingSafeEqual(sigHex, expectedSig)) return null;
  let payload;
  try{ payload = JSON.parse(decodeURIComponent(escape(atob(payloadB64)))); }catch(e){ return null; }
  if(!payload || typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
  return payload;
}

function timingSafeEqual(a, b){
  if(typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Password / PIN hashing (SHA-256 with per-record salt) ──
// Stored format: "sha256$<saltHex>$<hashHex>"

async function sha256Hex(str){
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return bufToHex(digest);
}

// Returns true/false. Also tolerates legacy plaintext values that haven't
// been migrated yet (so existing patients aren't locked out); callers should
// re-hash and persist on a successful legacy match.
async function verifySecret(stored, plain){
  if(!stored) return { ok:false, legacy:false };
  if(typeof stored === "string" && stored.startsWith("sha256$")){
    const parts = stored.split("$");
    if(parts.length !== 3) return { ok:false, legacy:false };
    const [, salt, hash] = parts;
    const candidate = await sha256Hex(salt + ":" + plain);
    return { ok: timingSafeEqual(candidate, hash), legacy:false };
  }
  // Legacy plaintext value
  return { ok: timingSafeEqual(String(stored), String(plain)), legacy:true };
}

// ── PIN encryption (reversible — admin and the patient need to view the PIN) ──
// PINs are short, low-entropy 4-digit codes used only to log in to a low-risk
// patient portal, so unlike the admin password (hashed, never displayed) we
// store them with AES-GCM using a key derived from SESSION_SECRET. This keeps
// raw PINs out of the database (and out of Supabase's reach) while still
// letting the worker decrypt them for display to the admin and to the patient
// who owns them. Stored format: "enc$<ivHex>$<ciphertextHex>"

async function pinKey(secret){
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pin-encryption-key:" + secret));
  return crypto.subtle.importKey("raw", digest, { name:"AES-GCM" }, false, ["encrypt","decrypt"]);
}

async function encryptPin(plain, secret){
  const key = await pinKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, new TextEncoder().encode(String(plain)));
  return "enc$" + bufToHex(iv.buffer) + "$" + bufToHex(ct);
}

// Decrypts a stored PIN for display. Returns null if it isn't in the
// encrypted format (e.g. an old sha256$ hash that predates this change and
// can't be reversed — it will be re-encrypted automatically on next login).
async function decryptPin(stored, secret){
  if(typeof stored !== "string" || !stored.startsWith("enc$")) return null;
  const parts = stored.split("$");
  if(parts.length !== 3) return null;
  try{
    const key = await pinKey(secret);
    const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv: hexToBuf(parts[1]) }, key, hexToBuf(parts[2]));
    return new TextDecoder().decode(pt);
  }catch(e){ return null; }
}

// Verifies an entered PIN against any stored format (encrypted, hashed, or
// legacy plaintext) and reports whether it should be re-encrypted afterwards
// so every account converges on the recoverable "enc$" format over time.
async function verifyPin(stored, plain, secret){
  if(!stored) return { ok:false, migrate:false };
  if(typeof stored === "string" && stored.startsWith("enc$")){
    const decrypted = await decryptPin(stored, secret);
    return { ok: decrypted !== null && timingSafeEqual(decrypted, String(plain)), migrate:false };
  }
  const { ok } = await verifySecret(stored, plain);
  return { ok, migrate: ok };
}

// Returns the PIN in plaintext for display purposes (admin view / patient's
// own profile). Falls back to null when the stored value can't be decrypted
// (legacy one-way hash that hasn't been migrated yet — resolves itself on the
// patient's next login).
async function pinForDisplay(stored, secret){
  if(typeof stored !== "string") return null;
  if(stored.startsWith("enc$")) return decryptPin(stored, secret);
  if(stored.startsWith("sha256$")) return null;
  return stored; // legacy plaintext
}

async function attachPinForDisplay(patient, secret){
  if(!patient) return patient;
  const pin = await pinForDisplay(patient.pin, secret);
  return Object.assign({}, patient, { pin });
}

function getBearer(request){
  return (request.headers.get("Authorization")||"").replace(/^Bearer\s+/i, "");
}

async function requireAdmin(request, secret){
  const payload = await verifyToken(getBearer(request), secret);
  return payload && payload.role === "admin";
}

async function requirePatient(request, secret){
  const payload = await verifyToken(getBearer(request), secret);
  if(payload && payload.role === "patient" && payload.id) return payload.id;
  return null;
}

export default {
  async fetch(request, env) {
    const SB_KEY = env && env.SUPABASE_KEY;
    const ADMIN_PASSWORD_HASH = env && env.ADMIN_PASSWORD_HASH; // sha256$salt$hash format
    const SESSION_SECRET = env && env.SESSION_SECRET;

    const url = new URL(request.url);
    const path = url.pathname;

    if(request.method === "OPTIONS"){
      return new Response(null, { status: 204, headers: Object.assign({}, CORS, SECURITY_HEADERS) });
    }

    if(path.startsWith("/api/")){
      if(!SB_KEY || !ADMIN_PASSWORD_HASH || !SESSION_SECRET){
        return json({ error: "Server is not configured. Set SUPABASE_KEY, ADMIN_PASSWORD_HASH and SESSION_SECRET as Worker secrets." }, 500);
      }

      let body = {};
      if(request.method !== "GET"){
        try{ body = await request.json(); }catch(e){}
      }

      // ── Admin login: verify password hash, issue a signed admin session token ──
      if(path === "/api/admin-login"){
        const { ok } = await verifySecret(ADMIN_PASSWORD_HASH, body.password||"");
        if(!ok) return json({ ok: false, error: "Wrong password" }, 401);
        const token = await signToken({ role:"admin", exp: Date.now()+TOKEN_TTL_MS }, SESSION_SECRET);
        return json({ ok: true, token });
      }

      // ── Patient login: verify name+PIN, issue a signed patient session token ──
      if(path === "/api/patient-login"){
        const { name, pin } = body;
        const rows = await sbFetch(SB_KEY, "patients?select=*&id=neq.0");
        if(!Array.isArray(rows)) return json({ ok:false, error:"DB error" }, 500);
        const norm = s => (s||"").trim().toLowerCase().replace(/\s+/g," ");
        const entered = norm(name);
        const candidates = rows.filter(p => p.name !== "__system__" &&
          [norm(p.name), norm(p.name_he)].some(n => n && (n === entered || n.includes(entered) || entered.includes(n))));

        let match = null;
        for(const p of candidates){
          const { ok, migrate } = await verifyPin(p.pin, pin, SESSION_SECRET);
          if(ok){
            match = p;
            if(migrate){
              // Convert legacy plaintext/hashed PIN to recoverable encrypted form
              const reencrypted = await encryptPin(pin, SESSION_SECRET);
              await sbFetch(SB_KEY, "patients?id=eq."+p.id, "PATCH", { pin: reencrypted });
              match = Object.assign({}, p, { pin: reencrypted });
            }
            break;
          }
        }
        if(!match) return json({ ok: false, error: "Not found" }, 401);
        const token = await signToken({ role:"patient", id: match.id, exp: Date.now()+TOKEN_TTL_MS }, SESSION_SECRET);
        return json({ ok: true, token, patient: await attachPinForDisplay(match, SESSION_SECRET) });
      }

      // ── Patient session restore: token proves identity, no client-supplied id trusted ──
      if(path === "/api/patient-session"){
        const id = await requirePatient(request, SESSION_SECRET);
        if(!id) return json({ ok:false }, 401);
        const rows = await sbFetch(SB_KEY, "patients?select=*&id=eq."+id);
        if(Array.isArray(rows) && rows.length>0) return json({ ok:true, patient: await attachPinForDisplay(rows[0], SESSION_SECRET) });
        return json({ ok:false }, 404);
      }

      // ── Patient saves own profile — id comes from the verified token, not the body ──
      if(path === "/api/patient-save-profile"){
        const id = await requirePatient(request, SESSION_SECRET);
        if(!id) return json({ ok:false, error:"Unauthorized" }, 401);
        const { name, nameHe, age, sport, injury, notes, avatarId, firstLoginDone, pin } = body;
        const update = {};
        if(name!==undefined) update.name=name;
        if(nameHe!==undefined) update.name_he=nameHe;
        if(age!==undefined) update.age=age;
        if(sport!==undefined) update.sport=sport;
        if(injury!==undefined) update.injury=injury;
        if(notes!==undefined) update.notes=notes;
        if(avatarId!==undefined) update.avatar_id=avatarId;
        if(firstLoginDone!==undefined) update.first_login_done=firstLoginDone;
        if(pin) update.pin = await encryptPin(String(pin), SESSION_SECRET);
        await sbFetch(SB_KEY, "patients?id=eq."+id, "PATCH", update);
        return json({ ok: true });
      }

      // ── Save custom exercise library (admin only) ──
      if(path === "/api/save-custom-lib"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        await sbFetch(SB_KEY, "patients?id=eq.0", "PATCH", {workout_plans: body.lib||[]});
        return json({ ok: true });
      }

      // ── Load custom exercise library (public — needed pre-login for the exercise picker) ──
      if(path === "/api/load-custom-lib"){
        const rows = await sbFetch(SB_KEY, "patients?id=eq.0&select=workout_plans");
        if(Array.isArray(rows) && rows[0]) return json({ lib: rows[0].workout_plans||[] });
        return json({ lib: [] });
      }

      // ── Patient saves own workout history — id from verified token ──
      if(path === "/api/patient-save-history"){
        const id = await requirePatient(request, SESSION_SECRET);
        if(!id) return json({ ok:false, error:"Unauthorized" }, 401);
        const { workoutHistory } = body;
        await sbFetch(SB_KEY, "patients?id=eq."+id, "PATCH", { workout_history: workoutHistory||[] });
        return json({ ok: true });
      }

      // ── Get a single patient's fresh record (admin only) ──
      if(path.startsWith("/api/admin-patient/") && request.method === "GET"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        const id = path.split("/")[3];
        if(!/^\d+$/.test(id)) return json({ error:"Invalid id" }, 400);
        const rows = await sbFetch(SB_KEY, "patients?select=*&id=eq."+id);
        if(Array.isArray(rows) && rows.length>0) return json({ ok:true, patient: await attachPinForDisplay(rows[0], SESSION_SECRET) });
        return json({ ok:false }, 404);
      }

      // ── Get all patients (admin only) ──
      if(path === "/api/patients" && request.method === "GET"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        const rows = await sbFetch(SB_KEY, "patients?select=*&order=id.asc");
        const withPins = Array.isArray(rows) ? await Promise.all(rows.map(r => attachPinForDisplay(r, SESSION_SECRET))) : rows;
        return json(withPins);
      }

      // ── Save patient (admin only) ──
      if(path === "/api/patients" && request.method === "POST"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        // Encrypt the PIN server-side (reversibly) so plaintext never lands in the DB,
        // while still letting admin/patient view it later
        const toSave = Object.assign({}, body);
        if(toSave.pin) toSave.pin = await encryptPin(String(toSave.pin), SESSION_SECRET);
        // Editing an existing patient with no/blank PIN in the payload must never
        // clobber their real stored PIN with an empty value via the upsert merge
        else if(toSave.id) delete toSave.pin;
        await sbFetch(SB_KEY, "patients", "POST", toSave);
        return json({ ok: true });
      }

      // ── Delete patient (admin only) ──
      if(path.startsWith("/api/patients/") && request.method === "DELETE"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        const id = path.split("/")[3];
        if(!/^\d+$/.test(id)) return json({ error:"Invalid id" }, 400);
        await sbFetch(SB_KEY, "patients?id=eq."+id, "DELETE");
        return json({ ok: true });
      }

      // ── Get appointments for the logged-in patient (token-derived id only) ──
      if(path === "/api/patient-appts" && request.method === "POST"){
        const id = await requirePatient(request, SESSION_SECRET);
        if(!id) return json({ ok:false, error:"Unauthorized" }, 401);
        const rows = await sbFetch(SB_KEY, "appointments?select=*&patient_id=eq."+id+"&order=date.asc,time.asc");
        return json(Array.isArray(rows)?rows:[]);
      }

      // ── Update appointment date/time (admin only) ──
      if(path.startsWith("/api/appts/") && request.method === "PATCH"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        const id = path.split("/")[3];
        if(!/^\d+$/.test(id)) return json({ error:"Invalid id" }, 400);
        await sbFetch(SB_KEY, "appointments?id=eq."+id, "PATCH", body);
        return json({ ok: true });
      }

      // ── Get all appointments (admin only) ──
      if(path === "/api/appts" && request.method === "GET"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        const rows = await sbFetch(SB_KEY, "appointments?select=*&order=id.asc");
        return json(Array.isArray(rows)?rows:[]);
      }

      // ── Save appointment (admin only) ──
      if(path === "/api/appts" && request.method === "POST"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        const result = await sbFetch(SB_KEY, "appointments", "POST", body);
        if(result && result.code) return json({ error: result.message||"DB error" }, 500);
        return json({ ok: true });
      }

      // ── Delete appointment (admin only) ──
      if(path.startsWith("/api/appts/") && request.method === "DELETE"){
        if(!await requireAdmin(request, SESSION_SECRET)) return json({ error:"Unauthorized" }, 401);
        const id = path.split("/")[3];
        if(!/^\d+$/.test(id)) return json({ error:"Invalid id" }, 400);
        await sbFetch(SB_KEY, "appointments?id=eq."+id, "DELETE");
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    }

    // Serve static files
    const response = await env.ASSETS.fetch(request);
    const newResp = new Response(response.body, response);
    if(url.pathname.endsWith('.js') || url.pathname.endsWith('.css')){
      newResp.headers.set('Cache-Control', 'no-store');
    }
    Object.entries(SECURITY_HEADERS).forEach(([k,v]) => newResp.headers.set(k, v));
    return newResp;
  }
};
