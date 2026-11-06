/**
 * Hudba: propojený účet Spotify v designu aplikace – co právě hraje
 * (s ovládáním pro Premium), na kterém zařízení, vaše playlisty, naposledy
 * hrané a playlist na učení pro odpočívadla. Bez přihlášení funguje vložený
 * přehrávač playlistu.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Headphones, Laptop, ListMusic, LogOut, Music2, Pause, Play, Radio, ShieldCheck, Smartphone, SkipBack, SkipForward, Speaker } from 'lucide-react';
import { MUSIC_PICKS, isSpotifyUrl, spotifyEmbedUrl } from '../../lib/music';
import { connectSpotify, control, devices, disconnectSpotify, myPlaylists, playback, recentlyPlayed, useSpotify, type SpotifyDevice, type SpotifyPlayback, type SpotifyPlaylist, type SpotifyTrack } from '../../services/spotify';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { Button, Card, TextInput, cn } from '../ui/primitives';

const fmt = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

function DeviceIcon({ type, className }: { type: string; className?: string }) {
  const t = type.toLowerCase();
  const Icon = t === 'smartphone' ? Smartphone : t === 'computer' ? Laptop : t === 'speaker' ? Speaker : Radio;
  return <Icon className={className} aria-hidden />;
}

/* ------------------------------------------------------------------ */
/* Vložený přehrávač (funguje bez přihlášení)                          */
/* ------------------------------------------------------------------ */

function EmbedPlayer({ url, title }: { url: string; title?: string }) {
  const embed = spotifyEmbedUrl(url);
  if (!embed) return null;
  return (
    <iframe
      key={embed}
      title={title ? `Spotify: ${title}` : 'Přehrávač Spotify'}
      src={embed}
      className="h-[352px] w-full rounded-[18px] border-0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Právě hraje                                                         */
/* ------------------------------------------------------------------ */

function NowPlaying({ premium, onEmbed }: { premium: boolean; onEmbed: (url: string, title: string) => void }) {
  const [state, setState] = useState<SpotifyPlayback | null | undefined>(undefined);
  const [list, setList] = useState<SpotifyDevice[]>([]);
  const [tick, setTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([playback(), devices().catch(() => [])]);
      setState(p);
      setList(d);
    } catch (e) {
      setState(null);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => document.visibilityState === 'visible' && void refresh(), 6000);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setTimeout(() => void refresh(), 450);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const track = state?.track;
  const progress = state && track ? Math.min(track.durationMs, state.progressMs + (state.playing ? tick - state.fetchedAt : 0)) : 0;

  return (
    <section className="relative isolate overflow-hidden rounded-[30px] bg-forest text-white shadow-[0_30px_60px_-35px_rgb(0_0_0/0.6)]">
      {track?.image && <img src={track.image} alt="" className="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-60 blur-2xl" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-black/55 via-black/35 to-black/65" />
      <div className="grid gap-5 p-5 sm:grid-cols-[180px_1fr] sm:items-center sm:p-7">
        <div className="relative mx-auto aspect-square w-[180px] overflow-hidden rounded-[22px] bg-white/10 shadow-[0_20px_40px_-18px_rgb(0_0_0/0.7)] sm:mx-0">
          {track?.image ? <img src={track.image} alt={`Obal: ${track.album}`} className="size-full object-cover" /> : <Music2 className="absolute inset-0 m-auto size-12 text-white/50" aria-hidden />}
        </div>
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2 text-white/70">
            {state?.playing ? (
              <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="w-[3px] rounded-full bg-[#a8c79f]" animate={{ height: ['30%', '100%', '45%', '80%', '30%'] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }} />
                ))}
              </span>
            ) : null}
            {state === undefined ? 'Načítám…' : state?.playing ? 'Právě hraje' : track ? 'Pozastaveno' : 'Teď nic nehraje'}
          </p>
          <h2 className="mt-1.5 truncate font-display text-[34px] leading-tight sm:text-[42px]">{track?.name ?? 'Ticho před učením'}</h2>
          <p className="truncate text-[15px] text-white/80">{track ? `${track.artists} · ${track.album}` : 'Pusťte si playlist níže – na zařízení, kde máte Spotify otevřené.'}</p>
          {track && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-[#a8c79f]" style={{ width: `${(progress / Math.max(1, track.durationMs)) * 100}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[11.5px] tabular text-white/65">
                <span>{fmt(progress)}</span>
                <span>{fmt(track.durationMs)}</span>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {premium ? (
              <>
                <button type="button" disabled={busy || !state} onClick={() => void act(control.previous)} className="grid size-10 place-items-center rounded-full bg-white/12 hover:bg-white/20 disabled:opacity-40" aria-label="Předchozí skladba">
                  <SkipBack className="size-[18px]" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(() => (state?.playing ? control.pause() : control.play(state?.device ? {} : { deviceId: list[0]?.id })))}
                  className="grid size-12 place-items-center rounded-full bg-white text-[#14261b] shadow-lg transition hover:scale-105 disabled:opacity-50"
                  aria-label={state?.playing ? 'Pozastavit' : 'Přehrát'}
                >
                  {state?.playing ? <Pause className="size-5 fill-current" aria-hidden /> : <Play className="ml-0.5 size-5 fill-current" aria-hidden />}
                </button>
                <button type="button" disabled={busy || !state} onClick={() => void act(control.next)} className="grid size-10 place-items-center rounded-full bg-white/12 hover:bg-white/20 disabled:opacity-40" aria-label="Další skladba">
                  <SkipForward className="size-[18px]" aria-hidden />
                </button>
              </>
            ) : (
              <span className="rounded-full bg-white/12 px-3 py-1.5 text-[12.5px] text-white/85">Ovládat přehrávání z aplikace jde se Spotify Premium.</span>
            )}
            {track && (
              <button type="button" onClick={() => onEmbed(track.url, track.name)} className="ml-auto text-[12.5px] font-semibold text-white/75 underline-offset-2 hover:text-white hover:underline">
                Otevřít v přehrávači
              </button>
            )}
          </div>
          {list.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {list.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={!premium || d.active || d.restricted || busy}
                  onClick={() => void act(() => control.transfer(d.id))}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition', d.active ? 'bg-[#a8c79f] text-[#14261b]' : 'bg-white/10 text-white/85 hover:bg-white/20 disabled:hover:bg-white/10')}
                  title={d.active ? 'Hraje tady' : premium ? 'Přepnout přehrávání sem' : undefined}
                >
                  <DeviceIcon type={d.type} className="size-3.5" /> {d.name}
                  {d.active && <Check className="size-3.5" aria-hidden />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stránka                                                             */
/* ------------------------------------------------------------------ */

function ConnectCard({ configured }: { configured: boolean }) {
  const error = useSpotify((s) => s.error);
  const status = useSpotify((s) => s.status);
  return (
    <section className="card overflow-hidden rounded-[28px]">
      <div className="grid gap-5 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
        <div>
          <h2 className="font-display text-[34px] leading-none">
            Propojte <em className="italic text-moss">Spotify</em>
          </h2>
          <ul className="mt-4 grid gap-2 text-[14px] sm:grid-cols-2">
            {['Co právě hraje, přímo v aplikaci', 'Ovládání a přepínání zařízení (Premium)', 'Vaše playlisty jedním klepnutím', 'Naposledy hrané skladby'].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-[12.5px] text-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Přihlášení zůstává jen v tomto zařízení. Stihnu nevidí vaše heslo a nic za vás nepublikuje.
          </p>
          {error && <p className="mt-3 rounded-[14px] bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-700 dark:text-red-300">{error}</p>}
          {!configured && <p className="mt-3 text-[13px] text-muted">Přihlášení ke Spotify zatím správce aplikace nezapnul. Playlist níže ale přehrajete i tak.</p>}
        </div>
        <Button variant="primary" size="lg" icon={Headphones} disabled={!configured || status === 'connecting'} loading={status === 'connecting'} onClick={() => void connectSpotify().catch((e) => toast.error(e instanceof Error ? e.message : String(e)))}>
          Propojit Spotify
        </Button>
      </div>
    </section>
  );
}

function PlaylistGrid({ items, onPick, activeUri }: { items: SpotifyPlaylist[]; onPick: (p: SpotifyPlaylist) => void; activeUri?: string }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onPick(p)} className="group block w-full text-left">
            <span className="relative block aspect-square overflow-hidden rounded-[18px] bg-surface-2 shadow-[0_14px_30px_-20px_rgb(0_0_0/0.5)]">
              {p.image ? <img src={p.image} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" /> : <ListMusic className="absolute inset-0 m-auto size-9 text-subtle" aria-hidden />}
              <span className="absolute bottom-2 right-2 grid size-10 translate-y-2 place-items-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
                <Play className="ml-0.5 size-4 fill-current" aria-hidden />
              </span>
              {activeUri === p.uri && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">Hraje</span>}
            </span>
            <span className="mt-2 block truncate text-[14px] font-bold">{p.name}</span>
            <span className="block truncate text-[12px] text-muted">
              {p.tracks} skladeb{p.owner ? ` · ${p.owner}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MusicView() {
  const status = useSpotify((s) => s.status);
  const profile = useSpotify((s) => s.profile);
  const music = useAppStore((s) => s.settings.music);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [recent, setRecent] = useState<SpotifyTrack[]>([]);
  const [embed, setEmbed] = useState<{ url: string; title: string } | null>(null);
  const [link, setLink] = useState('');
  const connected = status === 'connected';

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    myPlaylists()
      .then((p) => alive && setPlaylists(p))
      .catch((e) => {
        if (alive) setPlaylists([]);
        toast.error(e instanceof Error ? e.message : String(e));
      });
    recentlyPlayed()
      .then((r) => alive && setRecent(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [connected]);

  const study = music?.url ? { url: music.url, title: music.title ?? 'Váš playlist' } : null;
  const shown = embed ?? study;

  const playPlaylist = async (p: SpotifyPlaylist) => {
    if (profile?.premium) {
      try {
        const list = await devices();
        const target = list.find((d) => d.active) ?? list[0];
        if (target) {
          await control.play({ contextUri: p.uri, deviceId: target.active ? undefined : target.id });
          toast.success(`Hraje „${p.name}“ na ${target.name}.`);
          return;
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    }
    setEmbed({ url: p.url, title: p.name });
    toast.info('Pouštím v přehrávači tady na stránce.');
    window.scrollTo({ top: document.getElementById('prehravac')?.offsetTop ?? 0, behavior: 'smooth' });
  };

  const picks = useMemo(() => MUSIC_PICKS, []);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <p className="eyebrow text-subtle">Hudba</p>
          <h1 className="mt-1 font-display text-[46px] leading-[0.95] sm:text-[60px]">
            Hudba <em className="italic text-moss">na učení i na cestu</em>
          </h1>
        </div>
        {connected && profile && (
          <div className="flex items-center gap-2.5 rounded-full bg-surface py-1.5 pl-1.5 pr-3 ring-1 ring-inset ring-line">
            {profile.image ? <img src={profile.image} alt="" className="size-8 rounded-full object-cover" /> : <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent">{profile.name[0]}</span>}
            <span className="text-[13px] font-bold">{profile.name}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide', profile.premium ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}>{profile.premium ? 'Premium' : 'Free'}</span>
            <button type="button" onClick={() => disconnectSpotify()} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Odpojit Spotify" title="Odpojit Spotify">
              <LogOut className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </header>

      {connected ? <NowPlaying premium={Boolean(profile?.premium)} onEmbed={(url, title) => setEmbed({ url, title })} /> : <ConnectCard configured={status !== 'off'} />}

      {connected && (
        <Card title={<>Vaše <em className="italic text-moss">playlisty</em></>} eyebrow={profile?.premium ? 'Klepnutím pustíte tam, kde máte Spotify otevřené' : 'Klepnutím otevřete v přehrávači'}>
          {playlists === null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton aspect-square rounded-[18px]" />
              ))}
            </div>
          ) : playlists.length === 0 ? (
            <p className="text-[14px] text-muted">Žádné playlisty jsme nenašli.</p>
          ) : (
            <PlaylistGrid items={playlists} onPick={(p) => void playPlaylist(p)} activeUri={undefined} />
          )}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Card id="prehravac" title={<>Přehrávač</>} eyebrow={shown ? shown.title : 'Vyberte playlist'}>
          <AnimatePresence mode="wait">
            {shown ? (
              <motion.div key={shown.url} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EmbedPlayer url={shown.url} title={shown.title} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {music?.url !== shown.url && (
                    <Button size="sm" variant="soft" icon={Check} onClick={() => updateSettings({ music: { url: shown.url, title: shown.title } })}>
                      Nastavit jako hudbu na učení
                    </Button>
                  )}
                  {music?.url === shown.url && <span className="text-[12.5px] font-semibold text-accent">Tohle je vaše hudba na učení – hraje i v odpočívadlech.</span>}
                </div>
              </motion.div>
            ) : (
              <p className="text-[14px] text-muted">Vyberte playlist v části Na učení nebo vložte odkaz ze Spotify.</p>
            )}
          </AnimatePresence>
          <p className="mt-3 text-[12px] text-subtle">Přihlášení ve Spotify v tomto prohlížeči = celé skladby, jinak ukázky.</p>
        </Card>

        <div className="space-y-5">
          <Card title={<>Na <em className="italic text-moss">učení</em></>}>
            <ul className="space-y-1.5">
              {picks.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setEmbed({ url: p.url, title: p.title })} className={cn('flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition', shown?.url === p.url ? 'bg-accent-soft ring-1 ring-inset ring-accent/30' : 'hover:bg-surface-2')}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-forest text-forest-fg">
                      <Music2 className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">{p.title}</span>
                      <span className="block text-[12px] text-muted">{p.mood}</span>
                    </span>
                    {shown?.url === p.url && <Play className="size-4 fill-current text-accent" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isSpotifyUrl(link)) {
                  toast.error('Tohle není odkaz ze Spotify (Sdílet → Kopírovat odkaz).');
                  return;
                }
                setEmbed({ url: link.trim(), title: 'Váš odkaz' });
                setLink('');
              }}
            >
              <TextInput value={link} onChange={(e) => setLink(e.target.value)} placeholder="Odkaz na playlist nebo album" inputMode="url" />
              <Button type="submit" variant="soft">
                Pustit
              </Button>
            </form>
          </Card>

          {connected && recent.length > 0 && (
            <Card title={<>Naposledy <em className="italic text-moss">hráno</em></>}>
              <ul className="space-y-1">
                {recent.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setEmbed({ url: t.url, title: t.name })} className="flex w-full items-center gap-3 rounded-[14px] px-2 py-1.5 text-left hover:bg-surface-2">
                      {t.image ? <img src={t.image} alt="" loading="lazy" className="size-10 shrink-0 rounded-[10px] object-cover" /> : <span className="size-10 shrink-0 rounded-[10px] bg-surface-2" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{t.name}</span>
                        <span className="block truncate text-[12px] text-muted">{t.artists}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
