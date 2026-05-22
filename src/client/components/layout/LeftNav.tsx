import { Code, Shield, Layout, Clock, Key } from 'lucide-react';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { id: 'builder', icon: <Code className="w-5 h-5" />, label: 'Rule Builder', page: 'rule-stage' },
  { id: 'hub', icon: <Shield className="w-5 h-5" />, label: 'Hub', page: 'hub' },
  { id: 'feed', icon: <Layout className="w-5 h-5" />, label: 'Feed', page: 'feed' },
  { id: 'history', icon: <Clock className="w-5 h-5" />, label: 'History', page: 'history' },
];

interface LeftNavProps {
  activePage?: string;
  onPageChange?: (page: string) => void;
  onApiKeyClick?: () => void;
}

export function LeftNav({ activePage = 'rule-stage', onPageChange, onApiKeyClick }: LeftNavProps) {
  return (
    <div className="w-12 flex flex-col items-center py-3 bg-[#0A0812] border-r border-[rgba(255,255,255,0.06)] shrink-0 z-10">
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg bg-[#F5C842] flex items-center justify-center mb-6">
        <span className="text-[#0E0C14] font-bold text-sm">✳</span>
      </div>

      {/* Navigation Items */}
      <div className="flex flex-col gap-2 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.page;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange?.(item.page)}
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-all relative group',
                isActive
                  ? 'bg-[--surface-2] text-[--primary]'
                  : 'text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-3]'
              )}
              title={item.label}
            >
              {item.icon}
              {isActive && (
                <div className="absolute left-0 w-1 h-6 bg-[--primary] rounded-r-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div className="flex flex-col gap-2 mt-auto">
        <button
          onClick={onApiKeyClick}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-3] transition-all"
          title="API Key"
        >
          <Key className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-[--surface-2] flex items-center justify-center text-[--muted-foreground] text-xs font-medium">
          U
        </div>
      </div>
    </div>
  );
}
