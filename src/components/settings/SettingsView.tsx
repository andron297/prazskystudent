/**
 * Nastavení: jeden přehledný rozcestník místo plné horní lišty.
 * Účet, propojení, škola a budovy, cesta, počasí, upozornění, vzhled,
 * data a soukromí, průvodce – a pro správce testovací režim a server.
 */
import type { ReactNode } from 'react';
import { ChevronRight, Monitor, Moon, Sun } from 'lucide-react';
import { navigateTo, type View } from '../../hooks/useAppShell';
import { useConnections } from '../../hooks/useConnections';
import { myBuildingIds, facultyById } from '../../lib/campus';
import { findPreset } from '../../lib/buildings';
import { formatRelative } from '../../lib/dates';
import { useAccount } from '../../services/account';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { activeSimulations, isOwnerEmail, useTestStore } from '../../store/testStore';
import { toast, useUiStore } from '../../store/uiStore';
import { BuildingsEditor } from '../integrations/BuildingsEditor';
import { AppSection, Collapsible, TransitSection, WeatherSection } from '../integrations/ConnectionsView';
import { SchoolCard } from '../integrations/SchoolCard';
import { PrivacyCard, OwnerCard } from '../setup/ConnectionsHub';
import { Glyph, GlyphTile, type GlyphName } from '../ui/Glyph';
import { cn, Segmented, Toggle } from '../ui/primitives';
import { usePresentationStore } from '../../store/presentationStore';
import { HomePlace } from './HomePlace';
import { NotificationsSection } from './NotificationsSection';
import { SettingsBack } from './SettingsBack';
import { TestModeView } from './TestModeView';

export type SettingsSection = 'skola' | 'cesta' | 'pocasi' | 'upozorneni' | 'data' | 'test' | 'server';

function Row({ glyph, title, detail, onClick, tone, badge }: { glyph: GlyphName; title: string; detail?: ReactNode; onClick: () => void; tone?: 'accent' | 'muted' | 'warn'; badge?: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-surface-2/70">
        <GlyphTile name={glyph} size={40} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-tight">{title}</span>
          {detail && <span className="mt-0.5 block truncate text-[12.5px] text-muted">{detail}</span>}
        </span>
        {badge}
        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
      </button>
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{title}</h2>
      <ul className="card divide-y divide-line overflow-hidden rounded-[22px]">{children}</ul>
    </section>
  );
}

function Hub() {
  const user = useAccount((s) => s.user);
  const status = useAccount((s) => s.status);
  const lastSyncAt = useAccount((s) => s.lastSyncAt);
  const syncError = useAccount((s) => s.syncError);
  const settings = useAppStore((s) => s.settings);
  const { done, total, attention } = useConnections();
  const tests = useTestStore();
  const owner = isOwnerEmail(user?.email);
  const faculty = facultyById(settings.faculty);
  const buildingCount = myBuildingIds(settings).length;
  const origin = settings.origin[settings.mode];
  const server = useUiStore((s) => s.server);
  const serverChecked = useUiStore((s) => s.serverChecked);
  const serverIncomplete = serverChecked && server.reachable && (!server.account || server.accountSchema !== 'ok');
  const notify = [settings.notifyLeave && 'odchod', settings.notifyDeadlines && 'termíny'].filter(Boolean).join(' a ');
  const go = (view: View, param?: string) => navigateTo(view, param);
  const startTour = () => {
    navigateTo('dnes');
    setTimeout(() => useUiStore.getState().startTour(), 350);
  };
  const sims = activeSimulations(tests);
  const masked = usePresentationStore((p) => p.masked);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-[44px] leading-none sm:text-[52px]">Nastavení</h1>

      <button type="button" onClick={() => go('ucet')} className="card flex w-full items-center gap-4 rounded-[24px] p-4 text-left transition hover:brightness-[1.02]">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft text-[15px] font-black text-accent ring-2 ring-accent/25">
          {user?.avatar && !masked ? <img src={user.avatar} alt="" className="size-full object-cover" referrerPolicy="no-referrer" /> : user && !masked ? (user.name ?? user.email).slice(0, 1).toUpperCase() : <Glyph name="user" size={22} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-bold">{user ? (masked ? 'Student' : (user.name ?? user.email)) : status === 'off' ? 'Bez účtu' : 'Přihlásit se'}</span>
          <span className="block truncate text-[12.5px] text-muted">
            {user ? (syncError ? 'Synchronizace se nepovedla – otevřete Účet' : lastSyncAt ? `Uloženo v účtu ${formatRelative(new Date(lastSyncAt), appNow())}` : masked ? 'Režim prezentace' : user.email) : 'Data na všech vašich zařízeních, šifrovaně'}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
      </button>

      <Group title="Studium">
        <Row glyph="link" title="Propojení" detail={`SIS, Moodle, Google, hudba · propojeno ${done} ze ${total}`} onClick={() => go('propojeni')} tone={attention ? 'warn' : 'accent'} badge={attention ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">{attention}</span> : undefined} />
        <Row glyph="building" title="Škola a budovy" detail={faculty || buildingCount ? `${faculty ? `${faculty.short} · ` : ''}${buildingCount} ${buildingCount === 1 ? 'budova' : buildingCount < 5 ? 'budovy' : 'budov'}` : 'Vyberte fakultu a budovy'} onClick={() => go('nastaveni', 'skola')} />
      </Group>

      <Group title="Cesta a den">
        <Row glyph="route" title="Doprava, cesta a domov" detail={`${origin.source === 'gps' ? 'Odkud: poloha telefonu' : `Odkud: ${origin.source === 'custom' ? (origin.custom?.label ?? 'vlastní místo') : findPreset(origin.presetId).label}`}${settings.home ? ` · domov: ${settings.home.label}` : ' · domov nenastaven'}`} onClick={() => go('nastaveni', 'cesta')} />
        <Row glyph="weather" title="Počasí a oblečení" detail={settings.weather.enabled ? (settings.weather.feel === 'cold' ? 'Bývá vám zima' : settings.weather.feel === 'warm' ? 'Otužilec' : 'Běžně') : 'Vypnuto'} onClick={() => go('nastaveni', 'pocasi')} />
        <Row glyph="bell" title="Upozornění" detail={notify ? `Upozorním na ${notify}` : 'Vypnuto'} onClick={() => go('nastaveni', 'upozorneni')} />
      </Group>

      <Group title="Aplikace">
        <li className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-4 py-3">
          <GlyphTile name={settings.theme === 'dark' ? 'moon' : 'sun'} size={40} />
          <span className="min-w-[9rem] flex-1">
            <span className="block text-[15px] font-bold leading-tight">Světlý a tmavý režim</span>
            <span className="mt-0.5 block text-[12.5px] text-muted">{settings.theme === 'system' ? 'Podle nastavení zařízení' : settings.theme === 'dark' ? 'Vždy tmavý' : 'Vždy světlý'}</span>
          </span>
          <Segmented
            value={settings.theme}
            onChange={(theme) => useAppStore.getState().updateSettings({ theme })}
            size="sm"
            className="w-full sm:w-auto [&>button]:flex-1"
            options={[
              { value: 'system', label: 'Auto', icon: Monitor },
              { value: 'light', label: 'Světlý', icon: Sun },
              { value: 'dark', label: 'Tmavý', icon: Moon },
            ]}
          />
        </li>
        <Row glyph="palette" title="Vzhled a oslovení" detail="Jak vás oslovit, barvy, fotky, pozadí a písmo" onClick={() => go('vzhled')} />
        <Row glyph="lock" title="Data a soukromí" detail="Moje data a ukázka, záloha, AI, smazání" onClick={() => go('nastaveni', 'data')} />
        <li className="px-4 py-3">
          <Toggle
            checked={masked}
            onChange={(v) => {
              usePresentationStore.getState().setMasked(v);
              toast.info(v ? 'Režim prezentace: na obrazovce jsou vymyšlené názvy, vaše data zůstávají beze změny.' : 'Režim prezentace je vypnutý.');
            }}
            label="Režim prezentace (skrýt moje popisky)"
            description="Předměty, události a úkoly se na obrazovce ukážou s vymyšlenými názvy – časy a rozvrh zůstanou. Hodí se, když promítáte. Úpravy se v tomto režimu neukládají."
          />
        </li>
      </Group>

      <Group title="Pomoc">
        <Row glyph="compass" title="Průvodce aplikací" detail="Co aplikace umí a jak na to" onClick={() => go('pruvodce')} />
        <Row glyph="spark" title="Krátká prohlídka" detail="Minuta, ukáže, co kde najdete" onClick={startTour} />
        <Row glyph="sliders" title="Průvodce nastavením" detail="Propojit SIS, Moodle a Google krok za krokem" onClick={() => useUiStore.getState().openSetup('start')} />
        <Row glyph="spark" title="Prezentace aplikace" detail="Velká prohlídka na plátno – šipkami nebo klikrem" onClick={() => usePresentationStore.getState().setSlideshow(true)} />
      </Group>

      {owner && (
        <Group title="Pro správce">
          {<Row glyph="flask" title="Testovací režim" detail={sims.length ? `Běží simulace: ${sims.join(', ')}` : 'Simulovat polohu, čas, chůzi a počasí'} onClick={() => go('nastaveni', 'test')} tone={sims.length ? 'warn' : 'accent'} />}
          <Row glyph="gear" title="Server aplikace" detail={serverIncomplete ? 'Něco na serveru chybí – návod krok za krokem' : 'Účty, AI, Google, kontaktní e-mail'} onClick={() => go('nastaveni', 'server')} tone={serverIncomplete ? 'warn' : 'muted'} />
        </Group>
      )}

      <footer className="space-y-1.5 pb-4 text-center text-[12px] text-subtle">
        <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12.5px]">
          <a href="#/soukromi" className="hover:text-fg">Zásady ochrany údajů</a>
          <a href="#/podminky" className="hover:text-fg">Podmínky</a>
          <a href="https://github.com/andron297/prazskystudent" target="_blank" rel="noreferrer" className="hover:text-fg">
            Zdrojový kód
          </a>
        </p>
        <p>Fotky: Wikimedia Commons a Unsplash (autoři ve Vzhledu) · obrázky počasí: Microsoft Fluent Emoji (MIT)</p>
      </footer>
    </div>
  );
}

const TITLES: Record<SettingsSection, string> = {
  skola: 'Škola a budovy',
  cesta: 'Doprava, cesta a domov',
  pocasi: 'Počasí a oblečení',
  upozorneni: 'Upozornění',
  data: 'Data a soukromí',
  test: 'Testovací režim',
  server: 'Server aplikace',
};

export function SettingsView({ section }: { section?: string }) {
  const user = useAccount((s) => s.user);
  const key = section as SettingsSection | undefined;
  if (!key || !(key in TITLES) || ((key === 'test' || key === 'server') && !isOwnerEmail(user?.email))) return <Hub />;
  return (
    <div className={cn('mx-auto space-y-4', key === 'data' || key === 'test' ? 'max-w-4xl' : 'max-w-3xl')}>
      <SettingsBack />
      <h1 className="font-display text-[38px] leading-none sm:text-[44px]">{TITLES[key]}</h1>
      {key === 'skola' && (
        <>
          <SchoolCard />
          <div className="card rounded-[24px] p-4 sm:p-5">
            <Collapsible title="Všechny budovy a cílové zastávky (pokročilé)">
              <BuildingsEditor />
            </Collapsible>
          </div>
        </>
      )}
      {key === 'cesta' && (
        <>
          <HomePlace />
          <TransitSection />
        </>
      )}
      {key === 'pocasi' && <WeatherSection />}
      {key === 'upozorneni' && <NotificationsSection />}
      {key === 'data' && (
        <>
          <AppSection />
          <PrivacyCard />
        </>
      )}
      {key === 'server' && <OwnerCard />}
      {key === 'test' && <TestModeView />}
    </div>
  );
}
