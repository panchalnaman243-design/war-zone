/* WAR ZONE Online server: co-op rooms, cross-device 1v1 duels and online accounts. */
"use strict";
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3000);
const WORLD_W = 1000, WORLD_H = 600, MAX_PLAYERS = 8;
const accounts = new Map();
const ADMIN_ACCOUNT_IDS = new Set(["NITIN", "NAMAN", "LOVEKESH"]);
function validAdminLogin(id, password) {
  if (!ADMIN_ACCOUNT_IDS.has(id)) return true;
  const required = process.env["ADMIN_" + id + "_PASSWORD"];
  return !!required && password === required;
}
// Persistent global leaderboard. Set DATABASE_URL in the Render service environment.
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
}) : null;
const rooms = new Map();
const sockets = new Map();
const duelQueue = [];
const duels = new Map();
let nextPlayerId = 1, nextZombieId = 1, nextDuelId = 1;

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "WAR ZONE Online", rooms: rooms.size }));
  }
  res.writeHead(404); res.end("Not found");
});
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });

function send(ws, type, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }));
}
function fail(ws, message) { send(ws, "ERROR", { message }); }
function cleanId(value) { return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 16); }
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
}
function passwordRecord(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function passwordMatches(password, record) {
  const actual = crypto.scryptSync(password, record.salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(record.hash, "hex"));
}
async function persistOnlineAccount(id) {
  if (!pool) return;
  const a = accounts.get(id);
  if (!a) return;
  await pool.query("UPDATE online_accounts SET coins=$2, titles=$3, updated_at=NOW() WHERE player_id=$1",
    [id, a.coins, a.titles || []]);
}
function playerList(room) {
  return [...room.players.values()].map(p => ({
    id: p.id, name: p.account, character: p.character, skin: p.skin
  }));
}
function broadcast(room, type, data = {}) {
  for (const p of room.players.values()) send(p.ws, type, data);
}
function lobby(room) {
  broadcast(room, "LOBBY", { code: room.code, host: room.host, players: playerList(room) });
}
function attach(ws, room, account, character, skin) {
  if (room.players.size >= MAX_PLAYERS) return fail(ws, "This room is full.");
  const player = {
    id: nextPlayerId++, ws, account, character: safeCharacter(character), skin: safeSkin(skin),
    x: 160 + Math.random() * 680, y: 250 + Math.random() * 260,
    facing: 1, hp: 100, ammo: 30, alive: true, kills: 0,
    lastFire: 0, reloadAt: 0
  };
  room.players.set(ws, player);
  sockets.set(ws, { account, room });
  send(ws, "JOINED", { code: room.code, playerId: player.id, host: room.host === account });
  lobby(room);
}
function safeCharacter(v) { return ["civilian", "cowboy", "soldier", "hitman"].includes(v) ? v : "civilian"; }
function safeSkin(v) {
  return /^(pistol|rifle|smg|shotgun|sniper|lmg)_[a-z0-9_]+$/.test(String(v || "")) ? String(v) : "pistol_std";
}
function leave(ws) {
  const info = sockets.get(ws);
  if (!info) return;
  if (info.duelQueue) {
    const qi = duelQueue.findIndex(p => p.ws === ws);
    if (qi >= 0) duelQueue.splice(qi, 1);
    info.duelQueue = false;
  }
  if (info.duel) {
    const duel = info.duel;
    const other = [...duel.players.values()].find(p => p.ws !== ws);
    sockets.delete(ws);
    if (other) finishDuel(duel, other, "opponent_left");
    else stopDuel(duel);
    return;
  }

  // Remove the socket mapping first so close/error events cannot process it twice.
  sockets.delete(ws);
  const room = info.room;

  // A logged-in player may disconnect before joining a room.
  if (!room || !room.players) return;

  const player = room.players.get(ws);
  room.players.delete(ws);

  if (!room.players.size) {
    clearInterval(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (room.host === info.account) room.host = room.players.values().next().value.account;
  if (room.started && player) {
    send(ws, "MATCH_OVER", { left: true, result: { coins: 0, wallet: accounts.get(info.account)?.coins || 0 } });
    checkMatchOver(room);
  } else lobby(room);
}
function createRoom(ws, msg) {
  const info = sockets.get(ws);
  if (!info) return fail(ws, "Log in first.");
  if (info.room || info.duel || info.duelQueue) return fail(ws, "Leave your current match first.");
  const code = makeCode();
  const room = { code, host: info.account, players: new Map(), started: false, wave: 1, need: 6, killsWave: 0, zombies: [], bullets: [], spawnLeft: 6, spawnAt: 0, timer: null };
  rooms.set(code, room);
  attach(ws, room, info.account, msg.character, msg.skin);
}
function joinRoom(ws, msg) {
  const info = sockets.get(ws);
  if (!info) return fail(ws, "Log in first.");
  if (info.room || info.duel || info.duelQueue) return fail(ws, "Leave your current match first.");
  const room = rooms.get(String(msg.code || "").toUpperCase());
  if (!room) return fail(ws, "Room not found. Check the code.");
  if (room.started) return fail(ws, "That match has already started.");
  attach(ws, room, info.account, msg.character, msg.skin);
}
function startMatch(ws) {
  const info = sockets.get(ws), room = info && info.room;
  if (!room) return fail(ws, "Join a room first.");
  if (room.host !== info.account) return fail(ws, "Only the host can start the match.");
  if (room.players.size < 2) return fail(ws, "Invite at least one friend before starting.");
  if (room.started) return;
  room.started = true;
  room.zombies = []; room.bullets = [];
  room.spawnLeft = room.need;
  for (const p of room.players.values()) { p.hp = 100; p.ammo = 30; p.alive = true; p.kills = 0; }
  broadcast(room, "MATCH_START");
  room.timer = setInterval(() => tick(room), 50);
}
function fire(room, player, angle) {
  const now = Date.now();
  if (!player.alive || player.ammo <= 0 || now - player.lastFire < 180) return;
  if (!Number.isFinite(angle)) return;
  player.lastFire = now; player.ammo--;
  room.bullets.push({ owner: player.id, x: player.x, y: player.y - 35, vx: Math.cos(angle) * 17, vy: Math.sin(angle) * 17, life: 70, damage: 25 });
}
function spawnZombie(room) {
  const side = Math.random() < .5 ? -30 : WORLD_W + 30;
  room.zombies.push({ id: nextZombieId++, x: side, y: 210 + Math.random() * 360, hp: room.wave % 5 === 0 ? 220 : 75, maxhp: room.wave % 5 === 0 ? 220 : 75, speed: room.wave % 5 === 0 ? .55 : .8 + room.wave * .035, boss: room.wave % 5 === 0 });
}
function tick(room) {
  if (!room.started) return;
  const now = Date.now();
  for (const p of room.players.values()) {
    if (p.alive && p.ammo === 0 && now >= p.reloadAt) { p.ammo = 30; p.reloadAt = now + 1700; }
  }
  if (room.spawnLeft > 0 && now >= room.spawnAt) {
    spawnZombie(room); room.spawnLeft--; room.spawnAt = now + 900;
  }
  for (const b of room.bullets) {
    b.x += b.vx; b.y += b.vy; b.life--;
    for (const z of room.zombies) {
      if (z.hp <= 0) continue;
      if (Math.hypot(z.x - b.x, z.y - b.y) < 36) {
        z.hp -= b.damage; b.life = 0;
        if (z.hp <= 0) {
          const owner = [...room.players.values()].find(p => p.id === b.owner);
          if (owner) owner.kills++;
          room.killsWave++;
        }
        break;
      }
    }
  }
  room.bullets = room.bullets.filter(b => b.life > 0 && b.x > -50 && b.x < WORLD_W + 50 && b.y > 150 && b.y < WORLD_H + 50);
  room.zombies = room.zombies.filter(z => z.hp > 0);
  for (const z of room.zombies) {
    const targets = [...room.players.values()].filter(p => p.alive);
    if (!targets.length) break;
    targets.sort((a, b) => Math.hypot(a.x-z.x,a.y-z.y) - Math.hypot(b.x-z.x,b.y-z.y));
    const p = targets[0], dx = p.x-z.x, dy = p.y-z.y, d = Math.max(1, Math.hypot(dx,dy));
    if (d > 42) { z.x += dx/d*z.speed*2.5; z.y += dy/d*z.speed*2.5; }
    else if (Math.random() < .06) p.hp = Math.max(0, p.hp - (z.boss ? 12 : 7));
    if (p.hp <= 0) p.alive = false;
  }
  if (room.spawnLeft === 0 && room.zombies.length === 0) {
    room.wave++; room.need = 6 + room.wave * 2; room.killsWave = 0; room.spawnLeft = room.need; room.spawnAt = now + 1600;
  }
  const players = [...room.players.values()];
  const state = {
    wave: room.wave, need: room.need, killsWave: room.killsWave,
    players: players.map(p => ({ id:p.id, name:p.account, character:p.character, skin:p.skin, x:p.x, y:p.y, facing:p.facing, hp:p.hp, ammo:p.ammo, alive:p.alive })),
    zombies: room.zombies.map(z => ({ id:z.id, type:z.boss ? "boss" : "normal", x:z.x, y:z.y, hp:z.hp, maxhp:z.maxhp })),
    bullets: room.bullets.map(b => ({ x:b.x, y:b.y, a:Math.atan2(b.vy,b.vx) }))
  };
  broadcast(room, "STATE", { s: state });
  checkMatchOver(room);
}
function checkMatchOver(room) {
  if (!room.started || [...room.players.values()].some(p => p.alive)) return;
  clearInterval(room.timer); room.started = false;
  for (const p of room.players.values()) {
    const coins = p.kills * 2;
    const account = accounts.get(p.account);
    if (account) account.coins += coins;
    persistOnlineAccount(p.account).catch(err=>console.error("Wallet save failed:",err));
    send(p.ws, "MATCH_OVER", { wave: room.wave, result: { kills: p.kills, coins, wallet: account ? account.coins : 0 } });
  }
  room.players.clear();
  rooms.delete(room.code);
}

function duelState(duel) {
  return {
    duel: true, round: duel.round, maxRounds: 4,
    wins: [...duel.players.values()].map(p => ({ id:p.id, name:p.account, wins:p.wins })),
    players: [...duel.players.values()].map(p => ({
      id:p.id, name:p.account, character:p.character, skin:p.skin,
      x:p.x, y:p.y, facing:p.facing, hp:p.hp, ammo:p.ammo, alive:p.alive
    })),
    zombies: [],
    bullets: duel.bullets.map(b => ({ x:b.x, y:b.y, a:Math.atan2(b.vy,b.vx) }))
  };
}
function broadcastDuel(duel, type, data={}) {
  for (const p of duel.players.values()) send(p.ws, type, data);
}
function sendDuelState(duel) {
  broadcastDuel(duel, "DUEL_STATE", { s: duelState(duel) });
}
function startDuelRound(duel) {
  duel.bullets = [];
  duel.roundEnded = false;
  duel.roundStarted = Date.now();
  duel.round++;
  const players = [...duel.players.values()];
  players.forEach((p,i) => {
    p.x = i === 0 ? 170 : WORLD_W - 170;
    p.y = 390 + (i ? -35 : 35);
    p.facing = i === 0 ? 1 : -1;
    p.hp = 100; p.ammo = 30; p.alive = true;
    p.lastFire = 0; p.reloadAt = 0;
  });
  sendDuelState(duel);
}
function queueDuel(ws, msg) {
  const info = sockets.get(ws);
  if (!info) return fail(ws, "Log in to your online account first.");
  if (info.room || info.duel || info.duelQueue) return fail(ws, "Leave your current match first.");
  const me = { ws, account: info.account, character:safeCharacter(msg.character), skin:safeSkin(msg.skin), id:nextPlayerId++, wins:0, hp:100, ammo:30, alive:true, x:170, y:390, facing:1, lastFire:0, reloadAt:0 };
  const index = duelQueue.findIndex(p => p.account !== me.account && p.ws.readyState === WebSocket.OPEN);
  if (index < 0) {
    duelQueue.push(me); info.duelQueue = true;
    send(ws, "DUEL_QUEUED", { message:"Searching for an opponent..." });
    return;
  }
  const opponent = duelQueue.splice(index,1)[0];
  const otherInfo = sockets.get(opponent.ws);
  if (!otherInfo) return queueDuel(ws, msg);
  otherInfo.duelQueue = false;
  const duel = { id:nextDuelId++, players:new Map(), round:0, bullets:[], timer:null, finished:false };
  duel.players.set(opponent.ws, opponent);
  duel.players.set(ws, me);
  info.duel = duel; otherInfo.duel = duel;
  duels.set(duel.id, duel);
  send(opponent.ws, "DUEL_FOUND", { playerId:opponent.id, opponent:me.account, duelId:duel.id });
  send(ws, "DUEL_FOUND", { playerId:me.id, opponent:opponent.account, duelId:duel.id });
  startDuelRound(duel);
  duel.timer = setInterval(() => tickDuel(duel), 50);
}
function cancelDuelQueue(ws) {
  const info = sockets.get(ws);
  if (!info || !info.duelQueue) return;
  const i = duelQueue.findIndex(p => p.ws === ws);
  if (i >= 0) duelQueue.splice(i,1);
  info.duelQueue = false;
  send(ws, "DUEL_CANCELLED");
}
function duelMove(ws, msg) {
  const info = sockets.get(ws), duel = info && info.duel;
  if (!duel || !duel.roundStarted || duel.roundEnded) return;
  const p = duel.players.get(ws);
  const x = Number(msg.x), y = Number(msg.y);
  if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const dx = Math.max(-20, Math.min(20, x-p.x));
  const dy = Math.max(-20, Math.min(20, y-p.y));
  p.x = Math.max(35, Math.min(WORLD_W-35,p.x+dx));
  p.y = Math.max(190, Math.min(WORLD_H-10,p.y+dy));
  if (dx) p.facing = dx > 0 ? 1 : -1;
}
function duelFire(ws, msg) {
  const info = sockets.get(ws), duel = info && info.duel;
  const p = duel && duel.players.get(ws), angle = Number(msg.angle);
  const now = Date.now();
  if (!duel || duel.roundEnded || !p || !p.alive || p.ammo <= 0 || !Number.isFinite(angle) || now-p.lastFire < 180) return;
  p.lastFire = now; p.ammo--;
  if (p.ammo === 0) p.reloadAt = now + 1700;
  duel.bullets.push({ owner:p.id, x:p.x, y:p.y-35, vx:Math.cos(angle)*17, vy:Math.sin(angle)*17, life:70 });
}
function stopDuel(duel) {
  if (!duel || duel.finished) return;
  duel.finished = true;
  clearInterval(duel.timer);
  duels.delete(duel.id);
  for (const p of duel.players.values()) {
    const info = sockets.get(p.ws);
    if (info) { info.duel = null; info.duelQueue = false; }
  }
}
function finishDuel(duel, winner, reason="complete") {
  if (!duel || duel.finished) return;
  const players = [...duel.players.values()];
  const loser = winner ? players.find(p => p !== winner) : null;
  if (winner) winner.wins = Math.max(winner.wins, 3);
  const titleMap = { NITIN:["god","GOD"], NAMAN:["strongestcreature","THE STRONGEST CREATURE"], LOVEKESH:["hacker","HACKER"] };
  const special = winner && loser && titleMap[loser.account.toUpperCase()];
  if (winner) {
    const account = accounts.get(winner.account);
    if (account) {
      account.coins += 50;
      if (special && !account.titles.includes(special[0])) account.titles.push(special[0]);
    }
  }
  for (const p of players) {
    const account = accounts.get(p.account);
    send(p.ws, "DUEL_OVER", {
      winner: winner ? winner.account : null,
      youWon: !!winner && p === winner,
      draw: !winner,
      reason,
      roundsPlayed: duel.round,
      wins: players.map(x=>({id:x.id,name:x.account,wins:x.wins})),
      wallet: account ? account.coins : 0,
      bonus: winner && p === winner ? 50 : 0,
      titleId: winner && p === winner && special ? special[0] : null,
      titleName: winner && p === winner && special ? special[1] : null,
      titles: accounts.get(p.account)?.titles || []
    });
    persistOnlineAccount(p.account).catch(err=>console.error("Duel wallet save failed:",err));
  }
  stopDuel(duel);
}
function endDuelRound(duel, winner) {
  if (!duel || duel.finished || duel.roundEnded) return;
  duel.roundEnded = true;
  const players = [...duel.players.values()];
  for (const p of players) {
    const account = accounts.get(p.account);
    if (account) account.coins += winner ? (p === winner ? 10 : 5) : 5;
    persistOnlineAccount(p.account).catch(err=>console.error("Duel round wallet save failed:",err));
  }
  if (winner) winner.wins++;
  const leader = players.find(p=>p.wins>=3);
  broadcastDuel(duel, "DUEL_ROUND_OVER", {
    round:duel.round, winner:winner ? winner.account : null,
    wins:players.map(p=>({id:p.id,name:p.account,wins:p.wins})),
    wallets:players.map(p=>({id:p.id,coins:accounts.get(p.account)?.coins||0}))
  });
  if (leader) return finishDuel(duel, leader);
  if (duel.round >= 4) {
    const a=players[0], b=players[1];
    return finishDuel(duel, a.wins===b.wins ? null : (a.wins>b.wins ? a : b));
  }
  setTimeout(() => { if (!duel.finished) startDuelRound(duel); }, 1800);
}
function tickDuel(duel) {
  if (!duel || duel.finished || duel.roundEnded) return;
  const players = [...duel.players.values()];
  for (const p of players) {
    if (p.alive && p.ammo===0 && p.reloadAt && Date.now()>=p.reloadAt) { p.ammo=30; p.reloadAt=0; }
  }
  for (const b of duel.bullets) {
    b.x += b.vx; b.y += b.vy; b.life--;
    const target = players.find(p=>p.id!==b.owner && p.alive);
    if (target && Math.hypot(target.x-b.x,(target.y-35)-b.y)<30) {
      target.hp = Math.max(0,target.hp-25); b.life=0;
      if (target.hp<=0) target.alive=false;
    }
  }
  duel.bullets = duel.bullets.filter(b=>b.life>0 && b.x>-50 && b.x<WORLD_W+50 && b.y>130 && b.y<WORLD_H+50);
  const dead = players.find(p=>!p.alive);
  if (dead) return endDuelRound(duel, players.find(p=>p!==dead));
  if (Date.now()-duel.roundStarted > 90000) {
    const [a,b]=players;
    return endDuelRound(duel, a.hp===b.hp ? null : (a.hp>b.hp ? a : b));
  }
  sendDuelState(duel);
}

async function onMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return fail(ws, "Invalid message."); }
  if (!msg || typeof msg.type !== "string") return fail(ws, "Invalid message.");
  // Public global leaderboard: read player records from PostgreSQL.
  if (msg.type === "GLOBAL_LEADERBOARD") {
    if (!pool) return send(ws, "GLOBAL_SYNC_ERROR", { message: "Leaderboard database is not connected yet." });
    const result = await pool.query(
      'SELECT player_id AS id, best_score AS "bestScore", level, kills, wave FROM global_players ORDER BY best_score DESC, player_id ASC LIMIT 50'
    );
    return send(ws, "GLOBAL_LEADERBOARD", { players: result.rows });
  }
  if (msg.type === "GLOBAL_SYNC") {
    if (!pool) return send(ws, "GLOBAL_SYNC_ERROR", { message: "Leaderboard database is not connected yet." });
    const id = cleanId(msg.id);
    const credential = String(msg.credential || "");
    if (id.length < 3 || !/^[a-f0-9]{8,128}$/i.test(credential)) {
      return send(ws, "GLOBAL_SYNC_ERROR", { message: "Could not sync this player ID. Please log in again." });
    }
    let result = await pool.query(
      "SELECT credential_salt, credential_hash FROM global_players WHERE player_id = $1", [id]
    );
    if (!result.rowCount) {
      const record = passwordRecord(credential);
      await pool.query(
        "INSERT INTO global_players (player_id, credential_salt, credential_hash) VALUES ($1, $2, $3) ON CONFLICT (player_id) DO NOTHING",
        [id, record.salt, record.hash]
      );
      result = await pool.query(
        "SELECT credential_salt, credential_hash FROM global_players WHERE player_id = $1", [id]
      );
    }
    const record = { salt: result.rows[0].credential_salt, hash: result.rows[0].credential_hash };
    if (!passwordMatches(credential, record)) {
      return send(ws, "GLOBAL_SYNC_ERROR", { message: "This player ID is already registered with a different password on another device." });
    }
    const bestScore = Math.max(0, Math.min(1000000000, Number(msg.bestScore) || 0));
    const level = Math.max(1, Math.min(100000, Number(msg.level) || 1));
    const kills = Math.max(0, Math.min(1000000000, Number(msg.kills) || 0));
    const wave = Math.max(1, Math.min(100000, Number(msg.wave) || 1));
    const xp = Math.max(0, Math.min(1000000000, Number(msg.xp) || 0));
    const coins = Math.max(0, Math.min(1000000000, Number(msg.coins) || 0));
    const saved = await pool.query(
      "UPDATE global_players SET best_score = GREATEST(best_score, $2), xp = CASE WHEN $3 > level THEN $6 WHEN $3 = level THEN GREATEST(xp, $6) ELSE xp END, level = GREATEST(level, $3), kills = GREATEST(kills, $4), wave = GREATEST(wave, $5), coins = GREATEST(coins, $7), updated_at = NOW() WHERE player_id = $1 RETURNING best_score, level, xp, kills, wave, coins",
      [id, bestScore, level, kills, wave, xp, coins]
    );
    send(ws, "GLOBAL_SYNCED", { id, ...saved.rows[0] });
    return;
  }
  if (msg.type === "REGISTER" || msg.type === "LOGIN") {
    if (sockets.has(ws)) return fail(ws, "You are already logged in.");
    const id = cleanId(msg.id), pw = String(msg.pw || "");
    if (id.length < 3 || pw.length < 4 || pw.length > 64) return fail(ws, "Use an ID of 3-16 letters/numbers and a password of 4-64 characters.");
    if (!validAdminLogin(id, pw)) return fail(ws, "This admin ID is reserved. The owner must configure its private password in Render.");
    if (msg.type === "REGISTER") {
      if (accounts.has(id)) return fail(ws, "That online ID is already taken.");
      const record = passwordRecord(pw);
      if (pool) {
        const saved = await pool.query(
          "INSERT INTO online_accounts (player_id, credential_salt, credential_hash) VALUES ($1,$2,$3) ON CONFLICT (player_id) DO NOTHING RETURNING player_id",
          [id, record.salt, record.hash]
        );
        if (!saved.rowCount) return fail(ws, "That online ID is already taken.");
      }
      accounts.set(id, { ...record, coins: 0, titles: [] });
      return send(ws, "REGISTERED");
    }
    let account = accounts.get(id);
    if (!account && pool) {
      const saved = await pool.query("SELECT credential_salt, credential_hash, coins, titles FROM online_accounts WHERE player_id=$1", [id]);
      if (saved.rowCount) account = {
        salt:saved.rows[0].credential_salt, hash:saved.rows[0].credential_hash,
        coins:Number(saved.rows[0].coins)||0, titles:saved.rows[0].titles||[]
      };
      if (account) accounts.set(id, account);
    }
    if (!account || !passwordMatches(pw, account)) return fail(ws, "Incorrect online ID or password.");
    send(ws, "AUTHED", { id, coins: account.coins, titles: account.titles || [] });
    sockets.set(ws, { account: id, room: null, duelQueue:false, duel:null });
    return;
  }
  if (msg.type === "DUEL_QUEUE") return queueDuel(ws, msg);
  if (msg.type === "DUEL_CANCEL") return cancelDuelQueue(ws);
  if (msg.type === "DUEL_FORFEIT") { const d=sockets.get(ws)?.duel; if(d){ const winner=[...d.players.values()].find(p=>p.ws!==ws); finishDuel(d,winner,"forfeit"); } return; }
  if (msg.type === "CREATE_ROOM") return createRoom(ws, msg);
  if (msg.type === "JOIN_ROOM") return joinRoom(ws, msg);
  const info = sockets.get(ws), room = info && info.room;
  if (info && info.duel && msg.type === "MOVE") return duelMove(ws, msg);
  if (info && info.duel && msg.type === "FIRE") return duelFire(ws, msg);
  if (msg.type === "START") return startMatch(ws);
  if (msg.type === "LEAVE") return leave(ws);
  if (!room || !room.started) return fail(ws, "You are not in an active room.");
  const player = room.players.get(ws);
  if (!player) return fail(ws, "Player not found.");
  if (msg.type === "MOVE") {
    const x = Number(msg.x), y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const dx = Math.max(-20, Math.min(20, x - player.x));
    const dy = Math.max(-20, Math.min(20, y - player.y));
    player.x = Math.max(35, Math.min(WORLD_W - 35, player.x + dx));
    player.y = Math.max(190, Math.min(WORLD_H - 10, player.y + dy));
    player.facing = dx < 0 ? -1 : dx > 0 ? 1 : player.facing;
  } else if (msg.type === "FIRE") fire(room, player, Number(msg.angle));
}
wss.on("connection", ws => {
  send(ws, "HELLO");
  ws.on("message", data => { onMessage(ws, data).catch(err => { console.error("WebSocket request failed:", err); fail(ws, "Server error. Please try again."); }); });
  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});
async function startServer() {
  if (pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS global_players (
        player_id VARCHAR(16) PRIMARY KEY,
        credential_salt VARCHAR(64) NOT NULL,
        credential_hash VARCHAR(128) NOT NULL,
        best_score BIGINT NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        kills BIGINT NOT NULL DEFAULT 0,
        wave INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query("ALTER TABLE global_players ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0");
    await pool.query("ALTER TABLE global_players ADD COLUMN IF NOT EXISTS coins BIGINT NOT NULL DEFAULT 0");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS online_accounts (
        player_id VARCHAR(16) PRIMARY KEY,
        credential_salt VARCHAR(64) NOT NULL,
        credential_hash VARCHAR(128) NOT NULL,
        coins BIGINT NOT NULL DEFAULT 0,
        titles TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("WAR ZONE leaderboard database connected.");
  } else {
    console.warn("DATABASE_URL is missing. Global leaderboard will not persist.");
  }
  server.listen(PORT, "0.0.0.0", () => console.log("WAR ZONE Online listening on " + PORT));
}
startServer().catch(err => { console.error("Database startup failed:", err); process.exit(1); });
