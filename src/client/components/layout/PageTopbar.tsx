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
    <div className="h-12 flex items-center justify-between px-3 md:px-4 bg-[--surface-1] border-b border-[--border] shrink-0">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-[--muted-foreground] hidden sm:inline">Rule Builder</span>
        <span className="text-[--subtle] hidden sm:inline">/</span>
        <span className="text-[--foreground] font-medium truncate">{ruleName}</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        {saving && (
          <RefreshCw className="w-4 h-4 text-[--primary] animate-spin shrink-0" />
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenHistory}
          className="text-xs text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-3] px-3 hidden sm:inline"
        >
          History
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-xs text-[--muted-foreground] hover:text-[--danger] hover:bg-[--danger]/10 px-3 hidden sm:inline"
        >
          Reset
        </Button>
        <span className="text-[10px] text-[--subtle] hidden sm:inline">Ctrl+S to save</span>
      </div>
    </div>
  );
}
