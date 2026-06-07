// One-time helper: generates the values you need to set as Cloudflare Worker secrets.
// Run locally with:   node generate-secrets.js "YourNewAdminPassword"
// (Never commit the output — paste it straight into `wrangler secret put` prompts.)

const crypto = require("crypto");

const password = process.argv[2];
if(!password){
  console.log("Usage: node generate-secrets.js \"YourNewAdminPassword\"");
  process.exit(1);
}

function hashSecret(plain){
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(salt + ":" + plain).digest("hex");
  return "sha256$" + salt + "$" + hash;
}

console.log("\nADMIN_PASSWORD_HASH (set this as a Worker secret):");
console.log(hashSecret(password));

console.log("\nSESSION_SECRET (set this as a Worker secret — random, used to sign session tokens):");
console.log(crypto.randomBytes(32).toString("hex"));

console.log("\nRun these to store them (you'll be prompted to paste each value):");
console.log("  wrangler secret put ADMIN_PASSWORD_HASH");
console.log("  wrangler secret put SESSION_SECRET");
console.log("  wrangler secret put SUPABASE_KEY   (paste your ROTATED Supabase key here)\n");
