// مباريات اليوم: تُجلب تلقائياً من ESPN (مجاني وبدون مفتاح)،
// وأسماء الفرق تُعرّب من teams-ar.json، وربط كل مباراة بقناة يتم من لوحة التحكم (Firestore: matchLinks).

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";

// الدوريات المعروضة بالترتيب (الأهم أولاً)
export const LEAGUES = [
  { slug: "uefa.champions", ar: "دوري أبطال أوروبا" },
  { slug: "eng.1", ar: "الدوري الإنجليزي" },
  { slug: "esp.1", ar: "الدوري الإسباني" },
  { slug: "ita.1", ar: "الدوري الإيطالي" },
  { slug: "ger.1", ar: "الدوري الألماني" },
  { slug: "fra.1", ar: "الدوري الفرنسي" },
  { slug: "ksa.1", ar: "دوري روشن السعودي" },
  { slug: "afc.champions", ar: "دوري أبطال آسيا للنخبة" },
  { slug: "caf.champions", ar: "دوري أبطال أفريقيا" },
  { slug: "uefa.europa", ar: "الدوري الأوروبي" },
  { slug: "uefa.europa.conf", ar: "دوري المؤتمر الأوروبي" },
  { slug: "fifa.world", ar: "كأس العالم" },
  { slug: "fifa.cwc", ar: "كأس العالم للأندية" },
  { slug: "fifa.worldq.afc", ar: "تصفيات كأس العالم - آسيا" },
  { slug: "fifa.worldq.uefa", ar: "تصفيات كأس العالم - أوروبا" },
  { slug: "fifa.worldq.caf", ar: "تصفيات كأس العالم - أفريقيا" },
  { slug: "afc.asian.cup", ar: "كأس آسيا" },
  { slug: "uefa.nations", ar: "دوري الأمم الأوروبية" },
  { slug: "fifa.friendly", ar: "مباريات ودية دولية" },
  { slug: "eng.fa", ar: "كأس الاتحاد الإنجليزي" },
  { slug: "esp.copa_del_rey", ar: "كأس ملك إسبانيا" },
  { slug: "ita.coppa_italia", ar: "كأس إيطاليا" },
  { slug: "ger.dfb_pokal", ar: "كأس ألمانيا" },
  { slug: "por.1", ar: "الدوري البرتغالي" },
  { slug: "tur.1", ar: "الدوري التركي" },
  { slug: "ned.1", ar: "الدوري الهولندي" },
];

let teamNames = null;
async function loadTeamNames() {
  if (teamNames) return teamNames;
  try {
    const res = await fetch(new URL("teams-ar.json", import.meta.url));
    teamNames = await res.json();
  } catch {
    teamNames = {};
  }
  return teamNames;
}

// مفتاح البحث في القاموس: بدون تشكيل/لكنات وبأحرف صغيرة
export const teamKey = (name) =>
  (name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

function arName(team, dict) {
  const k = teamKey(team.displayName);
  return dict[k] || dict[teamKey(team.shortDisplayName)] || team.displayName;
}

/** مباريات يوم معيّن (بتوقيت الجهاز)، مرتبة حسب الدوري ثم الوقت */
export async function fetchMatches(day = new Date()) {
  const dict = await loadTeamNames();
  // ESPN لا يدعم نطاق تواريخ لكرة القدم؛ نجلب يوم الجهاز (مباريات منتصف الليل تظهر كمباريات الليلة)
  const today = dayKey(day);

  const results = await Promise.allSettled(LEAGUES.map(async (lg, order) => {
    const res = await fetch(`${ESPN}/${lg.slug}/scoreboard?dates=${today}`);
    if (!res.ok) return [];
    const j = await res.json();
    const league = j.leagues?.[0] || {};
    return (j.events || []).map((e) => {
      const c = e.competitions?.[0] || {};
      const [a, b] = c.competitors || [];
      const home = a?.homeAway === "home" ? a : b;
      const away = home === a ? b : a;
      const st = c.status || e.status || {};
      return {
        id: e.id,
        start: new Date(e.date),
        league: { slug: lg.slug, name: lg.ar, logo: league.logos?.[0]?.href || "", order },
        state: st.type?.state || "pre", // pre | in | post
        clock: st.displayClock || "",
        detail: st.type?.shortDetail || "",
        home: { name: arName(home.team, dict), logo: home.team.logo || "", score: home.score ?? "" },
        away: { name: arName(away.team, dict), logo: away.team.logo || "", score: away.score ?? "" },
      };
    });
  }));

  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((m) => m.home && m.away)
    .sort((x, y) => x.league.order - y.league.order || x.start - y.start);
}

/** نص الحالة: الوقت قبل البداية، الدقيقة أثناء اللعب، «انتهت» بعدها */
export function statusText(m) {
  if (m.state === "in") return /half/i.test(m.detail) ? "استراحة" : (m.clock || "مباشر");
  if (m.state === "post") return /postp/i.test(m.detail) ? "مؤجلة" : "انتهت";
  return m.start.toLocaleTimeString("ar-IQ", { hour: "numeric", minute: "2-digit" });
}
