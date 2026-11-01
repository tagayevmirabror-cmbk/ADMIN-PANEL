// Upstash Redis (REST). Vercel Marketplace orqali ulanganda o'zgaruvchilar avtomatik qo'shiladi.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const enabled = !!(URL_ && TOK);
async function r(...cmd) {
  const x = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOK, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await x.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
module.exports = { enabled, r };
