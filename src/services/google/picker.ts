/**
 * Výběr souborů a složek z Google Disku (Google Picker). Aplikace dostane
 * přístup jen k tomu, co student sám vybere (oprávnění drive.file) – ke
 * zbytku Disku ne. Vybrané položky se uloží jako odkazy k předmětu.
 */
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { googleClientIdFor, serverFlow } from '../syncCenter';
import { getAccessToken, GOOGLE_SCOPES, hasScopes, scopesForSettings, signIn } from './auth';

export interface PickedDriveItem {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  isFolder: boolean;
  sizeBytes?: number;
}

interface PickerDoc {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  sizeBytes?: number;
}

/* Minimální typy Google Pickeru (načítá se za běhu z apis.google.com). */
interface PickerNamespace {
  DocsView: new (viewId?: string) => PickerView;
  PickerBuilder: new () => PickerBuilder;
  ViewId: { DOCS: string };
  DocsViewMode: { LIST: string };
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
  Action: { PICKED: string; CANCEL: string };
}
interface PickerView {
  setIncludeFolders(v: boolean): PickerView;
  setSelectFolderEnabled(v: boolean): PickerView;
  setMode(mode: string): PickerView;
  setEnableDrives(v: boolean): PickerView;
  setOwnedByMe(v: boolean): PickerView;
  setLabel?(label: string): PickerView;
}
interface PickerBuilder {
  addView(view: PickerView): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setCallback(cb: (data: { action: string; docs?: PickerDoc[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}

declare global {
  interface Window {
    gapi?: { load: (name: string, options: { callback: () => void; onerror?: () => void }) => void };
  }
}

let loader: Promise<PickerNamespace> | null = null;

function loadPicker(): Promise<PickerNamespace> {
  if (loader) return loader;
  loader = new Promise<PickerNamespace>((resolve, reject) => {
    const ready = () =>
      window.gapi!.load('picker', {
        callback: () => {
          const ns = (window as unknown as { google?: { picker?: PickerNamespace } }).google?.picker;
          if (ns) resolve(ns);
          else reject(new Error('Výběr z Disku se nepodařilo spustit.'));
        },
        onerror: () => reject(new Error('Výběr z Disku se nepodařilo načíst.')),
      });
    if (window.gapi) return ready();
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error('Nepodařilo se načíst Google Picker (jsi online?).'));
    document.head.appendChild(script);
  }).catch((error) => {
    loader = null;
    throw error;
  });
  return loader;
}

/** Je výběr z Disku k dispozici (klíč správce + propojený Google v režimu Live)? */
export function drivePickerAvailable(): boolean {
  const server = useUiStore.getState().server;
  const app = useAppStore.getState();
  return Boolean(server.googlePickerKey && googleClientIdFor() && app.settings.mode === 'live');
}

/** Otevře výběr z Disku (volat z kliknutí – může se otevřít okno přihlášení). */
export async function pickFromDrive(): Promise<PickedDriveItem[]> {
  const apiKey = useUiStore.getState().server.googlePickerKey;
  const clientId = googleClientIdFor();
  if (!apiKey || !clientId) throw new Error('Výběr z Disku zatím správce aplikace nezapnul. Vlož odkaz ručně.');
  const fileScope = GOOGLE_SCOPES.drive[0];
  if (!hasScopes([fileScope])) {
    const settings = useAppStore.getState().settings.google;
    await signIn({ clientId, scopes: [...new Set([...scopesForSettings(settings), fileScope])], serverFlow: serverFlow(), prompt: '' });
  }
  const token = await getAccessToken(serverFlow());
  const g = await loadPicker();
  const appId = clientId.split('-')[0];
  return new Promise((resolve) => {
    const myDrive = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setMode(g.DocsViewMode.LIST);
    const shared = new g.DocsView(g.ViewId.DOCS).setEnableDrives(true).setIncludeFolders(true).setSelectFolderEnabled(true).setMode(g.DocsViewMode.LIST);
    const picker = new g.PickerBuilder()
      .addView(myDrive)
      .addView(shared)
      .enableFeature(g.Feature.MULTISELECT_ENABLED)
      .enableFeature(g.Feature.SUPPORT_DRIVES)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setLocale('cs')
      .setOrigin(window.location.origin)
      .setTitle('Vyber soubory nebo složky k předmětu')
      .setCallback((data) => {
        if (data.action === g.Action.PICKED) {
          resolve(
            (data.docs ?? []).map((d) => ({
              id: d.id,
              name: d.name,
              mimeType: d.mimeType,
              url: d.url,
              isFolder: d.mimeType === 'application/vnd.google-apps.folder',
              sizeBytes: d.sizeBytes,
            })),
          );
        } else if (data.action === g.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

/** Rozpozná odkaz na Google Disk / Dokumenty (soubor nebo složku). */
export function parseDriveLink(raw: string): { id: string; kind: 'folder' | 'document' | 'spreadsheet' | 'presentation' | 'file'; url: string } | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) return null;
  const folder = /\/folders\/([\w-]{10,})/.exec(url.pathname);
  if (folder) return { id: folder[1], kind: 'folder', url: url.toString() };
  const doc = /\/(document|spreadsheets|presentation|file)\/d\/([\w-]{10,})/.exec(url.pathname);
  if (doc) {
    const kind = doc[1] === 'spreadsheets' ? 'spreadsheet' : doc[1] === 'document' ? 'document' : doc[1] === 'presentation' ? 'presentation' : 'file';
    return { id: doc[2], kind, url: url.toString() };
  }
  const open = url.searchParams.get('id');
  if (open && /^[\w-]{10,}$/.test(open)) return { id: open, kind: 'file', url: url.toString() };
  return null;
}
