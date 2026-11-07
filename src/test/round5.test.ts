import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubjectColor } from '../types';
import { detectFaculty, findPreset, LOCATION_PRESETS } from '../lib/buildings';
import { CAMPUS_BUILDINGS, FACULTIES, facultyBuildings, facultyById, withCampus } from '../lib/campus';
import { OUTFIT_3D, weather3d } from '../lib/emoji3d';
import { platformLabel } from '../lib/transitPlanner';
import { spotifyEmbedUrl, spotifyOpenUrl } from '../lib/music';
import { focusLeft, focusSummary, useFocusStore } from '../store/focusStore';
import { serverAiProvider } from '../../server/aiParse';
import { canonicalOrigin } from '../../server/health';
import { toDateKey } from '../lib/dates';

describe('katalog škol a budov', () => {
  it('každá fakulta odkazuje na existující budovy v Praze', () => {
    const ids = new Set(CAMPUS_BUILDINGS.map((b) => b.id));
    expect(ids.size).toBe(CAMPUS_BUILDINGS.length);
    for (const f of FACULTIES) {
      expect(f.buildings.length).toBeGreaterThan(0);
      for (const b of f.buildings) expect(ids.has(b), `${f.short}: ${b}`).toBe(true);
    }
    for (const b of CAMPUS_BUILDINGS) {
      expect(b.coords.lat).toBeGreaterThan(49.95);
      expect(b.coords.lat).toBeLessThan(50.2);
      expect(b.coords.lng).toBeGreaterThan(14.2);
      expect(b.coords.lng).toBeLessThan(14.7);
    }
  });

  it('pozná fakultu podle místností v rozvrhu (sdílené Jinonice se počítají napůl)', () => {
    const ev = (location: string) => ({ location, kind: 'lecture' as const });
    const events = [ev('H215 (Hollar)'), ev('Hollar H012'), ev('Areál Jinonice C117'), ev('Opletalova 26, místnost 205')];
    expect(detectFaculty(events, CAMPUS_BUILDINGS)?.faculty.id).toBe('fsv');
    const mff = [ev('S4 (Malá Strana)'), ev('Malostranské nám. 25, S7'), ev('Ke Karlovu 3, M1')];
    expect(detectFaculty(mff, CAMPUS_BUILDINGS)?.faculty.id).toBe('mff');
    expect(detectFaculty([ev('neznámá místnost')], CAMPUS_BUILDINGS)).toBeNull();
  });

  it('starší uložené budovy doplní z katalogu a vlastní ponechá', () => {
    const own = { id: 'bld-1', name: 'Knihovna', address: 'Mariánské nám. 1', coords: { lat: 50.087, lng: 14.417 }, aliases: ['knihovna'], arrivalStops: [], custom: true };
    const old = [{ ...CAMPUS_BUILDINGS.find((b) => b.id === 'hollar')!, coords: { lat: 50.0843, lng: 14.4136 }, aliases: ['hollar', 'h-budova'] }, own];
    const merged = withCampus(old);
    expect(merged.find((b) => b.id === 'bld-1')).toEqual(own);
    expect(merged.find((b) => b.id === 'hollar')?.aliases).toContain('h-budova');
    expect(merged.find((b) => b.id === 'hollar')?.coords.lat).toBeCloseTo(50.08235, 4);
    expect(merged.length).toBe(CAMPUS_BUILDINGS.length + 1);
    expect(facultyBuildings(facultyById('fsv'), merged).map((b) => b.id)).toEqual(['hollar', 'jinonice', 'opletalova']);
  });

  it('výchozí místo bez GPS je střed Prahy, ne kolej na Praze 6', () => {
    expect(LOCATION_PRESETS[0].id).toBe('centrum');
    expect(findPreset('neexistuje').id).toBe('centrum');
  });
});

describe('3D obrázky', () => {
  it('počasí podle kódu WMO a denní doby', () => {
    expect(weather3d(0, true)).toBe('sun');
    expect(weather3d(0, false)).toBe('crescent-moon');
    expect(weather3d(61)).toBe('cloud-with-rain');
    expect(weather3d(80, true)).toBe('sun-behind-rain-cloud');
    expect(weather3d(73)).toBe('cloud-with-snow');
    expect(weather3d(95)).toBe('cloud-with-lightning-and-rain');
    expect(weather3d(45)).toBe('fog');
  });
  it('každé oblečení má obrázek', () => {
    expect(Object.values(OUTFIT_3D).every(Boolean)).toBe(true);
  });
});

describe('nástupiště', () => {
  it('tramvaj a autobus: písmeno sloupku, metro a vlak: kolej', () => {
    expect(platformLabel('tram', 'A')).toBe('nástupiště A');
    expect(platformLabel('bus', 'C')).toBe('nástupiště C');
    expect(platformLabel('metro', '2')).toBe('kolej 2');
    expect(platformLabel('train', '5')).toBe('kolej 5');
    expect(platformLabel('tram', '')).toBeUndefined();
  });
});

describe('playlist Spotify', () => {
  it('vložený přehrávač i odkaz do aplikace', () => {
    const url = 'https://open.spotify.com/intl-cs/playlist/37i9dQZF1DWZeKCadgRdKQ?si=abc';
    expect(spotifyEmbedUrl(url)).toBe('https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator');
    expect(spotifyOpenUrl(url)).toBe('https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ');
    expect(spotifyEmbedUrl('https://evil.example/playlist/x')).toBeNull();
  });
});

describe('soustředění (pomodoro)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T10:00:00+01:00'));
    useFocusStore.setState({ presetId: 'classic', phase: 'focus', endsAt: null, pausedLeft: null, round: 0, autoNext: true, stats: {} });
  });
  afterEach(() => vi.useRealTimers());

  it('běží podle času konce, pauza si pamatuje zbytek', () => {
    useFocusStore.getState().start();
    vi.advanceTimersByTime(10 * 60_000);
    expect(Math.round(focusLeft(useFocusStore.getState()) / 60_000)).toBe(15);
    useFocusStore.getState().pause();
    vi.advanceTimersByTime(30 * 60_000);
    expect(Math.round(focusLeft(useFocusStore.getState()) / 60_000)).toBe(15);
  });

  it('po bloku zapíše minuty, naváže pauzou a po čtyřech blocích dá dlouhou pauzu', () => {
    const f = useFocusStore.getState();
    for (let i = 0; i < 4; i++) {
      useFocusStore.setState({ phase: 'focus', endsAt: Date.now() });
      f.finish();
      const s = useFocusStore.getState();
      expect(s.phase).toBe(i < 3 ? 'short' : 'long');
      expect(s.endsAt).not.toBeNull();
    }
    const today = useFocusStore.getState().stats[toDateKey(new Date())];
    expect(today).toEqual({ minutes: 100, blocks: 4 });
    useFocusStore.setState({ endsAt: Date.now() });
    useFocusStore.getState().finish();
    expect(useFocusStore.getState().round).toBe(0);
    expect(useFocusStore.getState().phase).toBe('focus');
  });

  it('po dlouhém zavření aplikace jen tiše zapíše a nespustí další úsek', () => {
    useFocusStore.setState({ phase: 'focus', endsAt: Date.now() - 60 * 60_000 });
    useFocusStore.getState().finish();
    expect(useFocusStore.getState().endsAt).toBeNull();
    expect(useFocusStore.getState().stats[toDateKey(new Date())]?.blocks).toBe(1);
  });

  it('série dní', () => {
    const d = (n: number) => toDateKey(new Date(Date.now() - n * 86_400_000));
    const s = focusSummary({ [d(0)]: { minutes: 50, blocks: 2 }, [d(1)]: { minutes: 25, blocks: 1 }, [d(2)]: { minutes: 25, blocks: 1 }, [d(4)]: { minutes: 25, blocks: 1 } });
    expect(s.streak).toBe(3);
    expect(s.week).toBe(125);
  });
});

describe('server: bezplatná AI a stěhování', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  it('bez klíčů použije bezplatnou AI z OVHcloud, FREE_AI=off ji vypne', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.FREE_AI;
    expect(serverAiProvider()).toBe('ovh');
    process.env.FREE_AI = 'off';
    expect(serverAiProvider()).toBeNull();
    process.env.GEMINI_API_KEY = 'AIza-test';
    expect(serverAiProvider()).toBe('gemini');
  });
  it('nová adresa jen jako čisté https origin', () => {
    process.env.PUBLIC_CANONICAL_ORIGIN = 'https://stihnu.vercel.app/';
    expect(canonicalOrigin()).toBe('https://stihnu.vercel.app');
    process.env.PUBLIC_CANONICAL_ORIGIN = 'http://stihnu.vercel.app';
    expect(canonicalOrigin()).toBeNull();
    process.env.PUBLIC_CANONICAL_ORIGIN = 'https://stihnu.vercel.app/cesta';
    expect(canonicalOrigin()).toBeNull();
    delete process.env.PUBLIC_CANONICAL_ORIGIN;
    expect(canonicalOrigin()).toBeNull();
  });
});

describe('sloučené předměty se už nevracejí', () => {
  it('import z Moodlu znovu nevytvoří sloučený předmět a jeho termíny přesměruje', async () => {
    const { useAppStore } = await import('../store/appStore');
    const { autoMergeSubjects } = await import('../services/subjectAssist');
    const st = useAppStore.getState();
    st.clearAllData?.();
    const base = { color: 'indigo' as SubjectColor, createdAt: '2026-09-01T10:00:00.000Z' };
    useAppStore.setState({ subjects: [{ ...base, id: 'subj_sis_a', code: 'JSB022', name: 'Úvod do mediálních studií', source: 'sis' }, { ...base, id: 'moodle-course-7', name: 'Úvod do mediálních studií – ZS 2026/27', source: 'moodle', moodleCourseId: 7 }], requirements: [], events: [], tasks: [], materials: [] });
    useAppStore.getState().mergeSubjects('moodle-course-7', 'subj_sis_a');
    expect(useAppStore.getState().settings.subjectAliases).toEqual({ 'moodle-course-7': 'subj_sis_a' });
    // Další import z Moodlu přinese tentýž kurz se stejným ID a termínem
    useAppStore.getState().applyMoodleIcs({
      subjects: [{ ...base, id: 'moodle-course-7', name: 'Úvod do mediálních studií – ZS 2026/27', source: 'moodle', moodleCourseId: 7 }],
      requirements: [{ id: 'req-1', subjectId: 'moodle-course-7', title: 'Esej', type: 'assignment', status: 'todo', source: 'moodle', createdAt: base.createdAt } as never],
      source: { id: 'moodle-ics', kind: 'moodle', url: 'https://dl1.cuni.cz/calendar/export_execute.php?userid=1&authtoken=x', autoRefresh: true } as never,
    });
    const s = useAppStore.getState();
    expect(s.subjects.map((x) => x.id)).toEqual(['subj_sis_a']);
    expect(s.subjects[0].moodleCourseId).toBe(7);
    expect(s.requirements.find((r) => r.id === 'req-1')?.subjectId).toBe('subj_sis_a');
    expect(autoMergeSubjects()).toEqual([]);
  });

  it('dvojici, kterou student dřív sloučil (jen náhrobek), sloučí potichu', async () => {
    const { useAppStore } = await import('../store/appStore');
    const { autoMergeSubjects, useSubjectDuplicates } = await import('../services/subjectAssist');
    void useSubjectDuplicates;
    const base = { color: 'indigo' as SubjectColor, createdAt: '2026-09-01T10:00:00.000Z' };
    useAppStore.setState((s) => ({
      subjects: [{ ...base, id: 'subj_sis_b', code: 'JSB065', name: 'Analýza mediálních obsahů', source: 'sis' }, { ...base, id: 'moodle-course-9', name: 'Analýza mediálních obsahů – seminář', source: 'moodle' }],
      tombstones: { ...s.tombstones, 'subject:moodle-course-9': '2026-11-01T10:00:00.000Z' },
      settings: { ...s.settings, subjectAliases: {} },
    }));
    expect(autoMergeSubjects()).toEqual([]);
    expect(useAppStore.getState().subjects.map((x) => x.id)).toEqual(['subj_sis_b']);
    expect(useAppStore.getState().settings.subjectAliases?.['moodle-course-9']).toBe('subj_sis_b');
  });
});
