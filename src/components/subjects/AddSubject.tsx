/**
 * Přidání předmětu: stačí kód nebo název. Zbytek (název, kredity, zakončení,
 * garant, vyučující, sylabus a z něj povinnosti) dohledám ve veřejném SISu.
 * Ručně se vyplňuje jen předmět, který v SISu není.
 */
import { useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, Search } from 'lucide-react';
import { navigateTo } from '../../hooks/useAppShell';
import { parseSisSyllabus, sisSubjectUrl } from '../../lib/sisImport';
import { syllabusText } from '../../lib/syllabusExtract';
import { createApi, type SisSubjectPage } from '../../services/api';
import { errorMessage } from '../../services/http';
import { addRequirementsFromText, requirementsCountText } from '../../services/syllabusSync';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Glyph } from '../ui/Glyph';
import { Modal } from '../ui/overlays';
import { Button, cn } from '../ui/primitives';

const CODE_RE = /^[A-Z]{1,6}\d{2,6}[A-Z0-9]{0,4}$/;

interface Found {
  page: SisSubjectPage;
  code: string;
  name: string;
  faculty?: string;
  syllabus: NonNullable<ReturnType<typeof parseSisSyllabus>>['syllabus'];
}

function facultyOf(text: string): string | undefined {
  return /(?:^|\n)Fakulta:\n([^\n]{3,90})/.exec(text)?.[1]?.trim();
}

export function AddSubjectDialog({ open, onClose, onManual }: { open: boolean; onClose: () => void; onManual: (initial: { name?: string; code?: string }) => void }) {
  const subjects = useAppStore((s) => s.subjects);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [matches, setMatches] = useState<{ code: string; name?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  const lookup = async (raw: string) => {
    const q = raw.trim();
    if (q.length < 3) return;
    const upper = q.toUpperCase().replace(/\s+/g, '');
    const asCode = CODE_RE.test(upper);
    const id = ++seq.current;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const app = useAppStore.getState();
      const api = createApi(app.settings, useUiStore.getState().server, appNow);
      const page = await api.fetchSisSubject(asCode ? { code: upper } : { name: q });
      if (id !== seq.current) return;
      const parsed = parseSisSyllabus(page.text, page.url, appNow());
      if (!parsed) throw new Error('Stránku předmětu v SISu se nepodařilo přečíst.');
      const code = parsed.code ?? page.code;
      setFound({ page, code, name: parsed.name ?? code, faculty: facultyOf(page.text), syllabus: parsed.syllabus });
      if (!asCode) setMatches(page.matches?.length ? page.matches : page.candidates.map((c) => ({ code: c })));
    } catch (e) {
      if (id !== seq.current) return;
      setError(errorMessage(e));
    } finally {
      if (id === seq.current) setBusy(false);
    }
  };

  const existing = found ? subjects.find((s) => s.code?.toUpperCase() === found.code.toUpperCase()) : undefined;

  const add = async () => {
    if (!found) return;
    setAdding(true);
    const store = useAppStore.getState();
    const id = store.importSisSubject({ code: found.code, name: found.name, syllabus: found.syllabus });
    onClose();
    navigateTo('predmety', id);
    toast.success(`Přidáno: ${found.name}`);
    try {
      const text = syllabusText(found.syllabus);
      if (text) {
        const { requirements } = await addRequirementsFromText(id, text, `sis:${found.code}`);
        if (requirements.length) toast.info(`Ze sylabu jsem doplnil ${requirementsCountText(requirements.length)}.`);
      }
    } catch {
      /* povinnosti jde doplnit i později tlačítkem u sylabu */
    } finally {
      setAdding(false);
    }
  };

  const s = found?.syllabus;
  const facts = found ? [found.code, s?.credits ? `${s.credits} ${s.credits === 1 ? 'kredit' : s.credits < 5 ? 'kredity' : 'kreditů'}` : '', s?.completion ?? '', s?.semester ?? ''].filter(Boolean) : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Přidat předmět"
      description="Stačí kód nebo název – zbytek dohledám v SISu."
      footer={
        <>
          <Button variant="ghost" onClick={() => onManual(CODE_RE.test(query.trim().toUpperCase()) ? { code: query.trim().toUpperCase() } : { name: query.trim() })}>
            Zadat ručně
          </Button>
          {found && existing ? (
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                navigateTo('predmety', existing.id);
              }}
            >
              Otevřít předmět
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void add()} disabled={!found || busy} loading={adding}>
              Přidat předmět
            </Button>
          )}
        </>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMatches([]);
          void lookup(query);
        }}
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Kód nebo název předmětu</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="např. JSB022 nebo Základy logiky"
            autoFocus
            className="h-11 w-full rounded-full bg-surface-2 pl-10 pr-4 text-[15px] ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={query.trim().length < 3 || busy}>
          Najít
        </Button>
      </form>

      <div className="mt-4 min-h-[120px]">
        {busy && (
          <p className="flex items-center gap-2 text-[14px] text-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Hledám ve veřejném SISu…
          </p>
        )}

        {!busy && !found && !error && (
          <ul className="space-y-2 text-[13.5px] leading-relaxed text-muted">
            <li className="flex gap-2.5">
              <Glyph name="cap" size={18} className="mt-0.5 text-accent" />
              <span>Kód předmětu najdete v rozvrhu nebo v SISu (třeba JSB022). Funguje i část názvu.</span>
            </li>
            <li className="flex gap-2.5">
              <Glyph name="doc" size={18} className="mt-0.5 text-accent" />
              <span>Doplním název, kredity, zakončení, vyučující a sylabus. Z podmínek zakončení vytáhnu povinnosti a termíny.</span>
            </li>
            <li className="flex gap-2.5">
              <Glyph name="calendar" size={18} className="mt-0.5 text-accent" />
              <span>Celý rozvrh najednou načtete v Nastavení → Propojení → SIS.</span>
            </li>
          </ul>
        )}

        {!busy && error && (
          <div className="rounded-[18px] bg-surface-2 p-4 ring-1 ring-inset ring-line">
            <p className="text-[14px] font-bold">{/429|příliš/i.test(error) ? 'SIS je teď přetížený' : 'V SISu jsem ho nenašel'}</p>
            <p className="mt-1 text-[13.5px] text-muted">{/429/.test(error) ? 'Zkuste to prosím za chvíli, nebo předmět zadejte ručně.' : `${error} Zkuste kód předmětu, nebo ho zadejte ručně.`}</p>
          </div>
        )}

        {!busy && found && (
          <div className="space-y-3">
            <article className="rounded-[20px] bg-accent-soft/60 p-4 ring-1 ring-inset ring-accent/20">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-accent">{existing ? 'Tento předmět už máte' : 'Nalezeno v SISu'}</p>
              <h3 className="mt-1 font-display text-[26px] leading-tight">{found.name}</h3>
              <p className="mt-1 text-[13.5px] font-semibold text-muted">{facts.join(' · ')}</p>
              {found.faculty && <p className="text-[13px] text-muted">{found.faculty}</p>}
              {(s?.guarantor || s?.teachers?.length) && (
                <p className="mt-2 text-[13px] text-muted">
                  {s?.guarantor ? `Garant: ${s.guarantor}` : ''}
                  {s?.teachers?.length ? `${s?.guarantor ? ' · ' : ''}Vyučující: ${s.teachers.slice(0, 3).join(', ')}${s.teachers.length > 3 ? '…' : ''}` : ''}
                </p>
              )}
              <a href={found.page.url || sisSubjectUrl(found.code)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent hover:underline">
                <ExternalLink className="size-3.5" aria-hidden /> Otevřít v SISu
              </a>
            </article>

            {matches.length > 1 && (
              <div>
                <p className="mb-1.5 text-[12.5px] font-bold text-muted">Není to on? V SISu jsem našel i:</p>
                <ul className="divide-y divide-line overflow-hidden rounded-[16px] ring-1 ring-inset ring-line">
                  {matches.map((m) => (
                    <li key={m.code}>
                      <button
                        type="button"
                        onClick={() => void lookup(m.code)}
                        className={cn('flex w-full items-baseline gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2', m.code === found.code && 'bg-surface-2')}
                        aria-current={m.code === found.code ? 'true' : undefined}
                      >
                        <span className="w-[5.5rem] shrink-0 font-mono text-[12.5px] font-semibold text-muted">{m.code}</span>
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{m.name ?? 'Zobrazit'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
