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
    <div className="h-12 flex items-center gap-2 px-4 md:px-6 bg-[--surface-1] border-b border-[--border] shrink-0 overflow-x-auto shadow-sm">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          className={cn(
            'relative px-3 md:px-4 py-2.5 text-sm font-semibold transition-all shrink-0 whitespace-nowrap rounded-lg',
            mode === m.id
              ? 'text-[--primary] bg-[--primary]/10 border border-[--primary]/30'
              : 'text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-2]'
          )}
        >
          {m.label}
          {mode === m.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-[--primary]" />
          )}
          <span className="ml-2 text-[9px] text-[--subtle] hidden lg:inline">{m.shortcut}</span>
        </button>
      ))}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
