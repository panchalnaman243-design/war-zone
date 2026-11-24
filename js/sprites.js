/* =========================================================
   SPRITES  -  asset loading, fighter compositing (body +
   gun in hand + gloves), procedural zombie sprites.
========================================================= */
(function(){
const WZ = window.WZ, A = WZ.ART;

/* ---------------------------------------------------------
   ASSET LOADER
--------------------------------------------------------- */
const IMG = {};
function removeWhiteBackground(source){
    const c = document.createElement("canvas");
    c.width = source.width; c.height = source.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(source, 0, 0);
    const pixels = g.getImageData(0, 0, c.width, c.height);
    const d = pixels.data, w = c.width, h = c.height;
    const seen = new Uint8Array(w * h), queue = new Int32Array(w * h);
    const nearWhite = i => d[i] > 218 && d[i+1] > 218 && d[i+2] > 218 &&
        Math.max(d[i], d[i+1], d[i+2]) - Math.min(d[i], d[i+1], d[i+2]) < 32;
    let head = 0, tail = 0;
    const add = p => {
        if(p < 0 || p >= w*h || seen[p]) return;
        const i = p * 4;
        if(nearWhite(i)){ seen[p] = 1; queue[tail++] = p; }
    };
    for(let x=0;x<w;x++){ add(x); add((h-1)*w+x); }
    for(let y=1;y<h-1;y++){ add(y*w); add(y*w+w-1); }
    while(head < tail){
        const p = queue[head++], x = p % w, y = (p / w) | 0;
        d[p*4+3] = 0;
        if(x) add(p-1); if(x+1<w) add(p+1);
        if(y) add(p-w); if(y+1<h) add(p+w);
    }
    g.putImageData(pixels, 0, 0);
    return c;
}
WZ.assets = {
    img: k => IMG[k],
    list(){
        const l = [];
        Object.keys(A.characters).forEach(c => ["body", "hands", "full"].forEach(p =>
            l.push([`${c}_${p}`, `assets/characters/${c}_${p}.webp`])));
        l.push(["void_reaper_full", "assets/Soul%20Reaper.webp"]);
        l.push(["doom_launcher_full", "assets/Doom%20Launcher.webp"]);
        Object.keys(A.guns).forEach(g => l.push([g, `assets/guns/${g}.webp`]));
        return l;
    },
    load(onProgress){
        const items = this.list(); let done = 0;
        return Promise.all(items.map(([key, src]) => new Promise(res => {
            const im = new Image();
            im.onload = im.onerror = () => { IMG[key] = im.naturalWidth ? ((key === "void_reaper_full" || key === "doom_launcher_full") ? removeWhiteBackground(im) : im) : null; done++; onProgress && onProgress(done / items.length); res(); };
            im.src = src;
        })));
    }
};

/* ---------------------------------------------------------
   TINT CACHE (hurt flash / white hit flash)
--------------------------------------------------------- */
const tintCache = new Map();
function tinted(key, src, color){
    let c = tintCache.get(key);
    if(c) return c;
    c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
    return c;
}
WZ.tinted = tinted;

/* ---------------------------------------------------------
   FIGHTER  (player + previews)
   o = { char, skin, x, y (feet), h (px height), facing (+1/-1),
         target:{x,y} | aim (world radians), recoil (px), bob (px),
         hurt (0..1), squash }
--------------------------------------------------------- */
function geometry(o){
    const artChar = o.char === "void_reaper" ? "hitman" : o.char;
    const cm = A.characters[artChar], gm = A.guns[o.skin];
    const k = o.h / cm.h, bob = o.bob || 0;
    const f = o.facing;
    const toWorld = (sx, sy) => ({ x: o.x + f * (sx - cm.pivotX) * k, y: o.y + bob + (sy - cm.feetY) * k });
    const anchor = toWorld(cm.anchor[0], cm.anchor[1]);

    let theta;
    if(o.aim != null) theta = o.aim;
    else if(o.target) theta = Math.atan2(o.target.y - anchor.y, o.target.x - anchor.x);
    else theta = f > 0 ? 0 : Math.PI;

    let phi = Math.atan2(Math.sin(theta), f * Math.cos(theta));
    phi = Math.max(-1.2, Math.min(1.2, phi));

    const gs = (gm.len * A.S) / gm.w;
    const gw = gm.w * gs, gh = gm.h * gs;
    const recoilS = (o.recoil || 0) / k;
    const mx = (gm.muzzle[0] - gm.grip[0]) * gw - recoilS;
    const my = (gm.muzzle[1] - gm.grip[1]) * gh;
    const c = Math.cos(phi), s = Math.sin(phi);
    const muzzle = {
        x: anchor.x + f * (mx * c - my * s) * k,
        y: anchor.y + (mx * s + my * c) * k
    };
    const barrel = Math.atan2(Math.sin(phi), f * Math.cos(phi));   // world direction of the barrel
    return { k, cm, gm, anchor, phi, gs, gw, gh, recoilS, muzzle, barrel, theta };
}

function drawFighter(ctx, o){
    const G = geometry(o);
    if(o.char === "void_reaper" && IMG.void_reaper_full){
        // This artwork already includes the Doom Launcher in Soul Reaper's hands.
        // Draw it as one complete transparent sprite, anchored at the player's feet.
        const im = IMG.void_reaper_full, h = o.h * 1.15, w = h * (im.width / im.height);
        ctx.save();
        ctx.globalAlpha = o.hurt > 0 ? 0.8 : 1;
        ctx.fillStyle = "rgba(0,0,0,.38)";
        ctx.beginPath(); ctx.ellipse(o.x, o.y - 1, h * .22, h * .045, 0, 0, Math.PI * 2); ctx.fill();
        ctx.translate(o.x, o.y + (o.bob || 0));
        // The supplied artwork points left by default; mirror only when facing right.
        ctx.scale(o.facing > 0 ? -1 : 1, 1);
        ctx.drawImage(im, -w / 2, -h, w, h);
        ctx.restore();
        return G;
    }
    const { k, cm, gm } = G;
    const artChar = o.char === "void_reaper" ? "hitman" : o.char;
    const body = IMG[artChar + "_body"], hands = IMG[artChar + "_hands"], gun = IMG[o.skin];
    if(!body) return G;

    // ground shadow
    ctx.save();
    ctx.globalAlpha = .38; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(o.x, o.y - 1, o.h * .2, o.h * .045, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(o.x, o.y + (o.bob || 0));
    ctx.scale(o.facing * k, k * (1 + (o.squash || 0)));
    ctx.rotate((o.tilt || 0));
    ctx.drawImage(body, -cm.pivotX, -cm.feetY);
    if(o.hurt > 0){
        ctx.globalAlpha = Math.min(.65, o.hurt);
        ctx.drawImage(tinted(artChar + "_body_red", body, "#ff2a2a"), -cm.pivotX, -cm.feetY);
        ctx.globalAlpha = 1;
    }
    // gun sits between body and gloves so the fingers wrap around the grip
    if(gun){
        ctx.save();
        ctx.translate(cm.anchor[0] - cm.pivotX, cm.anchor[1] - cm.feetY);
        ctx.rotate(G.phi);
        ctx.translate(-G.recoilS, 0);
        ctx.drawImage(gun, -gm.grip[0] * G.gw, -gm.grip[1] * G.gh, G.gw, G.gh);
        ctx.restore();
    }
    if(hands){
        ctx.drawImage(hands, -cm.pivotX, -cm.feetY);
        if(o.hurt > 0){
            ctx.globalAlpha = Math.min(.65, o.hurt);
            ctx.drawImage(tinted(artChar + "_hands_red", hands, "#ff2a2a"), -cm.pivotX, -cm.feetY);
            ctx.globalAlpha = 1;
        }
    }
    ctx.restore();
    return G;
}

/* Static preview used by home screen / shop */
function drawPreview(canvas, char, skin, opt){
    opt = opt || {};
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if(canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)){
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ch = h * (opt.fill || .94);
    drawFighter(ctx, { char, skin, x: w * (opt.px || .36), y: h * .97, h: ch, facing: 1, aim: opt.aim || -0.03, bob: opt.bob || 0 });
}

WZ.fighter = { geometry, draw: drawFighter, preview: drawPreview };

/* ---------------------------------------------------------
   PROCEDURAL ZOMBIES
   Baked once into offscreen canvases (8 walk frames / type).
   Want your own art? See docs/ASSET_GUIDE.md -> "Zombie sprites".
--------------------------------------------------------- */
const ZW = 270, ZH = 320, ZPX = 135, ZFY = 308, ZBASEH = 270;
const OUT = "#0b140d";

const ZT = {
    normal: { bulk: 1,    lean: .20, skin: ["#a5d68e", "#65975a", "#2f5a2c"], shirts: ["#3f5f7a", "#7a4a3a", "#4d6b3e"], pants: "#2b3340", eye: "#ffe96b", anim: 1 },
    runner: { bulk: .82,  lean: .44, skin: ["#c0ea98", "#7db35f", "#3a6a34"], shirts: ["#8a2f2f"], pants: "#25262e", eye: "#ff5a4d", anim: 1.5, stride: 1.25 },
    brute:  { bulk: 1.5,  lean: .12, skin: ["#88bc76", "#4f8244", "#264a26"], shirts: [null], pants: "#3a2f26", eye: "#ffb347", scars: true },
    toxic:  { bulk: 1.1,  lean: .18, skin: ["#cdea55", "#93bd2c", "#4e6f14"], shirts: ["#2f7a3c"], pants: "#2a3a26", eye: "#e8ff3a", glow: "#b6ff2a", pustules: true },
    boss:   { bulk: 1.55, lean: .10, skin: ["#62a878", "#336f4b", "#173b28"], shirts: [null], pants: "#20242c", eye: "#ff7a1a", glow: "#ff6a00", armor: true, horns: true }
};
WZ.ZOMBIE_TYPES = ZT;

function rr(g, x, y, w, h, r){
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function stroke2(g, x0, y0, x1, y1, w, col){
    g.lineWidth = w + 5; g.strokeStyle = OUT; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}

function drawZombie(g, T, vi, ph){
    const bulk = T.bulk, lean = T.lean, sk = T.skin;
    const shirt = T.shirts[vi % T.shirts.length];
    const stride = T.stride || 1;
    const bobY = -Math.abs(Math.sin(ph)) * 4;
    const hipY = -120 + bobY;
    g.lineJoin = "round"; g.lineCap = "round";

    // toxic / boss aura
    if(T.glow){
        const gr = g.createRadialGradient(0, -140, 10, 0, -140, 130);
        gr.addColorStop(0, T.glow + "55"); gr.addColorStop(1, T.glow + "00");
        g.fillStyle = gr; g.fillRect(-135, -300, 270, 300);
    }

    // geometry
    const th = 92, shoulder = { x: Math.sin(lean) * (th - 8), y: hipY - Math.cos(lean) * (th - 8) };
    const hd = { x: shoulder.x + Math.sin(lean + .25) * 32, y: shoulder.y - Math.cos(lean + .25) * 32 };

    const leg = (phase, col, back) => {
        const a1 = Math.sin(phase) * .55 * stride;
        const kx = Math.sin(a1) * 60, ky = hipY + 6 + Math.cos(a1) * 58;
        const bend = Math.max(0, Math.sin(phase + 1.2)) * .9 + .12;
        const a2 = a1 - bend;
        const ax = kx + Math.sin(a2) * 62, ay = ky + Math.cos(a2) * 62;
        const w = 24 * Math.min(1.3, bulk);
        stroke2(g, 0, hipY + 8, kx, ky, w, col);
        stroke2(g, kx, ky, ax, ay, w * .82, col);
        g.fillStyle = back ? "#141a16" : "#1b231e"; g.strokeStyle = OUT; g.lineWidth = 3;
        rr(g, ax - 8, ay - 5, 30, 13, 6); g.fill(); g.stroke();
    };
    const arm = (phase, base, col, handCol, back) => {
        const b1 = base + .09 * Math.sin(phase + .6);
        const sx = shoulder.x + (back ? -8 : 0), sy = shoulder.y + (back ? 2 : 0);
        const ex = sx + Math.cos(b1) * 50, ey = sy + Math.sin(b1) * 50;
        const b2 = b1 - .18;
        const hx = ex + Math.cos(b2) * 48, hy = ey + Math.sin(b2) * 48;
        const w = 17 * Math.min(1.35, bulk);
        stroke2(g, sx, sy, ex, ey, w, col);
        stroke2(g, ex, ey, hx, hy, w * .85, col);
        g.fillStyle = handCol; g.strokeStyle = OUT; g.lineWidth = 3;
        g.beginPath(); g.arc(hx, hy, 9 * Math.min(1.3, bulk), 0, Math.PI * 2); g.fill(); g.stroke();
        g.strokeStyle = "#e8e2c8"; g.lineWidth = 2.4;
        for(let i = -1; i <= 1; i++){
            g.beginPath(); g.moveTo(hx + 4, hy + i * 4); g.lineTo(hx + 15, hy + i * 5 + 2); g.stroke();
        }
    };

    const pants = T.pants;
    // far limbs
    arm(ph + Math.PI, .30, sk[2], sk[2], true);
    leg(ph + Math.PI, "#161c26", true);

    // torso
    g.save();
    g.translate(0, hipY); g.rotate(lean);
    const tw = 44 * bulk;
    rr(g, -tw / 2, -th, tw, th + 10, 13);
    if(shirt){
        const gr = g.createLinearGradient(-tw / 2, 0, tw / 2, 0);
        gr.addColorStop(0, shirt); gr.addColorStop(1, "#141a20");
        g.fillStyle = gr;
    }else{
        const gr = g.createLinearGradient(-tw / 2, 0, tw / 2, 0);
        gr.addColorStop(0, sk[0]); gr.addColorStop(.6, sk[1]); gr.addColorStop(1, sk[2]);
        g.fillStyle = gr;
    }
    g.fill(); g.strokeStyle = OUT; g.lineWidth = 3.4; g.stroke();
    // torn hem
    g.fillStyle = shirt ? "#10161c" : pants;
    for(let i = 0; i < 5; i++){
        const x = -tw / 2 + 4 + i * (tw - 8) / 4;
        g.beginPath(); g.moveTo(x - 5, 4); g.lineTo(x, 15 + (i % 2) * 6); g.lineTo(x + 5, 4); g.fill();
    }
    // wounds / blood
    g.fillStyle = "rgba(120,10,12,.6)";
    g.beginPath(); g.ellipse(-4 * bulk, -46, 9 * bulk, 13, .3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(9 * bulk, -20, 6, 8, -.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(60,4,6,.7)";
    g.beginPath(); g.ellipse(-4 * bulk, -46, 4 * bulk, 6, .3, 0, Math.PI * 2); g.fill();
    if(!shirt){   // bare chest: ribs / scars
        g.strokeStyle = "rgba(20,40,20,.55)"; g.lineWidth = 2;
        for(let i = 0; i < 4; i++){ g.beginPath(); g.moveTo(-tw / 2 + 8, -70 + i * 13); g.quadraticCurveTo(0, -64 + i * 13, tw / 2 - 8, -70 + i * 13); g.stroke(); }
    }
    if(T.scars){
        g.strokeStyle = "#7a1e1e"; g.lineWidth = 3;
        g.beginPath(); g.moveTo(-16, -78); g.lineTo(10, -30); g.stroke();
        g.beginPath(); g.moveTo(6, -80); g.lineTo(18, -52); g.stroke();
    }
    if(T.armor){
        g.fillStyle = "#3b4048"; g.strokeStyle = OUT; g.lineWidth = 3;
        rr(g, -tw / 2 - 6, -th + 2, tw + 12, 30, 8); g.fill(); g.stroke();
        g.fillStyle = "#ff8a1a"; g.shadowColor = "#ff6a00"; g.shadowBlur = 14;
        g.beginPath(); g.moveTo(-6, -58); g.lineTo(2, -30); g.lineTo(8, -56); g.lineTo(0, -44); g.fill();
        g.shadowBlur = 0;
    }
    if(T.pustules){
        [[-10, -60, 7], [8, -42, 5], [-2, -22, 6]].forEach(p => {
            g.fillStyle = "#e6ff4a"; g.strokeStyle = "#5a7a10"; g.lineWidth = 2;
            g.beginPath(); g.arc(p[0], p[1], p[2], 0, 7); g.fill(); g.stroke();
            g.fillStyle = "#fff"; g.globalAlpha = .6; g.beginPath(); g.arc(p[0] - 2, p[1] - 2, p[2] * .35, 0, 7); g.fill(); g.globalAlpha = 1;
        });
    }
    // belt + pants top
    g.fillStyle = pants; g.strokeStyle = OUT; g.lineWidth = 3;
    rr(g, -tw / 2, -6, tw, 22, 6); g.fill(); g.stroke();
    g.restore();

    // near leg
    leg(ph, pants, false);

    // head
    g.save();
    g.translate(hd.x, hd.y); g.rotate(lean * .5 + .08 * Math.sin(ph * .5) + .12);
    const hr = 26 * Math.pow(bulk, .3);
    // neck
    g.fillStyle = sk[1]; g.strokeStyle = OUT; g.lineWidth = 3;
    rr(g, -9, 8, 18, 22, 6); g.fill(); g.stroke();
    if(T.horns){
        g.fillStyle = "#c9c1a8"; g.strokeStyle = OUT; g.lineWidth = 3;
        g.beginPath(); g.moveTo(-14, -18); g.quadraticCurveTo(-30, -46, -16, -64); g.quadraticCurveTo(-14, -40, -2, -24); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(8, -22); g.quadraticCurveTo(14, -52, 34, -58); g.quadraticCurveTo(22, -38, 20, -20); g.closePath(); g.fill(); g.stroke();
    }
    const hg = g.createRadialGradient(-6, -8, 4, 0, 0, hr * 1.2);
    hg.addColorStop(0, sk[0]); hg.addColorStop(.65, sk[1]); hg.addColorStop(1, sk[2]);
    g.fillStyle = hg; g.strokeStyle = OUT; g.lineWidth = 3.4;
    g.beginPath(); g.ellipse(0, 0, hr, hr * 1.1, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    // hair / scalp patch
    g.fillStyle = "#1c1a16";
    g.beginPath(); g.moveTo(-hr * .95, -2); g.quadraticCurveTo(-hr * .8, -hr * 1.15, 4, -hr * 1.1); g.quadraticCurveTo(-4, -hr * .65, -hr * .95, -2); g.fill();
    // eye sockets
    g.fillStyle = "#150c0d";
    g.beginPath(); g.ellipse(11, -4, 8, 9, .2, 0, 7); g.fill();
    g.beginPath(); g.ellipse(-4, -5, 6.5, 8, .1, 0, 7); g.fill();
    g.fillStyle = T.eye; g.shadowColor = T.eye; g.shadowBlur = 10;
    g.beginPath(); g.arc(13, -3, 3.2, 0, 7); g.fill();
    g.beginPath(); g.arc(-3, -4, 2.6, 0, 7); g.fill();
    g.shadowBlur = 0;
    // brow scowl
    g.strokeStyle = OUT; g.lineWidth = 3;
    g.beginPath(); g.moveTo(3, -13); g.lineTo(20, -8); g.stroke();
    // mouth (jaw animates)
    const jaw = 5 + 5 * Math.abs(Math.sin(ph * .5));
    g.fillStyle = "#2a0708"; g.strokeStyle = OUT; g.lineWidth = 2.6;
    g.beginPath(); g.ellipse(9, 14, 10, jaw, .1, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#e9e2c0";
    for(let i = 0; i < 4; i++){ g.fillRect(2 + i * 4.5, 14 - jaw + 1, 3, 4); }
    // wound on cheek
    g.fillStyle = "rgba(150,18,20,.85)";
    g.beginPath(); g.ellipse(-12, 8, 8, 6, .4, 0, 7); g.fill();
    g.fillStyle = "rgba(60,5,8,.9)"; g.beginPath(); g.ellipse(-12, 8, 4, 3, .4, 0, 7); g.fill();
    if(T.pustules){
        g.fillStyle = "#f0ff6a"; g.beginPath(); g.arc(-10, -14, 4, 0, 7); g.fill();
        g.beginPath(); g.arc(18, 10, 3, 0, 7); g.fill();
    }
    g.restore();

    // near arm (front)
    arm(ph, .22, sk[1], sk[0], false);
}

const ZCACHE = {};
function bakeType(type){
    const T = ZT[type], variants = T.shirts.length, out = [];
    for(let v = 0; v < variants; v++){
        const frames = [];
        for(let f = 0; f < 8; f++){
            const c = document.createElement("canvas"); c.width = ZW; c.height = ZH;
            const g = c.getContext("2d");
            g.translate(ZPX, ZFY);
            drawZombie(g, T, v, (f / 8) * Math.PI * 2);
            frames.push(c);
        }
        out.push(frames);
    }
    return out;
}
WZ.zombie = {
    W: ZW, H: ZH, PX: ZPX, FY: ZFY, BASEH: ZBASEH,
    variants(type){ return (ZCACHE[type] = ZCACHE[type] || bakeType(type)); },
    frame(type, variant, idx){
        const v = this.variants(type);
        return v[variant % v.length][((idx % 8) + 8) % 8];
    },
    white(canvas){ return tinted("z_" + (canvas._id = canvas._id || Math.random().toString(36).slice(2)), canvas, "#ffffff"); },
    bakeAll(){ Object.keys(ZT).forEach(t => this.variants(t)); }
};
})();
