# Google: chyba 403 a varování „Google tuto aplikaci neověřil“

Návod pro správce aplikace Stihnuto (provozovatele nasazení na Vercelu). Uživatelé
v aplikaci najdou obrázkový postup v Nastavení → Propojení → Google a v průvodci
nastavením.

## Proč Google hlásí 403 a proč varuje

| Co uživatel vidí | Proč | Co s tím |
| --- | --- | --- |
| **„Přístup zablokován: aplikace Stihnuto neprošla procesem ověření Googlu“, Chyba 403: access_denied** | Aplikace je v Google Cloud ve stavu **Testing**. Pustí jen účty ze seznamu *Test users*. | Zveřejnit aplikaci (krok 1), nebo přidat účet mezi testery. |
| **„Google tuto aplikaci neověřil“** (s odkazy *Rozšířené → Přejít na web … (nebezpečné)*) | Aplikace žádá o citlivá oprávnění (Kalendář, Úkoly) a neprošla ověřením u Googlu. | Uživatel může pokračovat přes *Rozšířené*. Varování úplně zmizí až po ověření (krok 2). |

Kalendář (`calendar`) a Úkoly (`tasks`) Google řadí mezi **citlivá** (sensitive)
oprávnění. Ověření je pro ně **zdarma**: placený bezpečnostní audit vyžadují jen
*restricted* oprávnění (Gmail, celý Disk), a ta Stihnuto nepoužívá. Disk
používá jen `drive.file` a `drive.appdata` (přístup k souborům, které vytvoří
nebo vybere sama aplikace). Ta oprávnění citlivá nejsou.

Dokud aplikace není ověřená, smí ji používat nejvýš **100 uživatelů**. Je to
limit Googlu pro neověřené aplikace s citlivými oprávněními a počítá se za celou
dobu existence projektu.

## Krok 1 – zveřejnit aplikaci (chyba 403 zmizí hned)

1. Otevřete <https://console.cloud.google.com/auth/audience> a nahoře vyberte projekt aplikace.
2. U **Publishing status** klikněte na **Publish app** a potvrďte **Confirm**.
3. Stav se změní na **In production**. Propojit se teď může kdokoli. Do ověření
   se mu jen ukáže varování „Google tuto aplikaci neověřil“.

> **Pozor:** dokud je aplikace ve stavu *Testing*, Google zruší přihlášení po 7
> dnech (refresh token vyprší). Stav *In production* tím netrpí.

## Krok 2 – ověření u Googlu (zmizí i varování)

Vše se dělá v **Google Auth Platform**: <https://console.cloud.google.com/auth/overview>.

### 2.1 Branding

| Pole | Hodnota |
| --- | --- |
| App name | `Stihnuto` |
| User support email | kontaktní e-mail provozovatele |
| App logo | `public/icons/icon-512.png` zmenšené na 120 × 120 px (PNG, čtverec) |
| Application home page | `https://stihnuto.vercel.app/o-aplikaci` |
| Application privacy policy link | `https://stihnuto.vercel.app/soukromi` |
| Application terms of service link | `https://stihnuto.vercel.app/podminky` |
| Authorized domains | `stihnuto.vercel.app` |
| Developer contact information | kontaktní e-mail provozovatele |

Stránky `/o-aplikaci`, `/soukromi` a `/podminky` jsou veřejné, bez přihlášení
a bez úvodní animace. Zásady obsahují oddíl **4. Data z účtu Google** s
prohlášením o *Limited Use*, které Google vyžaduje.

> Pokud se aplikace bude stěhovat na vlastní doménu (viz `docs/STEHOVANI.md`),
> udělejte ověření až na **konečné** doméně. Po změně domény se ověřuje znovu.

### 2.2 Ověření vlastnictví domény

Google musí vidět, že doména patří vám:

1. Otevřete <https://search.google.com/search-console>, přidejte vlastnost typu
   **Předpona adresy URL** `https://stihnuto.vercel.app/` a zvolte ověření
   **souborem HTML**.
2. Stažený soubor (např. `google1234abcd.html`) dejte do složky `public/` a nasaďte.
   Bude dostupný na `https://stihnuto.vercel.app/google1234abcd.html`.
3. V Search Console klikněte na **Ověřit**. Ověřujte stejným účtem Google,
   který je vlastníkem projektu v Google Cloud.

### 2.3 Data access – oprávnění a zdůvodnění

V **Data access** musí být přesně tato oprávnění. Ke každému citlivému vložte
zdůvodnění (anglicky):

**`https://www.googleapis.com/auth/calendar`**

> Stihnuto is a study planner for university students. With the user's consent it creates a dedicated secondary calendar named "Stihnuto · studium" and keeps the student's class schedule, exams and deadlines in sync with it in both directions (changes made in Google Calendar are pulled back). The user can instead choose an existing calendar as the target, and can optionally select other calendars whose events are shown read-only in the planner. Listing calendars, creating the dedicated calendar and reading/writing its events require the calendar scope; narrower scopes cannot list the user's calendars or read the calendars the user explicitly selects.

**`https://www.googleapis.com/auth/tasks`**

> Stihnuto creates a task list named "Stihnuto" and synchronizes the student's assignments and deadlines (from the university LMS and from the student's own to-dos) with Google Tasks in both directions, so that completing a task on the phone marks it done in the app and vice versa. This requires creating, reading, updating and deleting tasks in that list.

`drive.file` a `drive.appdata` citlivé nejsou a zdůvodnění nepotřebují.

### 2.4 Ukázkové video (YouTube, „Neveřejné“)

Google chce video, které ukáže přihlášení a použití každého oprávnění. Stačí 2–3
minuty nahrávky obrazovky v angličtině nebo s anglickými titulky:

1. Otevřít `https://stihnuto.vercel.app`, Nastavení → Propojení → **Propojit s Googlem**.
2. V okně Googlu ukázat **adresní řádek s `client_id`** a celý souhlas s oprávněními (název aplikace Stihnuto).
3. Ukázat, že v Kalendáři Google vznikl kalendář „Stihnuto · studium“ s rozvrhem a termíny. Změnit v něm událost a ukázat, že se změna objevila v aplikaci.
4. Ukázat seznam „Stihnuto“ v Google Úkolech, odškrtnout úkol v telefonu a ukázat ho odškrtnutý v aplikaci.
5. Ukázat, kde se propojení ruší (Nastavení → Propojení → Google → Odpojit).

### 2.5 Odeslání

**Verification centre** → **Prepare for verification** → zkontrolovat → **Submit**.
Google se ozve e-mailem, obvykle do několika dnů až týdnů. Na dotazy odpovídejte
ze stejného e-mailu. Po schválení varování zmizí a limit 100 uživatelů padá.

## Alternativa: méně oprávnění

Google nabízí i užší oprávnění kalendáře, např. `calendar.app.created` (jen
kalendáře, které aplikace sama vytvoří). Jak je Google řadí, ukazuje stránka
**Data access** přímo v konzoli u každého oprávnění. Pokud by bylo necitlivé,
šlo by bez ověření propojit aspoň kalendář „Stihnuto · studium“. Přišlo by se
ale o volbu cílového kalendáře a o zrcadlení dalších kalendářů. Úkoly Google
zůstanou citlivé v každém případě.
