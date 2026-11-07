/**
 * Fakulta se pozná sama: jakmile je v rozvrhu dost hodin v budovách jedné
 * fakulty, nastaví se (jen pokud ji student ještě nikdy nezvolil) a aplikace
 * to krátce oznámí. Změnit jde kdykoli v Nastavení → Škola a budovy.
 */
import { useEffect } from 'react';
import { detectFaculty } from '../lib/buildings';
import { useAppStore } from '../store/appStore';
import { toast } from '../store/uiStore';
import { useVisibleEvents } from './useVisibleEvents';

export function useFacultyAutoDetect(): void {
  const mode = useAppStore((s) => s.settings.mode);
  const faculty = useAppStore((s) => s.settings.faculty);
  const buildings = useAppStore((s) => s.settings.buildings);
  const aliases = useAppStore((s) => s.settings.locationAliases);
  const events = useVisibleEvents();
  useEffect(() => {
    if (mode !== 'live' || faculty !== undefined || events.length === 0) return;
    const found = detectFaculty(events, buildings, aliases);
    if (!found || found.matches < 3) return;
    const prev = useAppStore.getState().settings.myBuildings ?? [];
    useAppStore.getState().updateSettings({ faculty: found.faculty.id, myBuildings: [...new Set([...found.faculty.buildings, ...prev])] });
    toast.success(`Podle rozvrhu jsem nastavil vaši školu: ${found.faculty.short}. Budovy upravíte v Nastavení → Škola a budovy.`);
  }, [mode, faculty, events, buildings, aliases]);
}
