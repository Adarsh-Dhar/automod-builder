import { Menu, X, Code, MessageSquare, Bug, History } from 'lucide-react';
import { useState } from 'react';
import type { RuleStageMode } from '../../../shared/automod';

interface SidebarProps {
  ruleName: string;
  isCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
  mode: RuleStageMode;
  setMode: (mode: RuleStageMode) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ ruleName, isCollapsed = false, onToggle, mode, setMode, isMobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(isCollapsed);

  const handleToggle = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    onToggle?.(newState);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}
      
      {/* Sidebar */}
      <div
        className={`flex flex-col bg-[--surface-1] border-r border-[--border] transition-all duration-300 shrink-0 fixed md:relative z-50 h-full ${
          collapsed ? 'w-20' : 'w-[220px]'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
      {/* Logo / Brand Area */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-[--border] shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[--primary] flex items-center justify-center text-[--primary-foreground] font-bold text-sm shrink-0">
              ⚙️
            </div>
            <span className="text-sm font-semibold text-[--foreground] truncate">AutoMod</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-[--primary] flex items-center justify-center text-[--primary-foreground] font-bold text-sm shrink-0">
            ⚙️
          </div>
        )}
        <button
          onClick={handleToggle}
          className="p-1 text-[--muted-foreground] hover:text-[--foreground] bg-transparent border-0 hidden md:block"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <Menu size={18} /> : <X size={18} />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Current Rule */}
        <div className={`px-3 py-2 rounded-lg bg-[--surface-2] border border-[--primary]/30 ${!collapsed ? 'block' : 'hidden'}`}>
          <p className="text-xs uppercase tracking-wider text-[--muted-foreground] mb-1">Active Rule</p>
          <p className="text-sm font-medium text-[--foreground] truncate">{ruleName}</p>
        </div>

        {/* Mode Selection */}
        <div className="mt-4">
          {!collapsed && <p className="text-xs uppercase tracking-wider text-[--muted-foreground] px-3 mb-2">Mode</p>}
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
      <div className={`border-t border-[--border] p-2 ${!collapsed ? 'block' : 'hidden'}`}>
        <div className="px-3 py-2 rounded-lg bg-[--surface-2]">
          <p className="text-xs text-[--muted-foreground] mb-1">Version</p>
          <p className="text-xs font-medium text-[--foreground]">v1.0</p>
        </div>
      </div>
      </div>
    </>
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
          ? 'bg-[--primary]/20 text-[--primary] border border-[--primary]/30'
          : 'text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-2]'
      } ${collapsed ? 'justify-center px-2' : ''}`}
      title={collapsed ? label : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}
