/**
 * Rozvrh ze SISu jako soubor: Rozvrh NG → Export → iCalendar stáhne
 * `rozvrh.ics` (SIS nedává odkaz k odběru). Nahraný soubor nahradí
 * dosavadní rozvrh ze SISu a předmětům se rovnou doplní sylaby.
 */
import { parseIcs } from '../lib/ics';
import { buildIcsImport } from '../lib/icsImport';
import { useAppStore } from '../store/appStore';
import { appNow } from '../store/clockStore';
import { importAllSyllabi } from './syllabusSync';

export interface SisFileResult {
  events: number;
  newSubjects: number;
  online: number;
  unresolved: string[];
}

export async function importSisIcsFile(file: Blob): Promise<SisFileResult> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Soubor je moc velký – rozvrh ze SISu mívá do 1 MB.');
  const text = await file.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Tohle není soubor iCalendar (.ics). V SISu ho stáhneš v Rozvrhu NG přes Export → iCalendar.');
  const app = useAppStore.getState();
  const now = appNow();
  const preview = buildIcsImport(parseIcs(text), {
    subjects: app.subjects,
    buildings: app.settings.buildings,
    aliases: app.settings.locationAliases,
    source: 'sis',
    now,
  });
  if (preview.events.length === 0) throw new Error('V souboru nejsou žádné rozvrhové akce na příští týdny.');
  const hasDemo = app.events.some((e) => e.demo);
  app.applyIcsImport({
    subjects: preview.newSubjects,
    events: preview.events,
    // Nový export nahrazuje celý dosavadní rozvrh ze SISu (i ukázková data).
    replaceSources: hasDemo && app.settings.mode === 'live' ? ['sis', 'demo'] : ['sis'],
    demo: app.settings.mode === 'demo',
  });
  setTimeout(() => void importAllSyllabi(), 400);
  return {
    events: preview.events.length,
    newSubjects: preview.newSubjects.length,
    online: preview.events.filter((e) => e.online).length,
    unresolved: preview.unresolvedLocations,
  };
}
