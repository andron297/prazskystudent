# Stěhování Stihnuta na stihnuto.vercel.app

Cíl: adresa **stihnuto.vercel.app** bez ztráty dat a bez nového přihlašování.

## Proč ne stihnuto.web.app

`*.web.app` je hosting Firebase (Google). Aplikace ale potřebuje i serverovou část
(`/api/*` – plánovač spojů, menzy, SIS, Moodle, účty), kterou Firebase umí jen přes
Cloud Functions na placeném tarifu Blaze a s přepsáním serveru. `stihnuto.vercel.app`
je zdarma a funguje hned, se stejným kódem.

## Stav k 9. 11. 2026

Na `stihnuto.vercel.app` už běží **samostatný projekt ve Vercelu** se stejným kódem,
ale **bez proměnných prostředí** (bez účtů, Googlu a Golemia – `/api/health` vrací
`account: null`). Adresa tedy patří vašemu účtu, jen je v jiném projektu.

## Postup (asi 10 minut)

Doporučená varianta – jeden projekt, dvě adresy (nastavení i proměnné zůstanou):

1. **Vercel** → projekt **stihnuto** (ten prázdný) → *Settings → General* → úplně dole
   **Delete Project**. Tím se uvolní adresa `stihnuto.vercel.app`.
2. **Vercel** → projekt **prazskystudent** → *Settings → Domains* → **Add Domain** →
   `stihnuto.vercel.app` → Save. (Volitelně *Settings → General → Project Name*
   přejmenovat na `stihnuto`.)
3. **Google Cloud Console** → *Google Auth Platform → Clients* → váš OAuth klient →
   *Authorized JavaScript origins*: přidejte `https://stihnuto.vercel.app`
   (starou adresu zatím nechte). V *Branding* změňte odkazy na domovskou stránku,
   zásady a podmínky a přidejte autorizovanou doménu `stihnuto.vercel.app`.
4. **Google Picker API klíč** (*Credentials*) → *Website restrictions*: přidejte
   `https://stihnuto.vercel.app/*`.
5. **Supabase** → *Authentication → URL Configuration*:
   - *Site URL*: `https://stihnuto.vercel.app`
   - *Redirect URLs*: přidejte `https://stihnuto.vercel.app/**` (starou nechte).
6. **Vercel** → projekt **prazskystudent** → *Settings → Environment Variables* →
   `PUBLIC_CANONICAL_ORIGIN` = `https://stihnuto.vercel.app` → **Redeploy**.

Varianta B (když chcete prázdný projekt `stihnuto` zachovat): zkopírujte do něj všechny
proměnné prostředí z projektu prazskystudent, redeploy, a krok 6 udělejte jen
v projektu prazskystudent. Kroky 3–5 platí stejně.

## Co se pak stane

- Na staré adrese uvidí přihlášený student okno **„Stihnuto má novou adresu“**. Jedním
  klepnutím se vytvoří jednorázové propojení (jako QR kód pro telefon) rovnou pro novou
  adresu: je tam hned přihlášený i odemčený a data se stáhnou ze zašifrované zálohy účtu.
- Nepřihlášené návštěvníky a ukázku stará adresa rovnou přesměruje.
- Na nové adrese je potřeba jednou znovu potvrdit Google (přístup se pamatuje pro každou
  adresu zvlášť) a na telefonu přidat novou ikonu na plochu. Vlastní fotky pozadí zůstávají
  jen v zařízení – je potřeba je nahrát znovu.
- QR kódy a adresa v prezentacích se řídí `PUBLIC_CANONICAL_ORIGIN` samy.
- Stará adresa funguje dál; až budou všichni přestěhovaní, lze ji ve Vercelu odebrat.
