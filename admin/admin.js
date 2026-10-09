import { firebaseConfig, FIREBASE_SDK, ADMIN_EMAILS } from "../config.js";
import { fetchMatches, statusText, dayKey } from "../matches.js";
import { parseM3U, groupsOf, normalizeServer, xtreamFromUrl } from "../iptv.js";
import { registerServiceWorker, setupInstallBanner, toast, escapeHtml, safeUrl, ICONS } from "../common.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const {
  getFirestore, collection, doc, query, where, onSnapshot, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch, deleteField,
} = await import(`${FIREBASE_SDK}/firebase-firestore.js`);
const {
  getAuth, onAuthStateChanged, signOut, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  setPersistence, browserLocalPersistence,
} = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
auth.languageCode = "ar";
setPersistence(auth, browserLocalPersistence).catch(() => {});

const $ = (id) => document.getElementById(id);
const UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

$("searchIcon").outerHTML = ICONS.search;
$("backBtn").innerHTML = ICONS.back;
$("updateBtn").innerHTML = ICONS.update;
$("logoutBtn").innerHTML = ICONS.logout;
$("installClose").innerHTML = ICONS.close;
document.querySelectorAll(".dialog-head [data-close]").forEach((b) => (b.innerHTML = ICONS.close));
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

const state = {
  networks: [],
  channels: [],
  networksLoaded: false,
  channelsLoaded: false,
  networkId: null,
};
let unsubNetworks = null;
let unsubChannels = null;

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const errMsg = (e) => (e?.code === "permission-denied" ? "لا تملك صلاحية التعديل" : e?.message || String(e));

// ---------- تسجيل الدخول ----------
const AUTH_ERRORS = {
  "auth/user-disabled": "هذا الحساب موقوف",
  "auth/too-many-requests": "محاولات كثيرة، حاول لاحقاً",
  "auth/network-request-failed": "لا يوجد اتصال بالإنترنت",
  "auth/operation-not-allowed": "تسجيل الدخول بـ Google غير مفعّل في Firebase",
  "auth/unauthorized-domain": "هذا النطاق غير مضاف في Firebase (Authorized domains)",
  "auth/configuration-not-found": "خدمة تسجيل الدخول غير مفعّلة في Firebase",
};
const showLoginError = (err) => {
  if (!err || err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
  $("loginError").textContent = AUTH_ERRORS[err.code] || err.message;
  $("loginError").hidden = false;
};

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// نتيجة الدخول عند الرجوع من صفحة Google (في حال استُخدم redirect)
getRedirectResult(auth).catch(showLoginError);

$("googleBtn").addEventListener("click", async () => {
  $("googleBtn").disabled = true;
  $("loginError").hidden = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // بعض المتصفحات وتطبيقات الـ PWA المثبتة تمنع النوافذ المنبثقة
    if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider).catch(showLoginError);
    } else {
      showLoginError(err);
    }
  } finally {
    $("googleBtn").disabled = false;
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));
$("deniedLogout").addEventListener("click", () => signOut(auth));

const isAdmin = (user) =>
  !!user?.email && user.emailVerified && ADMIN_EMAILS.includes(user.email.toLowerCase());

onAuthStateChanged(auth, (u) => {
  window.__bootDone?.();
  const user = isAdmin(u) ? u : null;
  $("loginView").hidden = !!u;
  $("deniedView").hidden = !u || !!user;
  $("deniedEmail").textContent = u?.email || "";
  $("appView").hidden = !user;
  if (user) {
    startNetworks();
    onRoute();
  } else {
    unsubNetworks?.(); unsubNetworks = null;
    unsubChannels?.(); unsubChannels = null;
    state.networksLoaded = state.channelsLoaded = false;
  }
});

// ---------- البيانات ----------
function startNetworks() {
  if (unsubNetworks) return;
  unsubNetworks = onSnapshot(
    collection(db, "networks"),
    (snap) => {
      state.networks = snap.docs.map((d) => ({ id: d.id, isActive: true, ...d.data() })).sort(byOrder);
      state.networksLoaded = true;
      render();
    },
    (err) => toast("خطأ: " + errMsg(err), true)
  );
}

function watchChannels(networkId) {
  unsubChannels?.();
  state.channels = [];
  state.channelsLoaded = false;
  unsubChannels = onSnapshot(
    query(collection(db, "channels"), where("networkId", "==", networkId)),
    (snap) => {
      state.channels = snap.docs.map((d) => ({ id: d.id, isActive: true, streamType: "direct", ...d.data() })).sort(byOrder);
      state.channelsLoaded = true;
      render();
    },
    (err) => toast("خطأ: " + errMsg(err), true)
  );
}

// ---------- التوجيه ----------
function onRoute() {
  if (!isAdmin(auth.currentUser)) return;
  const wasMatches = state.matchesView;
  state.matchesView = location.hash.startsWith("#/matches");
  if (state.matchesView && !wasMatches) { $("search").value = ""; loadMatchesAdmin(); }
  const m = location.hash.match(/^#\/n\/([^/]+)/);
  const networkId = m ? decodeURIComponent(m[1]) : null;
  if (networkId !== state.networkId) {
    state.networkId = networkId;
    $("search").value = "";
    if (networkId) watchChannels(networkId);
    else { unsubChannels?.(); unsubChannels = null; }
    window.scrollTo(0, 0);
  }
  render();
}
window.addEventListener("hashchange", onRoute);
$("backBtn").addEventListener("click", () => (location.hash = "#/"));

// ---------- مباريات اليوم: ربط كل مباراة بقناة ----------
// المباريات تُجلب تلقائياً (matches.js)، والمدير يختار القناة الناقلة فتُحفظ في matchLinks/{رقم المباراة}
state.matches = [];
state.matchesLoaded = false;
state.matchLinks = {};
state.allChannels = [];

async function loadMatchesAdmin() {
  state.matchesLoaded = false;
  render();
  try {
    const [matches, links, chans] = await Promise.all([
      fetchMatches(),
      getDocs(query(collection(db, "matchLinks"), where("date", "==", dayKey()))),
      getDocs(collection(db, "channels")),
    ]);
    state.matches = matches;
    state.matchLinks = Object.fromEntries(links.docs.map((d) => [d.id, d.data().channelId]));
    state.allChannels = chans.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.isActive !== false);
  } catch (err) {
    toast("تعذر جلب المباريات: " + errMsg(err), true);
  }
  state.matchesLoaded = true;
  render();
}

function channelOptions(selectedId) {
  const byNet = state.networks.map((n) => {
    const chans = state.allChannels.filter((c) => c.networkId === n.id).sort(byOrder);
    if (!chans.length) return "";
    return `<optgroup label="${escapeHtml(n.name)}">${chans.map((c) =>
      `<option value="${escapeHtml(c.id)}"${c.id === selectedId ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</optgroup>`;
  }).join("");
  return `<option value="">— بدون قناة —</option>${byNet}`;
}

function renderMatchesAdmin(q) {
  $("pageTitle").textContent = "مباريات اليوم";
  if (!state.matchesLoaded) {
    $("pageSub").textContent = "";
    return void ($("list").innerHTML = '<div class="spinner"></div>');
  }
  const linked = state.matches.filter((m) => state.matchLinks[m.id]).length;
  $("pageSub").textContent = `${state.matches.length} مباراة · ${linked} مرتبطة بقناة`;
  const list = state.matches.filter((m) => !q || `${m.home.name} ${m.away.name} ${m.league.name}`.toLowerCase().includes(q));
  if (!list.length) {
    $("list").innerHTML = `<div class="state">${q ? "لا توجد نتائج" : "لا توجد مباريات في الدوريات المتابعة اليوم"}</div>`;
    return;
  }
  $("list").innerHTML = list.map((m) => `
    <div class="item match-item${state.matchLinks[m.id] ? "" : " inactive"}">
      <div class="info">
        <strong>${escapeHtml(m.home.name)} × ${escapeHtml(m.away.name)}</strong>
        <span style="direction:rtl">${escapeHtml(m.league.name)} · ${escapeHtml(statusText(m))}</span>
      </div>
      <select class="input match-select" data-match="${escapeHtml(m.id)}" aria-label="القناة الناقلة">${channelOptions(state.matchLinks[m.id])}</select>
    </div>`).join("");
}

$("list").addEventListener("change", async (e) => {
  const sel = e.target.closest("select[data-match]");
  if (!sel) return;
  const m = state.matches.find((x) => x.id === sel.dataset.match);
  if (!m) return;
  try {
    if (sel.value) {
      await setDoc(doc(db, "matchLinks", m.id), {
        date: dayKey(), channelId: sel.value,
        home: m.home.name, away: m.away.name, league: m.league.name, start: m.start.toISOString(),
      });
      state.matchLinks[m.id] = sel.value;
      toast("تم ربط المباراة بالقناة");
    } else {
      await deleteDoc(doc(db, "matchLinks", m.id));
      delete state.matchLinks[m.id];
      toast("أُزيل ربط القناة");
    }
    render();
  } catch (err) {
    toast("فشل الحفظ: " + errMsg(err), true);
  }
});

$("matchesBtn").addEventListener("click", () => (location.hash = "#/matches"));

// ---------- العرض ----------
function thumb(url) {
  const safe = safeUrl(url);
  return `<div class="thumb">${safe ? `<img src="${escapeHtml(safe)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ICONS.tv}</div>`;
}

// نفس منطق نسخة الويب (app.js): https ويوتيوب تظهر، http تُخفى دائماً، والمدير يمكنه إخفاء أي قناة
function webVisible(c) {
  if (c.showOnWeb === false) return false;
  const url = (c.url || "").trim();
  return c.streamType === "youtube" || /youtube\.com|youtu\.be/.test(url) || url.startsWith("https://");
}

// canUp/canDown:أزرار الترتيب تعمل على القائمة الكاملة فقط (بدون بحث)
function itemHtml(item, kind, canUp, canDown) {
  const isNet = kind === "network";
  const sub = isNet ? [`الترتيب: ${item.order ?? 0}`, item.category, item.source ? (item.source.type === "xtream" ? "Xtream" : "M3U") : ""].filter(Boolean).join(" · ") : item.url || "";
  const info = isNet
    ? `<a class="info" href="#/n/${encodeURIComponent(item.id)}"><strong>${escapeHtml(item.name)}</strong><span style="direction:rtl">${escapeHtml(sub)}</span></a>`
    : `<div class="info"><strong>${escapeHtml(item.name)}${item.streamType === "youtube" ? " · يوتيوب" : ""}${webVisible(item) ? "" : ' <em class="badge">مخفية من الويب</em>'}</strong><span>${escapeHtml(sub)}</span></div>`;
  return `
    <div class="item ${item.isActive === false ? "inactive" : ""}" data-id="${escapeHtml(item.id)}" data-kind="${kind}">
      ${thumb(item.logoUrl)}
      ${info}
      <div class="actions">
        <div class="order-btns">
          <button data-act="up" aria-label="لأعلى" ${canUp ? "" : "disabled"}>${UP}</button>
          <button data-act="down" aria-label="لأسفل" ${canDown ? "" : "disabled"}>${DOWN}</button>
        </div>
        <label class="switch" title="تفعيل/إيقاف"><input type="checkbox" data-act="toggle" ${item.isActive !== false ? "checked" : ""}><span></span></label>
        ${kind === "network" && item.source && item.source.type !== "file" ? `<button class="icon-btn" data-act="sync" aria-label="تحديث القنوات من المصدر" title="تحديث القنوات من المصدر">${ICONS.reload}</button>` : ""}
        <button class="icon-btn" data-act="edit" aria-label="تعديل">${ICONS.edit}</button>
        <button class="icon-btn danger" data-act="delete" aria-label="حذف">${ICONS.trash}</button>
      </div>
    </div>`;
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  $("addBtn").hidden = !!state.matchesView;
  $("importBtn").hidden = !!state.matchesView || !!state.networkId;
  if (state.matchesView) { $("backBtn").hidden = false; return renderMatchesAdmin(q); }
  const inNetwork = !!state.networkId;
  const network = state.networks.find((n) => n.id === state.networkId);
  $("backBtn").hidden = !inNetwork;
  $("addBtn").innerHTML = `${ICONS.plus}<span>${inNetwork ? "إضافة قناة" : "إضافة باقة"}</span>`;
  $("pageTitle").textContent = inNetwork ? `قنوات: ${network?.name || ""}` : "الباقات";

  const loaded = inNetwork ? state.channelsLoaded : state.networksLoaded;
  if (!loaded) return void ($("list").innerHTML = '<div class="spinner"></div>');

  const all = inNetwork ? state.channels : state.networks;
  const active = all.filter((x) => x.isActive !== false).length;
  $("pageSub").textContent = `${all.length} ${inNetwork ? "قناة" : "باقة"} · ${active} مفعّلة`;

  const list = q ? all.filter((x) => (x.name || "").toLowerCase().includes(q) || (x.url || "").toLowerCase().includes(q)) : all;
  if (!list.length) {
    $("list").innerHTML = `<div class="state">${q ? "لا توجد نتائج" : inNetwork ? "لا توجد قنوات في هذه الباقة" : "لا توجد باقات بعد"}</div>`;
    return;
  }
  const kind = inNetwork ? "channel" : "network";
  $("list").innerHTML = list
    .map((x, i) => itemHtml(x, kind, !q && i > 0, !q && i < list.length - 1))
    .join("");
}
$("search").addEventListener("input", render);

// ---------- الإجراءات ----------
$("list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const row = btn.closest(".item");
  const kind = row.dataset.kind;
  const list = kind === "network" ? state.networks : state.channels;
  const index = list.findIndex((x) => x.id === row.dataset.id);
  const item = list[index];
  if (!item) return;
  const act = btn.dataset.act;

  if (act === "sync") return syncNetwork(item);
  if (act === "edit") return kind === "network" ? openNetworkForm(item) : openChannelForm(item);
  if (act === "delete") return kind === "network" ? deleteNetwork(item) : deleteChannel(item);
  if (act === "up" || act === "down") return move(kind, list, index, act === "up" ? -1 : 1);
});

$("list").addEventListener("change", async (e) => {
  const input = e.target.closest('input[data-act="toggle"]');
  if (!input) return;
  const row = input.closest(".item");
  const col = row.dataset.kind === "network" ? "networks" : "channels";
  try {
    await updateDoc(doc(db, col, row.dataset.id), { isActive: input.checked });
    toast(input.checked ? "تم التفعيل" : "تم الإيقاف");
  } catch (err) {
    input.checked = !input.checked;
    toast("فشل في تحديث الحالة: " + errMsg(err), true);
  }
});

// تبديل الترتيب مع العنصر المجاور، مع إعادة ترقيم القائمة كاملة لتجنّب الأرقام المكررة
async function move(kind, list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const col = kind === "network" ? "networks" : "channels";
  const batch = writeBatch(db);
  reordered.forEach((x, i) => { if (x.order !== i + 1) batch.update(doc(db, col, x.id), { order: i + 1 }); });
  try { await batch.commit(); } catch (err) { toast("فشل تغيير الترتيب: " + errMsg(err), true); }
}

function confirmDialog(text, okLabel = "حذف") {
  const d = $("confirmDialog");
  $("confirmText").textContent = text;
  const ok = d.querySelector("button[value=yes]");
  ok.textContent = okLabel;
  ok.className = okLabel === "حذف" ? "btn btn-danger" : "btn btn-primary";
  d.returnValue = "";
  d.showModal();
  return new Promise((resolve) => d.addEventListener("close", () => resolve(d.returnValue === "yes"), { once: true }));
}

async function deleteNetwork(n) {
  const chans = await getDocs(query(collection(db, "channels"), where("networkId", "==", n.id))).catch(() => null);
  const count = chans?.size ?? 0;
  const ok = await confirmDialog(`حذف باقة «${n.name}»${count ? ` وجميع قنواتها (${count})` : ""}؟ لا يمكن التراجع.`);
  if (!ok) return;
  try {
    // writeBatch يقبل 500 عملية كحد أقصى
    const refs = [...(chans?.docs.map((d) => d.ref) ?? []), doc(db, "networks", n.id)];
    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(db);
      refs.slice(i, i + 450).forEach((r) => batch.delete(r));
      await batch.commit();
    }
    toast("تم الحذف");
  } catch (err) {
    toast("فشل الحذف: " + errMsg(err), true);
  }
}

async function deleteChannel(c) {
  if (!(await confirmDialog(`حذف قناة «${c.name}»؟`))) return;
  try { await deleteDoc(doc(db, "channels", c.id)); toast("تم الحذف"); }
  catch (err) { toast("فشل الحذف: " + errMsg(err), true); }
}

$("addBtn").addEventListener("click", () => (state.networkId ? openChannelForm(null) : openNetworkForm(null)));

// ---------- معاينة الشعار ----------
function bindLogoPreview(inputId, previewId) {
  const update = () => {
    const safe = safeUrl($(inputId).value.trim());
    $(previewId).innerHTML = safe ? `<img src="${escapeHtml(safe)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  };
  $(inputId).addEventListener("input", update);
  return update;
}
const updateNetLogo = bindLogoPreview("nLogo", "nLogoPreview");
const updateChLogo = bindLogoPreview("cLogo", "cLogoPreview");

const nextOrder = (list) => list.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;

// ---------- نموذج الباقة ----------
let editingNetwork = null;
function openNetworkForm(n) {
  editingNetwork = n;
  $("networkDialogTitle").textContent = n ? "تعديل الباقة" : "إضافة باقة";
  $("nSave").textContent = n ? "تحديث" : "حفظ";
  $("nName").value = n?.name || "";
  $("nLogo").value = n?.logoUrl || "";
  $("nCategory").value = n?.category || "";
  // اقتراح التصنيفات المستخدمة سابقاً
  const cats = [...new Set(state.networks.map((x) => (x.category || "").trim()).filter(Boolean))];
  const dl = $("categoryList");
  cats.forEach((c) => { if (![...dl.options].some((o) => o.value === c)) dl.append(new Option(c, c)); });
  $("nOrder").value = n ? n.order ?? 0 : nextOrder(state.networks);
  $("nActive").checked = n ? n.isActive !== false : true;
  updateNetLogo();
  $("networkDialog").showModal();
}

$("networkForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("nName").value.trim();
  if (!name) return toast("أدخل الاسم", true);
  const data = {
    name,
    logoUrl: $("nLogo").value.trim(),
    // التصنيف يظهر كشرائح في تطبيق أندرويد (رياضة، أخبار...)
    category: $("nCategory").value.trim(),
    order: parseInt($("nOrder").value, 10) || 0,
    isActive: $("nActive").checked,
  };
  $("nSave").disabled = true;
  try {
    if (editingNetwork) await setDoc(doc(db, "networks", editingNetwork.id), data, { merge: true });
    else await addDoc(collection(db, "networks"), data);
    $("networkDialog").close();
    toast("تم الحفظ بنجاح");
  } catch (err) {
    toast("فشل الحفظ: " + errMsg(err), true);
  } finally {
    $("nSave").disabled = false;
  }
});

// ---------- نموذج القناة ----------
let editingChannel = null;
function openChannelForm(c) {
  editingChannel = c;
  $("channelDialogTitle").textContent = c ? "تعديل القناة" : "إضافة قناة";
  $("cSave").textContent = c ? "تحديث القناة" : "حفظ";
  $("cName").value = c?.name || "";
  $("cLogo").value = c?.logoUrl || "";
  $("cUrl").value = c?.url || "";
  $("cType").value = c?.streamType === "youtube" ? "youtube" : "direct";
  $("cOrder").value = c ? c.order ?? 0 : nextOrder(state.channels);
  $("cActive").checked = c ? c.isActive !== false : true;
  $("cWeb").value = c?.showOnWeb === false ? "hide" : "auto";
  $("cNetwork").innerHTML = state.networks
    .map((n) => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.name)}</option>`).join("");
  $("cNetwork").value = c?.networkId || state.networkId;
  updateChLogo();
  $("channelDialog").showModal();
}

// اختيار نوع يوتيوب تلقائياً عند لصق رابط يوتيوب
$("cUrl").addEventListener("input", () => {
  if (/youtube\.com|youtu\.be/i.test($("cUrl").value)) $("cType").value = "youtube";
});

$("channelForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("cName").value.trim();
  const url = $("cUrl").value.trim();
  if (!name || !url) return toast("أكمل البيانات المطلوبة", true);
  const data = {
    name,
    logoUrl: $("cLogo").value.trim(),
    url,
    streamType: $("cType").value,
    networkId: $("cNetwork").value || state.networkId,
    order: parseInt($("cOrder").value, 10) || 0,
    isActive: $("cActive").checked,
  };
  // "تلقائي" = بدون الحقل، فتقرر نسخة الويب حسب نوع الرابط
  const web = $("cWeb").value === "hide" ? false : undefined;
  if (web !== undefined) data.showOnWeb = web;
  else if (editingChannel) data.showOnWeb = deleteField();
  $("cSave").disabled = true;
  try {
    if (editingChannel) await setDoc(doc(db, "channels", editingChannel.id), data, { merge: true });
    else await addDoc(collection(db, "channels"), data);
    $("channelDialog").close();
    toast("تم الحفظ");
  } catch (err) {
    toast("خطأ: " + errMsg(err), true);
  } finally {
    $("cSave").disabled = false;
  }
});

// ---------- تحديث النظام (settings/appUpdate) ----------
$("updateBtn").addEventListener("click", async () => {
  $("uVersion").value = "";
  $("uUrl").value = "";
  $("uForce").checked = false;
  $("updateDialog").showModal();
  try {
    const snap = await getDoc(doc(db, "settings", "appUpdate"));
    if (snap.exists()) {
      const d = snap.data();
      $("uVersion").value = d.latestVersionCode ?? 1;
      $("uUrl").value = d.apkUrl || "";
      $("uForce").checked = !!d.forceUpdate;
    }
  } catch (err) {
    toast("خطأ: " + errMsg(err), true);
  }
});

$("updateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const version = parseInt($("uVersion").value, 10);
  const apkUrl = $("uUrl").value.trim();
  if (!version || !apkUrl) return toast("جميع الحقول مطلوبة!", true);
  $("uSave").disabled = true;
  try {
    await setDoc(doc(db, "settings", "appUpdate"), {
      latestVersionCode: version,
      apkUrl,
      forceUpdate: $("uForce").checked,
    });
    $("updateDialog").close();
    toast("تم نشر التحديث بنجاح للمستخدمين!");
  } catch (err) {
    toast("فشل نشر التحديث: " + errMsg(err), true);
  } finally {
    $("uSave").disabled = false;
  }
});

// ---------- استيراد قنوات من Xtream / M3U ----------
// الخطوة 1: جلب القائمة (ملف M3U يُقرأ هنا، والروابط تُقرأ عبر api/source لأن المتصفح لا يستطيع قراءتها مباشرة)
// الخطوة 2: اختيار التصنيفات ثم إضافتها كباقات وقنوات في Firestore. مصدر كل باقة يُحفظ فيها لتحديثها لاحقاً.

const LARGE_IMPORT = 600;
const imp = { channels: [], groups: [], source: null, selected: new Set() };

const impType = () => document.querySelector('input[name="impType"]:checked').value;
const impMode = () => document.querySelector('input[name="impMode"]:checked').value;

function impError(msg) {
  $("impError").textContent = msg || "";
  $("impError").hidden = !msg;
}
function impProgress(msg) {
  $("impProgress").textContent = msg || "";
  $("impProgress").hidden = !msg;
}

function openImport() {
  imp.channels = []; imp.groups = []; imp.source = null; imp.selected = new Set();
  $("impStep1").hidden = false;
  $("impStep2").hidden = true;
  $("impNext").textContent = "جلب القنوات";
  $("impNext").disabled = false;
  impError(); impProgress();
  $("importDialog").showModal();
}
$("importBtn").addEventListener("click", openImport);

document.querySelectorAll('input[name="impType"]').forEach((r) => r.addEventListener("change", () => {
  document.querySelectorAll("#impStep1 [data-type]").forEach((el) => (el.hidden = el.dataset.type !== impType()));
  impError();
}));
document.querySelectorAll('input[name="impMode"]').forEach((r) => r.addEventListener("change", () => {
  $("impSingleName").hidden = impMode() !== "single";
}));

/** يطلب القنوات من الدالة api/source (للروابط و Xtream) */
async function fetchSource(source) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch("/api/source/", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(source),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data.channels || [];
}

async function readSourceFromForm() {
  const type = impType();
  if (type === "file") {
    const file = $("impFile").files[0];
    if (!file) throw new Error("اختر ملف القائمة");
    return { source: { type: "file", name: file.name }, channels: parseM3U(await file.text()) };
  }
  if (type === "xtream") {
    const source = { type: "xtream", server: normalizeServer($("impServer").value), username: $("impUser").value.trim(), password: $("impPass").value.trim(), ext: $("impExt").value };
    if (!source.server || !source.username || !source.password) throw new Error("أكمل رابط السيرفر واسم المستخدم وكلمة المرور");
    return { source, channels: await fetchSource(source) };
  }
  const url = $("impUrl").value.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("أدخل رابط القائمة كاملاً (يبدأ بـ http)");
  // روابط get.php هي حسابات Xtream؛ نحفظها كـ Xtream لأن قراءتها عبر الـ API أسرع وأدق
  const xt = xtreamFromUrl(url);
  const source = xt ? { type: "xtream", ...xt } : { type: "m3u", url };
  return { source, channels: await fetchSource(source) };
}

function renderImportGroups() {
  const q = $("impSearch").value.trim().toLowerCase();
  $("impGroups").innerHTML = imp.groups
    .filter((g) => !q || g.name.toLowerCase().includes(q))
    .map((g) => `<label class="imp-group"><input type="checkbox" value="${escapeHtml(g.name)}" ${imp.selected.has(g.name) ? "checked" : ""}><span>${escapeHtml(g.name)}</span><em>${g.count}</em></label>`)
    .join("") || '<div class="state">لا توجد نتائج</div>';
  updateImportSummary();
}

function updateImportSummary() {
  const total = imp.groups.filter((g) => imp.selected.has(g.name)).reduce((s, g) => s + g.count, 0);
  $("impSummary").textContent = `${imp.channels.length} قناة في ${imp.groups.length} تصنيف · المحدد: ${imp.selected.size} تصنيف (${total} قناة)`;
  $("impWarn").hidden = total <= LARGE_IMPORT;
  $("impWarn").textContent = `تنبيه: ${total} قناة عدد كبير. التطبيق يحمّل كل القنوات المفعّلة عند فتحه، والعدد الكبير يبطّئه ويستهلك حصة Firebase المجانية. يُفضّل اختيار التصنيفات التي تحتاجها فقط.`;
  $("impNext").textContent = total ? `استيراد ${total} قناة` : "اختر تصنيفاً واحداً على الأقل";
  $("impNext").disabled = !total;
}

$("impGroups").addEventListener("change", (e) => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  cb.checked ? imp.selected.add(cb.value) : imp.selected.delete(cb.value);
  updateImportSummary();
});
$("impSearch").addEventListener("input", renderImportGroups);
$("impAll").addEventListener("click", () => {
  const q = $("impSearch").value.trim().toLowerCase();
  imp.groups.filter((g) => !q || g.name.toLowerCase().includes(q)).forEach((g) => imp.selected.add(g.name));
  renderImportGroups();
});
$("impNone").addEventListener("click", () => { imp.selected.clear(); renderImportGroups(); });

$("importForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  impError();
  $("impNext").disabled = true;
  try {
    if (!$("impStep1").hidden) {
      impProgress("جاري جلب القنوات من المصدر…");
      const { source, channels } = await readSourceFromForm();
      if (!channels.length) throw new Error("لم يتم العثور على قنوات في هذا المصدر");
      imp.source = source;
      imp.channels = channels;
      imp.groups = groupsOf(channels);
      imp.selected = new Set();
      $("impSearch").value = "";
      $("impName").value = source.type === "file" ? source.name.replace(/\.[^.]+$/, "") : "";
      $("impStep1").hidden = true;
      $("impStep2").hidden = false;
      impProgress();
      renderImportGroups();
      return;
    }
    await runImport();
  } catch (err) {
    impProgress();
    impError(errMsg(err));
  } finally {
    if (!$("impStep2").hidden) updateImportSummary(); else $("impNext").disabled = false;
  }
});

/** كتابة القنوات على دفعات (Firestore يقبل 500 عملية في الدفعة) */
async function writeChannels(networkId, channels, onProgress) {
  for (let i = 0; i < channels.length; i += 450) {
    const batch = writeBatch(db);
    channels.slice(i, i + 450).forEach((c, j) => {
      batch.set(doc(collection(db, "channels")), {
        name: c.name, logoUrl: c.logo || "", url: c.url, streamType: "direct",
        networkId, order: i + j + 1, isActive: true, imported: true,
      });
    });
    await batch.commit();
    onProgress?.(Math.min(i + 450, channels.length));
  }
}

async function runImport() {
  const groups = imp.groups.filter((g) => imp.selected.has(g.name)).map((g) => g.name);
  const category = $("impCategory").value.trim();
  const source = imp.source.type === "file" ? { type: "file" } : imp.source;
  let order = nextOrder(state.networks);
  let done = 0;
  const total = imp.channels.filter((c) => imp.selected.has(c.group)).length;
  const progress = (n) => impProgress(`جاري الإضافة… ${done + n} / ${total}`);

  if (impMode() === "single") {
    const name = $("impName").value.trim();
    if (!name) throw new Error("أدخل اسم الباقة");
    const ref = await addDoc(collection(db, "networks"), {
      name, logoUrl: "", order, isActive: true, ...(category ? { category } : {}), source: { ...source, groups },
    });
    await writeChannels(ref.id, imp.channels.filter((c) => imp.selected.has(c.group)), progress);
  } else {
    for (const g of groups) {
      const ref = await addDoc(collection(db, "networks"), {
        name: g, logoUrl: "", order: order++, isActive: true, ...(category ? { category } : {}), source: { ...source, groups: [g] },
      });
      const chans = imp.channels.filter((c) => c.group === g);
      await writeChannels(ref.id, chans, progress);
      done += chans.length;
    }
  }
  impProgress();
  $("importDialog").close();
  toast(`تمت إضافة ${total} قناة`);
}

/** تحديث قنوات باقة مستوردة من مصدرها (يستبدل القنوات المستوردة ويُبقي المضافة يدوياً) */
async function syncNetwork(n) {
  const src = n.source;
  if (!src || src.type === "file") return toast("هذه الباقة ليس لها رابط مصدر للتحديث", true);
  if (!(await confirmDialog(`تحديث قنوات «${n.name}» من المصدر؟ ستُستبدل القنوات المستوردة بالقائمة الحالية من السيرفر.`, "تحديث"))) return;
  toast("جاري التحديث من المصدر…");
  try {
    const { groups, ...fetchable } = src;
    const fresh = (await fetchSource(fetchable)).filter((c) => !groups?.length || groups.includes(c.group));
    if (!fresh.length) throw new Error("لم يتم العثور على قنوات في المصدر");
    const old = await getDocs(query(collection(db, "channels"), where("networkId", "==", n.id)));
    const oldImported = old.docs.filter((d) => d.data().imported === true);
    // نحافظ على إيقاف القنوات التي أوقفها المدير يدوياً
    const disabled = new Set(oldImported.filter((d) => d.data().isActive === false).map((d) => d.data().name));
    for (let i = 0; i < oldImported.length; i += 450) {
      const batch = writeBatch(db);
      oldImported.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await writeChannels(n.id, fresh);
    if (disabled.size) {
      const now = await getDocs(query(collection(db, "channels"), where("networkId", "==", n.id)));
      const batch = writeBatch(db);
      now.docs.filter((d) => d.data().imported && disabled.has(d.data().name)).slice(0, 450).forEach((d) => batch.update(d.ref, { isActive: false }));
      await batch.commit();
    }
    toast(`تم التحديث: ${fresh.length} قناة`);
  } catch (err) {
    toast("فشل التحديث: " + errMsg(err), true);
  }
}

// ---------- PWA ----------
registerServiceWorker("../sw.js", "../");
setupInstallBanner({
  banner: $("installBanner"), installBtn: $("installBtn"), closeBtn: $("installClose"),
  text: $("installText"), storageKey: "rmtv_admin_install_dismissed",
});
