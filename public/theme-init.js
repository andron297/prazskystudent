/* Nastaví motiv ještě před prvním vykreslením (bez probliknutí). */
(function () {
  var pref = 'system';
  try {
    var raw = localStorage.getItem('stihnu:v1');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.state && parsed.state.settings && parsed.state.settings.theme) {
        pref = parsed.state.settings.theme;
      }
    }
  } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();

/* Čisté adresy pro Google a odkazy zvenčí: /soukromi → /#/soukromi, /podminky → /#/podminky. */
(function () {
  var m = /^\/(soukromi|podminky)\/?$/.exec(location.pathname);
  if (m) history.replaceState(null, '', '/#/' + m[1]);
})();
