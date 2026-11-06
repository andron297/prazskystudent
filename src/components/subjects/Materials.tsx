import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, Download, Eye, FilePlus2, FileSpreadsheet, FileText, FileUp, FolderOpen, HardDrive, KeyRound, Link2, LoaderCircle, NotebookPen, Paperclip, Pencil, Plus, Presentation, Trash, Upload, ExternalLink } from 'lucide-react';
import type { Material, Requirement, Subject } from '../../types';
import { formatBytes, loadBlob, saveBlob } from '../../lib/blobStore';
import { formatDate, formatRelative } from '../../lib/dates';
import { createGoogleFile, driveFileInfo, driveFilesAvailable, folderUrl, subjectFolder, uploadToSubject, type DriveFileInfo, type GoogleDocKind } from '../../services/google/driveFiles';
import { uid } from '../../lib/id';
import { moodleFileUrlWithToken } from '../../services/moodle';
import { drivePickerAvailable, parseDriveLink, pickFromDrive, type PickedDriveItem } from '../../services/google/picker';
import { useAppStore } from '../../store/appStore';
import { confirmAction, toast } from '../../store/uiStore';
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
/* Google Disk: lišta a údaje o souborech                              */
/* ------------------------------------------------------------------ */

/** Otevře nové okno hned (kvůli blokování vyskakovacích oken) a adresu doplní později. */
async function openLater(work: () => Promise<string | undefined>): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const url = await work();
    if (url && win) win.location.href = url;
    else win?.close();
  } catch (error) {
    win?.close();
    throw error;
  }
}

function addDriveMaterial(subject: Subject, info: DriveFileInfo, requirementId?: string) {
  useAppStore.getState().addMaterial({
    id: uid('mat'),
    subjectId: subject.id,
    requirementId,
    kind: 'link',
    title: info.name.replace(/\.[^.]{1,5}$/, ''),
    fileName: info.name,
    url: info.webViewLink,
    mimeType: info.mimeType,
    driveFileId: info.id,
    size: info.size ? Number(info.size) : undefined,
    source: 'google',
    createdAt: new Date().toISOString(),
  });
}

const DOC_KINDS: { kind: GoogleDocKind; label: string; icon: typeof FileText }[] = [
  { kind: 'document', label: 'Dokument Google', icon: FileText },
  { kind: 'spreadsheet', label: 'Tabulka Google', icon: FileSpreadsheet },
  { kind: 'presentation', label: 'Prezentace Google', icon: Presentation },
];

function DriveBar({ subject }: { subject: Subject }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try {
      await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };
  const upload = (files: File[]) =>
    run('upload', async () => {
      let done = 0;
      for (const file of files) {
        const info = await uploadToSubject(subject, file, (r) => setBusy(`upload:${Math.round(r * 100)}`));
        addDriveMaterial(subject, info);
        done++;
      }
      toast.success(done === 1 ? 'Nahráno na Google Disk do složky předmětu.' : `Nahráno ${done} souborů na Google Disk.`);
    });
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[18px] bg-surface-2/70 px-3 py-2.5 ring-1 ring-inset ring-line">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] text-muted">
        <HardDrive className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="truncate">
          Google Disk · <span className="font-semibold text-fg">Stihnu/{subject.code ?? subject.name}</span>
        </span>
      </span>
      <button type="button" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-bold ring-1 ring-inset ring-line hover:bg-surface-2 disabled:opacity-60">
        {busy?.startsWith('upload') ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Upload className="size-3.5" aria-hidden />}
        {busy?.startsWith('upload:') ? `${busy.slice(7)} %` : 'Nahrát'}
      </button>
      <Menu
        label="Nový soubor na Disku"
        items={DOC_KINDS.map((d) => ({
          label: d.label,
          icon: d.icon,
          onSelect: () =>
            void run('create', () =>
              openLater(async () => {
                const info = await createGoogleFile(subject, d.kind);
                addDriveMaterial(subject, info);
                toast.success(`${d.label} vytvořen ve složce předmětu.`);
                return info.webViewLink;
              }),
            ),
        }))}
        trigger={(props) => (
          <button type="button" disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-[12.5px] font-bold ring-1 ring-inset ring-line hover:bg-surface-2 disabled:opacity-60" {...props}>
            {busy === 'create' ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <FilePlus2 className="size-3.5" aria-hidden />} Nový <ChevronDown className="size-3.5" aria-hidden />
          </button>
        )}
      />
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void run('folder', () => openLater(async () => folderUrl(await subjectFolder(subject))))}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold text-muted hover:bg-surface hover:text-fg disabled:opacity-60"
      >
        <FolderOpen className="size-3.5" aria-hidden /> Složka
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void upload(files);
        }}
      />
    </div>
  );
}

/** „upraveno před 2 h (Jana)“ u souborů z Disku. */
function DriveMeta({ id }: { id: string }) {
  const [info, setInfo] = useState<DriveFileInfo | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    driveFileInfo(id)
      .then((r) => alive && setInfo(r))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [id]);
  if (!info?.modifiedTime) return null;
  const who = info.lastModifyingUser?.me ? 'vámi' : info.lastModifyingUser?.displayName;
  return (
    <span className="inline-flex items-center gap-1">
      {info.iconLink && <img src={info.iconLink} alt="" className="size-3.5" loading="lazy" referrerPolicy="no-referrer" />}
      upraveno {formatRelative(new Date(info.modifiedTime), new Date())}
      {who ? ` (${who})` : ''}
    </span>
  );
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
  const googleConnected = useAppStore((s) => Boolean(s.googleSync.live.connectedAt) && s.settings.mode === 'live');
  const driveReady = googleConnected && driveFilesAvailable();

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
      {driveReady && <DriveBar subject={subject} />}
      {groups.length === 0 ? (
        <EmptyState icon={FileUp} title="Zatím žádné materiály">
          Prezentace a PDF se stáhnou automaticky po propojení Moodlu. Vlastní soubory, poznámky a odkazy přidáte tlačítkem Přidat.
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
                            {m.kind === 'upload' && <span>nahráno {formatDate(new Date(m.createdAt))} · jen v tomto zařízení</span>}
                            {driveReady && m.driveFileId && m.source === 'google' && <DriveMeta id={m.driveFileId} />}
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
                              onClick={async () => {
                                if (await confirmAction({ title: `Smazat „${m.title}“?`, confirmLabel: 'Smazat', tone: 'danger' })) removeMaterial(m.id);
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
  const [tab, setTab] = useState<'file' | 'drive' | 'link' | 'note'>('file');
  const [picked, setPicked] = useState<PickedDriveItem[]>([]);
  const [driveLink, setDriveLink] = useState('');
  const pickerReady = drivePickerAvailable();
  const parsedDrive = driveLink.trim() ? parseDriveLink(driveLink) : null;
  const [requirementId, setRequirementId] = useState(defaultRequirementId ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const driveOk = driveFilesAvailable();
  const [toDrive, setToDrive] = useState(driveOk);

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
      if (tab === 'file' && toDrive && driveOk) {
        let saved = 0;
        for (const file of files) {
          const info = await uploadToSubject(subject, file);
          addDriveMaterial(subject, info, requirementId || undefined);
          saved++;
        }
        if (saved) toast.success(saved === 1 ? 'Nahráno na Google Disk do složky předmětu.' : `Nahráno ${saved} souborů na Google Disk.`);
      } else if (tab === 'file') {
        let saved = 0;
        for (const file of files) {
          if (file.size > MAX_UPLOAD) {
            toast.error(`${file.name} je větší než 50 MB – nahrajte ho raději na Google Disk a přidejte odkaz.`);
            continue;
          }
          const blobKey = uid('blob');
          await saveBlob(blobKey, file);
          addMaterial({ ...base, id: uid('mat'), kind: 'upload', title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, mimeType: file.type, size: file.size, blobKey });
          saved++;
        }
        if (saved) toast.success(saved === 1 ? 'Soubor uložen do zařízení.' : `Uloženo ${saved} souborů.`);
      } else if (tab === 'drive') {
        for (const item of picked) {
          addMaterial({ ...base, id: uid('mat'), kind: 'link', title: item.name, url: item.url, mimeType: item.mimeType, driveFileId: item.id, size: item.sizeBytes, source: 'google' });
        }
        if (parsedDrive) {
          const kindTitle = { folder: 'Složka na Google Disku', document: 'Dokument Google', spreadsheet: 'Tabulka Google', presentation: 'Prezentace Google', file: 'Soubor na Google Disku' }[parsedDrive.kind];
          addMaterial({
            ...base,
            id: uid('mat'),
            kind: 'link',
            title: title.trim() || kindTitle,
            url: parsedDrive.url,
            driveFileId: parsedDrive.id,
            mimeType: parsedDrive.kind === 'folder' ? 'application/vnd.google-apps.folder' : undefined,
            source: 'google',
          });
        }
        const count = picked.length + (parsedDrive ? 1 : 0);
        toast.success(count === 1 ? 'Přidáno z Google Disku.' : `Přidáno ${count} položek z Google Disku.`);
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

  const canSave =
    tab === 'file' ? files.length > 0 : tab === 'drive' ? picked.length > 0 || Boolean(parsedDrive) : tab === 'link' ? url.trim().length > 3 : markdown.trim().length > 0 || title.trim().length > 0;

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
          { value: 'drive', label: 'Google Disk', icon: HardDrive },
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
            <span className="text-sm font-medium">Přetáhněte soubory sem nebo klikněte</span>
            <span className="mt-1 text-xs text-muted">{toDrive && driveOk ? 'PDF, prezentace, tabulky, obrázky… Nahraje se na Google Disk do složky předmětu.' : 'PDF, prezentace, tabulky, obrázky… do 50 MB. Uloží se jen v tomto zařízení.'}</span>
          </button>
          {driveOk && (
            <label className="mt-3 flex items-start gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px]">
              <input type="checkbox" checked={toDrive} onChange={(e) => setToDrive(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span>
                <strong>Uložit na Google Disk</strong> do složky „Stihnu/{subject.code ?? subject.name}“ – soubor pak otevřete na každém zařízení.
              </span>
            </label>
          )}
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
      {tab === 'drive' && (
        <div className="grid gap-3">
          {pickerReady ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  const items = await pickFromDrive();
                  if (items.length) setPicked((prev) => [...prev, ...items.filter((i) => !prev.some((p) => p.id === i.id))]);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : String(error));
                }
              }}
              className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong px-4 py-7 text-center transition-colors hover:bg-surface-2"
            >
              <HardDrive className="mb-2 size-7 text-moss" aria-hidden />
              <span className="text-sm font-semibold">Vybrat soubory nebo složky z Google Disku</span>
              <span className="mt-1 text-xs text-muted">Můžete vybrat víc položek najednou, i ze sdílených disků. Aplikace uvidí jen to, co vyberete.</span>
            </button>
          ) : (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-muted">
              Vložte odkaz na soubor nebo složku z Disku (v Disku: pravé tlačítko → <strong>Sdílet</strong> → <strong>Kopírovat odkaz</strong>).
              {useAppStore.getState().settings.mode === 'live' && ' Výběr přímo z Disku se objeví, až ho správce aplikace zapne.'}
            </p>
          )}
          {picked.length > 0 && (
            <ul className="space-y-1 text-[13px]">
              {picked.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {p.isFolder ? <FolderOpen className="size-4 shrink-0 text-emerald-600" aria-hidden /> : <FileText className="size-4 shrink-0 text-blue-600" aria-hidden />}
                    <span className="truncate">{p.name}</span>
                  </span>
                  <button type="button" onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))} className="shrink-0 text-xs font-semibold text-muted hover:text-fg">
                    Odebrat
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Field label={pickerReady ? 'Nebo vložte odkaz' : 'Odkaz na Google Disk'} hint={driveLink && !parsedDrive ? 'Tohle nevypadá jako odkaz na Google Disk nebo Dokumenty Google.' : undefined}>
            <TextInput value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" inputMode="url" />
          </Field>
          {parsedDrive && (
            <Field label="Název (nepovinné)">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={parsedDrive.kind === 'folder' ? 'např. Podklady k seminárce' : 'např. Seminárka – pracovní verze'} />
            </Field>
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
              ? 'Tohle je ukázkový soubor. S vlastními daty se po kliknutí otevře přímo z Moodlu – aplikace k adrese souboru sama připojí váš klíč webové služby:'
              : 'Ke stažení souboru z Moodlu je potřeba klíč webové služby. Propojte Moodle v sekci Propojení – odkaz pak bude vypadat takto:'}
          </p>
          <code className="block overflow-x-auto whitespace-nowrap rounded-xl border border-line bg-surface-2 p-3 font-mono text-[12px]">
            {moodleFileUrlWithToken(material.url ?? '', tokenPreview)}
          </code>
          <p className="text-xs text-muted">Klíč zůstává jen ve vašem zařízení a do odkazu se vloží až ve chvíli otevření.</p>
        </div>
      )}
    </Modal>
  );
}
