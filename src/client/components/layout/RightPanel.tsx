import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { BlastRadiusResult } from '../../../shared/blast-types';

interface RightPanelProps {
  blast: BlastRadiusResult | null;
  blasting: boolean;
  saving: boolean;
  onRunBlast: () => void;
}

export function RightPanel({ blast, blasting, saving, onRunBlast }: RightPanelProps) {
  return (
    <div className="w-[340px] lg:w-[380px] hidden md:flex flex-col bg-[--surface-1] border-l border-[--border] shrink-0">
      {/* Section 1: Run Controls */}
      <div className="p-4 border-b border-[--border] flex gap-2 shrink-0">
        <Button
          onClick={onRunBlast}
          size="sm"
          disabled={blasting}
          className="flex-1 bg-[--primary] text-[--primary-foreground] hover:bg-[--primary]/90 font-semibold shadow-md hover:shadow-lg transition-all"
        >
          ⚡ {blasting ? 'Running...' : 'Blast Radius'}
        </Button>
      </div>

      {/* Section 2: Blast Radius */}
      <div className="p-4 border-b border-[--border] shrink-0">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-[--foreground]">Blast Radius</span>
          <Badge className="bg-[--info]/20 text-[--info] border border-[--info]/30 font-medium">Backtest</Badge>
        </div>
        {blast ? (
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-[--muted-foreground]">Posts tested</span>
              <span className="font-medium">{blast.totalTested}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[--muted-foreground]">Would catch</span>
              <span className="font-medium text-[--success]">{blast.caughtPosts?.length ?? 0}</span>
            </div>
            {blast.caughtPosts && blast.caughtPosts.length > 0 && (
              <div>
                <p className="text-xs text-[--muted-foreground] mb-2">Caught posts:</p>
                <div className="space-y-1">
                  {blast.caughtPosts.slice(0, 5).map((post) => (
                    <div key={post.id} className="text-xs text-[--success]/80 truncate">
                      ✓ {post.title} (u/{post.author})
                    </div>
                  ))}
                </div>
              </div>
            )}
            {blast.falsePositives.length > 0 && (
              <div>
                <p className="text-xs text-[--muted-foreground] mb-2">
                  False positives ({blast.falsePositives.length}):
                </p>
                <div className="space-y-1">
                  {blast.falsePositives.slice(0, 3).map((post) => (
                    <div key={post.id} className="text-xs text-[--danger]/80 truncate">
                      ✗ {post.title} (u/{post.author})
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-[--subtle]">Run blast radius to see backtest results</p>
        )}
      </div>

      {/* Section 3: Status */}
      <div className="flex-1 overflow-auto p-4">
        <span className="text-sm font-semibold text-[--foreground]">Status</span>
        <div className="mt-4 space-y-3">
          <div className="p-3.5 rounded-xl bg-[--surface-2] border border-[--border]">
            <p className="text-[10px] uppercase tracking-wider text-[--muted-foreground] font-semibold mb-1">Rule State</p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${saving ? 'bg-[--warning] animate-pulse' : 'bg-[--success]'}`}></div>
              <p className="text-sm font-medium text-[--foreground]">{saving ? 'Saving...' : 'Saved'}</p>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[--surface-2] border border-[--border]">
            <p className="text-[10px] uppercase tracking-wider text-[--muted-foreground] font-semibold mb-1">Debug Mode</p>
            <p className="text-sm text-[--foreground]">Test posts via link or mock</p>
          </div>
        </div>
      </div>
    </div>
  );
}
