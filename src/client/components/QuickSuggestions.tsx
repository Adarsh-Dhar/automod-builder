interface QuickSuggestionsProps {
  onSelectSuggestion: (suggestion: string) => void;
  className?: string;
}

const SUGGESTIONS = [
  'Create spam filter rule',
  'Best practices for moderation',
  'Reduce false positives',
  'Improve performance',
];

export default function QuickSuggestions({ onSelectSuggestion, className = '' }: QuickSuggestionsProps) {
  return (
    <div className={`flex flex-wrap gap-2 mb-3 ${className}`}>
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelectSuggestion(suggestion)}
          className="px-3 py-1.5 text-xs rounded-full border border-[--border] bg-[--surface-3] text-[--muted-foreground] hover:border-[--primary]/50 hover:text-[--primary] transition-colors"
        >
          💡 {suggestion}
        </button>
      ))}
    </div>
  );
}
