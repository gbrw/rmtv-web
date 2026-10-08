import { firebaseConfig, FIREBASE_SDK } from "./config.js";
import { registerServiceWorker, setupInstallBanner, toast, escapeHtml, safeUrl, ICONS } from "./common.js";
import { enginesFor } from "./engines.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getFirestore, collection, query, where, onSnapshot, getDocs, documentId } =
  await import(`${FIREBASE_SDK}/firebase-firestore.js`);

const db = getFirestore(initializeApp(firebaseConfig));

const FAV_KEY = "rmtv_favorites";
const MAX_RETRIES = 3;

const $ = (id) => document.getElementById(id);
const el = {
  content: $("content"), title: $("title"), subtitle: $("subtitle"), search: $("search"),
  back: $("backBtn"), fav: $("favBtn"),
  player: $("player"), host: $("engineHost"), yt: $("yt"), msg: $("playerMsg"), spinner: $("playerSpinner"),
  name: $("playerName"), network: $("playerNetwork"), stage: $("stage"),
};

$("searchIcon").outerHTML = ICONS.search;
el.back.innerHTML = ICONS.back;
el.fav.innerHTML = ICONS.star;
$("closePlayer").innerHTML = ICONS.close;
$("prevCh").innerHTML = ICONS.prev;
$("nextCh").innerHTML = ICONS.next;
$("reloadCh").innerHTML = ICONS.reload;
$("fsBtn").innerHTML = ICONS.fullscreen;
$("playersBtn").innerHTML = ICONS.external;
$("playersClose").innerHTML = ICONS.close;
$("installClose").innerHTML = ICONS.close;

// ---------- الحالة ----------
const state = {
  networks: [],
  networksLoaded: false,
  networksError: null,
  channels: [],         // القائمة المعروضة حالياً (باقة أو المفضلة)
  channelsLoaded: false,
  view: "networks",     // networks | channels | favorites
  networkId: null,
  playing: null,        // { list, index }
};

// ---------- المفضلة (محلياً على الجهاز مثل التطبيق) ----------
function getFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch { return new Set(); }
}
function toggleFav(id) {
  const favs = getFavs();
  favs.has(id) ? favs.delete(id) : favs.add(id);
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch {}
  return favs.has(id);
}

// ---------- البيانات ----------
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const toChannel = (d) => {
  const x = d.data();
  return { id: d.id, name: x.name || "", logoUrl: x.logoUrl || "", url: x.url || "",
    streamType: x.streamType || "direct", networkId: x.networkId || "", order: x.order ?? 0,
    showOnWeb: x.showOnWeb };
};

// نسخة الويب تعرض فقط القنوات التي تعمل طبيعياً في المتصفح: روابط https ويوتيوب.
// روابط http لا يسمح بها المتصفح فتُخفى دائماً، ويمكن للمدير إخفاء أي قناة أخرى (showOnWeb = false).
function webVisible(c) {
  if (c.showOnWeb === false) return false;
  return c.streamType === "youtube" || /youtube\.com|youtu\.be/.test(c.url) || c.url.trim().startsWith("https://");
}

onSnapshot(
  query(collection(db, "networks"), where("isActive", "==", true)),
  (snap) => {
    state.networks = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byOrder);
    state.networksLoaded = true;
    state.networksError = null;
    window.__bootDone?.();
    render();
  },
  (err) => {
    window.__bootDone?.();
    state.networksLoaded = true;
    state.networksError = navigator.onLine
      ? "خطأ في جلب البيانات: " + err.message
      : "لا يوجد اتصال بالإنترنت\nالرجاء التحقق من الشبكة";
    render();
  }
);

// كل القنوات المفعّلة الظاهرة على الويب (حوالي 200 قناة، تُحمَّل مرة واحدة وتتحدث تلقائياً).
// منها نعرف قنوات كل باقة، ونخفي الباقات التي لا تحتوي أي قناة تعمل على الويب.
onSnapshot(
  query(collection(db, "channels"), where("isActive", "==", true)),
  (snap) => {
    state.allChannels = snap.docs.map(toChannel).filter(webVisible).sort(byOrder);
    state.allChannelsLoaded = true;
    if (state.view === "channels") watchNetworkChannels(state.networkId);
    render();
  },
  (err) => {
    state.allChannelsLoaded = true;
    toast("خطأ في جلب القنوات: " + err.message, true);
    render();
  }
);

function watchNetworkChannels(networkId) {
  state.channels = (state.allChannels || []).filter((c) => c.networkId === networkId);
  state.channelsLoaded = !!state.allChannelsLoaded;
}

async function loadFavorites() {
  state.channels = [];
  state.channelsLoaded = false;
  const ids = [...getFavs()];
  const out = [];
  try {
    // Firestore يسمح بـ 30 قيمة كحد أقصى في استعلام "in"
    for (let i = 0; i < ids.length; i += 30) {
      const snap = await getDocs(query(collection(db, "channels"), where(documentId(), "in", ids.slice(i, i + 30))));
      snap.docs.forEach((d) => {
        const c = toChannel(d);
        if (d.data().isActive !== false && webVisible(c)) out.push(c);
      });
    }
  } catch (err) {
    toast("خطأ في جلب المفضلة: " + err.message, true);
  }
  if (state.view !== "favorites") return;
  state.channels = out.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  state.channelsLoaded = true;
  render();
}

// ---------- التوجيه (يدعم زر الرجوع في المتصفح والهاتف) ----------
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "n" && parts[1]) return { view: "channels", networkId: parts[1], channelId: parts[3] || null };
  if (parts[0] === "fav") return { view: "favorites", channelId: parts[2] || null };
  return { view: "networks" };
}

let playerPushed = false; // هل فُتح المشغل من داخل القائمة (فيكون الرجوع history.back)

function onRoute() {
  const r = parseRoute();
  const viewChanged = r.view !== state.view || r.networkId !== state.networkId;
  if (r.channelId && el.player.hidden) playerPushed = !viewChanged;
  state.view = r.view;
  state.networkId = r.networkId || null;

  if (viewChanged) {
    el.search.value = "";
    if (r.view === "channels") watchNetworkChannels(r.networkId);
    else if (r.view === "favorites") loadFavorites();
    window.scrollTo(0, 0);
  }

  if (r.channelId) openPlayerById(r.channelId);
  else closePlayer(false);
  render();
}
window.addEventListener("hashchange", onRoute);

function go(hash) { location.hash = hash; }
const listHash = () => location.hash.replace(/\/c\/.*$/, "");

// ---------- العرض ----------
function logoHtml(url) {
  const safe = safeUrl(url);
  return safe
    ? `<img src="${escapeHtml(safe)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.innerHTML=window.__tvIcon">`
    : ICONS.tv;
}
window.__tvIcon = ICONS.tv;

let pendingChannelId = null; // رابط مباشر لقناة قبل وصول قائمة القنوات

function render() {
  renderView();
  if (pendingChannelId && state.channelsLoaded) {
    const id = pendingChannelId;
    pendingChannelId = null;
    openPlayerById(id);
  }
}

function renderView() {
  const q = el.search.value.trim().toLowerCase();
  const network = state.networks.find((n) => n.id === state.networkId);

  el.back.hidden = state.view === "networks";
  el.fav.classList.toggle("on", state.view === "favorites");

  if (state.view === "networks") {
    el.title.textContent = "اختر باقتك";
    el.subtitle.textContent = "استمتع بأفضل التغطيات الرياضية العالمية والمحلية";
    el.search.placeholder = "ابحث عن باقتك المفضلة...";
    if (!state.networksLoaded || !state.allChannelsLoaded) return void (el.content.innerHTML = '<div class="spinner"></div>');
    if (state.networksError) return void (el.content.innerHTML = `<div class="state error">${escapeHtml(state.networksError)}</div>`);
    const withChannels = new Set((state.allChannels || []).map((c) => c.networkId));
    const list = state.networks.filter((n) => withChannels.has(n.id) && (n.name || "").toLowerCase().includes(q));
    if (!list.length) return void (el.content.innerHTML = `<div class="state">${q ? "لا توجد نتائج" : "لا توجد باقات متاحة حالياً"}</div>`);
    el.content.innerHTML = `<div class="grid">${list.map((n) => `
      <a class="card" href="#/n/${encodeURIComponent(n.id)}">
        <div class="logo">${logoHtml(n.logoUrl)}</div>
        <div class="name">${escapeHtml(n.name)}</div>
      </a>`).join("")}</div>`;
    return;
  }

  el.title.textContent = state.view === "favorites" ? "المفضلة" : (network?.name || "القنوات");
  el.subtitle.textContent = state.view === "favorites" ? "قنواتك المحفوظة على هذا الجهاز" : "اختر القناة للمشاهدة";
  el.search.placeholder = "ابحث عن قناة...";
  if (!state.channelsLoaded) return void (el.content.innerHTML = '<div class="spinner"></div>');

  const favs = getFavs();
  const list = state.channels.filter((c) => c.name.toLowerCase().includes(q));
  if (!list.length) {
    const empty = q ? "لا توجد نتائج" : state.view === "favorites" ? "لم تُضف أي قناة للمفضلة بعد.\nاضغط ★ على أي قناة لإضافتها." : "لا توجد قنوات في هذه الباقة";
    el.content.innerHTML = `<div class="state" style="white-space:pre-line">${empty}</div>`;
    return;
  }
  const base = state.view === "favorites" ? "#/fav" : `#/n/${encodeURIComponent(state.networkId)}`;
  el.content.innerHTML = `<div class="grid channels">${list.map((c) => `
    <a class="card" href="${base}/c/${encodeURIComponent(c.id)}">
      <button class="fav ${favs.has(c.id) ? "on" : ""}" data-fav="${escapeHtml(c.id)}" aria-label="مفضلة">${ICONS.star}</button>
      <div class="logo">${logoHtml(c.logoUrl)}</div>
      <div class="name">${escapeHtml(c.name)}</div>
    </a>`).join("")}</div>`;
}

el.search.addEventListener("input", render);
el.back.addEventListener("click", () => go("#/"));
el.fav.addEventListener("click", () => go(state.view === "favorites" ? "#/" : "#/fav"));
el.content.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fav]");
  if (!btn) return;
  e.preventDefault();
  const on = toggleFav(btn.dataset.fav);
  btn.classList.toggle("on", on);
  toast(on ? "أُضيفت إلى المفضلة" : "أُزيلت من المفضلة");
  if (!on && state.view === "favorites") {
    state.channels = state.channels.filter((c) => c.id !== btn.dataset.fav);
    render();
  }
});

// ---------- المشغل ----------
// يدعم عدة مشغلات ويب (engines.js): يبدأ بالمشغل المفضل، وإذا فشل قبل أن يعمل
// ينتقل تلقائياً للمشغل التالي، ثم يعرض المشغلات الخارجية كحل أخير.
const ENGINE_KEY = "rmtv_engine";
const START_TIMEOUT = 15000;

let current = null;        // { video, destroy } للمشغل الحالي
let attempt = 0;           // رقم المحاولة لتجاهل أحداث مشغل قديم
let retryCount = 0, retryTimer = null, startTimer = null;
let session = null;        // { ch, url, upgraded, engines, index, manual, played }

function getPreferredEngine() {
  try { return localStorage.getItem(ENGINE_KEY); } catch { return null; }
}
function setPreferredEngine(id) {
  try { localStorage.setItem(ENGINE_KEY, id); } catch {}
}

function openPlayerById(channelId) {
  const list = state.channels;
  const index = list.findIndex((c) => c.id === channelId);
  if (index < 0) {
    // القائمة لم تُحمَّل بعد؛ سيُعاد المحاولة عند وصول البيانات
    if (!state.channelsLoaded) { pendingChannelId = channelId; return; }
    toast("القناة غير متاحة", true);
    return void location.replace(listHash());
  }
  if (state.playing && state.playing.list[state.playing.index]?.id === channelId && !el.player.hidden) return;
  state.playing = { list, index };
  el.player.hidden = false;
  document.body.style.overflow = "hidden";
  playChannel(list[index]);
}

function destroyEngine() {
  attempt++;
  clearTimeout(retryTimer);
  clearTimeout(startTimer);
  if (current) {
    try { current.video?.pause(); } catch {}
    try { current.destroy(); } catch {}
    current = null;
  }
  el.host.innerHTML = "";
}

function stopPlayback() {
  destroyEngine();
  closePlayersSheet();
  session = null;
  el.yt.src = "about:blank";
  el.yt.hidden = true;
  el.host.hidden = false;
}

function closePlayer(navigate = true) {
  if (el.player.hidden) return;
  stopPlayback();
  el.player.hidden = true;
  document.body.style.overflow = "";
  state.playing = null;
  document.title = "RM TV";
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (navigate) {
    if (playerPushed) history.back();
    else location.replace(listHash());
  }
}

const currentChannel = () => state.playing?.list[state.playing.index];

// ---------- قائمة مشغلات الويب ----------
function renderEngines(container) {
  if (!session?.engines?.length) { container.innerHTML = ""; return; }
  const active = session.engines[session.index]?.id;
  container.innerHTML = session.engines.map((e) => `
    <button type="button" class="ext-item${e.id === active ? " active" : ""}" data-engine="${e.id}">
      ${escapeHtml(e.label)}${e.id === active ? " ✓" : ""}<small>${escapeHtml(e.desc)}</small>
    </button>`).join("");
}

// withEngines: يعرض أزرار مشغلات الويب تحت الرسالة لتجربة مشغل آخر
function showMsg(text, withEngines = false) {
  $("playerMsgText").textContent = text;
  if (withEngines) renderEngines($("playerMsgPlayers"));
  else $("playerMsgPlayers").innerHTML = "";
  el.msg.hidden = !text;
}

function openPlayersSheet() {
  if (!session?.engines?.length) return toast("لا توجد مشغلات بديلة لهذه القناة");
  renderEngines($("playersList"));
  $("playersSheet").hidden = false;
}
const closePlayersSheet = () => ($("playersSheet").hidden = true);

el.player.addEventListener("click", (e) => {
  const engineBtn = e.target.closest("[data-engine]");
  if (engineBtn && session) {
    const index = session.engines.findIndex((x) => x.id === engineBtn.dataset.engine);
    if (index >= 0) {
      setPreferredEngine(engineBtn.dataset.engine);
      closePlayersSheet();
      session.manual = true;
      session.played = false;
      retryCount = 0;
      startEngine(index);
    }
    return;
  }
  if (e.target === $("playersSheet")) closePlayersSheet();
});
$("playersBtn").addEventListener("click", openPlayersSheet);
$("playersClose").addEventListener("click", closePlayersSheet);
function busy(on) { el.spinner.hidden = !on; }

function youtubeId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function setSubtitle() {
  const net = state.networks.find((n) => n.id === session?.ch.networkId)?.name || "";
  const eng = session?.engines?.[session.index]?.label;
  el.network.textContent = [net, eng].filter(Boolean).join(" · ");
}

function playChannel(ch) {
  stopPlayback();
  retryCount = 0;
  showMsg("");
  busy(true);
  el.name.textContent = ch.name;
  document.title = `${ch.name} — RM TV`;

  const url = (ch.url || "").trim();
  const isYouTube = (ch.streamType || "").toLowerCase().includes("youtube") || /youtube\.com|youtu\.be/.test(url);

  if (isYouTube) {
    const id = youtubeId(url);
    const channelMatch = url.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
    let embed = null;
    if (id) embed = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
    else if (channelMatch) embed = `https://www.youtube-nocookie.com/embed/live_stream?channel=${channelMatch[1]}&autoplay=1&playsinline=1`;
    busy(false);
    session = { ch, engines: [] };
    setSubtitle();
    if (!embed) return showMsg("رابط يوتيوب غير صالح");
    el.host.hidden = true;
    el.yt.hidden = false;
    el.yt.src = embed;
    return;
  }

  if (!safeUrl(url)) { busy(false); return showMsg("رابط البث غير صالح", false); }

  const playUrl = url;
  const engines = enginesFor(playUrl);
  if (!engines.length) {
    busy(false);
    return showMsg("لا يوجد مشغل ويب يدعم هذا النوع من الروابط على جهازك.\nشاهدها من تطبيق RM TV.");
  }
  const pref = engines.findIndex((e) => e.id === getPreferredEngine());
  session = { ch, url: playUrl, engines, index: Math.max(pref, 0), manual: false, played: false, tried: new Set() };
  startEngine(session.index);
}

async function startEngine(index) {
  destroyEngine();
  const s = session;
  if (!s) return;
  const my = attempt;
  const engine = s.engines[index];
  s.index = index;
  s.tried.add(index);
  setSubtitle();
  busy(true);

  const fail = (err) => { if (my === attempt) onEngineFail(err); };
  try {
    current = await engine.start(el.host, s.url, { onFatal: fail });
  } catch (err) {
    return fail(err);
  }
  if (my !== attempt) { try { current?.destroy(); } catch {} return; }

  const v = current.video;
  if (v) {
    v.addEventListener("playing", () => {
      if (my !== attempt) return;
      clearTimeout(startTimer);
      s.played = true;
      retryCount = 0;
      busy(false);
      showMsg("");
    });
    v.addEventListener("waiting", () => { if (my === attempt) busy(true); });
    // بعض سيرفرات IPTV تنهي المقطع فجأة؛ نعيد التشغيل بنفس المشغل
    v.addEventListener("ended", () => { if (my === attempt) startEngine(s.index); });
    v.play?.().catch(() => {});
  }
  // إذا لم يبدأ التشغيل خلال المهلة نعتبره فشلاً
  startTimer = setTimeout(() => { if (!s.played) fail(new Error("timeout")); }, START_TIMEOUT);
}

function onEngineFail(err) {
  const s = session;
  if (!s) return;
  console.warn("player:", s.engines[s.index]?.id, err?.message);
  clearTimeout(startTimer);

  // كان يعمل ثم انقطع: إعادة اتصال بنفس المشغل
  if (s.played && retryCount < MAX_RETRIES) {
    retryCount++;
    s.played = false;
    showMsg(`تقطيع في البث. جاري إعادة الاتصال...\nمحاولة ${retryCount}/${MAX_RETRIES}`);
    busy(true);
    retryTimer = setTimeout(() => startEngine(s.index), 3000);
    return;
  }

  // التالي في القائمة (إذا لم يختر المستخدم مشغلاً بنفسه)
  const next = s.engines.findIndex((_, i) => !s.tried.has(i));
  if (!s.manual && next >= 0) {
    showMsg(`جاري التجربة بـ ${s.engines[next].label}...`);
    retryTimer = setTimeout(() => startEngine(next), 600);
    return;
  }

  destroyEngine();
  busy(false);
  showMsg(s.manual
    ? `تعذر التشغيل بـ ${s.engines[s.index].label}.\nجرّب مشغلاً آخر:`
    : "تعذر تشغيل القناة بكل المشغلات.\nحاول لاحقاً أو جرّب مشغلاً آخر:", true);
}

function step(delta) {
  const p = state.playing;
  if (!p || !p.list.length) return;
  const index = (p.index + delta + p.list.length) % p.list.length;
  state.playing = { list: p.list, index };
  location.replace(listHash() + "/c/" + encodeURIComponent(p.list[index].id));
  playChannel(p.list[index]);
}

$("closePlayer").addEventListener("click", () => closePlayer());
$("nextCh").addEventListener("click", () => step(1));
$("prevCh").addEventListener("click", () => step(-1));
$("reloadCh").addEventListener("click", () => {
  const ch = state.playing?.list[state.playing.index];
  if (ch) playChannel(ch);
});
$("fsBtn").addEventListener("click", async () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  // ملء الشاشة للمشغل كاملاً (وليس منطقة الفيديو فقط) حتى تبقى قائمة المشغلات والأزرار ظاهرة
  if (el.player.requestFullscreen) {
    await el.player.requestFullscreen().catch(() => {});
    screen.orientation?.lock?.("landscape").catch(() => {});
  } else if (current?.video?.webkitEnterFullscreen) {
    current.video.webkitEnterFullscreen(); // iOS
  }
});

document.addEventListener("keydown", (e) => {
  if (el.player.hidden) return;
  if (e.key === "ArrowUp" || e.key === "MediaTrackNext") { e.preventDefault(); step(1); }
  else if (e.key === "ArrowDown" || e.key === "MediaTrackPrevious") { e.preventDefault(); step(-1); }
  else if (e.key === "Escape" && !document.fullscreenElement) history.back();
  else if (e.key === "r" || e.key === "F5") { e.preventDefault(); $("reloadCh").click(); }
});

// ---------- PWA ----------
registerServiceWorker("sw.js", "./");
setupInstallBanner({
  banner: $("installBanner"), installBtn: $("installBtn"), closeBtn: $("installClose"),
  text: $("installText"), storageKey: "rmtv_install_dismissed",
});

onRoute();
