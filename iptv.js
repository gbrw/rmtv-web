// قراءة مصادر IPTV: قوائم M3U / m3u_plus، وحسابات Xtream Codes.
// يُستخدم في لوحة التحكم (ملف M3U يُقرأ في المتصفح) وفي الدالة api/source (الروابط).

/** يحوّل نص M3U إلى قائمة قنوات { name, logo, url, group } */
export function parseM3U(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const out = [];
  let info = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const attr = (k) => (line.match(new RegExp(`${k}="([^"]*)"`, "i")) || [])[1] || "";
      const comma = line.indexOf(",", line.lastIndexOf('"') > 0 ? line.lastIndexOf('"') : 0);
      const title = comma >= 0 ? line.slice(comma + 1).trim() : "";
      info = {
        name: title || attr("tvg-name") || "قناة",
        logo: attr("tvg-logo"),
        group: attr("group-title") || "بدون تصنيف",
      };
    } else if (line.startsWith("#EXTGRP:") && info) {
      info.group = line.slice(8).trim() || info.group;
    } else if (!line.startsWith("#")) {
      if (/^(https?|rtmp|rtsp):\/\//i.test(line)) {
        out.push({ ...(info || { name: line.split("/").pop(), logo: "", group: "بدون تصنيف" }), url: line });
      }
      info = null;
    }
  }
  return out;
}

/** التصنيفات وعدد قنوات كل تصنيف (بترتيب ظهورها) */
export function groupsOf(channels) {
  const map = new Map();
  channels.forEach((c) => map.set(c.group, (map.get(c.group) || 0) + 1));
  return [...map].map(([name, count]) => ({ name, count }));
}

/** يتعرّف على روابط Xtream مثل get.php?username=..&password=..&type=m3u_plus */
export function xtreamFromUrl(url) {
  try {
    const u = new URL(url);
    const user = u.searchParams.get("username");
    const pass = u.searchParams.get("password");
    if (!user || !pass || !/(get|player_api)\.php$/i.test(u.pathname)) return null;
    return { server: `${u.protocol}//${u.host}`, username: user, password: pass, ext: u.searchParams.get("output") === "ts" ? "ts" : "m3u8" };
  } catch {
    return null;
  }
}

export const normalizeServer = (s) => {
  let v = String(s || "").trim().replace(/\/+$/, "");
  if (v && !/^https?:\/\//i.test(v)) v = "http://" + v;
  return v;
};

/** يجلب القنوات المباشرة من حساب Xtream Codes عبر player_api.php */
export async function fetchXtream({ server, username, password, ext = "m3u8" }, fetchImpl = fetch, headers = {}) {
  const base = normalizeServer(server);
  const q = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const get = async (action) => {
    const res = await fetchImpl(`${base}/player_api.php?${q}&action=${action}`, { headers });
    if (!res.ok) throw new Error(`السيرفر رد بالخطأ ${res.status}`);
    const j = await res.json();
    if (j && j.user_info && j.user_info.auth === 0) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
    return j;
  };
  const [cats, streams] = await Promise.all([get("get_live_categories"), get("get_live_streams")]);
  if (!Array.isArray(streams)) throw new Error("الحساب غير صالح أو منتهي");
  const catName = Object.fromEntries((Array.isArray(cats) ? cats : []).map((c) => [String(c.category_id), c.category_name]));
  const order = Object.fromEntries((Array.isArray(cats) ? cats : []).map((c, i) => [String(c.category_id), i]));
  return streams
    .map((s, i) => ({
      name: String(s.name || "").trim() || `قناة ${i + 1}`,
      logo: s.stream_icon || "",
      group: catName[String(s.category_id)] || "بدون تصنيف",
      url: `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${s.stream_id}.${ext}`,
      _o: (order[String(s.category_id)] ?? 9999) * 100000 + (Number(s.num) || i),
    }))
    .sort((a, b) => a._o - b._o)
    .map(({ _o, ...c }) => c);
}
