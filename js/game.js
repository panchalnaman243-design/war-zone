/* =========================================================
   GAME ENGINE
   Canvas renderer, twin-stick + keyboard/mouse input, waves,
   zombies, bullets, pickups, blood.  World units are scaled
   from a 900px tall reference screen (S).
========================================================= */
(function(){
const WZ = window.WZ, CFG = WZ.CONFIG, $ = WZ.$;
const rand = WZ.rand, clamp = WZ.clamp;

let canvas, ctx, section;
let W = 0, H = 0, dpr = 1, S = 1, charH = 160;
let raf = 0, lastT = 0, running = false, paused = false, ended = false;
let bgCanvas = null;
const keys = {};
const mouse = { x: 0, y: 0, down: false, has: false };
const stick = {
    move: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
    aim:  { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false }
};
const STICK_R = 58;
let G = null;      // per-run state

const upg = id => WZ.safeInt(G.user.upgrades[id], 0);

/* ---------------------------------------------------------
   SETUP
--------------------------------------------------------- */
function resize(){
    if(!canvas) return;
    const r = section.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width)); H = Math.max(240, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    S = clamp(H / CFG.BASE_H, .5, 1.3);
    charH = 215 * S;
    WZ.fx.resize(W, H, dpr);
    buildBackground();
    if(G && G.player){
        G.player.x = clamp(G.player.x, charH * .3, W - charH * .3);
        G.player.y = clamp(G.player.y, minY(), H - 14);
    }
}

const minY = () => Math.max(H * .3, charH + 46 * S);

/* floor decor per arena; drawn over the palette before cracks */
function drawDecor(g, kind, P){
    g.fillStyle = P.accent; g.strokeStyle = P.accent;
    if(kind === "dunes"){
        for(let k = 0; k < 3; k++){
            const base = H * (.3 + k * .06);
            g.beginPath(); g.moveTo(0, H);
            for(let x = 0; x <= W; x += 16){ g.lineTo(x, base + Math.sin(x / (120 * S) + k * 1.7) * 18 * S); }
            g.lineTo(W, H); g.closePath(); g.globalAlpha = .55 - k * .12; g.fill(); g.globalAlpha = 1;
        }
    } else if(kind === "tombs"){
        for(let x = 30 * S, i = 0; x < W; x += 110 * S, i++){
            const y = H * (.32 + ((i * 37) % 9) / 100);
            g.beginPath(); g.moveTo(x - 14 * S, y + 40 * S); g.lineTo(x - 14 * S, y + 4 * S);
            g.arc(x, y + 4 * S, 14 * S, Math.PI, 0); g.lineTo(x + 14 * S, y + 40 * S); g.closePath(); g.globalAlpha = .6; g.fill(); g.globalAlpha = 1;
        }
    } else if(kind === "pipes"){
        for(let x = 50 * S; x < W; x += 150 * S){ g.fillRect(x, 0, 14 * S, H * .42); }
        g.fillRect(0, H * .2, W, 10 * S);
    }
}

function buildBackground(){
    const M = (G && G.map) || WZ.MAPS.city, P = M.bg;
    bgCanvas = document.createElement("canvas");
    bgCanvas.width = Math.round(W * dpr); bgCanvas.height = Math.round(H * dpr);
    const g = bgCanvas.getContext("2d");
    g.scale(dpr, dpr);
    const gr = g.createRadialGradient(W * .5, H * .55, 20, W * .5, H * .55, Math.max(W, H) * .75);
    gr.addColorStop(0, P.c1); gr.addColorStop(.55, P.c2); gr.addColorStop(1, P.c3);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // perspective-ish floor grid
    g.strokeStyle = P.grid; g.lineWidth = 1;
    const gy0 = H * .22;
    for(let y = gy0; y < H; y += 46 * S){ g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for(let x = -W; x < W * 2; x += 62 * S){ g.beginPath(); g.moveTo(x, H); g.lineTo(W / 2 + (x - W / 2) * .55, gy0); g.stroke(); }
    drawDecor(g, M.decor, P);
    // cracks / debris
    g.strokeStyle = P.crack; g.lineWidth = 2;
    for(let i = 0; i < 14; i++){
        let x = rand(0, W), y = rand(H * .25, H);
        g.beginPath(); g.moveTo(x, y);
        for(let j = 0; j < 4; j++){ x += rand(-40, 40) * S; y += rand(-14, 20) * S; g.lineTo(x, y); }
        g.stroke();
    }
    // vignette
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .8);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
}

function initOnce(){
    if(canvas) return;
    canvas = $("gameCanvas"); ctx = canvas.getContext("2d");
    section = $("game");
    window.addEventListener("resize", () => { if(running) resize(); });
    window.addEventListener("orientationchange", () => setTimeout(() => running && resize(), 250));

    /* keyboard */
    window.addEventListener("keydown", e => {
        if(!running) return;
        const k = e.key.toLowerCase();
        if(["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
        if(k === "escape" || k === "p"){ paused ? resume() : pause(); return; }
        if(k === "e") drinkSerum();
        if(k === "r" && !paused) startReload();
        keys[k] = true;
    });
    window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
    window.addEventListener("blur", () => { for(const k in keys) keys[k] = false; mouse.down = false; if(running && !paused) pause(); });
    document.addEventListener("visibilitychange", () => { if(document.hidden && running && !paused) pause(); });

    /* pointer input (mouse + touch) on the play field */
    const layer = $("touchLayer");
    layer.addEventListener("contextmenu", e => e.preventDefault());
    layer.addEventListener("pointerdown", e => {
        if(!running || paused) return;
        try{ layer.setPointerCapture(e.pointerId); }catch(err){}
        const r = layer.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if(e.pointerType === "mouse"){
            mouse.x = x; mouse.y = y; mouse.has = true;
            if(e.button === 0) mouse.down = true;
            return;
        }
        WZ.isTouch = true;
        const s = x < W * .5 ? stick.move : stick.aim;
        if(s.id !== null) return;
        s.id = e.pointerId; s.ox = s.x = x; s.oy = s.y = y;
        showStick(s === stick.move ? "stickL" : "stickR", x, y, 0, 0);
        if(s === stick.aim) s.active = false;
    });
    layer.addEventListener("pointermove", e => {
        if(!running) return;
        const r = layer.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if(e.pointerType === "mouse"){ mouse.x = x; mouse.y = y; mouse.has = true; return; }
        for(const key of ["move", "aim"]){
            const s = stick[key];
            if(s.id !== e.pointerId) continue;
            s.x = x; s.y = y;
            let dx = x - s.ox, dy = y - s.oy; const d = Math.hypot(dx, dy);
            if(d > STICK_R){ dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
            if(key === "aim") s.active = d > STICK_R * .28;
            showStick(key === "move" ? "stickL" : "stickR", s.ox, s.oy, dx, dy);
        }
    });
    const up = e => {
        if(e.pointerType === "mouse"){ if(e.button === 0) mouse.down = false; return; }
        for(const key of ["move", "aim"]){
            const s = stick[key];
            if(s.id === e.pointerId){ s.id = null; s.active = false; hideStick(key === "move" ? "stickL" : "stickR"); }
        }
    };
    layer.addEventListener("pointerup", up);
    layer.addEventListener("pointercancel", up);
    layer.addEventListener("pointerleave", e => { if(e.pointerType === "mouse") mouse.has = false; });

    $("serumBtn").addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); drinkSerum(); });
    $("reloadBtn").addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); startReload(); });
    $("pauseBtn").addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); pause(); });
    $("resumeBtn").onclick = () => resume();
    $("pauseSettingsBtn").onclick = () => WZ.ui && WZ.ui.openSettings();
    $("quitBtn").onclick = () => quit();
    $("againBtn").onclick = () => { $("overOverlay").classList.add("hidden"); if(G && G.online){ exitToMenu(); } else WZ.ui.startGame(); };
    $("homeBtn").onclick = () => { $("overOverlay").classList.add("hidden"); exitToMenu(); };
}

function showStick(id, ox, oy, dx, dy){
    const el = $(id); el.classList.add("on");
    el.style.left = ox + "px"; el.style.top = oy + "px";
    el.querySelector(".knob").style.transform = `translate(${dx}px,${dy}px)`;
}
function hideStick(id){ $(id).classList.remove("on"); }

/* ---------------------------------------------------------
   RUN LIFECYCLE
--------------------------------------------------------- */
function start(user, online){
    initOnce();
    const ch = WZ.CHARACTERS[user.character], wp = WZ.WEAPONS[user.weapon];
    G = {
        user, ch, wp, skin: WZ.activeSkin(user), time: 0,
        score: 0, wave: 1, killsWave: 0, spawned: 0, need: 0, kills: 0, coinsEarned: 0,
        zombies: [], bullets: [], pickups: [],
        spawnT: 0, waveDelay: 0, bannerT: 0,
        shake: 0, hurtT: 0, recoil: 0, flashT: 0, flashAng: 0, bob: 0, squash: 0,
        nextShot: 0, reloading: null, autoReloadT: 0, noAmmoT: 0,
        aimAssist: true, lastTarget: { x: 0, y: 0 }, hud: {},
        // serum state
        serumActive: false, serumTimeLeft: 0, elem: null,
        power: 0, stock: [], brewed: [], arcs: [],
        // puzzle state
        puzzlePending: false, puzzleDone: false
    };
    G.map = WZ.MAPS[user.currentMap] || WZ.MAPS.city;
    G.online = online ? { code: online.code, playerId: online.playerId, lastMove: 0, hp: undefined } : null;
    G.remote = [];
    G.maxHp = G.online ? 100 : ch.health + upg("iron_heart") * 10;   // online: server uses 100 hp
    G.hp = G.maxHp;
    G.mag = wp.mag + upg("ammo_core") * 2;
    G.ammo = G.mag; G.reserve = wp.reserve;
    G.dmgMul = ch.damage * (1 + upg("dead_eye") * .05 + upg("war_engine") * .03);
    G.fireDelay = wp.fireRate / (1 + upg("rapid_core") * .05 + upg("war_engine") * .03);
    G.moveSpeed = 5 * ch.speed * (1 + upg("ghost_step") * .04);
    G.armor = 1 - Math.min(.6, upg("steel_skin") * .04);
    G.reloadMs = wp.reloadMs * ch.reload;
    G.scoreBonus = upg("hunter_mark") * 2;

    ended = false; paused = false; running = true;
    $("overBest").parentElement.querySelector("span").textContent = "BEST";
    ["pauseOverlay", "overOverlay", "puzzleOverlay"].forEach(i => $(i).classList.add("hidden"));
    $("puzzleOverlay").innerHTML = "";
    $("serumHud").classList.add("hidden");
    section.classList.toggle("touch", WZ.isTouch);
    resize();
    WZ.fx.reset();
    G.player = { x: W * .72, y: H * .64, facing: -1 };
    G.lastTarget = { x: W * .2, y: H * .55 };
    $("hudGun").src = `assets/guns/${G.skin}.webp`;
    $("hudGunName").textContent = wp.name;
    beginWave(true);
    hud(true);
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
}

function beginWave(first){
    G.need = 4 + G.wave * 2;
    G.killsWave = 0; G.spawned = 0; G.spawnT = 500;
    G.bossPending = G.wave % 5 === 0;
    banner(G.wave % 5 === 0 ? `WAVE ${G.wave}  -  BOSS!` : `WAVE ${G.wave}`);
    if(!first) WZ.sfx.wave();
}

function banner(text){
    const b = $("banner"); b.textContent = text;
    b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
}

function pause(){
    if(!running || paused || ended || (G && G.puzzlePending)) return;
    paused = true; cancelAnimationFrame(raf);
    mouse.down = false; stick.move.id = stick.aim.id = null; stick.aim.active = false;
    hideStick("stickL"); hideStick("stickR");
    $("pauseOverlay").classList.remove("hidden");
}
function resume(){
    if(!running || !paused) return;
    paused = false; $("pauseOverlay").classList.add("hidden");
    WZ.ui && WZ.ui.closeModal && WZ.ui.closeModal();
    lastT = performance.now(); raf = requestAnimationFrame(loop);
}
function quit(){ saveProgress(false); exitToMenu(); }
function exitToMenu(){
    if(G && G.online){ WZ.online.send({ type: "LEAVE" }); G.online = null; }
    running = false; paused = false; cancelAnimationFrame(raf);
    ["pauseOverlay", "overOverlay"].forEach(i => $(i).classList.add("hidden"));
    WZ.ui.showHome();
}

function saveProgress(dead){
    const u = G.user;
    announceTitles(WZ.checkTitles(u));
    u.score = G.score;
    u.bestScore = Math.max(u.bestScore, G.score);
    u.wave = Math.max(u.wave, G.wave);
    u.xp += G.wave * 10 + Math.floor(G.score / 50);
    WZ.ui.levelCheck(u);
    WZ.ui.saveUser(u);
}

function gameOver(){
    if(ended) return;
    ended = true; running = false;
    WZ.sfx.over(); WZ.haptic(120);
    saveProgress(true);
    $("overScore").textContent = WZ.fmt(G.score);
    $("overBest").textContent = WZ.fmt(G.user.bestScore);
    $("overWave").textContent = G.wave;
    $("overKills").textContent = G.kills;
    $("overCoins").textContent = G.coinsEarned;
    setTimeout(() => $("overOverlay").classList.remove("hidden"), 700);
    // keep rendering the death scene for a moment
    const t0 = performance.now();
    const tail = () => { if(performance.now() - t0 < 900){ render(); requestAnimationFrame(tail); } };
    tail();
}

function announceTitles(list){
    for(const t of list) WZ.toast(`🏅 TITLE UNLOCKED: ${t.name}`, "good");
}

/* ---------------------------------------------------------
   POWER & SERUMS
   POWER bar fills from puzzles (+25 win, -10 fail). Every 100
   POWER brews one of 4 elemental serums (fire, ice, lightning,
   poison), each brewed at most once per run. Up to 2 serums can
   be kept in stock. Drink one (E key or the SERUM button) for 30s:
   2.5x damage, 1.5x speed, armor, plus its element.
--------------------------------------------------------- */
const SERUM_DURATION = 30000;
const SERUM_MULT = { damage: 2.5, speed: 1.5, armorBonus: 0.3 };
const SERUM_STOCK_MAX = 2;
const POWER_WIN = 25, POWER_FAIL = -10;
const ELEMENTS = {
    fire:      { name: "FIRE",      rgb: "255,122,46",  color: "#ff7a2e" },
    ice:       { name: "ICE",       rgb: "127,216,255", color: "#7fd8ff" },
    lightning: { name: "LIGHTNING", rgb: "255,230,74",  color: "#ffe64a" },
    poison:    { name: "POISON",    rgb: "141,255,58",  color: "#8dff3a" }
};
const ELEM_ORDER = ["fire", "ice", "lightning", "poison"];

function restoreStats(){
    if(G._baseDmg   !== undefined) G.dmgMul    = G._baseDmg;
    if(G._baseSpd   !== undefined) G.moveSpeed = G._baseSpd;
    if(G._baseArmor !== undefined) G.armor     = G._baseArmor;
}

function activateSerum(id){
    if(G.serumActive) restoreStats();   // a new serum replaces the old one, never stacks
    G.serumActive = true; G.serumTimeLeft = SERUM_DURATION;
    G.elem = { id };
    G._baseDmg = G.dmgMul; G._baseSpd = G.moveSpeed; G._baseArmor = G.armor;
    G.dmgMul    *= SERUM_MULT.damage;
    G.moveSpeed *= SERUM_MULT.speed;
    G.armor      = Math.max(0, G.armor - SERUM_MULT.armorBonus);
    G.hp = G.maxHp;
    const el = ELEMENTS[id];
    WZ.fx.text(W / 2, H * .28, `⚗ ${el.name} SERUM!`, el.color, 32);
    WZ.sfx.wave(); WZ.haptic(80);
    $("serumHud").classList.remove("hidden");
    updateSerumHud();
}

function deactivateSerum(){
    restoreStats();
    G.serumActive = false; G.serumTimeLeft = 0; G.elem = null;
    $("serumHud").classList.add("hidden");
    WZ.fx.text(W / 2, H * .28, "SERUM WORN OFF", "#ff4d4d", 22);
}

function updateSerumHud(){
    const el = $("serumHud"); if(!el || !G.elem) return;
    const e = ELEMENTS[G.elem.id];
    el.querySelector("b").textContent = "⚗ " + e.name + " SERUM";
    el.querySelector("b").style.color = e.color;
    el.querySelector("span").textContent = Math.ceil(G.serumTimeLeft / 1000) + "s";
}

function addPower(n){
    if(!G) return;
    if(G.brewed.length >= ELEM_ORDER.length){ G.power = 0; return; }   // all four brewed
    G.power = Math.max(0, Math.min(100, G.power + n));
    if(G.power >= 100) tryBrew();
    hud();
}

function tryBrew(){
    if(G.stock.length >= SERUM_STOCK_MAX) return;      // bar stays full until a serum is drunk
    const left = ELEM_ORDER.filter(e => !G.brewed.includes(e));
    if(!left.length) return;
    const id = left[WZ.randInt(0, left.length - 1)];
    G.brewed.push(id); G.stock.push(id); G.power = 0;
    WZ.fx.text(W / 2, H * .28, `⚗ ${ELEMENTS[id].name} SERUM BREWED`, ELEMENTS[id].color, 24);
    WZ.sfx.pickup(); WZ.haptic(30);
}

function drinkSerum(){
    if(!G || !running || paused || ended || G.puzzlePending) return;
    if(!G.stock.length){ WZ.fx.text(W / 2, H * .28, "NO SERUM IN STOCK", "#78939d", 18); return; }
    activateSerum(G.stock.shift());
    if(G.power >= 100) tryBrew();
    hud();
}

/* elemental hit effects (run when a bullet hits while a serum is active) */
function applyElement(z, b){
    const e = G.elem.id;
    if(e === "fire") z.burn = 2400;
    else if(e === "ice") z.chill = 2200;
    else if(e === "poison") z.poison = 3500;
    else if(e === "lightning"){
        let best = null, bd = 260 * S;
        for(const o of G.zombies){
            if(o.dying || o === z) continue;
            const d = Math.hypot(o.x - z.x, (o.y - o.h * .5 - (z.y - z.h * .5)) * 1.4);
            if(d < bd){ bd = d; best = o; }
        }
        if(best){
            G.arcs.push({ x1: z.x, y1: z.y - z.h * .5, x2: best.x, y2: best.y - best.h * .5, life: 220 });
            dealDamage(best, b.dmg * .5, 0, z.x, z.y - z.h * .5);
        }
    }
}

// poison: a poisoned zombie that dies bursts into nearby zombies
function poisonSplash(z){
    for(const o of G.zombies){
        if(o.dying || o === z) continue;
        if(Math.hypot(o.x - z.x, (o.y - z.y) * 1.4) < 130 * S) dealDamage(o, z.maxhp * .2, 0, z.x, z.y - z.h * .5);
    }
}

/* ---------------------------------------------------------
   PUZZLE ENGINE: every wave ends with a HARD puzzle.
   Solve it = POWER SERUM for the next wave. Fail = no serum.
   Difficulty ramps with the wave number.
--------------------------------------------------------- */
const PUZZLE_TYPES = ["simon", "cipher", "tap", "math", "mirror", "plates"];
let pzTimers = [];

// time multiplier: tighter every wave, never below 55% of base time
const pzScale = () => Math.max(.55, 1 - (G.wave - 1) * .025);
const scaled = ms => Math.round(ms * pzScale());
const pzNote = "text-align:center;font-size:11px;color:var(--muted);margin:4px 0 8px";

function shuffle(arr){ for(let i = arr.length - 1; i > 0; i--){ const j = WZ.randInt(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

function showPuzzle(){
    const overlay = $("puzzleOverlay");
    overlay.innerHTML = "";
    overlay.classList.remove("hidden");
    // drop held keys / touch sticks so the player does not drift while solving
    for(const k in keys) keys[k] = false;
    mouse.down = false; stick.move.id = stick.aim.id = null; stick.aim.active = false;
    hideStick("stickL"); hideStick("stickR");
    const pool = (G.map && G.map.puzzles) || PUZZLE_TYPES;   // each arena has its own puzzle set
    const type = pool[WZ.randInt(0, pool.length - 1)];
    const fns = { simon: puzzleSimon, cipher: puzzleCipher, tap: puzzleTap, math: puzzleMath, mirror: puzzleMirror, plates: puzzlePlates };
    fns[type](overlay, onPuzzleWin, onPuzzleFail);
}

function closePuzzle(){
    stopAllTimers();
    const overlay = $("puzzleOverlay");
    overlay.classList.add("hidden"); overlay.innerHTML = "";
}

function onPuzzleWin(){
    if(!G || !G.puzzlePending) return;   // guards against double calls
    closePuzzle();
    G.puzzlePending = false; G.puzzleDone = true;
    G.user.puzzlesSolved = (G.user.puzzlesSolved || 0) + 1;
    announceTitles(WZ.checkTitles(G.user));
    addPower(POWER_WIN);
}

function onPuzzleFail(){
    if(!G || !G.puzzlePending) return;
    closePuzzle();
    G.puzzlePending = false; G.puzzleDone = true;
    WZ.fx.text(W / 2, H * .28, "PUZZLE FAILED: -10 POWER", "#ff4d4d", 26); WZ.haptic(60);
    addPower(POWER_FAIL);
}

function makePzCard(overlay, desc, head, body){
    const card = document.createElement("div"); card.className = "pzCard";
    card.innerHTML = `<div class="pzTitle">⚠ WAVE CHALLENGE · WAVE ${G.wave}</div>
        <div class="pzHead">${head}</div>
        <div class="pzTimer"><i id="pzTimerFill" style="width:100%"></i></div>
        <div class="pzDesc">${desc}</div>
        <div class="pzSerum">🏆 REWARD: <b>+25 POWER</b> · 100 POWER brews an elemental serum</div>`;
    card.appendChild(body); overlay.appendChild(card);
    return card;
}

// countdown bound to the card's timer bar; every timer is registered so a win/fail can stop them all
function startCountdown(ms, onExpire){
    const fill = $("pzTimerFill"), bar = fill && fill.parentElement;
    const start = performance.now(); let handle = 0, done = false;
    const stop = () => { done = true; cancelAnimationFrame(handle); };
    pzTimers.push(stop);
    function tick(){
        if(done) return;
        const elapsed = performance.now() - start, frac = Math.max(0, 1 - elapsed / ms);
        if(fill) fill.style.width = (frac * 100) + "%";
        if(bar) bar.classList.toggle("danger", frac < .3);
        if(elapsed >= ms){ done = true; onExpire(); return; }
        handle = requestAnimationFrame(tick);
    }
    handle = requestAnimationFrame(tick);
    return stop;
}
function stopAllTimers(){ pzTimers.forEach(f => f()); pzTimers = []; }

/* PUZZLE 1: SIMON (long sequence; from wave 3 it must be typed BACKWARDS) */
function puzzleSimon(overlay, win, fail){
    const ICONS = ["🔴","🔵","🟢","🟡"];
    const len = Math.min(13, 8 + Math.floor(G.wave / 2));
    const reverse = G.wave >= 3;
    const flash = Math.max(190, 330 - G.wave * 12);
    const seq = Array.from({length: len}, () => WZ.randInt(0, 3));
    const expect = reverse ? seq.slice().reverse() : seq;
    let idx = 0, showing = true;

    const body = document.createElement("div");
    body.innerHTML = `<div class="simonGrid">${ICONS.map((ic, i) => `<button class="simonBtn" data-si="${i}">${ic}</button>`).join("")}</div>
        <p style="${pzNote}" id="simonProg">Watch carefully...</p>`;
    makePzCard(overlay,
        `Watch <b>${len} flashes</b>. ${reverse ? "Repeat them <b>BACKWARDS</b>." : "Repeat them exactly."} One mistake = fail.`,
        "SIMON SAYS", body);

    const btns = () => body.querySelectorAll(".simonBtn");
    const setDisabled = d => btns().forEach(b => b.disabled = d);
    const lightBtn = (i, on) => btns().forEach((b, bi) => b.classList.toggle("lit", bi === i && on));
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const prog = () => body.querySelector("#simonProg");

    setDisabled(true);
    (async () => {
        await wait(650);
        for(let i = 0; i < seq.length; i++){
            if(!body.isConnected) return;
            await wait(flash * .45);
            lightBtn(seq[i], true);
            await wait(flash);
            lightBtn(seq[i], false);
        }
        if(!body.isConnected) return;
        showing = false;
        prog().textContent = reverse ? `Your turn (BACKWARDS): 0 / ${len}` : `Your turn: 0 / ${len}`;
        setDisabled(false);
        startCountdown(scaled(11000), () => { showing = true; setDisabled(true); prog().textContent = "⏱ TIME!"; setTimeout(fail, 500); });
    })();

    body.addEventListener("click", e => {
        if(showing) return;
        const btn = e.target.closest("[data-si]"); if(!btn || btn.disabled) return;
        const v = +btn.dataset.si;
        lightBtn(v, true); setTimeout(() => lightBtn(v, false), 150);
        if(v !== expect[idx]){
            stopAllTimers(); showing = true; setDisabled(true);
            prog().textContent = "✗ WRONG!";
            setTimeout(fail, 700); return;
        }
        idx++;
        prog().textContent = `✓ ${idx} / ${len}`;
        if(idx === len){ stopAllTimers(); showing = true; setDisabled(true); setTimeout(win, 400); }
    });
}

/* PUZZLE 2: CIPHER CRACK (random unknown shift 2-25, long word, 1 clue) */
function puzzleCipher(overlay, win, fail){
    const WORDS = ["OUTBREAK","WARZONE","SURVIVE","EXECUTE","FORTIFY","SHADOWS","REAPER","LOCKDOWN","PHANTOM",
        "INFERNO","WARLORD","BUNKER","DETONATE","CARNAGE","HEADSHOT","ARMAGEDDON","NIGHTFALL","GRAVEYARD","BLOODLINE","ASSAULT"];
    const word  = WORDS[WZ.randInt(0, WORDS.length - 1)];
    const shift = WZ.randInt(2, 25);
    const encoded = word.split("").map(c => String.fromCharCode((c.charCodeAt(0) - 65 + shift) % 26 + 65)).join("");

    const body = document.createElement("div");
    body.innerHTML = `<div class="cipherBox">${encoded}</div>
        <p style="${pzNote}">Caesar cipher. The shift is <b>unknown</b> (2 to 25). Hint: it is a WAR ZONE word.</p>
        <input class="cipherInput" id="cipherIn" maxlength="${word.length}" placeholder="TYPE THE DECODED WORD" autocomplete="off" autocorrect="off" spellcheck="false">`;
    makePzCard(overlay, `Find the hidden shift and decode the word. Wrong guesses are not penalised, but the clock is.`, "CIPHER CRACK", body);

    setTimeout(() => { const inp = body.querySelector("#cipherIn"); if(inp) inp.focus(); }, 100);
    startCountdown(scaled(15000), () => fail());

    body.querySelector("#cipherIn").addEventListener("input", e => {
        const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
        e.target.value = v;
        if(v.length < word.length) return;
        if(v === word){ stopAllTimers(); e.target.disabled = true; setTimeout(win, 300); }
        else { e.target.classList.add("wrong"); setTimeout(() => e.target.classList.remove("wrong"), 350); e.target.value = ""; }
    });
}

/* PUZZLE 3: TAP OVERLOAD (40+ taps in a few seconds, rising every wave) */
function puzzleTap(overlay, win, fail){
    const TARGET = Math.min(75, 40 + G.wave * 2); let taps = 0;
    const body = document.createElement("div");
    body.innerHTML = `<div style="text-align:center;font-size:13px;color:var(--muted);margin-bottom:8px">Tap <b style="color:var(--gold)">${TARGET}</b> times before time runs out!</div>
        <div class="tapBar"><div class="tapFill" id="tapFill"></div></div>
        <p style="${pzNote}" id="tapCnt">0 / ${TARGET}</p>
        <button class="tapBtn" id="tapBtn">⚡ TAP!</button>`;
    makePzCard(overlay, `Spam-tap the button <b>${TARGET} times</b> in ${(scaled(7000) / 1000).toFixed(1)} seconds.`, "TAP OVERLOAD", body);

    const tapBtn = body.querySelector("#tapBtn");
    startCountdown(scaled(7000), () => fail());
    tapBtn.addEventListener("pointerdown", e => {
        e.preventDefault();
        if(tapBtn.disabled) return;
        taps++;
        body.querySelector("#tapFill").style.width = Math.min(100, taps / TARGET * 100) + "%";
        body.querySelector("#tapCnt").textContent = taps + " / " + TARGET;
        if(taps >= TARGET){ stopAllTimers(); tapBtn.disabled = true; setTimeout(win, 300); }
    });
}

/* PUZZLE 4: MATH MAYHEM (several 3-digit equations, each on a short clock) */
function puzzleMath(overlay, win, fail){
    const TOTAL = Math.min(10, 6 + Math.floor(G.wave / 3));
    const QTIME = scaled(5500);
    let step = 0;

    function genQ(){
        const kind = WZ.randInt(0, 3);
        let eq, ans;
        if(kind === 0){ const a = WZ.randInt(120, 990), b = WZ.randInt(120, 990); eq = `${a} + ${b}`; ans = a + b; }
        else if(kind === 1){ const a = WZ.randInt(200, 999), b = WZ.randInt(100, a - 1); eq = `${a} − ${b}`; ans = a - b; }
        else if(kind === 2){ const a = WZ.randInt(12, 39), b = WZ.randInt(12, 29); eq = `${a} × ${b}`; ans = a * b; }
        else { const b = WZ.randInt(6, 19), q = WZ.randInt(12, 45); eq = `${b * q} ÷ ${b}`; ans = q; }
        const wrongs = new Set();
        while(wrongs.size < 3){
            const near = Math.max(1, ans + WZ.randInt(-9, 9) * (WZ.randInt(0, 1) ? 1 : 10));
            if(near !== ans) wrongs.add(near);
        }
        return { eq: eq + " = ?", ans, choices: shuffle([ans, ...wrongs]) };
    }

    const body = document.createElement("div");
    body.innerHTML = `<div class="mathEq" id="mathEq">...</div><div class="mathChoices" id="mathChoices"></div>
        <p style="${pzNote}" id="mathStep"></p>`;
    makePzCard(overlay, `Solve <b>${TOTAL} equations</b>, ${(QTIME / 1000).toFixed(1)}s each. One wrong or late answer = fail!`, "MATH MAYHEM", body);

    function showQ(){
        stopAllTimers();
        if(step >= TOTAL){ setTimeout(win, 300); return; }
        const q = genQ();
        body.querySelector("#mathEq").textContent = q.eq;
        body.querySelector("#mathStep").textContent = (step + 1) + " / " + TOTAL;
        const grid = body.querySelector("#mathChoices");
        grid.innerHTML = q.choices.map(c => `<button class="mathChoice" data-v="${c}">${c}</button>`).join("");
        const all = () => grid.querySelectorAll(".mathChoice");
        all().forEach(btn => btn.addEventListener("click", () => {
            stopAllTimers();
            all().forEach(b => b.disabled = true);
            if(+btn.dataset.v === q.ans){ btn.classList.add("correct"); step++; setTimeout(showQ, 260); }
            else { btn.classList.add("wrong"); setTimeout(fail, 440); }
        }));
        startCountdown(QTIME, () => { all().forEach(b => b.disabled = true); setTimeout(fail, 300); });
    }
    showQ();
}

/* PUZZLE 6: PLATE PATH (a safe path flashes one plate at a time; step the same path, avoid the traps) */
function puzzlePlates(overlay, win, fail){
    const N = 4;
    const len = Math.min(9, 4 + Math.floor(G.wave / 3));
    const path = [], safe = new Set();
    while(path.length < len){ const c = WZ.randInt(0, N * N - 1); if(!safe.has(c)){ safe.add(c); path.push(c); } }
    let step = 0, live = false;

    const body = document.createElement("div");
    body.innerHTML = `<div class="plateGrid" id="plateGrid"></div>
        <p style="${pzNote}" id="plateProg">Watch the safe path...</p>`;
    makePzCard(overlay, `Remember the <b>${len} safe plates</b> and step on them in the same order. Any other plate is a trap.`, "PLATE PATH", body);

    const grid = body.querySelector("#plateGrid");
    for(let i = 0; i < N * N; i++){
        const d = document.createElement("button");
        d.className = "plate"; d.dataset.i = i; d.disabled = true; grid.appendChild(d);
    }
    const plates = [...grid.children];
    const wait = ms => new Promise(r => setTimeout(r, ms));

    (async () => {
        await wait(500);
        const flash = Math.max(380, 720 - G.wave * 15);
        for(let i = 0; i < path.length; i++){
            if(!body.isConnected) return;
            plates[path[i]].classList.add("safeHint");
            await wait(flash);
            plates[path[i]].classList.remove("safeHint");
            await wait(160);
        }
        if(!body.isConnected) return;
        live = true;
        plates.forEach(d => d.disabled = false);
        body.querySelector("#plateProg").textContent = `Your turn: 0 / ${len}`;
        startCountdown(scaled(12000), () => { plates.forEach(d => d.disabled = true); setTimeout(fail, 400); });
    })();

    grid.addEventListener("click", e => {
        const d = e.target.closest(".plate");
        if(!live || !d || d.disabled) return;
        const i = +d.dataset.i;
        if(i !== path[step]){
            live = false; stopAllTimers();
            d.classList.add("trap"); plates.forEach(x => x.disabled = true);
            body.querySelector("#plateProg").textContent = "✗ TRAP!";
            setTimeout(fail, 500); return;
        }
        step++;
        d.classList.add("done"); d.disabled = true;
        body.querySelector("#plateProg").textContent = `✓ ${step} / ${len}`;
        if(step === len){ live = false; stopAllTimers(); setTimeout(win, 300); }
    });
}

/* PUZZLE 5: PATTERN MIRROR (6x6, right half must mirror the visible left half) */
function puzzleMirror(overlay, win, fail){
    const COLS = 6, ROWS = 6, HALF = 3, TOTAL = COLS * ROWS;
    const left = Array.from({length: TOTAL}, (_, i) => i % COLS < HALF && Math.random() < .5);
    // target for every cell: left half is shown, right half mirrors it
    const target = Array.from({length: TOTAL}, (_, i) => {
        const r = Math.floor(i / COLS), c = i % COLS;
        return c < HALF ? left[i] : left[r * COLS + (COLS - 1 - c)];
    });
    const player = Array.from({length: TOTAL}, (_, i) => i % COLS < HALF ? left[i] : false);

    const body = document.createElement("div");
    body.innerHTML = `<div class="pmGrid" id="pmGrid" style="grid-template-columns:repeat(${COLS},1fr)"></div>
        <p style="${pzNote}">Tap to toggle the RIGHT side (locked left side is the mirror source). All ${ROWS * (COLS - HALF)} right cells must match.</p>`;
    makePzCard(overlay, `Mirror the left side onto the <b>right side</b> exactly. Every right cell must be correct.`, "PATTERN MIRROR", body);

    const grid = body.querySelector("#pmGrid");
    for(let i = 0; i < TOTAL; i++){
        const cell = document.createElement("div");
        cell.className = "pmCell" + (player[i] ? " on" : "");
        if(i % COLS < HALF) cell.classList.add("locked");
        else cell.dataset.idx = i;
        grid.appendChild(cell);
    }

    startCountdown(scaled(16000), () => fail());

    grid.addEventListener("click", e => {
        const cell = e.target.closest("[data-idx]"); if(!cell) return;
        const i = +cell.dataset.idx;
        player[i] = !player[i]; cell.classList.toggle("on", player[i]);
        const ok = player.every((v, idx) => idx % COLS < HALF || v === target[idx]);
        if(ok){
            stopAllTimers();
            grid.querySelectorAll(".pmCell").forEach(c => c.classList.add("correct-flash"));
            setTimeout(win, 500);
        }
    });
}

/* ---------------------------------------------------------
   MAIN LOOP
--------------------------------------------------------- */
function loop(t){
    if(!running || paused) return;
    let dt = t - lastT; lastT = t;
    if(dt > 50) dt = 50;
    G.time += dt;
    update(dt, dt / 16.667);
    render();
    raf = requestAnimationFrame(loop);
}

/* ---------------------------------------------------------
   UPDATE
--------------------------------------------------------- */
function update(dt, f){
    if(G.puzzlePending){ hud(); return; }   // world is frozen while the puzzle is open
    const P = G.player;

    /* ---- movement ---- */
    let mx = 0, my = 0;
    if(keys["a"] || keys["arrowleft"])  mx -= 1;
    if(keys["d"] || keys["arrowright"]) mx += 1;
    if(keys["w"] || keys["arrowup"])    my -= 1;
    if(keys["s"] || keys["arrowdown"])  my += 1;
    if(stick.move.id !== null){
        const dx = stick.move.x - stick.move.ox, dy = stick.move.y - stick.move.oy;
        const d = Math.hypot(dx, dy);
        if(d > STICK_R * .16){ const m = Math.min(1, d / STICK_R); mx += dx / d * m; my += dy / d * m; }
    }
    const ml = Math.hypot(mx, my);
    if(ml > 1){ mx /= ml; my /= ml; }
    const moving = ml > .05;
    P.x = clamp(P.x + mx * G.moveSpeed * S * f, charH * .3, W - charH * .3);
    P.y = clamp(P.y + my * G.moveSpeed * S * f * .8, minY(), H - 14);
    if(G.online) sendMove();
    if(moving) G.bob += .22 * f;
    const bobPx = moving ? Math.sin(G.bob * 2) * 2.4 * S : Math.sin(G.time / 520) * 1.1 * S;

    /* ---- aim target & facing ---- */
    let target = null, firing = false;
    const geo0 = WZ.fighter.geometry({ char: G.user.character, skin: G.skin, x: P.x, y: P.y, h: charH, facing: P.facing, aim: P.facing > 0 ? 0 : Math.PI, bob: bobPx });
    const pivot = geo0.anchor;
    if(stick.aim.id !== null && stick.aim.active){
        let dx = stick.aim.x - stick.aim.ox, dy = stick.aim.y - stick.aim.oy;
        let a = Math.atan2(dy, dx);
        if(G.aimAssist) a = assistAngle(pivot, a);
        target = { x: pivot.x + Math.cos(a) * 420, y: pivot.y + Math.sin(a) * 420 };
        firing = true;
    }else if(WZ.isTouch && !mouse.has){
        target = null;
    }
    if(mouse.has){ target = { x: mouse.x, y: mouse.y }; firing = mouse.down; }
    if(!target){
        if(mx !== 0 && Math.abs(mx) > .2) P.facing = mx > 0 ? 1 : -1;
        target = G.lastTarget;
        if(mx !== 0 && Math.abs(mx) > .2) target = { x: pivot.x + P.facing * 300, y: pivot.y };
    }else{
        G.lastTarget = target;
        if(Math.abs(target.x - P.x) > 6) P.facing = target.x > P.x ? 1 : -1;
    }
    G.target = target;

    /* ---- reload ---- */
    if(G.reloading){
        G.reloading.t += dt;
        const p = G.reloading.t / G.reloading.dur;
        $("reloadFill").style.width = Math.min(100, p * 100) + "%";
        if(p >= 1){
            const need = G.mag - G.ammo, take = Math.min(need, G.reserve);
            G.ammo += take; G.reserve -= take; G.reloading = null;
            $("reloadWrap").classList.remove("on");
            hud();
        }
    }else if(G.ammo === 0 && G.reserve > 0){
        G.autoReloadT += dt; if(G.autoReloadT > 220){ startReload(); }
    }else G.autoReloadT = 0;

    /* ---- shooting ---- */
    G.recoil = Math.max(0, G.recoil - 1.3 * S * f * (G.wp.recoil > 12 ? 1.4 : 1));
    G.squash *= Math.pow(.86, f); G.flashT = Math.max(0, G.flashT - dt); G.hurtT = Math.max(0, G.hurtT - dt);
    G.noAmmoT = Math.max(0, G.noAmmoT - dt);
    const aimOverride = G.reloading ? (P.facing > 0 ? .75 : Math.PI - .75) : null;
    const geo = WZ.fighter.geometry({ char: G.user.character, skin: G.skin, x: P.x, y: P.y, h: charH, facing: P.facing,
        target, aim: aimOverride, recoil: G.recoil, bob: bobPx });
    G.geo = geo; G.bobPx = bobPx;
    if(firing && !G.reloading) shoot(geo, target);

    /* ---- bullets & zombies (offline only; online the server runs them) ---- */
    if(!G.online){ updateBullets(f); spawnLogic(dt); updateZombies(dt, f); }

    /* ---- pickups ---- */
    for(let i = G.pickups.length - 1; i >= 0; i--){
        const p = G.pickups[i]; p.t += dt;
        if(p.t > 14000){ G.pickups.splice(i, 1); continue; }
        if(Math.hypot(p.x - P.x, (p.y - P.y) * 1.4) < 44 * S){
            if(p.type === "ammo"){ G.reserve += Math.ceil(G.mag * 1.2); WZ.fx.text(P.x, P.y - charH - 8, "+AMMO", "#ffd45a", 18); }
            else { G.hp = Math.min(G.maxHp, G.hp + Math.ceil(G.maxHp * .25)); WZ.fx.text(P.x, P.y - charH - 8, "+HEALTH", "#5cff9d", 18); }
            WZ.sfx.pickup(); G.pickups.splice(i, 1); hud();
        }
    }

    WZ.fx.update(f);
    G.shake = Math.max(0, G.shake - .9 * f);

    G.arcs = G.arcs.filter(a => (a.life -= dt) > 0);

    /* serum tick */
    if(G.serumActive){
        G.serumTimeLeft -= dt;
        if(G.serumTimeLeft <= 0){ deactivateSerum(); }
        else { updateSerumHud(); }
    }

    /* wave progress (offline only) */
    if(!G.online && G.killsWave >= G.need && G.zombies.every(z => z.dying)){
        // EVERY wave ends with a hard puzzle. Solve it = POWER SERUM for the next wave.
        if(CFG.FEATURES.puzzles === false) G.puzzleDone = true;
        if(!G.puzzleDone){
            if(!G.puzzlePending){ G.puzzlePending = true; showPuzzle(); }
            hud(); return;
        }

        G.waveDelay += dt;
        if(G.waveDelay > 900){
            G.waveDelay = 0;
            G.puzzleDone = false; // reset for next puzzle gate
            const reward = WZ.randInt(CFG.ECONOMY.waveCoinsMin, CFG.ECONOMY.waveCoinsMax);
            G.user.coins += reward; G.coinsEarned += reward;
            G.user.wave = Math.max(G.user.wave, G.wave + 1);
            G.wave++;
            G.reserve += Math.floor(G.wp.reserve * .3);
            G.hp = Math.min(G.maxHp, G.hp + Math.ceil(G.maxHp * .12));
            WZ.fx.text(W / 2, H * .3, `+${reward} COINS`, "#ffd45a", 26);
            WZ.ui.saveUser(G.user);
            beginWave(false); hud();
        }
    }
    hud();
}

function assistAngle(p, a){
    let best = null, bd = .16;
    for(const z of G.zombies){
        if(z.dying) continue;
        const za = Math.atan2(z.y - z.h * .5 - p.y, z.x - p.x);
        let d = Math.abs(Math.atan2(Math.sin(za - a), Math.cos(za - a)));
        if(d < bd){ bd = d; best = za; }
    }
    return best === null ? a : best;
}

/* ---------------------------------------------------------
   WEAPONS
--------------------------------------------------------- */
function startReload(){
    if(!running || paused || ended || G.reloading) return;
    if(G.ammo >= G.mag || G.reserve <= 0) return;
    G.reloading = { t: 0, dur: G.reloadMs };
    $("reloadWrap").classList.add("on"); $("reloadFill").style.width = "0%";
    WZ.sfx.reload();
}

function shoot(geo, target){
    const now = G.time;
    if(now < G.nextShot) return;
    if(G.ammo <= 0){
        G.nextShot = now + 250;
        if(G.reserve > 0) startReload(); else { WZ.sfx.empty(); G.noAmmoT = 900; }
        return;
    }
    const wp = G.wp, P = G.player;
    G.ammo--; G.nextShot = now + G.fireDelay;
    // muzzle at rest (without recoil offset) so recoil never bends aim
    const g0 = WZ.fighter.geometry({ char: G.user.character, skin: G.skin, x: P.x, y: P.y, h: charH, facing: P.facing, target, recoil: 0, bob: G.bobPx });
    const m = g0.muzzle;
    let ang = Math.hypot(target.x - m.x, target.y - m.y) > 70 ? Math.atan2(target.y - m.y, target.x - m.x) : g0.barrel;
    const dmg = wp.damage * G.dmgMul;
    if(G.online) WZ.online.send({ type: "FIRE", angle: ang });
    for(let i = 0; i < (G.online ? 0 : wp.pellets); i++){
        const sp = wp.pellets > 1 ? ((i / (wp.pellets - 1)) - .5) * wp.spread + (Math.random() - .5) * wp.spread * .3 : (Math.random() - .5) * wp.spread;
        const a = ang + sp, v = wp.speed * S * (wp.pellets > 1 ? rand(.85, 1.1) : 1);
        G.bullets.push({ x: m.x, y: m.y, px: m.x, py: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a, dmg, pierce: wp.pierce, hit: new Set(), life: 0, tr: wp.id === "sniper" ? 90 : 46 });
    }
    G.recoil = wp.recoil * S;
    G.squash = -.012 * (wp.recoil / 10);
    G.flashT = wp.id === "sniper" || wp.id === "shotgun" ? 70 : 48; G.flashAng = g0.barrel;
    if(WZ.settings.screenShake) G.shake = Math.max(G.shake, wp.shake * 1.6);
    WZ.sfx.shot(wp.id); WZ.haptic(wp.recoil > 12 ? 20 : 8);
    // eject casing
    const an = g0.anchor;
    if(wp.id !== "shotgun") WZ.fx.casing(an.x, an.y, P.y, -P.facing, wp.id === "sniper" || wp.id === "lmg");
    else if(Math.random() < .5) WZ.fx.casing(an.x, an.y, P.y, -P.facing, true);
    if(G.ammo === 0 && G.reserve > 0) G.autoReloadT = 0;
}

function updateBullets(f){
    for(let i = G.bullets.length - 1; i >= 0; i--){
        const b = G.bullets[i];
        b.px = b.x; b.py = b.y;
        const dist = Math.hypot(b.vx, b.vy) * f, steps = Math.max(1, Math.ceil(dist / 9));
        let dead = false;
        for(let s = 0; s < steps && !dead; s++){
            b.x += b.vx * f / steps; b.y += b.vy * f / steps;
            for(const z of G.zombies){
                if(z.dying || b.hit.has(z)) continue;
                const cx = z.x, cy = z.y - z.h * .5, rx = z.h * .21 * z.bulk, ry = z.h * .5;
                const nx = (b.x - cx) / rx, ny = (b.y - cy) / ry;
                if(nx * nx + ny * ny <= 1){
                    b.hit.add(z); hitZombie(z, b);
                    if(b.pierce > 0){ b.pierce--; b.dmg *= .75; }
                    else { dead = true; break; }
                }
            }
        }
        b.life += f;
        if(dead || b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80 || b.life > 120) G.bullets.splice(i, 1);
    }
}

function hitZombie(z, b){
    const ang = Math.atan2(b.vy, b.vx);
    z.kx += Math.cos(ang) * G.wp.kb * S;
    if(G.elem && !z.dying) applyElement(z, b);
    dealDamage(z, b.dmg, ang, b.x, b.y);
}

function dealDamage(z, amount, ang, sx, sy){
    if(z.dying) return;
    const px = sx === undefined ? z.x : sx, py = sy === undefined ? z.y - z.h * .5 : sy;
    z.hp -= amount; z.hit = 90; z.stagger = 140;
    const hz = clamp(z.y - py, z.h * .15, z.h * .95);
    const killed = z.hp <= 0;
    WZ.fx.blood(px, z.y, hz, ang, amount, false);
    WZ.fx.text(z.x, z.y - z.h - 6, Math.round(amount), killed ? "#ff5a4d" : "#fff", killed ? 22 : 17);
    WZ.sfx.hit(); WZ.haptic(6);
    if(killed) killZombie(z, ang);
}

function killZombie(z, ang){
    z.dying = true; z.dt = 0;
    if(z.poison > 0) poisonSplash(z);
    G.killsWave++; G.kills++;
    const base = { normal: 10, runner: 15, toxic: 20, brute: 30, boss: 200 }[z.type] || 10;
    if(z.type === "boss") WZ.toast("BOSS DOWN! +50 coins", "good");
    G.score += base + G.scoreBonus;
    const u = G.user;
    u.kills = (u.kills || 0) + 1;
    u.xp += CFG.ECONOMY.xpPerKill;
    const m = WZ.MISSIONS[u.missionIndex % WZ.MISSIONS.length];
    if(m.type === "kills") u.missionProgress++;
    if(CFG.ECONOMY.coinPerKill){
        G.coinFrac = (G.coinFrac || 0) + CFG.ECONOMY.coinPerKill;
        const whole = Math.floor(G.coinFrac);
        if(whole){ u.coins += whole; G.coinsEarned += whole; G.coinFrac -= whole; }
    }
    if(z.type === "boss"){ u.bossKills = (u.bossKills || 0) + 1; u.coins += 50; G.coinsEarned += 50; }
    // wave 100 boss: 20% chance to drop a random serum into stock (if there is room)
    if(z.type === "boss" && G.wave === 100 && Math.random() < 0.2){
        if(G.stock.length < SERUM_STOCK_MAX){
            const id = ELEM_ORDER[WZ.randInt(0, ELEM_ORDER.length - 1)];
            G.stock.push(id);
            WZ.toast(`SERUM DROP: ${ELEMENTS[id].name || id.toUpperCase()}`, "good");
        }else WZ.toast("Serum dropped, but your stock is full", "bad");
    }
    WZ.fx.blood(z.x, z.y, z.h * .55, ang, 40, true);
    WZ.sfx.kill(); WZ.haptic(z.type === "boss" ? 50 : 14);
    if(WZ.settings.screenShake) G.shake = Math.max(G.shake, z.type === "boss" ? 9 : 3);
    const r = Math.random();
    if(z.type === "boss" || r < CFG.ECONOMY.ammoDropChance) G.pickups.push({ type: "ammo", x: z.x, y: z.y, t: 0 });
    else if(r < CFG.ECONOMY.ammoDropChance + CFG.ECONOMY.healthDropChance) G.pickups.push({ type: "health", x: z.x, y: z.y, t: 0 });
    z.deathAng = ang;
}

/* ---------------------------------------------------------
   ZOMBIES
--------------------------------------------------------- */
const ZSTAT = {
    normal: { hp: 1,    sp: 1,    dmg: 7,  size: .92, bulk: 1 },
    runner: { hp: .6,   sp: 1.9,  dmg: 5,  size: .88, bulk: .8 },
    brute:  { hp: 2.6,  sp: .7,   dmg: 14, size: 1.12, bulk: 1.45 },
    toxic:  { hp: 1.3,  sp: .9,   dmg: 9,  size: .98, bulk: 1.1 },
    boss:   { hp: 14,   sp: .75,  dmg: 22, size: 1.5, bulk: 1.5 }
};

function pickType(){
    const w = G.wave, r = Math.random();
    if(w >= 5 && r < .12) return "brute";
    if(w >= 4 && r < .24) return "toxic";
    if(w >= 2 && r < .24 + Math.min(.16, w * .02)) return "runner";
    return "normal";
}

function spawnLogic(dt){
    if(G.spawned >= G.need) return;
    G.spawnT -= dt;
    const alive = G.zombies.filter(z => !z.dying).length;
    if(G.spawnT > 0 || alive >= CFG.MAX_ZOMBIES) return;
    G.spawnT = Math.max(260, 900 - G.wave * 45) * rand(.8, 1.25);
    let type = pickType();
    if(G.bossPending){ type = "boss"; G.bossPending = false; }
    const st = ZSTAT[type], w = G.wave;
    const baseHp = 35 + w * 9;
    const hp = type === "boss" ? 500 + w * 60 : baseHp * st.hp;
    const h = charH * st.size;
    const variants = WZ.ZOMBIE_TYPES[type].shirts.length;
    G.zombies.push({
        type, variant: (Math.random() * variants) | 0, bulk: st.bulk,
        x: -70 * S, y: rand(H * .34, H - 20),
        hp, maxhp: hp, h, dmg: st.dmg,
        speed: Math.min(2.4, 1 + w * .045) * st.sp,
        anim: Math.random() * 8, hit: 0, stagger: 0, kx: 0, atk: 0, atkCd: 0,
        face: 1, dying: false, dt: 0, wob: rand(0, 6)
    });
    G.spawned++;
    if(type === "boss") { banner("BOSS INCOMING!"); WZ.haptic(60); }
    WZ.sfx.groan();
}

function updateZombies(dt, f){
    const P = G.player, Z = G.zombies;
    for(let i = Z.length - 1; i >= 0; i--){
        const z = Z[i];
        if(z.dying){
            z.dt += dt; z.hit = Math.max(0, z.hit - dt);
            if(z.dt > 900){
                if(WZ.settings.blood){
                    const fr = WZ.zombie.frame(z.type, z.variant, 0);
                    WZ.fx.stampCorpse(fr, z.x, z.y, z.h / WZ.zombie.BASEH, z.face, -z.face * 1.5);
                }
                Z.splice(i, 1);
            }
            continue;
        }
        z.hit = Math.max(0, z.hit - dt); z.stagger = Math.max(0, z.stagger - dt);
        z.atkCd = Math.max(0, z.atkCd - dt); z.atk = Math.max(0, z.atk - dt);
        // elemental damage over time and chill timers
        if(z.burn > 0){ z.burn -= dt; z.hp -= z.maxhp * .0012 * f; }
        if(z.poison > 0){ z.poison -= dt; z.hp -= z.maxhp * .0016 * f; }
        if(z.chill > 0) z.chill -= dt;
        if(z.hp <= 0){ killZombie(z, 0); continue; }
        z.face = P.x >= z.x ? 1 : -1;
        const dx = P.x - z.x, dy = (P.y - z.y) * 1.5;
        const d = Math.hypot(dx, dy);
        const reach = charH * .3 * z.bulk;
        const slow = (z.stagger > 0 ? .25 : 1) * (z.chill > 0 ? .45 : 1);
        if(d > reach){
            const sp = z.speed * S * f * slow;
            z.x += dx / d * sp; z.y += clamp(P.y - z.y, -sp * .8, sp * .8);
            z.anim += z.speed * .14 * f * (z.type === "runner" ? 1.2 : 1);
        }else if(z.atkCd <= 0){
            z.atkCd = 750; z.atk = 220;
            hurtPlayer(z.dmg);
        }
        z.x += z.kx * f; z.kx *= Math.pow(.86, f);
        // soft separation
        for(let j = i - 1; j >= 0; j--){
            const o = Z[j]; if(o.dying) continue;
            const ox = z.x - o.x, oy = (z.y - o.y) * 2, od = Math.hypot(ox, oy), min = charH * .22;
            if(od > 0 && od < min){ const push = (min - od) * .08 * f; z.x += ox / od * push; z.y += oy / od * push * .5; o.x -= ox / od * push; o.y -= oy / od * push * .5; }
        }
        z.y = clamp(z.y, H * .3, H - 8);
        if(Math.random() < .0009 * f) WZ.sfx.groan();
    }
}

function hurtPlayer(dmg){
    if(ended || WZ.cheats.god) return;
    G.hp -= dmg * G.armor; G.hurtT = 260;
    if(WZ.settings.screenShake) G.shake = Math.max(G.shake, 6);
    WZ.sfx.hurt(); WZ.haptic(35);
    const P = G.player;
    WZ.fx.blood(P.x, P.y, charH * .55, P.facing > 0 ? Math.PI : 0, 14, false);
    const el = $("hurtFx"); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    if(G.hp <= 0){ G.hp = 0; hud(); gameOver(); }
}

/* ---------------------------------------------------------
   HUD (DOM, only touched when a value changes)
--------------------------------------------------------- */
function hud(force){
    const h = G.hud, set = (k, v, fn) => { if(force || h[k] !== v){ h[k] = v; fn(v); } };
    set("score", G.score, v => $("hudScore").textContent = WZ.fmt(v));
    set("wave", G.wave, v => $("hudWave").textContent = v);
    const hp = Math.max(0, Math.ceil(G.hp));
    set("hp", hp, v => {
        const p = Math.round(v / G.maxHp * 100);
        $("hpText").textContent = `HEALTH ${v}/${G.maxHp}`;
        const bar = $("hpFill"); bar.style.width = p + "%";
        bar.style.background = p > 55 ? "linear-gradient(90deg,#1fd67a,#4bf39a)" : p > 28 ? "linear-gradient(90deg,#e8a51a,#ffd45a)" : "linear-gradient(90deg,#d62a2a,#ff5a4d)";
    });
    set("ammo", G.ammo, v => $("ammoNow").textContent = v);
    set("res", G.reserve, v => $("ammoRes").textContent = "/ " + v);
    set("coins", G.user.coins, v => $("hudCoins").textContent = WZ.fmt(v));
    set("power", `${Math.round(G.power)}|${G.stock.length}|${G.brewed.length}`, () => {
        $("powerFill").style.width = Math.round(G.power) + "%";
        $("powerText").textContent = G.brewed.length >= ELEM_ORDER.length ? "ALL 4 SERUMS BREWED"
            : G.power >= 100 && G.stock.length >= SERUM_STOCK_MAX ? "STOCK FULL · DRINK ONE"
            : `POWER ${Math.round(G.power)}%`;
        $("stockView").innerHTML = G.stock.map(id => `<i style="color:${ELEMENTS[id].color}">⚗</i>`).join("") || "<i class=\"muted\">no serum</i>";
        $("serumBtn").classList.toggle("disabledBtn", !G.stock.length);
    });
    set("noammo", G.noAmmoT > 0 && G.ammo === 0, v => $("ammoBox").classList.toggle("empty", v));
}

/* ---------------------------------------------------------
   RENDER
--------------------------------------------------------- */
function render(){
    if(!G) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
    ctx.save();
    if(G.shake > .1) ctx.translate(rand(-1, 1) * G.shake, rand(-1, 1) * G.shake);

    WZ.fx.drawDecals(ctx);

    // pickups
    for(const p of G.pickups){
        const blink = p.t > 10500 && ((p.t / 140) | 0) % 2;
        if(blink) continue;
        const bob = Math.sin(p.t / 220) * 3 * S, s = 15 * S;
        ctx.save(); ctx.translate(p.x, p.y - s - bob);
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, s + bob, s * .9, s * .3, 0, 0, 7); ctx.fill();
        ctx.shadowColor = p.type === "ammo" ? "#ffd45a" : "#5cff9d"; ctx.shadowBlur = 14;
        ctx.fillStyle = p.type === "ammo" ? "#5a6b2e" : "#e8eef0"; ctx.strokeStyle = "#0b140d"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(-s, -s * .8, s * 2, s * 1.6); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        if(p.type === "ammo"){ ctx.fillStyle = "#ffd45a"; for(let i = -1; i <= 1; i++) ctx.fillRect(i * s * .5 - 2, -s * .45, 4, s * .9); }
        else { ctx.fillStyle = "#e0303a"; ctx.fillRect(-s * .18, -s * .6, s * .36, s * 1.2); ctx.fillRect(-s * .6, -s * .18, s * 1.2, s * .36); }
        ctx.restore();
    }

    // depth-sorted actors
    const P = G.player;
    const actors = G.zombies.map(z => ({ y: z.y, z })).concat([{ y: P.y, player: true }],
        G.remote.map(r => ({ y: r.y, remote: r })));
    actors.sort((a, b) => a.y - b.y);
    for(const a of actors){
        if(a.player) drawPlayer(); else if(a.remote) drawRemote(a.remote); else drawZombieEntity(a.z);
    }

    // tracers
    ctx.lineCap = "round";
    for(const b of G.bullets){
        const tx = b.x - Math.cos(b.a) * b.tr * S * .9, ty = b.y - Math.sin(b.a) * b.tr * S * .9;
        const rgb = G.elem ? ELEMENTS[G.elem.id].rgb : "255,240,170";
        const gr = ctx.createLinearGradient(tx, ty, b.x, b.y);
        gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(1, `rgba(${rgb},.95)`);
        ctx.strokeStyle = gr; ctx.lineWidth = (G.wp.id === "sniper" ? 3.4 : 2.4) * Math.max(.7, S);
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // lightning arcs
    for(const a of G.arcs){
        ctx.strokeStyle = `rgba(230,250,255,${a.life / 220})`; ctx.lineWidth = 2.5 * Math.max(.7, S);
        ctx.beginPath(); ctx.moveTo(a.x1, a.y1);
        for(let i = 1; i < 5; i++){
            const t = i / 5;
            ctx.lineTo(a.x1 + (a.x2 - a.x1) * t + (i % 2 ? 9 : -9) * S, a.y1 + (a.y2 - a.y1) * t);
        }
        ctx.lineTo(a.x2, a.y2); ctx.stroke();
    }

    WZ.fx.drawAir(ctx);

    // muzzle flash on top of everything
    if(G.flashT > 0 && G.geo){
        const g0 = G.geo;
        WZ.fx.muzzleFlash(ctx, g0.muzzle.x, g0.muzzle.y, G.flashAng, (G.wp.id === "shotgun" ? 60 : G.wp.id === "sniper" ? 70 : 42) * S * (G.flashT / 50 + .6));
    }
    WZ.fx.drawTexts(ctx);
    ctx.restore();

    // low-health red pulse & hurt tint
    if(G.hp / G.maxHp < .3 || G.hurtT > 0){
        const a = Math.max(G.hurtT / 260 * .35, G.hp / G.maxHp < .3 ? .12 + Math.sin(G.time / 180) * .06 : 0);
        const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
        gr.addColorStop(0, "rgba(180,0,0,0)"); gr.addColorStop(1, `rgba(200,0,0,${a})`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }

    // desktop crosshair
    if(mouse.has && !WZ.isTouch || (mouse.has && mouse.down)){
        const x = mouse.x, y = mouse.y, r = 12 * Math.max(.8, S) + G.recoil * .6;
        ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - r - 6, y); ctx.lineTo(x - r + 5, y); ctx.moveTo(x + r - 5, y); ctx.lineTo(x + r + 6, y);
        ctx.moveTo(x, y - r - 6); ctx.lineTo(x, y - r + 5); ctx.moveTo(x, y + r - 5); ctx.lineTo(x, y + r + 6); ctx.stroke();
        ctx.fillStyle = "#ff4d4d"; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
    }
    // touch aim indicator
    if(stick.aim.active && G.geo){
        const m = G.geo.muzzle;
        ctx.strokeStyle = "rgba(255,90,80,.35)"; ctx.setLineDash([6, 8]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + Math.cos(G.flashAng || G.geo.barrel) * 260, m.y + Math.sin(G.geo.barrel) * 260); ctx.stroke(); ctx.setLineDash([]);
    }
}

function drawPlayer(){
    const P = G.player;
    const dead = G.hp <= 0;
    const o = { char: G.user.character, skin: G.skin, x: P.x, y: P.y, h: charH, facing: P.facing,
        target: G.target, aim: G.reloading ? (P.facing > 0 ? .75 : Math.PI - .75) : null,
        recoil: G.recoil, bob: G.bobPx || 0, squash: G.squash, hurt: G.hurtT / 260,
        tilt: dead ? P.facing * .5 : 0 };
    if(dead) ctx.globalAlpha = .75;
    WZ.fighter.draw(ctx, o);
    ctx.globalAlpha = 1;
    if(G.reloading){
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(P.x - 26 * S, P.y - charH - 14 * S, 52 * S, 6);
        ctx.fillStyle = "#ffd45a"; ctx.fillRect(P.x - 26 * S, P.y - charH - 14 * S, 52 * S * (G.reloading.t / G.reloading.dur), 6);
    }
}

function drawZombieEntity(z){
    const Z = WZ.zombie, k = z.h / Z.BASEH;
    const frame = Z.frame(z.type, z.variant, Math.floor(z.anim));
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.globalAlpha = .4; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(0, -1, z.h * .2 * z.bulk, z.h * .045, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    if(z.dying){
        const t = Math.min(1, z.dt / 520), e = 1 - Math.pow(1 - t, 3);
        ctx.rotate(-z.face * e * 1.5);
        ctx.globalAlpha = 1 - Math.max(0, (z.dt - 500) / 400);
    }
    const lunge = z.atk > 0 ? Math.sin(z.atk / 220 * Math.PI) * 14 * z.face : 0;
    ctx.scale(z.face * k, k);
    ctx.drawImage(frame, -Z.PX + lunge / k, -Z.FY);
    if(z.hit > 0){
        ctx.globalAlpha *= .8 * (z.hit / 90);
        ctx.drawImage(Z.white(frame), -Z.PX + lunge / k, -Z.FY);
    }
    ctx.restore();
    if(!z.dying && z.hp < z.maxhp){
        const bw = z.h * .5 * Math.max(.8, z.bulk * .7), bx = z.x - bw / 2, by = z.y - z.h - 8;
        ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
        ctx.fillStyle = z.hp / z.maxhp > .5 ? "#43e08b" : z.hp / z.maxhp > .25 ? "#ffd45a" : "#ff5a4d";
        ctx.fillRect(bx, by, bw * Math.max(0, z.hp / z.maxhp), 4);
    }
}

/* ---------------------------------------------------------
   ONLINE CO-OP
   The server is authoritative: it runs zombies, bullets, kills and
   coins. This client moves its own player (the server clamps the
   speed), sends FIRE angles, and draws whatever the server reports.
--------------------------------------------------------- */
const NET_W = 1000, NET_H = 600;          // must match server/coop-sim.js WORLD
const netX = x => x / NET_W * W;
const netY = y => minY() + (y - NET_H * .3) / (NET_H * .7) * (H - 14 - minY());
const toNetX = x => x / W * NET_W;
const toNetY = y => NET_H * .3 + (y - minY()) / (H - 14 - minY()) * (NET_H * .7);

function sendMove(){
    if(G.time - G.online.lastMove < 50) return;          // 20 moves per second
    G.online.lastMove = G.time;
    WZ.online.send({ type: "MOVE", x: toNetX(G.player.x), y: toNetY(G.player.y) });
}

function newNetZombie(z){
    const type = z.type === "boss" ? "boss" : "normal";
    const shirts = WZ.ZOMBIE_TYPES[type].shirts.length;
    return { id: z.id, type, variant: z.id % shirts, bulk: ZSTAT[type].bulk, h: charH * ZSTAT[type].size,
             x: 0, y: 0, hp: z.hp, maxhp: z.maxhp, dmg: 7, speed: 1, anim: Math.random() * 8,
             hit: 0, stagger: 0, kx: 0, atk: 0, atkCd: 0, face: 1, dying: false, dt: 0, wob: 0 };
}

/* called for every STATE message from the server */
function onNet(s){
    if(!G || !G.online) return;
    const myId = G.online.playerId;
    G.wave = s.wave; G.need = s.need; G.killsWave = s.killsWave;
    const me = s.players.find(p => p.id === myId);
    if(me){
        if(G.online.hp !== undefined && me.hp < G.online.hp){
            G.hurtT = 260;
            if(WZ.settings.screenShake) G.shake = Math.max(G.shake, 6);
            WZ.sfx.hurt(); WZ.haptic(35);
            const el = $("hurtFx"); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
        }
        G.online.hp = me.hp;
        G.hp = me.hp; G.ammo = me.ammo;
    }
    G.remote = s.players.filter(p => p.id !== myId).map(p => ({
        id: p.id, name: p.name, character: p.character, skin: p.skin,
        x: netX(p.x), y: netY(p.y), facing: p.facing, alive: p.alive }));
    const old = new Map(G.zombies.map(z => [z.id, z]));
    G.zombies = s.zombies.map(z => {
        const o = old.get(z.id) || newNetZombie(z);
        if(z.hp < o.hp - .5) WZ.fx.blood(netX(z.x), netY(z.y), o.h * .55, 0, 12, false);
        o.x = netX(z.x); o.y = netY(z.y); o.hp = z.hp; o.maxhp = z.maxhp;
        o.face = G.player.x >= o.x ? 1 : -1;
        o.anim += .15;
        return o;
    });
    G.bullets = s.bullets.map(b => ({ x: netX(b.x), y: netY(b.y), a: b.a, tr: 46 }));
    hud();
}

/* match finished (or this player left): show the server's numbers */
function onMatchOver(m){
    if(!G || !G.online || ended) return;
    ended = true; running = false; G.online.over = true;
    WZ.sfx.over(); WZ.haptic(120);
    $("overScore").textContent = WZ.fmt(m.result.kills * 10);
    $("overBest").parentElement.querySelector("span").textContent = "ONLINE WALLET";
    $("overBest").textContent = WZ.fmt(m.result.wallet);
    $("overWave").textContent = m.wave;
    $("overKills").textContent = m.result.kills;
    $("overCoins").textContent = m.result.coins;
    setTimeout(() => $("overOverlay").classList.remove("hidden"), 700);
}

/* a remote player: body from the shared sprite code, name above the head */
function drawRemote(r){
    const ch = WZ.CHARACTERS[r.character] ? r.character : "civilian";
    const skin = WZ.SKINS[r.skin] ? r.skin : WZ.defaultSkin("pistol");
    ctx.save();
    if(!r.alive) ctx.globalAlpha = .4;
    WZ.fighter.draw(ctx, { char: ch, skin, x: r.x, y: r.y, h: charH, facing: r.facing, target: null,
        aim: r.facing > 0 ? 0 : Math.PI, recoil: 0, bob: 0, squash: 0, hurt: 0, tilt: 0 });
    ctx.globalAlpha = 1;
    ctx.font = `600 ${Math.round(13 * Math.max(.7, S))}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(230,250,255,.92)";
    ctx.fillText(r.name, r.x, r.y - charH - 12 * S);
    ctx.restore();
}

/* ---------------------------------------------------------
   PUBLIC API
--------------------------------------------------------- */
WZ.game = {
    start, pause, resume, quit,
    startOnline(user, info){ start(user, info); },
    onNet, onMatchOver,
    get remoteCount(){ return G && G.remote ? G.remote.length : -1; },
    get running(){ return running; },
    get paused(){ return paused; },
    onBack(){ if(!running) return false; paused ? resume() : pause(); return true; }
};
})();
