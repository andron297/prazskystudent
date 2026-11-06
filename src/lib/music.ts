/**
 * Hudba ze Spotify bez přihlášení: odkaz na playlist/album → vložený přehrávač
 * (open.spotify.com/embed). Přihlášený ve Spotify v prohlížeči slyší celé
 * skladby, jinak ukázky. Žádný účet ani klíč aplikace nepotřebuje.
 */
export interface MusicPick {
  id: string;
  title: string;
  mood: string;
  url: string;
}

/** Oficiální playlisty Spotify vhodné k učení a na cestu. */
export const MUSIC_PICKS: MusicPick[] = [
  { id: 'focus', title: 'Deep Focus', mood: 'Soustředění', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ' },
  { id: 'piano', title: 'Peaceful Piano', mood: 'Klid', url: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO' },
  { id: 'lofi', title: 'lofi beats', mood: 'Pohoda', url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' },
  { id: 'brain', title: 'Brain Food', mood: 'Energie', url: 'https://open.spotify.com/playlist/37i9dQZF1DWXLeA8Omikj7' },
];

const SPOTIFY_RE = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album|track|show|episode|artist)\/([A-Za-z0-9]{10,32})/;

/** Odkaz ze Spotify (Sdílet → Kopírovat odkaz) → adresa vloženého přehrávače, jinak null. */
export function spotifyEmbedUrl(url: string | undefined | null): string | null {
  const m = SPOTIFY_RE.exec((url ?? '').trim());
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator` : null;
}

/** Odkaz, který na telefonu otevře aplikaci Spotify (jinak web přehrávač). */
export function spotifyOpenUrl(url: string | undefined | null): string | null {
  const m = SPOTIFY_RE.exec((url ?? '').trim());
  return m ? `https://open.spotify.com/${m[1]}/${m[2]}` : null;
}

export function isSpotifyUrl(url: string): boolean {
  return SPOTIFY_RE.test(url.trim());
}
