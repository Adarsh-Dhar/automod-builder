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
    <div className="w-[340px] lg:w-[340px] md:w-[300px] hidden md:flex flex-col bg-[--surface-1] border-l border-[--border] shrink-0">
      {/* Section 1: Run Controls */}
      <div className="p-3 border-b border-[--border] flex gap-2 shrink-0">
        <Button
          onClick={onRunBlast}
          size="sm"
          disabled={blasting}
          className="flex-1 bg-[--info]/15 text-[--info] border border-[--info]/30 hover:bg-[--info]/25"
        >
          ⚡ {blasting ? 'Running...' : 'Blast Radius'}
        </Button>
      </div>

      {/* Section 2: Blast Radius */}
      <div className="p-4 border-b border-[--border] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-[--foreground]">Blast Radius</span>
          <Badge className="bg-[--info]/15 text-[--info] border-[--info]/25">Backtest</Badge>
        </div>
        {blast ? (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[--muted-foreground]">Catch Rate</span>
                <span className="text-[--foreground] font-medium">{(blast.catchRate * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-[--surface-3] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[--info] rounded-full"
                  style={{ width: `${blast.catchRate * 100}%` }}
                />
              </div>
            </div>
            {blast.falsePositives.length > 0 && (
              <div>
                <p className="text-xs text-[--muted-foreground] mb-2">False Positives:</p>
                <div className="space-y-1">
                  {blast.falsePositives.slice(0, 3).map((post) => (
                    <div key={post.id} className="text-xs text-[--subtle] truncate">
                      • {post.title} (u/{post.author})
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="text-3xl opacity-20 mb-2">⚡</div>
            <p className="text-xs text-[--subtle]">Run blast radius to see backtest results</p>
          </div>
        )}
      </div>

      {/* Section 3: Status */}
      <div className="flex-1 overflow-auto p-4">
        <span className="text-sm font-medium text-[--foreground]">Status</span>
        <div className="mt-3 space-y-2">
          <div className="p-3 rounded-lg bg-[--surface-2]">
            <p className="text-[10px] uppercase tracking-wider text-[--muted-foreground]">Rule State</p>
            <p className="text-sm text-[--foreground]">{saving ? 'Saving...' : 'Saved'}</p>
          </div>
          <div className="p-3 rounded-lg bg-[--surface-2]">
            <p className="text-[10px] uppercase tracking-wider text-[--muted-foreground]">Debug Mode</p>
            <p className="text-sm text-[--foreground]">Test posts via link or mock</p>
          </div>
        </div>
      </div>
    </div>
  );
}
