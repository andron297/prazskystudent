/**
 * „Živá“ ikona: kolik minut zbývá do odchodu. Číslo se ukáže na ikoně
 * nainstalované aplikace (odznak – kde to systém umí), v ikoně záložky
 * prohlížeče i v jejím názvu. Skutečné widgety na plochu telefonu webová
 * aplikace mít nemůže; tohle je nejbližší, co prohlížeče dovolí.
 */
import { create } from 'zustand';
import { appNow } from '../store/clockStore';

interface LeaveState {
  leaveAt: string | null;
}

export const useLeaveStore = create<LeaveState>(() => ({ leaveAt: null }));

export function setNextLeave(leaveAt: string | null): void {
  if (useLeaveStore.getState().leaveAt !== leaveAt) {
    useLeaveStore.setState({ leaveAt });
    update();
  }
}

const ORIGINAL_ICON = '/favicon.svg';
let baseTitle = '';
let lastKey = '';

function iconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]');
}

function drawIcon(minutes: number): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return ORIGINAL_ICON;
  const urgent = minutes <= 5;
  const soon = minutes <= 15;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, urgent ? '#d0532f' : soon ? '#c08a3e' : '#3f7a55');
  g.addColorStop(1, urgent ? '#8f2d17' : soon ? '#7a5221' : '#1b3626');
  ctx.fillStyle = g;
  const r = 18;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f7f4ec';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = minutes > 99 ? '99+' : String(minutes);
  ctx.font = `800 ${text.length >= 3 ? 24 : text.length === 2 ? 34 : 40}px system-ui, sans-serif`;
  ctx.fillText(text, size / 2, size / 2 + 2);
  return canvas.toDataURL('image/png');
}

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

function update(): void {
  if (typeof document === 'undefined') return;
  const { leaveAt } = useLeaveStore.getState();
  const minutes = leaveAt ? Math.ceil((new Date(leaveAt).getTime() - appNow().getTime()) / 60_000) : null;
  const show = minutes !== null && minutes > 0 && minutes <= 180;
  const key = show ? String(minutes) : 'off';
  if (key === lastKey) return;
  lastKey = key;
  if (!baseTitle) baseTitle = document.title.replace(/^\d+ min do odchodu · /, '');
  const nav = navigator as BadgeNavigator;
  const link = iconLink();
  if (show) {
    if (link) link.href = drawIcon(minutes!);
    document.title = `${minutes} min do odchodu · ${baseTitle}`;
    void nav.setAppBadge?.(Math.min(minutes!, 99)).catch(() => undefined);
  } else {
    if (link) link.href = ORIGINAL_ICON;
    document.title = baseTitle;
    void nav.clearAppBadge?.().catch(() => undefined);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startLeaveBadge(): () => void {
  if (timer) return () => undefined;
  update();
  timer = setInterval(update, 15_000);
  const onVisible = () => update();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisible);
  };
}
