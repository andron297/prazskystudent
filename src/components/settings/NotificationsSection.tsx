/**
 * Upozornění: kdy vyrazit a termíny (v zařízení), zkušební upozornění,
 * návod pro iPhone a zakázané povolení, připomínky u ručně přidaných termínů.
 */
import { useEffect, useState } from 'react';
import { formatReminder } from '../../lib/calendarExport';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { showNotification } from '../notifications/AlertsCenter';
import { Glyph } from '../ui/Glyph';
import { Button, Card, cn, Toggle } from '../ui/primitives';

function usePermission() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission>(supported ? Notification.permission : 'denied');
  useEffect(() => {
    if (!supported) return;
    // Povolení se mohlo změnit v nastavení prohlížeče.
    const update = () => setPermission(Notification.permission);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [supported]);
  const request = async (): Promise<NotificationPermission> => {
    if (!supported) return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  };
  return { supported, permission, request };
}

function isIos(): boolean {
  return typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}

function isInstalled(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

const STATUS = {
  granted: { label: 'Povoleno', cls: 'bg-accent-soft text-accent' },
  default: { label: 'Zatím nepovoleno', cls: 'bg-surface-2 text-muted' },
  denied: { label: 'Zakázáno v prohlížeči', cls: 'bg-red-500/12 text-red-700 dark:text-red-300' },
} as const;

export function NotificationsSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const { supported, permission, request } = usePermission();
  const iosBrowser = isIos() && !isInstalled();
  const notifyLeave = Boolean(settings.notifyLeave) && permission === 'granted';
  const notifyDeadlines = Boolean(settings.notifyDeadlines) && permission === 'granted';

  const enable = async (patch: { notifyLeave?: boolean; notifyDeadlines?: boolean }) => {
    const turningOn = Object.values(patch).some(Boolean);
    if (turningOn && permission !== 'granted') {
      const result = await request();
      if (result !== 'granted') {
        toast.error(result === 'denied' ? 'Upozornění jsou v prohlížeči zakázaná – níže je, jak je povolit.' : 'Bez povolení upozornění to nepůjde.');
        return;
      }
    }
    updateSettings(patch);
  };

  const test = async () => {
    if (permission !== 'granted' && (await request()) !== 'granted') {
      toast.error('Nejdřív povolte upozornění.');
      return;
    }
    await showNotification('Stihnuto', 'Takhle vypadá upozornění. Až bude čas vyrazit nebo se blíží termín, ozvu se stejně.', 'stihnuto-test');
    toast.success('Zkušební upozornění je odeslané.');
  };

  return (
    <div className="space-y-4">
      <Card eyebrow="V tomto zařízení" title={<>Upozornění <em className="italic text-moss">na čas</em></>}>
        {!supported ? (
          <p className="text-[14px] leading-relaxed text-muted">
            {iosBrowser ? 'Na iPhonu a iPadu fungují upozornění jen v nainstalované aplikaci – postup je níže.' : 'Tento prohlížeč upozornění neumí. Všechno ale uvidíte na hlavní stránce a pod zvonkem v horní liště.'}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold text-muted">Stav:</span>
              <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-bold', STATUS[permission].cls)}>{STATUS[permission].label}</span>
            </p>
            <Toggle checked={notifyLeave} onChange={(v) => void enable({ notifyLeave: v })} label="Kdy vyrazit" description="5 minut před odchodem a ve chvíli, kdy je čas vyrazit – se spojem a nástupištěm." />
            <Toggle checked={notifyDeadlines} onChange={(v) => void enable({ notifyDeadlines: v })} label="Termíny úkolů" description="Večer předem v 18:00 a 3 hodiny před termínem." />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={() => void test()}>
                Poslat zkušební upozornění
              </Button>
            </div>
            <p className="text-[12.5px] leading-relaxed text-subtle">Upozornění chodí, dokud je Stihnuto otevřené (stačí na pozadí). Nejspolehlivěji v aplikaci nainstalované na ploše.</p>
          </div>
        )}
        {permission === 'denied' && supported && (
          <div className="mt-4 rounded-[18px] bg-red-500/8 p-4 ring-1 ring-inset ring-red-500/20">
            <p className="text-[14px] font-bold">Jak upozornění znovu povolit</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-muted">
              <li>Klepněte na ikonu vlevo od adresy stránky (zámek nebo posuvníky).</li>
              <li>Otevřete <strong>Oprávnění</strong> nebo <strong>Nastavení webu</strong>.</li>
              <li>U položky <strong>Oznámení</strong> zvolte <strong>Povolit</strong> a stránku obnovte.</li>
            </ol>
          </div>
        )}
        {iosBrowser && (
          <div className="mt-4 rounded-[18px] bg-surface-2 p-4 ring-1 ring-inset ring-line">
            <p className="flex items-center gap-2 text-[14px] font-bold">
              <Glyph name="phone" size={18} className="text-accent" /> Na iPhonu a iPadu
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-muted">
              <li>
                V Safari klepněte na <strong>Sdílet</strong> a zvolte <strong>Přidat na plochu</strong>.
              </li>
              <li>Otevřete Stihnuto z ikony na ploše.</li>
              <li>Vraťte se sem (Nastavení → Upozornění) a zapněte, co chcete.</li>
            </ol>
          </div>
        )}
      </Card>

      <Card eyebrow="Vždy zapnuté" title={<>V aplikaci</>}>
        <ul className="space-y-2.5 text-[14px] leading-relaxed text-muted">
          <li className="flex gap-3">
            <Glyph name="calendar" size={20} className="mt-0.5 text-accent" />
            <span>Termíny na dnešek a zítra jsou výrazně nahoře na hlavní stránce, po termínu červeně.</span>
          </li>
          <li className="flex gap-3">
            <Glyph name="bell" size={20} className="mt-0.5 text-accent" />
            <span>Zvonek v horní liště ukazuje vše, co hoří teď a dnes – odchod, termíny, propojení.</span>
          </li>
          <li className="flex gap-3">
            <Glyph name="tram" size={20} className="mt-0.5 text-accent" />
            <span>3 hodiny před výukou se nahoře objeví spoj s odpočtem do odchodu.</span>
          </li>
        </ul>
      </Card>

      <Card eyebrow="Google Kalendář a soubory .ics" title={<>Připomínky <em className="italic text-moss">v kalendáři</em></>}>
        <p className="text-[13.5px] leading-relaxed text-muted">Použijí se, když termín přidáte do kalendáře ručně (tlačítkem Přidat do kalendáře nebo stažením .ics). Připomínky u synchronizace s Googlem nastavíte v Propojení → Google.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[10080, 2880, 1440, 180, 120, 60, 30].map((m) => {
            const active = settings.reminders.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => updateSettings({ reminders: active ? settings.reminders.filter((x) => x !== m) : [...settings.reminders, m].sort((a, b) => b - a) })}
                className={cn('rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ring-inset transition', active ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-muted ring-line-strong hover:text-fg')}
              >
                {formatReminder(m)}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
