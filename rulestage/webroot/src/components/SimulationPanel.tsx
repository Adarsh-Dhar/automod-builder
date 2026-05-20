import React, { useEffect } from "react";
import type { AutomodAST, SimulationDiff, SimulationResult } from "../types";
import { generateMockPosts, runSimulation } from "../utils/simulator";

interface SimulationPanelProps {
  ast: AutomodAST;
  diff: SimulationDiff | null;
  isSimulating: boolean;
  onRunSimulation: () => void;
  onSimulationComplete: (diff: SimulationDiff) => void;
  onClose: () => void;
}

function ResultRow({ result }: { result: SimulationResult }) {
  const colorMap: Record<string, string> = {
    remove: "text-reddit-red",
    spam: "text-reddit-red",
    approve: "text-reddit-green",
    report: "text-reddit-yellow",
    lock: "text-reddit-yellow",
    none: "text-reddit-text-muted",
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b border-reddit-border/50 last:border-0 animate-fade-in">
      <span className={`text-xs font-mono shrink-0 ${colorMap[result.action] || "text-reddit-text-muted"} w-14`}>
        [{result.action}]
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-reddit-text-primary truncate">{result.postTitle}</div>
        <div className="text-[10px] text-reddit-text-muted mt-0.5">
          u/{result.postAuthor}
          {result.reasons.length > 0 && (
            <span className="ml-2 text-reddit-text-muted/70 truncate">{result.reasons[0]}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SimulationPanel({
  ast,
  diff,
  isSimulating,
  onRunSimulation,
  onSimulationComplete,
  onClose,
}: SimulationPanelProps) {
  useEffect(() => {
    if (isSimulating) {
      setTimeout(() => {
        const posts = generateMockPosts(1000);
        const result = runSimulation(ast, posts);
        onSimulationComplete(result);
      }, 800);
    }
  }, [isSimulating]);

  const [activeTab, setActiveTab] = React.useState<"removed" | "reported" | "approved" | "untouched">("removed");

  const tabData = diff
    ? {
        removed: diff.removed,
        reported: diff.reported,
        approved: diff.approved,
        untouched: diff.untouched,
      }
    : null;

  return (
    <div className="w-[420px] border-l border-reddit-border bg-reddit-darker flex flex-col shrink-0 animate-slide-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-reddit-border shrink-0">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-reddit-text-primary">Dry Run Simulator</h2>
          <p className="text-xs text-reddit-text-muted">1,000 mock posts</p>
        </div>
        <button
          onClick={onRunSimulation}
          disabled={isSimulating || ast.length === 0}
          className="btn-primary text-xs py-1.5 px-3 disabled:opacity-40"
        >
          {isSimulating ? "Running..." : "Run Simulation"}
        </button>
        <button onClick={onClose} className="text-reddit-text-muted hover:text-reddit-text-primary transition-colors text-sm">
          ✕
        </button>
      </div>

      {/* Loading */}
      {isSimulating && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-reddit-orange thinking-dot" />
            <span className="w-2 h-2 rounded-full bg-reddit-orange thinking-dot" />
            <span className="w-2 h-2 rounded-full bg-reddit-orange thinking-dot" />
          </div>
          <p className="text-sm text-reddit-text-muted">Evaluating 1,000 posts...</p>
        </div>
      )}

      {/* No rules */}
      {!isSimulating && ast.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="text-3xl opacity-30">◎</div>
          <p className="text-sm text-reddit-text-muted">Add some rules first, then run the simulation</p>
        </div>
      )}

      {/* No results yet */}
      {!isSimulating && !diff && ast.length > 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="text-3xl opacity-30">▷</div>
          <p className="text-sm text-reddit-text-muted">
            Click "Run Simulation" to test your {ast.length} rule{ast.length !== 1 ? "s" : ""} against 1,000 mock posts
          </p>
          <button onClick={onRunSimulation} className="btn-primary">
            Run Simulation
          </button>
        </div>
      )}

      {/* Results */}
      {!isSimulating && diff && tabData && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-px bg-reddit-border shrink-0">
            {[
              { key: "removed", label: "Removed", count: diff.removed.length, color: "reddit-red" },
              { key: "reported", label: "Reported", count: diff.reported.length, color: "reddit-yellow" },
              { key: "approved", label: "Approved", count: diff.approved.length, color: "reddit-green" },
              { key: "untouched", label: "Passed", count: diff.untouched.length, color: "reddit-text-muted" },
            ].map((stat) => (
              <button
                key={stat.key}
                onClick={() => setActiveTab(stat.key as typeof activeTab)}
                className={`p-3 text-center transition-colors ${
                  activeTab === stat.key
                    ? "bg-reddit-dark"
                    : "bg-reddit-darker hover:bg-reddit-card"
                }`}
              >
                <div className={`text-lg font-bold text-${stat.color}`}>{stat.count}</div>
                <div className="text-[10px] text-reddit-text-muted">{stat.label}</div>
              </button>
            ))}
          </div>

          {/* Hit rate */}
          <div className="px-4 py-2 border-b border-reddit-border shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-reddit-text-muted">Rule hit rate</span>
              <span className="text-xs font-mono text-reddit-text-primary">
                {(((diff.removed.length + diff.reported.length + diff.approved.length) / diff.totalPosts) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 bg-reddit-dark rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-reddit-orange to-reddit-red rounded-full transition-all"
                style={{
                  width: `${((diff.removed.length + diff.reported.length + diff.approved.length) / diff.totalPosts) * 100}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-reddit-text-muted mt-1.5">
              Simulated at {new Date(diff.runAt).toLocaleTimeString()}
            </p>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-auto px-4 py-2">
            {tabData[activeTab].length === 0 ? (
              <div className="text-center py-8 text-xs text-reddit-text-muted italic">
                No posts in this category
              </div>
            ) : (
              tabData[activeTab].slice(0, 50).map((r) => (
                <ResultRow key={r.postId} result={r} />
              ))
            )}
            {tabData[activeTab].length > 50 && (
              <div className="text-center py-2 text-xs text-reddit-text-muted">
                +{tabData[activeTab].length - 50} more
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
