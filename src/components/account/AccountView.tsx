/**
 * Správa účtu: kdo jsem, synchronizace, nové zařízení (QR), záchranný kód,
 * heslo, odhlášení, export a smazání účtu.
 */
import { useState, type ReactNode } from 'react';
import { Cloud, Download, KeyRound, LogOut, MonitorSmartphone, RefreshCw, ShieldCheck, Trash2, UserRound, type LucideIcon } from 'lucide-react';
import { formatRelative } from '../../lib/dates';
import { passwordLeaked } from '../../lib/vaultCrypto';
import { deleteAccount, exportAccountData, forceSync, regenerateRecoveryCode, setNewPassword, signOutAccount, useAccount } from '../../services/account';
import { appNow } from '../../store/clockStore';
import { confirmAction, toast, useUiStore } from '../../store/uiStore';
import { cn, SerifTitle } from '../ui/primitives';
import { RecoveryCodeCard } from './AccountScreens';
import { PairDeviceDialog, ScanPairButton } from './PairDevice';

function Section({ icon: Icon, title, children, tone }: { icon: LucideIcon; title: string; children: ReactNode; tone?: 'danger' }) {
  return (
    <section className="card rounded-[26px] p-5 sm:p-6">
      <h2 className={cn('flex items-center gap-2 text-[17px] font-bold', tone === 'danger' && 'text-red-700 dark:text-red-300')}>
        <Icon className={cn('size-5', tone === 'danger' ? 'text-red-600' : 'text-accent')} aria-hidden /> {title}
      </h2>
      <div className="mt-3 text-[14.5px] leading-relaxed">{children}</div>
    </section>
  );
}

const btn = 'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] font-bold transition';

export function AccountView() {
  const status = useAccount((s) => s.status);
  const user = useAccount((s) => s.user);
  const syncing = useAccount((s) => s.syncing);
  const lastSyncAt = useAccount((s) => s.lastSyncAt);
  const syncError = useAccount((s) => s.syncError);
  const server = useUiStore((s) => s.server);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');

  if (status === 'off') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <SerifTitle as="h1" className="text-[44px]">
          Účet
        </SerifTitle>
        <Section icon={Cloud} title="Účty zatím nejsou zapnuté">
          <p className="text-muted">Data jsou teď jen v tomto zařízení. Jakmile správce aplikace zapne účty, přihlásíte se a data se budou bezpečně synchronizovat mezi zařízeními.</p>
          <a href="#/propojeni/spravce" className="mt-3 inline-block font-semibold text-accent hover:underline">
            Návod pro správce
          </a>
        </Section>
      </div>
    );
  }
  if (!user) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center gap-4">
        {user.avatar ? <img src={user.avatar} alt="" className="size-16 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent"><UserRound className="size-8" aria-hidden /></span>}
        <div className="min-w-0">
          <p className="eyebrow text-subtle">Účet</p>
          <h1 className="truncate font-display text-[34px] leading-tight">{user.name ?? user.email}</h1>
          <p className="truncate text-[14px] text-muted">
            {user.email} · {user.provider === 'google' ? 'přihlášení přes Google' : 'přihlášení e-mailem'}
          </p>
        </div>
      </header>

      <Section icon={RefreshCw} title="Synchronizace">
        <p className={cn(syncError ? 'text-red-700 dark:text-red-300' : 'text-muted')}>
          {syncError ?? (lastSyncAt ? `Všechno uložené v účtu – naposledy ${formatRelative(new Date(lastSyncAt), appNow())}.` : 'Ukládám…')}
        </p>
        <p className="mt-1 text-[13px] text-subtle">Rozvrh, úkoly, předměty, propojení a nastavení. Soubory nahrané z počítače zůstávají jen v zařízení, kde je máte.</p>
        <button type="button" onClick={() => void forceSync()} disabled={syncing} className={cn(btn, 'mt-3 bg-accent text-accent-fg hover:brightness-110 disabled:opacity-60')}>
          <RefreshCw className={cn('size-4', syncing && 'animate-spin')} aria-hidden /> Synchronizovat teď
        </button>
      </Section>

      <Section icon={MonitorSmartphone} title="Propojit telefon nebo jiné zařízení">
        <p className="text-muted">Ukážu QR kód. Naskenujete ho telefonem a ten se sám přihlásí i odemkne – bez hesla a bez záchranného kódu. Pak se všechno synchronizuje samo.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setPairOpen(true)} className={cn(btn, 'bg-accent text-accent-fg hover:brightness-110')}>
            <MonitorSmartphone className="size-4" aria-hidden /> Propojit telefon
          </button>
          <ScanPairButton label="Naskenovat kód z jiného zařízení" />
        </div>
        <PairDeviceDialog open={pairOpen} onClose={() => setPairOpen(false)} />
      </Section>

      <Section icon={KeyRound} title="Záchranný kód">
        {newCode ? (
          <RecoveryCodeCard code={newCode} onDone={() => setNewCode(null)} doneLabel="Hotovo" />
        ) : (
          <>
            <p className="text-muted">Jediný náhradní klíč k datům. Když ho ztratíte (nebo máte podezření, že ho někdo viděl), vytvořte nový – starý přestane platit.</p>
            <button
              type="button"
              onClick={async () => {
                if (!(await confirmAction({ title: 'Vytvořit nový záchranný kód?', message: 'Starý kód přestane platit.', confirmLabel: 'Vytvořit' }))) return;
                void run('code', async () => setNewCode(await regenerateRecoveryCode()));
              }}
              className={cn(btn, 'mt-3 bg-surface-2 hover:bg-line')}
            >
              <KeyRound className="size-4" aria-hidden /> Vytvořit nový kód
            </button>
          </>
        )}
      </Section>

      {user.provider === 'email' && (
        <Section icon={ShieldCheck} title="Změnit heslo">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nové heslo (aspoň 10 znaků)" className="h-11 flex-1 rounded-full bg-surface px-4 ring-1 ring-inset ring-line-strong outline-none focus:ring-2 focus:ring-accent" />
            <button
              type="button"
              disabled={password.length < 10 || busy === 'pw'}
              onClick={() =>
                void run('pw', async () => {
                  if (await passwordLeaked(password)) throw new Error('Tohle heslo se objevilo v únicích dat z jiných služeb. Zvolte prosím jiné.');
                  await setNewPassword(password);
                  setPassword('');
                  toast.success('Heslo je změněné.');
                })
              }
              className={cn(btn, 'bg-accent text-accent-fg disabled:opacity-50')}
            >
              Uložit
            </button>
          </div>
        </Section>
      )}

      <Section icon={LogOut} title="Odhlášení">
        <p className="text-muted">Při odhlášení se data z tohoto zařízení smažou. V účtu zůstanou zašifrovaná.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void run('out', () => signOutAccount(false))} className={cn(btn, 'bg-surface-2 hover:bg-line')}>
            <LogOut className="size-4" aria-hidden /> Odhlásit se
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await confirmAction({ title: 'Odhlásit všude?', message: 'Odhlásí vás na všech telefonech a počítačích. Hodí se třeba při ztrátě telefonu.', confirmLabel: 'Odhlásit všude' })) void run('all', () => signOutAccount(true));
            }}
            className={cn(btn, 'bg-surface-2 hover:bg-line')}
          >
            <MonitorSmartphone className="size-4" aria-hidden /> Odhlásit ze všech zařízení
          </button>
        </div>
      </Section>

      <Section icon={Download} title="Moje data">
        <p className="text-muted">Stáhněte si kopii všeho, co je v účtu (rozšifrovanou, jako soubor JSON).</p>
        <button
          type="button"
          onClick={() =>
            void run('export', async () => {
              const text = await exportAccountData();
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
              a.download = 'stihnu-moje-data.json';
              a.click();
              URL.revokeObjectURL(a.href);
            })
          }
          className={cn(btn, 'mt-3 bg-surface-2 hover:bg-line')}
        >
          <Download className="size-4" aria-hidden /> Stáhnout moje data
        </button>
        <p className="mt-3 text-[13px] text-subtle">
          <a href="#/soukromi" className="font-semibold hover:underline">
            Zásady ochrany osobních údajů
          </a>{' '}
          ·{' '}
          <a href="#/podminky" className="font-semibold hover:underline">
            Podmínky použití
          </a>
        </p>
      </Section>

      <Section icon={Trash2} title="Smazat účet" tone="danger">
        <p className="text-muted">Smaže účet a všechna data v něm. Nejde to vrátit.{!server.accountDelete && ' (Data se smažou hned; samotný účet smaže správce.)'}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={`Pro potvrzení napište ${user.email}`} className="h-11 flex-1 rounded-full bg-surface px-4 ring-1 ring-inset ring-line-strong outline-none focus:ring-2 focus:ring-red-500" />
          <button
            type="button"
            disabled={confirmEmail.trim().toLowerCase() !== user.email.toLowerCase() || busy === 'delete'}
            onClick={async () => {
              if (await confirmAction({ title: 'Opravdu smazat účet?', message: 'Účet i všechna data v něm zmizí natrvalo.', confirmLabel: 'Smazat natrvalo', tone: 'danger' }))
                void run('delete', async () => {
                  await deleteAccount(confirmEmail);
                  toast.success('Účet je smazaný. Díky za vyzkoušení Stihnu.');
                });
            }}
            className={cn(btn, 'bg-red-600 text-white disabled:opacity-40')}
          >
            <Trash2 className="size-4" aria-hidden /> Smazat účet
          </button>
        </div>
      </Section>
    </div>
  );
}
