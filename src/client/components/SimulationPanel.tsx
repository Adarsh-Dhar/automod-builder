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

function ResultRow({ result }: { result: SimulationResult }) {
  const colorMap: Record<string, string> = {
    remove: "#F85149",
    spam: "#F85149",
    approve: "#3FB950",
    report: "#D29922",
    lock: "#D29922",
    none: "#484F58",
  };
  const color = colorMap[result.action] || "#484F58";

  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#21262D]/50 last:border-0">
      <span className="text-xs font-mono shrink-0 w-14" style={{ color }}>
        [{result.action}]
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#E6EDF3] truncate">{result.postTitle}</div>
        <div className="text-[10px] text-[#484F58] mt-0.5 truncate">
          u/{result.postAuthor}
          {result.reasons[0] && (
            <span className="ml-2 text-[#484F58]/70">{result.reasons[0]}</span>
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

  const TABS: { key: TabKey; label: string; color: string }[] = [
    { key: "removed", label: "Removed", color: "#F85149" },
    { key: "reported", label: "Reported", color: "#D29922" },
    { key: "approved", label: "Approved", color: "#3FB950" },
    { key: "untouched", label: "Passed", color: "#484F58" },
  ];

  return (
    <div className="w-[400px] border-l border-[#21262D] bg-[#090D13] flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#21262D] shrink-0">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-[#E6EDF3]">Dry Run</h2>
          <p className="text-xs text-[#484F58]">1,000 mock posts</p>
        </div>
        <button
          onClick={onRunSimulation}
          disabled={isSimulating || ast.length === 0}
          data-testid="btn-run-sim"
          className="text-xs bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
        >
          {isSimulating ? "Running..." : "Run"}
        </button>
        <button
          onClick={onClose}
          className="text-[#484F58] hover:text-[#E6EDF3] transition-colors text-sm"
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
                className="w-2 h-2 rounded-full bg-[#FF4500]"
                style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
          <p className="text-sm text-[#484F58]">Evaluating 1,000 posts...</p>
        </div>
      )}

      {!isSimulating && ast.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="text-3xl opacity-20">◎</div>
          <p className="text-sm text-[#484F58]">Add some rules first</p>
        </div>
      )}

      {!isSimulating && !diff && ast.length > 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="text-3xl opacity-20">▷</div>
          <p className="text-sm text-[#484F58]">
            Test your {ast.length} rule{ast.length !== 1 ? "s" : ""} against 1,000 mock posts
          </p>
          <button
            onClick={onRunSimulation}
            className="text-sm bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold px-4 py-2 rounded-md transition-colors"
          >
            Run Simulation
          </button>
        </div>
      )}

      {!isSimulating && diff && tabData && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-px bg-[#21262D] shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`p-3 text-center transition-colors ${
                  activeTab === tab.key ? "bg-[#0D1117]" : "bg-[#090D13] hover:bg-[#161B22]"
                }`}
              >
                <div
                  className="text-lg font-bold"
                  style={{ color: tab.color }}
                >
                  {tabData[tab.key].length}
                </div>
                <div className="text-[10px] text-[#484F58]">{tab.label}</div>
              </button>
            ))}
          </div>

          {/* Hit rate bar */}
          <div className="px-4 py-2.5 border-b border-[#21262D] shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[#484F58]">Hit rate</span>
              <span className="text-xs font-mono text-[#E6EDF3]">
                {(
                  ((diff.removed.length + diff.reported.length + diff.approved.length) /
                    diff.totalPosts) *
                  100
                ).toFixed(1)}
                %
              </span>
            </div>
            <div className="h-1.5 bg-[#161B22] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF4500] to-[#F85149] rounded-full transition-all"
                style={{
                  width: `${
                    ((diff.removed.length + diff.reported.length + diff.approved.length) /
                      diff.totalPosts) *
                    100
                  }%`,
                }}
              />
            </div>
            <p className="text-[10px] text-[#484F58] mt-1.5">
              Run at {new Date(diff.runAt).toLocaleTimeString()}
            </p>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-auto px-4 py-2">
            {tabData[activeTab].length === 0 ? (
              <div className="text-center py-8 text-xs text-[#484F58] italic">
                No posts in this category
              </div>
            ) : (
              tabData[activeTab].slice(0, 50).map((r) => (
                <ResultRow key={r.postId} result={r} />
              ))
            )}
            {tabData[activeTab].length > 50 && (
              <div className="text-center py-2 text-xs text-[#484F58]">
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
