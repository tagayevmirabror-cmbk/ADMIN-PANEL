// POST /api/chat  { messages, token }  ->  { text }
const { ask } = require("./_ai"), A = require("./_auth");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const b = A.body(req);
  const msgs = Array.isArray(b.messages) ? b.messages.slice(-8) : [];
  const ok = msgs.length && msgs.every(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length <= 4000) && msgs[0].role === "user";
  if (!ok) return res.status(400).json({ error: "Noto'g'ri so'rov" });
  try {
    if (A.ready()) {
      const nik = A.verify(b.token);
      if (!nik) return res.status(401).json({ error: "Qayta kiring" });
      const p = A.activePlan(await A.getUser(nik)), lim = p ? A.PLANS[p.id].ai : A.FREE_AI;
      if (!(await A.limit(`ai:${nik}:${A.day()}`, lim, 172800))) return res.status(429).json({ error: `Bugungi AI limiti tugadi (${lim} ta). Ko'proq uchun 💎 Pro bo'limiga o'ting.` });
    }
    res.status(200).json({ text: await ask({ messages: msgs, maxTokens: 700 }) });
  } catch (e) {
    const m = String(e.message);
    res.status(502).json({ error: m === "no-key" ? "Server sozlanmagan: AI kaliti yo'q" : m.includes("429") ? "AI limiti tugadi, birozdan keyin urinib ko'ring" : "AI bilan aloqa yo'q" });
  }
};
