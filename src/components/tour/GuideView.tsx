/**
 * Podrobný průvodce aplikací – co která část umí a jak ji použít.
 * Krátké věty, žádné zkratky, u každé funkce tlačítko „Ukázat“.
 */
import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  BellRing,
  BookOpen,
  CalendarDays,
  CloudSun,
  Download,
  Flower2,
  House,
  ListTodo,
  Navigation2,
  Play,
  Plug,
  ShieldCheck,
  Smartphone,
  TramFront,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { navigateTo, type View } from '../../hooks/useAppShell';
import { useUiStore } from '../../store/uiStore';
import { GuideAnimation } from '../setup/GuideAnimation';
import { cn, Segmented, SerifTitle } from '../ui/primitives';

interface Section {
  id: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  lead: string;
  points: ReactNode[];
  view?: View;
}

const SECTIONS: Section[] = [
  {
    id: 'dnes',
    icon: House,
    tone: 'bg-accent-soft text-accent',
    title: 'Dnes: kdy vyrazit a co tě čeká',
    lead: 'Úvodní obrazovka ukazuje jen to, co právě potřebuješ.',
    points: [
      'Velký odpočet říká, za jak dlouho vyrazit, ze které zastávky (i nástupiště) a čím jet. Počítá s tvou rezervou – nastavíš ji v kartě Cesta.',
      'Karta „Dnes tě čeká“: budova, učebna, kdy ti to jede a úkoly k dnešním předmětům.',
      'Večer, když máš po výuce, se přepne na zítřek a ukáže úkoly na další dny.',
    ],
    view: 'dnes',
  },
  {
    id: 'navigace',
    icon: Navigation2,
    tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    title: 'Navigace až na zastávku',
    lead: 'Jako v mapách v telefonu – jen rovnou k tvému spoji.',
    points: [
      'Klepni na Navigovat. Uvidíš mapu, svoji polohu a pokyny typu „za 80 m odboč vlevo“.',
      'Dole běží odpočet do odjezdu a aplikace řekne, jestli spoj stíháš, nebo máš přidat do kroku.',
      'Ve voze tě upozorní (i vibrací), že na příští zastávce vystupuješ, a pak tě dovede do budovy.',
      'Pokyny umí číst nahlas (ikona reproduktoru) a displej mezitím nezhasne. Bez polohy jde cestu projít ručně tlačítky.',
    ],
    view: 'dnes',
  },
  {
    id: 'ukoly',
    icon: ListTodo,
    tone: 'bg-clay/15 text-clay',
    title: 'Úkoly a termíny na jednom místě',
    lead: 'Vlastní úkoly, Google Úkoly i termíny ze SISu a Moodlu – v jednom seznamu.',
    points: [
      'Seřadíš je podle termínu (dnes, zítra, tento týden…) nebo podle předmětu.',
      <>
        Předmět k úkolu aplikace pozná sama – podle kódu předmětu, názvu i v jiném pádě, zkratky, jména vyučujícího, sylabu nebo rozvrhu. Jistý odhad přiřadí hned (poznáš ho podle jiskřičky ✨), u nejistého se zeptá.
      </>,
      'Předmět změníš klepnutím na jeho štítek. Když nabídnutý předmět odmítneš, už ho u toho úkolu nenabídne.',
    ],
    view: 'ukoly',
  },
  {
    id: 'predmety',
    icon: BookOpen,
    tone: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
    title: 'Předměty, sylaby a materiály',
    lead: 'U každého předmětu je všechno pohromadě.',
    points: [
      'Sylabus a podmínky zakončení ze SISu – aplikace z nich vytáhne povinnosti, váhy a termíny.',
      'Materiály z Moodlu, vlastní soubory, poznámky a odkazy.',
      'Soubory a celé složky z Google Disku: Přidat → Google Disk. Aplikace vidí jen to, co vybereš.',
      'Když se předmět objeví dvakrát (třeba ze SISu a z vlastního kalendáře), aplikace ho sloučí, nebo se zeptá.',
    ],
    view: 'predmety',
  },
  {
    id: 'kalendar',
    icon: CalendarDays,
    tone: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    title: 'Kalendář a akademický rok',
    lead: 'Celý rok na jednom řádku: výuka, zkouškové, prázdniny a kdy se kupí termíny.',
    points: [
      'Nahoře vidíš, kde v semestru jsi („6. týden z 15“), co přijde dál a kolik termínů máš tento týden.',
      'Klepnutím na období nebo na sloupek s termíny se ukážou podrobnosti.',
      'Hodiny, které máš i ve vlastním Google Kalendáři, se ukazují jen jednou – ta obsáhlejší verze – a do Googlu se nezapisují podruhé.',
    ],
    view: 'kalendar',
  },
  {
    id: 'doprava',
    icon: TramFront,
    tone: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    title: 'Doprava a mapa zastávek',
    lead: 'Všechny zastávky PID s odjezdy v reálném čase.',
    points: ['Klepni na zastávku a uvidíš nejbližší odjezdy i se zpožděním.', 'Vybereš si, ze které zastávky obvykle vyrážíš – aplikace s ní pak počítá.'],
    view: 'doprava',
  },
  {
    id: 'menza',
    icon: UtensilsCrossed,
    tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    title: 'Jídelníček menzy',
    lead: 'Co se dnes vaří v menze nejblíž tvé výuce.',
    points: ['Studentské ceny, alergeny a víc dní dopředu.', 'Jinou menzu vybereš klepnutím na její název nad jídelníčkem.'],
    view: 'dnes',
  },
  {
    id: 'pocasi',
    icon: CloudSun,
    tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    title: 'Počasí na cestu',
    lead: 'Ne obecná předpověď, ale počasí ve chvíli, kdy půjdeš ven.',
    points: ['Poradí, co si vzít na sebe a jestli deštník – zvlášť na cestu tam a zpátky.'],
    view: 'dnes',
  },
  {
    id: 'odpocivadla',
    icon: Flower2,
    tone: 'bg-moss/15 text-moss',
    title: 'Odpočívadla',
    lead: 'Klidná chvilka před odchodem nebo soustředění na úkol.',
    points: ['Dýchací kruh, kontrolní seznam věcí na cestu a hudba ze Spotify bez přihlašování.'],
    view: 'dnes',
  },
  {
    id: 'ucet',
    icon: ShieldCheck,
    tone: 'bg-accent-soft text-accent',
    title: 'Účet a bezpečnost',
    lead: 'Data se šifrují přímo v zařízení. Na serveru jsou jen zašifrovaná.',
    points: [
      'Přihlásíš se Googlem nebo e-mailem. Při založení dostaneš záchranný kód – ulož si ho, je to jediný náhradní klíč k datům.',
      'Nový telefon přidáš přihlášením a QR kódem z Účtu.',
      'Kdykoli si stáhneš všechna data, odhlásíš se ze všech zařízení nebo účet smažeš.',
    ],
    view: 'ucet',
  },
  {
    id: 'ikona',
    icon: BellRing,
    tone: 'bg-clay/15 text-clay',
    title: 'Ikona s odpočtem, zkratky a upozornění',
    lead: 'Kolik minut zbývá do odchodu, uvidíš i bez otevření aplikace.',
    points: [
      'Na ikoně nainstalované aplikace se ukáže počet minut do odchodu (na iPhonu po povolení upozornění, na Androidu podle systému jako tečka nebo číslo). V prohlížeči je odpočet v ikoně záložky.',
      'Dlouhým podržením ikony otevřeš zkratky: Dnes, Úkoly, Doprava, Kalendář.',
      'Upozornění „vyraz za 5 minut“ zapneš v Propojení.',
      'Widgety na plochu telefonu umí jen aplikace z App Storu nebo Google Play. Stihnu je webová aplikace, proto místo widgetu nabízí odpočet na ikoně, zkratky a upozornění.',
    ],
  },
  {
    id: 'instalace',
    icon: Smartphone,
    tone: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
    title: 'Jak dát Stihnu na plochu telefonu',
    lead: 'Pak se otevírá jako normální aplikace – na celou obrazovku a rychle.',
    points: [
      <>
        <strong>iPhone (Safari):</strong> tlačítko Sdílet (čtvereček se šipkou) → <strong>Přidat na plochu</strong>.
      </>,
      <>
        <strong>Android (Chrome):</strong> tři tečky vpravo nahoře → <strong>Přidat na plochu</strong> nebo <strong>Instalovat aplikaci</strong>.
      </>,
      <>
        <strong>Počítač (Chrome, Edge):</strong> ikona instalace vpravo v adresním řádku.
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
          <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-white/85">Všechno, co aplikace umí, krátce a po lopatě. Nejrychleji to pochopíš z minutové prohlídky přímo v aplikaci.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigateTo('dnes');
                setTimeout(startTour, 350);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#e7d6b5] px-5 text-[14.5px] font-bold text-[#1d3a2a] shadow-md transition hover:brightness-105"
            >
              <Play className="size-4" aria-hidden /> Krátká prohlídka (1 minuta)
            </button>
            <button type="button" onClick={() => openSetup('start')} className="glass-photo inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14.5px] font-bold text-white">
              <Plug className="size-4" aria-hidden /> Propojit SIS, Moodle a Google
            </button>
          </div>
        </div>
      </header>

      <nav className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Obsah průvodce">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#/pruvodce/${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`g-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-bold text-muted ring-1 ring-inset ring-line hover:text-fg">
            <s.icon className="size-3.5" aria-hidden />
            {s.title.split(':')[0].split(' a ')[0]}
          </a>
        ))}
        <a href="#/pruvodce/propojeni" onClick={(e) => { e.preventDefault(); document.getElementById('g-propojeni')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-bold text-muted ring-1 ring-inset ring-line hover:text-fg">
          <Plug className="size-3.5" aria-hidden /> Propojení
        </a>
      </nav>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((s, i) => (
          <motion.section
            key={s.id}
            id={`g-${s.id}`}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: (i % 2) * 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="card scroll-mt-24 rounded-[26px] p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', s.tone)}>
                <s.icon className="size-5" aria-hidden />
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
              Jak propojit <em className="text-moss">tvoje služby</em>
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
        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr] md:items-center">
          <GuideAnimation key={guide} guide={guide} />
          <div className="space-y-3 text-[14.5px] leading-relaxed">
            {guide === 'sis' && <p>Rozvrh ze SISu je jeden soubor. Stáhneš ho v Rozvrhu NG (Export → iCalendar) a nahraješ do Stihnu. Předměty, místnosti i sylaby se doplní samy.</p>}
            {guide === 'moodle' && <p>Termíny z Moodlu jsou jeden odkaz z Exportu kalendáře. Heslo do Moodlu aplikace nepotřebuje – odkaz umí jen číst termíny.</p>}
            {guide === 'google' && <p>Google Kalendář a Úkoly propojíš jedním tlačítkem. Aplikace uvidí jen kalendáře a úkoly, které jí povolíš. Propojení můžeš kdykoli zrušit.</p>}
            <button type="button" onClick={() => openSetup(guide)} className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14.5px] font-bold text-accent-fg hover:brightness-110">
              <Download className="size-4" aria-hidden /> Propojit {guide === 'sis' ? 'SIS' : guide === 'moodle' ? 'Moodle' : 'Google'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
