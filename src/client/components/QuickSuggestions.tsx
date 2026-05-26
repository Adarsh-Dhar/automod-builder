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
          className="px-3 py-1.5 text-xs rounded-full border border-[rgba(255,255,255,0.08)] bg-[#261F36] text-[#8B7FA8] hover:border-[#F5C842]/50 hover:text-[#F5C842] transition-colors"
        >
          💡 {suggestion}
        </button>
      ))}
    </div>
  );
}
