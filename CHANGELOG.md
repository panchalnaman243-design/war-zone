## 1.3.0 - Plate path puzzle and bosses every 5 waves

- New puzzle PLATE PATH (City and Factory): a safe path of plates flashes one at a time. Step on the same plates in the same order. Any other plate is a trap. The path gets longer as waves go up.
- BOSS every 5th wave, offline and online. Killing the boss pays 50 coins and unlocks the BOSS SLAYER title.
- Online bosses scale with the number of living players and show as a boss in the arena.

## 1.2.0 - Titles and arena puzzle sets

- 10 titles unlock through progression: best wave, total kills, puzzles solved, arenas unlocked and missions completed. Tap the title under your name to equip one.
- Each arena has its own puzzle set: City (all five), Desert (tap, math, cipher), Graveyard (simon, mirror, cipher), Factory (mirror, math, simon).

## 1.1.2 - Admin terminal: /ban /unban /login /blur /god (dev build only)

- /ban <ID> and /unban <ID>: block or allow a local account on this device. Admin accounts cannot be banned. This does not affect the online server.
- /login <ID>: switch to a local account without a password. Dev builds only, behind the admin passcode.
- /blur [on|off]: blur the whole screen.
- /god [on|off]: infinite health in offline games. Online health is set by the server and is not affected.

## 1.1.1 - Admin terminal (dev build only)

- Admin panel has a TERMINAL: type help, coins, give, unlock, maxupg, stats, players or clear.
- Only these fixed commands run. There is no way to run arbitrary code from the panel.

## 1.1.0 - Online co-op multiplayer

- ONLINE button: create an account, log in, create a room (6-letter code) or join one. 2-8 players share the same zombie waves.
- Server-authoritative (server/server.js): the server runs every zombie, bullet and kill, and clamps player speed. Clients send only MOVE and FIRE.
- Online wallet on the server: wave rewards and kills are credited there. Coins are never accepted from a client. Leaving mid-match pays out what you earned so far.
- Other players are drawn with their character, gun skin and name.
- Server has no npm dependencies: `node server/server.js` (Node 18+). Set CONFIG.ONLINE_URL to the server address.
- Limits in this version: online uses the server's fixed stats (100 HP, no upgrades, no serums or power), and the online wallet is separate from the coins on the device.

## 1.0.4 - Elemental serums and POWER bar

- New POWER bar on the HUD. Solving a puzzle adds 25 power; failing takes 10. Every 100 power brews one serum.
- Four elemental serums, each brewed at most once per run: FIRE (burning), ICE (slows zombies), LIGHTNING (arcs to a nearby zombie), POISON (poisoned zombies burst into neighbours on death).
- Up to 2 serums can be kept in stock. Drink with the E key or the SERUM button. A drunk serum lasts 30s and still gives 2.5x damage, 1.5x speed and armor.
- Bullet tracers take the colour of the active element.

## 1.0.3 - Maps (arenas) and LEVEL SELECT

- New MAPS button on the home screen opens LEVEL SELECT.
- Four arenas, each with its own palette and floor decor: City Ruins (free), Scorched Desert (400 coins), Dead Graveyard (800), Rust Factory (1200).
- Chosen arena is saved per player (currentMap / unlockedMaps) and used for the next run.
- New arenas are added in WZ.MAPS in config.js and appear automatically.

## 1.0.2 - Hard wave puzzles + Power Serum

- Every wave now ends with a hard puzzle (was every 3rd wave). Solving it grants a POWER SERUM for the next wave (2.5x damage, 1.5x speed, +30% armor, full heal, 30s). Failing gives no serum.
- Five puzzle types, all harder and scaling with the wave number: Simon (8-13 flashes, backwards from wave 3), Cipher (unknown Caesar shift), Tap Overload (40-75 taps), Math Mayhem (3-digit equations on a per-question clock), Pattern Mirror (6x6 grid).
- Timers tighten each wave (down to 55% of base time).
- World and pause are frozen while a puzzle is open; held keys and touch sticks are released.
- Fixed: a second serum no longer stacks multipliers on top of the first; the serum restores base stats before re-applying.

# Changelog

## 1.0.1 - Admin security hardening

### Fixed
- **Admin-by-username bug**: registering an account named NITIN / NAMAN / LOVEKESH (from any
  device, any Gmail/email) granted admin instantly, because the game has no server and every
  "account" is just a name saved in that browser's own storage - nothing verified who was
  actually typing the name. Confirmed: release builds already strip the entire admin system
  from the shipped code (`CONFIG.BUILD: "release"` -> `isAdmin()` always `false`), so no real
  player on Play Store / App Store could ever reach it. Added a second lock for local testing
  (`npm run dev`): a secret passcode (`CONFIG.ADMIN_PASSCODE_HASH`, SHA-256, empty by default =
  fully locked) that you set yourself - a matching username is no longer enough on its own, even
  in a dev build. See `docs/ADMIN_SECURITY.md` for the full explanation and setup steps.

## 1.0.0 - Store-ready rebuild

### New
- Character art: Civilian, Cowboy, Soldier, Hitman (checkerboard removed, guns detached, gloves layered over the gun)
- Guns now sit **in the character's hands** and rotate to the aim direction (old build drew the gun at the stomach)
- 15 gun skins from the skin sheet, per-weapon skin picker in the shop, skins saved per account
- Two new weapons to use the sniper and LMG art: Sniper (pierces 3 enemies) and LMG
- Blood system: spray, mist, gibs, floor stains, corpses, hit flash, knock-back, damage numbers, screen shake
- Canvas renderer (was DOM elements) - 60 fps with hundreds of particles
- Touch controls (twin stick), reload button, pause menu, auto-pause when the app loses focus
- Procedural sound effects, haptics, settings (sound, volume, vibration, shake, numbers, blood level)
- Ammo and health crates, reload animation with reload bar, boss every 5th wave, zombie health bars
- Capacitor project, icons, splash, store listing, privacy policy, build guides

### Fixed
- Upgrades `iron_heart`, `ammo_core`, `war_engine` had no effect - all 8 upgrades now work
- Running out of ammo made the game unwinnable - waves now refill 30% reserve, zombies drop ammo
- Zombies dealt damage every frame while touching you - now a 0.75 s attack cycle
- `alert()` / `confirm()` (broken in mobile WebViews) replaced with in-game UI
- Plain-text passwords in localStorage -> salted SHA-256 (old accounts are migrated on next login)
- Admin panel reachable by anyone who typed an admin ID -> only exists in dev builds
- Fake multiplayer prototype replaced by an honest "coming soon" screen
- Desktop-only 3-column layout -> responsive landscape layout with safe-area insets (notches)
- `server.js`: clients could send arbitrary `SCORE`; unbounded messages; no keep-alive - all fixed

### Kept exactly as designed
Coin prices, wave formula (4 + 2 x wave kills), 3-4 coins per wave, missions, daily rewards, gifting, XP / levels.
