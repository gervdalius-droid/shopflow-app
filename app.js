/* ============================================================
   ShopFlow — App core
   Session, PIN login, shell, router, toasts, modals, palette.
   ============================================================ */
"use strict";

/* ---------- Tiny DOM + format utils ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function isLT() { return typeof I18N !== "undefined" && I18N.lang === "lt"; }
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(isLT() ? "lt-LT" : "en-US", { month: "short", day: "numeric" });
}
function fmtDue(ts) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / DAY);
  const lt = isLT();
  if (diff < -1) return { cls: "overdue", label: lt ? `Vėluoja ${-diff} d.` : `${-diff}d overdue` };
  if (diff === -1) return { cls: "overdue", label: lt ? "Vėluoja 1 d." : "1d overdue" };
  if (diff === 0) return { cls: "today", label: lt ? "Šiandien" : "Due today" };
  if (diff === 1) return { cls: "soon", label: lt ? "Rytoj" : "Due tomorrow" };
  if (diff <= 4) return { cls: "soon", label: lt ? `Po ${diff} d.` : `Due in ${diff}d` };
  return { cls: "", label: (lt ? "Iki " : "Due ") + fmtDate(ts) };
}
function fmtDur(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? hh + ":" : "") + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}
function fmtAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  const lt = isLT();
  if (s < 60) return lt ? "ką tik" : "just now";
  if (s < 3600) return lt ? `prieš ${Math.floor(s / 60)} min.` : Math.floor(s / 60) + "m ago";
  if (s < 86400) return lt ? `prieš ${Math.floor(s / 3600)} val.` : Math.floor(s / 3600) + "h ago";
  return lt ? `prieš ${Math.floor(s / 86400)} d.` : Math.floor(s / 86400) + "d ago";
}
function initials(name) {
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
}
function avatarHtml(member, size = "md") {
  if (!member) return `<span class="avatar ${size}" style="--av-c1:#aeaeb2;--av-c2:#8e8e93">?</span>`;
  const [c1, c2] = AV_COLORS[member.color % AV_COLORS.length];
  return `<span class="avatar ${size}" style="--av-c1:${c1};--av-c2:${c2}" title="${esc(member.name)}">${esc(initials(member.name))}</span>`;
}
function pillHtml(status, label) {
  return `<span class="pill ${status}"><span class="dot"></span>${esc(label || D.statusLabel[status] || status)}</span>`;
}
function prioHtml(p) {
  const labels = { rush: "Rush", high: "High", normal: "Normal", low: "Low" };
  if (p === "normal") return "";
  return `<span class="prio ${p}">${prioIcon(p)} ${labels[p]}</span>`;
}
function stepsMini(order) {
  const shown = order.ops.slice(0, 14);
  return `<span class="steps-mini">${shown.map(op =>
    `<i class="${op.status}" title="${esc(D.station(op.stationId)?.name || "")}"></i>`).join("")}${order.ops.length > 14 ? `<span class="t-caption" style="font-size:10px">+${order.ops.length - 14}</span>` : ""}</span>`;
}
function activityHtml(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

/* ============================================================
   App
   ============================================================ */
const App = {
  me: null,          // logged-in member
  view: "dashboard", // current manager view
  viewParams: {},
  workerTab: "my",   // worker mode tab
  _tick: null,

  /* role helpers — managers + engineers use the cockpit; only they see engineering */
  isManager() { return this.me && this.me.role === "manager"; },
  isEngineer() { return this.me && this.me.role === "engineer"; },
  seesEng() { return this.me && (this.me.role === "manager" || this.me.role === "engineer"); },
  usesCockpit() { return this.me && (this.me.role === "manager" || this.me.role === "engineer"); },

  boot() {
    if (typeof I18N !== "undefined") I18N.boot();   // localization: watch renders, translate UI chrome
    Store.load();
    // theme
    const savedTheme = localStorage.getItem("shopflow.theme") || "auto";
    this.applyTheme(savedTheme);

    // Auto-login (dev/demo only): ?as=… bypasses the PIN, so honour it only on
    // localhost / file:// — never when the app is actually hosted for the shop.
    const p = new URLSearchParams(location.search);
    if (p.get("theme")) this.applyTheme(p.get("theme"));
    const devHost = ["localhost", "127.0.0.1", "", "[::1]"].includes(location.hostname) || location.protocol === "file:";
    const as = devHost ? p.get("as") : null;
    if (as) {
      this._localOnly = true;                 // local dev (?as= on localhost): run fully offline, never touch the shop's cloud
      const m = Store.state.members.find(x =>
        x.name.toLowerCase() === as.toLowerCase() ||
        (as === "manager" && x.role === "manager") ||
        (as === "engineer" && x.role === "engineer") ||
        (as === "worker" && x.role === "worker"));
      if (m) this.me = m;
      if (p.get("view")) this.view = p.get("view");
      if (p.get("tab")) { this.workerTab = p.get("tab"); this.viewParams.tab = p.get("tab"); }
      if (p.get("scope")) this.viewParams.scope = p.get("scope");
    } else {
      const sid = sessionStorage.getItem("shopflow.session");
      if (sid) this.me = D.member(sid);
    }
    // Scan-station kiosk deep link: ?scan=<stationId> (works for any signed-in user)
    if (this.me && p.get("scan") && typeof ScanStation !== "undefined") {
      this.view = "scan";
      const stn = D.station(p.get("scan"));
      ScanStation.stationId = stn ? stn.id : null;
    }

    this._notifSeenTs = Date.now(); // baseline: existing notifications show as badge, not toast
    // if cloud sync is configured, show the connecting gate immediately (no PIN-picker flash)
    if (typeof Sync !== "undefined" && Sync.configured() && !this._localOnly) Sync.checking = true;
    this.render();
    if (this.me && p.get("order")) {
      const o = Store.state.orders.find(x => x.id === p.get("order") || x.num === p.get("order"));
      if (o) Drawer.open(o.id);
    }
    this._tick = setInterval(() => this.tickTimers(), 1000);

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); this.me && Palette.toggle(); }
      if (e.key === "Escape") { Palette.close(); Modal.close(); Drawer.close(); Popover.close(); }
    });

    // Live sync between open tabs/windows: another tab saved → adopt its state
    window.addEventListener("storage", (ev) => {
      if (ev.key !== DB_KEY || !ev.newValue) return;
      const typing = (typeof WB !== "undefined" && WB.editingId) ||
        document.activeElement?.isContentEditable ||
        /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
      try { Store.state = JSON.parse(ev.newValue); } catch (_) { return; }
      if (typeof Notif !== "undefined") Notif.flushLive(); // toast/desktop-alert new arrivals
      if (!typing) this.render();
    });

    // Cloud sync — no-op unless sync-config.js provides SYNC_CONFIG
    if (typeof Sync !== "undefined" && !this._localOnly) Sync.init();
  },

  applyTheme(mode) {
    localStorage.setItem("shopflow.theme", mode);
    const dark = mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  },

  login(member) {
    this.me = member;
    this._notifSeenTs = Date.now(); // only genuinely new notifications toast; existing show as a badge
    sessionStorage.setItem("shopflow.session", member.id);
    this.view = (member.role === "manager" || member.role === "engineer") ? "dashboard" : "my";
    // shared-tablet hygiene: don't inherit the previous worker's tab/station
    this.workerTab = "my";
    if (typeof Wkr !== "undefined") Wkr.station = null;
    this.render();
  },

  logout() {
    this.me = null;
    sessionStorage.removeItem("shopflow.session");
    Drawer.close(true); Modal.close(true); Palette.close();
    this.render();
  },

  navigate(view, params = {}) {
    this.view = view; this.viewParams = params;
    this.render();
  },

  /* Re-render everything (state changed) */
  render() {
    const root = $("#app");
    // cloud shop-login gate: when sync is on but this device isn't signed in yet
    if (typeof Sync !== "undefined" && !App._localOnly && Sync.needsGate()) { root.innerHTML = Sync.gateHtml(); Sync.bindGate(root); return; }
    if (!this.me) { root.innerHTML = Login.html(); Login.bind(root); return; }
    if (this.usesCockpit()) { root.innerHTML = Mgr.shell(); Mgr.bind(root); }
    else { root.innerHTML = Wkr.shell(); Wkr.bind(root); }
    if (typeof GPM !== "undefined" && this.view !== "planner" && GPM.taskId) GPM.closeTask();
    Drawer.refresh();
  },

  /* Light-touch: update visible timers without re-rendering */
  tickTimers() {
    // refresh the login lock countdown (and re-enable the pad when it expires)
    if (!this.me && Login.selected && (Login.lockUntil[Login.selected.id] || 0) > Date.now() - 1500) {
      if ($(".pin-stage")) { this.render(); return; }
    }
    $$("[data-timer]").forEach(el => {
      const [orderId, opId] = el.dataset.timer.split("/");
      const o = D.order(orderId); if (!o) return;
      const op = o.ops.find(x => x.id === opId); if (!op) return;
      const style = el.dataset.timerStyle || "clock";
      el.textContent = style === "clock" ? fmtClock(D.opElapsed(op)) : fmtDur(D.opElapsed(op));
    });
  },
};

/* ============================================================
   Login (profile grid → PIN pad)
   ============================================================ */
const Login = {
  selected: null, entered: "",

  html() {
    const s = Store.state;
    if (!this.selected) {
      return `<div class="login-screen">
        <div class="login-logo">
          <div class="mark" style="color:var(--accent)">${icon("logo", 52, "", 1.6)}</div>
          <h1>${esc(s.shopName)}</h1>
          <p>Who's working?</p>
        </div>
        <div class="profiles">
          ${s.members.map(m => `
            <button class="profile" data-id="${m.id}">
              ${avatarHtml(m, "xl")}
              <span class="name">${esc(m.name)}</span>
              <span class="role">${esc(m.trade)}</span>
            </button>`).join("")}
        </div>
        <div class="login-foot">ShopFlow · ${esc(s.shopName)}</div>
      </div>`;
    }
    const m = this.selected;
    const locked = this.isLocked(m.id);
    const secs = locked ? Math.ceil((this.lockUntil[m.id] - Date.now()) / 1000) : 0;
    const triesLeft = this.MAX_FAILS - (this.fails[m.id] || 0);
    return `<div class="login-screen">
      <div class="pin-stage">
        <div class="pin-user">
          ${avatarHtml(m, "xl")}
          <div class="name">${esc(m.name)}</div>
          <div class="hint">${locked ? `Too many attempts — try again in ${secs}s`
            : (this.fails[m.id] ? `Wrong PIN · ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left` : "Enter your PIN")}</div>
        </div>
        <div class="pin-dots ${locked ? "error" : ""}" id="pin-dots">${[0,1,2,3].map(i => `<i class="${i < this.entered.length ? "filled" : ""}"></i>`).join("")}</div>
        <div class="pin-pad ${locked ? "locked" : ""}">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-key" data-k="${n}" ${locked ? "disabled" : ""}>${n}</button>`).join("")}
          <button class="pin-key soft" data-k="back">Back</button>
          <button class="pin-key" data-k="0" ${locked ? "disabled" : ""}>0</button>
          <button class="pin-key soft" data-k="del" ${locked ? "disabled" : ""}>⌫</button>
        </div>
      </div>
    </div>`;
  },

  fails: {},        // per-member wrong-attempt count
  lockUntil: {},    // per-member lock expiry (ms)
  MAX_FAILS: 5, LOCK_MS: 30000,

  bind(root) {
    $$(".profile", root).forEach(b => b.onclick = () => {
      this.selected = D.member(b.dataset.id); this.entered = "";
      App.render();
    });
    $$(".pin-key", root).forEach(b => b.onclick = () => this.key(b.dataset.k));
    if (this.selected) {
      this._kb = (e) => {
        if (/^[0-9]$/.test(e.key)) this.key(e.key);
        if (e.key === "Backspace") this.key("del");
        if (e.key === "Escape") this.key("back");
      };
      document.addEventListener("keydown", this._kb, { once: false });
    }
  },

  isLocked(id) { return (this.lockUntil[id] || 0) > Date.now(); },

  key(k) {
    if (k === "back") { this.selected = null; this.entered = ""; this._unbindKb(); App.render(); return; }
    if (this.selected && this.isLocked(this.selected.id)) return; // locked out
    if (k === "del") { this.entered = this.entered.slice(0, -1); this._paint(); return; }
    if (this.entered.length >= 4) return;
    this.entered += k;
    this._paint();
    if (this.entered.length === 4) {
      const m = this.selected;
      if (M.verifyPin(m.id, this.entered)) {
        this.fails[m.id] = 0;
        this.selected = null; this.entered = ""; this._unbindKb();
        App.login(m);
      } else {
        this.fails[m.id] = (this.fails[m.id] || 0) + 1;
        const dots = $("#pin-dots");
        if (dots) dots.classList.add("error");
        if (this.fails[m.id] >= this.MAX_FAILS) {
          this.lockUntil[m.id] = Date.now() + this.LOCK_MS;
          setTimeout(() => { this.entered = ""; App.render(); }, 600);
        } else {
          setTimeout(() => { this.entered = ""; if (dots) dots.classList.remove("error"); this._paint(); }, 600);
        }
      }
    }
  },
  _paint() {
    const dots = $("#pin-dots"); if (!dots) return;
    $$("i", dots).forEach((el, i) => el.classList.toggle("filled", i < this.entered.length));
  },
  _unbindKb() { if (this._kb) { document.removeEventListener("keydown", this._kb); this._kb = null; } },
};

/* ============================================================
   Toasts
   ============================================================ */
const Toast = {
  /* legacy emoji → icon so every toast matches the vector icon system */
  ICON_MAP: {
    "✓": "check", "✅": "check-circle", "🎉": "check-circle", "•": "info", "🔢": "info",
    "⚠️": "alert", "🚫": "ban", "🤔": "info", "⏳": "clock", "📉": "trend-down",
    "🚚": "truck", "📦": "box", "🏬": "warehouse", "📤": "arrow-up", "🗑": "trash",
    "📅": "calendar", "🗓": "calendar", "✦": "sparkles", "👋": "users", "🧠": "brain",
    "▶️": "play", "⏸": "pause", "💪": "check", "🗄": "archive", "😴": "zzz",
  },
  show(msg, { emoji = "", undo = null, ms = 3200 } = {}) {
    const root = $("#toast-root");
    const el = document.createElement("div");
    el.className = "toast";
    const ic = this.ICON_MAP[emoji] || (/^[a-z-]+$/.test(emoji) ? emoji : null);
    const lead = ic ? `<span class="emoji">${icon(ic, 15)}</span>` : (emoji ? `<span class="emoji">${emoji}</span>` : "");
    el.innerHTML = `${lead}<span>${esc(msg)}</span>${undo ? `<button>Undo</button>` : ""}`;
    if (undo) $("button", el).onclick = () => { undo(); this._dismiss(el); };
    root.appendChild(el);
    setTimeout(() => this._dismiss(el), ms);
  },
  _dismiss(el) {
    if (!el.isConnected) return;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 300);
  },
};

/* ============================================================
   Modal
   ============================================================ */
const Modal = {
  open(html, bindFn) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal-scrim"><div class="modal">${html}</div></div>`;
    const scrim = $(".modal-scrim", root);
    scrim.onclick = (e) => { if (e.target === scrim) this.close(); };
    if (bindFn) bindFn($(".modal", root));
    const firstInput = $(".modal input, .modal select", root);
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
  },
  close(instant) {
    const root = $("#modal-root");
    const scrim = $(".modal-scrim", root);
    if (!scrim) return;
    if (instant) { root.innerHTML = ""; return; }
    scrim.classList.add("closing");
    setTimeout(() => { root.innerHTML = ""; }, 200);
  },
};

/* ============================================================
   Drawer (order detail) — content defined in manager.js/worker.js
   ============================================================ */
const Drawer = {
  orderId: null,
  open(orderId) {
    this.orderId = orderId;
    if (typeof GPM !== "undefined") GPM.taskId = null; // don't fight the Planner task drawer
    if (typeof OrderDetail !== "undefined") OrderDetail.showAllHist = false;
    this.refresh(true);
  },
  refresh(fresh) {
    if (!this.orderId) return;
    const o = D.order(this.orderId);
    if (!o) { this.close(true); return; }
    const root = $("#drawer-root");
    const html = `<div class="drawer-scrim"></div><div class="drawer">${OrderDetail.html(o)}</div>`;
    if (fresh || !$(".drawer", root)) root.innerHTML = html;
    else $(".drawer", root).innerHTML = OrderDetail.html(o);
    $(".drawer-scrim", root).onclick = () => this.close();
    OrderDetail.bind($(".drawer", root), o);
  },
  close(instant) {
    const root = $("#drawer-root");
    this.orderId = null;
    const d = $(".drawer", root), s = $(".drawer-scrim", root);
    if (!d) return;
    if (instant) { root.innerHTML = ""; return; }
    d.classList.add("closing"); s.classList.add("closing");
    setTimeout(() => { root.innerHTML = ""; }, 240);
  },
};

/* ============================================================
   Popover (anchored menu — Apple style)
   ============================================================ */
const Popover = {
  open(anchor, html, bind) {
    this.close();
    const root = document.createElement("div");
    root.id = "pop-root";
    root.innerHTML = `<div class="pop-scrim"></div><div class="popover">${html}</div>`;
    document.body.appendChild(root);
    const pop = $(".popover", root);
    const r = anchor.getBoundingClientRect();
    pop.style.top = Math.min(r.bottom + 8, innerHeight - pop.offsetHeight - 12) + "px";
    pop.style.left = Math.max(12, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 12)) + "px";
    $(".pop-scrim", root).onclick = () => this.close();
    if (bind) bind(pop);
  },
  close() { const r = $("#pop-root"); if (r) r.remove(); },
};

/* Apple-style toggle switch */
function switchHtml(id, on) {
  return `<button class="switch ${on ? "on" : ""}" data-switch="${id}" role="switch" aria-checked="${on}"><i></i></button>`;
}

/* ============================================================
   Command palette (⌘K)
   ============================================================ */
const Palette = {
  isOpen: false,
  toggle() { this.isOpen ? this.close() : this.open(); },
  open() {
    this.isOpen = true;
    const root = $("#palette-root");
    root.innerHTML = `<div class="palette-scrim"></div>
      <div class="palette">
        <input placeholder="Search orders, clients, people…" id="pal-q">
        <div class="palette-list" id="pal-list"></div>
      </div>`;
    $(".palette-scrim", root).onclick = () => this.close();
    const q = $("#pal-q", root);
    q.oninput = () => this.renderList(q.value);
    q.onkeydown = (e) => {
      if (e.key === "Enter") { const first = $(".palette-item", root); if (first) first.click(); }
    };
    this.renderList("");
    setTimeout(() => q.focus(), 40);
  },
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    $("#palette-root").innerHTML = "";
  },
  renderList(query) {
    const list = $("#pal-list"); if (!list) return;
    const ql = query.trim().toLowerCase();
    const orders = Store.state.orders.filter(o =>
      !ql || o.num.toLowerCase().includes(ql) || o.product.toLowerCase().includes(ql) || o.client.toLowerCase().includes(ql)
    ).slice(0, 6);
    const members = ql ? Store.state.members.filter(m => m.name.toLowerCase().includes(ql)).slice(0, 3) : [];
    const mats = (ql && App.usesCockpit())
      ? Store.state.materials.filter(m => m.name.toLowerCase().includes(ql) || m.sku.toLowerCase().includes(ql)).slice(0, 4) : [];
    const boards = ql ? D.boardsFor(App.me.id).filter(b => b.name.toLowerCase().includes(ql)).slice(0, 3) : [];
    let html = "";
    for (const o of orders) {
      const st = D.orderStatus(o);
      const cur = D.currentOp(o);
      html += `<button class="palette-item" data-order="${o.id}">
        <span class="ico">${cur ? stIcon(D.station(cur.stationId), 17) : icon(o.shipped ? "truck" : "check-circle", 17)}</span>
        <span class="grow"><b>${o.num !== o.product ? esc(o.num) + " · " : ""}${esc(o.product)}</b><span>${o.client && o.client !== o.product ? esc(o.client) + " — " : ""}${D.statusLabelFor(o, st)}</span></span>
        ${pillHtml(st, D.statusLabelFor(o, st))}
      </button>`;
    }
    for (const m of members) {
      html += `<button class="palette-item" data-member="${m.id}">
        ${avatarHtml(m, "sm")}
        <span class="grow"><b>${esc(m.name)}</b><span>${esc(m.trade)}</span></span>
      </button>`;
    }
    for (const m of mats) {
      const low = m.qty <= m.minQty;
      html += `<button class="palette-item" data-material="${m.id}">
        <span class="ico">${matIcon(m, 17)}</span>
        <span class="grow"><b>${esc(m.name)}</b><span>${esc(m.sku)} · ${m.qty} ${esc(m.unit)} in stock</span></span>
        ${low ? `<span class="pill blocked"><span class="dot"></span>Low</span>` : ""}
      </button>`;
    }
    for (const b of boards) {
      html += `<button class="palette-item" data-board="${b.id}">
        <span class="ico">${icon("brain", 17)}</span>
        <span class="grow"><b>${esc(b.name)}</b><span>Whiteboard · ${b.els.length} items</span></span>
      </button>`;
    }
    list.innerHTML = html || `<div class="palette-empty">No matches for “${esc(query)}”</div>`;
    $$(".palette-item", list).forEach(b => b.onclick = () => {
      this.close();
      if (b.dataset.order) Drawer.open(b.dataset.order);
      if (b.dataset.member && App.isManager()) App.navigate("team");
      if (b.dataset.material) { App.navigate("warehouse"); Warehouse.materialModal(b.dataset.material); }
      if (b.dataset.board) {
        WB.openId = b.dataset.board; WB.fit(true);
        if (App.usesCockpit()) App.navigate("whiteboard");
        else { App.workerTab = "board"; App.render(); }
      }
    });
  },
};
