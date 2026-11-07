/**
 * Playlist ze Spotify bez přihlašování: oficiální vložený přehrávač
 * (open.spotify.com/embed) + odkaz, který na telefonu otevře aplikaci Spotify.
 * Odkaz se předem ověří (soukromé playlisty a osobní mixy přehrávač neumí –
 * Spotify by ukázal „Page not found“). Přehrávač se načte, až když je vidět.
 */
import { useEffect, useRef, useState } from 'react';
import { MUSIC_PICKS, spotifyEmbedUrl, spotifyInfo, spotifyOpenUrl, type SpotifyInfo } from '../../lib/music';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { cn } from '../ui/primitives';

function NoteGlyph({ light }: { light?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="size-10 shrink-0" aria-hidden>
      <rect width="40" height="40" rx="12" className={light ? 'fill-white/15' : 'fill-[var(--accent-soft)]'} />
      <path d="M16 26.5V13.8l11-2.3v12.7" fill="none" className={light ? 'stroke-white' : 'stroke-[var(--accent)]'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13.6" cy="26.6" r="2.6" className={light ? 'fill-white' : 'fill-[var(--accent)]'} />
      <circle cx="24.6" cy="24.3" r="2.6" className={light ? 'fill-white' : 'fill-[var(--accent)]'} />
    </svg>
  );
}

export function PlaylistPlayer({ className, light = false, compact = false }: { className?: string; light?: boolean; compact?: boolean }) {
  const music = useAppStore((s) => s.settings.music);
  const embed = spotifyEmbedUrl(music?.url);
  const open = spotifyOpenUrl(music?.url);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [info, setInfo] = useState<SpotifyInfo | null>(null);

  useEffect(() => {
    setInfo(null);
    if (!embed) return;
    let alive = true;
    void spotifyInfo(music?.url).then((r) => alive && setInfo(r));
    return () => {
      alive = false;
    };
  }, [embed, music?.url]);

  // Když se přehrávač nenačte (slabý signál, blokovaný obsah), nabídnout aspoň odkaz.
  useEffect(() => {
    if (!visible || loaded) return;
    const t = setTimeout(() => setSlow(true), 9000);
    return () => clearTimeout(t);
  }, [visible, loaded]);

  useEffect(() => {
    const el = holder.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, embed]);

  const choose = () => useUiStore.getState().openSetup('extras');
  const box = cn('flex w-full items-center gap-3 rounded-[18px] px-3.5 py-2.5 text-left ring-1 ring-inset transition', light ? 'bg-white/10 text-white ring-white/25 hover:bg-white/20' : 'bg-surface-2/70 ring-line hover:bg-surface-2', className);

  if (!embed) {
    return (
      <button type="button" onClick={choose} className={box}>
        <NoteGlyph light={light} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold">Hudba na soustředění</span>
          <span className={cn('block text-[12px]', light ? 'text-white/75' : 'text-muted')}>Vyberte playlist ze Spotify – bez přihlašování.</span>
        </span>
      </button>
    );
  }

  const title = info?.title ?? music?.title ?? MUSIC_PICKS.find((p) => p.url === music?.url)?.title ?? 'Váš playlist';

  if (info && !info.ok) {
    return (
      <div className={box} role="status">
        <NoteGlyph light={light} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold">Tenhle playlist přehrávač neumí</span>
          <span className={cn('block text-[12px] leading-snug', light ? 'text-white/75' : 'text-muted')}>Je soukromý, je to osobní mix (Daily Mix, Discover Weekly) nebo už neexistuje. Vyberte veřejný playlist.</span>
        </span>
        <button type="button" onClick={choose} className={cn('shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold', light ? 'bg-white text-[#1b3626]' : 'bg-accent text-accent-fg')}>
          Vybrat
        </button>
      </div>
    );
  }

  const height = compact ? 80 : 152;
  return (
    <div className={cn('min-w-0', className)}>
      <div ref={holder} className={cn('relative overflow-hidden rounded-[14px]', light ? 'bg-white/10' : 'bg-surface-2')} style={{ height }}>
        {!loaded && (
          <div className={cn('absolute inset-0 flex items-center gap-3 px-3.5', light ? 'text-white' : 'text-fg')} aria-hidden>
            <NoteGlyph light={light} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold">{title}</span>
              <span className={cn('block text-[12px]', light ? 'text-white/70' : 'text-muted')}>{slow ? 'Přehrávač se nenačetl – otevřete playlist ve Spotify.' : 'Načítám přehrávač Spotify…'}</span>
            </span>
          </div>
        )}
        {visible && info?.ok !== false && (
          <iframe
            title={`Spotify: ${title}`}
            src={embed}
            width="100%"
            height={height}
            className={cn('relative block w-full border-0 transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        )}
      </div>
      {open && (
        <div className={cn('mt-1.5 flex items-center justify-between gap-2 text-[12px]', light ? 'text-white/75' : 'text-muted')}>
          <span className="truncate">Celé skladby hraje Spotify, když jste v něm přihlášení.</span>
          <a href={open} target="_blank" rel="noreferrer" className={cn('shrink-0 font-bold hover:underline', light ? 'text-white' : 'text-accent')}>
            Otevřít ve Spotify
          </a>
        </div>
      )}
    </div>
  );
}
