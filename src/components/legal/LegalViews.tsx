/**
 * Podmínky použití a Zásady ochrany osobních údajů – srozumitelně a česky.
 * Kontaktní e-mail je výchozí (CONTACT_EMAIL); správce ho může změnit v PUBLIC_CONTACT_EMAIL.
 */
import type { ReactNode } from 'react';
import { useUiStore } from '../../store/uiStore';
import { SerifTitle } from '../ui/primitives';

const EFFECTIVE = '7. listopadu 2026';
const OPERATOR = 'Ondřej Andrle';
const REPO = 'https://github.com/andron297/prazskystudent';
/** Výchozí kontakt provozovatele (platí i offline, když server neodpoví). */
export const CONTACT_EMAIL = 'andrleondrej@gmail.com';

function Contact() {
  const email = useUiStore((s) => s.server.contactEmail) ?? CONTACT_EMAIL;
  return (
    <a href={`mailto:${email}`} className="font-semibold text-accent hover:underline">
      {email}
    </a>
  );
}

function Page({ kicker, title, children, dated = true }: { kicker: string; title: ReactNode; children: ReactNode; dated?: boolean }) {
  return (
    <article className="mx-auto max-w-3xl">
      <p className="eyebrow text-subtle">{kicker}</p>
      <SerifTitle as="h1" className="mt-1 text-[44px] sm:text-[56px]">
        {title}
      </SerifTitle>
      {dated && <p className="mt-2 text-[14px] text-muted">Platné od {EFFECTIVE}</p>}
      <div className="card mt-6 space-y-6 rounded-[28px] p-6 text-[15px] leading-relaxed sm:p-9 [&_h2]:font-display [&_h2]:text-[26px] [&_h2]:leading-tight [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_li]:text-muted">
        {children}
      </div>
    </article>
  );
}

/** Veřejná stránka o aplikaci (domovská stránka pro ověření u Googlu): co aplikace dělá a proč chce přístup ke Googlu. */
export function AboutView() {
  return (
    <Page kicker="O aplikaci" title={<>Stihnuto – studium <em className="text-moss">bez zmatku</em></>} dated={false}>
      <section>
        <p>
          Stihnuto je bezplatná studijní aplikace pro studenty pražských vysokých škol (hlavně Univerzity Karlovy). Na jednom místě ukáže rozvrh, termíny a úkoly ze SISu a Moodlu, kdy vyrazit na přednášku a čím jet (jízdní řády PID se zpožděním), počasí na cestu i jídelníček menzy. Funguje v prohlížeči i jako aplikace na ploše telefonu.
        </p>
        <p className="mt-2">
          Provozuje ji {OPERATOR} jako nekomerční projekt s otevřeným kódem (
          <a href={REPO} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            GitHub
          </a>
          ). Bez reklam a bez sledování.
        </p>
      </section>
      <section>
        <h2>Proč aplikace chce přístup ke Googlu</h2>
        <p>Propojení s Googlem je dobrovolné – aplikace funguje i bez něj. Když si ho zapnete, pak:</p>
        <ul>
          <li>
            <strong className="text-fg">Kalendář Google:</strong> do vlastního kalendáře „Stihnuto · studium“ zapíše rozvrh, zkoušky a termíny, takže je máte i v kalendáři v telefonu. Změny, které tam uděláte, převezme zpět.
          </li>
          <li>
            <strong className="text-fg">Úkoly Google:</strong> do seznamu „Stihnuto“ zapíše úkoly a termíny a odškrtnutí synchronizuje oběma směry.
          </li>
          <li>
            <strong className="text-fg">Disk Google:</strong> jen soubory, které k předmětu sami nahrajete nebo vyberete (materiály, poznámky). Ostatní soubory na Disku aplikace nevidí.
          </li>
        </ul>
        <p className="mt-2">
          Data z Googlu se zpracovávají jen ve vašem prohlížeči, nikomu se neprodávají a nepoužívají se k reklamě. Podrobnosti jsou v{' '}
          <a href="/soukromi" className="font-semibold text-accent hover:underline">
            zásadách ochrany osobních údajů
          </a>{' '}
          (oddíl 4) a{' '}
          <a href="/podminky" className="font-semibold text-accent hover:underline">
            podmínkách použití
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Kontakt</h2>
        <p>
          Dotazy a žádosti týkající se údajů: <Contact />.
        </p>
        <p className="mt-4">
          <a href="/#/dnes" className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-[15px] font-bold text-accent-fg hover:brightness-110">
            Otevřít Stihnuto
          </a>
        </p>
      </section>
    </Page>
  );
}

export function PrivacyView() {
  return (
    <Page kicker="Soukromí" title={<>Zásady ochrany <em className="text-moss">osobních údajů</em></>}>
      <section>
        <h2>Ve zkratce</h2>
        <ul>
          <li>Obsah vašeho účtu (rozvrh, úkoly, předměty, propojení, klíče) se šifruje přímo ve vašem zařízení. Na serveru je jen v zašifrované podobě a my ho přečíst nemůžeme.</li>
          <li>Neprodáváme žádná data, nepoužíváme reklamu ani sledovací cookies.</li>
          <li>Účet i všechna data můžete kdykoli stáhnout nebo smazat (Účet → Moje data / Smazat účet).</li>
        </ul>
      </section>
      <section>
        <h2>1. Kdo údaje zpracovává</h2>
        <p>
          Správcem osobních údajů je provozovatel aplikace Stihnuto, {OPERATOR}. Kontakt: <Contact />.
        </p>
      </section>
      <section>
        <h2>2. Jaké údaje a proč</h2>
        <ul>
          <li>
            <strong className="text-fg">Účet:</strong> e-mail, u přihlášení přes Google také jméno a profilová fotka. Slouží k přihlášení a synchronizaci (plnění smlouvy, čl. 6 odst. 1 písm. b) GDPR).
          </li>
          <li>
            <strong className="text-fg">Obsah účtu:</strong> ukládá se jen zašifrovaný klíčem, který máte jen vy (heslo nebo záchranný kód). Bez něj ho nikdo nepřečte.
          </li>
          <li>
            <strong className="text-fg">Technické záznamy:</strong> poskytovatelé hostingu krátce uchovávají záznamy o přístupech (např. IP adresu) kvůli bezpečnosti a provozu (oprávněný zájem, čl. 6 odst. 1 písm. f) GDPR).
          </li>
          <li>
            <strong className="text-fg">Údaje jen na chvíli, když použijete funkci:</strong> souřadnice startu a cíle při plánování cesty, přibližná poloha pro počasí, text, který necháte přečíst AI, a stránky SIS a Moodlu, které načítáme přes náš server. Nic z toho neukládáme. Poloha během navigace se nikam neposílá – zpracovává se jen v zařízení.
          </li>
        </ul>
      </section>
      <section>
        <h2>3. Komu údaje předáváme</h2>
        <ul>
          <li>Supabase (účty a zašifrovaná data, servery v EU – Frankfurt) a Vercel (provoz aplikace).</li>
          <li>Google – jen pokud si Kalendář, Úkoly nebo Disk propojíte.</li>
          <li>OVHcloud AI Endpoints (bezplatná AI, servery v EU – Francie) – jen text sylabu, harmonogramu nebo stránky, který necháte přečíst. Posíláme ho přes náš server bez vaší identity a poskytovatel ho podle svých podmínek neukládá.</li>
          <li>Pokud si vložíte vlastní klíč: Google Gemini, OpenAI nebo Anthropic – jen text, který necháte přečíst, podle podmínek daného poskytovatele.</li>
          <li>Transitous a PID Golemio (trasy a odjezdy), Open-Meteo (počasí) – dostanou jen souřadnice, ne vaši identitu.</li>
          <li>Koleje a menzy UK (jídelníček) a OpenFreeMap (mapové podklady) – nedostanou o vás nic, jen dotaz na jídelníček nebo mapu.</li>
        </ul>
        <p className="mt-2">Někteří poskytovatelé sídlí v USA; předání je chráněné standardními smluvními doložkami nebo rámcem EU–USA pro ochranu údajů.</p>
      </section>
      <section id="google">
        <h2>4. Data z účtu Google</h2>
        <p>Když si propojíte Google, aplikace s vaším souhlasem používá:</p>
        <ul>
          <li>
            <strong className="text-fg">Kalendář Google</strong> – založí kalendář „Stihnuto · studium“, zapisuje do něj rozvrh, termíny a důležité dny a čte zpět jejich změny (aby synchronizace fungovala oběma směry).
          </li>
          <li>
            <strong className="text-fg">Úkoly Google</strong> – založí seznam „Stihnuto“ a synchronizuje v něm vaše úkoly a termíny oběma směry.
          </li>
          <li>
            <strong className="text-fg">Disk Google</strong> – jen soubory a složky, které s aplikací sami vytvoříte nebo vyberete (materiály k předmětům). K ostatním souborům aplikace přístup nemá.
          </li>
        </ul>
        <p className="mt-2">
          Data z Googlu se zpracovávají jen ve vašem prohlížeči a mezi ním a Googlem. Náš server jen pomáhá s přihlášením: přihlašovací token zapečetí (zašifruje) a ten se uloží ve vašem zařízení, případně ve vašem zašifrovaném účtu – server sám nic z Googlu neukládá. Data z Googlu nikomu neprodáváme, nepoužíváme je k reklamě ani k trénování AI a nikdo je nečte – výjimkou je jen řešení problému na vaši výslovnou žádost, bezpečnost nebo zákonná povinnost. Propojení zrušíte v aplikaci (Nastavení → Propojení → Google) nebo na{' '}
          <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            myaccount.google.com/connections
          </a>
          .
        </p>
        <p className="mt-2">
          Používání a předávání informací získaných z Google API se řídí zásadami{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            Google API Services User Data Policy
          </a>
          , včetně požadavků na omezené použití (Limited Use).
        </p>
        <p className="mt-2 text-[13px] text-subtle" lang="en">
          Stihnuto&apos;s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.
        </p>
      </section>
      <section>
        <h2>5. Jak dlouho</h2>
        <p>Dokud máte účet. Po jeho smazání data zmizí hned; ze záloh poskytovatele nejpozději do 30 dnů.</p>
      </section>
      <section>
        <h2>6. Vaše práva</h2>
        <ul>
          <li>přístup k údajům a jejich přenositelnost (Účet → Stáhnout moje data),</li>
          <li>oprava a výmaz (úpravy v aplikaci, Účet → Smazat účet),</li>
          <li>námitka a omezení zpracování – napište nám na kontakt výše,</li>
          <li>
            stížnost u Úřadu pro ochranu osobních údajů (
            <a href="https://uoou.gov.cz" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
              uoou.gov.cz
            </a>
            ).
          </li>
        </ul>
      </section>
      <section>
        <h2>7. Zabezpečení</h2>
        <p>
          Šifrování AES-256 přímo v zařízení, heslo se na server neposílá (jen z něj odvozený otisk), každý uživatel vidí v databázi jen svůj zašifrovaný záznam, veškerá komunikace běží přes HTTPS a kód aplikace je veřejný (
          <a href={REPO} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            GitHub
          </a>
          ), takže ho může kdokoli zkontrolovat. Pokud by přesto došlo k bezpečnostnímu incidentu, který by vás mohl ohrozit, dáme vám vědět a postupujeme podle GDPR.
        </p>
      </section>
      <section>
        <h2>8. Věk a cookies</h2>
        <p>Účet si může založit člověk starší 15 let. Aplikace používá jen nezbytné místní úložiště a cookies pro přihlášení – žádné reklamní ani analytické.</p>
      </section>
      <section>
        <h2>9. Změny</h2>
        <p>O podstatných změnách těchto zásad dáme vědět v aplikaci.</p>
      </section>
    </Page>
  );
}

export function TermsView() {
  return (
    <Page kicker="Pravidla" title={<>Podmínky <em className="text-moss">použití</em></>}>
      <section>
        <h2>1. O aplikaci</h2>
        <p>
          Stihnuto je bezplatná nekomerční aplikace pro studenty, kterou provozuje {OPERATOR} (dále „provozovatel“). Kód je veřejný pod licencí MIT. Kontakt: <Contact />.
        </p>
      </section>
      <section>
        <h2>2. Účet</h2>
        <ul>
          <li>Účet si může založit člověk starší 15 let, a to jen pro sebe.</li>
          <li>Za bezpečí svého hesla a záchranného kódu odpovídáte vy. Data jsou šifrovaná vaším klíčem – když ztratíte heslo i záchranný kód, data v účtu obnovit nejde a provozovatel je obnovit nemůže.</li>
          <li>Účet můžete kdykoli smazat v aplikaci (Účet → Smazat účet).</li>
        </ul>
      </section>
      <section>
        <h2>3. Pravidla užívání</h2>
        <p>Aplikaci nepoužívej v rozporu se zákonem, nepokoušej se obcházet její zabezpečení a nezatěžuj úmyslně ji ani propojené služby (SIS, Moodle, PID, Google).</p>
      </section>
      <section>
        <h2>4. Údaje z jiných služeb</h2>
        <p>
          Spoje, zpoždění, rozvrh, termíny, jídelníček a počasí přebíráme od jiných služeb (PID, Transitous, Univerzita Karlova, Google, Open-Meteo a dalších). Jsou orientační a mohou být neúplné nebo zpožděné. Důležité věci – odjezdy, termíny odevzdání a zkoušek – si vždy ověřte u zdroje.
        </p>
      </section>
      <section>
        <h2>5. Bez záruky</h2>
        <p>Aplikace se poskytuje zdarma tak, jak je, bez záruky nepřetržité dostupnosti, bezchybnosti nebo vhodnosti pro určitý účel. Provozovatel může aplikaci kdykoli změnit nebo ukončit; o ukončení dá vědět s předstihem, aby bylo dost času stáhnout si svá data.</p>
      </section>
      <section>
        <h2>6. Omezení odpovědnosti</h2>
        <p>
          V rozsahu, který připouští právní předpisy, provozovatel neodpovídá za škodu vzniklou používáním aplikace nebo nemožností ji používat – zejména za zmeškaný spoj, zmeškaný termín, ztrátu dat způsobenou ztrátou hesla a záchranného kódu ani za výpadky služeb třetích stran. Tím není omezena odpovědnost za škodu způsobenou úmyslně nebo z hrubé nedbalosti ani práva, která podle zákona nelze vyloučit.
        </p>
      </section>
      <section>
        <h2>7. Změny podmínek</h2>
        <p>O podstatných změnách dáme vědět v aplikaci. Pokud s nimi nesouhlasíte, můžete účet kdykoli smazat.</p>
      </section>
      <section>
        <h2>8. Rozhodné právo</h2>
        <p>Tyto podmínky se řídí právem České republiky.</p>
      </section>
    </Page>
  );
}
