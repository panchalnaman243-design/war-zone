/* =========================================================
   FX  -  blood spray, mist, gibs, persistent ground decals,
   shell casings, muzzle flash, floating damage text.
   Pseudo-3D: every particle has (x, y=ground, z=height) so
   blood arcs through the air and only stains the floor when
   it lands.
========================================================= */
(function(){
const WZ = window.WZ;
const BLOOD = ["#a30f12", "#8a0b0e", "#c4181b", "#6d080b", "#b01216"];
const pick = a => a[(Math.random() * a.length) | 0];
const R = WZ.rand;

const fx = WZ.fx = {
    parts: [], casings: [], texts: [],
    decal: null, dctx: null, W: 0, H: 0, dpr: 1, fadeTimer: 0,

    resize(w, h, dpr){
        this.W = w; this.H = h; this.dpr = dpr;
        const old = this.decal;
        this.decal = document.createElement("canvas");
        this.decal.width = Math.round(w * dpr); this.decal.height = Math.round(h * dpr);
        this.dctx = this.decal.getContext("2d");
        this.dctx.scale(dpr, dpr);
        if(old && old.width) this.dctx.drawImage(old, 0, 0, w, h);
    },
    reset(){
        this.parts.length = 0; this.casings.length = 0; this.texts.length = 0;
        if(this.dctx) this.dctx.clearRect(0, 0, this.W, this.H);
    },

    /* ----- ground stains ----- */
    splat(x, y, size, ang){
        const g = this.dctx; if(!g) return;
        g.save(); g.translate(x, y); g.scale(1, .5);
        const col = pick(BLOOD);
        g.globalAlpha = R(.55, .85);
        const blobs = 3 + ((size / 3) | 0);
        for(let i = 0; i < blobs; i++){
            g.fillStyle = col;
            g.beginPath();
            g.ellipse(R(-.7, .7) * size, R(-.6, .6) * size, size * R(.35, 1), size * R(.25, .8), R(0, 3), 0, 7);
            g.fill();
        }
        if(size > 6 && ang != null){          // streak / drag mark
            g.strokeStyle = col; g.lineCap = "round"; g.lineWidth = size * .35;
            g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang) * size * 2.6, Math.sin(ang) * size * 2.6 * 2); g.stroke();
        }
        for(let i = 0; i < 3 + size / 3; i++){    // satellite droplets
            g.fillStyle = col;
            const a = R(0, 6.28), d = R(1.1, 2.4) * size;
            g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, R(.6, 1.9), 0, 7); g.fill();
        }
        g.globalAlpha = .35; g.fillStyle = "#e23a3a";     // wet highlight
        g.beginPath(); g.ellipse(-size * .15, -size * .1, size * .3, size * .16, 0, 0, 7); g.fill();
        g.restore();
    },
    pool(x, y, size){
        const g = this.dctx; if(!g) return;
        g.save(); g.translate(x, y); g.scale(1, .42);
        const gr = g.createRadialGradient(0, 0, size * .1, 0, 0, size);
        gr.addColorStop(0, "rgba(120,6,10,.92)"); gr.addColorStop(.7, "rgba(90,4,8,.85)"); gr.addColorStop(1, "rgba(60,3,6,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, size, 0, 7); g.fill();
        g.restore();
        for(let i = 0; i < 6; i++) this.splat(x + R(-size, size), y + R(-size, size) * .4, R(2, 5), null);
    },
    stampCorpse(canvas, x, y, scale, flip, angle){
        const g = this.dctx; if(!g) return;
        g.save(); g.translate(x, y); g.globalAlpha = .55;
        g.rotate(angle); g.scale(flip * scale, scale);
        g.filter = "none";
        g.drawImage(canvas, -WZ.zombie.PX, -WZ.zombie.FY);
        g.globalCompositeOperation = "source-atop";
        g.fillStyle = "rgba(20,0,0,.55)"; g.fillRect(-WZ.zombie.PX, -WZ.zombie.FY, canvas.width, canvas.height);
        g.restore();
    },

    /* ----- spawning ----- */
    blood(x, gy, z, ang, power, big){
        const q = [0, .5, 1][WZ.settings.blood] || 0;
        if(!q) return;
        const n = Math.round((7 + power * .32) * q * (big ? 2.6 : 1));
        for(let i = 0; i < n; i++){
            const forward = Math.random() < .7;
            const a = ang + (forward ? 0 : Math.PI) + (Math.random() - .5) * (big ? 2.8 : 1.15);
            const sp = R(1.5, big ? 11 : 8) * (forward ? 1 : .5);
            this.parts.push({
                k: 0, x, y: gy, z: z + R(-10, 10),
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .5, vz: R(.5, 5.5) * (big ? 1.3 : 1),
                s: R(1.3, 3.4) * (big ? 1.35 : 1), col: pick(BLOOD), life: 140
            });
        }
        for(let i = 0; i < (big ? 3 : 2); i++)        // mist
            this.parts.push({ k: 1, x: x + R(-6, 6), y: gy, z: z + R(-8, 8), vx: Math.cos(ang) * R(.2, 1.2), vy: 0, vz: R(.1, .5), s: R(9, 16), life: 0, max: R(20, 32) });
        if(big){
            for(let i = 0; i < 8 * q; i++){           // gibs
                const a = R(0, 6.28), sp = R(2, 8);
                this.parts.push({ k: 2, x, y: gy, z: z + R(-14, 14), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .5, vz: R(3, 9), s: R(3.5, 7), col: pick(BLOOD), life: 200, bounced: 0 });
            }
            this.pool(x, gy + 4, R(22, 34) * q);
        }
        if(this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    },
    casing(x, y, gy, side, big){
        this.casings.push({ x, y: gy, z: gy - y + 0, vx: side * R(.6, 2.0), vy: R(-.5, .5), vz: R(2.2, 4.2), rot: R(0, 6), vr: R(-.4, .4), life: 200, big });
        if(this.casings.length > 60) this.casings.shift();
    },
    text(x, y, txt, col, size){
        if(!WZ.settings.dmgNumbers) return;
        this.texts.push({ x: x + R(-8, 8), y, txt, col: col || "#fff", size: size || 18, life: 0, max: 46 });
        if(this.texts.length > 40) this.texts.shift();
    },

    /* ----- simulation ----- */
    update(f){
        const P = this.parts;
        for(let i = P.length - 1; i >= 0; i--){
            const p = P[i];
            if(p.k === 1){                              // mist puff
                p.life += f; p.x += p.vx * f; p.z += p.vz * f; p.s += .55 * f;
                if(p.life >= p.max) P.splice(i, 1);
                continue;
            }
            p.x += p.vx * f; p.y += p.vy * f; p.z += p.vz * f;
            p.vz -= .5 * f; p.vx *= (1 - .012 * f); p.life -= f;
            if(p.z <= 0){
                if(p.k === 2 && p.bounced < 1){ p.z = 0; p.vz = -p.vz * .35; p.vx *= .6; p.vy *= .6; p.bounced++; this.splat(p.x, p.y, p.s * .9, Math.atan2(p.vy, p.vx)); continue; }
                this.splat(p.x, p.y, p.s * (p.k === 2 ? 1.1 : R(.9, 1.7)), Math.atan2(p.vy, p.vx));
                P.splice(i, 1);
            }else if(p.life <= 0) P.splice(i, 1);
        }
        const C = this.casings;
        for(let i = C.length - 1; i >= 0; i--){
            const c = C[i];
            c.x += c.vx * f; c.y += c.vy * f; c.z += c.vz * f; c.vz -= .45 * f; c.rot += c.vr * f; c.life -= f;
            if(c.z <= 0){ c.z = 0; if(Math.abs(c.vz) > 1){ c.vz = -c.vz * .4; c.vx *= .5; c.vr *= .5; } else { c.vz = 0; c.vx = 0; c.vr = 0; } }
            if(c.life <= 0) C.splice(i, 1);
        }
        const T = this.texts;
        for(let i = T.length - 1; i >= 0; i--){ const t = T[i]; t.life += f; t.y -= .7 * f; if(t.life >= t.max) T.splice(i, 1); }
        this.fadeTimer += f;
        if(this.fadeTimer > 240 && this.dctx){         // slow decal fade (about 40 s)
            this.fadeTimer = 0;
            this.dctx.save(); this.dctx.globalCompositeOperation = "destination-out";
            this.dctx.fillStyle = "rgba(0,0,0,.018)"; this.dctx.fillRect(0, 0, this.W, this.H); this.dctx.restore();
        }
    },

    /* ----- drawing ----- */
    drawDecals(ctx){ if(this.decal) ctx.drawImage(this.decal, 0, 0, this.W, this.H); },
    drawAir(ctx){
        for(const p of this.parts){
            const sy = p.y - p.z;
            if(p.k === 1){
                const a = (1 - p.life / p.max) * .32;
                const gr = ctx.createRadialGradient(p.x, sy, 0, p.x, sy, p.s);
                gr.addColorStop(0, `rgba(170,15,20,${a})`); gr.addColorStop(1, "rgba(140,10,15,0)");
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, sy, p.s, 0, 7); ctx.fill();
                continue;
            }
            ctx.fillStyle = p.col;
            const speed = Math.abs(p.vx) + Math.abs(p.vz);
            if(speed > 5 && p.k === 0){               // motion streak
                ctx.strokeStyle = p.col; ctx.lineWidth = p.s * .9; ctx.lineCap = "round";
                ctx.beginPath(); ctx.moveTo(p.x, sy); ctx.lineTo(p.x - p.vx * 1.2, sy + (p.vz - p.vy) * 1.2); ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(p.x, sy, p.s, 0, 7); ctx.fill();
            if(p.k === 2){ ctx.fillStyle = "rgba(255,120,120,.35)"; ctx.beginPath(); ctx.arc(p.x - p.s * .3, sy - p.s * .3, p.s * .35, 0, 7); ctx.fill(); }
        }
        for(const c of this.casings){
            ctx.save(); ctx.translate(c.x, c.y - c.z); ctx.rotate(c.rot);
            ctx.fillStyle = "#e0b34a"; ctx.fillRect(-2.5, -1.2, c.big ? 8 : 5, 2.4);
            ctx.restore();
        }
    },
    drawTexts(ctx){
        ctx.textAlign = "center"; ctx.lineJoin = "round";
        for(const t of this.texts){
            const a = 1 - Math.max(0, (t.life - t.max * .5) / (t.max * .5));
            ctx.globalAlpha = a;
            const pop = t.life < 6 ? 1 + (6 - t.life) * .06 : 1;
            ctx.font = `900 ${Math.round(t.size * pop)}px Arial, sans-serif`;
            ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.strokeText(t.txt, t.x, t.y);
            ctx.fillStyle = t.col; ctx.fillText(t.txt, t.x, t.y);
        }
        ctx.globalAlpha = 1;
    },
    muzzleFlash(ctx, x, y, ang, size){
        ctx.save();
        ctx.translate(x, y); ctx.rotate(ang);
        ctx.globalCompositeOperation = "lighter";
        const gr = ctx.createRadialGradient(0, 0, 0, size * .3, 0, size);
        gr.addColorStop(0, "rgba(255,240,180,.95)"); gr.addColorStop(.35, "rgba(255,170,50,.65)"); gr.addColorStop(1, "rgba(255,90,0,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(size * .25, 0, size, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,225,140,.9)";
        ctx.beginPath();
        ctx.moveTo(-size * .1, 0); ctx.lineTo(size * .25, -size * .13); ctx.lineTo(size * 1.25, 0); ctx.lineTo(size * .25, size * .13); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -size * .06); ctx.lineTo(size * .5, -size * .5); ctx.lineTo(size * .15, 0); ctx.lineTo(size * .5, size * .5); ctx.lineTo(0, size * .06); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
};
})();
