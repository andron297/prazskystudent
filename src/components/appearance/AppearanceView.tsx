/**
 * Vzhled: barevný motiv (i vlastní barva), světlý/tmavý režim, fotka na
 * hlavní stránce, pozadí aplikace (i vlastní fotka), písmo nadpisů a úvodní
 * animace. Vše se projeví okamžitě; vlastní fotky zůstávají jen v zařízení.
 */
import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, ExternalLink, ImagePlus, Monitor, Moon, Play, RotateCcw, Sparkles, Sun, Trash2, Upload } from 'lucide-react';
import type { AccentTheme, AppearanceSettings } from '../../types';
import { ACCENTS, DEFAULT_APPEARANCE, GALLERY, autoHeroPhoto, galleryPhoto, parseHex, photoCredit, photoUrl, resolveAppearance, type GalleryPhoto } from '../../lib/appearance';
import { removeImage, storeImage, useLocalImage, type ImageSlot } from '../../hooks/useLocalImage';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Button, Card, Segmented, TextInput, Toggle, cn } from '../ui/primitives';
import { SettingsBack } from '../settings/SettingsBack';

function useAppearance(): [AppearanceSettings, (patch: Partial<AppearanceSettings>) => void] {
  const stored = useAppStore((s) => s.settings.appearance);
  const a = resolveAppearance(stored);
  const update = (patch: Partial<AppearanceSettings>) => {
    const current = resolveAppearance(useAppStore.getState().settings.appearance);
    useAppStore.getState().updateSettings({ appearance: { ...current, ...patch } });
  };
  return [a, update];
}

/* ------------------------------------------------------------------ */
/* Náhled                                                              */
/* ------------------------------------------------------------------ */

function Preview({ a }: { a: AppearanceSettings }) {
  const now = useNow(60_000);
  const upload = useLocalImage('hero', a.heroPhoto === 'upload');
  const id = a.heroPhoto === 'auto' || (a.heroPhoto === 'upload' && upload === null) ? autoHeroPhoto(now, false) : a.heroPhoto;
  const src = a.heroPhoto === 'upload' && upload ? upload : photoUrl(id, 'medium');
  return (
    <div className="card overflow-hidden rounded-[28px]">
      <div className="relative isolate h-36 overflow-hidden bg-forest text-white sm:h-44">
        {(a.heroPhoto !== 'upload' || upload) && <img src={src} alt="" className="absolute inset-0 -z-20 size-full object-cover" />}
        <div className="photo-scrim absolute inset-0 -z-10" />
        <div className="flex h-full flex-col justify-end p-5">
          <p className="eyebrow text-white/75">Náhled</p>
          <p className="mt-1 font-display text-[40px] leading-[0.95]">
            Dobré <em className="text-[#e7d6b5]">odpoledne</em>
          </p>
        </div>
      </div>
      <div className="hidden space-y-3 p-5 sm:block">
        <p className="font-display text-[26px] leading-none">
          Další <em className="italic text-moss">přednáška</em>
        </p>
        <p className="text-[13.5px] text-muted">Dějiny umění · ve 14:00 v Hollaru. Vyrazit za 12 minut.</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13px] font-bold text-accent-fg">Navigovat</span>
          <span className="inline-flex h-9 items-center rounded-full bg-accent-soft px-3.5 text-[13px] font-bold text-accent">Tramvaj 22</span>
          <span className="inline-flex h-9 items-center rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold text-muted ring-1 ring-inset ring-line">Za 3 dny</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-2/3 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pomocné prvky                                                       */
/* ------------------------------------------------------------------ */

function Section({ title, hint, children, id }: { title: ReactNode; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <Card id={id} className="scroll-mt-24" title={title}>
      {hint && <p className="-mt-1 mb-4 text-[13.5px] leading-relaxed text-muted">{hint}</p>}
      {children}
    </Card>
  );
}

function PhotoTile({ photo, selected, onSelect, small }: { photo: GalleryPhoto; selected: boolean; onSelect: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} title={`${photo.title} · ${photoCredit(photo)}`} className={cn('group relative overflow-hidden rounded-[16px] text-left ring-offset-2 ring-offset-[var(--surface)] transition', small ? 'aspect-[4/3]' : 'aspect-[3/2]', selected ? 'ring-2 ring-accent' : 'ring-1 ring-line hover:ring-line-strong')}>
      <img src={photoUrl(photo.id, 'thumb')} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-[11.5px] font-semibold leading-tight text-white">{photo.title}</span>
      {selected && (
        <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-accent-fg shadow">
          <Check className="size-3.5" aria-hidden />
        </span>
      )}
    </button>
  );
}

function UploadTile({ slot, selected, onSelect, small }: { slot: ImageSlot; selected: boolean; onSelect: () => void; small?: boolean }) {
  const url = useLocalImage(slot);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File) => {
    setBusy(true);
    try {
      await storeImage(slot, file);
      onSelect();
      toast.success('Fotka je nastavená. Zůstává jen v tomto zařízení.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fotku se nepodařilo uložit.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn('relative overflow-hidden rounded-[16px] transition', small ? 'aspect-[4/3]' : 'aspect-[3/2]', selected && url ? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]' : 'ring-1 ring-line')}>
      {url ? (
        <>
          <button type="button" onClick={onSelect} className="absolute inset-0" aria-pressed={selected} aria-label="Použít vlastní fotku">
            <img src={url} alt="" className="size-full object-cover" />
          </button>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-[11.5px] font-semibold text-white">Vaše fotka</span>
          <span className="absolute right-1.5 top-1.5 flex gap-1">
            <button type="button" onClick={() => inputRef.current?.click()} className="grid size-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60" aria-label="Vyměnit fotku">
              <Upload className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={async () => {
                await removeImage(slot);
                toast.info('Vlastní fotka smazána.');
              }}
              className="grid size-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60"
              aria-label="Smazat vlastní fotku"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </span>
        </>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex size-full flex-col items-center justify-center gap-1.5 bg-surface-2 text-[12.5px] font-bold text-muted transition hover:bg-accent-soft hover:text-accent">
          <ImagePlus className="size-5" aria-hidden />
          {busy ? 'Ukládám…' : 'Nahrát vlastní'}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void onFile(f);
      }} />
    </div>
  );
}

const PRESETS = ['#2b5a40', '#1f5873', '#9a4527', '#7d3a58', '#56468a', '#b0851f', '#0f766e', '#be123c', '#334155'];

/* ------------------------------------------------------------------ */
/* Stránka                                                             */
/* ------------------------------------------------------------------ */

export function AppearanceView() {
  const [a, update] = useAppearance();
  const theme = useAppStore((s) => s.settings.theme);
  const displayName = useAppStore((s) => s.settings.displayName);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [hex, setHex] = useState(a.customAccent ?? '#2b5a40');
  const praha = GALLERY.filter((p) => p.group === 'praha');
  const priroda = GALLERY.filter((p) => p.group === 'priroda');

  const pickAccent = (id: AccentTheme) => {
    if (id === 'vlastni') update({ accent: id, customAccent: a.customAccent ?? hex });
    else update({ accent: id });
  };
  const setCustom = (value: string) => {
    setHex(value);
    if (parseHex(value)) update({ accent: 'vlastni', customAccent: value.startsWith('#') ? value : `#${value}` });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <SettingsBack />
        <h1 className="mt-1 font-display text-[46px] leading-[0.95] sm:text-[60px]">
          Vzhled <em className="italic text-moss">podle vás</em>
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">Barvy, fotky, pozadí i písmo. Změny se projeví hned a přenesou se i do dalších zařízení. Vlastní fotky zůstávají jen v tomto zařízení.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-5">
          <Section title={<>Jak vás <em className="italic text-moss">oslovit</em></>} hint="Zobrazí se v pozdravu na hlavní stránce a v úvodní animaci. Když pole necháte prázdné, vezmu jméno z Moodlu nebo z Googlu.">
            <TextInput value={displayName} onChange={(e) => updateSettings({ displayName: e.target.value })} placeholder="např. Ondro" maxLength={24} className="max-w-xs" aria-label="Jak vás oslovit" />
          </Section>

          <Section title={<>Barevný <em className="italic text-moss">motiv</em></>} hint="Barva tlačítek, zvýraznění a pásů. Každý motiv má světlou i tmavou podobu.">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {ACCENTS.map((t) => {
                const active = a.accent === t.id;
                const sw = t.id === 'vlastni' && a.customAccent ? [a.customAccent, a.customAccent, t.swatch[2]] : t.swatch;
                return (
                  <button key={t.id} type="button" onClick={() => pickAccent(t.id)} aria-pressed={active} className={cn('flex items-center gap-3 rounded-[18px] p-3 text-left transition', active ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2 ring-1 ring-inset ring-line hover:ring-line-strong')}>
                    <span className="relative size-10 shrink-0">
                      <span className="absolute inset-0 rounded-full shadow-inner" style={{ background: `linear-gradient(135deg, ${sw[1]} 0%, ${sw[0]} 55%)` }} />
                      <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full ring-2 ring-[var(--surface-2)]" style={{ background: sw[2] }} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-bold">{t.label}</span>
                      <span className="block truncate text-[12px] text-muted">{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {a.accent === 'vlastni' && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-wrap items-center gap-3 rounded-[18px] bg-surface-2 p-3 ring-1 ring-inset ring-line">
                <label className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-full ring-2 ring-line-strong" style={{ background: a.customAccent ?? hex }}>
                  <input type="color" value={parseHex(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : '#2b5a40'} onChange={(e) => setCustom(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Vybrat barvu" />
                </label>
                <input value={hex} onChange={(e) => setCustom(e.target.value.trim())} maxLength={7} className="h-10 w-28 rounded-full bg-surface px-3.5 font-mono text-[13.5px] uppercase ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-accent" aria-label="Barva v HEX" spellCheck={false} />
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((c) => (
                    <button key={c} type="button" onClick={() => setCustom(c)} className={cn('size-7 rounded-full ring-2 transition hover:scale-110', a.customAccent === c ? 'ring-fg' : 'ring-transparent')} style={{ background: c }} aria-label={`Barva ${c}`} />
                  ))}
                </div>
                <p className="w-full text-[12px] text-subtle">Odstín pro světlý a tmavý režim dopočítám tak, aby byl text na tlačítkách vždy dobře čitelný.</p>
              </motion.div>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13.5px] font-semibold">Režim</span>
              <Segmented
                value={theme}
                onChange={(v) => updateSettings({ theme: v })}
                options={[
                  { value: 'system', label: 'Podle zařízení', icon: Monitor },
                  { value: 'light', label: 'Světlý', icon: Sun },
                  { value: 'dark', label: 'Tmavý', icon: Moon },
                ]}
              />
            </div>
          </Section>

          <Section title={<>Fotka na <em className="italic text-moss">hlavní stránce</em></>} hint="Automaticky se střídá Praha podle denní doby (ráno, den, večer, noc) a za deště mlha. Nebo si vyberte jednu napevno.">
            <Toggle checked={a.heroPhoto === 'auto'} onChange={(v) => update({ heroPhoto: v ? 'auto' : autoHeroPhoto(new Date(), false) })} label="Automaticky podle denní doby" description="Každý den jiný záběr z dané denní doby." />
            <p className="eyebrow mb-2 mt-5 text-subtle">Praha</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {praha.map((p) => (
                <PhotoTile key={p.id} photo={p} selected={a.heroPhoto === p.id} onSelect={() => update({ heroPhoto: p.id })} />
              ))}
            </div>
            <p className="eyebrow mb-2 mt-5 text-subtle">Příroda a vlastní</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {priroda.map((p) => (
                <PhotoTile key={p.id} photo={p} selected={a.heroPhoto === p.id} onSelect={() => update({ heroPhoto: p.id })} />
              ))}
              <UploadTile slot="hero" selected={a.heroPhoto === 'upload'} onSelect={() => update({ heroPhoto: 'upload' })} />
            </div>
          </Section>

          <Section title={<>Pozadí <em className="italic text-moss">aplikace</em></>} hint="Fotka pod celou aplikací. Ztlumení určuje, jak moc fotka prosvítá – karty zůstávají čitelné.">
            <Segmented
              value={a.background}
              onChange={(v) => update({ background: v, backgroundPhoto: v === 'photo' ? (a.backgroundPhoto ?? 'hrad-vecer') : a.backgroundPhoto })}
              options={[
                { value: 'paper', label: 'Papír' },
                { value: 'photo', label: 'Fotka' },
                { value: 'upload', label: 'Vlastní' },
              ]}
            />
            {a.background === 'photo' && (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {GALLERY.map((p) => (
                  <PhotoTile key={p.id} small photo={p} selected={a.backgroundPhoto === p.id} onSelect={() => update({ backgroundPhoto: p.id })} />
                ))}
              </div>
            )}
            {a.background === 'upload' && (
              <div className="mt-4 max-w-xs">
                <UploadTile slot="background" selected onSelect={() => update({ background: 'upload' })} />
              </div>
            )}
            {a.background !== 'paper' && (
              <label className="mt-5 block">
                <span className="flex items-center justify-between text-[13.5px] font-semibold">
                  Ztlumení fotky <span className="tabular text-muted">{Math.round((a.backgroundDim ?? 0.55) * 100)} %</span>
                </span>
                <input type="range" min={15} max={90} step={5} value={Math.round((a.backgroundDim ?? 0.55) * 100)} onChange={(e) => update({ backgroundDim: Number(e.target.value) / 100 })} className="mt-2 w-full accent-[var(--accent)]" />
              </label>
            )}
          </Section>

          <Section title={<>Písmo <em className="italic text-moss">nadpisů</em></>}>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {(
                [
                  { id: 'serif', label: 'Elegantní', hint: 'Instrument Serif', family: 'var(--font-display)', weight: 400, spacing: '-0.01em', italic: true },
                  { id: 'sans', label: 'Moderní', hint: 'Manrope', family: 'var(--font-sans)', weight: 700, spacing: '-0.045em', italic: false },
                ] as const
              ).map((f) => {
                const active = a.headingFont === f.id;
                return (
                  <button key={f.id} type="button" onClick={() => update({ headingFont: f.id })} aria-pressed={active} className={cn('rounded-[18px] p-4 text-left transition', active ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface-2 ring-1 ring-inset ring-line hover:ring-line-strong')}>
                    <span className="block text-[34px] leading-none" style={{ fontFamily: f.family, fontWeight: f.weight, letterSpacing: f.spacing, fontSizeAdjust: f.id === 'sans' ? 0.4 : undefined }}>
                      Dobré <span className={cn('text-moss', f.italic && 'italic')}>ráno</span>
                    </span>
                    <span className="mt-2 block text-[13px] font-bold">{f.label}</span>
                    <span className="block text-[12px] text-muted">{f.hint}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title={<>Úvodní <em className="italic text-moss">animace</em></>} hint="Přivítání při každém otevření: logo, „Stihnete to.“ a tři věty o vašem dni (asi čtyři sekundy, klepnutím se dá přeskočit).">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Toggle checked={a.intro} onChange={(v) => update({ intro: v })} label="Přehrát při otevření" />
              <Button icon={Play} onClick={() => useUiStore.setState((s) => ({ introTick: s.introTick + 1 }))}>
                Přehrát ukázku
              </Button>
            </div>
          </Section>

          <details className="card group rounded-[28px] p-5 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[14.5px] font-bold">
              Autoři fotografií a licence
              <span className="text-[12.5px] font-semibold text-muted group-open:hidden">Zobrazit</span>
            </summary>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">Fotografie z Wikimedia Commons jsou pod licencemi Creative Commons BY-SA (pro aplikaci zmenšené a převedené do WebP). Ostatní pocházejí z Unsplash.</p>
            <ul className="mt-3 divide-y divide-line text-[13px]">
              {GALLERY.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2">
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-muted">· {p.author}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {p.licenseUrl ? (
                      <a href={p.licenseUrl} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-accent hover:underline">
                        {p.license}
                      </a>
                    ) : (
                      <span className="text-[12px] text-muted">{p.license}</span>
                    )}
                    <a href={p.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-muted hover:text-fg" aria-label={`Zdroj fotky ${p.title}`}>
                      zdroj <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              icon={RotateCcw}
              onClick={() => {
                useAppStore.getState().updateSettings({ appearance: { ...DEFAULT_APPEARANCE } });
                toast.info('Vzhled je zpět ve výchozí podobě.');
              }}
            >
              Výchozí vzhled
            </Button>
          </div>
        </div>

        <aside className="order-first space-y-3 lg:sticky lg:top-24 lg:order-none">
          <Preview a={a} />
          <p className="flex items-start gap-2 px-1 text-[12.5px] leading-relaxed text-subtle">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {a.heroPhoto === 'auto' ? 'Fotka se mění podle denní doby.' : a.heroPhoto === 'upload' ? 'Vlastní fotka z tohoto zařízení.' : (galleryPhoto(a.heroPhoto)?.title ?? '')}
          </p>
        </aside>
      </div>
    </div>
  );
}
