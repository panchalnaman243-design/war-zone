# WAR ZONE

Zombie-survival shooter built with plain HTML5 Canvas + JavaScript and packaged for
**Google Play** and the **Apple App Store** with [Capacitor](https://capacitorjs.com).

- 4 playable characters (Civilian, Cowboy, Soldier, Hitman) with hand-held guns
- 6 weapons (Pistol, Rifle, SMG, Shotgun, Sniper, LMG) and 15 swappable gun skins
- Realistic blood: airborne spray, mist, gibs, persistent floor stains, corpses
- Twin-stick touch controls + keyboard/mouse, pause, auto-pause on app switch
- Synthesized sound effects (no audio files), haptics, settings
- Runs offline. No ads, no analytics, no network calls.

```
warzone/
├─ www/                  the game (this is what ships)
│  ├─ index.html
│  ├─ css/style.css
│  ├─ js/
│  │  ├─ config.js       ALL balance data: weapons, skins, characters, upgrades, missions
│  │  ├─ art-meta.js     sprite anchors (hand point, gun grip/muzzle) - auto generated
│  │  ├─ core.js         helpers, save data, settings, audio, haptics
│  │  ├─ sprites.js      asset loader, fighter compositing, procedural zombies
│  │  ├─ fx.js           blood, decals, casings, muzzle flash
│  │  ├─ game.js         engine: input, waves, zombies, bullets, render
│  │  ├─ ui.js           login, home, shop, missions, settings, admin
│  │  └─ main.js         boot + Capacitor hooks
│  ├─ assets/characters  <id>_body / _hands / _full .webp
│  ├─ assets/guns        <weapon>_<skin>.webp
│  └─ icons/ manifest.webmanifest
├─ art-source/           your original PNG sheets (kept for re-processing)
├─ scripts/              build.js, dev-server.js, process_art.py (+ art/ pipeline)
├─ resources/            icon + splash sources for @capacitor/assets
├─ server/               multiplayer relay prototype (not wired into the client yet)
├─ store/                Play Store / App Store listing, privacy policy, screenshots, graphics
├─ docs/                 build guides, asset guide, architecture, release checklist
├─ capacitor.config.json
└─ package.json
```

## Run it on your computer

```bash
npm install
npm run dev            # http://localhost:8080
```
You can also just double-click `www/index.html` - it works from `file://`.

**Controls** - desktop: WASD/arrows move, mouse aim, click fire, R reload, Esc pause.
Phone: left thumb moves, right thumb aims and fires, ⟳ reloads.

## Ship it

| Goal | Read |
|------|------|
| Android APK / AAB for Google Play | `docs/BUILD_ANDROID.md` |
| iOS build for the App Store (needs a Mac) | `docs/BUILD_IOS.md` |
| Everything you must do before submitting | `docs/RELEASE_CHECKLIST.md` |
| Store texts, privacy policy, age rating | `store/` |
| Swap art, add guns / characters / skins | `docs/ASSET_GUIDE.md` |
| How the code fits together | `docs/ARCHITECTURE.md` |

Quick version:

```bash
npm install
npm run assets          # generates every icon / splash size from /resources
npm run cap:add:android
npm run android         # builds release web bundle, syncs, opens Android Studio
```

## Important before you publish

1. Change `appId` in `capacitor.config.json` (`com.yourstudio.warzone`) - it can never change after release.
2. `npm run build:release` flips `CONFIG.BUILD` to `"release"`, which **removes the admin console**.
   In dev builds anyone who registers as NITIN / NAMAN / LOVEKESH becomes admin.
3. Fill in the `[PLACEHOLDERS]` in `store/privacy-policy.md` and host it on a public URL.
4. Read the IP note in `docs/RELEASE_CHECKLIST.md` about the Cowboy character.
