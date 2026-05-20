export interface HistorySnapshot {
  id: string;
  yaml: string;
  ruleCount: number;
  savedAt: number;
  label?: string;
}

const STORAGE_KEY = "rulestage:history";
const MAX_SNAPSHOTS = 20;

export function loadHistory(): HistorySnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistorySnapshot[]) : [];
  } catch {
    return [];
  }
}

export function saveSnapshot(
  yaml: string,
  ruleCount: number,
  label?: string
): HistorySnapshot[] {
  const history = loadHistory();
  const latest = history[0];
  if (latest && latest.yaml === yaml) return history;

  const snapshot: HistorySnapshot = {
    id: Math.random().toString(36).slice(2, 9),
    yaml,
    ruleCount,
    savedAt: Date.now(),
    label,
  };
  const updated = [snapshot, ...history].slice(0, MAX_SNAPSHOTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    /* storage full */
  }
  return updated;
}

export function deleteSnapshot(id: string): HistorySnapshot[] {
  const history = loadHistory().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
  return history;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
