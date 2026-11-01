// POST /api/receipt  { image: <base64 jpeg>, amount: <so'm> }  ->  { ok, reason?, key? }
const { ask } = require("./_ai"), A = require("./_auth"), db = require("./_db");
const crypto = require("crypto");
const LAST4 = process.env.CARD_LAST4 || "3149";
const FIRST4 = process.env.CARD_FIRST4 || "9860";
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "POST only" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const need = Number(b.amount);
  if (!b.image || typeof b.image !== "string" || b.image.length > 4_500_000 || ![3000, 8000, 14000, 15000, 22000, 29000].includes(need))
    return res.status(400).json({ ok: false, reason: "Noto'g'ri so'rov" });
  let nik = null, user = null, plan = A.PLANS[b.plan];
  if (A.ready()) {
    nik = A.verify(b.token);
    if (!nik) return res.status(401).json({ ok: false, reason: "Qayta kiring" });
    user = await A.getUser(nik);
    if (!user || !plan) return res.status(400).json({ ok: false, reason: "Noto'g'ri so'rov" });
    if (need !== (user.paid ? plan.next : plan.first)) return res.status(200).json({ ok: false, reason: "Narx o'zgargan, sahifani yangilang." });
    if (!(await A.limit(`rl:rc:${nik}:${A.day()}`, 8, 172800))) return res.status(200).json({ ok: false, reason: "Bugun juda ko'p urinish bo'ldi. Ertaga qayta urinib ko'ring." });
  }
  const now = new Date();
  const prompt = `You are a strict payment-receipt auditor. The image should be a bank or payment-app transfer receipt screenshot from Uzbekistan (Click, Payme, Humo, Uzcard, Uzum, Paynet, bank apps). Current time in Uzbekistan (UTC+5) is ${new Date(now.getTime() + 5 * 36e5).toISOString().slice(0, 16).replace("T", " ")}. Read only what is visible; never guess missing values. Return ONLY JSON: {"is_receipt":boolean,"success_status":boolean,"amount_uzs":number|null,"recipient_card":string|null,"date_time":"YYYY-MM-DD HH:MM"|null,"transaction_id":string|null,"looks_edited":boolean,"fake_signals":[strings],"confidence":number 0..1 that this is a genuine unedited receipt}. fake_signals lists: inconsistent fonts/alignment, mismatched numbers, impossible date, pasted or blurred regions, missing standard elements, screenshot of screenshot, template-like layout. Be skeptical: if anything is unreadable or suspicious, list it and lower confidence.`;
  try {
    const txt = await ask({ image: b.image, text: prompt, json: true, maxTokens: 700 });
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return res.status(200).json({ ok: false, reason: "Chekni o'qib bo'lmadi" });
    const v = JSON.parse(m[0]);
    const card = String(v.recipient_card || "").replace(/\s/g, "");
    const dt = v.date_time ? new Date(String(v.date_time).replace(" ", "T") + ":00+05:00") : null;
    let why = null;
    if (!v.is_receipt) why = "Rasm to'lov cheki emas.";
    else if (!v.success_status) why = "Chekda o'tkazma muvaffaqiyatli deb ko'rinmadi.";
    else if (Math.round(v.amount_uzs || 0) !== need) why = `Summa mos emas. Kerak: ${need} so'm.`;
    else if (!card.endsWith(LAST4) || (/^\d{4}/.test(card) && card.slice(0, 4) !== FIRST4)) why = "Qabul qiluvchi karta mos kelmadi.";
    else if (!dt || isNaN(dt) || Math.abs(now - dt) > 48 * 36e5) why = "Chek sanasi yaqin emas yoki o'qilmadi (oxirgi 48 soat).";
    else if (v.looks_edited || (v.fake_signals && v.fake_signals.length) || !(v.confidence >= 0.85)) why = "Chek shubhali ko'rindi, qabul qilinmadi. Original skrinshotni yuboring.";
    if (why) return res.status(200).json({ ok: false, reason: why });
    const key = v.transaction_id || v.date_time;
    if (!A.ready()) return res.status(200).json({ ok: true, key });
    const ih = crypto.createHash("sha256").update(b.image).digest("hex");
    const f1 = await db.r("SET", "rc:img:" + ih, nik, "NX"), f2 = await db.r("SET", "rc:id:" + key + ":" + need, nik, "NX");
    if (!f1 || !f2) return res.status(200).json({ ok: false, reason: "Bu chek avval ishlatilgan." });
    const base = A.activePlan(user) && user.plan === b.plan ? user.until : Date.now();
    user.plan = b.plan; user.until = base + 30 * 864e5; user.paid = true;
    await A.putUser(nik, user);
    await db.r("LPUSH", "payments", JSON.stringify({ t: Date.now(), nik, plan: b.plan, amount: need, key }));
    res.status(200).json({ ok: true, key, plan: { id: b.plan, until: user.until } });
  } catch (e) {
    res.status(200).json({ ok: false, reason: String(e.message) === "no-key" ? "Server sozlanmagan: AI kaliti yo'q" : String(e.message).includes("429") ? "AI limiti tugadi, birozdan keyin urinib ko'ring" : "Tekshirib bo'lmadi, qayta urinib ko'ring." });
  }
};
