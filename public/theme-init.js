/* Nastaví motiv ještě před prvním vykreslením (bez probliknutí). */
(function () {
  var pref = 'system';
  var look = null;
  try {
    var raw = localStorage.getItem('stihnu:v1');
    if (raw) {
      var parsed = JSON.parse(raw);
      var settings = parsed && parsed.state && parsed.state.settings;
      if (settings && settings.theme) pref = settings.theme;
      if (settings && settings.appearance) look = settings.appearance;
    }
  } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  /* Barevný motiv a písmo ze Vzhledu (vlastní barvu doplní aplikace) */
  if (look) {
    if (typeof look.accent === 'string' && /^[a-z]{2,12}$/.test(look.accent)) root.setAttribute('data-accent', look.accent);
    if (look.headingFont === 'sans') root.setAttribute('data-heading', 'sans');
    if (look.background && look.background !== 'paper') root.setAttribute('data-backdrop', 'on');
  }
})();

/* Čisté adresy pro Google a odkazy zvenčí: /soukromi → /#/soukromi, /podminky → /#/podminky. */
(function () {
  var m = /^\/(soukromi|podminky)\/?$/.exec(location.pathname);
  if (m) history.replaceState(null, '', '/#/' + m[1]);
})();
