import { useState, useEffect } from 'react';
import type { HistorySnapshot } from '../utils/history';
import type { SavedMockTest } from '../utils/mock-tests';
import type { MatrixCell } from '../utils/test-matrix';
import { getAllMatrixCells } from '../utils/test-matrix';
import { Button } from './ui/button';

type TestMatrixViewProps = {
  changes: HistorySnapshot[];
  mockTests: SavedMockTest[];
  onRunCell: (changeId: string, testId: string) => Promise<MatrixCell>;
  onRunAll: () => Promise<void>;
};

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function getOutcomeColor(outcome: MatrixCell['outcome']): string {
  switch (outcome) {
    case 'remove':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'approve':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'report':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    case 'error':
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
}

function getSourceColor(source: HistorySnapshot['source']): string {
  switch (source) {
    case 'chat':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'code':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    case 'debugger':
      return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    case 'decoder':
      return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
    case 'escape-hatch':
      return 'bg-pink-500/10 text-pink-500 border-pink-500/20';
    case 'restore':
      return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
}

export default function TestMatrixView({ changes, mockTests, onRunCell, onRunAll }: TestMatrixViewProps) {
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [runningCell, setRunningCell] = useState<{ changeId: string; testId: string } | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [cellResults, setCellResults] = useState<Record<string, MatrixCell>>({});

  // Pre-populate cell results from storage on mount
  useEffect(() => {
    const all = getAllMatrixCells();
    setCellResults(Object.fromEntries(all.map((c) => [`${c.changeId}::${c.testId}`, c])));
  }, []);

  const filteredChanges = selectedChangeId ? changes.filter((c) => c.id === selectedChangeId) : changes;
  const filteredTests = selectedTestId ? mockTests.filter((t) => t.id === selectedTestId) : mockTests;

  const handleRunCell = async (changeId: string, testId: string) => {
    setRunningCell({ changeId, testId });
    try {
      const cell = await onRunCell(changeId, testId);
      setCellResults((prev) => ({ ...prev, [`${changeId}::${testId}`]: cell }));
    } finally {
      setRunningCell(null);
    }
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    try {
      await onRunAll();
      // Reload all cells from storage after running all
      const all = getAllMatrixCells();
      setCellResults(Object.fromEntries(all.map((c) => [`${c.changeId}::${c.testId}`, c])));
    } finally {
      setRunningAll(false);
    }
  };

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-4xl opacity-20">📊</div>
        <p className="text-sm text-[--muted-foreground]">No YAML changes found</p>
        <p className="text-xs text-[--subtle]">
          Make changes in Code, Chat, or Debugger mode to populate the test matrix
        </p>
      </div>
    );
  }

  if (mockTests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="text-4xl opacity-20">🧪</div>
        <p className="text-sm text-[--muted-foreground]">No mock tests saved yet</p>
        <p className="text-xs text-[--subtle]">
          Go to Debugger mode and create mock tests to populate the test matrix
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-4 p-4 border-b border-[--border] bg-[--surface-2] shrink-0">
        <Button onClick={handleRunAll} disabled={runningAll} size="sm">
          {runningAll ? 'Running All...' : 'Run All'}
        </Button>
        <div className="flex-1" />
        <select
          value={selectedChangeId ?? ''}
          onChange={(e) => setSelectedChangeId(e.target.value || null)}
          className="rounded-lg border border-[--border] bg-[--surface-3] px-3 py-1.5 text-sm text-[--foreground] outline-none"
        >
          <option value="">All Changes</option>
          {changes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label ?? `Change ${c.id.slice(0, 8)}`}
            </option>
          ))}
        </select>
        <select
          value={selectedTestId ?? ''}
          onChange={(e) => setSelectedTestId(e.target.value || null)}
          className="rounded-lg border border-[--border] bg-[--surface-3] px-3 py-1.5 text-sm text-[--foreground] outline-none"
        >
          <option value="">All Tests</option>
          {mockTests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Matrix Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="inline-block min-w-full">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 bg-[--surface-2] p-3 text-left text-xs font-medium text-[--muted-foreground] border-b border-[--border] border-r border-[--border] z-10">
                  Test
                </th>
                {filteredChanges.map((change) => (
                  <th key={change.id} className="p-3 text-left min-w-[200px] border-b border-[--border]">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[--subtle]">{change.id.slice(0, 8)}</span>
                        {change.source && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getSourceColor(change.source)}`}>
                            {change.source}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-[--foreground]">
                        {change.label ?? 'Unnamed change'}
                      </span>
                      <span className="text-[10px] text-[--muted-foreground]">{timeAgo(change.savedAt)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTests.map((test) => (
                <tr key={test.id}>
                  <td className="sticky left-0 bg-[--surface-2] p-3 border-b border-[--border] border-r border-[--border]">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[--subtle]">{test.id.slice(0, 8)}</span>
                      </div>
                      <span className="text-xs font-medium text-[--foreground]">{test.label}</span>
                      <span className="text-[10px] text-[--muted-foreground] truncate max-w-[150px]">
                        {test.post.title}
                      </span>
                    </div>
                  </td>
                  {filteredChanges.map((change) => {
                    const cell = cellResults[`${change.id}::${test.id}`];
                    const isRunning = runningCell?.changeId === change.id && runningCell?.testId === test.id;

                    return (
                      <td key={change.id} className="p-2 border-b border-[--border]">
                        {cell ? (
                          <div
                            className={`text-xs px-2 py-1 rounded border ${getOutcomeColor(cell.outcome)} cursor-pointer`}
                            title={cell.reason}
                          >
                            {cell.outcome}
                          </div>
                        ) : (
                          <Button
                            onClick={() => handleRunCell(change.id, test.id)}
                            disabled={isRunning}
                            variant="ghost"
                            size="sm"
                            className="w-full h-8 text-xs"
                          >
                            {isRunning ? '...' : '▶ Run'}
                          </Button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
