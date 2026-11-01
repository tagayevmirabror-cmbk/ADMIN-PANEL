// POST /api/admin { pw, action: stats|grant|revoke, ... }
const crypto = require("crypto");
const db = require("./_db"), A = require("./_auth");
const same = (a, b) => crypto.timingSafeEqual(crypto.createHash("sha256").update(String(a)).digest(), crypto.createHash("sha256").update(String(b)).digest());
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: "ADMIN_PASSWORD o'rnatilmagan" });
  if (!db.enabled) return res.status(503).json({ error: "Baza ulanmagan (Upstash Redis)" });
  const b = A.body(req), ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0];
  try {
    if (!(await A.limit("rl:admin:" + ip, 20, 3600))) return res.status(429).json({ error: "Ko'p urinish, 1 soatdan keyin" });
    if (!same(b.pw || "", process.env.ADMIN_PASSWORD)) return res.status(401).json({ error: "Parol noto'g'ri" });
    const act = b.action;
    if (act === "grant" || act === "revoke") {
      const nik = String(b.nik || "").toLowerCase(), u = await A.getUser(nik);
      if (!u) return res.json({ error: "Foydalanuvchi topilmadi" });
      if (act === "revoke") { u.plan = null; u.until = 0; }
      else {
        const days = Math.min(Math.max(parseInt(b.days) || 30, 1), 365);
        if (!A.PLANS[b.plan]) return res.json({ error: "Tarif noto'g'ri" });
        u.plan = b.plan; u.until = Math.max(Date.now(), u.until || 0) + days * 864e5;
        await db.r("LPUSH", "payments", JSON.stringify({ t: Date.now(), nik, plan: b.plan, amount: 0, key: "admin " + days + " kun" }));
      }
      await A.putUser(nik, u);
      return res.json({ ok: true });
    }
    const niks = (await db.r("SMEMBERS", "users")) || [];
    const vals = niks.length ? await db.r("MGET", ...niks.map(n => "user:" + n)) : [];
    const users = niks.map((n, i) => { const u = vals[i] ? JSON.parse(vals[i]) : {}; return { nik: n, ph: u.ph, created: u.created, plan: A.activePlan(u) ? u.plan : null, until: u.until, paid: !!u.paid }; }).sort((a, c) => (c.created || 0) - (a.created || 0));
    const pays = ((await db.r("LRANGE", "payments", 0, 999)) || []).map(x => JSON.parse(x));
    const today = Date.now() - 864e5;
    res.json({
      ok: true, users: users.slice(0, 300), payments: pays.slice(0, 100),
      stats: { users: users.length, active: users.filter(u => u.plan).length, revenue: pays.reduce((s, p) => s + p.amount, 0), revenue24: pays.filter(p => p.t > today).reduce((s, p) => s + p.amount, 0), payCount: pays.filter(p => p.amount > 0).length },
    });
  } catch (e) { res.status(500).json({ error: "Server xatosi" }); }
};
