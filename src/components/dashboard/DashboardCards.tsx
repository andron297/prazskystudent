import { motion } from 'motion/react';
import { Check, FlaskConical, Play, Zap } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui/primitives';

/* ------------------------------------------------------------------ */
/* Uvítání ukázky a nabídka prohlídky                                  */
/* ------------------------------------------------------------------ */

export function WelcomeCard() {
  const mode = useAppStore((s) => s.settings.mode);
  const dismissed = useAppStore((s) => s.meta.welcomeDismissed);
  const dismiss = useAppStore((s) => s.dismissWelcome);
  if (mode !== 'demo' || dismissed) return null;
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col gap-4 rounded-[26px] p-5 sm:flex-row sm:items-center">
      <div className="grid size-11 shrink-0 place-items-center rounded-full bg-sand/25 text-clay">
        <FlaskConical className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[24px] leading-tight">
          Tohle je <em className="text-moss">ukázka</em>
        </p>
        <p className="mt-0.5 text-[13.5px] text-muted">Simulovaná doprava, Moodle i Google. Klikej a zkoušej – nic se nikam neodešle.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={Check} onClick={dismiss}>
          Rozumím
        </Button>
        <Button size="sm" variant="secondary" icon={Play} onClick={() => useUiStore.getState().startTour()}>
          Prohlídka
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={Zap}
          onClick={() => {
            dismiss();
            useUiStore.getState().openSetup('start');
          }}
        >
          Nastavit svoje data
        </Button>
      </div>
    </motion.section>
  );
}

/** Jednorázová nabídka krátké prohlídky (po nastavení vlastních dat). */
export function TourOffer() {
  const show = useAppStore((s) => s.settings.mode === 'live' && s.meta.setupDone && !s.meta.tourSeen);
  const markTourSeen = useAppStore((s) => s.markTourSeen);
  if (!show) return null;
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col gap-3 rounded-[26px] p-5 sm:flex-row sm:items-center">
      <div className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <Play className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[22px] leading-tight">Ukázat, co kde najdeš?</p>
        <p className="mt-0.5 text-[13.5px] text-muted">Krátká prohlídka zabere minutu. Kdykoli ji spustíš i z Průvodce (ikona otazníku nahoře).</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={markTourSeen}>
          Teď ne
        </Button>
        <Button size="sm" variant="primary" icon={Play} onClick={() => useUiStore.getState().startTour()}>
          Ukázat
        </Button>
      </div>
    </motion.section>
  );
}
