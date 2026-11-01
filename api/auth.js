// POST /api/auth { action: register|login|me, nik, ph, pw, token }
const crypto = require("crypto");
const db = require("./_db"), A = require("./_auth");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!A.ready()) return res.status(503).json({ nodb: true });
  const b = A.body(req);
  try {
    if (b.action === "me") {
      const nik = A.verify(b.token), u = nik && (await A.getUser(nik));
      if (!u) return res.status(401).json({ ok: false, error: "Sessiya tugagan, qayta kiring" });
      return res.json({ ok: true, plan: A.activePlan(u), paid: !!u.paid });
    }
    const nik = String(b.nik || "").trim().toLowerCase(), pw = String(b.pw || "");
    if (!/^[a-z0-9_.]{3,20}$/.test(nik)) return res.json({ ok: false, error: "Nik 3–20 belgi: lotin harf, raqam, _ yoki ." });
    if (b.action === "register") {
      const ph = String(b.ph || "").replace(/[\s\-()]/g, "");
      if (!/^\+998\d{9}$/.test(ph)) return res.json({ ok: false, error: "Telefon +998 bilan boshlanib 9 ta raqam bo‘lsin" });
      if (pw.length < 6 || pw.length > 100) return res.json({ ok: false, error: "Parol kamida 6 belgi bo‘lsin" });
      const salt = crypto.randomBytes(16).toString("hex");
      const u = { ph, salt, h: A.hashPw(pw, salt), created: Date.now(), plan: null, until: 0, paid: false };
      const ok = await db.r("SET", "user:" + nik, JSON.stringify(u), "NX");
      if (!ok) return res.json({ ok: false, error: "Bu nik band, boshqasini tanlang" });
      await db.r("SADD", "users", nik);
      return res.json({ ok: true, token: A.sign(nik), plan: null, paid: false });
    }
    if (b.action === "login") {
      if (!(await A.limit("rl:login:" + nik, 10, 900))) return res.json({ ok: false, error: "Ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring" });
      const u = await A.getUser(nik);
      if (!u || A.hashPw(pw, u.salt) !== u.h) return res.json({ ok: false, error: "Nik yoki parol noto‘g‘ri" });
      return res.json({ ok: true, token: A.sign(nik), plan: A.activePlan(u), paid: !!u.paid });
    }
    res.status(400).json({ ok: false, error: "Noto‘g‘ri so‘rov" });
  } catch (e) { res.status(500).json({ ok: false, error: "Server xatosi" }); }
};
