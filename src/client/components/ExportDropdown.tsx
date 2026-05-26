import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export type ExportFormat = 'text' | 'json' | 'markdown';

interface ExportDropdownProps {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
  className?: string;
}

export default function ExportDropdown({ onExport, disabled = false, className = '' }: ExportDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} className={`text-sm font-medium ${className}`}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport('text')}>
          📄 Plain Text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('json')}>
          {`{}`} JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('markdown')}>
          📝 Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
