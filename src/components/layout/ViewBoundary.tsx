/**
 * Pojistka: když se část aplikace nepodaří vykreslit (chyba v datech, stará
 * verze v mezipaměti telefonu po aktualizaci…), nezmizí celá stránka. Ukáže se
 * srozumitelná zpráva s tlačítkem „Zkusit znovu“; u nenačteného souboru
 * aplikace se stránka jednou sama obnoví na nejnovější verzi.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_KEY = 'stihnu:chunk-reload';

export function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|preload/i.test(message);
}

/** Po chybě načtení souboru obnovit stránku – nejvýš jednou za minutu (žádná smyčka). */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

interface State {
  error: Error | null;
}

export class ViewBoundary extends Component<{ children: ReactNode; compact?: boolean; label?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isChunkError(error) && reloadOnceForNewVersion()) return;
    console.error('Stihnu: část aplikace se nevykreslila', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    if (this.props.compact) {
      return (
        <div className="card rounded-[24px] p-4 text-[13.5px] text-muted" role="alert">
          <p className="font-semibold text-fg">{this.props.label ?? 'Tahle karta'} se teď nenačetla.</p>
          <button type="button" onClick={() => this.setState({ error: null })} className="mt-2 font-bold text-accent hover:underline">
            Zkusit znovu
          </button>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg py-10 text-center" role="alert">
        <p className="font-display text-[34px] leading-tight">{chunk ? 'Je tu nová verze' : 'Tohle se nepovedlo načíst'}</p>
        <p className="mt-2 text-[14.5px] text-muted">{chunk ? 'Aplikace se mezitím aktualizovala. Obnovte stránku a pojedeme dál.' : 'Vaše data jsou v pořádku. Zkuste to znovu, případně stránku obnovte.'}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))} className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-[14.5px] font-bold text-accent-fg hover:brightness-110">
            {chunk ? 'Obnovit stránku' : 'Zkusit znovu'}
          </button>
          {!chunk && (
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 items-center rounded-full px-5 text-[14.5px] font-bold text-muted ring-1 ring-inset ring-line hover:text-fg">
              Obnovit stránku
            </button>
          )}
        </div>
        <p className="mt-4 text-[12px] text-subtle">Podrobnost pro opravu: {error.message.slice(0, 160)}</p>
      </div>
    );
  }
}
