import { Sidebar } from './Sidebar';
import type { RuleStageMode } from '../../../shared/automod';

interface WorkspaceShellProps {
  children: React.ReactNode;
  ruleName?: string;
  mode?: RuleStageMode;
  setMode?: (mode: RuleStageMode) => void;
}

export function WorkspaceShell({ children, ruleName = 'Untitled Rule', mode = 'code', setMode }: WorkspaceShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar ruleName={ruleName} mode={mode} setMode={setMode || (() => {})} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}