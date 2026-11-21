/* =========================================================
   MAIN  -  boot + native (Capacitor) hooks
========================================================= */
(function(){
const WZ = window.WZ, $ = WZ.$;

/* keep the screen awake while playing (ignored where unsupported) */
let wake = null;
WZ.requestWake = async function(){
    try{ if(navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); }catch(e){}
};
document.addEventListener("visibilitychange", () => {
    if(!document.hidden && WZ.game && WZ.game.running) WZ.requestWake();
});

/* block pinch / double-tap zoom and the long-press menu (iOS Safari + WebView) */
["gesturestart", "gesturechange", "gestureend"].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
document.addEventListener("contextmenu", e => { if(!(e.target instanceof HTMLInputElement)) e.preventDefault(); });

/* Capacitor: hardware back button, status bar, splash */
function hookNative(){
    const cap = window.Capacitor;
    if(!cap || !cap.Plugins) return;
    const P = cap.Plugins;
    try{ P.StatusBar && P.StatusBar.hide && P.StatusBar.hide(); }catch(e){}
    try{
        P.App && P.App.addListener("backButton", () => {
            if(WZ.ui.modalOpen()) return WZ.ui.closeModal();
            if(WZ.game.onBack()) return;
            if(!$("home").classList.contains("hidden") && P.App.minimizeApp) P.App.minimizeApp();
        });
        P.App && P.App.addListener("appStateChange", s => { if(!s.isActive && WZ.game.running) WZ.game.pause(); });
    }catch(e){}
    try{ P.SplashScreen && P.SplashScreen.hide && P.SplashScreen.hide(); }catch(e){}
}

document.addEventListener("DOMContentLoaded", () => {
    hookNative();
    WZ.ui.boot().catch(err => {
        console.error(err);
        $("loadText").textContent = "ERROR: " + (err && err.message);
    });
});
})();
