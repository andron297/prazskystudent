/**
 * Podrobný průvodce aplikací – co která část umí a jak ji použít.
 * Krátké věty, žádné zkratky, u každé funkce tlačítko „Ukázat“.
 */
import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { navigateTo, type View } from '../../hooks/useAppShell';
import type { Emoji3DName } from '../../lib/emoji3d';
import { useUiStore } from '../../store/uiStore';
import { MOODLE_SHOTS, RealScreens } from '../setup/RealScreens';
import { Emoji3D } from '../ui/Emoji3D';
import { cn, Segmented, SerifTitle } from '../ui/primitives';

interface Section {
  id: string;
  emoji: Emoji3DName;
  title: string;
  lead: string;
  points: ReactNode[];
  view?: View;
}

const SECTIONS: Section[] = [
  {
    id: 'dnes',
    emoji: 'house',
    title: 'Dnes: kdy vyrazit a co vás čeká',
    lead: 'Úvodní obrazovka ukazuje jen to, co právě potřebujete.',
    points: [
      'Velký odpočet říká, za jak dlouho vyrazit, ze které zastávky (i nástupiště) a čím jet. Počítá s vaší rezervou.',
      'Nahoře čas, datum a kdo má svátek; fotka Prahy se mění podle denní doby.',
      'Karta „Dnes vás čeká“: budova, učebna, spoj a úkoly k dnešním předmětům. Večer se přepne na zítřek.',
    ],
    view: 'dnes',
  },
  {
    id: 'plan',
    emoji: 'spiral-calendar',
    title: 'Plán: úkoly, kalendář a harmonogram',
    lead: 'Všechno časové v jedné záložce, bez zdvojování.',
    points: [
      'Přehled, Úkoly, Týden, Měsíc a Rok – vlastní úkoly, Google Úkoly, termíny z Moodlu a SISu i harmonogram akademického roku.',
      'Po nahrání harmonogramu se zeptám na pár věcí (stupeň, ročník, forma studia) a termíny, které se vás netýkají, schovám.',
      'Co přidáte, propíše se do Google Kalendáře a Google Úkolů – i odpočty a důležité dny.',
      'Předmět k úkolu poznám sám – podle kódu, názvu, vyučujícího i zkratky (ČJ, AJ, matika, děják…).',
    ],
    view: 'plan',
  },
  {
    id: 'doprava',
    emoji: 'tram',
    title: 'Doprava: vyhledávač spojení',
    lead: 'Jako IDOS – odkud kamkoli, se zpožděním v reálném čase.',
    points: [
      'Zadejte zastávku, adresu nebo místo. Uvidíte všechny varianty, přestupy, chůzi a dobu cesty, i dřívější a pozdější spoje.',
      'U každého spoje je nástupiště (tramvaj a autobus: písmeno sloupku, metro a vlak: kolej).',
      'Když se blíží přednáška, nastaví se sám: cesta do budovy s příjezdem včas a doporučený spoj.',
    ],
    view: 'doprava',
  },
  {
    id: 'navigace',
    emoji: 'compass',
    title: 'Navigace až na nástupiště',
    lead: 'Pěšky po chodnících a přechodech, ve 3D a po směru chůze.',
    points: [
      'Klepněte na Navigovat. Mapa se natočí ve směru chůze, ukáže budovy ve 3D a pokyny typu „za 80 m odbočte vlevo“.',
      'Dovede vás přesně ke správnému sloupku nebo nástupišti; ve voze upozorní, kde vystoupit, a pak dovede do budovy.',
      'Pokyny umí číst nahlas a přepínač 2D/3D je vpravo na mapě.',
    ],
    view: 'doprava',
  },
  {
    id: 'skola',
    emoji: 'classical-building',
    title: 'Vaše škola a budovy',
    lead: 'Funguje pro všechny fakulty UK i další pražské školy.',
    points: [
      'Fakultu poznám podle rozvrhu sám; změnit ji můžete v Propojení → Škola a budovy.',
      'Budovy fakulty jsou v plánovači cest, na mapě a podle nich hledám menzu poblíž.',
      'Učíte se i jinde? Přidejte budovu podle adresy.',
    ],
    view: 'propojeni',
  },
  {
    id: 'predmety',
    emoji: 'books',
    title: 'Předměty, sylaby a Google Disk',
    lead: 'U každého předmětu je všechno pohromadě.',
    points: [
      'Sylabus a podmínky zakončení ze SISu – povinnosti, váhy a termíny z nich vytáhne AI, zdarma a bez klíče.',
      'Materiály z Moodlu, vlastní soubory, poznámky a odkazy.',
      'Google Disk: nahrajte soubor do složky předmětu, založte nový dokument, tabulku nebo prezentaci a uvidíte, kdo ho naposledy upravil.',
    ],
    view: 'predmety',
  },
  {
    id: 'pocasi',
    emoji: 'umbrella-with-rain-drops',
    title: 'Počasí a co si obléct',
    lead: 'Počasí ve chvíli, kdy půjdete ven, a oblečení na dnešek.',
    points: ['Bunda, čepice, šála, deštník nebo jen tričko – podle pocitové teploty a deště zvlášť na cestu tam a zpátky.'],
    view: 'dnes',
  },
  {
    id: 'soustredeni',
    emoji: 'tomato',
    title: 'Soustředění, hudba a odpočty',
    lead: 'Pomodoro, playlist na učení a odpočty do důležitých dnů.',
    points: [
      'Soustředění 25/5, 50/10 nebo 15/3 běží dál i na jiných stránkách; na konci cinkne a pošle upozornění. Ukazuje i dnešní minuty a sérii dní.',
      'Playlist ze Spotify bez přihlašování – na telefonu se otevře rovnou v aplikaci Spotify.',
      'Odpočty do zkouškového, státnic nebo prázdnin, v posledních dvou dnech na minuty.',
    ],
    view: 'dnes',
  },
  {
    id: 'upozorneni',
    emoji: 'bell',
    title: 'Upozornění: co je potřeba udělat',
    lead: 'Zvonek nahoře ukazuje, co hoří teď, dnes a tento týden.',
    points: [
      'Kdy vyrazit, termíny po splatnosti i blízké, úkoly a propojení, která chtějí jedno kliknutí.',
      'U každé položky je tlačítko, které ji rovnou vyřídí (Hotovo, Trasa, Potvrdit), nebo ji odložíte na později.',
      'Upozornění v telefonu: kdy vyrazit a termíny (večer předem a 3 hodiny před).',
    ],
  },
  {
    id: 'menza',
    emoji: 'fork-and-knife-with-plate',
    title: 'Jídelníček menzy',
    lead: 'Vaše oblíbené menzy, mezi kterými přepnete jedním klepnutím.',
    points: [
      'Výchozí je Menza Arnošta z Pardubic; vyberte si až čtyři oblíbené (hvězdička = hlavní).',
      'Nabídnu i menzu nejblíž dnešní výuce a tlačítkem Trasa vás tam dovedu.',
      'Studentské ceny, alergeny a víc dní dopředu.',
    ],
    view: 'dnes',
  },
  {
    id: 'vzhled',
    emoji: 'artist-palette',
    title: 'Vzhled podle vás',
    lead: 'Barvy, fotky, pozadí i písmo nadpisů.',
    points: [
      'Sedm barevných motivů (i vlastní barva), světlý a tmavý režim.',
      'Fotka na hlavní stránce automaticky podle denní doby, z galerie Prahy, nebo vlastní. Totéž pro pozadí celé aplikace.',
      'Vzhled otevřete ikonou palety na hlavní stránce nebo v Propojení.',
    ],
    view: 'vzhled',
  },
  {
    id: 'propojeni',
    emoji: 'link',
    title: 'Propojení a další zařízení',
    lead: 'U každé služby vidíte, že je propojená, od kdy a kdy naposledy přišla data.',
    points: [
      'SIS, Moodle, Google, hudba a upozornění – průvodce vás provede za pár minut, u Moodlu se skutečnými snímky obrazovky.',
      'Telefon propojíte QR kódem: na počítači Účet → Propojit telefon, telefonem naskenovat. Přihlásí se a odemkne sám.',
    ],
    view: 'propojeni',
  },
  {
    id: 'ucet',
    emoji: 'locked-with-key',
    title: 'Účet a bezpečnost',
    lead: 'Data se šifrují přímo v zařízení. Na serveru jsou jen zašifrovaná.',
    points: [
      'Přihlásíte se Googlem nebo e-mailem. Při založení dostanete záchranný kód – je to jediný náhradní klíč k datům.',
      'Kdykoli si stáhnete všechna data, odhlásíte se ze všech zařízení nebo účet smažete.',
    ],
    view: 'ucet',
  },
  {
    id: 'instalace',
    emoji: 'mobile-phone',
    title: 'Jak dát Stihnu na plochu telefonu',
    lead: 'Pak se otevírá jako normální aplikace – na celou obrazovku, s odpočtem na ikoně.',
    points: [
      <>
        <strong>iPhone (Safari):</strong> tlačítko Sdílet (čtvereček se šipkou) → <strong>Přidat na plochu</strong>.
      </>,
      <>
        <strong>Android (Chrome):</strong> tři tečky vpravo nahoře → <strong>Přidat na plochu</strong> nebo <strong>Instalovat aplikaci</strong>.
      </>,
      <>
        <strong>Počítač (Chrome, Edge):</strong> ikona instalace vpravo v adresním řádku. Dlouhým podržením ikony otevřete zkratky.
      </>,
    ],
  },
];

export function GuideView() {
  const startTour = useUiStore((s) => s.startTour);
  const openSetup = useUiStore((s) => s.openSetup);
  const [guide, setGuide] = useState<'sis' | 'moodle' | 'google'>('sis');

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="relative overflow-hidden rounded-[32px] bg-forest px-6 py-8 text-white sm:px-10 sm:py-11">
        <img src="/images/riverside-1200.webp" alt="" className="absolute inset-0 size-full object-cover opacity-70" />
        <div className="photo-scrim absolute inset-0" />
        <div className="relative">
          <p className="eyebrow text-white/75">Jak na Stihnu</p>
          <h1 className="mt-2 font-display text-[46px] leading-[0.95] sm:text-[62px]">
            Průvodce <em className="text-[#e7d6b5]">aplikací</em>
          </h1>
          <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-white/85">Všechno, co aplikace umí, krátce a po lopatě. Nejrychleji to pochopíte z minutové prohlídky přímo v aplikaci.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigateTo('dnes');
                setTimeout(startTour, 350);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#e7d6b5] px-5 text-[14.5px] font-bold text-[#1d3a2a] shadow-md transition hover:brightness-105"
            >
              Krátká prohlídka (1 minuta)
            </button>
            <button type="button" onClick={() => openSetup('start')} className="glass-photo inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14.5px] font-bold text-white">
              Propojit SIS, Moodle a Google
            </button>
            <a href="/brand/stihnu-brand-kit.zip" download className="glass-photo inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14.5px] font-bold text-white">
              Logo a prvky ke stažení
            </a>
          </div>
        </div>
      </header>

      <nav className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Obsah průvodce">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#/pruvodce/${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`g-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-bold text-muted ring-1 ring-inset ring-line hover:text-fg">
            <Emoji3D name={s.emoji} size={18} />
            {s.title.split(':')[0].split(' a ')[0]}
          </a>
        ))}
        <a href="#/pruvodce/propojeni" onClick={(e) => { e.preventDefault(); document.getElementById('g-propojeni')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-bold text-muted ring-1 ring-inset ring-line hover:text-fg">
          <Emoji3D name="link" size={18} /> Návody k propojení
        </a>
      </nav>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s, i) => (
          <motion.section
            key={s.id}
            id={`g-${s.id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
            className="card scroll-mt-24 rounded-[26px] p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2/80 ring-1 ring-inset ring-line">
                <Emoji3D name={s.emoji} size={34} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-[24px] leading-tight">{s.title}</h2>
                <p className="mt-1 text-[14.5px] text-muted">{s.lead}</p>
              </div>
            </div>
            <ul className="mt-3.5 space-y-2 text-[14.5px] leading-relaxed">
              {s.points.map((p, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-moss" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            {s.view && (
              <button type="button" onClick={() => navigateTo(s.view!)} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13.5px] font-bold text-accent ring-1 ring-inset ring-line hover:bg-accent-soft">
                Ukázat
              </button>
            )}
          </motion.section>
        ))}
      </div>

      <section id="g-propojeni" className="card scroll-mt-24 rounded-[26px] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-subtle">Návody krok za krokem</p>
            <SerifTitle className="mt-1 text-[30px]">
              Jak propojit <em className="text-moss">vaše služby</em>
            </SerifTitle>
          </div>
          <Segmented
            size="sm"
            value={guide}
            onChange={setGuide}
            options={[
              { value: 'sis', label: 'SIS' },
              { value: 'moodle', label: 'Moodle' },
              { value: 'google', label: 'Google' },
            ]}
          />
        </div>
        <div className={cn('mt-4 grid gap-4', guide === 'moodle' && 'md:grid-cols-[1.3fr_1fr] md:items-start')}>
          {guide === 'moodle' && <RealScreens shots={MOODLE_SHOTS} source="Skutečné obrazovky Moodlu 5 (veřejná ukázka moodledemo.net) – Moodle UK vypadá stejně." />}
          <div className="space-y-3 text-[14.5px] leading-relaxed">
            {guide === 'sis' && (
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>
                  Otevřete{' '}
                  <a href="https://is.cuni.cz/studium/rozvrhng/" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
                    Rozvrh NG v SISu
                  </a>{' '}
                  a přihlaste se.
                </li>
                <li>
                  Nahoře klikněte na <strong>Export</strong> → <strong>iCalendar</strong>. Stáhne se soubor <em>rozvrh.ics</em>.
                </li>
                <li>Soubor nahrajte do Stihnu – předměty, místnosti i sylaby se doplní samy.</li>
              </ol>
            )}
            {guide === 'moodle' && <p>Termíny z Moodlu jsou jeden odkaz z Exportu kalendáře. Heslo do Moodlu aplikace nepotřebuje – odkaz umí jen číst termíny.</p>}
            {guide === 'google' && <p>Google Kalendář a Úkoly propojíte jedním tlačítkem. Otevře se okno Googlu, kde potvrdíte přístup. Aplikace uvidí jen kalendáře a úkoly, které jí povolíte, a propojení můžete kdykoli zrušit.</p>}
            <button type="button" onClick={() => openSetup(guide)} className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14.5px] font-bold text-accent-fg hover:brightness-110">
              Propojit {guide === 'sis' ? 'SIS' : guide === 'moodle' ? 'Moodle' : 'Google'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
