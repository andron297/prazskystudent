/**
 * Obrazovky účtu: přihlášení / registrace, odemknutí na novém zařízení,
 * záchranný kód a nové heslo. Velké písmo, jasné kroky, žádné zkratky.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Copy, Download, Eye, EyeOff, FlaskConical, KeyRound, LoaderCircle, Lock, Mail, Printer, ShieldCheck, Smartphone } from 'lucide-react';
import { ScanPairButton } from './PairDevice';
import { navigateTo } from '../../hooks/useAppShell';
import { normalizeRecoveryCode, passwordLeaked } from '../../lib/vaultCrypto';
import {
  acknowledgeRecovery,
  renderGoogleButton,
  sendPasswordReset,
  setNewPassword,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  unlockWithRecoveryCode,
  useAccount,
  type AccountStatus,
} from '../../services/account';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { BrandMark } from '../layout/AppShell';
import { cn } from '../ui/primitives';

function Frame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-4 py-10">
      <img src="/images/forest-1200.webp" alt="" className="absolute inset-0 -z-0 size-full animate-drift object-cover opacity-25 dark:opacity-15" />
      <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/80 to-canvas" />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className={cn('card relative w-full rounded-[32px] p-6 shadow-2xl sm:p-9', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-6 flex items-center gap-2.5">
          <BrandMark className="size-10" />
          <span className="font-display wordmark text-[28px] leading-none">
            Stihnu<em className="text-moss">to</em>
          </span>
        </div>
        {children}
      </motion.main>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14.5px] font-bold">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

const inputClass = 'h-13 w-full rounded-[16px] bg-surface px-4 text-[16px] ring-1 ring-inset ring-line-strong outline-none transition focus:ring-2 focus:ring-accent';

function PrimaryButton({ children, busy, type = 'submit', onClick, disabled }: { children: ReactNode; busy?: boolean; type?: 'submit' | 'button'; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-[18px] bg-accent px-5 text-[16px] font-bold text-accent-fg shadow-[0_12px_28px_-14px_var(--accent)] transition hover:brightness-110 disabled:opacity-60"
    >
      {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function Trust() {
  return (
    <ul className="mt-6 space-y-2 border-t border-line pt-5 text-[13.5px] text-muted">
      <li className="flex gap-2">
        <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> Data se šifrují přímo ve vašem zařízení. Nepřečte je nikdo jiný – ani správce aplikace.
      </li>
      <li className="flex gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> Účet i všechna data smažete kdykoli jedním tlačítkem.
      </li>
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Přihlášení / registrace                                             */
/* ------------------------------------------------------------------ */

type Tab = 'login' | 'register' | 'forgot';

export function SignInScreen() {
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has('confirmed') ? 'login' : 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const googleRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(true);
  const syncError = useAccount((s) => s.syncError);

  useEffect(() => {
    if (!googleRef.current) return;
    void renderGoogleButton(googleRef.current, (text) => setMessage({ tone: 'error', text })).then(setGoogleReady);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (tab === 'forgot') {
      setBusy(true);
      try {
        await sendPasswordReset(email);
        setMessage({ tone: 'ok', text: 'Pokud k tomuto e-mailu existuje účet, poslali jsme na něj odkaz pro nové heslo.' });
      } catch (error) {
        setMessage({ tone: 'error', text: (error as Error).message });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (tab === 'register') {
      if (password.length < 10) {
        setMessage({ tone: 'error', text: 'Heslo musí mít aspoň 10 znaků. Nejlepší je pár slov za sebou, třeba „modrá tramvaj jede k řece“.' });
        return;
      }
      if (!consent) {
        setMessage({ tone: 'error', text: 'Pro vytvoření účtu potvrďte souhlas s podmínkami.' });
        return;
      }
      setBusy(true);
      if (await passwordLeaked(password)) {
        setBusy(false);
        setMessage({ tone: 'error', text: 'Tohle heslo se objevilo v únicích dat z jiných služeb. Zvolte prosím jiné.' });
        return;
      }
    }
    setBusy(true);
    try {
      if (tab === 'register') {
        const result = await signUpWithEmail(email, password);
        if (result === 'confirm') {
          setMessage({ tone: 'ok', text: 'Hotovo! Poslali jsme vám e-mail s odkazem. Klikněte na něj a pak se tady přihlaste.' });
          setTab('login');
        }
      } else {
        await signInWithEmail(email, password);
      }
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <h1 className="font-display text-[34px] leading-[1.05]">{tab === 'register' ? <>Vytvořte si <em className="text-moss">účet</em></> : tab === 'forgot' ? <>Nové <em className="text-moss">heslo</em></> : <>Vítejte <em className="text-moss">zpět</em></>}</h1>
      <p className="mt-2 text-[15px] text-muted">{tab === 'forgot' ? 'Pošleme vám odkaz, přes který si nastavíte nové heslo.' : 'S účtem máte rozvrh, úkoly i propojení na všech svých zařízeních.'}</p>

      {tab !== 'forgot' && (
        <>
          <div className="mt-6 flex min-h-11 justify-center" ref={googleRef} aria-label="Pokračovat přes Google" />
          {!googleReady && <p className="mt-2 text-center text-[13px] text-muted">Přihlášení přes Google zatím není zapnuté – použijte e-mail.</p>}
          <div className="my-5 flex items-center gap-3 text-[13px] font-semibold text-subtle">
            <span className="h-px flex-1 bg-line" /> nebo e-mailem <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Field label="E-mail">
          <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="jmeno@email.cz" />
        </Field>
        {tab !== 'forgot' && (
          <Field label="Heslo" hint={tab === 'register' ? 'Aspoň 10 znaků. Heslo se nikam neposílá – slouží i jako klíč k vašim datům.' : undefined}>
            <div className="relative">
              <input type={show ? 'text' : 'password'} autoComplete={tab === 'register' ? 'new-password' : 'current-password'} required value={password} onChange={(e) => setPassword(e.target.value)} className={cn(inputClass, 'pr-12')} />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-fg" aria-label={show ? 'Skrýt heslo' : 'Zobrazit heslo'}>
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </Field>
        )}
        {tab === 'register' && (
          <label className="flex items-start gap-3 text-[14px] leading-snug">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" />
            <span>
              Je mi aspoň 15 let a souhlasím s{' '}
              <a href="#/podminky" target="_blank" className="font-semibold text-accent underline-offset-2 hover:underline">
                podmínkami použití
              </a>
              . Beru na vědomí{' '}
              <a href="#/soukromi" target="_blank" className="font-semibold text-accent underline-offset-2 hover:underline">
                zásady ochrany osobních údajů
              </a>
              .
            </span>
          </label>
        )}
        {(message || syncError) && (
          <p role="status" className={cn('rounded-[16px] p-3.5 text-[14px] font-semibold', (message?.tone ?? 'error') === 'ok' ? 'bg-accent-soft text-accent' : 'bg-red-500/10 text-red-700 dark:text-red-300')}>
            {message?.text ?? syncError}
          </p>
        )}
        <PrimaryButton busy={busy}>
          {tab === 'register' ? 'Vytvořit účet' : tab === 'forgot' ? 'Poslat odkaz' : 'Přihlásit se'} {!busy && <ArrowRight className="size-5" aria-hidden />}
        </PrimaryButton>
      </form>

      <div className="mt-4 flex flex-wrap justify-between gap-2 text-[14px]">
        {tab === 'login' ? (
          <>
            <button type="button" onClick={() => setTab('register')} className="font-semibold text-accent hover:underline">
              Ještě nemám účet
            </button>
            <button type="button" onClick={() => setTab('forgot')} className="font-semibold text-muted hover:text-fg">
              Zapomenuté heslo
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setTab('login')} className="font-semibold text-accent hover:underline">
            Už mám účet – přihlásit se
          </button>
        )}
      </div>

      {tab === 'login' && (
        <div className="mt-6 rounded-[20px] bg-surface-2/80 p-4 text-[14px]">
          <p className="flex items-center gap-2 font-bold">
            <Smartphone className="size-4.5 text-accent" aria-hidden /> Už máte Stihnuto na počítači?
          </p>
          <p className="mt-1 text-muted">Tam otevřete Účet → Propojit telefon a kód naskenujte. Přihlásí se a odemkne samo.</p>
          <ScanPairButton className="mt-3 w-full bg-surface" />
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          useAppStore.getState().startDemo();
          navigateTo('dnes');
        }}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-surface-2 px-4 py-3 text-[14.5px] font-semibold text-muted transition hover:text-fg"
      >
        <FlaskConical className="size-4 text-clay" aria-hidden /> Jen se podívat na ukázku (bez účtu)
      </button>
      <Trust />
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Záchranný kód                                                       */
/* ------------------------------------------------------------------ */

export function RecoveryCodeCard({ code, onDone, doneLabel = 'Kód mám uložený – pokračovat' }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const email = useAccount((s) => s.user?.email ?? '');
  const text = `Stihnuto – záchranný kód k účtu ${email}\n\n${code}\n\nKód odemkne vaše data na novém zařízení. Nikomu ho nedávejte.`;
  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stihnu-zachranny-kod.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const print = () => {
    const w = window.open('', '_blank', 'noopener,width=520,height=420');
    if (!w) return;
    w.document.title = 'Stihnuto – záchranný kód';
    const pre = w.document.createElement('pre');
    pre.style.cssText = 'font:18px/1.6 monospace;padding:24px;white-space:pre-wrap';
    pre.textContent = text;
    w.document.body.appendChild(pre);
    w.print();
  };
  return (
    <div>
      <div className="rounded-[22px] bg-forest p-5 text-center text-white">
        <p className="eyebrow text-white/70">Váš záchranný kód</p>
        <p className="mt-2 select-all break-all font-mono text-[22px] font-bold tracking-wider sm:text-[26px]">{code}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => void navigator.clipboard?.writeText(code).then(() => toast.success('Kód zkopírovaný.'))} className="inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[16px] bg-surface-2 text-[13px] font-semibold hover:bg-line">
          <Copy className="size-4.5" aria-hidden /> Zkopírovat
        </button>
        <button type="button" onClick={download} className="inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[16px] bg-surface-2 text-[13px] font-semibold hover:bg-line">
          <Download className="size-4.5" aria-hidden /> Stáhnout
        </button>
        <button type="button" onClick={print} className="inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[16px] bg-surface-2 text-[13px] font-semibold hover:bg-line">
          <Printer className="size-4.5" aria-hidden /> Vytisknout
        </button>
      </div>
      <ul className="mt-4 space-y-1.5 text-[14px] text-muted">
        <li>• Uložte si ho do správce hesel, vytiskněte nebo vyfoťte a schovejte.</li>
        <li>• Potřebujete ho jen na novém zařízení{useAccount.getState().user?.provider === 'email' ? ' nebo když zapomenete heslo' : ''}.</li>
        <li>• Bez kódu nikdo – ani správce aplikace – vaše data neotevře. Proto je v bezpečí.</li>
      </ul>
      <label className="mt-4 flex items-center gap-3 text-[15px] font-semibold">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-5 accent-[var(--accent)]" />
        Kód mám bezpečně uložený
      </label>
      <div className="mt-4">
        <PrimaryButton type="button" disabled={!saved} onClick={onDone}>
          {doneLabel}
        </PrimaryButton>
      </div>
    </div>
  );
}

export function RecoveryScreen() {
  const code = useAccount((s) => s.recoveryCode);
  if (!code) return null;
  return (
    <Frame>
      <h1 className="font-display text-[32px] leading-[1.05]">
        Uložte si <em className="text-moss">záchranný kód</em>
      </h1>
      <p className="mt-2 mb-5 text-[15px] text-muted">Váš účet je založený a data jsou zašifrovaná. Tenhle kód je jediný náhradní klíč k nim.</p>
      <RecoveryCodeCard code={code} onDone={acknowledgeRecovery} />
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Odemknutí na novém zařízení                                         */
/* ------------------------------------------------------------------ */

function codeFromHash(): string {
  const m = /[#/]kod=([0-9A-Za-z-]{25,40})/.exec(window.location.hash);
  return m ? (normalizeRecoveryCode(m[1]) ?? '') : '';
}

export function UnlockScreen() {
  const user = useAccount((s) => s.user);
  const [code, setCode] = useState(codeFromHash);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlock = async (value = code) => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithRecoveryCode(value);
      if (window.location.hash.includes('kod=')) window.history.replaceState(null, '', `${window.location.pathname}#/dnes`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (code && normalizeRecoveryCode(code)) void unlock(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Frame>
      <h1 className="font-display text-[32px] leading-[1.05]">
        Odemkněte svá <em className="text-moss">data</em>
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Na tomhle zařízení jste poprvé. Zadejte záchranný kód z doby založení účtu{user ? ` (${user.email})` : ''}.
      </p>
      <div className="mt-5 rounded-[20px] bg-surface-2/80 p-4 text-[14px]">
        <p className="flex items-center gap-2 font-bold">
          <Smartphone className="size-4.5 text-accent" aria-hidden /> Máte Stihnuto otevřené na jiném zařízení?
        </p>
        <p className="mt-1 text-muted">Tam otevřete Účet → Propojit telefon a kód naskenujte. Odemkne se samo.</p>
        <ScanPairButton className="mt-3 w-full bg-surface" />
      </div>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <Field label="Záchranný kód" hint="25 znaků, na velikosti písmen ani pomlčkách nezáleží.">
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} className={cn(inputClass, 'font-mono uppercase tracking-wider')} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />
        </Field>
        {error && <p className="rounded-[16px] bg-red-500/10 p-3.5 text-[14px] font-semibold text-red-700 dark:text-red-300">{error}</p>}
        <PrimaryButton busy={busy} disabled={!normalizeRecoveryCode(code)}>
          <KeyRound className="size-5" aria-hidden /> Odemknout
        </PrimaryButton>
      </form>
      <details className="mt-5 text-[14px]">
        <summary className="cursor-pointer font-semibold text-muted hover:text-fg">Kód nemám</summary>
        <p className="mt-2 text-muted">
          Bez kódu data v účtu otevřít nejde – ani my to neumíme, proto jsou v bezpečí. Pokud máte Stihnuto přihlášené na jiném zařízení, tam si vytvořte nový kód (Účet → Záchranný kód). Rozvrh, Moodle i Google si případně jen znovu propojíte.
        </p>
      </details>
      <button type="button" onClick={() => void signOutAccount()} className="mt-5 text-[14px] font-semibold text-muted hover:text-fg">
        Odhlásit se
      </button>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Nové heslo                                                          */
/* ------------------------------------------------------------------ */

export function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Frame>
      <h1 className="font-display text-[32px] leading-[1.05]">
        Nastavte si <em className="text-moss">nové heslo</em>
      </h1>
      <p className="mt-2 text-[15px] text-muted">Aspoň 10 znaků. Pokud tohle zařízení data ještě nezná, po uložení vás poprosíme o záchranný kód.</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length < 10) {
            setError('Heslo musí mít aspoň 10 znaků.');
            return;
          }
          setBusy(true);
          setError(null);
          void passwordLeaked(password)
            .then((leaked) => {
              if (leaked) throw new Error('Tohle heslo se objevilo v únicích dat z jiných služeb. Zvolte prosím jiné.');
              return setNewPassword(password);
            })
            .then(() => toast.success('Heslo je změněné.'))
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="Nové heslo">
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        {error && <p className="rounded-[16px] bg-red-500/10 p-3.5 text-[14px] font-semibold text-red-700 dark:text-red-300">{error}</p>}
        <PrimaryButton busy={busy}>
          <Check className="size-5" aria-hidden /> Uložit heslo
        </PrimaryButton>
      </form>
    </Frame>
  );
}

export function LoadingScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <BrandMark className="size-14 animate-pulse" />
        <p className="flex items-center gap-2 text-[15px] font-semibold text-muted">
          <Mail className="hidden" aria-hidden />
          <LoaderCircle className="size-4.5 animate-spin" aria-hidden /> Načítám váš účet…
        </p>
      </div>
    </div>
  );
}

/** Co ukázat místo aplikace, dokud účet není připravený. */
export function AccountGate({ status }: { status: AccountStatus }) {
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'signedOut') return <SignInScreen />;
  if (status === 'locked') return <UnlockScreen />;
  if (status === 'showRecovery') return <RecoveryScreen />;
  if (status === 'resetPassword') return <ResetPasswordScreen />;
  return null;
}
