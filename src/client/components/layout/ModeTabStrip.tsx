import type { RuleStageMode } from '../../../shared/automod';

interface ModeTabStripProps {
  mode: RuleStageMode;
  setMode: (mode: RuleStageMode) => void;
}

const MODES: { id: RuleStageMode; label: string; shortcut: string }[] = [
  { id: 'code', label: 'Code', shortcut: '⌘1' },
  { id: 'chat', label: 'Chat', shortcut: '⌘2' },
  { id: 'debug', label: 'Debugger', shortcut: '⌘4' },
  { id: 'wiki-history', label: 'Version History', shortcut: '⌘5' },
];

export function ModeTabStrip({ mode, setMode }: ModeTabStripProps) {
  return (
    <div className="h-10 flex items-center gap-1 px-4 bg-[--surface-1] border-b border-[--border] shrink-0 overflow-x-auto">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          className={cn(
            'relative px-3 py-2 text-sm font-medium transition-colors shrink-0 whitespace-nowrap',
            mode === m.id
              ? 'text-[--foreground]'
              : 'text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-3]'
          )}
        >
          {m.label}
          {mode === m.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[--primary]" />
          )}
          <span className="ml-2 text-[10px] text-[--subtle] hidden sm:inline">{m.shortcut}</span>
        </button>
      ))}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
