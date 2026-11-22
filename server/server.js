/* WAR ZONE Online Co-op server.
 * WebSocket protocol for up to 8 players per room.
 * Accounts and wallets are in memory in this starter version.
 */
"use strict";
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const WORLD_W = 1000, WORLD_H = 600, MAX_PLAYERS = 8;
const accounts = new Map();
// Main-game accounts synced from every device for the public global leaderboard.
// This starter implementation is in-memory, like the existing online accounts.
const globalPlayers = new Map();
const rooms = new Map();
const sockets = new Map();
let nextPlayerId = 1, nextZombieId = 1;

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
  if (info.room) return fail(ws, "Leave your current room first.");
  const code = makeCode();
  const room = { code, host: info.account, players: new Map(), started: false, wave: 1, need: 6, killsWave: 0, zombies: [], bullets: [], spawnLeft: 6, spawnAt: 0, timer: null };
  rooms.set(code, room);
  attach(ws, room, info.account, msg.character, msg.skin);
}
function joinRoom(ws, msg) {
  const info = sockets.get(ws);
  if (!info) return fail(ws, "Log in first.");
  if (info.room) return fail(ws, "Leave your current room first.");
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
    send(p.ws, "MATCH_OVER", { wave: room.wave, result: { kills: p.kills, coins, wallet: account ? account.coins : 0 } });
  }
  room.players.clear();
  rooms.delete(room.code);
}
function onMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return fail(ws, "Invalid message."); }
  if (!msg || typeof msg.type !== "string") return fail(ws, "Invalid message.");
  // Public global leaderboard: IDs and best scores synced by the main game.
  if (msg.type === "GLOBAL_LEADERBOARD") {
    const players = [...globalPlayers.entries()]
      .map(([id, p]) => ({ id, bestScore: p.bestScore, level: p.level, kills: p.kills, wave: p.wave }))
      .sort((a, b) => b.bestScore - a.bestScore || a.id.localeCompare(b.id))
      .slice(0, 50);
    return send(ws, "GLOBAL_LEADERBOARD", { players });
  }
  if (msg.type === "GLOBAL_SYNC") {
    const id = cleanId(msg.id);
    const credential = String(msg.credential || "");
    if (id.length < 3 || !/^[a-f0-9]{8,128}$/i.test(credential)) {
      return send(ws, "GLOBAL_SYNC_ERROR", { message: "Could not sync this player ID. Please log in again." });
    }
    let player = globalPlayers.get(id);
    if (!player) {
      player = { ...passwordRecord(credential), bestScore: 0, level: 1, kills: 0, wave: 1 };
      globalPlayers.set(id, player);
    } else if (!passwordMatches(credential, player)) {
      return send(ws, "GLOBAL_SYNC_ERROR", { message: "This player ID is already registered with a different password on another device." });
    }
    player.bestScore = Math.max(player.bestScore, Math.max(0, Math.min(1000000000, Number(msg.bestScore) || 0)));
    player.level = Math.max(player.level, Math.max(1, Math.min(100000, Number(msg.level) || 1)));
    player.kills = Math.max(player.kills, Math.max(0, Math.min(1000000000, Number(msg.kills) || 0)));
    player.wave = Math.max(player.wave, Math.max(1, Math.min(100000, Number(msg.wave) || 1)));
    send(ws, "GLOBAL_SYNCED", { id, bestScore: player.bestScore });
    return;
  }
  if (msg.type === "REGISTER" || msg.type === "LOGIN") {
    if (sockets.has(ws)) return fail(ws, "You are already logged in.");
    const id = cleanId(msg.id), pw = String(msg.pw || "");
    if (id.length < 3 || pw.length < 4 || pw.length > 64) return fail(ws, "Use an ID of 3-16 letters/numbers and a password of 4-64 characters.");
    if (msg.type === "REGISTER") {
      if (accounts.has(id)) return fail(ws, "That online ID is already taken.");
      accounts.set(id, { ...passwordRecord(pw), coins: 0 });
      return send(ws, "REGISTERED");
    }
    const account = accounts.get(id);
    if (!account || !passwordMatches(pw, account)) return fail(ws, "Incorrect online ID or password.");
    send(ws, "AUTHED", { id, coins: account.coins });
    sockets.set(ws, { account: id, room: null });
    return;
  }
  if (msg.type === "CREATE_ROOM") return createRoom(ws, msg);
  if (msg.type === "JOIN_ROOM") return joinRoom(ws, msg);
  const info = sockets.get(ws), room = info && info.room;
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
  ws.on("message", data => onMessage(ws, data));
  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});
server.listen(PORT, "0.0.0.0", () => console.log("WAR ZONE Online listening on " + PORT));
