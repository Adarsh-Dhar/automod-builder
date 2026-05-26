import './index.css';
import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen } from 'lucide-react';

export const Splash = () => {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-[--background] px-4">
      {/* Top glow */}
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,107,53,0.15),transparent_65%)] pointer-events-none" />

      {/* Icon */}
      <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-[--border] bg-[--surface-1] text-[--primary] shadow-2xl shadow-black/20 backdrop-blur-sm">
        <BookOpen className="h-12 w-12" />
      </div>

      {/* Heading */}
      <div className="relative max-w-xs space-y-2 text-center text-[--foreground]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[--muted-foreground]">RuleStage</p>
        <h1 className="text-4xl font-extrabold tracking-tight">
          Automod Builder
        </h1>
        <p className="mx-auto max-w-64 text-sm text-[--muted-foreground] leading-relaxed">
          Build, stage, and dry-run Automod rules with a code, drag, and chat workflow.
        </p>
      </div>

      {/* CTA card */}
      <div className="relative w-full max-w-xs rounded-3xl border border-[--border] bg-[--surface-1] p-4 shadow-2xl shadow-black/15 backdrop-blur-sm">
        <button
          className="flex h-12 w-full items-center justify-center rounded-full bg-[--primary] text-base font-bold text-[--primary-foreground] shadow-lg shadow-black/10 transition-all active:scale-[0.98] hover:bg-[--primary]/90"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Open RuleStage
        </button>
      </div>

      <p className="relative text-center text-xs text-[--subtle]">
        Takes a moment to open the full builder experience.
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);