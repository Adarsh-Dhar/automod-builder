import { useEffect, useState } from "react";
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

type TabKey = "removed" | "reported" | "approved" | "untouched";

function getActionColor(action: string): string {
  switch (action) {
    case 'remove':
    case 'spam':
      return 'text-red-500';
    case 'approve':
      return 'text-emerald-500';
    case 'report':
    case 'lock':
      return 'text-amber-500';
    default:
      return 'text-slate-500';
  }
}

function ResultRow({ result }: { result: SimulationResult }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/10 last:border-0">
      <span className={`text-xs font-mono shrink-0 w-14 ${getActionColor(result.action)}`}>
        [{result.action}]
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-100 truncate">{result.postTitle}</div>
        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
          u/{result.postAuthor}
          {result.reasons[0] && (
            <span className="ml-2 text-slate-500">{result.reasons[0]}</span>
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
  const [activeTab, setActiveTab] = useState<TabKey>("removed");

  useEffect(() => {
    if (!isSimulating) return undefined;
    let cancelled = false;

    const runRemoteSimulation = async () => {
      try {
        const response = await fetch('/api/rule-stage/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rule: ast }),
        });

        if (!response.ok) throw new Error('Simulation API failed');

        const data = (await response.json()) as { status: string; simulation?: any };
        if (cancelled) return;
        if (data && data.simulation) {
          onSimulationComplete(data.simulation as SimulationDiff);
          return;
        }
      } catch {
        // fallback to local simulation if API is unavailable
      }

      if (cancelled) return;
      const posts = generateMockPosts(1000);
      const result = runSimulation(ast, posts);
      onSimulationComplete(result);
    };

    void runRemoteSimulation();

    return () => {
      cancelled = true;
    };
  }, [isSimulating, ast, onSimulationComplete]);

  const tabData = diff
    ? {
        removed: diff.removed,
        reported: diff.reported,
        approved: diff.approved,
        untouched: diff.untouched,
      }
    : null;

  const TABS: { key: TabKey; label: string }[] = [
    { key: "removed", label: "Removed" },
    { key: "reported", label: "Reported" },
    { key: "approved", label: "Approved" },
    { key: "untouched", label: "Passed" },
  ];

  return (
    <div className="w-full sm:w-[350px] md:w-[400px] border-l border-white/10 bg-slate-950 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-100">Dry Run</h2>
          <p className="text-xs text-slate-400">1,000 mock posts</p>
        </div>
        <button
          onClick={onRunSimulation}
          disabled={isSimulating || ast.length === 0}
          data-testid="btn-run-sim"
          className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
        >
          {isSimulating ? "Running..." : "Run"}
        </button>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 transition-colors text-sm"
        >
          ✕
        </button>
      </div>

      {isSimulating && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-orange-500"
                style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
          <p className="text-sm text-slate-400">Evaluating 1,000 posts...</p>
        </div>
      )}

      {!isSimulating && ast.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="text-3xl opacity-20">◎</div>
          <p className="text-sm text-slate-400">Add some rules first</p>
        </div>
      )}

      {!isSimulating && !diff && ast.length > 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="text-3xl opacity-20">▷</div>
          <p className="text-sm text-slate-400">
            Test your {ast.length} rule{ast.length !== 1 ? "s" : ""} against 1,000 mock posts
          </p>
          <button
            onClick={onRunSimulation}
            className="text-sm bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-md transition-colors"
          >
            Run Simulation
          </button>
        </div>
      )}

      {!isSimulating && diff && tabData && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-px bg-slate-900 shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`p-3 text-center transition-colors rounded-lg ${
                  activeTab === tab.key ? "bg-slate-950" : "bg-slate-900 hover:bg-slate-800"
                }`}
              >
                <div
                  className={`text-lg font-bold ${
                    tab.key === 'removed' ? 'text-red-500' :
                    tab.key === 'reported' ? 'text-amber-500' :
                    tab.key === 'approved' ? 'text-emerald-500' :
                    'text-slate-500'
                  }`}
                >
                  {tabData[tab.key].length}
                </div>
                <div className="text-xs text-slate-400">{tab.label}</div>
              </button>
            ))}
          </div>

          {/* Hit rate bar */}
          <div className="px-4 py-2.5 border-b border-white/10 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">Hit rate</span>
              <span className="text-xs font-mono text-slate-100">
                {(
                  ((diff.removed.length + diff.reported.length + diff.approved.length) /
                    diff.totalPosts) *
                  100
                ).toFixed(1)}
                %
              </span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all"
                style={{
                  width: `${
                    ((diff.removed.length + diff.reported.length + diff.approved.length) /
                      diff.totalPosts) *
                    100
                  }%`,
                }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Run at {new Date(diff.runAt).toLocaleTimeString()}
            </p>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-auto px-4 py-2">
            {tabData[activeTab].length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 italic">
                No posts in this category
              </div>
            ) : (
              tabData[activeTab].slice(0, 50).map((r) => (
                <ResultRow key={r.postId} result={r} />
              ))
            )}
            {tabData[activeTab].length > 50 && (
              <div className="text-center py-2 text-xs text-slate-400">
                +{tabData[activeTab].length - 50} more
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}
