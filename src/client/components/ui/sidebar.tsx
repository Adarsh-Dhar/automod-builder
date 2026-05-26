import { Menu, X, Code, MessageSquare, Bug, History } from 'lucide-react';
import { useState } from 'react';
import type { RuleStageMode } from '../../../shared/automod';

interface SidebarProps {
  ruleName: string;
  isCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  mode: RuleStageMode;
  setMode: (mode: RuleStageMode) => void;
}

export function Sidebar({ ruleName, isCollapsed = false, onToggle, mode, setMode }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(isCollapsed);

  const handleToggle = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    onToggle?.(newState);
  };

  return (
    <div
      className={`flex flex-col bg-[var(--surface-1)] border-r border-[var(--border)] transition-all duration-300 shrink-0 ${
        collapsed ? 'w-16' : 'w-[220px]'
      }`}
    >
      {/* Logo / Brand Area */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-[var(--border)] shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center text-[var(--primary-foreground)] font-bold text-sm shrink-0">
              ⚙️
            </div>
            <span className="text-sm font-semibold text-[var(--foreground)] truncate">AutoMod</span>
          </div>
        )}
        <button
          onClick={handleToggle}
          className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <Menu size={18} /> : <X size={18} />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Current Rule */}
        <div className={`px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--primary)]/30 ${!collapsed ? 'block' : 'hidden'}`}>
          <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Active Rule</p>
          <p className="text-sm font-medium text-[var(--foreground)] truncate">{ruleName}</p>
        </div>

        {/* Mode Selection */}
        <div className={`mt-4 ${!collapsed ? 'block' : 'hidden'}`}>
          <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] px-3 mb-2">Mode</p>
          <SidebarItem
            icon={<Code size={18} />}
            label="Code"
            collapsed={collapsed}
            active={mode === 'code'}
            onClick={() => setMode('code')}
          />
          <SidebarItem
            icon={<MessageSquare size={18} />}
            label="Chat"
            collapsed={collapsed}
            active={mode === 'chat'}
            onClick={() => setMode('chat')}
          />
          <SidebarItem
            icon={<Bug size={18} />}
            label="Debugger"
            collapsed={collapsed}
            active={mode === 'debug'}
            onClick={() => setMode('debug')}
          />
          <SidebarItem
            icon={<History size={18} />}
            label="Version History"
            collapsed={collapsed}
            active={mode === 'wiki-history'}
            onClick={() => setMode('wiki-history')}
          />
        </div>
      </nav>

      {/* Footer Area */}
      <div className={`border-t border-[var(--border)] p-2 ${!collapsed ? 'block' : 'hidden'}`}>
        <div className="px-3 py-2 rounded-lg bg-[var(--surface-2)]">
          <p className="text-xs text-[var(--muted-foreground)] mb-1">Version</p>
          <p className="text-xs font-medium text-[var(--foreground)]">v1.0</p>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  collapsed,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        active
          ? 'bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30'
          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
      } ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? label : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}