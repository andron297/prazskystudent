import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { DashboardView } from './components/dashboard/DashboardView';
import { AppShell } from './components/layout/AppShell';
import { ConfirmHost, Toaster } from './components/ui/overlays';
import { Skeleton } from './components/ui/primitives';
import { useHashRoute, useThemeEffect } from './hooks/useAppShell';
import { useAppStore } from './store/appStore';
import { useClockStore } from './store/clockStore';
import { useUiStore } from './store/uiStore';

// Méně používané sekce se načítají až při otevření (menší první načtení PWA).
const SubjectsView = lazy(() => import('./components/subjects/SubjectsView').then((m) => ({ default: m.SubjectsView })));
const CalendarView = lazy(() => import('./components/calendar/CalendarView').then((m) => ({ default: m.CalendarView })));
const IntegrationsView = lazy(() => import('./components/integrations/IntegrationsView').then((m) => ({ default: m.IntegrationsView })));
const ConnectStudyModal = lazy(() => import('./components/integrations/ConnectStudyModal').then((m) => ({ default: m.ConnectStudyModal })));

function ViewFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-10 w-72 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

export default function App() {
  const theme = useAppStore((s) => s.settings.theme);
  const mode = useAppStore((s) => s.settings.mode);
  const { view, param } = useHashRoute();
  const connectOpen = useUiStore((s) => s.connectOpen);
  const [connectMounted, setConnectMounted] = useState(false);
  useThemeEffect(theme);

  useEffect(() => {
    if (connectOpen) setConnectMounted(true);
  }, [connectOpen]);

  useEffect(() => {
    void useUiStore.getState().refreshServer();
  }, []);

  // Demo: posun ukázkových dat na dnešek a simulované hodiny; Live: reálný čas.
  useEffect(() => {
    const clock = useClockStore.getState();
    if (mode === 'demo') {
      useAppStore.getState().rebaseDemo(new Date());
      if (useAppStore.getState().settings.demoClock) clock.startSimulation();
      else clock.switchToRealTime();
    } else {
      clock.switchToRealTime();
    }
  }, [mode]);

  return (
    <MotionConfig reducedMotion="user">
      <AppShell view={view}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${view}/${param ?? ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <Suspense fallback={<ViewFallback />}>
              {view === 'dnes' && <DashboardView />}
              {view === 'predmety' && <SubjectsView subjectId={param} />}
              {view === 'harmonogram' && <CalendarView />}
              {view === 'integrace' && <IntegrationsView />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </AppShell>
      {connectMounted && (
        <Suspense fallback={null}>
          <ConnectStudyModal />
        </Suspense>
      )}
      <ConfirmHost />
      <Toaster />
    </MotionConfig>
  );
}
