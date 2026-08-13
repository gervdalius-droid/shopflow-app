/* ============================================================
   ShopFlow — Data layer
   localStorage-persisted store, seed data, domain logic.

   v3 model (MRPEasy-inspired):
   - orders have items (article lines with quantities)
   - each item's ops form parallel LANES (part groups, e.g.
     Facades / Carcass) that merge into a shared final lane
   - ops track qtyDone: pieces flow downstream as they finish
   - order.type: "prod" | "eng" (engineering projects)
   - portfolios group orders + projects
   ============================================================ */
"use strict";

const DB_KEY = "shopflow.v1";
const BK_KEY = "shopflow.backups";   // rolling local auto-backups (restore points)
const BK_MAX = 6;                    // keep the last N snapshots on this device
const DAY = 86400000;

/* ---------- PIN hashing ----------
   PINs are never stored or exported in plaintext. We keep a per-install
   random salt + a SHA-256 digest of salt+PIN. A 4-digit PIN is a small
   keyspace (10k) so this is obfuscation against casual snooping, not
   strong crypto — it removes plaintext exposure and the reveal button. */
function sha256(ascii) {
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  const mp = Math.pow, maxWord = mp(2, 32);
  let result = "", words = [], i, j;
  const asciiBitLength = ascii.length * 8;
  let hash = sha256.h = sha256.h || [];
  const k = sha256.k = sha256.k || [];
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mp(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mp(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += "\x80";
  while (ascii.length % 64 - 56) ascii += "\x00";
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const t1 = hash[7]
        + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
          ) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++)
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : "") + b.toString(16);
    }
  return result;
}
function randSalt() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  return (Math.random().toString(36) + Math.random().toString(36)).replace(/[^a-z0-9]/g, "").slice(0, 24);
}
function hashPin(pin, salt) { return sha256((salt || "") + "$" + String(pin)); }

/* ---------- Avatar palette (Apple-ish gradients) ---------- */
const AV_COLORS = [
  ["#ff9f0a", "#ff6b22"], ["#0a84ff", "#0055d4"], ["#30d158", "#1fa946"],
  ["#bf5af2", "#8e2de2"], ["#ff375f", "#d61f47"], ["#64d2ff", "#2fa8e0"],
  ["#ffd60a", "#e0a800"], ["#5e5ce6", "#3634a3"], ["#ff453a", "#c22b22"],
  ["#30b0c7", "#1d8a9e"],
];

const STATION_ICONS = ["🪚","📏","⚙️","🔩","🌀","🎨","🔍","📦","🪵","🧰","🪛","🗜️","🚪","🪞","🛠️","✨"];
const MATERIAL_ICONS = ["🟫","🪵","🧻","🧴","🧲","🔩","🪝","🎨","🧪","📦","🪟","⬜️"];
const PORTFOLIO_ICONS = ["📁","☕️","🏨","🏠","🏢","📦","🛋","🚪","🍽","🧒"];

/* ---------- Stations (production + engineering stages) ---------- */
const SEED_STATIONS = [
  { id: "cut",  name: "Cutting",        icon: "🪚", ic: "saw",    estMins: 90,  kind: "prod" },
  { id: "edge", name: "Edge Banding",   icon: "📏", ic: "ruler",  estMins: 60,  kind: "prod" },
  { id: "cnc",  name: "CNC / Drilling", icon: "⚙️", ic: "drill",  estMins: 75,  kind: "prod" },
  { id: "asm",  name: "Assembly",       icon: "🔩", ic: "wrench", estMins: 150, kind: "prod" },
  { id: "sand", name: "Sanding",        icon: "🌀", ic: "disc",   estMins: 60,  kind: "prod" },
  { id: "fin",  name: "Finishing",      icon: "🎨", ic: "brush",  estMins: 120, kind: "prod" },
  { id: "qc",   name: "Quality Check",  icon: "🔍", ic: "badge",  estMins: 30,  kind: "prod" },
  { id: "pack", name: "Packing",        icon: "📦", ic: "box",    estMins: 45,  kind: "prod" },
];
const ENG_STATIONS = [
  { id: "eg-brief",  name: "Brief",              icon: "📋", ic: "bulb",      estMins: 60,  kind: "eng" },
  { id: "eg-meas",   name: "Measurement",        icon: "📐", ic: "compass",   estMins: 120, kind: "eng" },
  { id: "eg-design", name: "Design & Drawings",  icon: "✏️", ic: "pencil",    estMins: 480, kind: "eng" },
  { id: "eg-appr",   name: "Client Approval",    icon: "🤝", ic: "handshake", estMins: 60,  kind: "eng" },
  { id: "eg-cam",    name: "CNC Programs",       icon: "💾", ic: "cpu",       estMins: 180, kind: "eng" },
  { id: "eg-hand",   name: "Handoff to Production", icon: "🏭", ic: "factory", estMins: 30, kind: "eng" },
];
const STATION_IC_KEYS = ["saw", "ruler", "drill", "wrench", "disc", "brush", "badge", "box", "hammer", "toolbox", "bulb", "compass", "pencil", "handshake", "cpu", "factory", "door", "sparkles"];
const MATERIAL_IC_KEYS = ["layers", "roll", "bottle", "screw", "flask", "box", "square", "toolbox"];
const PORTFOLIO_IC_KEYS = ["folder", "cup", "building", "home", "bed", "door", "child", "box", "archive", "sparkles"];

/* ---------- Articles (standard products with lane routings) ----------
   Each lane = a part group produced in parallel (Facades, Carcass…).
   The lane with group:null is the shared final lane (assembly → pack)
   and starts once every part lane has produced pieces.
   mpu = minutes per unit. */
function seedArticles() {
  return [
    { id: "a-bc600", sku: "BC-600", name: "Base cabinet 600", unit: "pcs", lanes: [
      { group: "Carcass", route: [{ stationId: "cut", mpu: 8 }, { stationId: "edge", mpu: 6 }, { stationId: "cnc", mpu: 5 }] },
      { group: "Facades", route: [{ stationId: "cut", mpu: 6 }, { stationId: "edge", mpu: 5 }, { stationId: "sand", mpu: 4 }, { stationId: "fin", mpu: 8 }] },
      { group: null, route: [{ stationId: "asm", mpu: 15 }, { stationId: "qc", mpu: 3 }, { stationId: "pack", mpu: 5 }] },
    ]},
    { id: "a-wc800", sku: "WC-800", name: "Wall cabinet 800", unit: "pcs", lanes: [
      { group: "Carcass", route: [{ stationId: "cut", mpu: 7 }, { stationId: "edge", mpu: 5 }, { stationId: "cnc", mpu: 4 }] },
      { group: "Facades", route: [{ stationId: "cut", mpu: 5 }, { stationId: "edge", mpu: 4 }, { stationId: "fin", mpu: 7 }] },
      { group: null, route: [{ stationId: "asm", mpu: 12 }, { stationId: "qc", mpu: 3 }, { stationId: "pack", mpu: 4 }] },
    ]},
    { id: "a-tb160", sku: "TB-O160", name: "Oak table 1600", unit: "pcs", lanes: [
      { group: "Tops", route: [{ stationId: "cut", mpu: 20 }, { stationId: "sand", mpu: 15 }, { stationId: "fin", mpu: 25 }] },
      { group: "Frames & legs", route: [{ stationId: "cut", mpu: 15 }, { stationId: "cnc", mpu: 10 }] },
      { group: null, route: [{ stationId: "asm", mpu: 20 }, { stationId: "qc", mpu: 5 }, { stationId: "pack", mpu: 10 }] },
    ]},
  ];
}

/* ---------- Warehouse seed ---------- */
function seedMaterials() {
  return [
    { id: "mat1",  sku: "MDF-18",  name: "MDF board 18 mm",        unit: "pcs",    qty: 34,  minQty: 10,  location: "A1", icon: "🟫" },
    { id: "mat2",  sku: "PLY-12",  name: "Birch plywood 12 mm",    unit: "pcs",    qty: 18,  minQty: 8,   location: "A2", icon: "🪵" },
    { id: "mat3",  sku: "OAK-20",  name: "Oak panel 20 mm",        unit: "pcs",    qty: 12,  minQty: 6,   location: "A3", icon: "🪵" },
    { id: "mat4",  sku: "EB-W23",  name: "Edge banding, white 23 mm", unit: "m",   qty: 240, minQty: 100, location: "B1", icon: "🧻" },
    { id: "mat5",  sku: "EB-O23",  name: "Edge banding, oak 23 mm", unit: "m",     qty: 65,  minQty: 80,  location: "B1", icon: "🧻" },
    { id: "mat6",  sku: "LAC-M",   name: "Matte lacquer",          unit: "L",      qty: 2,   minQty: 10,  location: "C2", icon: "🧴" },
    { id: "mat7",  sku: "GLU-D3",  name: "Wood glue D3",           unit: "L",      qty: 14,  minQty: 5,   location: "C1", icon: "🧴" },
    { id: "mat8",  sku: "HNG-HET", name: "Hettich hinges",         unit: "pcs",    qty: 260, minQty: 100, location: "D4", icon: "🪝" },
    { id: "mat9",  sku: "SLD-500", name: "Drawer slides 500 mm",   unit: "pairs",  qty: 42,  minQty: 20,  location: "D2", icon: "🔩" },
    { id: "mat10", sku: "SCR-435", name: "Screws 4×35",            unit: "boxes",  qty: 9,   minQty: 4,   location: "D1", icon: "📦" },
    { id: "mat11", sku: "SND-180", name: "Sandpaper P180",         unit: "sheets", qty: 55,  minQty: 40,  location: "C3", icon: "🧻" },
  ];
}

function seedStockMoves() {
  const now = Date.now();
  return [
    { id: "sm1", ts: now - 5 * DAY, materialId: "mat1", delta: +40, note: "Delivery — Medienos centras", who: "m2" },
    { id: "sm2", ts: now - 4 * DAY, materialId: "mat1", delta: -24, note: "Consumed for WO-1041", orderId: "o1", who: "m3" },
    { id: "sm3", ts: now - 4 * DAY, materialId: "mat4", delta: -120, note: "Consumed for WO-1041", orderId: "o1", who: "m4" },
    { id: "sm4", ts: now - 3 * DAY, materialId: "mat3", delta: -16, note: "Consumed for WO-1043", orderId: "o3", who: "m3" },
    { id: "sm5", ts: now - 2 * DAY, materialId: "mat8", delta: +100, note: "Delivery — Hettich", who: "m2" },
    { id: "sm6", ts: now - 2 * DAY, materialId: "mat6", delta: -3, note: "Stocktake correction", who: "m2" },
    { id: "sm7", ts: now - 1 * DAY, materialId: "mat1", delta: -8, note: "Consumed for WO-1042", orderId: "o2", who: "m3" },
  ];
}

let lineSeq = 1;
const mkLine = (materialId, qty, consumed) => ({
  id: "ln" + (lineSeq++), materialId, qty,
  consumed: !!consumed, consumedAt: consumed ? Date.now() - 3 * DAY : null, consumedBy: consumed ? "m3" : null,
});
function seedOrderLines(orderId) {
  switch (orderId) {
    case "o1": return [mkLine("mat1", 24, true), mkLine("mat4", 120, true), mkLine("mat8", 48), mkLine("mat9", 12)];
    case "o2": return [mkLine("mat1", 8, true), mkLine("mat5", 40)];
    case "o3": return [mkLine("mat3", 16, true), mkLine("mat6", 6)]; // lacquer shortage → the block
    case "o4": return [mkLine("mat1", 6)];
    case "o5": return [mkLine("mat1", 9), mkLine("mat4", 60)];
    case "o12": return [mkLine("mat1", 40), mkLine("mat4", 200)];
    default: return [];
  }
}

const uid = (p) => p + Math.random().toString(36).slice(2, 9);

/* Build ops for an item from an article's lanes.
   prog: `${group||"_"}/${stationId}` -> [status, qtyDone, who, loggedMins, blockNote] */
function opsFromArticle(article, item, prog = {}) {
  const now = Date.now();
  const ops = [];
  for (const lane of article.lanes) {
    for (const r of lane.route) {
      const key = `${lane.group || "_"}/${r.stationId}`;
      const [status = "queued", qtyDone = 0, who = null, logged = 0, blockNote = null] = prog[key] || [];
      ops.push({
        id: uid("op"), itemId: item.id, group: lane.group,
        stationId: r.stationId, estMins: Math.max(5, Math.round(r.mpu * item.qty)),
        status, qtyDone: status === "done" ? item.qty : qtyDone,
        assigneeId: who, loggedMs: logged * 60000,
        startedAt: status === "running" ? now - 22 * 60000 : null,
        completedAt: status === "done" ? now - 2 * DAY : null,
        blockNote,
      });
    }
  }
  return ops;
}

/* ---------- Whiteboard starter content ---------- */
function seedBoard(members, lt) {
  const by = (i) => members[i % members.length].id;
  const now = Date.now();
  const T = lt
    ? { name: "Idėjų lenta", title: "Dėdės Baldai — idėjų lenta",
        s1: "Galandinti obliaus peilius kas penktadienį", s2: "Atraižų lentyna prie CNC — naudoti >300 mm", s3: "Dažyklai reikia geresnės ventiliacijos!",
        th: ["Staklės", "Aptarnauta", "Kitas kartas"], tr1: ["CNC", "2026-06-10", "2026-09-10"], tr2: ["Obliavimo", "2026-05-02", "2026-08-02"],
        w1: "Idėja 💡", w2: "Išbandom viename užsakyme", w3: "Tampa standartu ✅" }
    : { name: "Shop improvement board", title: "Shop improvement board",
        s1: "Sharpen planer blades every Friday", s2: "Offcut shelf near CNC — reuse >300 mm pieces", s3: "Lacquer room needs better extraction!",
        th: ["Machine", "Last service", "Next due"], tr1: ["CNC", "2026-06-10", "2026-09-10"], tr2: ["Planer", "2026-05-02", "2026-08-02"],
        w1: "Idea 💡", w2: "Try it on one order", w3: "Make it standard ✅" };
  const els = [
    { id: uid("we"), type: "text", x: 40, y: 16, w: 420, h: 48, color: 6, text: T.title, by: by(0), ts: now - 6 * DAY },
    { id: uid("we"), type: "sticky", x: 40, y: 90, w: 180, h: 180, color: 0, text: T.s1, by: by(2), ts: now - 5 * DAY },
    { id: uid("we"), type: "sticky", x: 244, y: 90, w: 180, h: 180, color: 4, text: T.s2, by: by(4), ts: now - 4 * DAY },
    { id: uid("we"), type: "sticky", x: 448, y: 90, w: 180, h: 180, color: 2, text: T.s3, by: by(5), ts: now - 2 * DAY },
    { id: uid("we"), type: "table", x: 40, y: 320, w: 360, h: 0, color: 6, text: "", rows: [T.th, T.tr1, T.tr2], by: by(1), ts: now - 3 * DAY },
    { id: "wf1-" + (lt ? "lt" : "en"), type: "shape", x: 470, y: 320, w: 190, h: 64, color: 4, kind: "pill", text: T.w1, by: by(0), ts: now - 3 * DAY },
    { id: "wf2-" + (lt ? "lt" : "en"), type: "shape", x: 470, y: 424, w: 190, h: 64, color: 0, kind: "rect", text: T.w2, by: by(0), ts: now - 3 * DAY },
    { id: "wf3-" + (lt ? "lt" : "en"), type: "shape", x: 470, y: 528, w: 190, h: 64, color: 3, kind: "rect", text: T.w3, by: by(0), ts: now - 3 * DAY },
  ];
  const conns = [
    { id: uid("wc"), from: "wf1-" + (lt ? "lt" : "en"), to: "wf2-" + (lt ? "lt" : "en") },
    { id: uid("wc"), from: "wf2-" + (lt ? "lt" : "en"), to: "wf3-" + (lt ? "lt" : "en") },
  ];
  return { id: uid("wb"), name: T.name, createdBy: members[0].id, createdAt: now - 6 * DAY, updatedAt: now - 2 * DAY, els, conns, visibility: "team", memberIds: [] };
}

/* ---------- Planner (general PM) seed ---------- */
const GP_COLORS = ["blue", "indigo", "teal", "purple", "orange", "green", "red", "gray"];
function defaultStages() {
  return [
    { id: uid("gs"), name: "Backlog", color: "gray", done: false },
    { id: uid("gs"), name: "To do", color: "blue", done: false },
    { id: uid("gs"), name: "In progress", color: "orange", done: false },
    { id: uid("gs"), name: "In review", color: "purple", done: false },
    { id: uid("gs"), name: "Done", color: "green", done: true },
  ];
}
function seedPlanner(members) {
  const now = Date.now();
  const by = (i) => (members[i % members.length] || members[0]).id;
  const mk = (name, key, color, icon, tasks) => {
    const stages = defaultStages();
    const S = (n) => stages[n].id;
    let ord = 0;
    return {
      id: uid("gp"), name, key, color, icon, desc: "",
      createdBy: by(0), createdAt: now - 20 * DAY, archived: false,
      stages, labels: [
        { id: uid("gl"), name: "Bug", color: "red" }, { id: uid("gl"), name: "Design", color: "purple" },
        { id: uid("gl"), name: "Urgent", color: "orange" },
      ],
      tasks: tasks.map(([title, si, who, dueD, prio, subs]) => ({
        id: uid("gt"), title, desc: "", stageId: S(si), assigneeId: who, due: dueD == null ? null : now + dueD * DAY,
        start: null, priority: prio || "normal", labelIds: [],
        subtasks: (subs || []).map(t => ({ id: uid("gk"), title: t[0], done: !!t[1] })),
        comments: [], createdBy: by(0), createdAt: now - 18 * DAY, ord: ord++,
      })),
    };
  };
  return [
    mk("Website relaunch", "WEB", "blue", "sparkles", [
      ["Finalise sitemap", 4, by(0), -2, "high", [["Home", true], ["Products", true], ["Contact", false]]],
      ["Write homepage copy", 2, by(1), 3, "normal"],
      ["Design system in Figma", 2, by(1), 5, "high"],
      ["Set up CMS", 1, by(0), 9, "normal"],
      ["Photo shoot — workshop", 3, by(1), 1, "high", [["Book photographer", true], ["Shot list", false]]],
      ["Migrate old blog posts", 0, null, 14, "low"],
      ["Launch checklist", 1, by(0), 12, "normal"],
    ]),
    mk("Q3 marketing", "MKT", "orange", "flame", [
      ["Plan autumn campaign", 2, by(0), 2, "high"],
      ["Instagram content calendar", 1, by(1), 6, "normal", [["Week 1", true], ["Week 2", false], ["Week 3", false]]],
      ["Email newsletter #8", 3, by(1), -1, "high"],
      ["Trade fair booth brief", 0, by(0), 20, "normal"],
      ["Review ad budget", 4, by(0), -3, "normal"],
    ]),
    mk("Office move", "OPS", "teal", "building", [
      ["Get quotes from movers", 4, by(0), -5, "normal"],
      ["New floor plan", 2, by(1), 4, "normal", [["Measure space", true], ["Desk layout", false]]],
      ["Update address everywhere", 1, by(0), 10, "low"],
      ["Internet + phones", 1, by(0), 7, "high"],
    ]),
  ];
}

function seedData() {
  const now = Date.now();
  const members = [
    { id: "m1", name: "Ričardas", trade: "Owner",         role: "manager", pin: "1234", color: 1 },
    { id: "m2", name: "Eglė",     trade: "Production Manager", role: "manager", pin: "5678", color: 3 },
    { id: "m8", name: "Rūta",     trade: "Design & Drawings", role: "engineer", pin: "6789", color: 7, station: "eg-design" },
    { id: "m3", name: "Andrius",  trade: "Cutting & Panels", role: "worker", pin: "1111", color: 0, station: "cut" },
    { id: "m4", name: "Lukas",    trade: "Edge & CNC",     role: "worker", pin: "2222", color: 5, station: "cnc" },
    { id: "m5", name: "Jonas",    trade: "Assembly",       role: "worker", pin: "3333", color: 2, station: "asm" },
    { id: "m6", name: "Milda",    trade: "Finishing",      role: "worker", pin: "4444", color: 4, station: "fin" },
    { id: "m7", name: "Greta",    trade: "QC & Packing",   role: "worker", pin: "5555", color: 9, station: "qc" },
  ];

  const articles = seedArticles();
  const artOf = (id) => articles.find(a => a.id === id);

  /* Flat ops builder for custom orders (single General item, one lane) */
  let opSeq = 1;
  const mkOps = (itemId, specs) => specs.map(([st, status, who, logged, qtyDone]) => {
    const stn = SEED_STATIONS.find(s => s.id === st);
    return {
      id: "op" + (opSeq++), itemId, group: null,
      stationId: st, estMins: stn.estMins,
      status: status || "queued",
      qtyDone: qtyDone ?? 0,
      assigneeId: who || null,
      loggedMs: (logged || 0) * 60000,
      startedAt: status === "running" ? now - 22 * 60000 : null,
      completedAt: status === "done" ? now - 3 * DAY : null,
      blockNote: null,
    };
  });
  /* single-item custom order helper */
  const flat = (id, qty, specs) => {
    const item = { id: id + "-it0", articleId: null, name: "General", qty };
    const ops = mkOps(item.id, specs.map(s => {
      // done ops carry full qty
      if (s[1] === "done") return [...s.slice(0, 4), qty];
      return s;
    }));
    return { items: [item], ops };
  };

  /* ---- o1: standard kitchen from articles, lanes mid-flow ---- */
  const o1it1 = { id: "o1-it1", articleId: "a-bc600", name: "Base cabinet 600", qty: 8 };
  const o1it2 = { id: "o1-it2", articleId: "a-wc800", name: "Wall cabinet 800", qty: 4 };
  const o1ops = [
    ...opsFromArticle(artOf("a-bc600"), o1it1, {
      "Carcass/cut": ["done", 8, "m3", 70], "Carcass/edge": ["done", 8, "m4", 50], "Carcass/cnc": ["paused", 5, "m4", 40],
      "Facades/cut": ["done", 8, "m3", 50], "Facades/edge": ["done", 8, "m4", 40], "Facades/sand": ["done", 8, "m6", 35], "Facades/fin": ["done", 8, "m6", 70],
      "_/asm": ["running", 3, "m5", 95],
    }),
    ...opsFromArticle(artOf("a-wc800"), o1it2, {
      "Carcass/cut": ["done", 4, "m3", 30],
      "Facades/cut": ["done", 4, "m3", 22],
    }),
  ];

  /* ---- o3: rush tables from article, finishing blocked ---- */
  const o3it = { id: "o3-it1", articleId: "a-tb160", name: "Oak table 1600", qty: 8 };
  const o3ops = opsFromArticle(artOf("a-tb160"), o3it, {
    "Tops/cut": ["done", 8, "m3", 160], "Tops/sand": ["done", 8, "m6", 75],
    "Tops/fin": ["blocked", 3, "m6", 40, "Out of matte lacquer — delivery expected tomorrow"],
    "Frames & legs/cut": ["done", 8, "m3", 60], "Frames & legs/cnc": ["done", 8, "m4", 45],
  });

  /* ---- o12: standard stock batch, all queued ---- */
  const o12it = { id: "o12-it1", articleId: "a-bc600", name: "Base cabinet 600", qty: 20 };
  const o12ops = opsFromArticle(artOf("a-bc600"), o12it, {});

  /* ---- o13: engineering project ---- */
  const o13it = { id: "o13-it1", articleId: null, name: "Project", qty: 1 };
  const o13ops = ["eg-brief", "eg-meas", "eg-design", "eg-appr", "eg-cam", "eg-hand"].map((st, i) => {
    const stn = ENG_STATIONS.find(s => s.id === st);
    const status = i < 2 ? "done" : i === 2 ? "running" : "queued";
    return {
      id: uid("op"), itemId: o13it.id, group: null, stationId: st, estMins: stn.estMins,
      status, qtyDone: status === "done" ? 1 : 0, assigneeId: i <= 2 ? "m8" : null,
      loggedMs: (i === 2 ? 190 : i < 2 ? stn.estMins : 0) * 60000,
      startedAt: status === "running" ? now - 35 * 60000 : null,
      completedAt: status === "done" ? now - 2 * DAY : null, blockNote: null,
    };
  });

  const orders = [
    {
      id: "o1", num: "WO-1041", type: "prod", product: "Oak kitchen — Vilniaus g. 14", client: "Šiaulių NT projektai",
      qty: 12, unit: "cabinets", priority: "high", due: now + 2 * DAY, shipped: false, portfolioId: "p2",
      notes: "Handleless fronts, matte lacquer NCS S 0502-Y. Client wants site delivery before Aug 1.",
      createdAt: now - 9 * DAY, items: [o1it1, o1it2], ops: o1ops,
    },
    {
      id: "o2", num: "WO-1042", type: "prod", product: "Walnut wardrobe, sliding doors", client: "A. Petrauskienė",
      qty: 1, unit: "unit", priority: "normal", due: now + 6 * DAY, shipped: false, portfolioId: null,
      notes: "Soft-close Hettich rails. Mirror on middle door.",
      createdAt: now - 7 * DAY,
      ...flat("o2", 1, [["cut", "done", "m3", 95], ["edge", "done", "m4", 55], ["cnc", "queued", "m4"], ["asm"], ["sand"], ["fin"], ["qc"], ["pack"]]),
    },
    {
      id: "o3", num: "WO-1043", type: "prod", product: "Restaurant tables ×8", client: "Bistro „Ąžuolas“",
      qty: 8, unit: "tables", priority: "rush", due: now - 1 * DAY, shipped: false, portfolioId: null,
      notes: "RUSH — opening pushed to next week. Solid oak tops, steel legs arrive Thursday.",
      createdAt: now - 12 * DAY, items: [o3it], ops: o3ops,
    },
    {
      id: "o4", num: "WO-1044", type: "prod", product: "Office reception counter", client: "UAB Baltic Hub",
      qty: 1, unit: "unit", priority: "normal", due: now + 11 * DAY, shipped: false, portfolioId: null,
      notes: "Corian top ordered separately — arrives in ~1 week.",
      createdAt: now - 4 * DAY,
      ...flat("o4", 1, [["cut", "running", "m3", 35], ["edge"], ["cnc"], ["asm"], ["sand"], ["fin"], ["qc"], ["pack"]]),
    },
    {
      id: "o5", num: "WO-1045", type: "prod", product: "Bathroom vanities ×3", client: "Domus Interjeras",
      qty: 3, unit: "units", priority: "normal", due: now + 4 * DAY, shipped: false, portfolioId: null,
      notes: "Moisture-resistant MDF, painted RAL 7016.",
      createdAt: now - 6 * DAY,
      ...flat("o5", 3, [["cut", "done", "m3", 80], ["edge", "queued", null], ["cnc"], ["asm"], ["fin"], ["qc"], ["pack"]]),
    },
    {
      id: "o6", num: "WO-1046", type: "prod", product: "TV wall unit, smoked oak", client: "M. Kazlauskas",
      qty: 1, unit: "unit", priority: "low", due: now + 16 * DAY, shipped: false, portfolioId: null,
      notes: "",
      createdAt: now - 2 * DAY,
      ...flat("o6", 1, [["cut"], ["edge"], ["cnc"], ["asm"], ["sand"], ["fin"], ["qc"], ["pack"]]),
    },
    {
      id: "o7", num: "WO-1047", type: "prod", product: "Kids room set — bed + desk", client: "I. Jankauskienė",
      qty: 2, unit: "pieces", priority: "high", due: now + 1 * DAY, shipped: false, portfolioId: null,
      notes: "Birch plywood, rounded corners everywhere, water-based lacquer only.",
      createdAt: now - 10 * DAY,
      ...flat("o7", 2, [["cut", "done", "m3", 70], ["cnc", "done", "m4", 60], ["asm", "done", "m5", 130], ["sand", "done", "m6", 45], ["fin", "done", "m6", 95], ["qc", "paused", "m7", 12, 1], ["pack"]]),
    },
    {
      id: "o8", num: "WO-1048", type: "prod", product: "Wardrobe doors refit ×6", client: "Senamiesčio butai",
      qty: 6, unit: "doors", priority: "normal", due: now + 3 * DAY, shipped: false, portfolioId: null,
      notes: "",
      createdAt: now - 5 * DAY,
      ...flat("o8", 6, [["cut", "done", "m3", 55], ["edge", "running", "m4", 20, 2], ["fin"], ["qc"], ["pack"]]),
    },
    {
      id: "o9", num: "WO-1039", type: "prod", product: "Standing desks ×4, ash", client: "Kūrybos namai",
      qty: 4, unit: "desks", priority: "normal", due: now + 1 * DAY, shipped: false, portfolioId: null,
      notes: "Legs pre-ordered (Linak). Cable trays included.",
      createdAt: now - 15 * DAY,
      ...flat("o9", 4, [["cut", "done", "m3", 90], ["edge", "done", "m4", 50], ["asm", "done", "m5", 120], ["sand", "done", "m6", 40], ["fin", "done", "m6", 110], ["qc", "done", "m7", 25], ["pack", "done", "m7", 30]]),
    },
    {
      id: "o10", num: "WO-1038", type: "prod", product: "Oak bookshelf wall", client: "V. Norkus",
      qty: 1, unit: "unit", priority: "normal", due: now - 3 * DAY, shipped: true, shippedAt: now - 2 * DAY, portfolioId: null,
      notes: "",
      createdAt: now - 20 * DAY,
      ...flat("o10", 1, [["cut", "done", "m3", 85], ["edge", "done", "m4", 45], ["asm", "done", "m5", 140], ["fin", "done", "m6", 100], ["qc", "done", "m7", 20], ["pack", "done", "m7", 35]]),
    },
    {
      id: "o11", num: "WO-1049", type: "prod", product: "Café bar counter, 4.2 m", client: "Kavinė „Šviesa“",
      qty: 1, unit: "unit", priority: "high", due: now + 8 * DAY, shipped: false, portfolioId: "p1",
      notes: "Fluted oak front. Brass foot rail supplied by client.",
      createdAt: now - 1 * DAY,
      ...flat("o11", 1, [["cut"], ["edge"], ["cnc"], ["asm"], ["sand"], ["fin"], ["qc"], ["pack"]]),
    },
    {
      id: "o12", num: "WO-1050", type: "prod", product: "Base cabinets 600 — stock batch", client: "Stock",
      qty: 20, unit: "pcs", priority: "low", due: now + 18 * DAY, shipped: false, portfolioId: "p2",
      notes: "Standard batch for the showroom + stock.",
      createdAt: now - 1 * DAY, items: [o12it], ops: o12ops,
    },
    {
      id: "o13", num: "ENG-2043", type: "eng", product: "Bar counter — drawings & CNC programs", client: "Kavinė „Šviesa“",
      qty: 1, unit: "project", priority: "high", due: now + 5 * DAY, shipped: false, portfolioId: "p1",
      notes: "Fluted front detail 1:1 sample to approve. Brass rail bracket positions TBC.",
      createdAt: now - 3 * DAY, items: [o13it], ops: o13ops,
    },
  ];

  orders.forEach(o => { o.materials = seedOrderLines(o.id); });

  const activity = [
    { ts: now - 22 * 60000, who: "m5", orderId: "o1", text: "started **Assembly** on WO-1041 — 3 of 12 pcs done" },
    { ts: now - 35 * 60000, who: "m2", orderId: "o13", text: "started **Design & Drawings** on ENG-2043" },
    { ts: now - 47 * 60000, who: "m4", orderId: "o8", text: "started **Edge Banding** on WO-1048 — 2 of 6 pcs done" },
    { ts: now - 70 * 60000, who: "m4", orderId: "o1", text: "reported **5 of 8 pcs** at CNC / Drilling · Carcass on WO-1041" },
    { ts: now - 2 * 3600000, who: "m6", orderId: "o3", text: "blocked **Finishing · Tops** on WO-1043 — out of matte lacquer" },
    { ts: now - 3 * 3600000, who: "m7", orderId: "o7", text: "paused **Quality Check** on WO-1047" },
    { ts: now - 5 * 3600000, who: "m7", orderId: "o9", text: "completed **Packing** on WO-1039 — ready to ship" },
    { ts: now - 8 * 3600000, who: "m3", orderId: "o4", text: "started **Cutting** on WO-1044" },
    { ts: now - 1 * DAY, who: "m2", orderId: "o12", text: "created order **WO-1050** — Base cabinet 600 ×20" },
    { ts: now - 1 * DAY - 3600000, who: "m6", orderId: "o7", text: "completed **Finishing** on WO-1047" },
    { ts: now - 2 * DAY, who: "m2", materialId: "mat8", text: "received **100 pcs Hettich hinges**" },
  ];

  const todos = [
    { id: uid("td"), text: "Order more matte lacquer (10 L)", forId: "m2", by: "m1", ts: now - 2 * 3600000, done: false, due: now + DAY },
    { id: uid("td"), text: "Calibrate the edge bander before WO-1050", forId: "m4", by: "m2", ts: now - 5 * 3600000, done: false, due: now + 2 * DAY },
    { id: uid("td"), text: "Send photos of WO-1039 desks to client", forId: "m1", by: "m1", ts: now - DAY, done: true, doneAt: now - 3 * 3600000 },
  ];

  const pinSalt = randSalt();
  members.forEach(m => { m.pinHash = hashPin(m.pin, pinSalt); delete m.pin; }); // never store plaintext

  // demo: the manager already confirmed the client is happy with the drawings for the eng project
  const o13 = orders.find(o => o.id === "o13");
  if (o13) o13.clientApproved = { at: now - 2 * 3600000, by: "m1" };
  const notifications = [
    { id: uid("nt"), forId: "m8", by: "m1", ts: now - 2 * 3600000, read: false, type: "client_ok",
      orderId: "o13", text: "Client approved the drawings for ENG-2043 — you're clear to proceed to CNC programs" },
  ];

  return {
    v: 12,
    shopName: "Gervinsko Baldai",
    pinSalt,
    notifications,
    gprojects: seedPlanner(members),
    oneDrive: { baseUrl: "https://onedrive.live.com/Gervinsko-Baldai/Projektai", template: "{base}/{code}" },
    orderSeq: 1051,
    engSeq: 2044,
    members, stations: [...SEED_STATIONS, ...ENG_STATIONS], orders, activity,
    materials: seedMaterials(),
    stockMoves: seedStockMoves(),
    articles,
    portfolios: [
      { id: "p1", name: "Kavinė Šviesa fit-out", icon: "☕️", ic: "cup" },
      { id: "p2", name: "Standard products — July", icon: "📦", ic: "box" },
    ],
    boards: [seedBoard(members, false)],
    todos,
    scan: { prefixes: {} },
    scanLog: [],
    prefs: {},
  };
}

/* ============================================================
   Store
   ============================================================ */
const Store = {
  state: null,
  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) { this.state = JSON.parse(raw); this.migrate(); this._sessionBackup(); return; }
    } catch (e) {
      // primary state is corrupted — recover from the newest auto-backup before reseeding
      const b = this._backups()[0];
      if (b) { try { this.state = JSON.parse(b.data); this.migrate(); console.warn("[Store] recovered from backup", new Date(b.ts)); return; } catch (_) {} }
    }
    // fresh start: prefer the real-workshop backup seed (realdata.js) when present
    this.state = (typeof REAL_SEED !== "undefined") ? JSON.parse(JSON.stringify(REAL_SEED)) : seedData();
    this.migrate();
    this.save();
  },
  loadReal() {
    if (typeof REAL_SEED === "undefined") return false;
    this._backup("before restoring Dėdės Baldai backup");
    this.state = JSON.parse(JSON.stringify(REAL_SEED));
    this.migrate(); this.save();
    return true;
  },
  loadDemo() {
    this._backup("before loading demo");
    this.state = seedData();
    this.save();
  },
  /* Upgrade older saved states in place (never lose user edits) */
  migrate() {
    const s = this.state;
    if (!s.v || s.v < 2) {
      if (!s.materials) s.materials = seedMaterials();
      if (!s.stockMoves) s.stockMoves = seedStockMoves();
      if (!s.prefs) s.prefs = {};
      s.orders.forEach(o => { if (!o.materials) o.materials = seedOrderLines(o.id); });
      s.activity.forEach(a => {
        if (!a.orderId) {
          const m = a.text.match(/WO-\d+/);
          if (m) { const o = s.orders.find(x => x.num === m[0]); if (o) a.orderId = o.id; }
        }
      });
      s.v = 2;
    }
    if (s.v < 3) {
      // stations: mark production kind, append engineering stages
      s.stations.forEach(st => { if (!st.kind) st.kind = "prod"; });
      for (const es of ENG_STATIONS) if (!s.stations.find(x => x.id === es.id)) s.stations.push({ ...es });
      // catalogs
      if (!s.articles) s.articles = seedArticles();
      if (!s.portfolios) s.portfolios = [
        { id: "p1", name: "Kavinė Šviesa fit-out", icon: "☕️" },
        { id: "p2", name: "Standard products — July", icon: "📦" },
      ];
      if (!s.engSeq) s.engSeq = 2044;
      // orders: wrap flat ops into a single General item, add qty tracking
      s.orders.forEach(o => {
        o.type = o.type || (o.num && o.num.startsWith("ENG-") ? "eng" : "prod");
        if (o.portfolioId === undefined) o.portfolioId = o.id === "o11" ? "p1" : o.id === "o1" ? "p2" : null;
        if (!o.items) {
          const item = { id: o.id + "-it0", articleId: null, name: "General", qty: o.qty || 1 };
          o.items = [item];
          o.ops.forEach(op => {
            op.itemId = item.id;
            if (op.group === undefined) op.group = null;
            if (op.qtyDone === undefined) op.qtyDone = op.status === "done" ? item.qty : 0;
          });
        }
      });
      s.v = 3;
    }
    if (s.v < 4) {
      // whiteboards: starter board in the workshop's language flavour
      const lt = /baldai/i.test(s.shopName || "") && s.shopName !== "Gervinsko Baldai";
      if (!s.boards) s.boards = [seedBoard(s.members, lt)];
      s.v = 4;
    }
    if (s.v < 5) {
      // vector icon keys for stations/materials/portfolios (legacy emoji kept as fallback)
      s.stations.forEach(st => { if (!st.ic) st.ic = EMOJI_ICON_MAP[st.icon] || (st.kind === "eng" ? "bulb" : "toolbox"); });
      (s.materials || []).forEach(m => { if (!m.ic) m.ic = EMOJI_ICON_MAP[m.icon] || "box"; });
      (s.portfolios || []).forEach(p => { if (!p.ic) p.ic = EMOJI_ICON_MAP[p.icon] || "folder"; });
      // whiteboard sharing
      (s.boards || []).forEach(b => { if (!b.visibility) { b.visibility = "team"; b.memberIds = []; } });
      // personal to-dos
      if (!s.todos) s.todos = [];
      s.v = 5;
    }
    if (s.v < 6) {
      // OneDrive project-files linking (base folder + per-project overrides)
      if (!s.oneDrive) s.oneDrive = { baseUrl: "", template: "{base}/{code}" };
      s.v = 6;
    }
    if (s.v < 7) {
      // QR / barcode scan stations
      if (!s.scan) s.scan = { prefixes: {} };   // { "<scanner prefix>": stationId }
      if (!s.scanLog) s.scanLog = [];
      s.v = 7;
    }
    if (s.v < 8) {
      // engineer role: design staff become "engineer" (only they + managers see engineering)
      s.members.forEach(m => {
        if (m.role === "manager" && /projektav|design|engineer|konstrukt/i.test(m.trade || "")) m.role = "engineer";
      });
      // project archive: ended (shipped/delivered) projects are archived
      s.orders.forEach(o => {
        if (o.archived === undefined) o.archived = !!o.shipped;
        if (o.archived && !o.archivedAt) o.archivedAt = o.shippedAt || Date.now();
      });
      s.v = 8;
    }
    if (s.v < 9) {
      // hash PINs at rest — drop any plaintext pins
      if (!s.pinSalt) s.pinSalt = randSalt();
      s.members.forEach(m => {
        if (m.pin != null && !m.pinHash) m.pinHash = hashPin(m.pin, s.pinSalt);
        delete m.pin;
      });
      s.v = 9;
    }
    if (s.v < 10) {
      if (!s.notifications) s.notifications = [];
      s.v = 10;
    }
    if (s.v < 11) {
      // general project management (Planner): Asana/ClickUp-style projects+tasks
      if (!s.gprojects) s.gprojects = seedPlanner(s.members);
      s.v = 11;
    }
    if (s.v < 12) {
      // Engineering and production are SEPARATE: an order carries only the steps
      // that match its own type. Older imports merged eng + prod tasks onto one
      // order (so a design project already showed Pjovimas etc.) and auto-started
      // some tasks. Split the phases apart, and reset auto-started tasks to queued.
      this._backup("before separating engineering/production");   // safety point — this cleanup drops steps
      const kindOf = {};
      (s.stations || []).forEach(st => { kindOf[st.id] = st.kind || "prod"; });
      (s.orders || []).forEach(o => {
        if (!Array.isArray(o.ops)) return;
        const want = o.type === "eng" ? "eng" : "prod";
        const match = o.ops.filter(op => (kindOf[op.stationId] || "prod") === want);
        if (match.length && match.length !== o.ops.length) {
          o.ops = match;                                   // drop the other phase's steps
        } else if (!match.length && o.ops.length) {
          o.type = (kindOf[o.ops[0].stationId] || "prod") === "eng" ? "eng" : "prod"; // mistyped → fix type
        }
        o.ops.forEach(op => {                              // nothing starts on its own
          if (op.status === "running" || op.status === "paused") {
            op.status = "queued"; op.startedAt = null; op.loggedMs = 0;
          }
        });
      });
      s.v = 12;
    }
    this.save();
  },
  save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.state));
      this._saveError = null;
    } catch (e) {
      // storage full? free the auto-backups and retry once — the live data always wins
      try {
        localStorage.removeItem(BK_KEY);
        localStorage.setItem(DB_KEY, JSON.stringify(this.state));
        this._saveError = null;
      } catch (e2) {
        this._saveError = e2;
        console.error("[Store] save failed:", e2 && e2.message);
        if (typeof Toast !== "undefined")
          Toast.show("Couldn't save on this device — storage is full. Export a backup now.", { emoji: "alert", ms: 8000 });
      }
    }
    if (this._onSave) this._onSave();   // cloud sync still receives the in-memory state
  },
  reset() { localStorage.removeItem(DB_KEY); this.load(); },
  snapshot() { return JSON.stringify(this.state); },
  restore(snap) { this.state = JSON.parse(snap); Store.save(); },

  /* ---- local auto-backups: rolling restore points, best-effort ---- */
  _backups() { try { return JSON.parse(localStorage.getItem(BK_KEY) || "[]"); } catch (e) { return []; } },
  _backup(reason) {
    if (!this.state) return;
    try {
      const snap = JSON.stringify(this.state);
      const list = this._backups();
      if (list[0] && list[0].data === snap) return;                 // unchanged since last backup
      list.unshift({ ts: Date.now(), reason: reason || "auto", data: snap });
      localStorage.setItem(BK_KEY, JSON.stringify(list.slice(0, BK_MAX)));
    } catch (e) {
      try { localStorage.setItem(BK_KEY, JSON.stringify(this._backups().slice(0, 2))); } catch (_) {}
    }
  },
  _sessionBackup() {                                                // one restore point per hour of use
    const list = this._backups();
    if (!list[0] || Date.now() - list[0].ts > 36e5) this._backup("session");
  },
  restoreBackup(ts) {
    const b = this._backups().find(x => x.ts === ts);
    if (!b) return false;
    this._backup("before restore");                                 // so the restore itself is undoable
    this.state = JSON.parse(b.data);
    this.migrate();
    return true;
  },
  /* ---- import a JSON file exported from ShopFlow ---- */
  importJSON(text) {
    const incoming = JSON.parse(text);                              // throws on invalid JSON
    if (!incoming || typeof incoming !== "object" || !Array.isArray(incoming.orders) || !Array.isArray(incoming.members))
      throw new Error("Not a ShopFlow backup");
    this._backup("before import");
    this.state = incoming;
    this.migrate();                                                 // upgrade older exports (also saves)
    return true;
  },
};

/* ============================================================
   Domain helpers (derived state)
   ============================================================ */
const D = {
  member: (id) => Store.state.members.find(m => m.id === id) || null,
  station: (id) => Store.state.stations.find(s => s.id === id) || null,
  stationsOf: (kind) => Store.state.stations.filter(s => (s.kind || "prod") === kind),
  order: (id) => Store.state.orders.find(o => o.id === id) || null,
  material: (id) => Store.state.materials.find(m => m.id === id) || null,
  article: (id) => Store.state.articles.find(a => a.id === id) || null,
  portfolio: (id) => Store.state.portfolios.find(p => p.id === id) || null,
  board: (id) => (Store.state.boards || []).find(b => b.id === id) || null,

  /* boards a member may see: team-wide, own, or explicitly shared */
  boardAccess(b, memberId) {
    if (!b) return false;
    if (b.createdBy === memberId) return true;
    if ((b.visibility || "team") === "team") return true;
    if (b.visibility === "custom") return (b.memberIds || []).includes(memberId);
    return false; // private
  },
  boardsFor(memberId) {
    return (Store.state.boards || []).filter(b => this.boardAccess(b, memberId));
  },

  /* ---------- To-dos ---------- */
  todosFor(memberId) {
    return (Store.state.todos || []).filter(t => t.forId === memberId)
      .sort((a, b) => (a.done - b.done) || (a.due || Infinity) - (b.due || Infinity) || b.ts - a.ts);
  },
  openTodoCount(memberId) {
    return (Store.state.todos || []).filter(t => t.forId === memberId && !t.done).length;
  },

  /* ---------- Planner (general PM) ---------- */
  gproject: (id) => (Store.state.gprojects || []).find(p => p.id === id) || null,
  activeGProjects() { return (Store.state.gprojects || []).filter(p => !p.archived); },
  gtask(project, taskId) { return project ? project.tasks.find(t => t.id === taskId) : null; },
  gstage(project, stageId) { return project ? project.stages.find(s => s.id === stageId) : null; },
  gStageTasks(project, stageId) {
    return project.tasks.filter(t => t.stageId === stageId).sort((a, b) => a.ord - b.ord);
  },
  gTaskDone(project, task) { const s = this.gstage(project, task.stageId); return !!(s && s.done); },
  gProgress(project) {
    const total = project.tasks.length;
    const done = project.tasks.filter(t => this.gTaskDone(project, t)).length;
    return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
  },
  gSubProgress(task) {
    const s = task.subtasks || [];
    return { done: s.filter(x => x.done).length, total: s.length };
  },
  /* all tasks assigned to a member across active projects (each with its project) */
  myGTasks(memberId) {
    const out = [];
    for (const p of this.activeGProjects())
      for (const t of p.tasks)
        if (t.assigneeId === memberId && !this.gTaskDone(p, t)) out.push({ project: p, task: t });
    out.sort((a, b) => (a.task.due || Infinity) - (b.task.due || Infinity) || prioRank(a.task) - prioRank(b.task));
    return out;
  },
  myGTaskCount(memberId) {
    return this.activeGProjects().reduce((n, p) => n + p.tasks.filter(t => t.assigneeId === memberId && !this.gTaskDone(p, t)).length, 0);
  },
  gLabel(project, id) { return (project.labels || []).find(l => l.id === id) || null; },

  /* ---------- Notifications ---------- */
  notificationsFor(memberId) {
    return (Store.state.notifications || []).filter(n => n.forId === memberId).sort((a, b) => b.ts - a.ts);
  },
  unreadCount(memberId) {
    return (Store.state.notifications || []).filter(n => n.forId === memberId && !n.read).length;
  },
  /* engineers (or managers) carrying a project — who to notify about it */
  projectEngineers(order) {
    const ids = new Set();
    for (const op of order.ops) {
      const m = op.assigneeId && this.member(op.assigneeId);
      if (m && (m.role === "engineer" || m.role === "manager")) ids.add(m.id);
    }
    if (!ids.size) Store.state.members.filter(m => m.role === "engineer").forEach(m => ids.add(m.id));
    return [...ids];
  },

  /* ---------- QR / barcode scanning ----------
     Labels (e.g. SWOOD) encode a part code like "SA_GA_VIRT_404"
     = {PROJECT}_{partNo}. We strip the part number to get the
     project code, match the order, and count the part at a station. */
  scanParse(raw) {
    let body = String(raw || "").trim();
    if (!body) return null;
    let stationId = null;
    // optional scanner prefix "EDGE#..." → route to a station
    const px = Store.state.scan?.prefixes || {};
    const h = body.indexOf("#");
    if (h > 0 && px[body.slice(0, h)]) { stationId = px[body.slice(0, h)]; body = body.slice(h + 1).trim(); }
    // native ShopFlow token: SF|orderId|itemId|part
    if (body.startsWith("SF|")) {
      const [, oid, iid, part] = body.split("|");
      const o = D.order(oid);
      if (o) return { order: o, item: iid ? D.item(o, iid) : null, partCode: part || body, stationId };
    }
    const partCode = body;
    const project = body.replace(/[_-]\d+[A-Z]?$/i, "").trim(); // SA_GA_VIRT_404 -> SA_GA_VIRT
    const UP = body.toUpperCase(), PUP = project.toUpperCase();
    const hit = (o) => {
      const n = (o.num || "").toUpperCase(), p = (o.product || "").toUpperCase();
      return n === UP || n === PUP || (PUP && (n.includes(PUP) || p.includes(PUP))) || (n && UP.includes(n));
    };
    let order = Store.state.orders.find(o => (o.num || "").toUpperCase() === UP)
             || Store.state.orders.find(o => (o.num || "").toUpperCase() === PUP)
             || Store.state.orders.find(hit);
    // article SKU on the label → item
    let item = null;
    if (!order) {
      for (const o of Store.state.orders) for (const it of o.items) {
        const art = it.articleId ? D.article(it.articleId) : null;
        if (art && UP.includes(art.sku.toUpperCase())) { order = o; item = it; break; }
      }
    }
    return order ? { order, item, partCode, project, stationId } : { order: null, partCode, project, stationId };
  },

  stationScanStats(stationId) {
    let done = 0, total = 0;
    for (const o of Store.state.orders) {
      if (o.archived) continue;
      for (const op of o.ops) if (op.stationId === stationId) {
        const it = D.item(o, op.itemId);
        done += op.qtyDone; total += it ? it.qty : 0;
      }
    }
    return { done, total };
  },

  /* ---------- Project files (OneDrive) ---------- */
  slug(s) { return String(s || "").trim().replace(/[\\/:*?"<>|#%]+/g, "").replace(/\s+/g, "_"); },
  projectLink(order) {
    if (!order) return null;
    if (order.oneDriveUrl) return order.oneDriveUrl;          // explicit per-project override
    const od = Store.state.oneDrive;
    if (od && od.baseUrl) {
      const base = od.baseUrl.replace(/\/+$/, "");
      return (od.template || "{base}/{code}")
        .replace("{base}", base)
        .replace("{code}", encodeURIComponent(this.slug(order.num)))
        .replace("{name}", encodeURIComponent(this.slug(order.product)));
    }
    return null;
  },
  projectLinkIsAuto(order) { return !!order && !order.oneDriveUrl && !!Store.state.oneDrive?.baseUrl; },

  /* status label with order context (eng projects aren't "shipped") */
  statusLabelFor(order, st) {
    if (order.type === "eng") {
      if (st === "ready") return "Complete";
      if (st === "shipped") return "Delivered";
    }
    return this.statusLabel[st] || st;
  },
  item: (order, itemId) => order.items.find(i => i.id === itemId) || null,

  /* ---------- Lanes & piece flow ---------- */
  laneOps(order, itemId, group) {
    return order.ops.filter(op => op.itemId === itemId && op.group === group);
  },
  itemGroups(order, itemId) {
    const gs = [];
    for (const op of order.ops) {
      if (op.itemId !== itemId || op.group === null) continue;
      if (!gs.includes(op.group)) gs.push(op.group);
    }
    return gs;
  },
  /* pieces available to process at this op (upstream throughput cap) */
  opAvail(order, op) {
    const item = this.item(order, op.itemId);
    if (!item) return 0;
    const lane = this.laneOps(order, op.itemId, op.group);
    const i = lane.indexOf(op);
    if (i > 0) return lane[i - 1].status === "done" ? item.qty : lane[i - 1].qtyDone;
    if (op.group !== null) return item.qty; // first op of a part lane
    // first op of the shared/final lane: capped by the slowest part lane
    const groups = this.itemGroups(order, op.itemId);
    if (!groups.length) return item.qty;
    let avail = item.qty;
    for (const g of groups) {
      const l = this.laneOps(order, op.itemId, g);
      const last = l[l.length - 1];
      avail = Math.min(avail, last.status === "done" ? item.qty : last.qtyDone);
    }
    return avail;
  },
  /* can this op be worked on now? */
  opReady(order, op) {
    if (op.status === "done") return false;
    return this.opAvail(order, op) > 0 || op.qtyDone > 0 || ["running", "paused", "blocked"].includes(op.status);
  },
  activeOps(order) {
    return order.ops.filter(op => this.opReady(order, op));
  },
  currentOp(order) { return this.activeOps(order)[0] || (order.ops.find(op => op.status !== "done") ? order.ops.find(op => op.status !== "done") : null); },

  opLabel(order, op) {
    const st = this.station(op.stationId);
    const item = this.item(order, op.itemId);
    const multi = order.items.length > 1;
    const bits = [];
    if (op.group) bits.push(op.group);
    if (multi && item) bits.push(item.name);
    return { station: st, suffix: bits.join(" · ") };
  },

  /* is this project ended (archived)? */
  isActive(order) { return !order.archived; },

  /* Order status derived from ops */
  orderStatus(order) {
    if (order.archived || order.shipped) return "shipped";
    if (!order.ops.length) return "queued";
    if (order.ops.every(op => op.status === "done")) return "ready";
    const active = this.activeOps(order);
    if (active.some(op => op.status === "blocked")) return "blocked";
    if (active.some(op => op.status === "running")) return "running";
    if (active.some(op => op.status === "paused")) return "paused";
    if (order.ops.some(op => op.status === "done" || op.qtyDone > 0)) return "running";
    return "queued";
  },

  statusLabel: {
    queued: "Not started", running: "In production", paused: "Paused",
    blocked: "Blocked", ready: "Ready to ship", shipped: "Shipped", done: "Done",
  },

  progress(order) {
    const done = order.ops.filter(op => op.status === "done").length;
    return { done, total: order.ops.length, pct: order.ops.length ? Math.round(done / order.ops.length * 100) : 0 };
  },

  /* final-op output per item, e.g. how many are packed */
  itemFinished(order, itemId) {
    const ops = order.ops.filter(op => op.itemId === itemId);
    if (!ops.length) return { done: 0, label: "finished" };
    // "finished" = output of the final (shared) lane's last op, not whatever op sits last in the array
    const finalLane = ops.filter(op => op.group === null);
    const last = (finalLane.length ? finalLane : ops)[(finalLane.length ? finalLane : ops).length - 1];
    const st = this.station(last.stationId);
    const item = this.item(order, itemId);
    return {
      done: last.status === "done" ? item.qty : last.qtyDone,
      label: st ? st.name.toLowerCase() : "finished",
    };
  },
  orderQty(order) { return order.items.reduce((s, i) => s + i.qty, 0); },
  packedSummary(order) {
    let done = 0, total = 0, label = "packed";
    for (const it of order.items) {
      const f = this.itemFinished(order, it.id);
      done += f.done; total += it.qty; label = f.label;
    }
    return { done, total, label };
  },

  opElapsed(op) {
    let ms = op.loggedMs || 0;
    if (op.status === "running" && op.startedAt) ms += Date.now() - op.startedAt;
    return ms;
  },

  /* What a member is running right now */
  runningOpOf(memberId) {
    for (const o of Store.state.orders) {
      if (o.archived) continue;
      const op = o.ops.find(op => op.status === "running" && op.assigneeId === memberId);
      if (op) return { order: o, op };
    }
    return null;
  },

  /* Task queue for a member: ready ops assigned to them or unassigned at their home station.
     Production workers only see manufacturing projects; engineers only engineering. */
  workerQueue(memberId) {
    const me = this.member(memberId);
    const wantEng = me && me.role === "engineer";
    const out = [];
    for (const o of Store.state.orders) {
      if (o.archived) continue;
      if ((o.type === "eng") !== wantEng) continue; // workers never see eng; engineers only eng
      for (const op of this.activeOps(o)) {
        const mine = op.assigneeId === memberId;
        const atMyStation = !op.assigneeId && me.station && op.stationId === me.station;
        if (mine || atMyStation) out.push({ order: o, op });
      }
    }
    out.sort((a, b) => prioRank(a.order) - prioRank(b.order) || a.order.due - b.order.due);
    return out;
  },

  /* All ready tasks at a station (an order can be at several stations at once) */
  stationQueue(stationId) {
    const out = [];
    for (const o of Store.state.orders) {
      if (o.archived) continue;
      for (const op of this.activeOps(o))
        if (op.stationId === stationId) out.push({ order: o, op });
    }
    out.sort((a, b) => prioRank(a.order) - prioRank(b.order) || a.order.due - b.order.due);
    return out;
  },

  doneTodayBy(memberId) {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    let n = 0;
    for (const o of Store.state.orders)
      for (const op of o.ops)
        if (op.status === "done" && op.completedAt >= midnight.getTime() &&
            (op.assigneeId === memberId || op.completedBy === memberId)) n++;
    return n;
  },

  /* ---------- Portfolios ---------- */
  portfolioOrders(pid) { return Store.state.orders.filter(o => o.portfolioId === pid); },
  portfolioRollup(pid) {
    const orders = this.portfolioOrders(pid);
    let done = 0, total = 0;
    const statuses = {};
    let minDue = Infinity, maxDue = -Infinity;
    for (const o of orders) {
      const p = this.progress(o);
      done += p.done; total += p.total;
      const st = this.orderStatus(o);
      statuses[st] = (statuses[st] || 0) + 1;
      if (!o.archived) { minDue = Math.min(minDue, o.due); maxDue = Math.max(maxDue, o.due); }
    }
    return { orders, done, total, pct: total ? Math.round(done / total * 100) : 0, statuses, minDue, maxDue };
  },

  /* ---------- Warehouse ---------- */
  lowStock() { return Store.state.materials.filter(m => m.qty <= m.minQty); },

  lastMove(materialId) {
    return Store.state.stockMoves.filter(sm => sm.materialId === materialId).sort((a, b) => b.ts - a.ts)[0] || null;
  },

  materialMoves(materialId) {
    return Store.state.stockMoves.filter(sm => sm.materialId === materialId).sort((a, b) => b.ts - a.ts);
  },

  lineShort(line) {
    const mat = this.material(line.materialId);
    return !line.consumed && mat && mat.qty < line.qty;
  },

  orderShortages(order) { return (order.materials || []).filter(l => this.lineShort(l)); },

  materialInUse(materialId) {
    return Store.state.orders.some(o => !o.archived && (o.materials || []).some(l => l.materialId === materialId && !l.consumed));
  },

  /* ---------- Audit ---------- */
  orderHistory(orderId) {
    const o = this.order(orderId);
    return Store.state.activity.filter(a => a.orderId === orderId || (o && a.text.includes(o.num)));
  },

  /* ---------- View prefs (per member) ---------- */
  pref(memberId, key, def) {
    const v = Store.state.prefs?.[memberId]?.[key];
    return v === undefined ? def : v;
  },
};

function prioRank(order) { return { rush: 0, high: 1, normal: 2, low: 3 }[order.priority] ?? 2; }

/* ============================================================
   Mutations (all go through here → persisted + activity log)
   ============================================================ */
const M = {
  log(who, text, meta = {}) {
    Store.state.activity.unshift({ ts: Date.now(), who, text, ...meta });
    if (Store.state.activity.length > 500) Store.state.activity.length = 500;
  },

  _opName(o, op) {
    const { station, suffix } = D.opLabel(o, op);
    return `${station ? station.name : "?"}${suffix ? " · " + suffix : ""}`;
  },

  _pauseOtherRunning(memberId) {
    for (const o of Store.state.orders) {
      for (const op of o.ops) {
        if (op.status === "running" && op.assigneeId === memberId) {
          op.loggedMs = D.opElapsed(op); op.startedAt = null; op.status = "paused";
        }
      }
    }
  },

  startOp(orderId, opId, memberId) {
    const o = D.order(orderId); const op = o.ops.find(x => x.id === opId);
    this._pauseOtherRunning(memberId);
    // fold any already-ticking time (e.g. op was running unassigned) before resetting the clock
    if (op.status === "running" && op.startedAt) op.loggedMs = D.opElapsed(op);
    if (memberId) op.assigneeId = memberId;
    op.status = "running"; op.startedAt = Date.now(); op.blockNote = null;
    this.log(memberId, `started **${this._opName(o, op)}** on ${o.num}`, { orderId });
    Store.save();
  },

  pauseOp(orderId, opId, memberId) {
    const o = D.order(orderId); const op = o.ops.find(x => x.id === opId);
    op.loggedMs = D.opElapsed(op); op.startedAt = null; op.status = "paused";
    this.log(memberId, `paused **${this._opName(o, op)}** on ${o.num}`, { orderId });
    Store.save();
  },

  /* Report produced pieces at an op (MRPEasy-style partial completion).
     Auto-completes the op when the full item quantity is reached. */
  reportQty(orderId, opId, qty, memberId, opts = {}) {
    const o = D.order(orderId); const op = o.ops.find(x => x.id === opId);
    const item = D.item(o, op.itemId);
    const avail = D.opAvail(o, op);
    // never force an already-reported count down to a shrunken avail — allow stepping down one at a time
    const upper = Math.max(avail, Math.min(op.qtyDone, item.qty));
    const clamped = Math.max(0, Math.min(qty, upper));
    if (clamped === op.qtyDone) return op.qtyDone;
    op.qtyDone = clamped;
    if (op.qtyDone >= item.qty) {
      op.loggedMs = D.opElapsed(op); op.startedAt = null;
      op.status = "done"; op.completedAt = Date.now(); op.completedBy = memberId; op.blockNote = null;
      if (!opts.silent) this.log(memberId, `completed **${this._opName(o, op)}** on ${o.num} — all ${item.qty} ${item.qty > 1 ? "pcs" : "pc"} done`, { orderId });
    } else if (!opts.silent) {
      this.log(memberId, `reported **${op.qtyDone} of ${item.qty} pcs** at ${this._opName(o, op)} on ${o.num}`, { orderId });
    }
    Store.save();
    return op.qtyDone;
  },

  /* Register a scanned part at a station. Dedups by part code per op. */
  scanPart(payload, stationId, memberId) {
    const parsed = D.scanParse(payload);
    const push = (status, extra) => {
      const rec = { ts: Date.now(), by: memberId, payload: String(payload).slice(0, 60), status,
                    orderId: extra?.order?.id || null, stationId: extra?.station?.id || stationId || null,
                    partCode: parsed?.partCode || null };
      Store.state.scanLog.unshift(rec);
      if (Store.state.scanLog.length > 300) Store.state.scanLog.length = 300;
      Store.save();
      return { status, parsed, ...extra };
    };
    if (!parsed || !parsed.order) return push("notfound", { order: parsed?.order || null });
    const o = parsed.order;
    const st = D.station(parsed.stationId || stationId);
    if (!st) return push("nostation", { order: o });
    // candidate ops at this station (optionally for the scanned item), not yet done
    let cands = o.ops.filter(op => op.stationId === st.id && op.status !== "done");
    if (parsed.item) cands = cands.filter(op => op.itemId === parsed.item.id);
    const op = cands.find(op => D.opReady(o, op)) || cands[0];
    if (!op) {
      const routed = o.ops.some(op => op.stationId === st.id);
      return push(routed ? "stationDone" : "notrouted", { order: o, station: st });
    }
    const item = D.item(o, op.itemId);
    // dedup identical part scanned twice at the same op
    op.scanCodes = op.scanCodes || [];
    if (parsed.partCode && op.scanCodes.includes(parsed.partCode))
      return push("dup", { order: o, station: st, item, op });
    if (op.qtyDone >= item.qty) return push("stationDone", { order: o, station: st, item, op });
    if (op.qtyDone >= D.opAvail(o, op)) return push("waiting", { order: o, station: st, item, op });
    if (parsed.partCode) op.scanCodes.push(parsed.partCode);
    const wasStatus = op.status;
    if (op.status === "queued") op.status = "paused"; // work has begun at this station
    if (!op.assigneeId) op.assigneeId = memberId;
    const newQty = this.reportQty(o.id, op.id, op.qtyDone + 1, memberId, { silent: true });
    const completed = D.order(o.id).ops.find(x => x.id === op.id).status === "done";
    if (completed) this.log(memberId, `scan: completed **${this._opName(o, op)}** on ${o.num} — ${item.qty} pcs`, { orderId: o.id });
    return push(completed ? "opDone" : "ok", { order: o, station: st, item, op, qtyDone: newQty });
  },

  setScanPrefix(prefix, stationId) {
    Store.state.scan = Store.state.scan || { prefixes: {} };
    if (!stationId) delete Store.state.scan.prefixes[prefix];
    else Store.state.scan.prefixes[prefix] = stationId;
    Store.save();
  },

  completeOp(orderId, opId, memberId) {
    const o = D.order(orderId); const op = o.ops.find(x => x.id === opId);
    const item = D.item(o, op.itemId);
    const avail = D.opAvail(o, op);
    op.loggedMs = D.opElapsed(op); op.startedAt = null;
    if (item && avail < item.qty) {
      // upstream hasn't produced everything yet — report what's possible (never lower an existing count)
      op.qtyDone = Math.max(op.qtyDone, avail); op.status = "paused";
      this.log(memberId, `reported **${op.qtyDone} of ${item.qty} pcs** at ${this._opName(o, op)} on ${o.num} — waiting for upstream`, { orderId });
      Store.save();
      return null;
    }
    op.qtyDone = item ? item.qty : 1;
    op.status = "done"; op.completedAt = Date.now(); op.completedBy = memberId; op.blockNote = null;
    const next = D.activeOps(o).find(x => x.itemId === op.itemId && x.group === op.group) || D.activeOps(o)[0] || null;
    this.log(memberId, next
      ? `completed **${this._opName(o, op)}** on ${o.num} → next: ${this._opName(o, next)}`
      : `completed **${this._opName(o, op)}** on ${o.num}${o.ops.every(x => x.status === "done") ? " — ready to ship 🎉" : ""}`, { orderId });
    Store.save();
    return next;
  },

  blockOp(orderId, opId, memberId, note) {
    const o = D.order(orderId); const op = o.ops.find(x => x.id === opId);
    op.loggedMs = D.opElapsed(op); op.startedAt = null;
    op.status = "blocked"; op.blockNote = note || "Blocked";
    this.log(memberId, `blocked **${this._opName(o, op)}** on ${o.num} — ${note || ""}`, { orderId });
    Store.save();
  },

  unblockOp(orderId, opId, memberId) {
    const o = D.order(orderId); const op = o.ops.find(x => x.id === opId);
    op.status = op.loggedMs > 0 ? "paused" : "queued"; op.blockNote = null;
    this.log(memberId, `unblocked **${this._opName(o, op)}** on ${o.num}`, { orderId });
    Store.save();
  },

  reopenOp(orderId, opId, memberId) {
    const o = D.order(orderId); const op = o.ops.find(x => x.id === opId);
    op.status = "paused"; op.completedAt = null;
    this.log(memberId, `reopened **${this._opName(o, op)}** on ${o.num}`, { orderId });
    Store.save();
  },

  assignOp(orderId, opId, memberId, byId) {
    const o = D.order(orderId); const op = o.ops.find(x => x.id === opId);
    const prev = D.member(op.assigneeId);
    op.assigneeId = memberId || null;
    this.log(byId, memberId
      ? `assigned **${this._opName(o, op)}** on ${o.num} to ${D.member(memberId).name}`
      : `unassigned **${this._opName(o, op)}** on ${o.num}${prev ? ` (was ${prev.name})` : ""}`, { orderId });
    Store.save();
  },

  /* ---------- Routing editing ---------- */
  addOp(orderId, stationId, estMins, byId, itemId, group) {
    const o = D.order(orderId);
    const st = D.station(stationId);
    const item = itemId ? D.item(o, itemId) : o.items[0];
    const newOp = {
      id: uid("op"), itemId: item.id, group: group ?? null,
      stationId, estMins: estMins || st.estMins,
      status: "queued", qtyDone: 0, assigneeId: null, loggedMs: 0, startedAt: null, completedAt: null, blockNote: null,
    };
    // keep lanes contiguous: insert right after the lane's current last op
    const lane = D.laneOps(o, item.id, newOp.group);
    if (lane.length) o.ops.splice(o.ops.indexOf(lane[lane.length - 1]) + 1, 0, newOp);
    else o.ops.push(newOp);
    o.shipped = false;
    this.log(byId, `added step **${st.name}${group ? " · " + group : ""}** to ${o.num} routing`, { orderId });
    Store.save();
  },

  removeOp(orderId, opId, byId) {
    const o = D.order(orderId);
    const op = o.ops.find(x => x.id === opId);
    if (!op || op.status === "done") return false;
    o.ops = o.ops.filter(x => x.id !== opId);
    this.log(byId, `removed step **${D.station(op.stationId)?.name || "?"}** from ${o.num} routing`, { orderId });
    Store.save();
    return true;
  },

  moveOp(orderId, opId, dir, byId) {
    const o = D.order(orderId);
    const op = o.ops.find(x => x.id === opId);
    if (!op || op.status === "done") return false;
    // swap with the lane neighbour (lane order = array order, but lanes may not be array-contiguous)
    const lane = D.laneOps(o, op.itemId, op.group);
    const li = lane.indexOf(op), lj = li + dir;
    if (lj < 0 || lj >= lane.length || lane[lj].status === "done") return false;
    const i = o.ops.indexOf(lane[li]), j = o.ops.indexOf(lane[lj]);
    [o.ops[i], o.ops[j]] = [o.ops[j], o.ops[i]];
    this.log(byId, `reordered routing on ${o.num}`, { orderId });
    Store.save();
    return true;
  },

  /* Drag a lane's task to a station column: complete lane ops before it, reopen from it */
  moveLane(orderId, itemId, group, stationId, byId) {
    const o = D.order(orderId);
    const item = D.item(o, itemId);
    if (stationId === "__ready") {
      for (const op of o.ops) if (op.status !== "done") {
        op.loggedMs = D.opElapsed(op); op.startedAt = null;
        op.status = "done"; op.qtyDone = D.item(o, op.itemId).qty; op.completedAt = Date.now(); op.completedBy = byId;
      }
      this.log(byId, `moved ${o.num} to **Ready to ship**`, { orderId });
      Store.save(); return true;
    }
    const lane = D.laneOps(o, itemId, group);
    const idx = lane.findIndex(op => op.stationId === stationId);
    if (idx < 0) return false;
    lane.forEach((op, i) => {
      if (i < idx && op.status !== "done") {
        op.loggedMs = D.opElapsed(op); op.startedAt = null;
        op.status = "done"; op.qtyDone = item.qty; op.completedAt = Date.now(); op.completedBy = byId;
      }
      if (i === idx && op.status === "done") { op.status = "queued"; op.qtyDone = 0; op.completedAt = null; }
      if (i > idx && (op.status !== "queued" || op.qtyDone > 0)) {
        // everything downstream of the new position starts over
        op.loggedMs = D.opElapsed(op); op.startedAt = null;
        op.status = "queued"; op.qtyDone = 0; op.completedAt = null; op.blockNote = null;
      }
    });
    o.shipped = false; o.archived = false;
    this.log(byId, `moved ${o.num}${group ? ` · ${group}` : ""} to **${D.station(stationId).name}**`, { orderId });
    Store.save();
    return true;
  },

  /* Legacy helper: single-lane orders only */
  moveOrderToStation(orderId, stationId, byId) {
    const o = D.order(orderId);
    if (stationId === "__ready") return this.moveLane(orderId, o.items[0].id, null, "__ready", byId);
    // find the unique lane containing this station
    const lanes = [];
    for (const it of o.items) {
      for (const g of [...D.itemGroups(o, it.id), null])
        if (D.laneOps(o, it.id, g).some(op => op.stationId === stationId)) lanes.push([it.id, g]);
    }
    if (lanes.length !== 1) return false;
    return this.moveLane(orderId, lanes[0][0], lanes[0][1], stationId, byId);
  },

  shipOrder(orderId, byId) {
    const o = D.order(orderId);
    o.shipped = true; o.shippedAt = Date.now();
    o.archived = true; o.archivedAt = Date.now();       // ending a project archives it
    this.log(byId, o.type === "eng" ? `delivered **${o.num}** — ${o.product}` : `shipped **${o.num}** — ${o.product}`, { orderId });
    Store.save();
  },

  /* End a project (any state) → send to archive */
  archiveOrder(orderId, byId) {
    const o = D.order(orderId);
    o.archived = true; o.archivedAt = Date.now();
    this.log(byId, `archived **${o.num}** — ${o.product}`, { orderId });
    Store.save();
  },
  unarchiveOrder(orderId, byId) {
    const o = D.order(orderId);
    o.archived = false; o.archivedAt = null; o.shipped = false; o.shippedAt = null;
    this.log(byId, `restored **${o.num}** from archive`, { orderId });
    Store.save();
  },

  /* Hand an engineering project off to production: spawn a linked manufacturing
     project and archive the engineering one (its design phase is done). */
  handoffToProduction(engId, { route, lines }, byId) {
    const eng = D.order(engId);
    const prod = this.createOrder({
      type: "prod", product: eng.product, client: eng.client,
      unit: "vnt", priority: eng.priority, due: eng.due,
      notes: eng.notes, portfolioId: eng.portfolioId, oneDriveUrl: eng.oneDriveUrl,
      route, lines,
    }, byId);
    prod.fromEngId = eng.id;
    eng.handedOffTo = prod.id;
    eng.archived = true; eng.archivedAt = Date.now();
    this.log(byId, `handed off **${eng.num}** to production → created **${prod.num}**`, { orderId: prod.id });
    Store.save();
    return prod;
  },

  /* Create order.
     type "prod": either `lines` [{articleId, qty} | {name, qty, route:[{stationId,estMins}]}]
                  or legacy `route` (single custom item)
     type "eng":  `stages` [stationId…] */
  createOrder({ type = "prod", product, client, qty, unit, priority, due, notes, route, lines, stages, portfolioId, oneDriveUrl }, byId) {
    const s = Store.state;
    const num = type === "eng" ? "ENG-" + (s.engSeq++) : "WO-" + (s.orderSeq++);
    const id = uid("o");
    const items = [];
    const ops = [];

    if (type === "eng") {
      const item = { id: id + "-it0", articleId: null, name: "Project", qty: 1 };
      items.push(item);
      for (const stId of (stages || [])) {
        const st = D.station(stId);
        ops.push({ id: uid("op"), itemId: item.id, group: null, stationId: stId, estMins: st.estMins, status: "queued", qtyDone: 0, assigneeId: null, loggedMs: 0, startedAt: null, completedAt: null, blockNote: null });
      }
    } else if (lines && lines.length) {
      for (const line of lines) {
        const item = { id: uid("it"), articleId: line.articleId || null, name: line.name, qty: line.qty };
        items.push(item);
        if (line.articleId) {
          const art = D.article(line.articleId);
          item.name = art.name;
          ops.push(...opsFromArticle(art, item));
        } else {
          for (const r of (line.route || [])) {
            ops.push({ id: uid("op"), itemId: item.id, group: null, stationId: r.stationId, estMins: r.estMins, status: "queued", qtyDone: 0, assigneeId: null, loggedMs: 0, startedAt: null, completedAt: null, blockNote: null });
          }
        }
      }
    } else {
      const item = { id: id + "-it0", articleId: null, name: "General", qty: qty || 1 };
      items.push(item);
      for (const r of (route || [])) {
        ops.push({ id: uid("op"), itemId: item.id, group: null, stationId: r.stationId, estMins: r.estMins, status: "queued", qtyDone: 0, assigneeId: r.assigneeId || null, loggedMs: 0, startedAt: null, completedAt: null, blockNote: null });
      }
    }

    const order = {
      id, num, type, product, client,
      qty: items.reduce((sum, i) => sum + i.qty, 0), unit: unit || (type === "eng" ? "project" : "units"),
      priority: priority || "normal", due, notes: notes || "",
      shipped: false, archived: false, createdAt: Date.now(), portfolioId: portfolioId || null,
      oneDriveUrl: oneDriveUrl || "",
      materials: [], items, ops,
    };
    Store.state.orders.unshift(order);
    const taskNote = ops.length ? ` — ${ops.length} tasks created` : "";
    this.log(byId, `created ${type === "eng" ? "engineering project" : "order"} **${num}** for ${client}${taskNote}`, { orderId: order.id });
    Store.save();
    return order;
  },

  updateOrder(orderId, patch, byId) {
    const o = D.order(orderId);
    Object.assign(o, patch);
    Store.save();
  },

  updateOrderLogged(orderId, patch, byId) {
    const o = D.order(orderId);
    const changes = [];
    const label = {
      product: v => `renamed to “${v}”`,
      client: v => `client → ${v}`,
      qty: v => `quantity → ${v}`,
      unit: v => `unit → ${v}`,
      priority: v => `priority ${o.priority} → ${v}`,
      due: v => `due date ${fmtDate(o.due)} → ${fmtDate(v)}`,
      notes: () => `edited notes`,
      portfolioId: v => `portfolio → ${v ? (D.portfolio(v)?.name || "?") : "none"}`,
      oneDriveUrl: v => v ? `set OneDrive link` : `cleared OneDrive link`,
    };
    for (const k of Object.keys(patch)) {
      if ((patch[k] || "") === (o[k] || "") && typeof patch[k] !== "number") continue; // no real change (treats ""≈undefined)
      if (patch[k] !== o[k] && label[k]) changes.push(label[k](patch[k]));
    }
    Object.assign(o, patch);
    if (changes.length) this.log(byId, `updated ${o.num}: ${changes.join(", ")}`, { orderId });
    Store.save();
    return changes.length;
  },

  deleteOrder(orderId, byId) {
    const o = D.order(orderId);
    Store.state.orders = Store.state.orders.filter(x => x.id !== orderId);
    this.log(byId, `deleted order **${o.num}** (${o.product})`);
    Store.save();
  },

  /* ---------- OneDrive config ---------- */
  setOneDrive(patch, byId) {
    Store.state.oneDrive = { ...(Store.state.oneDrive || { baseUrl: "", template: "{base}/{code}" }), ...patch };
    Store.save();
  },

  /* ---------- Portfolios ---------- */
  addPortfolio(name, icon, byId, ic) {
    const p = { id: uid("p"), name, icon: icon || "📁", ic: ic || "folder" };
    Store.state.portfolios.push(p);
    this.log(byId, `created portfolio **${name}**`);
    Store.save();
    return p;
  },
  updatePortfolio(id, patch) { Object.assign(D.portfolio(id), patch); Store.save(); },
  deletePortfolio(id, byId) {
    const p = D.portfolio(id);
    Store.state.orders.forEach(o => { if (o.portfolioId === id) o.portfolioId = null; });
    Store.state.portfolios = Store.state.portfolios.filter(x => x.id !== id);
    this.log(byId, `deleted portfolio **${p.name}**`);
    Store.save();
  },

  /* ---------- Articles ---------- */
  addArticle({ sku, name, unit, lanes }, byId) {
    const a = { id: uid("a"), sku: sku || name.slice(0, 6).toUpperCase(), name, unit: unit || "pcs", lanes: lanes || [{ group: null, route: [] }] };
    Store.state.articles.push(a);
    this.log(byId, `added article **${a.name}** (${a.sku})`);
    Store.save();
    return a;
  },
  updateArticle(id, patch, byId) {
    const a = D.article(id);
    Object.assign(a, patch);
    if (byId) this.log(byId, `updated article **${a.name}**`);
    Store.save();
  },
  deleteArticle(id, byId) {
    const a = D.article(id);
    Store.state.articles = Store.state.articles.filter(x => x.id !== id);
    this.log(byId, `deleted article **${a.name}**`);
    Store.save();
  },

  /* ---------- Warehouse ---------- */
  _move(materialId, delta, note, byId, orderId) {
    Store.state.stockMoves.unshift({ id: uid("sm"), ts: Date.now(), materialId, delta, note: note || "", orderId: orderId || null, who: byId });
    if (Store.state.stockMoves.length > 1000) Store.state.stockMoves.length = 1000;
  },

  receiveStock(materialId, qty, note, byId) {
    const mat = D.material(materialId);
    mat.qty += qty;
    this._move(materialId, +qty, note || "Received", byId);
    this.log(byId, `received **${qty} ${mat.unit} ${mat.name}**${note ? ` — ${note}` : ""}`, { materialId });
    Store.save();
  },

  adjustStock(materialId, delta, note, byId) {
    const mat = D.material(materialId);
    mat.qty += delta;
    this._move(materialId, delta, note || "Adjustment", byId);
    this.log(byId, `adjusted **${mat.name}** by ${delta > 0 ? "+" : ""}${delta} ${mat.unit}${note ? ` — ${note}` : ""}`, { materialId });
    Store.save();
  },

  addMaterial({ sku, name, unit, qty, minQty, location, icon, ic }, byId) {
    const mat = { id: uid("mat"), sku, name, unit: unit || "pcs", qty: qty || 0, minQty: minQty || 0, location: location || "", icon: icon || "📦", ic: ic || "box" };
    Store.state.materials.push(mat);
    if (mat.qty) this._move(mat.id, mat.qty, "Initial stock", byId);
    this.log(byId, `added material **${mat.name}** (${mat.qty} ${mat.unit})`, { materialId: mat.id });
    Store.save();
    return mat;
  },

  updateMaterial(id, patch, byId) {
    const mat = D.material(id);
    const renamed = patch.name && patch.name !== mat.name;
    Object.assign(mat, patch);
    if (byId && renamed) this.log(byId, `updated material **${mat.name}**`, { materialId: id });
    Store.save();
  },

  deleteMaterial(id, byId) {
    if (D.materialInUse(id)) return false;
    const mat = D.material(id);
    Store.state.materials = Store.state.materials.filter(m => m.id !== id);
    Store.state.orders.forEach(o => { o.materials = (o.materials || []).filter(l => l.materialId !== id); });
    this.log(byId, `deleted material **${mat.name}**`);
    Store.save();
    return true;
  },

  /* ---------- Order ↔ materials ---------- */
  addOrderMaterial(orderId, materialId, qty, byId) {
    const o = D.order(orderId); const mat = D.material(materialId);
    o.materials = o.materials || [];
    o.materials.push({ id: uid("ln"), materialId, qty, consumed: false, consumedAt: null, consumedBy: null });
    this.log(byId, `added **${qty} ${mat.unit} ${mat.name}** to ${o.num}`, { orderId, materialId });
    Store.save();
  },

  removeOrderMaterial(orderId, lineId, byId) {
    const o = D.order(orderId);
    const line = o.materials.find(l => l.id === lineId);
    if (!line || line.consumed) return false;
    const mat = D.material(line.materialId);
    o.materials = o.materials.filter(l => l.id !== lineId);
    this.log(byId, `removed **${mat ? mat.name : "material"}** from ${o.num}`, { orderId });
    Store.save();
    return true;
  },

  consumeLine(orderId, lineId, byId) {
    const o = D.order(orderId);
    const line = o.materials.find(l => l.id === lineId);
    if (!line || line.consumed) return false;
    const mat = D.material(line.materialId);
    mat.qty -= line.qty;
    line.consumed = true; line.consumedAt = Date.now(); line.consumedBy = byId;
    this._move(mat.id, -line.qty, `Consumed for ${o.num}`, byId, orderId);
    this.log(byId, `used **${line.qty} ${mat.unit} ${mat.name}** on ${o.num}`, { orderId, materialId: mat.id });
    Store.save();
    return true;
  },

  /* ---------- Stations (shop flow customization) ---------- */
  addStation({ name, icon, ic, estMins, kind }, byId) {
    const st = { id: uid("st"), name: name || "New station", icon: icon || "🛠️", ic: ic || (kind === "eng" ? "bulb" : "toolbox"), estMins: estMins || 60, kind: kind || "prod" };
    Store.state.stations.push(st);
    this.log(byId, `added station **${st.name}**`);
    Store.save();
    return st;
  },

  updateStation(id, patch, byId) {
    const st = D.station(id);
    const renamed = patch.name && patch.name !== st.name;
    const old = st.name;
    Object.assign(st, patch);
    if (byId && renamed) this.log(byId, `renamed station **${old}** → **${st.name}**`);
    Store.save();
  },

  moveStation(id, dir) {
    const arr = Store.state.stations;
    const i = arr.findIndex(s => s.id === id);
    if (i < 0) return false;
    const kind = arr[i].kind || "prod";
    let j = i + dir; // skip over entries of the other kind
    while (j >= 0 && j < arr.length && (arr[j].kind || "prod") !== kind) j += dir;
    if (j < 0 || j >= arr.length) return false;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    Store.save();
    return true;
  },

  deleteStation(id, byId) {
    const used = Store.state.orders.some(o => o.ops.some(op => op.stationId === id))
      || Store.state.articles.some(a => a.lanes.some(l => l.route.some(r => r.stationId === id)));
    if (used) return false;
    const st = D.station(id);
    Store.state.stations = Store.state.stations.filter(s => s.id !== id);
    Store.state.members.forEach(m => { if (m.station === id) m.station = null; });
    this.log(byId, `deleted station **${st.name}**`);
    Store.save();
    return true;
  },

  /* ---------- Whiteboards ---------- */
  addBoard(name, byId) {
    const b = { id: uid("wb"), name: name || "New board", createdBy: byId,
                createdAt: Date.now(), updatedAt: Date.now(), els: [], conns: [] };
    Store.state.boards.push(b);
    this.log(byId, `created whiteboard **${b.name}**`);
    Store.save();
    return b;
  },
  renameBoard(id, name, byId) {
    const b = D.board(id);
    const old = b.name;
    b.name = name || b.name; b.updatedAt = Date.now();
    if (old !== b.name) this.log(byId, `renamed whiteboard **${old}** → **${b.name}**`);
    Store.save();
  },
  deleteBoard(id, byId) {
    const b = D.board(id);
    Store.state.boards = Store.state.boards.filter(x => x.id !== id);
    this.log(byId, `deleted whiteboard **${b.name}**`);
    Store.save();
  },
  wbAdd(boardId, el, byId) {
    const b = D.board(boardId);
    el.id = el.id || uid("we"); el.by = byId; el.ts = Date.now();
    b.els.push(el); b.updatedAt = Date.now();
    Store.save();
    return el;
  },
  wbUpdate(boardId, elId, patch) {
    const b = D.board(boardId);
    const el = b.els.find(e => e.id === elId);
    if (!el) return;
    Object.assign(el, patch); b.updatedAt = Date.now();
    Store.save();
  },
  wbDelete(boardId, elId) {
    const b = D.board(boardId);
    b.els = b.els.filter(e => e.id !== elId);
    b.conns = b.conns.filter(c => c.from !== elId && c.to !== elId);
    b.updatedAt = Date.now();
    Store.save();
  },
  wbFront(boardId, elId) {
    const b = D.board(boardId);
    const i = b.els.findIndex(e => e.id === elId);
    if (i >= 0) b.els.push(b.els.splice(i, 1)[0]);
    Store.save();
  },
  wbConnect(boardId, from, to) {
    const b = D.board(boardId);
    if (from === to) return null;
    if (b.conns.some(c => c.from === from && c.to === to)) return null;
    const c = { id: uid("wc"), from, to };
    b.conns.push(c); b.updatedAt = Date.now();
    Store.save();
    return c;
  },
  wbDisconnect(boardId, connId) {
    const b = D.board(boardId);
    b.conns = b.conns.filter(c => c.id !== connId);
    b.updatedAt = Date.now();
    Store.save();
  },
  setBoardSharing(boardId, visibility, memberIds, byId) {
    const b = D.board(boardId);
    b.visibility = visibility;
    b.memberIds = visibility === "custom" ? (memberIds || []) : [];
    const label = { team: "the whole team", private: "only themselves", custom: `${b.memberIds.length + 1} people` }[visibility];
    this.log(byId, `changed **${b.name}** sharing → ${label}`);
    Store.save();
  },

  /* ---------- Notifications ---------- */
  notify(forId, { type, orderId, gprojectId, gtaskId, text }, byId) {
    const n = { id: uid("nt"), forId, by: byId || null, ts: Date.now(), read: false,
                type: type || "info", orderId: orderId || null,
                gprojectId: gprojectId || null, gtaskId: gtaskId || null, text };
    Store.state.notifications.unshift(n);
    if (Store.state.notifications.length > 300) Store.state.notifications.length = 300;
    Store.save();
    return n;
  },
  markNotifRead(id) {
    const n = Store.state.notifications.find(x => x.id === id);
    if (n && !n.read) { n.read = true; Store.save(); }
  },
  markAllNotifsRead(memberId) {
    Store.state.notifications.forEach(n => { if (n.forId === memberId) n.read = true; });
    Store.save();
  },
  clearNotifs(memberId) {
    Store.state.notifications = Store.state.notifications.filter(n => n.forId !== memberId);
    Store.save();
  },

  /* Manager confirms the client is happy with the drawings → notify the engineer(s) */
  confirmClientApproval(orderId, byId) {
    const o = D.order(orderId);
    if (!o || o.type !== "eng" || o.clientApproved) return [];
    o.clientApproved = { at: Date.now(), by: byId };
    const engineers = D.projectEngineers(o).filter(id => id !== byId);
    const mgr = D.member(byId);
    for (const engId of engineers)
      this.notify(engId, {
        type: "client_ok", orderId: o.id,
        text: `${mgr ? mgr.name : "A manager"} confirmed the client approved the drawings for ${o.num} — you're clear to proceed`,
      }, byId);
    this.log(byId, `confirmed **client approval** of drawings on ${o.num}${engineers.length ? ` — notified ${engineers.map(id => D.member(id)?.name).filter(Boolean).join(", ")}` : ""}`, { orderId: o.id });
    Store.save();
    return engineers;
  },
  revokeClientApproval(orderId, byId) {
    const o = D.order(orderId);
    if (!o || !o.clientApproved) return;
    o.clientApproved = null;
    this.log(byId, `revoked client approval on ${o.num}`, { orderId: o.id });
    Store.save();
  },

  /* ---------- Planner: projects ---------- */
  addGProject({ name, key, color, icon }, byId) {
    const p = { id: uid("gp"), name: name || "New project", key: (key || name.slice(0, 3)).toUpperCase().slice(0, 4),
      color: color || "blue", icon: icon || "columns", desc: "",
      createdBy: byId, createdAt: Date.now(), archived: false,
      stages: defaultStages(), labels: [], tasks: [] };
    Store.state.gprojects.push(p);
    this.log(byId, `created project **${p.name}** in Planner`);
    Store.save();
    return p;
  },
  updateGProject(id, patch) { Object.assign(D.gproject(id), patch); Store.save(); },
  archiveGProject(id, byId) { const p = D.gproject(id); p.archived = true; p.archivedAt = Date.now(); this.log(byId, `archived project **${p.name}**`); Store.save(); },
  unarchiveGProject(id) { const p = D.gproject(id); p.archived = false; p.archivedAt = null; Store.save(); },
  deleteGProject(id, byId) {
    const p = D.gproject(id);
    Store.state.gprojects = Store.state.gprojects.filter(x => x.id !== id);
    this.log(byId, `deleted project **${p.name}**`);
    Store.save();
  },

  /* stages (status columns) */
  addGStage(pid, name, byId) {
    const p = D.gproject(pid);
    const st = { id: uid("gs"), name: name || "New status", color: GP_COLORS[p.stages.length % GP_COLORS.length], done: false };
    // insert before a trailing done stage if present
    const doneIdx = p.stages.findIndex(s => s.done);
    if (doneIdx >= 0) p.stages.splice(doneIdx, 0, st); else p.stages.push(st);
    Store.save();
    return st;
  },
  updateGStage(pid, sid, patch) { Object.assign(D.gstage(D.gproject(pid), sid), patch); Store.save(); },
  moveGStage(pid, sid, dir) {
    const arr = D.gproject(pid).stages;
    const i = arr.findIndex(s => s.id === sid), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return false;
    [arr[i], arr[j]] = [arr[j], arr[i]]; Store.save(); return true;
  },
  deleteGStage(pid, sid) {
    const p = D.gproject(pid);
    if (p.stages.length <= 1) return false;
    const idx = p.stages.findIndex(s => s.id === sid);
    const fallback = p.stages[idx === 0 ? 1 : idx - 1].id;
    p.tasks.forEach(t => { if (t.stageId === sid) t.stageId = fallback; });
    p.stages = p.stages.filter(s => s.id !== sid);
    Store.save(); return true;
  },

  /* tasks */
  addGTask(pid, { title, stageId, assigneeId, due, priority }, byId) {
    const p = D.gproject(pid);
    const stage = stageId || (p.stages[0] && p.stages[0].id);
    const maxOrd = Math.max(-1, ...p.tasks.filter(t => t.stageId === stage).map(t => t.ord));
    const t = { id: uid("gt"), title: title || "Untitled task", desc: "", stageId: stage,
      assigneeId: assigneeId || null, due: due || null, start: null, priority: priority || "normal",
      labelIds: [], subtasks: [], comments: [], createdBy: byId, createdAt: Date.now(), ord: maxOrd + 1 };
    p.tasks.push(t);
    if (t.assigneeId && t.assigneeId !== byId) this.notify(t.assigneeId, { type: "task", text: `${D.member(byId)?.name || "Someone"} assigned you “${t.title}” in ${p.name}`, gprojectId: p.id, gtaskId: t.id }, byId);
    Store.save();
    return t;
  },
  updateGTask(pid, taskId, patch, byId) {
    const p = D.gproject(pid); const t = D.gtask(p, taskId);
    const reassigned = "assigneeId" in patch && patch.assigneeId !== t.assigneeId ? patch.assigneeId : null;
    Object.assign(t, patch);
    if (reassigned && reassigned !== byId) this.notify(reassigned, { type: "task", text: `${D.member(byId)?.name || "Someone"} assigned you “${t.title}” in ${p.name}`, gprojectId: p.id, gtaskId: t.id }, byId);
    Store.save();
  },
  moveGTask(pid, taskId, stageId, ord) {
    const p = D.gproject(pid); const t = D.gtask(p, taskId);
    t.stageId = stageId;
    if (ord != null) t.ord = ord;
    Store.save();
  },
  /* place a task into a stage before beforeId (or at end), renumbering that stage */
  placeGTask(pid, taskId, stageId, beforeId, byId) {
    const p = D.gproject(pid); const t = D.gtask(p, taskId);
    const wasDone = D.gTaskDone(p, t);
    t.stageId = stageId;
    const inStage = p.tasks.filter(x => x.stageId === stageId && x.id !== taskId).sort((a, b) => a.ord - b.ord);
    let idx = beforeId ? inStage.findIndex(x => x.id === beforeId) : inStage.length;
    if (idx < 0) idx = inStage.length;
    inStage.splice(idx, 0, t);
    inStage.forEach((x, i) => x.ord = i);
    const nowDone = D.gTaskDone(p, t);
    if (byId && nowDone && !wasDone) this.log(byId, `completed task **${t.title}** in ${p.name}`, {});
    Store.save();
  },
  deleteGTask(pid, taskId) {
    const p = D.gproject(pid);
    p.tasks = p.tasks.filter(t => t.id !== taskId);
    Store.save();
  },
  addSubtask(pid, taskId, title) {
    const t = D.gtask(D.gproject(pid), taskId);
    t.subtasks.push({ id: uid("gk"), title, done: false }); Store.save();
  },
  toggleSubtask(pid, taskId, subId) {
    const t = D.gtask(D.gproject(pid), taskId);
    const s = t.subtasks.find(x => x.id === subId); if (s) s.done = !s.done; Store.save();
  },
  deleteSubtask(pid, taskId, subId) {
    const t = D.gtask(D.gproject(pid), taskId);
    t.subtasks = t.subtasks.filter(x => x.id !== subId); Store.save();
  },
  addGComment(pid, taskId, text, byId) {
    const p = D.gproject(pid); const t = D.gtask(p, taskId);
    t.comments.push({ id: uid("gc"), by: byId, ts: Date.now(), text });
    if (t.assigneeId && t.assigneeId !== byId)
      this.notify(t.assigneeId, { type: "task", text: `${D.member(byId)?.name || "Someone"} commented on “${t.title}”`, gprojectId: p.id, gtaskId: t.id }, byId);
    Store.save();
  },

  /* ---------- To-dos ---------- */
  addTodo({ text, forId, due }, byId) {
    const t = { id: uid("td"), text, forId: forId || byId, by: byId, ts: Date.now(), done: false, doneAt: null, due: due || null };
    Store.state.todos.push(t);
    if (t.forId !== byId) this.log(byId, `added a to-do for **${D.member(t.forId)?.name || "?"}**: ${text}`);
    Store.save();
    return t;
  },
  toggleTodo(id, byId) {
    const t = Store.state.todos.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    if (t.done && t.by !== t.forId) this.log(byId, `completed the to-do: ${t.text}`);
    Store.save();
  },
  updateTodo(id, patch) {
    const t = Store.state.todos.find(x => x.id === id);
    if (t) Object.assign(t, patch);
    Store.save();
  },
  deleteTodo(id) {
    Store.state.todos = Store.state.todos.filter(x => x.id !== id);
    Store.save();
  },

  /* ---------- View prefs ---------- */
  setPref(memberId, key, value) {
    const p = Store.state.prefs;
    (p[memberId] = p[memberId] || {})[key] = value;
    Store.save();
  },

  addMember({ name, trade, role, pin, station }, byId) {
    const m = {
      id: uid("m"),
      name, trade, role, station: station || null,
      pinHash: pin ? hashPin(pin, Store.state.pinSalt) : "",
      color: Store.state.members.length % AV_COLORS.length,
    };
    Store.state.members.push(m);
    this.log(byId, `added **${name}** to the team`);
    Store.save();
    return m;
  },

  updateMember(id, patch) {
    const m = D.member(id);
    if (patch.pin) { m.pinHash = hashPin(patch.pin, Store.state.pinSalt); } // never store plaintext
    delete patch.pin;
    Object.assign(m, patch);
    Store.save();
  },

  /* set / reset a member's PIN (managers only, via the member modal) */
  setPin(id, pin, byId) {
    const m = D.member(id);
    m.pinHash = hashPin(pin, Store.state.pinSalt);
    delete m.pin;
    if (byId) this.log(byId, `reset PIN for **${m.name}**`);
    Store.save();
  },
  verifyPin(id, pin) {
    const m = D.member(id);
    if (!m) return false;
    if (m.pinHash) return m.pinHash === hashPin(pin, Store.state.pinSalt);
    if (m.pin != null) { // legacy plaintext → verify then upgrade
      const ok = String(m.pin) === String(pin);
      if (ok) { m.pinHash = hashPin(pin, Store.state.pinSalt); delete m.pin; Store.save(); }
      return ok;
    }
    return false;
  },

  removeMember(id, byId) {
    const m = D.member(id);
    for (const o of Store.state.orders)
      for (const op of o.ops) if (op.assigneeId === id) op.assigneeId = null;
    Store.state.members = Store.state.members.filter(x => x.id !== id);
    this.log(byId, `removed **${m.name}** from the team`);
    Store.save();
  },
};
