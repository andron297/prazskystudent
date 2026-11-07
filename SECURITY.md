# Bezpečnost

## Účty a šifrování (end-to-end)

- Přihlášení obstarává **Supabase Auth** (Google nebo e-mail s potvrzením). Databáze má zapnuté **Row Level Security**:
  každý přihlášený uživatel vidí jen svůj řádek, anonymní přístup je odebraný.
- Obsah účtu (rozvrh, úkoly, předměty, propojení, klíče) se šifruje **v prohlížeči** klíčem k datům
  (AES-256-GCM, náhodný 256bitový klíč). Na server jde jen šifrový text, svázaný s ID uživatele (AAD).
- Klíč k datům je na serveru jen **zabalený**:
  - **záchranným kódem** (25 znaků, 125 bitů náhody, HKDF-SHA256) – zobrazí se jen jednou, server ho nikdy nevidí;
  - u e-mailových účtů i **klíčem z hesla** (PBKDF2-SHA256, 600 000 iterací, sůl = e-mail).
- **Heslo se na server neposílá.** Supabase dostane jen odvozený přihlašovací otisk (jiná polovina téže derivace),
  ze kterého klíč k datům spočítat nejde. Nová hesla se kontrolují proti únikům (Have I Been Pwned, k-anonymita).
- V zařízení je klíč uložený zašifrovaný nevyexportovatelným klíčem zařízení (WebCrypto, IndexedDB).
- Ztráta hesla i záchranného kódu = data v účtu obnovit nejde (to je cena za to, že je nikdo jiný nepřečte).
- Propojení s Googlem pro další zařízení: refresh token zapečetěný serverovým klíčem **a** svázaný s ID účtu,
  uložený v šifrovaném trezoru – bez přihlášení k tomu účtu je k ničemu.
- Prohlížeč: přísná **Content-Security-Policy** (bez inline skriptů), HSTS, `frame-ancestors 'none'`,
  `Cross-Origin-Opener-Policy`, `Permissions-Policy`.
- Sdílená AI správce je jen pro přihlášené a s hodinovým limitem.

## Jak s daty zachází Stihnuto

- **Bez účtu** data zůstávají jen v prohlížeči. **S účtem** jsou na serveru jen zašifrovaná (viz výše).
- **Server jen přeposílá** dotazy, které prohlížeč sám udělat nemůže (CORS, klíče): PID/Transitous, Golemio, Moodle, iCal, SIS, Google OAuth, AI. Nic z toho neukládá.
- **Klíče provozovatele** (`GOLEMIO_API_KEY`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`) jsou jen v proměnných prostředí serveru – nikdy v kódu ani v prohlížeči.
- **Google**: access token jen v paměti; refresh token (serverové přihlášení) zašifrovaný AES-256-GCM v cookie `HttpOnly; Secure; SameSite=Strict`, endpoint vyžaduje vlastní hlavičku.
- **Proxy** chrání proti SSRF (jen `https`, kontrola DNS i přesměrování, limity velikosti a času); plánovač tras přijímá jen souřadnice v okolí Prahy a ID zastávek PID, Moodle proxy jen čtecí funkce.
- **Záloha** (export JSON) neobsahuje API klíče ani Moodle token.

## Nahlášení zranitelnosti

Prosím **nepiš veřejné issue**. Použij na GitHubu *Security → Report a vulnerability* (soukromé hlášení).
Odpovíme co nejdřív a po opravě rádi uvedeme poděkování.
