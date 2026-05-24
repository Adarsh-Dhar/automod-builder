export type HistorySnapshot = {
  id: string;
  yaml: string;
  savedAt: number;
  ruleCount: number;
  label?: string;
  source?: 'chat' | 'code' | 'debugger' | 'decoder' | 'escape-hatch' | 'restore';
};

const STORAGE_KEY = "rule_history_v1";
const MAX_SNAPSHOTS = 20;

function loadAll(): HistorySnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistorySnapshot[];
  } catch {
    return [];
  }
}

function saveAll(snapshots: HistorySnapshot[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
  } catch {
    // ignore
  }
}

export function saveSnapshot(
  yaml: string,
  ruleCount: number,
  label?: string,
  source?: HistorySnapshot['source']
): HistorySnapshot[] {
  const all = loadAll();
  const base = { id: Date.now().toString(36), yaml, savedAt: Date.now(), ruleCount } as const;
  const snap: HistorySnapshot = {
    ...base,
    ...(label !== undefined ? { label } : {}),
    ...(source !== undefined ? { source } : {}),
  };
  all.unshift(snap);
  saveAll(all);
  return all;
}

export function deleteSnapshot(id: string): HistorySnapshot[] {
  const all = loadAll().filter((s) => s.id !== id);
  saveAll(all);
  return all;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getSnapshots(): HistorySnapshot[] {
  return loadAll();
}

export function getSnapshotById(id: string): HistorySnapshot | undefined {
  return loadAll().find((s) => s.id === id);
}
