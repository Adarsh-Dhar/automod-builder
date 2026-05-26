// Display Reddit wiki revisions with restore functionality
// Full-page two-column inline component (not a Sheet/drawer)

import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from './ui/alert-dialog';

export interface WikiRevision {
  timestamp: number;
  author: string;
  reason?: string;
  id?: string;
}

interface WikiRevisionsPanelProps {
  subredditName?: string;
  onRestore: (yaml: string) => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

export default function WikiRevisionsPanel({
  subredditName,
  onRestore,
}: WikiRevisionsPanelProps) {
  const [revisions, setRevisions] = useState<WikiRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<WikiRevision | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Playtest mode check
  const isPlaytest = !subredditName || subredditName === 'default';

  const loadRevisions = useCallback(async () => {
    if (isPlaytest) {
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/rule-stage/wiki-revisions');
      const data = await response.json();

      if (data.status === 'success') {
        const revs = data.revisions ?? [];
        setRevisions(revs);
        if (revs.length === 0) {
          setError('No revisions found. This subreddit may not have any AutoModerator wiki history yet.');
        }
      } else {
        setError(data.message ?? 'Failed to load wiki revisions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load revisions');
    } finally {
      setLoading(false);
    }
  }, [isPlaytest]);

  // Auto-fetch on mount
  useEffect(() => {
    if (!isPlaytest) {
      void loadRevisions();
    }
  }, [isPlaytest, loadRevisions]);

  const handleLook = async (revision: WikiRevision) => {
    if (selectedRevision?.id === revision.id && previewContent) {
      setSelectedRevision(null);
      setPreviewContent('');
      return;
    }
    setSelectedRevision(revision);
    setPreviewContent('');
    setRestoreError(null);
    
    // Fetch the content of this revision
    try {
      const response = await fetch(`/api/rule-stage/wiki-revisions/${encodeURIComponent(revision.id ?? '')}`);
      const data = await response.json();
      
      if (data.status === 'success') {
        setPreviewContent(data.content);
      } else {
        setPreviewContent('(Could not load revision content)');
      }
    } catch (err) {
      setPreviewContent('(Failed to load revision content)');
    }
  };

  const handleRestoreFromRow = async (revision: WikiRevision) => {
    let yaml = selectedRevision?.id === revision.id ? previewContent : '';
    if (!yaml) {
      setSelectedRevision(revision);
      setRestoreError(null);
      
      // Fetch content first, then confirm
      try {
        const response = await fetch(`/api/rule-stage/wiki-revisions/${encodeURIComponent(revision.id ?? '')}`);
        const data = await response.json();
        
        if (data.status === 'success') {
          yaml = data.content ?? '';
          setPreviewContent(yaml);
        } else {
          setRestoreError(data.message ?? 'Could not load revision content');
          return;
        }
      } catch (err) {
        setRestoreError('Failed to load revision content');
        return;
      }
    }
    setShowRestoreConfirm(true);
  };

  const handleRestoreFromPreview = () => {
    setShowRestoreConfirm(true);
  };

  const handleRestore = async () => {
    if (!previewContent) return;

    setIsRestoring(true);
    setRestoreError(null);
    try {
      onRestore(previewContent);
      setShowRestoreConfirm(false);
      setSelectedRevision(null);
      setPreviewContent('');
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Failed to restore revision');
    } finally {
      setIsRestoring(false);
    }
  };

  // Playtest mode - locked state
  if (isPlaytest) {
    return (
      <div className="h-full flex items-center justify-center bg-[--surface-2]">
        <div className="text-center space-y-4 px-6">
          <div className="text-6xl opacity-30">🔒</div>
          <h3 className="text-lg font-semibold text-[--foreground]">
            Wiki revisions not available in playtest mode
          </h3>
          <p className="text-sm text-[--muted-foreground] max-w-md">
            Deploy to production to view your subreddit's version history
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[--surface-2]">
      {/* Header with refresh */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[--border]">
        <div>
          <h2 className="text-lg font-semibold text-[--foreground]">Version History</h2>
          <p className="text-xs text-[--muted-foreground]">
            {revisions.length} revision{revisions.length !== 1 ? 's' : ''} from Reddit wiki
          </p>
        </div>
        <Button
          onClick={loadRevisions}
          disabled={loading}
          variant="outline"
          className="border-[--border] bg-[--surface-3] text-[--foreground] hover:border-[--primary]/50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-[--danger]/15 border border-[--danger]/30 text-[--danger] text-sm">
          {error}
        </div>
      )}

      {/* Main content area - two columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column: revision table */}
        <div className="flex-1 overflow-auto border-r border-[--border]">
          {revisions.length === 0 && !loading ? (
            <div className="flex items-center justify-center h-full text-center px-6">
              <div className="space-y-3">
                <div className="text-3xl opacity-20">📝</div>
                <p className="text-sm text-[--muted-foreground]">No wiki revisions found</p>
                <p className="text-xs text-[--subtle]">
                  Wiki revisions appear here after publishing rules to your subreddit
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[--surface-2] border-b border-[--border]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[--muted-foreground] uppercase">Author</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[--muted-foreground] uppercase">Note / Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[--muted-foreground] uppercase">Time</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[--muted-foreground] uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((revision, idx) => (
                  <tr
                    key={`${revision.timestamp}-${idx}`}
                    className={`border-b border-[--border] hover:bg-[--surface-3] transition-colors ${
                      selectedRevision?.timestamp === revision.timestamp ? 'bg-[--primary]/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-[--foreground] font-mono text-xs">
                      u/{revision.author}
                    </td>
                    <td className="px-4 py-3 text-[--muted-foreground] text-xs italic">
                      {revision.reason || '(no reason)'}
                    </td>
                    <td className="px-4 py-3 text-[--muted-foreground] text-xs">
                      <div>{formatDate(revision.timestamp)}</div>
                      <div className="text-[10px] text-[--subtle]">{timeAgo(revision.timestamp)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          onClick={() => handleLook(revision)}
                          size="sm"
                          variant="ghost"
                          className="text-[--muted-foreground] hover:text-[--foreground] hover:bg-[--surface-3]"
                        >
                          👁 Look
                        </Button>
                        <Button
                          onClick={() => handleRestoreFromRow(revision)}
                          size="sm"
                          variant="ghost"
                          className="text-[--muted-foreground] hover:text-[--success] hover:bg-[--success]/10"
                        >
                          ↩ Restore
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column: YAML preview pane */}
        <div className="w-1/2 flex flex-col bg-[--surface-3]">
          {!selectedRevision ? (
            <div className="flex items-center justify-center h-full text-[--muted-foreground] text-sm">
              Select a revision to preview its configuration
            </div>
          ) : (
            <>
              {/* Preview header */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-[--border] bg-[--surface-2]">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[--muted-foreground]">Revision by u/{selectedRevision.author}</div>
                    <div className="text-xs text-[--subtle]">{formatDate(selectedRevision.timestamp)}</div>
                    {selectedRevision.reason && (
                      <div className="text-xs text-[--foreground] italic mt-1 truncate">
                        {selectedRevision.reason}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={handleRestoreFromPreview}
                    disabled={!previewContent || isRestoring}
                    size="sm"
                    className="bg-[--primary] text-[--primary-foreground] hover:bg-[--primary]/90"
                  >
                    {isRestoring ? 'Restoring...' : '↩ Restore This Version'}
                  </Button>
                </div>
              </div>

              {/* Restore error */}
              {restoreError && (
                <div className="mx-4 mt-3 p-3 rounded-xl bg-[--danger]/15 border border-[--danger]/30 text-[--danger] text-xs">
                  {restoreError}
                </div>
              )}

              {/* YAML content */}
              <div className="flex-1 overflow-auto p-4">
                <pre className="text-xs font-mono text-[--success] leading-relaxed whitespace-pre-wrap">
                  {previewContent || 'Loading...'}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Restore confirmation dialog */}
      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent className="bg-[--surface-2] border-[--border]">
          <AlertDialogTitle className="text-[--foreground]">
            Restore Revision?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[--muted-foreground]">
            <div className="space-y-2">
              <p>
                You're about to restore the AutoModerator configuration from{' '}
                <strong>{formatDate(selectedRevision?.timestamp || 0)}</strong>
              </p>
              <p>
                by <strong>u/{selectedRevision?.author}</strong>
              </p>
              <p className="text-[--danger] pt-2">
                ⚠️ This will overwrite your current configuration. This action can be undone by
                restoring another revision.
              </p>
            </div>
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel className="border-[--border] text-[--foreground]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={isRestoring}
              className="bg-[--primary] text-[--primary-foreground] hover:bg-[--primary]/90"
            >
              {isRestoring ? 'Restoring...' : 'Restore'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
