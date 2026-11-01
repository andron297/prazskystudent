import { CalendarDays, GraduationCap, Plug, ScrollText } from 'lucide-react';
import { useUiStore, type ConnectTab } from '../../store/uiStore';
import { Modal } from '../ui/overlays';
import { Segmented } from '../ui/primitives';
import { IcsConnect } from './IcsConnect';
import { MoodleConnect } from './MoodleConnect';
import { TextParser } from './TextParser';

export function ConnectStudyModal() {
  const open = useUiStore((s) => s.connectOpen);
  const tab = useUiStore((s) => s.connectTab);
  const parserSubjectId = useUiStore((s) => s.parserSubjectId);
  const close = useUiStore((s) => s.closeConnect);
  const openConnect = useUiStore((s) => s.openConnect);

  return (
    <Modal open={open} onClose={close} title="Propojit studium" description="Tři cesty bez složitého nastavování – stačí vložit odkaz, klíč nebo text." icon={Plug} size="xl">
      <Segmented<ConnectTab>
        value={tab}
        onChange={(t) => openConnect(t, parserSubjectId)}
        options={[
          { value: 'moodle', label: 'A · Moodle', icon: GraduationCap },
          { value: 'ics', label: 'B · SIS / Google (.ics)', icon: CalendarDays },
          { value: 'parser', label: 'C · Harmonogram a sylaby', icon: ScrollText },
        ]}
        className="mb-5 w-full overflow-x-auto"
      />
      {tab === 'moodle' && <MoodleConnect />}
      {tab === 'ics' && <IcsConnect />}
      {tab === 'parser' && <TextParser key={parserSubjectId ?? 'all'} initialSubjectId={parserSubjectId} />}
    </Modal>
  );
}
