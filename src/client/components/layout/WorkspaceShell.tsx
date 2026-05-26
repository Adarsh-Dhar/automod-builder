import { Sidebar } from './Sidebar';

interface WorkspaceShellProps {
  children: React.ReactNode;
  ruleName?: string;
}

export function WorkspaceShell({ children, ruleName = 'Untitled Rule' }: WorkspaceShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[--background]">
      <Sidebar ruleName={ruleName} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
