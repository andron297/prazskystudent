/**
 * Podmínky použití a Zásady ochrany osobních údajů – srozumitelně a česky.
 * Kontaktní e-mail je výchozí (CONTACT_EMAIL); správce ho může změnit v PUBLIC_CONTACT_EMAIL.
 */
import type { ReactNode } from 'react';
import { useUiStore } from '../../store/uiStore';
import { SerifTitle } from '../ui/primitives';

const EFFECTIVE = '6. listopadu 2026';
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

function Page({ kicker, title, children }: { kicker: string; title: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl">
      <p className="eyebrow text-subtle">{kicker}</p>
      <SerifTitle as="h1" className="mt-1 text-[44px] sm:text-[56px]">
        {title}
      </SerifTitle>
      <p className="mt-2 text-[14px] text-muted">Platné od {EFFECTIVE}</p>
      <div className="card mt-6 space-y-6 rounded-[28px] p-6 text-[15px] leading-relaxed sm:p-9 [&_h2]:font-display [&_h2]:text-[26px] [&_h2]:leading-tight [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_li]:text-muted">
        {children}
      </div>
    </article>
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
          Správcem osobních údajů je provozovatel aplikace Stihnu, {OPERATOR}. Kontakt: <Contact />.
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
      <section>
        <h2>4. Jak dlouho</h2>
        <p>Dokud máte účet. Po jeho smazání data zmizí hned; ze záloh poskytovatele nejpozději do 30 dnů.</p>
      </section>
      <section>
        <h2>5. Vaše práva</h2>
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
        <h2>6. Zabezpečení</h2>
        <p>
          Šifrování AES-256 přímo v zařízení, heslo se na server neposílá (jen z něj odvozený otisk), každý uživatel vidí v databázi jen svůj zašifrovaný záznam, veškerá komunikace běží přes HTTPS a kód aplikace je veřejný (
          <a href={REPO} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            GitHub
          </a>
          ), takže ho může kdokoli zkontrolovat. Pokud by přesto došlo k bezpečnostnímu incidentu, který by vás mohl ohrozit, dáme vám vědět a postupujeme podle GDPR.
        </p>
      </section>
      <section>
        <h2>7. Věk a cookies</h2>
        <p>Účet si může založit člověk starší 15 let. Aplikace používá jen nezbytné místní úložiště a cookies pro přihlášení – žádné reklamní ani analytické.</p>
      </section>
      <section>
        <h2>8. Změny</h2>
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
          Stihnu je bezplatná nekomerční aplikace pro studenty, kterou provozuje {OPERATOR} (dále „provozovatel“). Kód je veřejný pod licencí MIT. Kontakt: <Contact />.
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
