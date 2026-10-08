// مشغلات الويب: كل مشغل يُحمَّل عند الحاجة فقط من CDN.
// كل محرك يُنشئ عناصره داخل host ويعيد { video, destroy }.
// callbacks: onFatal(err) عند فشل لا يمكن تجاوزه.

const CDN = "https://cdn.jsdelivr.net/npm";
const LIBS = {
  hls: `${CDN}/hls.js@1.7.3/dist/hls.min.js`,
  mpegts: `${CDN}/mpegts.js@1.7.3/dist/mpegts.min.js`,
  videojs: `${CDN}/video.js@8.17.4/dist/video.min.js`,
  videojsCss: `${CDN}/video.js@8.17.4/dist/video-js.min.css`,
  shaka: `${CDN}/shaka-player@4.11.7/dist/shaka-player.compiled.js`,
  clappr: `${CDN}/@clappr/player@0.11.3/dist/clappr.min.js`,
  plyr: `${CDN}/plyr@3.7.8/dist/plyr.min.js`,
  plyrCss: `${CDN}/plyr@3.7.8/dist/plyr.css`,
  artplayer: `${CDN}/artplayer@5.1.7/dist/artplayer.js`,
  dplayer: `${CDN}/dplayer@1.27.1/dist/DPlayer.min.js`,
};

const loaded = {};
function loadScript(src) {
  return (loaded[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { delete loaded[src]; reject(new Error("تعذر تحميل المشغل")); };
    document.head.appendChild(s);
  }));
}
function loadCss(href) {
  if (loaded[href]) return;
  loaded[href] = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

// للروابط التي تمر عبر الوسيط (/api/hls/?u=...) نحدد النوع من الرابط الأصلي
const originalUrl = (url) => {
  const m = url.match(/\/api\/hls\/?\?u=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : url;
};

const kind = (url) => {
  const p = originalUrl(url).toLowerCase().split("?")[0].replace(/\/+$/, "");
  if (p.endsWith(".mp4") || p.endsWith(".webm")) return "file";
  if (p.endsWith(".ts")) return "ts";
  if (p.endsWith(".flv")) return "flv";
  if (p.endsWith(".mpd")) return "dash";
  return "hls"; // m3u8 أو روابط بدون امتداد (أغلب سيرفرات IPTV)
};

const canNativeHls = () => !!document.createElement("video").canPlayType("application/vnd.apple.mpegurl");
const hasMSE = () => !!(window.MediaSource || window.ManagedMediaSource);

function newVideo(host, className = "") {
  const v = document.createElement("video");
  v.className = className;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.autoplay = true;
  v.controls = true;
  host.appendChild(v);
  return v;
}

function newBox(host) {
  const d = document.createElement("div");
  d.className = "engine-box";
  host.appendChild(d);
  return d;
}

// يربط hls.js بعنصر فيديو مع معالجة الأخطاء (يستخدمه أكثر من مشغل)
function attachHls(video, url, onFatal, config = {}) {
  const Hls = window.Hls;
  const hls = new Hls({ backBufferLength: 30, manifestLoadingMaxRetry: 2, ...config });
  hls.on(Hls.Events.ERROR, (_, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    else onFatal(new Error(data.details || "HLS error"));
  });
  hls.loadSource(url);
  hls.attachMedia(video);
  return hls;
}

export const ENGINES = [
  {
    id: "hls",
    label: "المشغل السريع",
    desc: "hls.js — الأفضل لأغلب القنوات",
    supports: (u) => hasMSE() && (kind(u) === "hls"),
    async start(host, url, { onFatal }) {
      await loadScript(LIBS.hls);
      const video = newVideo(host);
      const hls = attachHls(video, url, onFatal, { lowLatencyMode: true });
      return { video, destroy: () => hls.destroy() };
    },
  },
  {
    id: "hls-stable",
    label: "المشغل الثابت",
    desc: "hls.js بتخزين أكبر — للإنترنت الضعيف والتقطيع",
    supports: (u) => hasMSE() && kind(u) === "hls",
    async start(host, url, { onFatal }) {
      await loadScript(LIBS.hls);
      const video = newVideo(host);
      const hls = attachHls(video, url, onFatal, {
        lowLatencyMode: false, enableWorker: false, maxBufferLength: 60, liveSyncDurationCount: 5,
        manifestLoadingMaxRetry: 6, levelLoadingMaxRetry: 6, fragLoadingMaxRetry: 6,
      });
      return { video, destroy: () => hls.destroy() };
    },
  },
  {
    id: "native",
    label: "مشغل الجهاز",
    desc: "المشغل المدمج في المتصفح — الأفضل على آيفون",
    supports: (u) => kind(u) === "file" || (kind(u) === "hls" && canNativeHls()) || (kind(u) === "ts" && canNativeHls()),
    async start(host, url, { onFatal }) {
      const video = newVideo(host);
      video.addEventListener("error", () => onFatal(new Error(video.error?.message || "media error")));
      video.src = url;
      return { video, destroy: () => { video.removeAttribute("src"); video.load(); } };
    },
  },
  {
    id: "videojs",
    label: "Video.js",
    desc: "مشغل احترافي بمحرك تشغيل مختلف",
    supports: (u) => ["hls", "file", "dash"].includes(kind(u)),
    async start(host, url, { onFatal }) {
      loadCss(LIBS.videojsCss);
      await loadScript(LIBS.videojs);
      const video = newVideo(host, "video-js vjs-big-play-centered vjs-fill");
      const type = { hls: "application/x-mpegURL", dash: "application/dash+xml", file: "video/mp4" }[kind(url)];
      const player = window.videojs(video, {
        autoplay: true, controls: true, fill: true, liveui: true, playsinline: true,
        html5: { vhs: { overrideNative: !canNativeHls(), enableLowInitialPlaylist: true } },
      });
      player.on("error", () => onFatal(new Error(player.error()?.message || "Video.js error")));
      player.src({ src: url, type });
      return { video: player.tech(true)?.el() || host.querySelector("video"), destroy: () => player.dispose() };
    },
  },
  {
    id: "shaka",
    label: "Shaka Player",
    desc: "مشغل Google — قوي مع البث المتغير الجودة",
    supports: (u) => ["hls", "dash", "file"].includes(kind(u)),
    async start(host, url, { onFatal }) {
      await loadScript(LIBS.shaka);
      const shaka = window.shaka;
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) throw new Error("المتصفح لا يدعم Shaka");
      const video = newVideo(host);
      const player = new shaka.Player();
      await player.attach(video);
      player.configure({ streaming: { retryParameters: { maxAttempts: 4 }, lowLatencyMode: false } });
      player.addEventListener("error", (e) => onFatal(new Error("Shaka " + (e.detail?.code || ""))));
      await player.load(url);
      video.play().catch(() => {});
      return { video, destroy: () => player.destroy() };
    },
  },
  {
    id: "clappr",
    label: "Clappr",
    desc: "مشغل خفيف بواجهة مختلفة",
    supports: (u) => ["hls", "file"].includes(kind(u)),
    async start(host, url, { onFatal }) {
      await loadScript(LIBS.clappr);
      const box = newBox(host);
      const player = new window.Clappr.Player({
        source: url, parent: box, autoPlay: true, width: "100%", height: "100%",
        playback: { playInline: true }, hlsRecoverAttempts: 8,
      });
      player.on(window.Clappr.Events.PLAYER_ERROR, (e) => onFatal(new Error(e?.description || "Clappr error")));
      await new Promise((r) => setTimeout(r, 50));
      return { video: box.querySelector("video"), destroy: () => player.destroy() };
    },
  },
  {
    id: "plyr",
    label: "Plyr",
    desc: "واجهة أنيقة وسهلة باللمس",
    supports: (u) => (kind(u) === "hls" && (hasMSE() || canNativeHls())) || kind(u) === "file",
    async start(host, url, { onFatal }) {
      loadCss(LIBS.plyrCss);
      await Promise.all([loadScript(LIBS.plyr), kind(url) === "hls" && !canNativeHls() ? loadScript(LIBS.hls) : null]);
      const video = newVideo(host);
      let hls = null;
      if (kind(url) === "hls" && !canNativeHls()) hls = attachHls(video, url, onFatal);
      else { video.src = url; video.addEventListener("error", () => onFatal(new Error("media error"))); }
      const player = new window.Plyr(video, {
        autoplay: true, invertTime: false, fullscreen: { iosNative: true },
        controls: ["play-large", "play", "mute", "volume", "settings", "pip", "airplay", "fullscreen"],
      });
      return { video, destroy: () => { hls?.destroy(); player.destroy(); } };
    },
  },
  {
    id: "artplayer",
    label: "ArtPlayer",
    desc: "مشغل حديث بإعدادات كثيرة",
    supports: (u) => (kind(u) === "hls" && (hasMSE() || canNativeHls())) || kind(u) === "file",
    async start(host, url, { onFatal }) {
      await Promise.all([loadScript(LIBS.artplayer), loadScript(LIBS.hls)]);
      const box = newBox(host);
      let hls = null;
      const art = new window.Artplayer({
        container: box, url, type: kind(url) === "hls" ? "m3u8" : "", autoplay: true, isLive: true,
        playsInline: true, fullscreen: true, setting: true, pip: true, lang: "en",
        customType: {
          m3u8(video, src) {
            if (canNativeHls() || !hasMSE()) { video.src = src; return; }
            hls = attachHls(video, src, onFatal);
          },
        },
      });
      art.on("error", () => onFatal(new Error("ArtPlayer error")));
      return { video: art.video, destroy: () => { hls?.destroy(); art.destroy(false); } };
    },
  },
  {
    id: "dplayer",
    label: "DPlayer",
    desc: "مشغل بديل بمحرك hls.js",
    supports: (u) => (kind(u) === "hls" && hasMSE()) || kind(u) === "file",
    async start(host, url, { onFatal }) {
      await loadScript(LIBS.hls);
      await loadScript(LIBS.dplayer);
      const box = newBox(host);
      const dp = new window.DPlayer({
        container: box, live: true, autoplay: true, lang: "en", screenshot: false,
        video: { url, type: kind(url) === "hls" ? "hls" : "auto" },
      });
      dp.on("error", () => onFatal(new Error("DPlayer error")));
      return { video: dp.video, destroy: () => dp.destroy() };
    },
  },
  {
    id: "mpegts",
    label: "مشغل TS / FLV",
    desc: "mpegts.js — لروابط ‎.ts و ‎.flv المباشرة",
    supports: (u) => ["ts", "flv"].includes(kind(u)) && hasMSE(),
    async start(host, url, { onFatal }) {
      await loadScript(LIBS.mpegts);
      const mpegts = window.mpegts;
      if (!mpegts.getFeatureList().mseLivePlayback) throw new Error("المتصفح لا يدعم هذا النوع");
      const video = newVideo(host);
      const p = mpegts.createPlayer({ type: kind(url) === "flv" ? "flv" : "mpegts", isLive: true, url },
        { enableStashBuffer: true, liveBufferLatencyChasing: true });
      p.attachMediaElement(video);
      p.on(mpegts.Events.ERROR, (type, detail) => onFatal(new Error(`${type} ${detail}`)));
      p.load();
      video.play().catch(() => {});
      return { video, destroy: () => { try { p.destroy(); } catch {} } };
    },
  },
];

// المشغلات المناسبة لهذا الرابط على هذا الجهاز، مرتبة حسب الأفضلية.
// على آيفون نقدّم مشغل الجهاز لأن Safari يشغّل HLS أصلاً.
export function enginesFor(url) {
  const list = ENGINES.filter((e) => e.supports(url));
  if (canNativeHls()) list.sort((a, b) => (b.id === "native") - (a.id === "native"));
  return list;
}

export const engineById = (id) => ENGINES.find((e) => e.id === id);
