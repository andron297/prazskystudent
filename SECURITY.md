# Bezpečnost

## Jak s daty zachází Stihnu

- **Data studenta zůstávají v jeho prohlížeči** (localStorage, soubory v IndexedDB). Aplikace nemá účty ani databázi s osobními daty.
- **Server jen přeposílá** dotazy, které prohlížeč sám udělat nemůže (CORS, klíče): PID/Transitous, Golemio, Moodle, iCal, SIS, Google OAuth, AI. Nic z toho neukládá.
- **Klíče provozovatele** (`GOLEMIO_API_KEY`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`) jsou jen v proměnných prostředí serveru – nikdy v kódu ani v prohlížeči.
- **Google**: access token jen v paměti; refresh token (serverové přihlášení) zašifrovaný AES-256-GCM v cookie `HttpOnly; Secure; SameSite=Strict`, endpoint vyžaduje vlastní hlavičku.
- **Proxy** chrání proti SSRF (jen `https`, kontrola DNS i přesměrování, limity velikosti a času); plánovač tras přijímá jen souřadnice v okolí Prahy a ID zastávek PID, Moodle proxy jen čtecí funkce.
- **Záloha** (export JSON) neobsahuje API klíče ani Moodle token.

## Nahlášení zranitelnosti

Prosím **nepiš veřejné issue**. Použij na GitHubu *Security → Report a vulnerability* (soukromé hlášení).
Odpovíme co nejdřív a po opravě rádi uvedeme poděkování.
