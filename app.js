(() => {
  "use strict";

  const config = window.STALLIMON_SITE_CONFIG || {};
  const typeColors = { Feuer: "#ff6a2a", Wasser: "#29b8ff", Pflanze: "#62d46f", Luft: "#baf2ff", Stein: "#c49a70", Blitz: "#54ddff", Geist: "#a86cff", Normal: "#c5c5cf", Metall: "#9eb3c2", Licht: "#ffe078", Schatten: "#74508f", Eis: "#9deaff" };
  const commands = [
    ["!starter 1–3", "Wählt einmalig Funkenkitz, Rinnwiesel oder Knospro als Starter."],
    ["!stallimons", "Zeigt dein aktives Stallimon, Level, XP, Team, Lager und Siegel."],
    ["!sammlung", "Zeigt die zehn Stallimon in deinem Reisehufeisen."],
    ["!seelenweide [Seite]", "Zeigt Stallimon, die gerade nicht mit dir reisen."],
    ["!mitnehmen WEIDE PLATZ", "Tauscht einen Seelenweide-Platz mit einem Reiseplatz."],
    ["!team SLOT PLATZ", "Legt bis zu drei aktive Kämpfer aus dem Reisehufeisen fest."],
    ["!attacken", "Zeigt alle bereits gelernten Attacken des aktiven Stallimon."],
    ["!attacke SLOT NUMMER", "Rüstet eine gelernte Attacke auf Kampfplatz 1 bis 4 aus."],
    ["!annehmen / !ablehnen", "Nimmt eine zufällige Wildbegegnung an oder gibt sie weiter."],
    ["!kampf 1–4", "Setzt im Wild- oder Trainerkampf die gewählte Attacke ein."],
    ["!binden", "Verbraucht ein Hufeisensiegel und versucht die Seelenbindung."],
    ["!flucht", "Beendet eine Wildbegegnung ohne Bindungsversuch."],
    ["!entwickeln", "Löst eine bereite Level- oder Freundschaftsentwicklung freiwillig aus."],
    ["!spitzname NAME", "Gibt deinem aktiven Stallimon einen eigenen Namen; reset entfernt ihn."],
    ["!trainerkampf @NAME [Einsatz]", "Fordert einen Hüter optional um Hufeisen heraus."],
    ["!kampfannehmen / !kampablehnen", "Beantwortet eine Trainerkampf-Herausforderung."],
    ["!wechsel 1–3", "Wechselt im Trainerkampf auf einen anderen lebenden Teamplatz."],
    ["!aufgeben", "Gibt einen laufenden Trainerkampf auf."],
    ["!trainerstats", "Zeigt Siege, Niederlagen und Stallmeister-Siege."],
    ["!stallmeister", "Startet mit drei Level-70-Stallimon die schwierigste Prüfung."],
    ["!siegel / !siegelkauf [Menge]", "Zeigt oder kauft Hufeisensiegel mit Hufeisen."],
    ["!stallifibel [Nummer]", "Zeigt einen kurzen Fibel-Eintrag direkt im Chat."],
    ["!fibel", "Postet den Link zu dieser Webseite."],
    ["!profilsync", "Überträgt dein Profil in den persönlichen Fibel-Bereich, wenn aktiviert."]
  ];

  let catalog = [];
  let byKey = {};
  const $ = (id) => document.getElementById(id);
  const cleanText = (value) => String(value || "").replace(/\*\*/g, "").replace(/`/g, "");
  const get = (object, ...names) => names.reduce((value, name) => value ?? object?.[name], undefined);

  function routeFromHash() {
    const hash = location.hash.slice(1);
    const sessionMatch = hash.match(/(?:^|&)session=([^&]+)/);
    if (sessionMatch) {
      localStorage.setItem("stallimonSession", decodeURIComponent(sessionMatch[1]));
      history.replaceState(null, "", `${location.pathname}${location.search}#mein-stallimon`);
      return "mein-stallimon";
    }
    const route = hash.split("&")[0];
    return ["start", "fibel", "mein-stallimon"].includes(route) ? route : "start";
  }

  function showRoute(route, updateHash = true) {
    document.querySelectorAll(".route").forEach((page) => page.classList.toggle("is-active", page.dataset.page === route));
    document.querySelectorAll("nav [data-route]").forEach((link) => link.classList.toggle("is-active", link.dataset.route === route));
    $("mainNav").classList.remove("is-open");
    $("menuToggle").setAttribute("aria-expanded", "false");
    if (updateHash && location.hash !== `#${route}`) history.pushState(null, "", `#${route}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (route === "mein-stallimon") loadProfile();
  }

  function renderCommands() {
    $("commandGrid").innerHTML = commands.map(([command, text]) => `<article class="command-card"><code>${command}</code><p>${text}</p></article>`).join("");
  }

  function primaryColor(mon) { return typeColors[mon.types?.[0]] || typeColors.Normal; }
  function chips(mon) {
    return [...(mon.types || []).map((type) => `<span class="chip" style="--chip-color:${typeColors[type] || typeColors.Normal}">${type.toUpperCase()}</span>`), `<span class="chip rarity">${mon.rarity.toUpperCase()}</span>`].join("");
  }
  function evolutionSummary(mon) {
    const evo = mon.evolution || {};
    if (!evo.targetId) return "Keine weitere Entwicklung";
    const target = catalog.find((entry) => entry.id === evo.targetId);
    if (evo.trigger === "stream_streak") return `10er-Streamserie → ${target?.name || `#${evo.targetId}`}`;
    return `Level ${evo.value} → ${target?.name || `#${evo.targetId}`}`;
  }

  function renderDex() {
    const query = $("dexSearch").value.trim().toLowerCase();
    const type = $("typeFilter").value;
    const rarity = $("rarityFilter").value;
    const filtered = catalog.filter((mon) => {
      const haystack = [mon.id, mon.name, mon.role, mon.rarity, mon.ability?.name, mon.ability?.effect, ...(mon.types || [])].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (!type || mon.types.includes(type)) && (!rarity || mon.rarity === rarity);
    });
    $("dexCount").textContent = `${filtered.length} ${filtered.length === 1 ? "EINTRAG" : "EINTRÄGE"}`;
    $("emptyDex").hidden = filtered.length > 0;
    $("dexGrid").innerHTML = filtered.map((mon) => `<button class="dex-card" data-key="${mon.key}" style="--type-color:${primaryColor(mon)}"><span class="dex-number">#${mon.id}</span><div class="dex-art"><img loading="lazy" src="${mon.image}" alt="${mon.name}"></div><div class="dex-body"><div class="chips">${chips(mon)}</div><h2>${mon.name}</h2><p class="dex-role">${mon.role}</p><div class="evo-mini">${evolutionSummary(mon)}</div></div></button>`).join("");
    $("dexGrid").querySelectorAll(".dex-card").forEach((card) => card.addEventListener("click", () => openDex(card.dataset.key)));
  }

  function openDex(key) {
    const mon = byKey[key];
    if (!mon) return;
    const stats = [["KP", mon.stats.hp], ["ANG", mon.stats.attack], ["VER", mon.stats.defense], ["TMP", mon.stats.speed]];
    const moves = mon.learnset.map((move) => `<tr><td>${move.learnAt === "evolution" ? "ENTW." : `LV ${move.level}`}</td><td><b>${move.name}</b><br><span class="chip" style="--chip-color:${typeColors[move.type] || typeColors.Normal}">${move.type}</span></td><td>${move.power || "STATUS"}<br>${move.accuracy}%</td><td>${move.effect}</td></tr>`).join("");
    $("dialogContent").innerHTML = `<div class="dialog-grid" style="--type-color:${primaryColor(mon)}"><div class="dialog-art"><img src="${mon.image}" alt="${mon.name}"></div><div class="dialog-info"><span class="kicker">#${mon.id} · ${mon.rarity.toUpperCase()}</span><h2>${mon.name}</h2><div class="chips">${chips(mon)}</div><p>${mon.role}</p><div class="ability"><b>${mon.ability.name}</b><p>${mon.ability.effect}</p></div><div class="stats">${stats.map(([label, value]) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`).join("")}</div><div class="evolution-box"><span>ENTWICKLUNG</span><p>${cleanText(mon.evolution.text || evolutionSummary(mon))}</p></div><h3>Erlernbare Attacken</h3><table class="moves-table"><thead><tr><th>Ab</th><th>Attacke</th><th>Stärke</th><th>Wirkung</th></tr></thead><tbody>${moves}</tbody></table></div></div>`;
    $("dexDialog").showModal();
  }

  async function loadCatalog() {
    let data = window.STALLIMON_CATALOG;
    if (!data) {
      const response = await fetch("data/stallimon-catalog.json");
      if (!response.ok) throw new Error("Fibel-Daten konnten nicht geladen werden.");
      data = await response.json();
    }
    catalog = data.species || [];
    byKey = Object.fromEntries(catalog.map((mon) => [mon.key, mon]));
    const types = [...new Set(catalog.flatMap((mon) => mon.types))].sort();
    const rarities = [...new Set(catalog.map((mon) => mon.rarity))];
    $("typeFilter").insertAdjacentHTML("beforeend", types.map((type) => `<option>${type}</option>`).join(""));
    $("rarityFilter").insertAdjacentHTML("beforeend", rarities.map((rarity) => `<option>${rarity}</option>`).join(""));
    renderDex();
  }

  function setProfileView(id) {
    ["profileLoggedOut", "profileLoading", "profileError", "profileDashboard"].forEach((name) => { $(name).hidden = name !== id; });
  }

  async function loadProfile() {
    if (!config.apiBaseUrl) {
      setProfileView("profileLoggedOut");
      $("profileSetupHint").hidden = false;
      return;
    }
    const session = localStorage.getItem("stallimonSession");
    if (!session) { setProfileView("profileLoggedOut"); $("profileSetupHint").hidden = true; return; }
    setProfileView("profileLoading");
    try {
      const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/me`, { headers: { Authorization: `Bearer ${session}` } });
      if (response.status === 401) { localStorage.removeItem("stallimonSession"); setProfileView("profileLoggedOut"); return; }
      if (!response.ok) throw new Error("Der Profil-Dienst antwortet gerade nicht.");
      const payload = await response.json();
      if (!payload.profile) throw new Error("Dein Twitch-Konto ist verbunden, aber dein Profil wurde noch nicht synchronisiert. Schreibe im Stream !profilsync.");
      renderProfile(payload);
      setProfileView("profileDashboard");
    } catch (error) {
      $("profileErrorText").textContent = error.message;
      setProfileView("profileError");
    }
  }

  function renderProfile(payload) {
    const profile = payload.profile;
    const starter = get(profile, "Starter", "starter");
    const collection = get(profile, "Collection", "collection") || [];
    const all = [starter, ...collection].filter(Boolean);
    const byId = Object.fromEntries(all.map((mon) => [get(mon, "InstanceId", "instanceId"), mon]));
    const carriedIds = get(profile, "Carried", "carried") || [];
    const activeIds = get(profile, "ActiveTeam", "activeTeam") || [];
    const carried = carriedIds.map((id) => byId[id]).filter(Boolean);
    const pasture = all.filter((mon) => !carriedIds.includes(get(mon, "InstanceId", "instanceId")));
    const encountered = get(profile, "EncounteredSpecies", "encounteredSpecies") || [];
    const bound = get(profile, "BoundSpecies", "boundSpecies") || [];
    $("profileName").textContent = payload.user?.displayName || payload.user?.login || "Hüter";
    const stats = [["Gebunden", `${bound.length}/50`], ["Begegnet", `${encountered.length}/50`], ["Siegel", get(profile, "Seals", "seals") || 0], ["Trainer-Siege", get(profile, "TrainerWins", "trainerWins") || 0], ["Streamserie", get(profile, "StreamStreak", "streamStreak") || 0]];
    $("profileStats").innerHTML = stats.map(([label, value]) => `<div class="profile-stat"><b>${value}</b><span>${label.toUpperCase()}</span></div>`).join("");
    renderProfileMons($("activeTeam"), activeIds.map((id) => byId[id]).filter(Boolean), 3);
    renderProfileMons($("carriedTeam"), carried, 10);
    renderProfileMons($("pastureTeam"), pasture, 0);
    $("discoveryLabel").textContent = `${encountered.length}/50 BEGEGNET · ${bound.length}/50 GEBUNDEN`;
    $("discoveryGrid").innerHTML = catalog.map((mon) => `<div class="discovery ${encountered.includes(mon.key) ? "seen" : ""} ${bound.includes(mon.key) ? "bound" : ""}" title="#${mon.id} ${mon.name}">#${mon.id}</div>`).join("");
  }

  function renderProfileMons(container, mons, minimumSlots) {
    container.innerHTML = "";
    mons.forEach((owned) => {
      const key = get(owned, "SpeciesKey", "speciesKey");
      const mon = byKey[key] || byKey.funkenkitz;
      const card = document.createElement("article");
      card.className = "profile-mon";
      const image = document.createElement("img"); image.src = mon.image; image.alt = mon.name;
      const name = document.createElement("b"); name.textContent = get(owned, "Nickname", "nickname") || mon.name;
      const meta = document.createElement("small"); meta.textContent = `${mon.name} · Lv ${get(owned, "Level", "level") || 1}`;
      card.append(image, name, meta); container.appendChild(card);
    });
    for (let i = mons.length; i < minimumSlots; i += 1) {
      const empty = document.createElement("article"); empty.className = "profile-mon is-empty"; empty.textContent = `PLATZ ${i + 1}`; container.appendChild(empty);
    }
    if (!mons.length && !minimumSlots) { const empty = document.createElement("article"); empty.className = "profile-mon is-empty"; empty.textContent = "Noch leer"; container.appendChild(empty); }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-route]");
      if (!link) return;
      event.preventDefault(); showRoute(link.dataset.route);
    });
    window.addEventListener("hashchange", () => showRoute(routeFromHash(), false));
    $("menuToggle").addEventListener("click", () => { const open = $("mainNav").classList.toggle("is-open"); $("menuToggle").setAttribute("aria-expanded", String(open)); });
    ["dexSearch", "typeFilter", "rarityFilter"].forEach((id) => $(id).addEventListener(id === "dexSearch" ? "input" : "change", renderDex));
    $("resetFilters").addEventListener("click", () => { $("dexSearch").value = ""; $("typeFilter").value = ""; $("rarityFilter").value = ""; renderDex(); });
    $("closeDialog").addEventListener("click", () => $("dexDialog").close());
    $("dexDialog").addEventListener("click", (event) => { if (event.target === $("dexDialog")) $("dexDialog").close(); });
    $("twitchLogin").addEventListener("click", () => {
      if (!config.apiBaseUrl) { $("profileSetupHint").hidden = false; return; }
      const returnTo = `${location.origin}${location.pathname}#mein-stallimon`;
      location.href = `${config.apiBaseUrl.replace(/\/$/, "")}/auth/twitch?return_to=${encodeURIComponent(returnTo)}`;
    });
    $("profileRetry").addEventListener("click", loadProfile);
    $("profileLogout").addEventListener("click", async () => {
      const session = localStorage.getItem("stallimonSession");
      localStorage.removeItem("stallimonSession");
      if (session && config.apiBaseUrl) fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/logout`, { method: "POST", headers: { Authorization: `Bearer ${session}` } }).catch(() => {});
      setProfileView("profileLoggedOut");
    });
  }

  async function init() {
    renderCommands();
    bindEvents();
    try { await loadCatalog(); }
    catch (error) { $("dexGrid").textContent = error.message; }
    showRoute(routeFromHash(), false);
  }
  init();
})();
