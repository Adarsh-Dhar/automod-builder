import { useState } from "react";
import type { HistorySnapshot } from "../utils/history";
import { deleteSnapshot, clearHistory, saveSnapshot } from "../utils/history";

interface HistoryPanelProps {
  snapshots: HistorySnapshot[];
  currentYaml: string;
  ruleCount: number;
  onRestore: (yaml: string) => void;
  onSnapshotsChange: (snapshots: HistorySnapshot[]) => void;
  onClose: () => void;
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function yamlPreview(yaml: string): string {
  return yaml
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .slice(0, 3)
    .join(" · ")
    .slice(0, 80);
}

export default function HistoryPanel({
  snapshots,
  currentYaml,
  ruleCount,
  onRestore,
  onSnapshotsChange,
  onClose,
}: HistoryPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const selectedSnap = snapshots.find((s) => s.id === selected) ?? null;

  const handleSaveNow = () => {
    const updated = saveSnapshot(currentYaml, ruleCount, "Manual save");
    onSnapshotsChange(updated);
  };

  const handleDelete = (id: string) => {
    const updated = deleteSnapshot(id);
    if (selected === id) setSelected(null);
    onSnapshotsChange(updated);
  };

  const handleClearAll = () => {
    clearHistory();
    onSnapshotsChange([]);
    setSelected(null);
    setConfirmClear(false);
  };

  return (
    <div className="w-full sm:w-[380px] md:w-[420px] border-l border-[#21262D] bg-[#090D13] flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#21262D] shrink-0">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-[#E6EDF3]">Version History</h2>
          <p className="text-xs text-[#484F58]">
            {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""} · auto-saved locally
          </p>
        </div>
        <button
          onClick={handleSaveNow}
          data-testid="btn-save-snapshot"
          className="text-xs bg-[#161B22] hover:bg-[#21262D] border border-[#21262D] text-[#E6EDF3] px-2.5 py-1.5 rounded-md transition-colors font-medium"
        >
          Save Now
        </button>
        <button
          onClick={onClose}
          className="text-[#484F58] hover:text-[#E6EDF3] transition-colors text-sm ml-1"
        >
          ✕
        </button>
      </div>

      {/* Split view: list + preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {snapshots.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <div className="text-3xl opacity-20">◷</div>
            <p className="text-sm text-[#484F58]">No snapshots yet</p>
            <p className="text-xs text-[#484F58]/70">
              Changes are auto-saved every 5 seconds of inactivity
            </p>
            <button
              onClick={handleSaveNow}
              className="text-sm bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold px-4 py-2 rounded-md transition-colors"
            >
              Save current state
            </button>
          </div>
        ) : (
          <>
            {/* Snapshot list */}
            <div className="overflow-auto" style={{ maxHeight: selected ? "45%" : "100%" }}>
              {snapshots.map((snap, idx) => {
                const isCurrent = snap.yaml === currentYaml;
                const isSelected = snap.id === selected;
                return (
                  <button
                    key={snap.id}
                    onClick={() => setSelected(isSelected ? null : snap.id)}
                    className={`w-full text-left px-4 py-3 border-b border-[#21262D]/60 transition-colors ${
                      isSelected
                        ? "bg-[#161B22]"
                        : "hover:bg-[#161B22]/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isCurrent
                            ? "bg-[#3FB950]"
                            : idx === 0
                            ? "bg-[#58A6FF]"
                            : "bg-[#484F58]"
                        }`}
                      />
                      <span className="text-xs font-semibold text-[#E6EDF3] flex-1 truncate">
                        {snap.label ?? `v${snapshots.length - idx}`}
                        {isCurrent && (
                          <span className="ml-1.5 text-[10px] text-[#3FB950] font-normal">
                            (current)
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-[#484F58] shrink-0">
                        {timeAgo(snap.savedAt)}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#58A6FF]/10 text-[#58A6FF] border border-[#58A6FF]/20 shrink-0">
                        {snap.ruleCount}R
                      </span>
                    </div>
                    <div className="text-[11px] text-[#484F58] mt-1 truncate ml-4 font-mono">
                      {yamlPreview(snap.yaml) || "—"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Preview pane for selected snapshot */}
            {selectedSnap && (
              <div className="flex-1 flex flex-col border-t border-[#21262D] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-[#090D13] shrink-0">
                  <span className="text-xs text-[#484F58] flex-1 truncate">
                    {new Date(selectedSnap.savedAt).toLocaleString()} ·{" "}
                    {selectedSnap.ruleCount} rule{selectedSnap.ruleCount !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => {
                      onRestore(selectedSnap.yaml);
                      setSelected(null);
                    }}
                    data-testid="btn-restore"
                    className="text-xs bg-[#FF4500] hover:bg-[#E03D00] text-white font-semibold px-2.5 py-1 rounded transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => handleDelete(selectedSnap.id)}
                    className="text-xs text-[#484F58] hover:text-[#F85149] transition-colors px-1"
                  >
                    Delete
                  </button>
                </div>
                <pre className="flex-1 overflow-auto px-4 py-3 text-[11px] font-mono text-[#3FB950] leading-relaxed bg-[#0D1117]">
                  {selectedSnap.yaml}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {snapshots.length > 0 && (
        <div className="shrink-0 px-4 py-2.5 border-t border-[#21262D] flex items-center gap-2">
          <span className="text-[10px] text-[#484F58] flex-1">
            Stored in browser localStorage · max 20 snapshots
          </span>
          {confirmClear ? (
            <>
              <span className="text-[10px] text-[#F85149]">Confirm?</span>
              <button
                onClick={handleClearAll}
                className="text-[10px] text-[#F85149] hover:underline font-semibold"
              >
                Yes, clear
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="text-[10px] text-[#484F58] hover:underline"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-[10px] text-[#484F58] hover:text-[#F85149] transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
