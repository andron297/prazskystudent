/**
 * Výběr hudby: připravené veřejné playlisty, nebo odkaz na vlastní
 * (ověří se, že ho Spotify pustí do přehrávače). Stejný v průvodci
 * nastavením i v Propojení.
 */
import { useState } from 'react';
import { MUSIC_PICKS, isSpotifyUrl, spotifyInfo } from '../../lib/music';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { cn } from '../ui/primitives';

export function MusicPicker({ onPicked }: { onPicked?: () => void }) {
  const music = useAppStore((s) => s.settings.music);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const saveLink = async () => {
    if (!isSpotifyUrl(link)) {
      toast.error('Vložte odkaz ze Spotify (Sdílet → Kopírovat odkaz).');
      return;
    }
    setBusy(true);
    const info = await spotifyInfo(link.trim());
    setBusy(false);
    if (!info.ok) {
      toast.error('Tenhle playlist Spotify do přehrávače nepustí – je soukromý nebo je to osobní mix. Zvolte veřejný playlist.');
      return;
    }
    updateSettings({ music: { url: link.trim(), title: info.title ?? 'Můj playlist' } });
    setLink('');
    onPicked?.();
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {MUSIC_PICKS.map((p) => {
          const active = music?.url === p.url;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                updateSettings({ music: { url: p.url, title: p.title } });
                onPicked?.();
              }}
              aria-pressed={active}
              className={cn('rounded-[18px] p-3.5 text-left ring-1 ring-inset transition', active ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface ring-line hover:bg-surface-2')}
            >
              <span className="block text-[15px] font-bold">{p.title}</span>
              <span className={cn('text-[13px]', active ? 'opacity-90' : 'text-muted')}>{p.mood}</span>
            </button>
          );
        })}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void saveLink();
        }}
      >
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="…nebo vložte odkaz na svůj veřejný playlist"
          className="h-12 min-w-0 flex-1 rounded-[16px] bg-surface px-4 text-[14.5px] ring-1 ring-inset ring-line-strong outline-none focus:ring-2 focus:ring-accent"
          aria-label="Odkaz na playlist Spotify"
        />
        <button type="submit" disabled={busy} className="h-12 shrink-0 rounded-[16px] bg-accent px-4 text-[14.5px] font-bold text-accent-fg disabled:opacity-60">
          Uložit
        </button>
      </form>
      {music && (
        <button type="button" onClick={() => updateSettings({ music: null })} className="mt-2 text-[12.5px] font-semibold text-muted hover:text-fg">
          Hudbu vypnout
        </button>
      )}
    </div>
  );
}
