import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Download, Copy, Check, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import type { AutomodAction } from '../../../shared/automod';

interface PageTopbarProps {
  ruleName: string;
  action: AutomodAction;
  saving: boolean;
  yaml: string;
  ruleCount: number;
  onReset: () => void;
  onActionChange: (action: AutomodAction) => void;
}

export function PageTopbar({ ruleName, action, saving, yaml, ruleCount, onReset, onActionChange }: PageTopbarProps) {
  const actions: AutomodAction[] = ['remove', 'report', 'approve'];
  const [exportOpen, setExportOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    if (exportOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = yaml;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    }
    setExportOpen(false);
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'automoderator-config.yaml';
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const getNextAction = (current: AutomodAction): AutomodAction => {
    const currentIndex = actions.indexOf(current);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % actions.length;
    return actions[nextIndex] as AutomodAction;
  };

  const getActionColor = (act: AutomodAction) => {
    switch (act) {
      case 'remove':
        return { bg: 'var(--danger)/15', text: 'var(--danger)', border: 'var(--danger)/25' };
      case 'report':
        return { bg: 'var(--warning)/15', text: 'var(--warning)', border: 'var(--warning)/25' };
      case 'approve':
        return { bg: 'var(--success)/15', text: 'var(--success)', border: 'var(--success)/25' };
    }
  };

  const colors = getActionColor(action);

  return (
    <div className="h-12 flex items-center justify-between px-3 md:px-4 bg-[--surface-1] border-b border-[--border] shrink-0">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-[--muted-foreground] hidden sm:inline">Rule Builder</span>
        <span className="text-[--subtle] hidden sm:inline">/</span>
        <span className="text-[--foreground] font-medium truncate">{ruleName}</span>
      </div>

      {/* Center: Action Badge */}
      <button
        onClick={() => onActionChange(getNextAction(action))}
        className="px-2 sm:px-3 py-1 rounded-md text-xs font-medium border transition-colors hover:opacity-80 shrink-0"
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          borderColor: colors.border,
        }}
      >
        {action}
      </button>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        {saving && (
          <RefreshCw className="w-4 h-4 text-[--muted-foreground] animate-spin shrink-0" />
        )}
        
        {/* Export Dropdown */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <Button
            onClick={() => setExportOpen((o) => !o)}
            disabled={ruleCount === 0}
            variant="ghost"
            size="sm"
            className="text-xs text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-3] disabled:opacity-40 disabled:cursor-not-allowed px-2"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Export</span>
            <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
          </Button>

          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[#1E192B] border border-[rgba(255,255,255,0.08)] rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.08)]">
                <p className="text-[10px] text-[#8B7FA8] font-semibold uppercase tracking-wider">
                  Export {ruleCount} rule{ruleCount !== 1 ? 's' : ''}
                </p>
              </div>

              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#261F36] transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-md bg-[#3B82F6]/10 border border-[#3B82F6]/20 flex items-center justify-center shrink-0">
                  {copyState === 'copied' ? (
                    <Check className="w-4 h-4 text-[#3FB950]" />
                  ) : (
                    <Copy className="w-4 h-4 text-[#3B82F6]" />
                  )}
                </div>
                <div>
                  <div className={`text-sm font-medium ${copyState === 'copied' ? 'text-[#3FB950]' : 'text-[#EDE8F5]'}`}>
                    {copyState === 'copied' ? 'Copied!' : 'Copy to Clipboard'}
                  </div>
                  <div className="text-[10px] text-[#8B7FA8]">Paste into Reddit's AutoMod wiki</div>
                </div>
              </button>

              <button
                onClick={handleDownload}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#261F36] transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-md bg-[#3FB950]/10 border border-[#3FB950]/20 flex items-center justify-center shrink-0">
                  <Download className="w-4 h-4 text-[#3FB950]" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[#EDE8F5]">Download .yaml</div>
                  <div className="text-[10px] text-[#8B7FA8]">automoderator-config.yaml</div>
                </div>
              </button>

              <div className="px-3 py-2 border-t border-[rgba(255,255,255,0.08)] bg-[#261F36]">
                <p className="text-[10px] text-[#8B7FA8] leading-relaxed">
                  Paste into <span className="font-mono">r/yoursubreddit/wiki/config/automoderator</span>
                </p>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-xs text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-3] px-2 hidden sm:inline"
        >
          Reset
        </Button>
        <span className="text-[10px] text-[--subtle] hidden sm:inline">Ctrl+S to save</span>
      </div>
    </div>
  );
}
