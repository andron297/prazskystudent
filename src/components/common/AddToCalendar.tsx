import { useState } from 'react';
import { CalendarPlus, Download, ExternalLink, BellRing } from 'lucide-react';
import type { CalendarItem } from '../../lib/calendarExport';
import { downloadIcs, formatReminder, googleCalendarUrl } from '../../lib/calendarExport';
import { insertGoogleEvents } from '../../lib/googleCalendar';
import { useAppStore } from '../../store/appStore';
import { toast, useUiStore } from '../../store/uiStore';
import { resolveClientId } from '../../services/google/auth';
import { Menu, type MenuItem } from '../ui/overlays';
import { Button, IconButton } from '../ui/primitives';

/** Jednotné tlačítko „Do kalendáře“: Google API (s připomínkami), přímý odkaz, nebo .ics. */
export function AddToCalendar({ items, filename, compact = false, label = 'Do kalendáře' }: { items: CalendarItem[]; filename: string; compact?: boolean; label?: string }) {
  const settingsClientId = useAppStore((s) => s.settings.google.clientId || s.settings.googleOAuthClientId);
  const server = useUiStore((s) => s.server);
  const clientId = resolveClientId(settingsClientId, server.googleClientId);
  const reminders = useAppStore((s) => s.settings.reminders);
  const [busy, setBusy] = useState(false);
  const reminderText = reminders.length ? reminders.map(formatReminder).join(', ') : 'bez připomínek';

  const viaApi = async () => {
    setBusy(true);
    try {
      const n = await insertGoogleEvents(clientId, items, reminders, server.googleServerFlow);
      toast.success(`Přidáno do Google Kalendáře (${n}) s připomínkami: ${reminderText}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const menuItems: MenuItem[] = [];
  if (clientId) {
    menuItems.push({ label: 'Google Kalendář (API)', hint: `Zapíše přímo s připomínkami: ${reminderText}`, icon: BellRing, onSelect: () => void viaApi() });
  }
  if (items.length === 1) {
    menuItems.push({
      label: 'Google Kalendář (odkaz)',
      hint: clientId ? 'Otevře předvyplněnou událost' : 'Otevře předvyplněnou událost – pro automatické připomínky použijte .ics nebo propojte Google v Nastavení → Propojení',
      icon: ExternalLink,
      onSelect: () => window.open(googleCalendarUrl(items[0]), '_blank', 'noopener,noreferrer'),
    });
  }
  menuItems.push({
    label: 'Stáhnout .ics',
    hint: `Pro Google, Apple i Outlook · připomínky ${reminderText}`,
    icon: Download,
    onSelect: () => {
      downloadIcs(filename, items, { calendarName: 'Stihnuto', reminders });
      toast.success(items.length === 1 ? 'Soubor .ics je stažený – otevřete ho a událost se přidá do kalendáře.' : `Staženo ${items.length} událostí v jednom .ics souboru.`);
    },
  });

  return (
    <Menu
      label="Přidat do kalendáře"
      items={menuItems}
      trigger={(props) =>
        compact ? (
          <IconButton icon={CalendarPlus} label={label} size="sm" {...props} disabled={busy || items.length === 0} />
        ) : (
          <Button size="sm" icon={CalendarPlus} loading={busy} disabled={items.length === 0} {...props}>
            {label}
          </Button>
        )
      }
    />
  );
}
