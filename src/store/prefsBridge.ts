/**
 * Volby soustředění (délka bloků, navazování, zvuk) se ukládají i do nastavení,
 * aby platily na všech zařízeních s účtem – a změna z jiného zařízení se sem
 * propíše zpátky.
 */
import { useAppStore } from './appStore';
import { useFocusStore, type FocusPresetId } from './focusStore';

let started = false;

export function startPrefsBridge(): void {
  if (started) return;
  started = true;

  // Při startu: co je v nastavení (z účtu), má přednost.
  const apply = () => {
    const p = useAppStore.getState().settings.prefs;
    const f = useFocusStore.getState();
    if (!p) return;
    const patch: Partial<{ presetId: FocusPresetId; autoNext: boolean; sound: boolean }> = {};
    if (p.focusPreset && p.focusPreset !== f.presetId && f.endsAt === null && ['classic', 'deep', 'sprint'].includes(p.focusPreset)) patch.presetId = p.focusPreset as FocusPresetId;
    if (typeof p.focusAutoNext === 'boolean' && p.focusAutoNext !== f.autoNext) patch.autoNext = p.focusAutoNext;
    if (typeof p.focusSound === 'boolean' && p.focusSound !== f.sound) patch.sound = p.focusSound;
    if (Object.keys(patch).length) useFocusStore.setState(patch);
  };
  apply();

  useAppStore.subscribe((s, prev) => {
    if (s.settings.prefs !== prev.settings.prefs) apply();
  });

  useFocusStore.subscribe((f, prev) => {
    if (f.presetId === prev.presetId && f.autoNext === prev.autoNext && f.sound === prev.sound) return;
    const st = useAppStore.getState();
    const p = st.settings.prefs ?? {};
    if (p.focusPreset === f.presetId && p.focusAutoNext === f.autoNext && p.focusSound === f.sound) return;
    st.updateSettings({ prefs: { ...p, focusPreset: f.presetId, focusAutoNext: f.autoNext, focusSound: f.sound } });
  });
}
