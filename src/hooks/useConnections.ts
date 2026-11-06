/**
 * Jeden přehled všech propojení: co funguje samo, co je propojené, co čeká
 * na jedno kliknutí a co student přeskočil. Používá ho přehled v Propojení
 * i průvodce – texty jsou záměrně obyčejnou češtinou.
 */
import { useMemo } from 'react';
import { AI_NAMES, providerForKey } from '../lib/aiProvider';
import { findPreset } from '../lib/buildings';
import { formatRelative } from '../lib/dates';
import { useAppStore } from '../store/appStore';
import { appNow } from '../store/clockStore';
import { useUiStore } from '../store/uiStore';
import { useSyncStore } from '../services/syncCenter';

export type ServiceId = 'weather' | 'transit' | 'location' | 'sis' | 'moodle' | 'google' | 'music' | 'notifications' | 'ai';

export type ServiceState =
  /** Funguje samo, nic není potřeba. */
  | 'auto'
  | 'connected'
  /** Je propojené, ale chce jedno kliknutí (např. znovu potvrdit Google). */
  | 'attention'
  | 'todo'
  | 'skipped'
  /** Na tomhle zařízení / serveru teď nejde. */
  | 'unavailable';

export interface ServiceStatus {
  id: ServiceId;
  title: string;
  state: ServiceState;
  /** Jedna věta: co to dělá / jak to teď je. */
  detail: string;
  /** Volitelné – nepovinné služby se nepočítají do „zbývá“. */
  optional: boolean;
  /** Od kdy je propojeno (ISO). */
  since?: string;
  /** Kdy naposledy přišla/odešla data (ISO). */
  lastFlow?: string;
  /** Data proudí průběžně (doprava, počasí). */
  live?: boolean;
}

const latest = (...values: (string | undefined)[]) => values.filter((v): v is string => Boolean(v)).sort().pop();
const earliest = (values: (string | undefined)[]) => values.filter((v): v is string => Boolean(v)).sort()[0];

const ONE_DAY = 86_400_000;

export function useConnections(): { services: ServiceStatus[]; done: number; total: number; attention: number } {
  const mode = useAppStore((s) => s.settings.mode);
  const origin = useAppStore((s) => s.settings.origin[s.settings.mode]);
  const icsSources = useAppStore((s) => s.settings.icsSources);
  const moodle = useAppStore((s) => s.settings.moodle);
  const google = useAppStore((s) => s.googleSync[s.settings.mode]);
  const googleEnabled = useAppStore((s) => s.settings.google.enabled);
  const music = useAppStore((s) => s.settings.music);
  const notify = useAppStore((s) => s.settings.notifyLeave);
  const ownAiKey = useAppStore((s) => providerForKey(s.settings.anthropicApiKey));
  const skipped = useAppStore((s) => s.meta.setupSkipped);
  const events = useAppStore((s) => s.events);
  const subjects = useAppStore((s) => s.subjects);
  const server = useUiStore((s) => s.server);
  const connectedSince = useAppStore((s) => s.meta.connectedSince);
  const requirements = useAppStore((s) => s.requirements);
  const needsAuth = useSyncStore((s) => s.needsAuth);
  const googleError = useSyncStore((s) => s.lastError);

  return useMemo(() => {
    const now = appNow();
    const skip = new Set(skipped ?? []);
    const pending = (id: ServiceId): ServiceState => (skip.has(id) ? 'skipped' : 'todo');

    // Rozvrh ze SISu: nahraný soubor nebo odkaz.
    const sisEvents = events.filter((e) => e.source === 'sis' && (mode === 'demo' || !e.demo));
    const sisSource = icsSources.find((x) => x.kind === 'sis');
    const lastSisImport = sisEvents.reduce((max, e) => (e.updatedAt && e.updatedAt > max ? e.updatedAt : max), '');
    const ownSubjects = subjects.filter((x) => (mode === 'demo' ? true : !x.demo));
    const withSyllabus = ownSubjects.filter((x) => x.syllabus).length;
    const sisState: ServiceState = sisEvents.length > 0 || sisSource ? (sisSource?.lastError ? 'attention' : 'connected') : pending('sis');
    const sisDetail =
      sisState === 'connected' || sisState === 'attention'
        ? `${sisEvents.length} akcí v rozvrhu${lastSisImport ? ` · nahráno ${formatRelative(new Date(lastSisImport), now)}` : ''}${ownSubjects.length ? ` · sylaby ${withSyllabus}/${ownSubjects.length}` : ''}`
        : 'Rozvrh, předměty a jejich sylaby – stačí nahrát jeden soubor.';

    // Moodle: kalendář (termíny) a/nebo klíč (odevzdání, známky).
    const moodleIcs = icsSources.find((x) => x.kind === 'moodle');
    const moodleParts = [moodleIcs ? 'termíny z kalendáře' : null, moodle?.token ? 'odevzdání a známky' : null].filter(Boolean);
    const moodleState: ServiceState = moodleParts.length ? (moodleIcs?.lastError ? 'attention' : 'connected') : pending('moodle');

    // Google: propojeno, nebo vypršelé přihlášení (jedno kliknutí).
    const googleConfigured = Boolean(server.googleClientId) || mode === 'demo' || Boolean(useAppStore.getState().settings.google.clientId);
    let googleState: ServiceState;
    let googleDetail: string;
    if (google.connectedAt && googleEnabled) {
      googleState = needsAuth ? 'attention' : 'connected';
      googleDetail = needsAuth
        ? 'Google chce znovu potvrdit přihlášení – stačí jedno kliknutí.'
        : `${google.account?.email ?? 'Účet Google'}${google.lastSync ? ` · synchronizováno ${formatRelative(new Date(google.lastSync), now)}` : ''}`;
    } else if (!googleConfigured) {
      googleState = 'unavailable';
      googleDetail = 'Správce aplikace ještě nezapnul přihlášení Googlem.';
    } else {
      googleState = pending('google');
      googleDetail = 'Rozvrh a termíny v Google Kalendáři, úkoly v Google Úkolech.';
    }

    const notifySupported = typeof window !== 'undefined' && 'Notification' in window;
    const notifyGranted = notifySupported && Notification.permission === 'granted';

    const services: ServiceStatus[] = [
      { id: 'weather', title: 'Počasí', state: 'auto', detail: 'Předpověď a rada, co na sebe – funguje samo.', optional: false, live: true },
      {
        id: 'transit',
        title: 'Doprava PID',
        state: 'auto',
        detail: server.golemio ? 'Trasy, přestupy, živá zpoždění i klimatizace – funguje samo.' : 'Trasy, přestupy i živá zpoždění – funguje samo.',
        optional: false,
        live: true,
      },
      {
        id: 'location',
        title: 'Odkud vyrážíte',
        state: origin.source === 'gps' ? 'connected' : origin.source === 'custom' || origin.presetId ? 'connected' : pending('location'),
        detail: origin.source === 'gps' ? 'Poloha telefonu (GPS)' : origin.source === 'custom' ? (origin.custom?.label ?? 'Vlastní místo') : findPreset(origin.presetId).label,
        optional: false,
        since: connectedSince?.location,
      },
      {
        id: 'sis',
        title: 'Rozvrh a sylaby (SIS)',
        state: sisState,
        detail: sisDetail,
        optional: false,
        since: connectedSince?.sis ?? earliest(sisEvents.map((e) => e.createdAt)),
        lastFlow: latest(sisSource?.lastSync, lastSisImport || undefined),
      },
      {
        id: 'moodle',
        title: 'Moodle',
        state: moodleState,
        detail: moodleParts.length ? `Propojeno: ${moodleParts.join(' + ')}` : 'Úkoly, testy a termíny odevzdání.',
        optional: false,
        since: connectedSince?.moodle ?? earliest(requirements.filter((r) => r.source === 'moodle' && !r.demo).map((r) => r.createdAt)),
        lastFlow: latest(moodleIcs?.lastSync, moodle?.lastSync),
      },
      { id: 'google', title: 'Google Kalendář a Úkoly', state: googleState, detail: googleDetail, optional: true, since: google.connectedAt, lastFlow: google.lastSync },
      {
        id: 'music',
        title: 'Hudba (Spotify)',
        state: music?.url ? 'connected' : pending('music'),
        detail: music?.url ? (music.title ?? 'Váš playlist') : 'Playlist na učení a na cestu – bez přihlašování.',
        optional: true,
        since: connectedSince?.music,
      },
      {
        id: 'notifications',
        title: 'Upozornění, kdy vyrazit',
        state: !notifySupported ? 'unavailable' : notify && notifyGranted ? 'connected' : notify && !notifyGranted ? 'attention' : pending('notifications'),
        detail: !notifySupported ? 'Tento prohlížeč upozornění neumí.' : notify && notifyGranted ? 'Ozvu se 5 minut před odchodem.' : 'Zazvoní, když je čas vyrazit.',
        optional: true,
        since: connectedSince?.notifications,
      },
      {
        id: 'ai',
        title: 'Chytré čtení (AI)',
        state: ownAiKey ? 'connected' : server.anthropic ? 'auto' : 'todo',
        detail: ownAiKey
          ? `Sylaby, Moodle i PDF čte ${AI_NAMES[ownAiKey]} (váš klíč).`
          : server.anthropic
            ? 'Sylaby, Moodle i PDF čte AI aplikace.'
            : 'Bez AI čtu sylaby pravidly. Vložte klíč od Claude, ChatGPT nebo Gemini.',
        optional: true,
        since: ownAiKey ? connectedSince?.ai : undefined,
      },
    ];
    const counted = services.filter((s) => !s.optional);
    const done = counted.filter((s) => s.state === 'auto' || s.state === 'connected').length;
    const attention = services.filter((s) => s.state === 'attention').length;
    return { services, done, total: counted.length, attention };
  }, [mode, origin, icsSources, moodle, google, googleEnabled, music, notify, ownAiKey, skipped, events, subjects, server, needsAuth, googleError, connectedSince, requirements]);
}

/** Je propojení čerstvé? (pro jemné „před chvílí“) */
export function isRecent(iso: string | undefined, now = Date.now()): boolean {
  return Boolean(iso && now - new Date(iso).getTime() < ONE_DAY);
}
