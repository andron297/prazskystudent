import { ChevronLeft } from 'lucide-react';
import { navigateTo } from '../../hooks/useAppShell';

/** Odkaz zpět do Nastavení (na podstránkách a v Propojení, Účtu, Vzhledu, Průvodci). */
export function SettingsBack({ label = 'Nastavení' }: { label?: string }) {
  return (
    <button type="button" onClick={() => navigateTo('nastaveni')} className="-ml-1.5 mb-1 inline-flex items-center gap-1 rounded-full py-1.5 pl-1.5 pr-3 text-[13.5px] font-bold text-muted transition hover:bg-surface-2 hover:text-fg">
      <ChevronLeft className="size-4" aria-hidden /> {label}
    </button>
  );
}
