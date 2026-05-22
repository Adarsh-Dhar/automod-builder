import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { BlastRadiusResult } from '../../../shared/blast-types';

interface RightPanelProps {
  simulation: {
    removed: number;
    approved: number;
    reported: number;
    matched: number;
    items: Array<{ id: string; title: string; author: string; outcome: string; reason: string }>;
  };
  blast: BlastRadiusResult | null;
  blasting: boolean;
  saving: boolean;
  onRunSimulation: () => void;
  onRunBlast: () => void;
}

export function RightPanel({ simulation, blast, blasting, saving, onRunSimulation, onRunBlast }: RightPanelProps) {
  return (
    <div className="w-[340px] lg:w-[340px] md:w-[300px] hidden md:flex flex-col bg-[--surface-1] border-l border-[--border] shrink-0">
      {/* Section 1: Run Controls */}
      <div className="p-3 border-b border-[--border] flex gap-2 shrink-0">
        <Button
          onClick={onRunSimulation}
          size="sm"
          className="flex-1 bg-[--success]/15 text-[--success] border border-[--success]/30 hover:bg-[--success]/25"
        >
          ▶ Simulate
        </Button>
        <Button
          onClick={onRunBlast}
          size="sm"
          disabled={blasting}
          className="flex-1 bg-[--info]/15 text-[--info] border border-[--info]/30 hover:bg-[--info]/25"
        >
          ⚡ {blasting ? 'Running...' : 'Blast'}
        </Button>
      </div>

      {/* Section 2: Simulation Stats */}
      <div className="p-4 border-b border-[--border] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-[--foreground]">Simulation Stats</span>
          <Badge className="bg-[--success]/15 text-[--success] border-[--success]/25">Dry run</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-[--surface-2]">
            <p className="text-[10px] uppercase tracking-wider text-[--muted-foreground]">Removed</p>
            <p className="text-xl font-semibold text-[--foreground]">{simulation.removed}</p>
          </div>
          <div className="p-3 rounded-lg bg-[--surface-2]">
            <p className="text-[10px] uppercase tracking-wider text-[--muted-foreground]">Approved</p>
            <p className="text-xl font-semibold text-[--foreground]">{simulation.approved}</p>
          </div>
          <div className="p-3 rounded-lg bg-[--surface-2]">
            <p className="text-[10px] uppercase tracking-wider text-[--muted-foreground]">Reported</p>
            <p className="text-xl font-semibold text-[--foreground]">{simulation.reported}</p>
          </div>
          <div className="p-3 rounded-lg bg-[--surface-2]">
            <p className="text-[10px] uppercase tracking-wider text-[--muted-foreground]">Matched</p>
            <p className="text-xl font-semibold text-[--foreground]">{simulation.matched}</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-[--subtle]">{saving ? 'Saving rule...' : 'Simulation state is saved.'}</p>
      </div>

      {/* Section 3: Blast Radius */}
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

      {/* Section 4: Recent Items */}
      <div className="flex-1 overflow-auto p-4">
        <span className="text-sm font-medium text-[--foreground]">Recent Items</span>
        <div className="mt-3 space-y-2">
          {simulation.items.length === 0 ? (
            <p className="text-xs text-[--subtle]">No simulation items yet.</p>
          ) : (
            simulation.items.slice(0, 20).map((item) => (
              <div
                key={item.id}
                className="p-2 rounded-lg bg-[--surface-2] border-l-2 border-[--border]"
                style={{
                  borderLeftColor:
                    item.outcome === 'remove'
                      ? 'var(--danger)'
                      : item.outcome === 'report'
                        ? 'var(--warning)'
                        : 'var(--success)',
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[--foreground] truncate">{item.title}</p>
                    <p className="text-[10px] text-[--muted-foreground]">u/{item.author}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] capitalize"
                    style={{
                      borderColor:
                        item.outcome === 'remove'
                          ? 'var(--danger)/30'
                          : item.outcome === 'report'
                            ? 'var(--warning)/30'
                            : 'var(--success)/30',
                      color:
                        item.outcome === 'remove'
                          ? 'var(--danger)'
                          : item.outcome === 'report'
                            ? 'var(--warning)'
                            : 'var(--success)',
                    }}
                  >
                    {item.outcome}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
