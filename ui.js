/* =========================================================
   UI  -  auth, home, shop, missions, rewards, gifting,
   settings, help, admin.  (No inline handlers: the CSP forbids
   them, everything uses data-act + one delegated listener.)
========================================================= */
(function(){
const WZ = window.WZ, CFG = WZ.CONFIG, $ = WZ.$, esc = WZ.esc, fmt = WZ.fmt;
const ui = WZ.ui = {};
let user = null;
let heroRaf = 0, shopTab = "characters", shopWeapon = "pistol";

function show(id){ ["auth", "home", "game"].forEach(s => $(s).classList.toggle("hidden", s !== id)); }
/* "Candidate" check only - matching one of ADMIN_IDS is not enough on its own, see openAdmin(). */
const isAdmin = () => CFG.BUILD === "dev" && user && CFG.ADMIN_IDS.includes(user.id);
let adminUnlocked = false;   // resets on every reload - never persisted, never saved to the user record

/* ---------------------------------------------------------
   PERSISTENCE
--------------------------------------------------------- */
ui.saveUser = function(u){
    user = u || user;
    const users = WZ.store.getUsers(); users[user.id] = user; WZ.store.saveUsers(users);
};
ui.levelCheck = function(u){
    u = u || user;
    while(u.xp >= u.level * 100){ u.xp -= u.level * 100; u.level++; }
};
ui.currentUser = () => user;

/* ---------------------------------------------------------
   AUTH
--------------------------------------------------------- */
function authMsg(t, ok){ const m = $("authMsg"); m.textContent = t || ""; m.className = "authMsg" + (ok ? " ok" : ""); }

async function doAuth(create){
    const id = WZ.normalizeId($("authId").value), pw = $("authPw").value;
    if(!/^[A-Z0-9_]{3,16}$/.test(id)) return authMsg("ID: 3-16 letters, numbers or _");
    if(pw.length < 4) return authMsg("Password must be at least 4 characters.");
    const users = WZ.store.getUsers();
    const hash = await WZ.hashPw(id, pw);
    if(create){
        if(users[id]) return authMsg("This ID already exists.");
        users[id] = WZ.newUser(id, hash);
        WZ.store.saveUsers(users);
    }else{
        const u = users[id];
        if(!u) return authMsg("Player not found. Create an account first.");
        if(u.pw){ if(u.pw !== hash) return authMsg("Wrong password."); }
        else{   // migrate a legacy plain-text save
            if(String(u.password) !== pw) return authMsg("Wrong password.");
            u.pw = hash; delete u.password;
        }
    }
    users[id] = WZ.normalizeUser(users[id]);
    WZ.store.saveUsers(users);
    login(users[id]);
}
function login(u){
    user = u; WZ.store.setSession(u);
    $("authPw").value = ""; authMsg("");
    ui.showHome();
}
function logout(){ user = null; WZ.store.setSession(null); cancelAnimationFrame(heroRaf); show("auth"); }

/* ---------------------------------------------------------
   HOME
--------------------------------------------------------- */
ui.showHome = function(){
    user = WZ.normalizeUser(user); ui.saveUser(user);
    show("home"); updateHome();
    $("adminBtn").classList.toggle("hidden", !isAdmin());
    $("giftBtn").classList.toggle("hidden", !CFG.FEATURES.gifting);
    $("rewardBtn").classList.toggle("hidden", !CFG.FEATURES.dailyRewards);
    cancelAnimationFrame(heroRaf);
    const loop = t => {
        if($("home").classList.contains("hidden")) return;
        WZ.fighter.preview($("heroCanvas"), user.character, WZ.activeSkin(user), { bob: Math.sin(t / 520) * 2.5 });
        heroRaf = requestAnimationFrame(loop);
    };
    heroRaf = requestAnimationFrame(loop);
};

function updateHome(){
    const u = user;
    $("coinsView").textContent = fmt(u.coins);
    $("levelView").textContent = u.level;
    $("playerNameView").textContent = u.id;
    $("xpFill").style.width = Math.min(100, u.xp / (u.level * 100) * 100) + "%";
    $("xpText").textContent = `XP ${u.xp} / ${u.level * 100}`;
    $("bestView").textContent = fmt(u.bestScore);
    $("waveView").textContent = u.wave;
    $("killsView").textContent = fmt(u.kills);
    $("heroName").textContent = WZ.CHARACTERS[u.character].name;
    $("heroGun").textContent = WZ.WEAPONS[u.weapon].name + " · " + WZ.SKINS[WZ.activeSkin(u)].name;

    const m = WZ.MISSIONS[u.missionIndex % WZ.MISSIONS.length];
    const prog = missionProgress(m);
    $("missionMini").innerHTML = `<b>${esc(m.name)}</b>${esc(m.desc)}<div class="progress"><i style="width:${Math.min(100, prog / m.goal * 100)}%"></i></div>${prog}/${m.goal}`;

    const users = Object.values(WZ.store.getUsers()).sort((a, b) => WZ.safeInt(b.bestScore) - WZ.safeInt(a.bestScore)).slice(0, 6);
    $("boardList").innerHTML = users.map((p, i) =>
        `<div class="board"><i>${i + 1}</i><span>${esc(p.id)}</span><b>${fmt(WZ.safeInt(p.bestScore))}</b></div>`).join("") || `<div class="muted tiny">No scores yet.</div>`;
}

ui.currentUser = () => user;
ui.startOnlineGame = function(info){
    show("game");
    try{ if(screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); }catch(e){}
    cancelAnimationFrame(heroRaf);
    WZ.requestWake && WZ.requestWake();
    WZ.game.startOnline(user, info);
};
ui.startGame = function(){
    show("game");
    try{ if(screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); }catch(e){}
    cancelAnimationFrame(heroRaf);
    WZ.requestWake && WZ.requestWake();
    WZ.game.start(user);
};

/* ---------------------------------------------------------
   MODAL
--------------------------------------------------------- */
function openModal(title, html, wide){
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = html;
    $("modalCard").classList.toggle("wide", !!wide);
    $("modal").classList.remove("hidden");
    $("modalBody").scrollTop = 0;
}
WZ.openModal = openModal;
ui.closeModal = function(){ $("modal").classList.add("hidden"); if(user && !$("home").classList.contains("hidden")) updateHome(); };
ui.modalOpen = () => !$("modal").classList.contains("hidden");

/* ---------------------------------------------------------
   LEVEL SELECT (arenas)
--------------------------------------------------------- */
function openMaps(){
    const u = user, cur = WZ.MAPS[u.currentMap] || WZ.MAPS.city;
    const cards = WZ.MAP_ORDER.map(id => {
        const m = WZ.MAPS[id], owned = u.unlockedMaps.includes(id), on = u.currentMap === id;
        const action = owned
            ? (on ? `<button class="shopAction on">▶ SELECTED</button>` : `<button class="shopAction equip" data-act="mapSelect" data-arg="${id}">SELECT</button>`)
            : `<div class="price">🪙 ${fmt(m.price)}</div><button class="shopAction buy" data-act="mapBuy" data-arg="${id}">UNLOCK</button>`;
        return `<div class="shopItem ${on ? "equipped" : ""}">
            <div class="itemVisual" style="background:${m.preview}"></div>
            <div class="itemName">${m.name}</div><div class="itemDesc">${m.desc}</div>${action}</div>`;
    }).join("");
    openModal("LEVEL SELECT", `<div class="shopGrid">${cards}</div>
        <button class="primary claim" data-act="mapPlay">▶ PLAY ${cur.name}</button>`, true);
}

/* ---------------------------------------------------------
   SHOP
--------------------------------------------------------- */
const pct = (v, max) => Math.max(4, Math.min(100, v / max * 100));
const bar = (l, v) => `<div class="bar"><u>${l}</u><i><b style="width:${v}%"></b></i></div>`;

function openShop(tab){
    if(tab) shopTab = tab;
    const tabs = [["characters", "CHARACTERS"], ["weapons", "WEAPONS"], ["skins", "GUN SKINS"], ["upgrades", "UPGRADES"]];
    let html = `<div class="tabs">${tabs.map(t => `<button data-act="tab" data-arg="${t[0]}" class="${shopTab === t[0] ? "on" : ""}">${t[1]}</button>`).join("")}
        <span style="flex:1"></span><div class="chip gold"><i>🪙</i><b>${fmt(user.coins)}</b></div></div>`;
    if(shopTab === "skins"){
        html += `<div class="chips2">${WZ.WEAPON_ORDER.map(w => `<button data-act="skinWeapon" data-arg="${w}" class="${shopWeapon === w ? "on" : ""}">${WZ.WEAPONS[w].name}</button>`).join("")}</div>`;
    }
    html += `<div class="shopGrid">${
        shopTab === "characters" ? WZ.CHARACTER_ORDER.map(charCard).join("") :
        shopTab === "weapons" ? WZ.WEAPON_ORDER.map(weaponCard).join("") :
        shopTab === "skins" ? Object.keys(WZ.SKINS).filter(s => WZ.SKINS[s].weapon === shopWeapon).map(skinCard).join("") :
        WZ.UPGRADES.map(upgradeCard).join("")}</div>`;
    const wasOpen = ui.modalOpen(), sc = wasOpen ? $("modalBody").scrollTop : 0;
    openModal("SHOP", html, true);
    $("modalBody").scrollTop = sc;
}

function action(owned, equipped, price, act, id, lockedNote){
    if(equipped) return `<button class="shopAction on">✔ EQUIPPED</button>`;
    if(owned) return `<button class="shopAction equip" data-act="${act}Equip" data-arg="${id}">EQUIP</button>`;
    return `${price ? `<div class="price">🪙 ${fmt(price)}</div>` : ""}<button class="shopAction buy" data-act="${act}Buy" data-arg="${id}">BUY</button>`;
}

function charCard(id){
    const c = WZ.CHARACTERS[id], owned = user.ownedCharacters.includes(id), eq = user.character === id;
    return `<div class="shopItem ${eq ? "equipped" : ""}">
        <div class="itemVisual" style="height:190px"><img src="assets/characters/${id}_full.webp" alt="${c.name}" draggable="false"></div>
        <div class="itemName">${c.name}</div>
        <div class="itemDesc">${esc(c.bio)}</div>
        <div class="bars">${bar("SPEED", pct(c.speed, 1.2))}${bar("HEALTH", pct(c.health, 130))}${bar("DAMAGE", pct(c.damage, 1.4))}${bar("RELOAD", pct(1.2 - c.reload, .5))}</div>
        ${action(owned, eq, c.price, "char", id)}</div>`;
}
function weaponCard(id){
    const w = WZ.WEAPONS[id], owned = user.ownedWeapons.includes(id), eq = user.weapon === id;
    const skin = user.skin[id];
    return `<div class="shopItem ${eq ? "equipped" : ""}">
        <div class="itemVisual gun"><img src="assets/guns/${skin}.webp" alt="${w.name}" draggable="false"></div>
        <div class="itemName">${w.name}</div>
        <div class="bars">${bar("DAMAGE", pct(w.damage * w.pellets * .6, 100))}${bar("RATE", pct(1000 / w.fireRate, 14))}${bar("MAG", pct(w.mag, 100))}${bar("RANGE", pct(w.speed, 30))}</div>
        <div class="itemDesc">${w.pellets > 1 ? "Spread shot · " : ""}${w.pierce ? "Pierces enemies · " : ""}Mag ${w.mag} · Reserve ${w.reserve}</div>
        ${action(owned, eq, w.price, "weapon", id)}</div>`;
}
function skinCard(id){
    const s = WZ.SKINS[id], w = WZ.WEAPONS[s.weapon];
    const owned = user.ownedSkins.includes(id), eq = user.skin[s.weapon] === id;
    return `<div class="shopItem ${s.rarity} ${eq ? "equipped" : ""}">
        <span class="badge ${s.rarity}">${s.rarity.toUpperCase()}</span>
        <div class="itemVisual gun"><img src="assets/guns/${id}.webp" alt="${s.name}" draggable="false"></div>
        <div class="itemName">${s.name}</div>
        <div class="itemDesc">${w.name} skin${user.ownedWeapons.includes(s.weapon) ? "" : " · weapon not owned yet"}</div>
        ${action(owned, eq, s.price, "skin", id)}</div>`;
}
const upgPrice = (u, lvl) => Math.floor(u.base * Math.pow(1.55, lvl));
function upgradeCard(u, i){
    const lvl = WZ.safeInt(user.upgrades[u.id]);
    return `<div class="shopItem"><div class="itemVisual"><div class="upgradeRing ${["green", "blue", "gold", "red"][i % 4]}">${lvl}</div></div>
        <div class="itemName">${u.name}</div><div class="itemDesc">${u.desc}<br>Level ${lvl}</div>
        <div class="price">🪙 ${fmt(upgPrice(u, lvl))}</div>
        <button class="shopAction buy" data-act="upgBuy" data-arg="${u.id}">UPGRADE</button></div>`;
}

function spend(price){
    if(user.coins < price){ WZ.toast("Not enough coins", "bad"); return false; }
    user.coins -= price; return true;
}
function commit(){ ui.levelCheck(); ui.saveUser(); openShop(); }

/* ---------------------------------------------------------
   MISSIONS / DAILY / GIFT
--------------------------------------------------------- */
function missionProgress(m){ return m.type === "wave" ? Math.min(user.wave, m.goal) : Math.min(user.missionProgress, m.goal); }
function openMissions(){
    const m = WZ.MISSIONS[user.missionIndex % WZ.MISSIONS.length], p = missionProgress(m), done = p >= m.goal;
    openModal("MISSIONS", `<div class="infoCard"><h3>${esc(m.name)}</h3><p>${esc(m.desc)}</p>
        <div class="progress"><i style="width:${Math.min(100, p / m.goal * 100)}%"></i></div>
        <p class="tiny muted">${p} / ${m.goal}</p><div class="price">🪙 REWARD ${m.reward}</div>
        ${done ? `<button class="claim primary" data-act="claimMission">CLAIM REWARD</button>` : `<button class="claim disabledBtn">IN PROGRESS</button>`}</div>`);
}

const DAILY = [10, 15, 20, 30, 40, 60, 100];
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
const yestStr = () => { const d = new Date(Date.now() - 864e5); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
function dailyState(){
    const d = user.daily = user.daily || { last: "", streak: 0 };
    const can = d.last !== todayStr();
    const streak = d.last === yestStr() || d.last === todayStr() ? d.streak : 0;
    return { d, can, streak };
}
function openReward(){
    const { can, streak } = dailyState();
    const idx = can ? streak % 7 : (streak - 1 + 7) % 7;
    openModal("DAILY REWARD", `<div class="infoCard"><h3>LOGIN STREAK: ${streak} DAY${streak === 1 ? "" : "S"}</h3>
        <div class="dayGrid">${DAILY.map((r, i) => `<div class="day ${(can ? i < idx : i <= idx) ? "done" : ""} ${can && i === idx ? "today" : ""}">DAY ${i + 1}<b>🪙${r}</b></div>`).join("")}</div>
        ${can ? `<button class="claim primary" data-act="claimDaily">CLAIM 🪙 ${DAILY[idx]}</button>` : `<button class="claim disabledBtn">COME BACK TOMORROW</button>`}</div>`);
}

function openGift(){
    const n = Object.keys(WZ.store.getUsers()).length - 1;
    openModal("GIFT COINS", `<div class="field"><label>PLAYER ID</label><input id="giftTarget" placeholder="ENTER PLAYER ID"></div>
        <div class="field"><label>COINS</label><input id="giftAmount" type="number" min="1" placeholder="100"></div>
        <button class="primary claim" data-act="sendGift">SEND COINS</button>
        <p class="tiny muted">Other players registered on this device: ${n}</p>`);
}

/* ---------------------------------------------------------
   INFO SCREENS
--------------------------------------------------------- */
function openHelp(){
    openModal("HOW TO PLAY", `
    <div class="infoCard"><h3>CONTROLS</h3>
        <p><b>Phone / tablet:</b> left thumb = move · right thumb = aim &amp; fire · ⟳ button = reload.</p>
        <p><b>Keyboard + mouse:</b> WASD / arrows = move · mouse = aim · left click = fire · R = reload · Esc / P = pause.</p></div>
    <div class="infoCard"><h3>SURVIVAL</h3><ul>
        <li>Zombies attack from the left. Clear all of them to finish a wave.</li>
        <li>Each wave rewards ${CFG.ECONOMY.waveCoinsMin}-${CFG.ECONOMY.waveCoinsMax} coins, some ammo and a little health.</li>
        <li>Zombies sometimes drop 🟨 ammo or ⬜ health crates - walk over them.</li>
        <li>Every 5th wave a BOSS appears.</li></ul></div>
    <div class="infoCard"><h3>PROGRESSION</h3><ul>
        <li>Buy characters, weapons and gun skins in the shop.</li>
        <li>Upgrade rings boost health, damage, speed, armor and more.</li>
        <li>Finish missions and log in daily for extra coins.</li></ul></div>`);
}
function openMulti(){ WZ.online.open(); }
ui.openSettings = function(){
    const s = WZ.settings;
    const tg = (k, l) => `<div class="toggleRow"><span>${l}</span><button class="switch ${s[k] ? "on" : ""}" data-act="toggle" data-arg="${k}" aria-label="${l}"></button></div>`;
    openModal("SETTINGS", `${tg("sound", "Sound effects")}
        <div class="toggleRow"><span>Volume</span><input type="range" id="volRange" min="0" max="100" value="${Math.round(s.volume * 100)}" style="width:55%"></div>
        ${tg("vibration", "Vibration")}${tg("screenShake", "Screen shake")}${tg("dmgNumbers", "Damage numbers")}
        <div class="toggleRow"><span>Blood effects</span><div class="seg">${["OFF", "LOW", "HIGH"].map((n, i) => `<button data-act="blood" data-arg="${i}" class="${s.blood === i ? "on" : ""}">${n}</button>`).join("")}</div></div>
        <p class="tiny muted" style="margin-top:14px">WAR ZONE v${CFG.VERSION}${CFG.BUILD === "dev" ? " (dev build)" : ""}</p>`);
    $("volRange").oninput = e => { s.volume = e.target.value / 100; WZ.sfx.setVolume(s.volume); WZ.saveSettings(); };
};

/* ---------------------------------------------------------
   ADMIN  (dev builds only - and even then, gated by a passcode
   you set yourself in config.js -> ADMIN_PASSCODE_HASH, not by
   the username. See CONFIG's comment for how to set it.)
--------------------------------------------------------- */
function openAdmin(){
    if(!isAdmin()) return;
    if(!CFG.ADMIN_PASSCODE_HASH){
        return openModal("ADMIN LOCKED", `<div class="infoCard"><h3>No passcode set</h3>
            <p>ADMIN_PASSCODE_HASH is empty in config.js, so the admin panel stays locked even for ${esc(user.id)}.</p>
            <p class="tiny muted">To enable it for yourself: open the browser console and run
            <code>await WZ.sha256("your-secret-phrase")</code>, then paste the result into ADMIN_PASSCODE_HASH.</p></div>`);
    }
    if(!adminUnlocked) return openAdminGate();
    const users = Object.values(WZ.store.getUsers());
    openModal("ADMIN (DEV BUILD)", `<div class="infoCard"><h3>MY ACCOUNT</h3><div class="row" style="flex-wrap:wrap">
        <button data-act="adm" data-arg="coins1k">+1,000 🪙</button><button data-act="adm" data-arg="coins100k">+100,000 🪙</button>
        <button data-act="adm" data-arg="unlock">UNLOCK ALL</button><button data-act="adm" data-arg="upg">MAX UPGRADES</button>
        <button class="danger" data-act="adm" data-arg="reset">RESET</button></div></div>
        <div class="infoCard"><h3>PLAYERS (${users.length})</h3><table class="tbl"><tr><th>ID</th><th>LV</th><th>COINS</th><th>BEST</th></tr>
        ${users.map(u => `<tr><td>${esc(u.id)}</td><td>${u.level}</td><td>${fmt(u.coins)}</td><td>${fmt(u.bestScore)}</td></tr>`).join("")}</table></div>
        <p class="tiny muted">This panel does not exist in release builds (npm run build:release / npm run android / npm run ios).</p>`);
}

function openAdminGate(){
    openModal("ADMIN PASSCODE", `<div class="field"><label>SECRET PASSCODE</label>
        <input id="adminPass" type="password" autocomplete="off" placeholder="Enter passcode"></div>
        <button class="primary claim" data-act="adminUnlock">UNLOCK</button>
        <p class="authMsg" id="adminGateMsg"></p>`);
    const input = $("adminPass"); input.focus();
    input.addEventListener("keydown", e => { if(e.key === "Enter") A.adminUnlock(); });
}

/* ---------------------------------------------------------
   ACTION DISPATCH
--------------------------------------------------------- */
const A = {
    tab: v => { shopTab = v; openShop(); },
    skinWeapon: v => { shopWeapon = v; openShop(); },
    mapSelect: id => { if(user.unlockedMaps.includes(id)){ user.currentMap = id; ui.saveUser(); openMaps(); } },
    mapBuy: id => { const m = WZ.MAPS[id]; if(m && !user.unlockedMaps.includes(id) && spend(m.price)){ user.unlockedMaps.push(id); user.currentMap = id; WZ.toast(m.name + " unlocked!", "good"); ui.saveUser(); openMaps(); } },
    mapPlay: () => { ui.closeModal(); ui.startGame(); },
    charBuy: id => { const c = WZ.CHARACTERS[id]; if(spend(c.price)){ user.ownedCharacters.push(id); user.character = id; user.xp += 10; WZ.toast(c.name + " unlocked!", "good"); commit(); } },
    charEquip: id => { user.character = id; commit(); },
    weaponBuy: id => { const w = WZ.WEAPONS[id]; if(spend(w.price)){ user.ownedWeapons.push(id); user.weapon = id; user.xp += 10; WZ.toast(w.name + " unlocked!", "good"); commit(); } },
    weaponEquip: id => { user.weapon = id; commit(); },
    skinBuy: id => { const s = WZ.SKINS[id]; if(spend(s.price)){ user.ownedSkins.push(id); user.skin[s.weapon] = id; user.xp += 5; WZ.toast(s.name + " skin unlocked!", "good"); commit(); } },
    skinEquip: id => { user.skin[WZ.SKINS[id].weapon] = id; commit(); },
    upgBuy: id => { const u = WZ.UPGRADES.find(x => x.id === id), lvl = WZ.safeInt(user.upgrades[id]); if(u && spend(upgPrice(u, lvl))){ user.upgrades[id] = lvl + 1; user.xp += 10; commit(); } },
    claimMission: () => {
        const m = WZ.MISSIONS[user.missionIndex % WZ.MISSIONS.length];
        if(missionProgress(m) < m.goal) return;
        user.coins += m.reward; user.missionIndex++; user.missionProgress = 0;
        WZ.toast("+" + m.reward + " coins", "good"); ui.saveUser(); updateHome(); openMissions();
    },
    claimDaily: () => {
        const { d, can, streak } = dailyState(); if(!can) return;
        const r = DAILY[streak % 7]; user.coins += r; d.last = todayStr(); d.streak = streak + 1;
        WZ.toast("+" + r + " coins", "good"); ui.saveUser(); updateHome(); openReward();
    },
    sendGift: () => {
        const target = WZ.normalizeId($("giftTarget").value), amount = WZ.safeInt($("giftAmount").value);
        const users = WZ.store.getUsers();
        if(!users[target]) return WZ.toast("Player ID not found", "bad");
        if(target === user.id) return WZ.toast("You cannot gift yourself", "bad");
        if(amount <= 0) return WZ.toast("Enter a valid amount", "bad");
        if(user.coins < amount) return WZ.toast("Not enough coins", "bad");
        user.coins -= amount; users[target].coins = WZ.safeInt(users[target].coins) + amount; users[user.id] = user;
        WZ.store.saveUsers(users); WZ.toast(amount + " coins sent to " + target, "good"); ui.closeModal();
    },
    toggle: k => { WZ.settings[k] = !WZ.settings[k]; WZ.saveSettings(); ui.openSettings(); },
    blood: v => { WZ.settings.blood = +v; WZ.saveSettings(); ui.openSettings(); },
    adminUnlock: async () => {
        const entered = $("adminPass").value;
        const hash = await WZ.sha256(entered);
        if(!isAdmin() || !CFG.ADMIN_PASSCODE_HASH || hash !== CFG.ADMIN_PASSCODE_HASH){
            const m = $("adminGateMsg"); if(m) m.textContent = "Wrong passcode.";
            return;
        }
        adminUnlocked = true; openAdmin();
    },
    adm: v => {
        if(!isAdmin() || !adminUnlocked) return;
        if(v === "coins1k") user.coins += 1000;
        if(v === "coins100k") user.coins += 100000;
        if(v === "unlock"){ user.ownedCharacters = Object.keys(WZ.CHARACTERS); user.ownedWeapons = Object.keys(WZ.WEAPONS); user.ownedSkins = Object.keys(WZ.SKINS); }
        if(v === "upg") WZ.UPGRADES.forEach(u => user.upgrades[u.id] = 10);
        if(v === "reset"){ const id = user.id, pw = user.pw; user = WZ.newUser(id, pw); }
        ui.saveUser(); updateHome(); openAdmin();
    }
};

/* ---------------------------------------------------------
   BOOT
--------------------------------------------------------- */
ui.boot = async function(){
    // wire static buttons
    $("loginBtn").onclick = () => doAuth(false);
    $("registerBtn").onclick = () => doAuth(true);
    ["authId", "authPw"].forEach(i => $(i).addEventListener("keydown", e => { if(e.key === "Enter") doAuth(false); }));
    $("logoutBtn").onclick = logout;
    $("playBtn").onclick = () => ui.startGame();
    $("shopBtn").onclick = () => openShop();
    $("missionsBtn").onclick = openMissions;
    $("mapsBtn").onclick = openMaps;
    $("rewardBtn").onclick = openReward;
    $("giftBtn").onclick = openGift;
    $("multiBtn").onclick = openMulti;
    $("helpBtn").onclick = openHelp;
    $("adminBtn").onclick = openAdmin;
    $("settingsBtn").onclick = ui.openSettings;
    $("modalClose").onclick = ui.closeModal;
    $("modal").addEventListener("pointerdown", e => { if(e.target === $("modal")) ui.closeModal(); });
    document.addEventListener("keydown", e => { if(e.key === "Escape" && ui.modalOpen()){ ui.closeModal(); e.stopPropagation(); } }, true);
    document.addEventListener("click", e => {
        const el = e.target.closest("[data-act]"); if(!el) return;
        const fn = A[el.dataset.act]; if(fn) fn(el.dataset.arg, el);
    });

    // load art with progress
    await WZ.assets.load(p => { $("loadFill").style.width = Math.round(p * 100) + "%"; });
    WZ.zombie.bakeAll();
    $("loading").classList.add("hidden");

    // resume session
    const s = WZ.store.getSession(), users = WZ.store.getUsers();
    if(s && users[s.id]){ user = WZ.normalizeUser(users[s.id]); ui.showHome(); }
    else show("auth");
};
})();
