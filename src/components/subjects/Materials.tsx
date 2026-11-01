import { useMemo, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Eye, FileUp, KeyRound, Link2, NotebookPen, Paperclip, Pencil, Plus, Trash, Upload, ExternalLink } from 'lucide-react';
import type { Material, Requirement, Subject } from '../../types';
import { formatBytes, loadBlob, saveBlob } from '../../lib/blobStore';
import { formatDate } from '../../lib/dates';
import { uid } from '../../lib/id';
import { moodleFileUrlWithToken } from '../../services/moodle';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { Menu, Modal } from '../ui/overlays';
import { Button, Card, Chip, cn, EmptyState, Field, IconButton, Segmented, Select, TextArea, TextInput } from '../ui/primitives';
import { materialVisual } from './materialVisual';

const MAX_UPLOAD = 50 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Otevření materiálu                                                  */
/* ------------------------------------------------------------------ */

export function useMaterialOpener() {
  const settings = useAppStore((s) => s.settings);
  const [viewer, setViewer] = useState<Material | null>(null);

  const open = async (m: Material) => {
    if (m.kind === 'note') {
      setViewer(m);
      return;
    }
    if (m.kind === 'link' || m.kind === 'moodle-link') {
      if (m.url) window.open(m.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (m.kind === 'upload' && m.blobKey) {
      const blob = await loadBlob(m.blobKey);
      if (!blob) {
        toast.error('Soubor se v úložišti prohlížeče nenašel (mohl být smazán).');
        return;
      }
      const url = URL.createObjectURL(blob);
      const previewable = blob.type === 'application/pdf' || blob.type.startsWith('image/') || blob.type.startsWith('text/');
      if (previewable) window.open(url, '_blank', 'noopener');
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = m.fileName ?? m.title;
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    if (m.kind === 'moodle-file' && m.url) {
      if (settings.mode === 'live' && settings.moodle?.token) {
        window.open(moodleFileUrlWithToken(m.url, settings.moodle.token), '_blank', 'noopener,noreferrer');
      } else {
        setViewer(m);
      }
    }
  };

  return { open, viewer, closeViewer: () => setViewer(null) };
}

/* ------------------------------------------------------------------ */
/* Panel materiálů předmětu                                            */
/* ------------------------------------------------------------------ */

type Filter = 'all' | 'moodle' | 'mine';

export function MaterialsPanel({ subject, materials, requirements, onOpen }: { subject: Subject; materials: Material[]; requirements: Requirement[]; onOpen: (m: Material) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const removeMaterial = useAppStore((s) => s.removeMaterial);
  const updateMaterial = useAppStore((s) => s.updateMaterial);

  const groups = useMemo(() => {
    const visible = materials.filter((m) => {
      if (filter === 'moodle') return m.source === 'moodle';
      if (filter === 'mine') return m.source !== 'moodle';
      return true;
    });
    const map = new Map<string, Material[]>();
    for (const m of visible) {
      const key = m.source === 'moodle' ? (m.section ?? 'Moodle') : 'Moje soubory, poznámky a odkazy';
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()].sort(([a], [b]) => (a.startsWith('Moje') ? 1 : b.startsWith('Moje') ? -1 : a.localeCompare(b, 'cs', { numeric: true })));
  }, [materials, filter]);

  const reqTitle = (id?: string) => requirements.find((r) => r.id === id)?.title;

  return (
    <Card
      title="Studijní materiály"
      icon={Paperclip}
      action={
        <Button
          size="sm"
          variant="soft"
          icon={Plus}
          onClick={() => {
            setAddKey((k) => k + 1);
            setAddOpen(true);
          }}
        >
          Přidat
        </Button>
      }
    >
      <Segmented
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `Vše (${materials.length})` },
          { value: 'moodle', label: 'Z Moodlu' },
          { value: 'mine', label: 'Moje' },
        ]}
        className="mb-3"
      />
      {groups.length === 0 ? (
        <EmptyState icon={FileUp} title="Zatím žádné materiály">
          Prezentace a PDF se stáhnou automaticky po propojení Moodlu. Vlastní soubory, poznámky a odkazy přidáš tlačítkem Přidat.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {groups.map(([section, items]) => (
            <section key={section}>
              <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">{section}</h3>
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {items.map((m) => {
                    const v = materialVisual(m);
                    const linked = reqTitle(m.requirementId);
                    return (
                      <motion.li key={m.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2">
                        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', v.bg)}>
                          <v.icon className={cn('size-[18px]', v.text)} aria-hidden />
                        </span>
                        <button type="button" onClick={() => onOpen(m)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-[13.5px] font-medium group-hover:text-accent">{m.title}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <span>{v.label}</span>
                            {m.size ? <span>{formatBytes(m.size)}</span> : null}
                            {m.kind === 'upload' && <span>nahráno {formatDate(new Date(m.createdAt))}</span>}
                            {linked && <span className="truncate">↳ {linked}</span>}
                          </span>
                        </button>
                        <span className="flex items-center">
                          <Menu
                            label="Připojit k povinnosti"
                            items={[
                              { label: 'Jen k předmětu', hint: m.requirementId ? undefined : 'aktuálně', onSelect: () => updateMaterial(m.id, { requirementId: undefined }) },
                              ...requirements.map((r) => ({
                                label: r.title,
                                hint: r.id === m.requirementId ? 'aktuálně připojeno' : undefined,
                                icon: Paperclip,
                                onSelect: () => updateMaterial(m.id, { requirementId: r.id }),
                              })),
                            ]}
                            trigger={(props) => <IconButton icon={Paperclip} label="Připojit k povinnosti" size="sm" {...props} />}
                          />
                          <IconButton icon={m.kind === 'note' ? Eye : m.kind === 'link' || m.kind === 'moodle-link' ? ExternalLink : Download} label="Otevřít" size="sm" onClick={() => onOpen(m)} />
                          {m.source !== 'moodle' && (
                            <IconButton
                              icon={Trash}
                              label="Smazat"
                              size="sm"
                              tone="danger"
                              onClick={() => {
                                if (window.confirm(`Smazat „${m.title}“?`)) removeMaterial(m.id);
                              }}
                            />
                          )}
                        </span>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      )}
      <AddMaterialModal key={addKey} open={addOpen} onClose={() => setAddOpen(false)} subject={subject} requirements={requirements} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Přidání materiálu                                                   */
/* ------------------------------------------------------------------ */

function guessLinkTitle(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('docs.google.com')) return u.pathname.includes('/spreadsheets') ? 'Google Tabulka' : u.pathname.includes('/presentation') ? 'Google Prezentace' : 'Google Dokument';
    if (u.hostname.includes('drive.google.com')) return 'Složka na Google Disku';
    if (u.hostname.includes('youtu')) return 'Video na YouTube';
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'Odkaz';
  }
}

export function AddMaterialModal({ open, onClose, subject, requirements, defaultRequirementId }: { open: boolean; onClose: () => void; subject: Subject; requirements: Requirement[]; defaultRequirementId?: string }) {
  const addMaterial = useAppStore((s) => s.addMaterial);
  const [tab, setTab] = useState<'file' | 'link' | 'note'>('file');
  const [requirementId, setRequirementId] = useState(defaultRequirementId ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  };

  const save = async () => {
    const now = new Date().toISOString();
    const base = { subjectId: subject.id, requirementId: requirementId || undefined, source: 'manual' as const, createdAt: now };
    setBusy(true);
    try {
      if (tab === 'file') {
        let saved = 0;
        for (const file of files) {
          if (file.size > MAX_UPLOAD) {
            toast.error(`${file.name} je větší než 50 MB – nahraj ho raději na Google Disk a přidej odkaz.`);
            continue;
          }
          const blobKey = uid('blob');
          await saveBlob(blobKey, file);
          addMaterial({ ...base, id: uid('mat'), kind: 'upload', title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, mimeType: file.type, size: file.size, blobKey });
          saved++;
        }
        if (saved) toast.success(saved === 1 ? 'Soubor uložen do zařízení.' : `Uloženo ${saved} souborů.`);
      } else if (tab === 'link') {
        const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
        addMaterial({ ...base, id: uid('mat'), kind: 'link', title: title.trim() || guessLinkTitle(normalized), url: normalized });
        toast.success('Odkaz přidán.');
      } else {
        addMaterial({ ...base, id: uid('mat'), kind: 'note', title: title.trim() || 'Poznámka', markdown });
        toast.success('Poznámka uložena.');
      }
      onClose();
    } catch (error) {
      toast.error(`Uložení se nezdařilo: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const canSave = tab === 'file' ? files.length > 0 : tab === 'link' ? url.trim().length > 3 : markdown.trim().length > 0 || title.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Přidat studijní materiál"
      description={subject.name}
      icon={Upload}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!canSave} loading={busy}>
            Uložit
          </Button>
        </>
      }
    >
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'file', label: 'Soubor', icon: FileUp },
          { value: 'link', label: 'Odkaz', icon: Link2 },
          { value: 'note', label: 'Poznámka', icon: NotebookPen },
        ]}
        className="mb-4"
      />
      {tab === 'file' && (
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn('flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors', dragging ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2')}
          >
            <FileUp className="mb-2 size-7 text-subtle" aria-hidden />
            <span className="text-sm font-medium">Přetáhni soubory sem nebo klikni</span>
            <span className="mt-1 text-xs text-muted">PDF, prezentace, tabulky, obrázky… do 50 MB. Uloží se jen v tomto zařízení (IndexedDB).</span>
          </button>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
          {files.length > 0 && (
            <ul className="mt-3 space-y-1 text-[13px]">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-1.5">
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {tab === 'link' && (
        <div className="grid gap-3">
          <Field label="Adresa" hint="Google Docs, Google Disk, YouTube, článek… Název doplním automaticky.">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…" inputMode="url" />
          </Field>
          <Field label="Název (nepovinné)">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={url ? guessLinkTitle(url) : 'např. Seminárka – pracovní verze'} />
          </Field>
        </div>
      )}
      {tab === 'note' && (
        <div className="grid gap-3">
          <Field label="Název">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="např. Výpisky z přednášky 5" />
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium">Text (Markdown)</span>
              <Segmented size="sm" value={preview ? 'preview' : 'edit'} onChange={(v) => setPreview(v === 'preview')} options={[{ value: 'edit', label: 'Psát' }, { value: 'preview', label: 'Náhled' }]} />
            </div>
            {preview ? (
              <div className="markdown min-h-40 rounded-xl border border-line-strong bg-surface p-3 text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown || '*Nic tu zatím není.*'}</ReactMarkdown>
              </div>
            ) : (
              <TextArea value={markdown} onChange={(e) => setMarkdown(e.target.value)} rows={9} className="font-mono text-[13px]" placeholder={'## Hlavní body\n- [ ] úkol\n- **důležité**'} />
            )}
          </div>
        </div>
      )}
      <Field label="Připojit k povinnosti (nepovinné)" className="mt-4">
        <Select value={requirementId} onChange={(e) => setRequirementId(e.target.value)}>
          <option value="">Jen k předmětu</option>
          {requirements.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Prohlížeč: poznámka (Markdown) / soubor z Moodlu v sandboxu         */
/* ------------------------------------------------------------------ */

export function MaterialViewer({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const updateMaterial = useAppStore((s) => s.updateMaterial);
  const settings = useAppStore((s) => s.settings);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isNote = material?.kind === 'note';
  const tokenPreview = settings.moodle?.token ? `${settings.moodle.token.slice(0, 4)}••••` : 'WSTOKEN';

  return (
    <Modal
      open={Boolean(material)}
      onClose={() => {
        setEditing(false);
        onClose();
      }}
      title={material?.title ?? ''}
      icon={isNote ? NotebookPen : KeyRound}
      size="lg"
      description={isNote ? 'Poznámka v Markdownu' : material?.section}
      footer={
        isNote && material ? (
          editing ? (
            <>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Zrušit
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  updateMaterial(material.id, { markdown: draft });
                  setEditing(false);
                  toast.success('Poznámka uložena.');
                }}
              >
                Uložit
              </Button>
            </>
          ) : (
            <Button
              icon={Pencil}
              onClick={() => {
                setDraft(material.markdown ?? '');
                setEditing(true);
              }}
            >
              Upravit
            </Button>
          )
        ) : undefined
      }
    >
      {material && isNote && (editing ? <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} rows={14} className="font-mono text-[13px]" /> : <div className="markdown text-sm leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]}>{material.markdown ?? ''}</ReactMarkdown></div>)}
      {material && material.kind === 'moodle-file' && (
        <div className="space-y-3 text-[13.5px] leading-relaxed">
          <div className="flex flex-wrap items-center gap-2">
            <Chip className="bg-orange-500/10 text-orange-700 dark:text-orange-300">Moodle</Chip>
            <Chip>{material.fileName}</Chip>
            {material.size ? <Chip>{formatBytes(material.size)}</Chip> : null}
          </div>
          <p>
            {settings.mode === 'demo'
              ? 'Tohle je ukázkový soubor ze sandboxu. V Live režimu se po kliknutí otevře přímo z Moodlu – aplikace k adrese souboru automaticky připojí tvůj token webové služby:'
              : 'Pro stažení souboru z Moodlu je potřeba token webové služby. Propoj Moodle v sekci Integrace – odkaz pak bude vypadat takto:'}
          </p>
          <code className="block overflow-x-auto whitespace-nowrap rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12px]">
            {moodleFileUrlWithToken(material.url ?? '', tokenPreview)}
          </code>
          <p className="text-xs text-muted">Token zůstává jen v tvém prohlížeči a do odkazu se vkládá až v okamžiku otevření.</p>
        </div>
      )}
    </Modal>
  );
}
