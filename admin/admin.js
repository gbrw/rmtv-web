import { firebaseConfig, FIREBASE_SDK, ADMIN_EMAILS } from "../config.js";
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
  const sub = isNet ? [`الترتيب: ${item.order ?? 0}`, item.category].filter(Boolean).join(" · ") : item.url || "";
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
        <button class="icon-btn" data-act="edit" aria-label="تعديل">${ICONS.edit}</button>
        <button class="icon-btn danger" data-act="delete" aria-label="حذف">${ICONS.trash}</button>
      </div>
    </div>`;
}

function render() {
  const q = $("search").value.trim().toLowerCase();
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

function confirmDialog(text) {
  const d = $("confirmDialog");
  $("confirmText").textContent = text;
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

// ---------- PWA ----------
registerServiceWorker("../sw.js", "../");
setupInstallBanner({
  banner: $("installBanner"), installBtn: $("installBtn"), closeBtn: $("installClose"),
  text: $("installText"), storageKey: "rmtv_admin_install_dismissed",
});
