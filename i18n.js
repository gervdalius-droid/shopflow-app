/* ============================================================
   ShopFlow — Lithuanian localization (i18n)
   A translation layer applied at render time via a MutationObserver,
   so none of the render code has to change. Translations are keyed by
   the EXACT English UI string. Language is per-device (localStorage),
   like the theme. Dynamic data (orders, people, stations) is already
   Lithuanian and is never touched — only known static UI phrases are.
   ============================================================ */
"use strict";

const I18N = {
  lang: "en",
  _obs: null,

  boot() {
    const forced = new URLSearchParams(location.search).get("lang");   // ?lang=lt to force (e.g. a kiosk)
    if (forced) localStorage.setItem("shopflow.lang", forced);
    this.lang = forced || localStorage.getItem("shopflow.lang") || "en";
    document.documentElement.setAttribute("lang", this.lang);
    if (this.lang === "lt") this._start();
  },

  /* switch language — reload is the simplest correct way to (un)apply everywhere */
  set(lang) {
    if (lang === this.lang) return;
    localStorage.setItem("shopflow.lang", lang);
    location.reload();
  },

  /* explicit lookup, for any code that wants it: I18N.t("Save") */
  t(s) { return (this.lang === "lt" && LT[s]) || s; },

  _start() {
    this.translate(document.body);                       // whatever is already on screen
    this._obs = new MutationObserver((muts) => {          // …and everything inserted later
      for (const m of muts) for (const n of m.addedNodes) this.translate(n);
    });
    this._obs.observe(document.body, { childList: true, subtree: true });
  },

  translate(node) {
    if (this.lang !== "lt" || !node) return;
    if (node.nodeType === 3) return this._text(node);     // text node
    if (node.nodeType !== 1) return;                      // only elements past here
    const tag = node.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") return;
    this._attrs(node);
    if (tag === "INPUT" || tag === "TEXTAREA") return;    // never touch field values
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => {
        const p = t.parentNode;
        if (!p || !p.tagName) return NodeFilter.FILTER_REJECT;
        const pt = p.tagName;
        if (pt === "SCRIPT" || pt === "STYLE" || pt === "TEXTAREA") return NodeFilter.FILTER_REJECT;
        if (p.isContentEditable) return NodeFilter.FILTER_REJECT;   // whiteboard / inline edits = user data
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const texts = [];
    let t;
    while ((t = walker.nextNode())) texts.push(t);
    texts.forEach((n) => this._text(n));
    if (node.querySelectorAll) node.querySelectorAll("[placeholder],[title]").forEach((el) => this._attrs(el));
  },

  _text(t) {
    const raw = t.nodeValue;
    if (!raw) return;
    const key = raw.trim();
    if (key.length < 2) return;
    const lt = LT[key];
    if (lt && lt !== key) t.nodeValue = raw.replace(key, lt);   // keep surrounding whitespace
  },

  _attrs(el) {
    if (!el.getAttribute) return;
    for (const a of ["placeholder", "title"]) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const lt = LT[v.trim()];
      if (lt && lt !== v.trim()) el.setAttribute(a, lt);
    }
  },
};

/* English → Lithuanian. Key = the exact English UI string as rendered.
   Only static UI chrome — dynamic data (orders, names, stations) stays as entered.
   Short mid-sentence connector fragments are intentionally omitted (they'd read
   as broken grammar out of context). */
const LT = {
  // ---- Navigation / shell ----
  "Dashboard": "Apžvalga",
  "Production Board": "Gamybos lenta",
  "Projects": "Projektai",
  "Warehouse": "Sandėlis",
  "To-Do": "Užduotys",
  "Planner": "Planuoklė",
  "Scan Station": "Skenavimo stotis",
  "Team": "Komanda",
  "Whiteboard": "Baltoji lenta",
  "Activity": "Veikla",
  "Settings": "Nustatymai",
  "Needs attention": "Reikia dėmesio",
  "Search": "Ieškoti",
  "New Order": "Naujas užsakymas",
  "New Project": "Naujas projektas",
  "Sign out": "Atsijungti",
  "Engineering": "Projektavimas",

  // ---- Login / PIN gate ----
  "Sign in to your workspace": "Prisijunkite prie darbo srities",
  "Shop password": "Įmonės slaptažodis",
  "Sign in": "Prisijungti",
  "Connecting…": "Jungiamasi…",
  "Wrong password — try again": "Neteisingas slaptažodis — bandykite dar kartą",
  "Who's working?": "Kas dirba?",
  "Enter your PIN": "Įveskite PIN kodą",
  "Back": "Atgal",
  "Wrong PIN": "Neteisingas PIN",

  // ---- Dashboard ----
  "Open orders": "Atviri užsakymai",
  "Due this week": "Šią savaitę",
  "Overdue": "Vėluoja",
  "Low stock": "Mažos atsargos",
  "Ready to ship": "Paruošta siųsti",
  "needs action": "reikia veiksmų",
  "reorder soon": "greitai užsakyti",
  "good to go": "viskas paruošta",
  "Production flow — every task, right now": "Gamybos eiga — visos užduotys dabar",
  "Ready": "Paruošta",
  "View all": "Rodyti visus",
  "All clear — nothing blocked, overdue or low": "Viskas tvarkoje — niekas neužblokuota, nevėluoja ir netrūksta",
  "On the floor right now": "Šiuo metu ceche",
  "Nobody has a job running": "Niekas nevykdo darbo",
  "Recent activity": "Naujausia veikla",
  "Active projects": "Aktyvūs projektai",
  "Assigned to me": "Priskirta man",
  "Ready to hand off": "Paruošta perduoti",
  "Design flow — projects at each stage": "Projektavimo eiga — projektai kiekviename etape",
  "Hand off": "Perduoti",
  "My design projects": "Mano projektavimo darbai",
  "No design projects yet": "Kol kas nėra projektavimo darbų",
  "needs an engineer": "reikia inžinieriaus",
  "Unassigned projects": "Nepriskirti projektai",

  // ---- Board / orders ----
  "List": "Sąrašas",
  "Board": "Lenta",
  "Timeline": "Laiko juosta",
  "Calendar": "Kalendorius",
  "Workload": "Apkrova",
  "Portfolios": "Portfeliai",
  "Production": "Gamyba",
  "Order": "Užsakymas",
  "In production": "Gamyboje",
  "Paused": "Pristabdyta",
  "Blocked": "Užblokuota",
  "Not started": "Nepradėta",
  "Today": "Šiandien",
  "Mon": "Pr", "Tue": "An", "Wed": "Tr", "Thu": "Kt", "Fri": "Pn", "Sat": "Št", "Sun": "Sk",
  "Everyone": "Visi",
  "All priorities": "Visi prioritetai",
  "🔥 Rush": "🔥 Skubu",
  "Comfortable": "Patogus",
  "Compact": "Kompaktiškas",
  "Hide empty": "Slėpti tuščius",
  "No tasks here": "Čia užduočių nėra",
  "Complete": "Užbaigti",
  "Material shortage": "Trūksta medžiagų",
  "Open project files in OneDrive": "Atverti projekto failus OneDrive",
  "Running": "Vykdoma",
  "All": "Visi",
  "Active": "Aktyvūs",
  "Archive": "Archyvas",
  "Search orders…": "Ieškoti užsakymų…",
  "View": "Rodinys",
  "No orders match": "Nėra atitinkančių užsakymų",
  "Try a different filter or search.": "Pabandykite kitą filtrą ar paiešką.",
  "Due": "Terminas",
  "Delivered": "Pristatyta",
  "Archived": "Archyvuota",
  "No portfolio": "Be portfelio",
  "Rush": "Skubu",
  "High": "Aukštas",
  "Normal": "Normalus",
  "Low": "Žemas",
  "New portfolio": "Naujas portfelis",
  "Edit portfolio": "Redaguoti portfelį",
  "Delete portfolio": "Ištrinti portfelį",
  "Clear portfolio filter": "Išvalyti portfelio filtrą",

  // ---- Group-by / columns menu ----
  "Group by": "Grupuoti pagal",
  "Columns": "Stulpeliai",
  "None": "Nėra",
  "Status": "Būsena",
  "Station": "Stotis",
  "Priority": "Prioritetas",
  "Client": "Klientas",
  "Portfolio": "Portfelis",
  "Progress": "Eiga",
  "Assignee": "Atsakingas",
  "Due date": "Terminas",

  // ---- Settings ----
  "Workshop name": "Dirbtuvės pavadinimas",
  "Shown on the sign-in screen": "Rodomas prisijungimo ekrane",
  "Appearance": "Išvaizda",
  "Follows your system by default": "Pagal numatymą seka sistemą",
  "Light": "Šviesi",
  "Dark": "Tamsi",
  "Language": "Kalba",
  "Interface language for this device": "Sąsajos kalba šiame įrenginyje",
  "Workflow stations": "Darbo stotys",
  "The production steps every order can flow through — rename, reorder, add your own": "Gamybos etapai, per kuriuos eina kiekvienas užsakymas — pervadinkite, keiskite tvarką, pridėkite savo",
  "＋ Add station": "＋ Pridėti stotį",
  "Engineering stages": "Projektavimo etapai",
  "The stages engineering projects go through — brief, design, approval…": "Etapai, per kuriuos eina projektavimo darbai — užduotis, projektas, patvirtinimas…",
  "＋ Add stage": "＋ Pridėti etapą",
  "Project files (OneDrive)": "Projekto failai (OneDrive)",
  "Base folder where each project has a subfolder named by its code — projects then auto-open with one click. Leave blank to link each project by hand.": "Pagrindinis aplankas, kuriame kiekvienas projektas turi jo kodu pavadintą poaplankį — projektai atsidaro vienu paspaudimu. Palikite tuščią, kad kiekvieną projektą susietumėte rankiniu būdu.",
  "No base folder — projects are linked individually.": "Nėra pagrindinio aplanko — projektai susiejami po vieną.",
  "Scan stations (QR / barcode)": "Skenavimo stotys (QR / brūkšninis kodas)",
  "prefix": "priešdėlis",
  "Kiosk": "Kioskas",
  "Cloud sync": "Debesų sinchronizavimas",
  "Connected to Supabase.": "Prijungta prie Supabase.",
  "Share this workspace live across every device. Connected to Supabase.": "Bendrinkite šią darbo sritį tiesiogiai visuose įrenginiuose. Prijungta prie Supabase.",
  "Share this workspace live across every device. Not set up yet — see SETUP-CLOUD.md, then add sync-config.js.": "Bendrinkite šią darbo sritį tiesiogiai visuose įrenginiuose. Dar nesukonfigūruota — žr. SETUP-CLOUD.md, tada pridėkite sync-config.js.",
  "Not set up yet — see SETUP-CLOUD.md, then add sync-config.js.": "Dar nesukonfigūruota — žr. SETUP-CLOUD.md, tada pridėkite sync-config.js.",
  "Local only": "Tik vietinis",
  "Pull from cloud": "Gauti iš debesies",
  "Upload this device →": "Įkelti šį įrenginį →",
  "Sign out of workspace (this device)": "Atsijungti nuo darbo srities (šis įrenginys)",
  "Export data": "Eksportuoti duomenis",
  "Download all orders, stock & team as a JSON backup file": "Atsisiųsti visus užsakymus, atsargas ir komandą kaip JSON atsarginę kopiją",
  "Export": "Eksportuoti",
  "Import a backup": "Importuoti atsarginę kopiją",
  "Restore everything from a JSON file you exported earlier — current data is replaced (undoable)": "Atkurti viską iš anksčiau eksportuoto JSON failo — dabartiniai duomenys bus pakeisti (galima atšaukti)",
  "Import…": "Importuoti…",
  "Restore point": "Atkūrimo taškas",
  "Automatic backups appear here as you work": "Automatinės atsarginės kopijos atsiras čia dirbant",
  "Restore…": "Atkurti…",
  "none yet": "dar nėra",
  "Restore Dėdės Baldai backup": "Atkurti „Dėdės Baldai“ kopiją",
  "Reload the real data imported from the 2026-07-17 backup — current changes will be lost": "Iš naujo įkelti tikrus duomenis iš 2026-07-17 kopijos — dabartiniai pakeitimai bus prarasti",
  "Restore backup": "Atkurti kopiją",
  "Load demo workshop": "Įkelti demonstracines dirbtuves",
  "Sample data for exploring — current changes will be lost": "Pavyzdiniai duomenys susipažinimui — dabartiniai pakeitimai bus prarasti",
  "Load demo": "Įkelti demonstracinius",
  "ShopFlow · local-first, saved in this browser": "ShopFlow · vietiniai duomenys, išsaugoti šioje naršyklėje",
  "Restore a backup": "Atkurti atsarginę kopiją",
  "Roll back to an automatic snapshot saved on this device. Your current data is backed up first, so this is undoable.": "Grįžti prie automatinės kopijos, išsaugotos šiame įrenginyje. Dabartiniai duomenys pirmiausia išsaugomi, todėl tai galima atšaukti.",
  // backup reason labels (data.js)
  "session": "sesija",
  "before import": "prieš importavimą",
  "before restore": "prieš atkūrimą",
  "before loading demo": "prieš demonstracinius duomenis",
  "before restoring Dėdės Baldai backup": "prieš „Dėdės Baldai“ kopijos atkūrimą",

  // ---- Warehouse ----
  "Materials": "Medžiagos",
  "Articles (products)": "Gaminiai (produktai)",
  "New article": "Naujas gaminys",
  "Article": "Gaminys",
  "Unit": "Matas",
  "Part groups": "Dalių grupės",
  "Steps": "Žingsniai",
  "Time / unit": "Laikas / vnt.",
  "Final": "Galutinis",
  "single lane": "viena juosta",
  "No articles yet": "Kol kas nėra gaminių",
  "All items": "Visos prekės",
  "Search materials…": "Ieškoti medžiagų…",
  "Add material": "Pridėti medžiagą",
  "Material": "Medžiaga",
  "In stock": "Sandėlyje",
  "Min": "Min",
  "Location": "Vieta",
  "Last movement": "Paskutinis judėjimas",
  "No materials": "Nėra medžiagų",
  "Receive": "Priimti",
  "Edit article": "Redaguoti gaminį",
  "SKU": "SKU",
  "＋ Add part group": "＋ Pridėti dalių grupę",
  "Delete article": "Ištrinti gaminį",
  "Save article": "Išsaugoti gaminį",
  "Create article": "Sukurti gaminį",
  "min/unit": "min/vnt.",
  "＋ Add step": "＋ Pridėti žingsnį",
  "Add step": "Pridėti žingsnį",
  "New group": "Nauja grupė",
  "no location": "nėra vietos",
  "Low — reorder": "Mažai — užsakyti",
  "Remove from stock": "Nurašyti iš sandėlio",
  "Add to stock": "Pridėti į sandėlį",
  "Movements": "Judėjimai",
  "No movements yet": "Kol kas nėra judėjimų",
  "Min stock (alert below)": "Min. atsargos (įspėti žemiau)",
  "Location / shelf": "Vieta / lentyna",
  "Delete material": "Ištrinti medžiagą",
  "Initial stock": "Pradinės atsargos",
  "Use": "Naudoti",
  "Add material…": "Pridėti medžiagą…",
  "Qty": "Kiekis",
  "No materials linked yet": "Kol kas nesusietų medžiagų",
  "Can't delete — needed by open orders": "Negalima ištrinti — reikalinga atviriems užsakymams",

  // ---- Planner ----
  "My Tasks": "Mano užduotys",
  "New project": "Naujas projektas",
  "This week": "Šią savaitę",
  "Later": "Vėliau",
  "No date": "Be datos",
  "Nothing assigned to you": "Jums nieko nepriskirta",
  "Add task": "Pridėti užduotį",
  "Delete project": "Ištrinti projektą",
  "All projects": "Visi projektai",
  "Add status": "Pridėti būseną",
  "Column options": "Stulpelio parinktys",
  "No tasks": "Nėra užduočių",
  "Add a task…": "Pridėti užduotį…",
  "Add": "Pridėti",
  "No dated tasks": "Nėra užduočių su data",
  "Task": "Užduotis",
  "Project name": "Projekto pavadinimas",
  "Short key": "Trumpas raktas",
  "Colour": "Spalva",
  "Create project": "Sukurti projektą",
  "Column": "Stulpelis",
  "Move left": "Perkelti kairėn",
  "Move right": "Perkelti dešinėn",
  "Delete column": "Ištrinti stulpelį",
  "Keep at least one column": "Palikite bent vieną stulpelį",
  "Delete task": "Ištrinti užduotį",
  "Unassigned": "Nepriskirta",
  "Labels": "Žymos",
  "Description": "Aprašymas",
  "Add more detail…": "Pridėti daugiau informacijos…",
  "Subtasks": "Použduotės",
  "Add a subtask…": "Pridėti použduotę…",
  "Comments": "Komentarai",
  "No comments yet": "Kol kas nėra komentarų",
  "Write a comment…": "Rašyti komentarą…",
  "Created by": "Sukūrė",
  "Backlog": "Laukiantys",
  "To do": "Reikia atlikti",
  "In progress": "Vykdoma",
  "In review": "Peržiūroje",
  "Done": "Atlikta",
  "Bug": "Klaida",
  "Design": "Dizainas",
  "Urgent": "Skubu",
  "Untitled task": "Užduotis be pavadinimo",
  "Project deleted": "Projektas ištrintas",
  "Task deleted": "Užduotis ištrinta",

  // ---- Worker mode ----
  "My Work": "Mano darbas",
  "Hi,": "Sveiki,",
  "Working now": "Dabar dirbama",
  "est": "apie",
  "Stations": "Stotys",
  "Flow": "Eiga",
  "Ideas": "Idėjos",
  "Pause": "Pristabdyti",
  "Problem": "Problema",
  "Resume": "Tęsti",
  "My to-dos": "Mano užduotys",
  "Nothing on your list": "Jūsų sąraše nieko nėra",
  "Add a to-do…": "Pridėti užduotį…",
  "Up next": "Toliau",
  "All caught up!": "Viskas padaryta!",
  "No jobs waiting for you. Check Stations for unclaimed work.": "Jūsų nelaukia darbų. Patikrinkite Stotis dėl laisvo darbo.",
  "Nothing else queued for you.": "Daugiau nieko jums eilėje.",
  "Unblock & start": "Atblokuoti ir pradėti",
  "Start": "Pradėti",
  "You": "Jūs",
  "Unclaimed": "Nepaimta",
  "Queue is empty": "Eilė tuščia",
  "No orders waiting at this station.": "Šioje stotyje nelaukia užsakymų.",

  // ---- Whiteboard ----
  "New board": "Nauja lenta",
  "Private": "Privati",
  "Sticky note": "Lipnus lapelis",
  "Text": "Tekstas",
  "Table": "Lentelė",
  "Pen": "Rašiklis",
  "Zoom out": "Mažinti",
  "Zoom in": "Didinti",
  "Fit to content": "Pritaikyti turiniui",
  "Delete": "Ištrinti",
  "Board name": "Lentos pavadinimas",
  "Create board": "Sukurti lentą",
  "Board sharing": "Lentos bendrinimas",
  "Whole team": "Visa komanda",
  "Everyone can view and edit": "Visi gali peržiūrėti ir redaguoti",
  "Only me": "Tik aš",
  "Selected people": "Pasirinkti žmonės",
  "Save sharing": "Išsaugoti bendrinimą",
  "Board is now private": "Lenta dabar privati",
  "All boards": "Visos lentos",
  "Shared with the whole team": "Bendrinama su visa komanda",

  // ---- Scan station ----
  "Scan station": "Skenavimo stotis",
  "Change station": "Keisti stotį",
  "Use device camera": "Naudoti įrenginio kamerą",
  "Camera": "Kamera",
  "Ready to scan": "Paruošta skenuoti",
  "Recent scans": "Naujausi skenavimai",
  "No scans yet at this station.": "Šioje stotyje dar nėra skenavimų.",
  "Station complete": "Stotis baigta",
  "Already scanned": "Jau nuskenuota",
  "Not routed here": "Nenumatyta čia",
  "Already complete": "Jau baigta",
  "Unknown code": "Nežinomas kodas",
  "No station": "Nėra stoties",
  "Pick a station first": "Pirmiausia pasirinkite stotį",

  // ---- Team / members ----
  "Add member": "Pridėti narį",
  "Add team member": "Pridėti komandos narį",
  "Edit member": "Redaguoti narį",
  "Role": "Vaidmuo",
  "Home station": "Pagrindinė stotis",
  "Remove from team": "Pašalinti iš komandos",
  "Worker — shopfloor (production only)": "Darbininkas — cechas (tik gamyba)",
  "Engineer — design / projektavimas": "Inžinierius — projektavimas",
  "Manager — full access": "Vadovas — visa prieiga",

  // ---- Notifications ----
  "Notifications": "Pranešimai",
  "Mark all read": "Žymėti visus skaitytais",
  "No notifications yet": "Kol kas nėra pranešimų",
  "Enable desktop alerts": "Įjungti darbalaukio pranešimus",

  // ---- Order create / edit / drawer ----
  "Standard articles": "Standartiniai gaminiai",
  "Custom job": "Individualus darbas",
  "Product / job": "Produktas / darbas",
  "Client name": "Kliento vardas",
  "Notes (optional)": "Pastabos (nebūtina)",
  "Create order": "Sukurti užsakymą",
  "Stages": "Etapai",
  "Quantity": "Kiekis",
  "Edit order": "Redaguoti užsakymą",
  "Save changes": "Išsaugoti pakeitimus",
  "Hand off to production": "Perduoti į gamybą",
  "Report a problem": "Pranešti apie problemą",
  "What's blocking this step?": "Kas blokuoja šį žingsnį?",
  "Mark blocked": "Pažymėti užblokuotą",
  "Save link": "Išsaugoti nuorodą",
  "Link project files": "Susieti projekto failus",
  "Notes": "Pastabos",
  "History — every change, by whom": "Istorija — kiekvienas pakeitimas, kieno",
  "No history yet": "Kol kas nėra istorijos",
  "Show all": "Rodyti visus",
  "Deliver & archive": "Pristatyti ir archyvuoti",
  "Ship & archive": "Išsiųsti ir archyvuoti",
  "End project → Archive": "Užbaigti projektą → Archyvuoti",
  "Restore from archive": "Atkurti iš archyvo",
  "Reopen": "Atidaryti iš naujo",
  "Unblock": "Atblokuoti",
  "Report problem": "Pranešti problemą",
  "Time logged": "Užfiksuotas laikas",
  "Due today": "Terminas šiandien",
  "Due tomorrow": "Terminas rytoj",
  "just now": "ką tik",
  "Yesterday": "Vakar",

  // ---- To-Do (manager) ----
  "Show done": "Rodyti atliktas",
  "My list": "Mano sąrašas",
  "Team lists": "Komandos sąrašai",
  "No open to-dos": "Nėra neatliktų užduočių",

  // ---- Activity ----
  "Search changes…": "Ieškoti pakeitimų…",
  "No activity found": "Veiklos nerasta",
  "Try another person or search.": "Pabandykite kitą asmenį ar paiešką.",

  // ---- Common buttons / status / toasts ----
  "Cancel": "Atšaukti",
  "Save": "Išsaugoti",
  "Create": "Sukurti",
  "Close": "Uždaryti",
  "Restore": "Atkurti",
  "Undo": "Atšaukti",
  "Deleted": "Ištrinta",
  "No changes": "Nėra pakeitimų",
  "Name": "Pavadinimas",
  "Icon": "Piktograma",
  "Workshop renamed": "Dirbtuvė pervadinta",
  "Uploaded to cloud": "Įkelta į debesį",
  "Pulled latest from cloud": "Gauti naujausi iš debesies",
  "Import failed — not a valid ShopFlow backup file": "Importuoti nepavyko — netinkamas ShopFlow atsarginės kopijos failas",
  "Backup imported": "Atsarginė kopija importuota",
  "Backup restored": "Atsarginė kopija atkurta",
  "Demo workshop loaded": "Įkeltos demonstracinės dirbtuvės",
  "Dėdės Baldai backup restored": "„Dėdės Baldai“ kopija atkurta",
  "Couldn't save on this device — storage is full. Export a backup now.": "Nepavyko išsaugoti šiame įrenginyje — atmintis pilna. Eksportuokite atsarginę kopiją dabar.",
  "Portfolio updated": "Portfelis atnaujintas",
  "Prefix cleared": "Priešdėlis išvalytas",
  "Order updated — logged in history": "Užsakymas atnaujintas — įrašyta istorijoje",
};
