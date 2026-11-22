/* =========================================================
   WAR ZONE  -  CONFIG & GAME DATA
   Everything you may want to balance lives in this file.
========================================================= */
window.WZ = window.WZ || {};

WZ.CONFIG = {
    APP_NAME: "WAR ZONE",
    VERSION: "1.0.0",

    /* "dev"     -> admin console available for ADMIN_IDS (AND only after the passcode below is entered)
       "release" -> admin console completely removed from the code, no matter what anyone types.
       `npm run build:release` (and `npm run android` / `npm run ios`, which call it) flips this
       automatically, so the app on real phones never has an admin panel, whatever a player names
       their account. This "dev" switch only matters while YOU test with `npm run dev` or opening
       www/index.html directly.                                                                  */
    BUILD: "dev",

    ADMIN_IDS: ["NITIN", "NAMAN", "LOVEKESH"],

    /* Second lock on top of ADMIN_IDS: even in a dev build, admin now also needs this passcode.
       Leave it "" to keep the admin panel fully locked (recommended once you're done testing).
       To set a passcode: open the game, open the browser console (F12) and run
           await WZ.sha256("nitin0is0owner")
       then paste the hex string it prints below. The plain phrase is never stored in the code. */
    ADMIN_PASSCODE_HASH: "0597bfd6817f8ccf7bb9ef321a85b889a84b3511617e0d0ad684af0af5418d47",

    FEATURES: {
        multiplayer: true,       // online co-op (needs the server running, see CONFIG.ONLINE_URL: "wss://war-zone-online-qkl1.onrender.com/ws",)
        gifting: true,
        dailyRewards: true,
        puzzles: false          // wave-end puzzles (and the POWER they give). Set true to bring them back
    },

    ECONOMY: {
        startCoins: 100,
        waveCoinsMin: 10,        // coins per cleared wave
        waveCoinsMax: 10,
        coinPerKill: 0.5,        // coins per zombie killed (offline; fractions add up, whole coins are paid)
        xpPerKill: 4,
        ammoDropChance: 0.07,
        healthDropChance: 0.035
    },

    STORAGE: {
        users: "WARZONE_USERS_V4",
        current: "WARZONE_CURRENT_V4",
        settings: "WARZONE_SETTINGS_V1"
    },

    /* world is tuned for a 900px tall screen and scaled to fit any device */
    BASE_H: 900,
    MAX_ZOMBIES: 36,

    /* online co-op server. On a phone, replace localhost with your PC's LAN IP,
       e.g. ws://192.168.1.20:3000/ws. Use wss:// once the server is on https. */
    ONLINE_URL: "wss://war-zone-online-qkl1.onrender.com/ws"
};

/* ---------------------------------------------------------
   WEAPONS
   len  = on-screen gun length relative to the character sprite
   reloadMs is multiplied by the character's reload stat
--------------------------------------------------------- */
WZ.WEAPONS = {
    pistol: {
        id: "pistol", name: "PISTOL", price: 0,
        damage: 18, fireRate: 280, mag: 12, reserve: 120, speed: 15,
        pellets: 1, spread: .035, pierce: 0, reloadMs: 900, recoil: 9, shake: 1.2, kb: 3
    },
    rifle: {
        id: "rifle", name: "RIFLE", price: 500,
        damage: 25, fireRate: 150, mag: 30, reserve: 180, speed: 17,
        pellets: 1, spread: .035, pierce: 0, reloadMs: 1300, recoil: 11, shake: 1.6, kb: 4
    },
    smg: {
        id: "smg", name: "SMG", price: 5000,
        damage: 11, fireRate: 75, mag: 40, reserve: 240, speed: 18,
        pellets: 1, spread: .05, pierce: 0, reloadMs: 1200, recoil: 7, shake: 1.0, kb: 2
    },
    shotgun: {
        id: "shotgun", name: "SHOTGUN", price: 50000,
        damage: 17, fireRate: 570, mag: 6, reserve: 54, speed: 13,
        pellets: 7, spread: .25, pierce: 0, reloadMs: 1500, recoil: 18, shake: 4, kb: 6
    },
    sniper: {
        id: "sniper", name: "SNIPER", price: 125000,
        damage: 95, fireRate: 950, mag: 5, reserve: 45, speed: 30,
        pellets: 1, spread: .004, pierce: 3, reloadMs: 1800, recoil: 22, shake: 3.5, kb: 9
    },
    lmg: {
        id: "lmg", name: "LMG", price: 250000,
        damage: 15, fireRate: 90, mag: 100, reserve: 400, speed: 17,
        pellets: 1, spread: .06, pierce: 0, reloadMs: 2600, recoil: 8, shake: 1.4, kb: 3
    }
};
WZ.WEAPON_ORDER = ["pistol", "rifle", "smg", "shotgun", "sniper", "lmg"];

/* ---------------------------------------------------------
   GUN SKINS  (art files live in assets/guns/<img>.webp)
   Add a new skin: drop a PNG/WEBP in assets/guns, add an entry
   to WZ.ART.guns (art-meta.js) and one line here.
--------------------------------------------------------- */
WZ.SKINS = {
    pistol_std:    { weapon: "pistol",  name: "STANDARD",       price: 0,     rarity: "common" },
    pistol_galaxy: { weapon: "pistol",  name: "GALAXY",         price: 400,   rarity: "epic" },
    pistol_steam:  { weapon: "pistol",  name: "STEAMPUNK",      price: 750,  rarity: "legendary" },

    rifle_std:     { weapon: "rifle",   name: "STANDARD",       price: 0,     rarity: "common" },
    rifle_ember:   { weapon: "rifle",   name: "EMBER",          price: 600,  rarity: "epic" },
    rifle_marble:  { weapon: "rifle",   name: "GOLD MARBLE",    price: 1250,  rarity: "legendary" },
    rifle_galaxy:  { weapon: "rifle",   name: "NEBULA",         price: 900,  rarity: "epic" },

    smg_std:       { weapon: "smg",     name: "STANDARD",       price: 0,     rarity: "common" },
    smg_viper:     { weapon: "smg",     name: "VIPER",          price: 750,  rarity: "epic" },
    smg_graffiti:  { weapon: "smg",     name: "GRAFFITI",       price: 1250,  rarity: "legendary" },

    shotgun_std:   { weapon: "shotgun", name: "FACETED STEEL",  price: 0,     rarity: "common" },

    sniper_std:    { weapon: "sniper",  name: "STANDARD",       price: 0,     rarity: "common" },
    sniper_azure:  { weapon: "sniper",  name: "AZURE",          price: 1500,  rarity: "legendary" },

    lmg_std:       { weapon: "lmg",     name: "STANDARD",       price: 0,     rarity: "common" },
    lmg_phoenix:   { weapon: "lmg",     name: "PHOENIX",        price: 2000,  rarity: "legendary" }
};
WZ.defaultSkin = w => w + "_std";

/* ---------------------------------------------------------
   CHARACTERS
--------------------------------------------------------- */
WZ.CHARACTERS = {
    civilian: { id: "civilian", name: "CIVILIAN", price: 0,      speed: 1,    health: 100, damage: 1,    reload: 1,
                bio: "An ordinary guy in the wrong city." },
    cowboy:   { id: "cowboy",   name: "COWBOY",   price: 1000,   speed: 1.05, health: 105, damage: 1.05, reload: .96,
                bio: "Fast on the draw, steady under fire." },
    soldier:  { id: "soldier",  name: "SOLDIER",  price: 10000,  speed: .98,  health: 125, damage: 1.15, reload: 1,
                bio: "Heavy armor, heavy firepower." },
    hitman:   { id: "hitman",   name: "HITMAN",   price: 100000, speed: 1.14, health: 100, damage: 1.30, reload: .82,
                bio: "Quiet. Precise. Expensive." }
};
WZ.CHARACTER_ORDER = ["civilian", "cowboy", "soldier", "hitman"];

/* ---------------------------------------------------------
   UPGRADE RINGS  (all 8 are now actually applied in game.js)
--------------------------------------------------------- */
WZ.UPGRADES = [
    { id: "iron_heart",  name: "IRON HEART",  desc: "+10 maximum health per level.",   type: "health", value: 10, base: 150 },
    { id: "rapid_core",  name: "RAPID CORE",  desc: "+5% firing speed per level.",     type: "fire",   value: 5,  base: 180 },
    { id: "dead_eye",    name: "DEAD EYE",    desc: "+5% bullet damage per level.",    type: "damage", value: 5,  base: 200 },
    { id: "ghost_step",  name: "GHOST STEP",  desc: "+4% movement speed per level.",   type: "speed",  value: 4,  base: 160 },
    { id: "steel_skin",  name: "STEEL SKIN",  desc: "-4% incoming damage per level.",  type: "armor",  value: 4,  base: 220 },
    { id: "ammo_core",   name: "AMMO CORE",   desc: "+2 magazine capacity per level.", type: "ammo",   value: 2,  base: 250 },
    { id: "hunter_mark", name: "HUNTER MARK", desc: "+2 score per kill, per level.",   type: "score",  value: 5,  base: 300 },
    { id: "war_engine",  name: "WAR ENGINE",  desc: "+3% damage and fire rate.",       type: "combat", value: 3,  base: 350 }
];

WZ.MISSIONS = [
    { name: "FIRST BLOOD",    desc: "Kill 5 zombies.",   type: "kills", goal: 5,  reward: 10 },
    { name: "GREEN HUNTER",   desc: "Kill 15 zombies.",  type: "kills", goal: 15, reward: 20 },
    { name: "SURVIVOR",       desc: "Reach Wave 3.",     type: "wave",  goal: 3,  reward: 15 },
    { name: "ZOMBIE BREAKER", desc: "Kill 30 zombies.",  type: "kills", goal: 30, reward: 30 },
    { name: "WAVE MASTER",    desc: "Reach Wave 5.",     type: "wave",  goal: 5,  reward: 40 },
    { name: "NIGHTMARE",      desc: "Kill 60 zombies.",  type: "kills", goal: 60, reward: 70 }
];

/* ---------------------------------------------------------
   ARENAS (maps). Each has its own palette and floor decor.
   price 0 = free. Add a new arena here and it appears in
   LEVEL SELECT automatically.
--------------------------------------------------------- */
WZ.MAPS = {
    city: {
        id: "city", name: "CITY RUINS", price: 0, decor: "ruins", puzzles: ["simon", "cipher", "tap", "math", "mirror", "plates"],
        desc: "Broken streets and collapsed blocks. The starter arena.",
        preview: "linear-gradient(135deg,#1d3a46,#04090c)",
        bg: { c1: "#132630", c2: "#0b171e", c3: "#04090c", grid: "rgba(60,150,150,.07)", crack: "rgba(0,0,0,.35)", accent: "#1d3a46" }
    },
    desert: {
        id: "desert", name: "SCORCHED DESERT", price: 400, decor: "dunes", puzzles: ["tap", "math", "cipher"],
        desc: "Sand dunes and dead highways. Less cover, more open lines of fire.",
        preview: "linear-gradient(135deg,#7a5530,#2a1d10)",
        bg: { c1: "#4a3520", c2: "#2a1d10", c3: "#0b0704", grid: "rgba(230,170,90,.08)", crack: "rgba(0,0,0,.4)", accent: "#5a4226" }
    },
    graveyard: {
        id: "graveyard", name: "DEAD GRAVEYARD", price: 800, decor: "tombs", puzzles: ["simon", "mirror", "cipher"],
        desc: "Fog, tombstones and the dead rising from the soil.",
        preview: "linear-gradient(135deg,#2a4a38,#050806)",
        bg: { c1: "#1c2a22", c2: "#0e1712", c3: "#050806", grid: "rgba(120,220,160,.06)", crack: "rgba(0,0,0,.4)", accent: "#24362b" }
    },
    factory: {
        id: "factory", name: "RUST FACTORY", price: 1200, decor: "pipes", puzzles: ["mirror", "math", "simon", "plates"],
        desc: "Pipes, furnaces and tight corridors. Hardest arena.",
        preview: "linear-gradient(135deg,#5a3d2a,#080606)",
        bg: { c1: "#2a2226", c2: "#171214", c3: "#080606", grid: "rgba(255,140,60,.07)", crack: "rgba(0,0,0,.4)", accent: "#3d2b22" }
    }
};
WZ.MAP_ORDER = ["city", "desert", "graveyard", "factory"];

/* ---------------------------------------------------------
   TITLES. Earned automatically from progression. `need` is
   checked against the player's saved stats (see WZ.checkTitles).
--------------------------------------------------------- */
WZ.TITLES = [
    { id: "rookie",      name: "ROOKIE",          desc: "Reach wave 2",              test: u => u.wave >= 2 },
    { id: "veteran",     name: "VETERAN",         desc: "Reach wave 10",             test: u => u.wave >= 10 },
    { id: "warlord",     name: "WARLORD",         desc: "Reach wave 25",             test: u => u.wave >= 25 },
    { id: "bane",        name: "ZOMBIE BANE",     desc: "Kill 500 zombies",          test: u => u.kills >= 500 },
    { id: "exterminator",name: "EXTERMINATOR",    desc: "Kill 2000 zombies",         test: u => u.kills >= 2000 },
    { id: "coincollector", name: "COIN COLLECTOR", desc: "Keep 500 coins",          test: u => u.coins >= 500 },
    { id: "coinmaster",    name: "COIN MASTER",    desc: "Keep 5000 coins",         test: u => u.coins >= 5000 },
    { id: "explorer",    name: "EXPLORER",        desc: "Unlock 3 arenas",           test: u => u.unlockedMaps.length >= 3 },
    { id: "arenamaster", name: "ARENA MASTER",    desc: "Unlock every arena",        test: u => u.unlockedMaps.length >= WZ.MAP_ORDER.length },
    { id: "mission",     name: "MISSION MAN",     desc: "Complete 5 missions",       test: u => u.missionIndex >= 5 },
    { id: "bossslayer",  name: "BOSS SLAYER",     desc: "Defeat a boss (every 5th wave)", test: u => u.bossKills >= 1 }
];
