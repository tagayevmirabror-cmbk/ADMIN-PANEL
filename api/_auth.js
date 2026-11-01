const crypto = require("crypto");
const db = require("./_db");
const PLANS = {
  pro: { n: "Pro", first: 3000, next: 15000, ai: 30 },
  max: { n: "Pro Max", first: 8000, next: 22000, ai: 100 },
  full: { n: "Mukammal", first: 14000, next: 29000, ai: 1e9 },
};
const FREE_AI = 5;
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
const ready = () => db.enabled && !!secret();
const mac = p => crypto.createHmac("sha256", secret()).update(p).digest("base64url");
function sign(nik) { const p = Buffer.from(nik + "." + (Date.now() + 30 * 864e5)).toString("base64url"); return p + "." + mac(p); }
function verify(t) {
  if (!t || typeof t !== "string" || !secret()) return null;
  const [p, sig] = t.split("."); if (!p || !sig) return null;
  const a = Buffer.from(sig), c = Buffer.from(mac(p));
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return null;
  const s = Buffer.from(p, "base64url").toString(), i = s.lastIndexOf(".");
  return +s.slice(i + 1) > Date.now() ? s.slice(0, i) : null;
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
const body = req => (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {});
const day = () => new Date(Date.now() + 5 * 36e5).toISOString().slice(0, 10);
const getUser = async nik => { const v = await db.r("GET", "user:" + nik); return v ? JSON.parse(v) : null; };
const putUser = (nik, u) => db.r("SET", "user:" + nik, JSON.stringify(u));
const activePlan = u => (u && u.plan && PLANS[u.plan] && u.until > Date.now() ? { id: u.plan, until: u.until } : null);
async function limit(key, max, ttl) { const n = await db.r("INCR", key); if (n === 1) await db.r("EXPIRE", key, ttl); return n <= max; }
module.exports = { PLANS, FREE_AI, ready, sign, verify, hashPw, body, day, getUser, putUser, activePlan, limit };
