# Stěhování Stihnuta na novou adresu

Cíl: kratší adresa (např. **stihnu.vercel.app**) bez ztráty dat a bez nového přihlašování.

## Jaká adresa

| Adresa | Cena | Stav k 6. 11. 2026 |
| --- | --- | --- |
| `stihnu.vercel.app` | **zdarma** | volná (Vercel hlásí `DEPLOYMENT_NOT_FOUND`) |
| `stihnu.app` | cca 350 Kč/rok | volná (DNS: doména neexistuje) |
| `stihnu.eu` | cca 150–250 Kč/rok | volná |
| `stihnu.to` | cca 500–750 Kč/rok | volná |
| `stihnu.cz` | – | **obsazená** (registrována 24. 3. 2026) |

Doporučení: hned teď zdarma `stihnu.vercel.app`; vlastní doménu lze přidat kdykoli později stejným postupem.

## Postup (asi 10 minut)

1. **Vercel** → projekt *prazskystudent* → **Settings → Domains → Add** → `stihnu.vercel.app` → Save.
   (Vlastní doména: zadejte ji a nastavte DNS podle pokynů Vercelu.)
2. **Google Cloud Console** → *Clients* → váš OAuth klient:
   - *Authorized JavaScript origins*: přidejte `https://stihnu.vercel.app` (starou adresu zatím nechte).
3. **Google Picker API klíč** (Credentials → klíč pro Picker) → *Website restrictions*: přidejte `https://stihnu.vercel.app/*`.
4. **Supabase** → *Authentication → URL Configuration*:
   - *Site URL*: `https://stihnu.vercel.app`
   - *Redirect URLs*: přidejte `https://stihnu.vercel.app/**` (starou adresu zatím nechte).
5. **Vercel** → *Settings → Environment Variables*: `PUBLIC_CANONICAL_ORIGIN` = `https://stihnu.vercel.app` → **Redeploy**.

## Co se pak stane

- Na staré adrese uvidí přihlášený student okno **„Stihnuto má novou adresu“**. Jedním klepnutím se vytvoří
  jednorázové propojení (stejné jako QR kód pro telefon, platí 3 minuty) rovnou pro novou adresu:
  student je tam hned přihlášený i odemčený a data se stáhnou ze zašifrované zálohy účtu.
- Nepřihlášené návštěvníky a ukázku stará adresa rovnou přesměruje.
- Na nové adrese je potřeba jednou znovu potvrdit Google (Google pamatuje přístup pro každou adresu zvlášť)
  a na telefonu přidat novou ikonu na plochu. Vlastní fotky pozadí a statistiky soustředění zůstávají
  jen v zařízení – fotky je potřeba nahrát znovu.
- Stará adresa funguje dál. Až budou všichni přestěhovaní, lze ji ve Vercelu odebrat.
