interface EmptyStateProps {
  className?: string;
}

export default function EmptyState({ className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center h-full text-center py-12 ${className}`}>
      <div className="text-6xl mb-4">🤖</div>
      <h3 className="text-lg font-semibold text-[#EDE8F5] mb-2">AI Rules Assistant</h3>
      <p className="text-sm text-[#8B7FA8] max-w-md">
        Ask me to create AutoModerator rules, debug posts, or improve your moderation workflow.
      </p>
      <div className="mt-6 text-xs text-[#5A5070]">
        Try: "Create a spam filter for new accounts" or "Why was my post removed?"
      </div>
    </div>
  );
}
