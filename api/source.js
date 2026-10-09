// جلب قنوات من مصدر IPTV (Xtream Codes أو رابط M3U / m3u_plus) لصالح لوحة التحكم.
// المتصفح لا يستطيع قراءة هذه الروابط مباشرة (CORS و http)، فتقرأها هذه الدالة من السيرفر.
// للمدير فقط: يجب إرسال رمز دخول Firebase لحساب موجود في ADMIN_EMAILS.
//
// POST /api/source/   Authorization: Bearer <Firebase ID token>
//   { "type": "xtream", "server": "...", "username": "...", "password": "...", "ext": "m3u8" | "ts" }
//   { "type": "m3u", "url": "..." }
// → { "channels": [{ name, logo, url, group }] }

import { firebaseConfig, ADMIN_EMAILS } from "../config.js";
import { parseM3U, fetchXtream, xtreamFromUrl } from "../iptv.js";

const UA = { "user-agent": "IPTVSmartersPro", accept: "*/*" };

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// التحقق من أن الطلب من مدير: نسأل Firebase عن صاحب الرمز
async function adminEmail(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  });
  if (!res.ok) return null;
  const user = (await res.json()).users?.[0];
  const email = (user?.email || "").toLowerCase();
  return user?.emailVerified && ADMIN_EMAILS.includes(email) ? email : null;
}

const withTimeout = (ms) => ({ signal: AbortSignal.timeout(ms) });

export async function POST(request) {
  if (!(await adminEmail(request))) return json(403, { error: "غير مصرّح" });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "طلب غير صالح" }); }

  try {
    let channels;
    const xt = body.type === "xtream" ? body : xtreamFromUrl(body.url || "");
    if (xt && xt.server && xt.username && xt.password) {
      channels = await fetchXtream(xt, (url, opts) => fetch(url, { ...opts, ...withTimeout(45000) }), UA);
    } else {
      const url = String(body.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return json(400, { error: "الرابط غير صالح" });
      const res = await fetch(url, { headers: UA, redirect: "follow", ...withTimeout(45000) });
      if (!res.ok) return json(502, { error: `سيرفر القائمة رد بالخطأ ${res.status}` });
      channels = parseM3U(await res.text());
    }
    if (!channels.length) return json(422, { error: "لم يتم العثور على قنوات في هذا المصدر" });
    return json(200, { channels });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "انتهت مهلة الاتصال بالسيرفر" : err?.message || "تعذر الاتصال بالسيرفر";
    return json(502, { error: msg });
  }
}
