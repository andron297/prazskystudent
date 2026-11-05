import { lazy, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { DashboardView } from './components/dashboard/DashboardView';
import { AppShell } from './components/layout/AppShell';
import { ConfirmHost, Toaster } from './components/ui/overlays';
import { Skeleton } from './components/ui/primitives';
import { useHashRoute, useThemeEffect } from './hooks/useAppShell';
import { useSisBridge } from './services/sisBridge';
import { useBackgroundSync } from './services/syncCenter';
import { useAppStore } from './store/appStore';
import { useClockStore } from './store/clockStore';
import { toast, useUiStore } from './store/uiStore';
import { SetupWizard } from './components/setup/SetupWizard';
import { initAccount, useAccount } from './services/account';
import { IntroSplash } from './components/intro/IntroSplash';
import { CountdownEditor } from './components/dashboard/Countdowns';
import { startSubjectAssist } from './services/subjectAssist';
import { startLeaveBadge } from './services/leaveBadge';

// Méně používané sekce se načítají až při otevření (menší první načtení PWA).
const TransitMapView = lazy(() => import('./components/map/TransitMapView').then((m) => ({ default: m.TransitMapView })));
const SubjectsView = lazy(() => import('./components/subjects/SubjectsView').then((m) => ({ default: m.SubjectsView })));
const StudyProfileDialog = lazy(() => import('./components/plan/StudyProfileDialog').then((m) => ({ default: m.StudyProfileDialog })));
const PlanView = lazy(() => import('./components/plan/PlanView').then((m) => ({ default: m.PlanView })));
const ConnectionsView = lazy(() => import('./components/integrations/ConnectionsView').then((m) => ({ default: m.ConnectionsView })));
const ImportView = lazy(() => import('./components/integrations/ImportView').then((m) => ({ default: m.ImportView })));
const ConnectStudyModal = lazy(() => import('./components/integrations/ConnectStudyModal').then((m) => ({ default: m.ConnectStudyModal })));
const ItemEditor = lazy(() => import('./components/common/ItemEditor').then((m) => ({ default: m.ItemEditor })));
const AccountView = lazy(() => import('./components/account/AccountView').then((m) => ({ default: m.AccountView })));
const PrivacyView = lazy(() => import('./components/legal/LegalViews').then((m) => ({ default: m.PrivacyView })));
const TermsView = lazy(() => import('./components/legal/LegalViews').then((m) => ({ default: m.TermsView })));
const AccountGate = lazy(() => import('./components/account/AccountScreens').then((m) => ({ default: m.AccountGate })));
const LiveNavigation = lazy(() => import('./components/navigation/LiveNavigation').then((m) => ({ default: m.LiveNavigation })));
const GuideView = lazy(() => import('./components/tour/GuideView').then((m) => ({ default: m.GuideView })));
const QuickTour = lazy(() => import('./components/tour/QuickTour').then((m) => ({ default: m.QuickTour })));

function ViewFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-12 w-72 max-w-full rounded-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-48 rounded-[26px]" />
        <Skeleton className="h-48 rounded-[26px]" />
        <Skeleton className="h-48 rounded-[26px]" />
      </div>
    </div>
  );
}

export default function App() {
  const theme = useAppStore((s) => s.settings.theme);
  const mode = useAppStore((s) => s.settings.mode);
  const { view, param } = useHashRoute();
  const connectOpen = useUiStore((s) => s.connectOpen);
  const editor = useUiStore((s) => s.editor);
  const navigation = useUiStore((s) => s.navigation);
  const tour = useUiStore((s) => s.tour);
  const askStudyProfile = useUiStore((s) => s.askStudyProfile);
  const [connectMounted, setConnectMounted] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  useThemeEffect(theme);
  useBackgroundSync();
  useSisBridge();

  useEffect(() => {
    if (connectOpen) setConnectMounted(true);
  }, [connectOpen]);
  useEffect(() => {
    if (editor) setEditorMounted(true);
  }, [editor]);

  const accountStatus = useAccount((s) => s.status);
  useEffect(() => startSubjectAssist(), []);
  useEffect(() => startLeaveBadge(), []);
  useEffect(() => {
    void useUiStore
      .getState()
      .refreshServer()
      .then(() => initAccount())
      .catch(() => useAccount.setState({ status: 'off' }));
  }, []);

  // Průvodce: poprvé (bez účtu v ukázce, s účtem po přihlášení), nebo po návratu z přihlášení.
  useEffect(() => {
    if (accountStatus === 'loading') return;
    const ui = useUiStore.getState();
    const done = useAppStore.getState().meta.setupDone;
    if (accountStatus === 'ready' && (ui.resumeSetup || !done)) {
      useUiStore.setState({ resumeSetup: false });
      const t = setTimeout(() => useUiStore.getState().openSetup('auto'), 500);
      return () => clearTimeout(t);
    }
    if ((accountStatus === 'off' || (accountStatus === 'signedOut' && useAppStore.getState().settings.mode === 'demo')) && !done) {
      const t = setTimeout(() => useUiStore.getState().openSetup('start'), 700);
      return () => clearTimeout(t);
    }
  }, [accountStatus]);

  // Sandbox: posun ukázkových dat na dnešek a simulované hodiny; Live: reálný čas.
  useEffect(() => {
    const clock = useClockStore.getState();
    if (mode === 'demo') {
      useAppStore.getState().rebaseDemo(new Date());
      if (useAppStore.getState().settings.demoClock) clock.startSimulation();
      else clock.switchToRealTime();
    } else {
      clock.switchToRealTime();
      // Vlastní data nikdy nemíchat s ukázkou (i po starších verzích aplikace).
      const removed = useAppStore.getState().purgeSampleData();
      if (removed > 0) toast.info('Ukázková data jsou pryč – teď vidíte jen to svoje.');
    }
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const fullBleed = view === 'doprava';
  const legal = view === 'podminky' || view === 'soukromi';
  // Vlastní data jen s účtem: dokud není přihlášený a odemčený, místo aplikace přihlášení.
  const gated = accountStatus !== 'off' && accountStatus !== 'ready' && (mode !== 'demo' || view === 'ucet' || accountStatus === 'showRecovery' || accountStatus === 'resetPassword') && !legal;

  return (
    <MotionConfig reducedMotion="user">
      <IntroSplash />
      {gated ? (
        <>
          <Suspense fallback={null}>
            <AccountGate status={accountStatus} />
          </Suspense>
          <ConfirmHost />
          <Toaster />
        </>
      ) : (
        <>
          <AppShell view={view} fullBleed={fullBleed}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${view}/${param ?? ''}`} className={fullBleed ? 'h-full' : undefined} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                <Suspense fallback={<ViewFallback />}>
                  {view === 'dnes' && <DashboardView />}
                  {view === 'doprava' && <TransitMapView />}
                  {view === 'predmety' && <SubjectsView subjectId={param} />}
                  {view === 'plan' && <PlanView tab={param} />}
                  {view === 'propojeni' && <ConnectionsView section={param} />}
                  {view === 'import' && <ImportView />}
                  {view === 'ucet' && <AccountView />}
                  {view === 'podminky' && <TermsView />}
                  {view === 'soukromi' && <PrivacyView />}
                  {view === 'pruvodce' && <GuideView />}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </AppShell>
          {connectMounted && (
            <Suspense fallback={null}>
              <ConnectStudyModal />
            </Suspense>
          )}
          {editorMounted && (
            <Suspense fallback={null}>
              <ItemEditor />
            </Suspense>
          )}
          {navigation && (
            <Suspense fallback={null}>
              <LiveNavigation />
            </Suspense>
          )}
          {askStudyProfile && (
            <Suspense fallback={null}>
              <StudyProfileDialog open onClose={() => useUiStore.setState({ askStudyProfile: false })} />
            </Suspense>
          )}
          {tour && (
            <Suspense fallback={null}>
              <QuickTour />
            </Suspense>
          )}
          <CountdownEditor />
          <SetupWizard />
          <ConfirmHost />
          <Toaster />
        </>
      )}
    </MotionConfig>
  );
}
