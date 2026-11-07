/**
 * Stěhování na novou adresu (PUBLIC_CANONICAL_ORIGIN na serveru).
 * Na staré adrese: přihlášený student přejde jedním klepnutím – vytvoří se
 * jednorázové propojení (jako QR kód telefonu) rovnou pro novou adresu, takže
 * je tam hned přihlášený i odemčený a data se stáhnou ze zašifrované zálohy
 * účtu. Kdo přihlášený není, přesměruje se rovnou. Místní data se nikdy
 * nemažou – stará adresa funguje dál, dokud ji správce nevypne.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from '../../services/account';
import { createPairing } from '../../services/pairing';
import { useAppStore } from '../../store/appStore';
import { toast, useUiStore } from '../../store/uiStore';
import { BrandMark } from '../layout/AppShell';

const MOVED_KEY = 'stihnu:moved-to';
const LATER_KEY = 'stihnu:move-later';

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

export function MovedNotice() {
  const target = useUiStore((s) => s.server.canonicalOrigin);
  const status = useAccount((s) => s.status);
  const mode = useAppStore((s) => s.settings.mode);
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(() => {
    try {
      return Number(sessionStorage.getItem(LATER_KEY) ?? 0) > Date.now();
    } catch {
      return false;
    }
  });
  const onOldAddress = Boolean(target && target !== window.location.origin && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname));
  const hash = window.location.hash || '#/dnes';

  useEffect(() => {
    if (!onOldAddress || !target) return;
    // Už jednou přestěhováno, nebo není co přenášet → rovnou na novou adresu.
    let moved = false;
    try {
      moved = localStorage.getItem(MOVED_KEY) === target;
    } catch {
      moved = false;
    }
    if (status === 'loading') return;
    // Bez účtu na serveru (status off) by se místní data nepřenesla – tehdy nepřesměrovávat.
    if (moved || status === 'signedOut' || (mode === 'demo' && status !== 'ready' && status !== 'off')) {
      window.location.replace(`${target}/${hash}`);
    }
  }, [onOldAddress, target, status, mode, hash]);

  if (!onOldAddress || !target || later || status !== 'ready') return null;

  const move = async () => {
    setBusy(true);
    try {
      const ticket = await createPairing(target);
      try {
        localStorage.setItem(MOVED_KEY, target);
      } catch {
        /* nevadí */
      }
      window.location.href = ticket.url;
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : 'Přesun se nepodařil. Zkuste to prosím znovu.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[150] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Stihnuto má novou adresu">
      <div className="card w-full max-w-md rounded-[30px] p-6 text-center shadow-2xl">
        <BrandMark className="mx-auto size-14" />
        <h2 className="mt-4 font-display text-[34px] leading-tight">
          Stihnuto má <em className="text-moss">novou adresu</em>
        </h2>
        <p className="mt-2 text-[15px] font-bold">{hostOf(target)}</p>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
          Jedním klepnutím vás tam přenesu – přihlášené, s rozvrhem, úkoly i nastavením. Data se stáhnou z vaší zašifrované zálohy, nic se neztratí. Google propojíte na nové adrese jedním potvrzením.
        </p>
        <button type="button" onClick={() => void move()} disabled={busy} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-5 text-[15px] font-bold text-accent-fg shadow-[0_10px_24px_-12px_var(--accent)] hover:brightness-110 disabled:opacity-60">
          {busy ? 'Připravuji přesun…' : 'Přejít na novou adresu'}
        </button>
        <p className="mt-3 text-[12.5px] text-subtle">Máte Stihnuto jako ikonu na ploše telefonu? Po přesunu ji přidejte znovu z nové adresy (Sdílet → Přidat na plochu).</p>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(LATER_KEY, String(Date.now() + 6 * 3_600_000));
            } catch {
              /* nevadí */
            }
            setLater(true);
          }}
          className="mt-2 text-[13px] font-semibold text-muted hover:text-fg"
        >
          Později
        </button>
      </div>
    </div>,
    document.body,
  );
}
