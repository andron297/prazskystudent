/**
 * Centrum upozornění: zvonek v hlavičce s počtem věcí „teď a dnes“ a panel
 * s tím, co přesně je potřeba udělat – s tlačítkem, které to rovnou udělá
 * (Hotovo, Trasa, Potvrdit…), a s možností odložit. Dole nastavení
 * upozornění v telefonu (kdy vyrazit, termíny).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlarmClock, Bell, BellRing, CalendarClock, Check, CircleAlert, Clock3, Flag, Hourglass, Link2, ListTodo, RefreshCw, Route, Sparkles, X, type LucideIcon } from 'lucide-react';
import { attentionCount, buildAttention, isSnoozed, type AttentionItem, type AttentionKind, type AttentionLevel } from '../../lib/attention';
import { formatRelative } from '../../lib/dates';
import { useConnections } from '../../hooks/useConnections';
import { useNow } from '../../hooks/useNow';
import { usePlanData } from '../../hooks/usePlanData';
import { forceSync, useAccount } from '../../services/account';
import { useLeaveStore } from '../../services/leaveBadge';
import { connectGoogle } from '../../services/syncCenter';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { buildingForEvent, isTransitTarget, upcomingEvents } from '../../store/selectors';
import { toast, useUiStore } from '../../store/uiStore';
import { Toggle, cn } from '../ui/primitives';

const NO_COUNTDOWNS: never[] = [];
const NO_SNOOZE: Record<string, string> = {};

/** Seznam věcí k vyřízení z celé aplikace (přepočítává se každou minutu). */
export function useAttention(): { items: AttentionItem[]; count: number; snoozed: Record<string, string>; now: Date } {
  const now = useNow(60_000);
  const { events, tasks, requirements, milestones } = usePlanData();
  const subjects = useAppStore((s) => s.subjects);
  const countdowns = useAppStore((s) => s.settings.countdowns ?? NO_COUNTDOWNS);
  const profile = useAppStore((s) => s.settings.studyProfile);
  const allMilestones = useAppStore((s) => s.milestones);
  const settings = useAppStore((s) => s.settings);
  const snoozed = useAppStore((s) => s.meta.snoozed ?? NO_SNOOZE);
  const leaveAt = useLeaveStore((s) => s.leaveAt);
  const syncError = useAccount((s) => s.syncError);
  const accountStatus = useAccount((s) => s.status);
  const { services } = useConnections();

  const items = useMemo(() => {
    const target = upcomingEvents(events.filter(isTransitTarget), now).next;
    const leave =
      leaveAt && target
        ? {
            at: new Date(leaveAt),
            title: subjects.find((x) => x.id === target.subjectId)?.name ?? target.title,
            start: new Date(target.start),
            place: buildingForEvent(target, settings).building?.name,
          }
        : null;
    return buildAttention({
      now,
      requirements,
      tasks,
      subjects,
      milestones,
      countdowns,
      leave,
      connections: services,
      syncError: accountStatus === 'ready' ? syncError : null,
      needsProfile: !profile && allMilestones.some((m) => m.source !== 'demo'),
    });
  }, [now, events, requirements, tasks, subjects, milestones, countdowns, leaveAt, settings, services, syncError, accountStatus, profile, allMilestones]);

  return { items, count: attentionCount(items, snoozed, now), snoozed, now };
}

const KIND_ICON: Record<AttentionKind, LucideIcon> = {
  leave: Route,
  overdue: CircleAlert,
  deadline: CalendarClock,
  task: ListTodo,
  connection: Link2,
  sync: RefreshCw,
  milestone: Flag,
  countdown: Hourglass,
  profile: Sparkles,
};

const LEVEL_LABEL: Record<AttentionLevel, string> = { now: 'Teď', today: 'Dnes', soon: 'Tento týden', info: 'Pro informaci' };

const LEVEL_TONE: Record<AttentionLevel, string> = {
  now: 'bg-[color-mix(in_oklab,var(--clay)_16%,transparent)] text-clay',
  today: 'bg-accent-soft text-accent',
  soon: 'bg-surface-2 text-muted',
  info: 'bg-surface-2 text-muted',
};

export function AlertsButton() {
  const { count, items } = useAttention();
  const open = useUiStore((s) => s.alertsOpen);
  const urgent = items.some((i) => i.level === 'now');
  return (
    <button
      type="button"
      onClick={() => useUiStore.setState({ alertsOpen: !open })}
      className={cn('relative inline-flex size-8 items-center justify-center rounded-full transition hover:bg-surface-2 hover:text-fg', open ? 'bg-surface-2 text-fg' : 'text-muted')}
      aria-label={count ? `Upozornění: ${count} ${count === 1 ? 'věc' : count < 5 ? 'věci' : 'věcí'} k vyřízení` : 'Upozornění'}
      aria-expanded={open}
      data-tour="alerts"
    >
      {count ? <BellRing className={cn('size-[18px]', urgent && 'text-clay')} aria-hidden /> : <Bell className="size-[18px]" aria-hidden />}
      {count > 0 && (
        <motion.span key={count} initial={{ scale: 0.4 }} animate={{ scale: 1 }} className={cn('absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-black tabular text-white ring-2 ring-[var(--surface)]', urgent ? 'bg-clay' : 'bg-accent')}>
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
    </button>
  );
}

function runAction(item: AttentionItem) {
  const a = item.action;
  if (!a) return;
  const store = useAppStore.getState();
  if (a.href) {
    window.location.hash = a.href;
    useUiStore.setState({ alertsOpen: false });
    return;
  }
  switch (a.run) {
    case 'complete-requirement':
      if (a.targetId) {
        const r = store.requirements.find((x) => x.id === a.targetId);
        if (r && !r.done) store.toggleRequirementDone(r.id);
        toast.success('Hotovo. Dobrá práce.');
      }
      break;
    case 'complete-task':
      if (a.targetId) {
        const t = store.tasks.find((x) => x.id === a.targetId);
        if (t && !t.done) store.toggleTask(t.id);
        toast.success('Hotovo. Dobrá práce.');
      }
      break;
    case 'reconnect-google':
      void connectGoogle({ reconnect: true });
      break;
    case 'retry-sync':
      void forceSync();
      break;
    case 'ask-profile':
      useUiStore.setState({ askStudyProfile: true, alertsOpen: false });
      break;
  }
}

function AlertRow({ item, now }: { item: AttentionItem; now: Date }) {
  const Icon = KIND_ICON[item.kind];
  const snooze = () => {
    useAppStore.getState().snoozeAlert(item.id, new Date(Date.now() + 3 * 3_600_000).toISOString());
    toast.info('Připomenu za 3 hodiny.');
  };
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className="group flex gap-3 rounded-[18px] px-2.5 py-2.5 hover:bg-surface-2/70">
      <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl', LEVEL_TONE[item.level])}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold leading-snug">{item.title}</p>
        {item.detail && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{item.detail}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.action && (
            <button type="button" onClick={() => runAction(item)} className={cn('inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-bold transition', item.level === 'now' ? 'bg-accent text-accent-fg hover:brightness-110' : 'bg-surface ring-1 ring-inset ring-line-strong hover:bg-surface-2')}>
              {item.action.run?.startsWith('complete') && <Check className="size-3.5" aria-hidden />}
              {item.action.label}
            </button>
          )}
          {item.level !== 'info' && (
            <button type="button" onClick={snooze} className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-subtle hover:bg-surface-2 hover:text-fg" title="Připomenout za 3 hodiny">
              <Clock3 className="size-3.5" aria-hidden /> Později
            </button>
          )}
          {item.at && item.kind !== 'leave' && <span className="ml-auto text-[11.5px] font-semibold tabular text-subtle">{formatRelative(new Date(item.at), now)}</span>}
        </div>
      </div>
    </motion.li>
  );
}

function NotifySettings() {
  const notifyLeave = useAppStore((s) => s.settings.notifyLeave ?? false);
  const notifyDeadlines = useAppStore((s) => s.settings.notifyDeadlines ?? false);
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const permission = supported ? Notification.permission : 'denied';
  const enable = async (patch: { notifyLeave?: boolean; notifyDeadlines?: boolean }) => {
    const turningOn = Object.values(patch).some(Boolean);
    if (turningOn && supported && Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        toast.error('Bez povolení upozornění v prohlížeči to nepůjde.');
        return;
      }
    }
    useAppStore.getState().updateSettings(patch);
  };
  if (!supported) return <p className="text-[12.5px] text-subtle">Tento prohlížeč upozornění neumí – všechno ale uvidíte tady.</p>;
  return (
    <div className="space-y-2">
      <Toggle checked={notifyLeave && permission === 'granted'} onChange={(v) => void enable({ notifyLeave: v })} label="Kdy vyrazit" description="5 minut před odchodem a ve chvíli odchodu." />
      <Toggle checked={notifyDeadlines && permission === 'granted'} onChange={(v) => void enable({ notifyDeadlines: v })} label="Termíny" description="Večer předem a 3 hodiny před termínem." />
      {permission === 'denied' && <p className="text-[12px] text-red-700 dark:text-red-300">Upozornění jsou v prohlížeči zakázaná – povolte je v nastavení webu.</p>}
      <p className="text-[11.5px] leading-relaxed text-subtle">Upozornění chodí, dokud je Stihnu otevřené (i na pozadí). Nainstalovaná aplikace na ploše je nejspolehlivější.</p>
    </div>
  );
}

export function AlertsPanel() {
  const open = useUiStore((s) => s.alertsOpen);
  const { items, snoozed, now } = useAttention();
  const panelRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  const visible = items.filter((i) => !isSnoozed(i.id, snoozed, now));
  const hiddenCount = items.length - visible.length;
  const groups = (['now', 'today', 'soon', 'info'] as AttentionLevel[]).map((level) => ({ level, list: visible.filter((i) => i.level === level) })).filter((g) => g.list.length > 0);
  const close = () => useUiStore.setState({ alertsOpen: false });

  useEffect(() => {
    if (!open) return;
    // Panel pod hlavičku (ta je s pruhem ukázky vyšší).
    const header = document.querySelector('header');
    setTop(header ? Math.round(header.getBoundingClientRect().bottom) + 8 : null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    setTimeout(() => panelRef.current?.focus(), 30);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className="fixed inset-0 z-[60] bg-[#0b110d]/25 lg:bg-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} aria-hidden />
          <motion.div
            key="panel"
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Co je potřeba udělat"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            style={top ? { top, maxHeight: `min(calc(100dvh - ${top + 16}px), 680px)` } : undefined}
            className="card fixed inset-x-2 top-[calc(env(safe-area-inset-top)+3.9rem)] z-[61] flex max-h-[min(78dvh,680px)] flex-col overflow-hidden rounded-[26px] shadow-[0_30px_70px_-30px_rgb(0_0_0/0.45)] outline-none sm:left-auto sm:right-4 sm:w-[420px]"
          >
            <header className="flex items-start gap-3 border-b border-line px-5 pb-3.5 pt-4">
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-subtle">Upozornění</p>
                <h2 className="mt-0.5 font-display text-[28px] leading-none">
                  Co je <em className="italic text-moss">potřeba</em>
                </h2>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  {visible.length === 0 ? 'Teď nic nehoří.' : `${groups.find((g) => g.level === 'now')?.list.length ?? 0} teď · ${groups.find((g) => g.level === 'today')?.list.length ?? 0} dnes · ${groups.find((g) => g.level === 'soon')?.list.length ?? 0} tento týden`}
                  {hiddenCount > 0 && ` · ${hiddenCount} odloženo`}
                </p>
              </div>
              <button type="button" onClick={close} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Zavřít upozornění">
                <X className="size-4" aria-hidden />
              </button>
            </header>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
                    <Check className="size-7" strokeWidth={2.6} aria-hidden />
                  </span>
                  <p className="mt-4 font-display text-[24px] leading-none">Všechno pod kontrolou</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">Žádný termín ani odchod teď nehoří. Až bude něco potřeba, objeví se to tady.</p>
                </div>
              ) : (
                groups.map((g) => (
                  <section key={g.level} className="mb-1.5">
                    <h3 className={cn('flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.12em]', g.level === 'now' ? 'text-clay' : 'text-subtle')}>
                      {g.level === 'now' && <AlarmClock className="size-3.5" aria-hidden />}
                      {LEVEL_LABEL[g.level]}
                    </h3>
                    <ul>
                      <AnimatePresence initial={false}>
                        {g.list.map((item) => (
                          <AlertRow key={item.id} item={item} now={now} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </section>
                ))
              )}
            </div>
            <details className="border-t border-line px-5 py-3">
              <summary className="cursor-pointer list-none text-[13px] font-bold text-muted hover:text-fg">Upozornění v telefonu a prohlížeči</summary>
              <div className="mt-3">
                <NotifySettings />
              </div>
            </details>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Systémová upozornění na termíny                                     */
/* ------------------------------------------------------------------ */

const SENT_KEY = 'stihnu:deadline-notified';

function loadSent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

async function showNotification(title: string, body: string, tag: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
    else new Notification(title, { body, tag });
  } catch {
    /* prohlížeč notifikaci odmítl */
  }
}

/** Večer předem (18:00) a 3 hodiny před termínem – každé jen jednou. */
export function useDeadlineReminders() {
  const enabled = useAppStore((s) => s.settings.notifyDeadlines ?? false);
  const mode = useAppStore((s) => s.settings.mode);
  useEffect(() => {
    if (!enabled || mode !== 'live' || typeof Notification === 'undefined') return;
    const check = () => {
      if (Notification.permission !== 'granted') return;
      const now = appNow();
      const t = now.getTime();
      const s = useAppStore.getState();
      const sent = loadSent();
      const due: { id: string; title: string; at: Date; subject?: string }[] = [
        ...s.requirements.filter((r) => r.deadline && !r.done && !r.demo).map((r) => ({ id: `req|${r.id}`, title: r.title, at: new Date(r.deadline!), subject: s.subjects.find((x) => x.id === r.subjectId)?.name })),
        ...s.tasks.filter((x) => x.due && !x.done && !x.demo).map((x) => ({ id: `task|${x.id}`, title: x.title, at: /^\d{4}-\d{2}-\d{2}$/.test(x.due!) ? new Date(`${x.due}T23:59:00`) : new Date(x.due!) })),
      ];
      for (const d of due) {
        const left = d.at.getTime() - t;
        const eve = new Date(d.at);
        eve.setDate(eve.getDate() - 1);
        eve.setHours(18, 0, 0, 0);
        const stages: [string, boolean, string][] = [
          ['eve', t >= eve.getTime() && t < eve.getTime() + 4 * 3_600_000 && left > 6 * 3_600_000, `Zítra: ${d.title}`],
          ['3h', left > 0 && left <= 3 * 3_600_000 && left > 2.5 * 3_600_000, `Za 3 hodiny: ${d.title}`],
        ];
        for (const [stage, hit, title] of stages) {
          const key = `${d.id}|${stage}|${d.at.toISOString()}`;
          if (!hit || sent[key]) continue;
          sent[key] = t;
          void showNotification(title, `${d.subject ? `${d.subject} · ` : ''}termín ${d.at.toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`, key);
        }
      }
      // Starší záznamy uklidit (měsíc).
      for (const [k, v] of Object.entries(sent)) if (t - v > 30 * 86_400_000) delete sent[k];
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify(sent));
      } catch {
        /* plné úložiště */
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [enabled, mode]);
}
