/* =========================================================
   ONLINE CO-OP: connection, online login, rooms and lobby.
   Talks to server/server.js over WebSocket. The server owns the
   match and the online wallet; this file only shows what it sends.
========================================================= */
(function(){
const WZ = window.WZ, CFG = WZ.CONFIG, $ = WZ.$;

const net = { ws: null, acct: null, wallet: 0, code: null, playerId: null, host: false, lobby: [], inMatch: false, duelQueue: false, duel: false };
const globalSyncKeys = new Map();
let lastLeaderboardRequest = 0;
const handlers = {};

function say(text, ok){
    const el = $("onMsg");
    if(el){ el.textContent = text; el.classList.toggle("ok", !!ok); }
    else WZ.toast(text, ok ? "good" : "bad");
}

function send(obj){
    if(net.ws && net.ws.readyState === 1){ net.ws.send(JSON.stringify(obj)); return true; }
    return false;
}

function syncGlobalUser(u){
    if(!u || !u.id || !u.pw) return;
    const data = {
        type: "GLOBAL_SYNC", id: u.id, credential: u.pw,
        bestScore: WZ.safeInt(u.bestScore), level: WZ.safeInt(u.level, 1),
        kills: WZ.safeInt(u.kills), wave: WZ.safeInt(u.wave, 1),
        xp: WZ.safeInt(u.xp), coins: WZ.safeInt(u.coins),
        loadout: {
            ownedCharacters: u.ownedCharacters || [], character: u.character,
            ownedWeapons: u.ownedWeapons || [], weapon: u.weapon,
            ownedSkins: u.ownedSkins || [], skin: u.skin || {},
            titles: u.titles || [], title: u.title,
            upgrades: u.upgrades || {},
            unlockedMaps: u.unlockedMaps || [], currentMap: u.currentMap
        }
    };
    const key = JSON.stringify(data);
    if(globalSyncKeys.get(data.id) === key && net.ws && net.ws.readyState === 1) return;
    connect(() => { if(send(data)) globalSyncKeys.set(data.id, key); });
}

function refreshLeaderboard(force){
    const now = Date.now();
    if(!force && now - lastLeaderboardRequest < 10000) return;
    lastLeaderboardRequest = now;
    connect(() => send({ type: "GLOBAL_LEADERBOARD" }));
}

function connect(then){
    if(net.ws && net.ws.readyState === 1) return then && then();
    if(net.ws && net.ws.readyState === 0){
        net.ws.addEventListener("open", () => then && then(), { once: true });
        return;
    }
    let ws;
    try{ ws = new WebSocket(CFG.ONLINE_URL); }
    catch(e){ return say("Cannot reach the server."); }
    net.ws = ws;
    ws.onopen = () => then && then();
    ws.onmessage = e => {
        let m; try{ m = JSON.parse(e.data); }catch(err){ return; }
        const h = handlers[m.type]; if(h) h(m);
    };
    ws.onerror = () => say("Cannot reach the server. Is it running?");
    ws.onclose = () => {
        net.ws = null; net.acct = null; net.code = null; net.inMatch = false; net.duelQueue = false; net.duel = false; globalSyncKeys.clear(); lastLeaderboardRequest = 0;
        if(WZ.game.running){ WZ.toast("Connection lost", "bad"); WZ.game.quit(); }
        else if(WZ.ui.modalOpen()) say("Disconnected from the server.");
    };
}

/* ---------- screens ---------- */
function loginView(){
    return `<div class="infoCard"><h3>ONLINE CO-OP</h3>
        <p>Log in to an online account to play with friends. Your online wallet is separate from the coins on this device.</p></div>
        <div class="field"><label for="onId">ONLINE ID</label>
            <input id="onId" maxlength="16" autocapitalize="characters" spellcheck="false" autocomplete="username"></div>
        <div class="field"><label for="onPw">PASSWORD</label>
            <input id="onPw" type="password" maxlength="32" autocomplete="current-password"></div>
        <div class="row"><button class="primary" data-on="login">LOGIN</button><button class="ghost" data-on="register">CREATE ACCOUNT</button></div>
        <div id="onMsg" class="authMsg"></div>`;
}

function roomView(){
    return `<div class="infoCard"><h3>ONLINE WALLET</h3><p>🪙 <b>${WZ.fmt(net.wallet)}</b> &nbsp;·&nbsp; ${WZ.esc(net.acct)}</p></div>
        <div class="infoCard"><h3>⚔ ONLINE 1v1</h3><p>Fight another player from any device. No zombies. Four rounds. First to 3 round wins takes the match.</p><p>Round win: +10 coins · Round loss: +5 coins · Match win: +50 bonus coins.</p></div>
        <button class="primary claim" data-on="duel">⚔ FIND 1v1 MATCH</button>
        <button class="primary claim" data-on="create">CREATE CO-OP ROOM</button>
        <div class="field" style="margin-top:12px"><label for="onCode">ROOM CODE</label>
            <input id="onCode" maxlength="6" autocapitalize="characters" spellcheck="false"></div>
        <button class="claim" data-on="join">JOIN ROOM</button>
        <div id="onMsg" class="authMsg"></div>`;
}

function lobbyView(){
    const names = net.lobby.map(p => `<p>${WZ.esc(p.name)} · ${WZ.esc(p.character)}</p>`).join("");
    return `<div class="infoCard"><h3>ROOM ${WZ.esc(net.code)}</h3>
        <p>Share this code with your friends. ${net.host ? "You are the host. Start when everyone is in." : "Waiting for the host to start."}</p></div>
        <div class="infoCard"><h3>PLAYERS (${net.lobby.length}/8)</h3>${names}</div>
        ${net.host ? `<button class="primary claim" data-on="start">START MATCH</button>` : ""}
        <button class="ghost claim" data-on="leave">LEAVE ROOM</button>
        <div id="onMsg" class="authMsg"></div>`;
}

function render(){
    const view = !net.acct ? loginView() : net.duelQueue
        ? `<div class="infoCard"><h3>SEARCHING FOR 1v1 OPPONENT...</h3><p>Keep this screen open. We will match you with a player on another device.</p></div><button class="ghost claim" data-on="duelCancel">CANCEL SEARCH</button><div id="onMsg" class="authMsg"></div>`
        : !net.code ? roomView() : lobbyView();
    WZ.openModal("ONLINE", view);
}

/* ---------- button actions ---------- */
function act(a){
    const u = WZ.ui.currentUser();
    if(a === "login" || a === "register"){
        const id = ($("onId").value || "").trim(), pw = $("onPw").value || "";
        if(!id || !pw) return say("Enter an ID and a password.");
        connect(() => send({ type: a === "login" ? "LOGIN" : "REGISTER", id, pw }));
    }
    else if(a === "duel"){
        const u = WZ.ui.currentUser();
        net.duelQueue = true; render();
        send({ type:"DUEL_QUEUE", character:u.character, skin:WZ.activeSkin(u) });
    }
    else if(a === "duelCancel"){
        send({ type:"DUEL_CANCEL" }); net.duelQueue = false; render();
    }
    else if(a === "create"){
        send({ type: "CREATE_ROOM", character: u.character, skin: WZ.activeSkin(u) });
    }
    else if(a === "join"){
        const code = ($("onCode").value || "").trim().toUpperCase();
        if(code.length !== 6) return say("Room codes have 6 characters.");
        send({ type: "JOIN_ROOM", code, character: u.character, skin: WZ.activeSkin(u) });
    }
    else if(a === "start"){ send({ type: "START" }); }
    else if(a === "leave"){
        send({ type: "LEAVE" });
        net.code = null; net.lobby = []; net.host = false;
        render();
    }
}

/* ---------- server messages ---------- */
handlers.HELLO = () => {};
handlers.GLOBAL_SYNCED = m => {
    refreshLeaderboard(true);
    const users = WZ.store.getUsers(), saved = users[m.id];
    if(!saved) return;
    const oldLevel = WZ.safeInt(saved.level, 1), cloudLevel = WZ.safeInt(m.level, 1);
    const next = {
        bestScore: Math.max(WZ.safeInt(saved.bestScore), WZ.safeInt(m.best_score)),
        level: Math.max(oldLevel, cloudLevel),
        kills: Math.max(WZ.safeInt(saved.kills), WZ.safeInt(m.kills)),
        wave: Math.max(WZ.safeInt(saved.wave, 1), WZ.safeInt(m.wave, 1)),
        coins: Math.max(WZ.safeInt(saved.coins), WZ.safeInt(m.coins))
    };
    next.xp = cloudLevel > oldLevel ? WZ.safeInt(m.xp) :
        cloudLevel === oldLevel ? Math.max(WZ.safeInt(saved.xp), WZ.safeInt(m.xp)) : WZ.safeInt(saved.xp);
    const cloud = m.loadout || {};
    const union = (a,b,valid) => [...new Set([...(Array.isArray(a)?a:[]), ...(Array.isArray(b)?b:[])].filter(valid))];
    next.ownedCharacters = union(saved.ownedCharacters, cloud.ownedCharacters, id => !!WZ.CHARACTERS[id]);
    next.ownedWeapons = union(saved.ownedWeapons, cloud.ownedWeapons, id => !!WZ.WEAPONS[id]);
    next.ownedSkins = union(saved.ownedSkins, cloud.ownedSkins, id => !!WZ.SKINS[id]);
    next.titles = union(saved.titles, cloud.titles, id => WZ.TITLES.some(t => t.id === id));
    next.unlockedMaps = union(saved.unlockedMaps, cloud.unlockedMaps, id => !!WZ.MAPS[id]);
    next.skin = { ...(saved.skin || {}), ...(cloud.skin || {}) };
    Object.keys(next.skin).forEach(w => {
        const id = next.skin[w];
        if (!WZ.WEAPONS[w] || !WZ.SKINS[id] || WZ.SKINS[id].weapon !== w || !next.ownedSkins.includes(id)) delete next.skin[w];
    });
    next.upgrades = { ...(saved.upgrades || {}) };
    Object.entries(cloud.upgrades || {}).forEach(([id,v]) => {
        if (WZ.UPGRADES.some(x => x.id === id)) next.upgrades[id] = Math.max(WZ.safeInt(next.upgrades[id]), WZ.safeInt(v));
    });
    next.character = next.ownedCharacters.includes(cloud.character) ? cloud.character : saved.character;
    next.weapon = next.ownedWeapons.includes(cloud.weapon) ? cloud.weapon : saved.weapon;
    next.title = next.titles.includes(cloud.title) ? cloud.title : saved.title;
    next.currentMap = next.unlockedMaps.includes(cloud.currentMap) ? cloud.currentMap : saved.currentMap;
    const changed = Object.keys(next).some(k => JSON.stringify(saved[k]) !== JSON.stringify(next[k]));
    if(!changed) return;
    Object.assign(saved, next);
    users[m.id] = WZ.normalizeUser(saved);
    WZ.store.saveUsers(users);
    const current = WZ.ui.currentUser();
    if(current && current.id === m.id) {
        Object.assign(current, next);
        WZ.ui.showHome();
    }
};
handlers.GLOBAL_SYNC_ERROR = m => WZ.toast(m.message || "Global leaderboard sync failed", "bad");
handlers.GLOBAL_LEADERBOARD = m => {
    if(WZ.ui && WZ.ui.renderLeaderboard) WZ.ui.renderLeaderboard(m.players || []);
};
handlers.REGISTERED = () => say("Account created. Now log in.", true);
handlers.AUTHED = m => {
    net.acct = m.id; net.wallet = m.coins; render();
    const u = WZ.ui.currentUser();
    if(u && Array.isArray(m.titles)){
        let changed = false;
        m.titles.forEach(id=>{ if(WZ.TITLES.some(t=>t.id===id) && !u.titles.includes(id)){ u.titles.push(id); changed=true; } });
        if(changed) WZ.ui.saveUser(u);
    }
};
handlers.JOINED = m => { net.code = m.code; net.playerId = m.playerId; net.host = m.host; render(); };
handlers.LOBBY = m => {
    net.code = m.code; net.host = m.host === net.acct; net.lobby = m.players;
    if(!net.inMatch) render();
};
handlers.DUEL_QUEUED = m => say(m.message || "Searching for an opponent...");
handlers.DUEL_CANCELLED = () => { net.duelQueue = false; render(); };
handlers.DUEL_FOUND = m => {
    net.duelQueue = false; net.duel = true; net.inMatch = true;
    net.playerId = m.playerId; net.duelId = m.duelId;
    WZ.ui.closeModal();
    WZ.ui.startOnlineGame({ duel:true, duelId:m.duelId, playerId:m.playerId, account:net.acct, wallet:net.wallet });
};
handlers.DUEL_STATE = m => WZ.game.onNet(m.s);
handlers.DUEL_ROUND_OVER = m => WZ.game.onDuelRound(m);
handlers.DUEL_OVER = m => {
    net.inMatch = false; net.duel = false; net.wallet = m.wallet || net.wallet;
    WZ.game.onDuelOver(m);
};
handlers.MATCH_START = () => {
    net.inMatch = true;
    WZ.ui.closeModal();
    WZ.ui.startOnlineGame({ code: net.code, playerId: net.playerId });
};
handlers.STATE = m => WZ.game.onNet(m.s);
handlers.MATCH_OVER = m => {
    if(m.result) net.wallet = m.result.wallet;
    if(m.left){
        if(m.result && m.result.coins) WZ.toast(`+${m.result.coins} coins in your online wallet`, "good");
        return;
    }
    net.inMatch = false;
    // the server already paid out and closes the room; leave it so the next room can be made
    send({ type: "LEAVE" });
    net.code = null; net.lobby = [];
    WZ.game.onMatchOver(m);
};
handlers.ERROR = m => {
    if(WZ.ui.modalOpen()) say(m.message); else WZ.toast(m.message, "bad");
};

/* ---------- public ---------- */
WZ.online = {
    open(){ render(); },
    init(){
        $("modalBody").addEventListener("click", e => {
            const b = e.target.closest("[data-on]"); if(b) act(b.dataset.on);
        });
    },
    send,
    syncGlobalUser,
    refreshLeaderboard,
    get inMatch(){ return net.inMatch; },
    get wallet(){ return net.wallet; },
    get inDuel(){ return net.duel; }
};
WZ.online.init();
})();
