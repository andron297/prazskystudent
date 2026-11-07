/**
 * Propojení s Googlem názorně: co uvidíte v okně Googlu (výběr účtu,
 * „Google tuto aplikaci neověřil“, souhlas) a co dělat, když Google napíše
 * „Přístup zablokován“ (chyba 403) – včetně postupu pro správce aplikace.
 */
import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useAccount } from '../../services/account';
import { isOwnerEmail } from '../../store/testStore';
import { toast } from '../../store/uiStore';
import { cn } from '../ui/primitives';
import { RealScreens, type RealShot } from './RealScreens';

export const GOOGLE_SHOTS: RealShot[] = [
  {
    src: '/guides/google-1.webp',
    width: 800,
    height: 746,
    alt: 'Okno Googlu „Vyberte účet a pokračujte do aplikace Stihnuto“ se zvýrazněným účtem',
    caption: (
      <>
        Vyberte účet Google, ve kterém chcete mít rozvrh a úkoly (1).
      </>
    ),
  },
  {
    src: '/guides/google-2.webp',
    width: 800,
    height: 1026,
    alt: 'Okno Googlu „Google tuto aplikaci neověřil“ se zvýrazněnými odkazy Rozšířené a Přejít na web prazskystudent.vercel.app (nebezpečné)',
    caption: (
      <>
        Když Google napíše „Google tuto aplikaci neověřil“, klikněte vlevo dole na <strong>Rozšířené</strong> (1) a pak na <strong>Přejít na web … (nebezpečné)</strong> (2).
      </>
    ),
  },
  {
    src: '/guides/google-3.webp',
    width: 800,
    height: 1368,
    alt: 'Okno Googlu „Stihnuto chce získat přístup k vašemu účtu Google“ se zaškrtnutým Vybrat vše a tlačítkem Pokračovat',
    caption: (
      <>
        Zaškrtněte <strong>Vybrat vše</strong> (1) – bez toho se kalendář ani úkoly nepropojí – a klikněte na <strong>Pokračovat</strong> (2).
      </>
    ),
  },
];

export const GOOGLE_BLOCKED_SHOT: RealShot = {
  src: '/guides/google-4.webp',
  width: 800,
  height: 676,
  alt: 'Okno Googlu „Přístup zablokován: aplikace Stihnuto neprošla procesem ověření Googlu“, Chyba 403: access_denied',
  caption: <>Tohle okno znamená, že aplikace je v Googlu zatím jen v testovacím režimu.</>,
};

export const GOOGLE_ADMIN_SHOTS: RealShot[] = [
  {
    src: '/guides/google-5.webp',
    width: 1520,
    height: 880,
    alt: 'Google Cloud – Google Auth Platform, stránka Audience se stavem Testing a zvýrazněným tlačítkem Publish app',
    caption: (
      <>
        V Google Cloud otevřete <strong>Google Auth Platform → Audience</strong> a klikněte na <strong>Publish app</strong> (1).
      </>
    ),
  },
  {
    src: '/guides/google-6.webp',
    width: 1520,
    height: 806,
    alt: 'Google Cloud – dialog Push to production? se zvýrazněným tlačítkem Confirm',
    caption: (
      <>
        Potvrďte <strong>Confirm</strong> (2). Od té chvíle se může propojit kdokoli – chyba 403 zmizí.
      </>
    ),
  },
];

const SOURCE = 'Ilustrace podle oken Googlu – skutečná okna se mohou drobně lišit (podle jazyka a zařízení).';

/** Co uvidíte v okně Googlu – tři kroky s vyznačenými tlačítky. */
export function GoogleConnectGuide({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 text-[14px] font-bold">Co uvidíte v okně Googlu</p>
      <RealScreens shots={GOOGLE_SHOTS} source={SOURCE} />
    </div>
  );
}

const ADMIN_MESSAGE = `Ahoj, při propojení Stihnuta s Googlem mi Google píše „Přístup zablokován“ (Chyba 403: access_denied). Oprava pro správce: Google Cloud → Google Auth Platform → Audience → Publish app → Confirm (https://console.cloud.google.com/auth/audience). Případně mě přidej mezi Test users. Díky!`;

/** Postup pro správce: zveřejnit aplikaci (nebo přidat testery). */
function AdminFix() {
  return (
    <div className="space-y-3">
      <RealScreens shots={GOOGLE_ADMIN_SHOTS} source="Ilustrace podle Google Cloud Console (anglické rozhraní)." />
      <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
        <li>
          Otevřete{' '}
          <a className="font-semibold text-accent hover:underline" href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">
            Google Auth Platform → Audience <ExternalLink className="inline size-3.5 align-[-2px]" aria-hidden />
          </a>{' '}
          (nahoře vyberte projekt aplikace).
        </li>
        <li>
          U <strong>Publishing status</strong> klikněte na <strong>Publish app</strong> a potvrďte <strong>Confirm</strong>.
        </li>
        <li>Hotovo – zkuste propojení znovu. Google pak už jen upozorní, že aplikaci neověřil (krok 2 návodu výše), a propojení projde.</li>
      </ol>
      <p className="text-[12.5px] leading-relaxed text-subtle">
        Nechcete aplikaci zveřejnit? Stačí v části <strong>Test users</strong> přidat přes <strong>Add users</strong> Gmail každého, kdo se má propojit (nejvýš 100 lidí). Jak se zbavit i varování „neověřeno“, popisuje docs/GOOGLE-OVERENI.md v repozitáři.
      </p>
    </div>
  );
}

/** Nejde to? Dvě nejčastější situace a co s nimi. */
export function GoogleTroubleshoot({ defaultOpen, className }: { defaultOpen?: 'unverified' | 'blocked'; className?: string }) {
  const email = useAccount((s) => s.user?.email);
  const owner = isOwnerEmail(email);
  const [open, setOpen] = useState<'unverified' | 'blocked' | null>(defaultOpen ?? null);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(ADMIN_MESSAGE).then(() => {
      setCopied(true);
      toast.success('Zpráva pro správce je zkopírovaná.');
      setTimeout(() => setCopied(false), 2500);
    });
  };
  const tab = (id: 'unverified' | 'blocked', label: string) => (
    <button
      type="button"
      onClick={() => setOpen((o) => (o === id ? null : id))}
      aria-expanded={open === id}
      className={cn('rounded-full px-3.5 py-2 text-left text-[13px] font-bold ring-1 ring-inset transition', open === id ? 'bg-fg text-canvas ring-fg' : 'bg-surface text-fg ring-line-strong hover:bg-surface-2')}
    >
      {label}
    </button>
  );
  return (
    <div className={cn('rounded-[22px] bg-surface-2/70 p-4 ring-1 ring-inset ring-line', className)}>
      <p className="text-[14px] font-bold">Nepovedlo se? Co vám Google ukázal?</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {tab('unverified', '„Google tuto aplikaci neověřil“')}
        {tab('blocked', '„Přístup zablokován“ (chyba 403)')}
      </div>

      {open === 'unverified' && (
        <div className="mt-4 space-y-3">
          <p className="text-[13.5px] leading-relaxed text-muted">
            To je v pořádku. Google tak upozorňuje u každé aplikace, která zatím neprošla jeho ověřením – Stihnuto je studentský projekt s otevřeným kódem. Data jdou jen mezi vaším prohlížečem a Googlem.
          </p>
          <RealScreens shots={[GOOGLE_SHOTS[1], GOOGLE_SHOTS[2]]} source={SOURCE} />
        </div>
      )}

      {open === 'blocked' && (
        <div className="mt-4 space-y-3">
          <RealScreens shots={[GOOGLE_BLOCKED_SHOT]} source={SOURCE} />
          {owner ? (
            <>
              <p className="text-[13.5px] font-bold">Jste správce aplikace – opravíte to jednou pro všechny:</p>
              <AdminFix />
            </>
          ) : (
            <>
              <p className="text-[13.5px] leading-relaxed text-muted">
                Aplikace je v Googlu zatím v testovacím režimu a váš účet v něm není. Opravit to může jen správce aplikace – stačí mu poslat zprávu níže. Do té doby funguje všechno ostatní (rozvrh, úkoly, termíny, doprava) i bez Googlu.
              </p>
              <button type="button" onClick={copy} className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[13.5px] font-bold text-accent-fg hover:brightness-110">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? 'Zkopírováno' : 'Zkopírovat zprávu pro správce'}
              </button>
              <details className="text-[13px]">
                <summary className="cursor-pointer font-semibold text-accent">Provozujete aplikaci vy? Postup pro správce</summary>
                <div className="mt-3">
                  <AdminFix />
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}
