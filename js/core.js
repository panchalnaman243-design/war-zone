/* =========================================================
   CORE  -  helpers, storage, settings, audio, haptics
========================================================= */
(function(){
const WZ = window.WZ;
const CFG = WZ.CONFIG;

/* ---------- small helpers ---------- */
WZ.$ = id => document.getElementById(id);
WZ.rand = (a, b) => a + Math.random() * (b - a);
WZ.randInt = (a, b) => Math.floor(WZ.rand(a, b + 1));
WZ.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
WZ.safeInt = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
WZ.normalizeId = v => String(v || "").trim().toUpperCase().replace(/\s+/g, "");
WZ.esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
WZ.fmt = n => Number(n).toLocaleString("en-US");
WZ.isTouch = (window.matchMedia && matchMedia("(pointer:coarse)").matches) || "ontouchstart" in window;

/* ---------- storage (never throws) ---------- */
function lsGet(k, fallback){
    try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); }
    catch(e){ return fallback; }
}
function lsSet(k, v){
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch(e){ console.warn("storage full / blocked", e); return false; }
}
WZ.store = {
    getUsers(){ const d = lsGet(CFG.STORAGE.users, {}); return d && typeof d === "object" ? d : {}; },
    saveUsers(u){ lsSet(CFG.STORAGE.users, u); },
    getSession(){ return lsGet(CFG.STORAGE.current, null); },
    setSession(u){ lsSet(CFG.STORAGE.current, u ? { id: u.id } : null); },
    raw: { get: k => { try { return localStorage.getItem(k); } catch(e){ return null; } },
           set: (k, v) => { try { localStorage.setItem(k, v); } catch(e){} } }
};

/* ---------- user model ---------- */
WZ.newUser = function(id, pwHash){
    return WZ.normalizeUser({ id, pw: pwHash });
};

/* Fills every field, migrating old saves (incl. the pre-skin V4 format). */
WZ.normalizeUser = function(u){
    u = u || {};
    const E = CFG.ECONOMY;
    u.coins = WZ.safeInt(u.coins, E.startCoins);
    u.score = WZ.safeInt(u.score); u.bestScore = WZ.safeInt(u.bestScore);
    u.xp = WZ.safeInt(u.xp); u.level = Math.max(1, WZ.safeInt(u.level, 1));
    u.wave = Math.max(1, WZ.safeInt(u.wave, 1)); u.kills = WZ.safeInt(u.kills);
    u.weapon = WZ.WEAPONS[u.weapon] ? u.weapon : "pistol";
    u.character = WZ.CHARACTERS[u.character] ? u.character : "civilian";
    u.unlockedMaps = Array.isArray(u.unlockedMaps) ? u.unlockedMaps.filter(m => WZ.MAPS[m]) : [];
    if(!u.unlockedMaps.includes("city")) u.unlockedMaps.push("city");
    u.currentMap = u.unlockedMaps.includes(u.currentMap) ? u.currentMap : "city";
    u.ownedWeapons = Array.isArray(u.ownedWeapons) ? u.ownedWeapons.filter(w => WZ.WEAPONS[w]) : [];
    if(!u.ownedWeapons.includes("pistol")) u.ownedWeapons.push("pistol");
    u.ownedCharacters = Array.isArray(u.ownedCharacters) ? u.ownedCharacters.filter(c => WZ.CHARACTERS[c]) : [];
    if(!u.ownedCharacters.includes("civilian")) u.ownedCharacters.push("civilian");
    u.upgrades = u.upgrades && typeof u.upgrades === "object" ? u.upgrades : {};
    u.adminPowerUnlocked = !!u.adminPowerUnlocked;
    u.missionIndex = WZ.safeInt(u.missionIndex); u.missionProgress = WZ.safeInt(u.missionProgress);
    u.puzzlesSolved = WZ.safeInt(u.puzzlesSolved); u.bossKills = WZ.safeInt(u.bossKills);
    u.titles = Array.isArray(u.titles) ? u.titles.filter(t => WZ.TITLES.some(x => x.id === t)) : [];
    u.title = u.titles.includes(u.title) ? u.title : null;
    u.claimedMissions = Array.isArray(u.claimedMissions) ? u.claimedMissions : [];
    // skins
    u.ownedSkins = Array.isArray(u.ownedSkins) ? u.ownedSkins.filter(s => WZ.SKINS[s]) : [];
    Object.keys(WZ.WEAPONS).forEach(w => { const d = WZ.defaultSkin(w); if(!u.ownedSkins.includes(d)) u.ownedSkins.push(d); });
    u.skin = u.skin && typeof u.skin === "object" ? u.skin : {};
    Object.keys(WZ.WEAPONS).forEach(w => {
        const s = u.skin[w];
        if(!s || !WZ.SKINS[s] || WZ.SKINS[s].weapon !== w || !u.ownedSkins.includes(s)) u.skin[w] = WZ.defaultSkin(w);
    });
    return u;
};

WZ.activeSkin = u => u.skin[u.weapon] || WZ.defaultSkin(u.weapon);

/* ---------- password hashing (SHA-256, falls back to a weak hash if WebCrypto is missing) ---------- */
WZ.hashPw = async function(id, pw){
    const text = "warzone::" + id + "::" + pw;
    try{
        if(window.crypto && crypto.subtle){
            const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
        }
    }catch(e){}
    let h = 2166136261;
    for(let i = 0; i < text.length; i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return "f" + (h >>> 0).toString(16);
};

/* Generic SHA-256 hex digest, used for the admin passcode (see ui.js -> openAdmin).
   Run  await WZ.sha256("your secret phrase")  in the browser console to generate
   the value that goes into CONFIG.ADMIN_PASSCODE_HASH - never put the plain phrase in the code. */
WZ.sha256 = async function(text){
    try{
        if(window.crypto && crypto.subtle){
            const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
        }
    }catch(e){}
    let h = 2166136261;
    for(let i = 0; i < text.length; i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return "f" + (h >>> 0).toString(16);
};

/* ---------- settings ---------- */
const DEFAULT_SETTINGS = { sound: true, volume: 0.7, vibration: true, blood: 2, dmgNumbers: true, screenShake: true };
WZ.settings = Object.assign({}, DEFAULT_SETTINGS, lsGet(CFG.STORAGE.settings, {}));
WZ.saveSettings = () => lsSet(CFG.STORAGE.settings, WZ.settings);

/* ---------- haptics ---------- */
WZ.haptic = function(ms){
    if(!WZ.settings.vibration) return;
    try{
        const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
        if(cap && cap.vibrate){ cap.vibrate({ duration: ms }); return; }
        if(navigator.vibrate) navigator.vibrate(ms);
    }catch(e){}
};

/* ---------- toast ---------- */
let toastTimer = 0;
WZ.toast = function(msg, kind){
    const el = WZ.$("toast"); if(!el) return;
    el.textContent = msg; el.className = "show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ""; }, 2400);
};

/* =========================================================
   AUDIO  -  100% synthesized (no audio files required)
========================================================= */
const Sfx = WZ.sfx = {
    ctx: null, master: null, noise: null, last: {},
    init(){
        if(this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) return;
        try{
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = WZ.settings.volume;
            this.master.connect(this.ctx.destination);
            const len = this.ctx.sampleRate;
            this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const d = this.noise.getChannelData(0);
            for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }catch(e){ this.ctx = null; }
    },
    resume(){ this.init(); if(this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    setVolume(v){ if(this.master) this.master.gain.value = v; },
    ok(key, gap){
        if(!WZ.settings.sound || !this.ctx) return false;
        const n = performance.now();
        if(key && this.last[key] && n - this.last[key] < (gap || 0)) return false;
        if(key) this.last[key] = n;
        return true;
    },
    /* filtered noise burst */
    burst(o){
        const c = this.ctx, t = c.currentTime + (o.delay || 0);
        const src = c.createBufferSource(); src.buffer = this.noise;
        src.playbackRate.value = o.rate || 1;
        const f = c.createBiquadFilter(); f.type = o.type || "lowpass"; f.Q.value = o.q || 0.7;
        f.frequency.setValueAtTime(o.f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1 || o.f0), t + o.dur);
        const g = c.createGain(); g.gain.setValueAtTime(o.gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + o.dur);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.02);
    },
    tone(o){
        const c = this.ctx, t = c.currentTime + (o.delay || 0);
        const osc = c.createOscillator(); osc.type = o.type || "sine";
        osc.frequency.setValueAtTime(o.f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 || o.f0), t + o.dur);
        const g = c.createGain(); g.gain.setValueAtTime(o.gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + o.dur);
        osc.connect(g); g.connect(this.master); osc.start(t); osc.stop(t + o.dur + 0.02);
    },
    shot(w){
        if(!this.ok("shot", 25)) return;
        const P = {
            pistol:  () => { this.burst({ type: "bandpass", f0: 2400, f1: 500, dur: .13, gain: .55, q: .8 }); this.tone({ f0: 170, f1: 55, dur: .12, gain: .5 }); },
            rifle:   () => { this.burst({ type: "bandpass", f0: 2000, f1: 350, dur: .16, gain: .6,  q: .7 }); this.tone({ f0: 130, f1: 45, dur: .14, gain: .6 }); },
            smg:     () => { this.burst({ type: "bandpass", f0: 2800, f1: 700, dur: .09, gain: .38, q: .9 }); this.tone({ f0: 210, f1: 80, dur: .07, gain: .3 }); },
            shotgun: () => { this.burst({ type: "lowpass",  f0: 1800, f1: 120, dur: .34, gain: .95 }); this.tone({ f0: 100, f1: 30, dur: .28, gain: .8 }); this.burst({ type: "bandpass", f0: 900, f1: 200, dur: .5, gain: .25, delay: .06 }); },
            sniper:  () => { this.burst({ type: "lowpass",  f0: 3200, f1: 100, dur: .5, gain: 1 });   this.tone({ f0: 90, f1: 25, dur: .45, gain: .9 }); this.burst({ type: "bandpass", f0: 700, f1: 150, dur: .8, gain: .3, delay: .09 }); },
            lmg:     () => { this.burst({ type: "bandpass", f0: 1500, f1: 300, dur: .12, gain: .6, q: .6 }); this.tone({ f0: 100, f1: 38, dur: .12, gain: .65 }); }
        };
        (P[w] || P.pistol)();
    },
    hit(){ if(!this.ok("hit", 35)) return; this.burst({ type: "lowpass", f0: 900, f1: 200, dur: .09, gain: .5 }); this.tone({ f0: 110, f1: 45, dur: .1, gain: .35 }); },
    kill(){ if(!this.ok("kill", 60)) return; this.burst({ type: "lowpass", f0: 700, f1: 90, dur: .28, gain: .6 }); this.tone({ f0: 140, f1: 30, dur: .3, gain: .45, type: "sawtooth" }); },
    groan(){ if(!this.ok("groan", 700)) return; const f = WZ.rand(70, 110); this.tone({ type: "sawtooth", f0: f, f1: f * .6, dur: .55, gain: .09 }); },
    hurt(){ if(!this.ok("hurt", 120)) return; this.tone({ type: "square", f0: 220, f1: 70, dur: .18, gain: .22 }); this.burst({ type: "lowpass", f0: 1200, f1: 200, dur: .16, gain: .4 }); },
    reload(){ if(!this.ok("reload", 200)) return; this.burst({ type: "highpass", f0: 2500, f1: 2500, dur: .05, gain: .5 }); this.burst({ type: "highpass", f0: 1800, f1: 1800, dur: .07, gain: .6, delay: .32 }); this.tone({ f0: 300, f1: 200, dur: .05, gain: .2, delay: .32 }); },
    empty(){ if(!this.ok("empty", 200)) return; this.burst({ type: "highpass", f0: 3000, f1: 3000, dur: .03, gain: .4 }); },
    wave(){ if(!this.ok("wave", 500)) return; [440, 554, 659, 880].forEach((f, i) => this.tone({ type: "triangle", f0: f, f1: f, dur: .22, gain: .22, delay: i * .09 })); },
    pickup(){ if(!this.ok("pickup", 80)) return; this.tone({ type: "triangle", f0: 660, f1: 990, dur: .12, gain: .25 }); },
    over(){ if(!this.ok("over", 500)) return; [330, 262, 196, 130].forEach((f, i) => this.tone({ type: "sawtooth", f0: f, f1: f * .97, dur: .35, gain: .18, delay: i * .18 })); },
    click(){ if(!this.ok("click", 30)) return; this.tone({ type: "triangle", f0: 900, f1: 700, dur: .04, gain: .12 }); }
};

/* first user gesture unlocks audio (required by browsers / iOS) */
["pointerdown", "keydown", "touchstart"].forEach(ev =>
    window.addEventListener(ev, () => Sfx.resume(), { passive: true }));
document.addEventListener("click", e => { if(e.target.closest && e.target.closest("button")) Sfx.click(); }, true);
})();

/* Awards every title the player now qualifies for. Returns the newly earned ones. */
WZ.checkTitles = function(u){
    const earned = [];
    for(const t of WZ.TITLES){
        if(!t.special && !u.titles.includes(t.id) && t.test(u)){ u.titles.push(t.id); earned.push(t); }
    }
    if(!u.title && u.titles.length) u.title = u.titles[u.titles.length - 1];
    return earned;
};
