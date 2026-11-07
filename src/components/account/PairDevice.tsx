/**
 * Propojení zařízení přes QR:
 *  - PairDeviceDialog: počítač ukáže QR (platí 3 minuty) a živě sleduje,
 *    kdy se telefon připojil – pak ukáže které a že data proudí;
 *  - PairClaimView: stránka #/pripojit/… na telefonu – přihlásí a odemkne;
 *  - ScanPairButton: čtečka QR přímo v aplikaci (pro nainstalovanou aplikaci).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import qrcode from 'qrcode-generator';
import { Check, CloudDownload, KeyRound, LoaderCircle, LogIn, RefreshCw, ScanLine, ShieldCheck, Smartphone } from 'lucide-react';
import { navigateTo } from '../../hooks/useAppShell';
import { cancelPairing, claimPairing, createPairing, pairingStatus, parsePairingCode, type PairingCode, type PairingTicket } from '../../services/pairing';
import { signOutAccount, useAccount } from '../../services/account';
import { useAppStore } from '../../store/appStore';
import { confirmAction, toast } from '../../store/uiStore';
import { Modal } from '../ui/overlays';
import { Button, cn } from '../ui/primitives';
import { BrandMark } from '../layout/AppShell';
import { QrScanner } from './QrScanner';

/* ------------------------------------------------------------------ */
/* QR kód (vykreslený jako SVG, s logem uprostřed)                     */
/* ------------------------------------------------------------------ */

function QrCode({ text, className }: { text: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const q = qrcode(0, 'Q');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const hole = Math.ceil(n * 0.22);
    const from = Math.floor((n - hole) / 2);
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const inHole = r >= from && r < from + hole && c >= from && c < from + hole;
        if (q.isDark(r, c) && !inHole) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { path: d, size: n };
  }, [text]);
  const hole = Math.ceil(size * 0.22);
  return (
    <div className={cn('relative', className)}>
      <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className="size-full" role="img" aria-label="QR kód pro propojení telefonu" shapeRendering="crispEdges">
        <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#fff" />
        <path d={path} fill="#14261b" />
      </svg>
      <span className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[22%] bg-white p-[3%]" style={{ width: `${(hole / (size + 4)) * 100}%`, height: `${(hole / (size + 4)) * 100}%` }}>
        <BrandMark className="size-full" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Počítač: dialog s QR kódem                                          */
/* ------------------------------------------------------------------ */

type Phase = { kind: 'loading' } | { kind: 'waiting'; ticket: PairingTicket } | { kind: 'claimed'; device: string } | { kind: 'expired' } | { kind: 'error'; message: string };

export function PairDeviceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const pendingRef = useRef(false);

  const start = async () => {
    setPhase({ kind: 'loading' });
    try {
      const ticket = await createPairing();
      pendingRef.current = true;
      setPhase({ kind: 'waiting', ticket });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'QR kód se nepodařilo vytvořit.' });
    }
  };

  useEffect(() => {
    if (open) void start();
    else if (pendingRef.current) {
      pendingRef.current = false;
      void cancelPairing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Odpočet a sledování stavu
  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    let alive = true;
    const poll = async () => {
      while (alive) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!alive) return;
        try {
          const s = await pairingStatus(phase.ticket.pairId);
          if (!alive) return;
          if (s.status === 'claimed') {
            pendingRef.current = false;
            setPhase({ kind: 'claimed', device: s.device ?? 'Nové zařízení' });
            toast.success(`Připojeno: ${s.device ?? 'nové zařízení'}`);
            return;
          }
          if (s.status === 'expired' || s.status === 'gone' || Date.now() > phase.ticket.expiresAt) {
            pendingRef.current = false;
            setPhase({ kind: 'expired' });
            return;
          }
        } catch {
          /* krátký výpadek – zkusit znovu */
        }
      }
    };
    void poll();
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, [phase]);

  const left = phase.kind === 'waiting' ? Math.max(0, Math.round((phase.ticket.expiresAt - now) / 1000)) : 0;
  const total = 180;

  return (
    <Modal open={open} onClose={onClose} title="Propojit telefon" description="Telefon se přihlásí a odemkne sám – bez hesla a bez záchranného kódu." icon={Smartphone}>
      <div className="px-5 py-5">
        <AnimatePresence mode="wait">
          {phase.kind === 'claimed' ? (
            <motion.div key="ok" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-4 text-center">
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} className="grid size-20 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_18px_40px_-12px_var(--accent)]">
                <Check className="size-10" strokeWidth={3} aria-hidden />
              </motion.span>
              <p className="mt-5 font-display text-[32px] leading-none">Připojeno</p>
              <p className="mt-2 text-[15px] font-semibold">{phase.device}</p>
              <p className="mt-1 max-w-xs text-[13.5px] leading-relaxed text-muted">Telefon je přihlášený a stahuje vaše data. Od teď se vše synchronizuje automaticky.</p>
              <div className="mt-4 flex items-center gap-2 rounded-full bg-accent-soft px-3.5 py-1.5 text-[12.5px] font-bold text-accent">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-accent" />
                </span>
                Data proudí mezi zařízeními
              </div>
              <Button className="mt-6" variant="primary" onClick={onClose}>
                Hotovo
              </Button>
              <button
                type="button"
                onClick={async () => {
                  if (await confirmAction({ title: 'Odhlásit všechna zařízení?', message: 'Pokud se připojilo zařízení, které neznáte, odhlásím účet všude (i tady). Pak se znovu přihlaste.', confirmLabel: 'Odhlásit všude', tone: 'danger' })) {
                    onClose();
                    await signOutAccount(true);
                  }
                }}
                className="mt-3 text-[12.5px] font-semibold text-subtle underline-offset-2 hover:text-fg hover:underline"
              >
                Tohle nebylo moje zařízení
              </button>
            </motion.div>
          ) : phase.kind === 'waiting' ? (
            <motion.div key="qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-5 sm:grid-cols-[220px_1fr] sm:items-center">
              <div className="mx-auto w-[220px]">
                <div className="rounded-[24px] bg-white p-3 shadow-[0_20px_40px_-24px_rgb(0_0_0/0.45)] ring-1 ring-black/5">
                  <QrCode text={phase.ticket.url} className="aspect-square w-full" />
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(left / total) * 100}%` }} transition={{ ease: 'linear', duration: 1 }} />
                </div>
                <p className="mt-1.5 text-center text-[12px] font-semibold tabular text-muted">
                  Platí ještě {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                </p>
              </div>
              <div>
                <ol className="space-y-3 text-[14px] leading-relaxed">
                  <li className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-black text-accent">1</span>
                    <span>V telefonu otevřete <strong>Fotoaparát</strong> a namiřte ho na kód.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-black text-accent">2</span>
                    <span>Klepněte na odkaz – Stihnuto se otevře a samo se přihlásí.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-black text-accent">3</span>
                    <span>
                      Máte Stihnuto v telefonu jako aplikaci? Otevřete ji a zvolte <strong>Naskenovat kód z počítače</strong>.
                    </span>
                  </li>
                </ol>
                <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-muted">
                  <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden /> Čekám na telefon…
                </p>
                <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-subtle">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Kód platí 3 minuty a jen jednou. Klíč k vašim datům je jen v kódu – server ho nevidí. Kód nikomu neukazujte.
                </p>
              </div>
            </motion.div>
          ) : phase.kind === 'expired' ? (
            <motion.div key="exp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center">
              <p className="font-display text-[28px] leading-none">Kód vypršel</p>
              <p className="mt-2 text-[14px] text-muted">Z bezpečnostních důvodů platí jen 3 minuty.</p>
              <Button className="mt-5" variant="primary" icon={RefreshCw} onClick={() => void start()}>
                Nový kód
              </Button>
            </motion.div>
          ) : phase.kind === 'error' ? (
            <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center">
              <p className="text-[14.5px] font-semibold text-red-700 dark:text-red-300">{phase.message}</p>
              <Button className="mt-5" icon={RefreshCw} onClick={() => void start()}>
                Zkusit znovu
              </Button>
            </motion.div>
          ) : (
            <div key="load" className="grid h-56 place-items-center">
              <LoaderCircle className="size-7 animate-spin text-accent" aria-hidden />
            </div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Telefon: čtečka v aplikaci                                          */
/* ------------------------------------------------------------------ */

export function ScanPairButton({ className, label = 'Naskenovat kód z počítače' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface-2 px-4 text-[14px] font-bold ring-1 ring-inset ring-line transition hover:bg-line', className)}>
        <ScanLine className="size-4" aria-hidden /> {label}
      </button>
      <AnimatePresence>
        {open && (
          <QrScanner
            title="Naskenujte kód z počítače"
            hint="Na počítači otevřete Účet → Propojit telefon."
            onClose={() => setOpen(false)}
            onResult={(text) => {
              const code = parsePairingCode(text);
              if (!code) return false;
              setOpen(false);
              window.location.hash = `#/pripojit/${code.userId}.${code.pairId}.${code.key}`;
              return true;
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Telefon: stránka #/pripojit/…                                        */
/* ------------------------------------------------------------------ */

const STEPS = [
  { icon: KeyRound, label: 'Ověřuji kód' },
  { icon: LogIn, label: 'Přihlašuji' },
  { icon: ShieldCheck, label: 'Odemykám data' },
  { icon: CloudDownload, label: 'Stahuji vaše data' },
];

export function PairClaimView({ param }: { param?: string }) {
  const status = useAccount((s) => s.status);
  const user = useAccount((s) => s.user);
  const lastSyncAt = useAccount((s) => s.lastSyncAt);
  // Kód si přečíst jednou a hned ho smazat z adresy (zůstane jen v paměti).
  const [code] = useState<PairingCode | null>(() => (param ? parsePairingCode(`pripojit/${param}`) : null));
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (param) window.history.replaceState(null, '', `${window.location.pathname}#/pripojit`);
  }, [param]);

  useEffect(() => {
    if (!code || started.current || status === 'loading') return;
    if (status === 'off') {
      setState('error');
      setError('Účty teď na serveru nejsou zapnuté.');
      return;
    }
    started.current = true;
    const run = async () => {
      if (user && user.id !== code.userId) {
        const ok = await confirmAction({ title: 'Přepnout účet?', message: `Na tomto zařízení je přihlášený jiný účet (${user.email}). Odhlásit ho a propojit zařízení s účtem z počítače?`, confirmLabel: 'Přepnout' });
        if (!ok) {
          navigateTo('dnes');
          return;
        }
      }
      setState('working');
      setStep(0);
      const timers = [setTimeout(() => setStep(1), 700), setTimeout(() => setStep(2), 1500)];
      try {
        await claimPairing(code);
        timers.forEach(clearTimeout);
        setStep(3);
      } catch (e) {
        timers.forEach(clearTimeout);
        setState('error');
        setError(e instanceof Error ? e.message : 'Propojení se nepodařilo.');
      }
    };
    void run();
  }, [code, status, user]);

  // Hotovo, jakmile je účet odemčený a data stažená
  useEffect(() => {
    if (state === 'working' && step === 3 && status === 'ready' && lastSyncAt) {
      // Zařízení převzalo hotový účet – průvodce prvním nastavením už nepotřebuje.
      useAppStore.getState().setSetup({ done: true });
      const t = setTimeout(() => setState('done'), 500);
      return () => clearTimeout(t);
    }
  }, [state, step, status, lastSyncAt]);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-2 text-center">
      <BrandMark className="size-14" />
      {!code ? (
        <>
          <h1 className="mt-5 font-display text-[38px] leading-none">Propojit s počítačem</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">Na počítači otevřete Účet → Propojit telefon a naskenujte zobrazený QR kód.</p>
          <ScanPairButton className="mt-6 bg-accent text-accent-fg ring-0 hover:bg-accent hover:brightness-110" />
        </>
      ) : state === 'done' ? (
        <>
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} className="mt-6 grid size-20 place-items-center rounded-full bg-accent text-accent-fg">
            <Check className="size-10" strokeWidth={3} aria-hidden />
          </motion.span>
          <h1 className="mt-5 font-display text-[38px] leading-none">Propojeno</h1>
          <p className="mt-2 text-[14.5px] text-muted">Přihlášeno jako {user?.email}. Vaše data jsou tady a dál se synchronizují sama.</p>
          <Button className="mt-6" variant="primary" onClick={() => navigateTo('dnes')}>
            Pokračovat
          </Button>
        </>
      ) : state === 'error' ? (
        <>
          <h1 className="mt-5 font-display text-[34px] leading-none">Nepovedlo se</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{error}</p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <ScanPairButton label="Naskenovat nový kód" />
            <a href="#/ucet" className="text-[13.5px] font-semibold text-accent hover:underline">
              Přihlásit se jinak
            </a>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-5 font-display text-[34px] leading-none">Propojuji zařízení…</h1>
          <ul className="mt-6 w-full max-w-xs space-y-2.5 text-left">
            {STEPS.map((s, i) => {
              const done = i < step || (i === step && state === 'working' && i === 3 && status === 'ready' && Boolean(lastSyncAt));
              const active = i === step && !done;
              const Icon = s.icon;
              return (
                <li key={s.label} className={cn('flex items-center gap-3 rounded-[16px] px-3.5 py-2.5 ring-1 ring-inset transition', active ? 'bg-accent-soft ring-accent/30' : 'bg-surface ring-line', !done && !active && 'opacity-50')}>
                  <span className={cn('grid size-8 place-items-center rounded-full', done ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}>{done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : active ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}</span>
                  <span className="text-[14px] font-semibold">{s.label}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {code && state !== 'done' && (
        <p className="mt-8 flex items-start gap-2 text-left text-[12px] leading-relaxed text-subtle">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Klíč k vašim datům je jen v QR kódu – server ho nevidí.
        </p>
      )}
    </div>
  );
}
