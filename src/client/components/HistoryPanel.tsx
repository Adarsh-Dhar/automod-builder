import { useState, useEffect } from "react";
import type { HistorySnapshot } from "../utils/history";
import { deleteSnapshot, clearHistory, saveSnapshot } from "../utils/history";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

// Add new interface for wiki revisions
interface WikiRevision {
  timestamp: number;
  author: string;
  reason?: string;
}

interface HistoryPanelProps {
  open: boolean;
  snapshots: HistorySnapshot[];
  currentYaml: string;
  ruleCount: number;
  onRestore: (yaml: string) => void;
  onSnapshotsChange: (snapshots: HistorySnapshot[]) => void;
  onOpenChange: (open: boolean) => void;
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
  open,
  snapshots,
  currentYaml,
  ruleCount,
  onRestore,
  onSnapshotsChange,
  onOpenChange,
}: HistoryPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [activeTab, setActiveTab] = useState<"local" | "wiki">("local");
  const [wikiRevisions, setWikiRevisions] = useState<WikiRevision[]>([]);
  const [loadingWiki, setLoadingWiki] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);

  const selectedSnap = snapshots.find((s) => s.id === selected) ?? null;

  // Load wiki revisions when tab is opened
  useEffect(() => {
    if (open && activeTab === "wiki" && wikiRevisions.length === 0) {
      void fetchWikiRevisions();
    }
  }, [open, activeTab, wikiRevisions.length]);

  const fetchWikiRevisions = async () => {
    setLoadingWiki(true);
    setWikiError(null);
    try {
      const response = await fetch("/api/rule-stage/wiki-revisions");
      const data = await response.json();

      if (data.status === "success") {
        setWikiRevisions(data.revisions || []);
      } else {
        setWikiError(data.message || "Failed to load wiki revisions");
      }
    } catch (error) {
      setWikiError(
        error instanceof Error ? error.message : "Failed to load wiki revisions"
      );
      console.error("Failed to fetch wiki revisions:", error);
    } finally {
      setLoadingWiki(false);
    }
  };

  const handleSaveNow = () => {
    const updated = saveSnapshot(currentYaml, ruleCount, "Manual save", 'code');
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[400px] bg-[--surface-2] border-[--border]">
        <SheetHeader>
          <SheetTitle className="text-[--foreground]">Version History</SheetTitle>
          <SheetDescription className="text-[--muted-foreground]">
            {activeTab === "local"
              ? `${snapshots.length} snapshot${snapshots.length !== 1 ? "s" : ""} · auto-saved locally`
              : `${wikiRevisions.length} revision${wikiRevisions.length !== 1 ? "s" : ""} · from Reddit wiki`}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "local" | "wiki")}
          className="w-full mt-4"
        >
          <TabsList className="grid w-full grid-cols-2 bg-[--surface-3]">
            <TabsTrigger value="local" className="data-[state=active]:bg-[--primary]">
              Local Snapshots
            </TabsTrigger>
            <TabsTrigger value="wiki" className="data-[state=active]:bg-[--primary]">
              Wiki Versions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="flex flex-col h-[calc(100vh-12rem)] overflow-hidden">
            {/* Save button */}
            <Button
              onClick={handleSaveNow}
              data-testid="btn-save-snapshot"
              className="w-full mb-4 bg-[--primary] text-[--primary-foreground] hover:bg-[--primary]/90"
            >
              Save Current State
            </Button>

            {/* Local snapshots list */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {snapshots.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="text-3xl opacity-20">◷</div>
                  <p className="text-sm text-[--muted-foreground]">No snapshots yet</p>
                  <p className="text-xs text-[--subtle]">
                    Changes are auto-saved every 5 seconds of inactivity
                  </p>
                </div>
              ) : (
                <>
                  {/* Snapshot list */}
                  <div
                    className="overflow-auto"
                    style={{ maxHeight: selected ? "45%" : "100%" }}
                  >
                    {snapshots.map((snap, idx) => {
                      const isCurrent = snap.yaml === currentYaml;
                      const isSelected = snap.id === selected;
                      return (
                        <button
                          key={snap.id}
                          onClick={() =>
                            setSelected(isSelected ? null : snap.id)
                          }
                          className={`w-full text-left px-4 py-3 border-b border-[--border] transition-colors ${
                            isSelected
                              ? "bg-[--surface-3]"
                              : "hover:bg-[--surface-3]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isCurrent
                                  ? "bg-[--success]"
                                  : idx === 0
                                  ? "bg-[--info]"
                                  : "bg-[--subtle]"
                              }`}
                            />
                            <span className="text-xs font-semibold text-[--foreground] flex-1 truncate">
                              {snap.label ?? `v${snapshots.length - idx}`}
                              {isCurrent && (
                                <span className="ml-1.5 text-[10px] text-[--success] font-normal">
                                  (current)
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-[--muted-foreground] shrink-0">
                              {timeAgo(snap.savedAt)}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[--info]/10 text-[--info] border border-[--info]/20 shrink-0">
                              {snap.ruleCount}R
                            </span>
                          </div>
                          <div className="text-[11px] text-[--muted-foreground] mt-1 truncate ml-4 font-mono">
                            {yamlPreview(snap.yaml) || "—"}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Preview pane for selected snapshot */}
                  {selectedSnap && (
                    <div className="flex-1 flex flex-col border-t border-[--border] overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2 bg-[--surface-2] shrink-0">
                        <span className="text-xs text-[--muted-foreground] flex-1 truncate">
                          {new Date(selectedSnap.savedAt).toLocaleString()} ·{" "}
                          {selectedSnap.ruleCount} rule
                          {selectedSnap.ruleCount !== 1 ? "s" : ""}
                        </span>
                        <Button
                          onClick={() => {
                            onRestore(selectedSnap.yaml);
                            setSelected(null);
                          }}
                          data-testid="btn-restore"
                          size="sm"
                          className="bg-[--success] text-[--foreground] hover:bg-[--success]/90"
                        >
                          Restore
                        </Button>
                        <Button
                          onClick={() => handleDelete(selectedSnap.id)}
                          size="sm"
                          variant="ghost"
                          className="text-[--muted-foreground] hover:text-[--danger]"
                        >
                          Delete
                        </Button>
                      </div>
                      <pre className="flex-1 overflow-auto px-4 py-3 text-[11px] font-mono text-[--success] leading-relaxed bg-[--surface-3]">
                        {selectedSnap.yaml}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {snapshots.length > 0 && (
              <div className="shrink-0 px-4 py-2.5 border-t border-[--border] flex items-center gap-2">
                <span className="text-[10px] text-[--subtle] flex-1">
                  Stored in browser localStorage · max 20 snapshots
                </span>
                {confirmClear ? (
                  <>
                    <span className="text-[10px] text-[--danger]">Confirm?</span>
                    <Button
                      onClick={handleClearAll}
                      size="sm"
                      variant="ghost"
                      className="text-[--danger] hover:underline font-semibold"
                    >
                      Yes, clear
                    </Button>
                    <Button
                      onClick={() => setConfirmClear(false)}
                      size="sm"
                      variant="ghost"
                      className="text-[--muted-foreground] hover:underline"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => setConfirmClear(true)}
                    size="sm"
                    variant="ghost"
                    className="text-[--muted-foreground] hover:text-[--danger]"
                  >
                    Clear all
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="wiki" className="flex flex-col h-[calc(100vh-12rem)] overflow-hidden">
            {/* Wiki revisions list */}
            <Button
              onClick={fetchWikiRevisions}
              disabled={loadingWiki}
              variant="outline"
              className="w-full mb-4 border-[--border]"
            >
              {loadingWiki ? "Loading..." : "Refresh Versions"}
            </Button>

            <div className="flex-1 flex flex-col overflow-hidden">
              {wikiError ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="text-3xl opacity-20">⚠️</div>
                  <p className="text-sm text-[--danger]">{wikiError}</p>
                  <p className="text-xs text-[--subtle]">
                    Note: Wiki versions only available in production (not in playtest)
                  </p>
                </div>
              ) : wikiRevisions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="text-3xl opacity-20">📝</div>
                  <p className="text-sm text-[--muted-foreground]">
                    {loadingWiki ? "Loading revisions..." : "No wiki revisions found"}
                  </p>
                  <p className="text-xs text-[--subtle]">
                    Wiki revisions appear here after publishing rules to your subreddit
                  </p>
                </div>
              ) : (
                <div className="overflow-auto">
                  {wikiRevisions.map((revision, idx) => (
                    <div
                      key={`${revision.timestamp}-${idx}`}
                      className="w-full text-left px-4 py-3 border-b border-[--border] hover:bg-[--surface-3] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0 bg-[--info]" />
                        <span className="text-xs font-semibold text-[--foreground] flex-1">
                          {revision.author}
                        </span>
                        <span className="text-[10px] text-[--muted-foreground]">
                          {timeAgo(revision.timestamp)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[--muted-foreground] mt-1 ml-4">
                        {revision.reason || "(no reason provided)"}
                      </div>
                      <div className="text-[10px] text-[--subtle] mt-1 ml-4">
                        {new Date(revision.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-4 py-2.5 border-t border-[--border]">
              <p className="text-[10px] text-[--subtle]">
                📌 Wiki revisions are only available when deployed to production
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
