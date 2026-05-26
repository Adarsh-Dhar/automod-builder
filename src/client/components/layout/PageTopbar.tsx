import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

interface PageTopbarProps {
  ruleName: string;
  saving: boolean;
  onReset: () => void;
  onOpenHistory?: () => void;
}

export function PageTopbar({ ruleName, saving, onReset, onOpenHistory }: PageTopbarProps) {

  return (
    <div className="h-14 flex items-center justify-between px-4 md:px-6 bg-[--surface-1] border-b border-[--border] shrink-0 shadow-sm">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-3 text-sm min-w-0">
        <span className="text-[--muted-foreground] text-xs uppercase tracking-wider hidden sm:inline font-medium">Rule Builder</span>
        <span className="text-[--border] hidden sm:inline">/</span>
        <span className="text-[--foreground] font-semibold truncate text-base">{ruleName}</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {saving && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[--primary]/10">
            <RefreshCw className="w-4 h-4 text-[--primary] animate-spin shrink-0" />
            <span className="text-xs text-[--primary] font-medium">Saving...</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenHistory}
          className="text-xs text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-2] px-3 hidden sm:inline font-medium"
        >
          History
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-xs text-[--muted-foreground] hover:text-[--danger] hover:bg-[--danger]/10 px-3 hidden sm:inline font-medium"
        >
          Reset
        </Button>
        <span className="text-[10px] text-[--subtle] hidden md:inline">Ctrl+S</span>
      </div>
    </div>
  );
}
