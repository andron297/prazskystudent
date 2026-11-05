/**
 * Čtyři otázky o studiu – podle odpovědí se z harmonogramu fakulty skryje,
 * co se studenta netýká (doktorské studium, přijímačky, programy v cizím jazyce…).
 */
import { useMemo, useState } from 'react';
import { EyeOff, GraduationCap } from 'lucide-react';
import { LEVEL_LABEL, splitMilestones, type StudyLevel, type StudyProfile } from '../../lib/relevance';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { Modal } from '../ui/overlays';
import { Button, cn } from '../ui/primitives';

function Choice<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn('h-10 rounded-full px-4 text-[14px] font-semibold ring-1 ring-inset transition-colors', value === o.value ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-fg ring-line-strong hover:bg-surface-2')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StudyProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useAppStore((s) => s.settings.studyProfile);
  const milestones = useAppStore((s) => s.milestones);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [level, setLevel] = useState<StudyLevel>(current?.level ?? 'bc');
  const [year, setYear] = useState(current?.year ?? 1);
  const [form, setForm] = useState<StudyProfile['form']>(current?.form ?? 'prezencni');
  const [language, setLanguage] = useState<StudyProfile['language']>(current?.language ?? 'cs');
  const draft: StudyProfile = { level, year, form, language, answeredAt: new Date().toISOString() };
  const preview = useMemo(() => splitMilestones(milestones, { profile: draft }), [milestones, level, year, form, language]); // eslint-disable-line react-hooks/exhaustive-deps
  const reasons = [...new Set(preview.hidden.map((h) => h.reason))];

  const save = () => {
    updateSettings({ studyProfile: draft });
    toast.success(preview.hidden.length ? `Hotovo – ${preview.hidden.length} termínů, které se vás netýkají, je skryto.` : 'Uloženo.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Které termíny se vás týkají?"
      description="Harmonogram fakulty platí pro všechny typy studia. Podle čtyř odpovědí skryjeme to, co pro vás nemá význam."
      icon={GraduationCap}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Teď ne
          </Button>
          <Button variant="primary" onClick={save}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[14px] font-bold">Typ studia</p>
          <Choice value={level} onChange={setLevel} options={(Object.keys(LEVEL_LABEL) as StudyLevel[]).map((v) => ({ value: v, label: LEVEL_LABEL[v] }))} />
        </div>
        <div>
          <p className="mb-2 text-[14px] font-bold">Ročník</p>
          <Choice value={year} onChange={setYear} options={[1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: v === 6 ? '6. a vyšší' : `${v}.` }))} />
        </div>
        <div>
          <p className="mb-2 text-[14px] font-bold">Forma studia</p>
          <Choice
            value={form}
            onChange={setForm}
            options={[
              { value: 'prezencni', label: 'Prezenční' },
              { value: 'kombinovana', label: 'Kombinovaná' },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-[14px] font-bold">Jazyk studijního programu</p>
          <Choice
            value={language}
            onChange={setLanguage}
            options={[
              { value: 'cs', label: 'Čeština' },
              { value: 'en', label: 'Angličtina' },
            ]}
          />
        </div>
        <div className="flex items-start gap-3 rounded-[18px] bg-surface-2 p-3.5 text-[13.5px]">
          <EyeOff className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-muted">
            {preview.hidden.length === 0 ? (
              'Nic se nebude skrývat.'
            ) : (
              <>
                Skryje se <strong className="text-fg">{preview.hidden.length}</strong> z {milestones.length} termínů: {reasons.slice(0, 4).join(', ')}
                {reasons.length > 4 ? ' a další' : ''}. Kdykoli je můžete znovu zobrazit.
              </>
            )}
          </p>
        </div>
      </div>
    </Modal>
  );
}
