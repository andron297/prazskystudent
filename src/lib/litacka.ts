/**
 * Aplikace PID Lítačka (jízdenky): na telefonu ji otevře rovnou – na Androidu
 * přes intent (když není nainstalovaná, otevře se Google Play), na iPhonu přes
 * App Store, kde je tlačítko „Otevřít“. Na počítači se odkaz nezobrazuje.
 */
const ANDROID_PACKAGE = 'cz.dpp.praguepublictransport';
const PLAY = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const APP_STORE = 'https://apps.apple.com/cz/app/pid-l%C3%ADta%C4%8Dka/id983071129';

export function litackaLink(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string | null {
  if (/Android/i.test(ua)) return `intent://#Intent;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY)};end`;
  // iPad se v Safari hlásí jako Mac – pozná se podle dotykové obrazovky.
  const iPadOs = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOs) return APP_STORE;
  return null;
}
