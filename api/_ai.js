// Umumiy AI yordamchi: ANTHROPIC_API_KEY yoki GEMINI_API_KEY (bepul) bilan ishlaydi.
const GEMINI_MODELS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"].filter(Boolean);

async function viaClaude({ messages, image, text, maxTokens }) {
  const msgs = messages || [{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
    { type: "text", text } ] }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, messages: msgs }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("claude " + r.status);
  return (j.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
}

async function viaGemini({ messages, image, text, maxTokens, json }) {
  const contents = messages
    ? messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
    : [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text }] }];
  let last = "gemini";
  for (const model of GEMINI_MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: Math.max(maxTokens, 1500), ...(json ? { responseMimeType: "application/json" } : {}) } }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const t = ((j.candidates || [])[0]?.content?.parts || []).map(p => p.text || "").join("");
      if (t) return t;
    }
    last = "gemini " + model + " " + r.status;
    if (r.status === 429 || r.status === 401 || r.status === 403) break; // limit yoki kalit xatosi: boshqa model yordam bermaydi
  }
  throw new Error(last);
}

async function ask(opts) {
  if (process.env.ANTHROPIC_API_KEY) return viaClaude(opts);
  if (process.env.GEMINI_API_KEY) return viaGemini(opts);
  throw new Error("no-key");
}
module.exports = { ask };
