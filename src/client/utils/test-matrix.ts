export type MatrixCell = {
  changeId: string;
  testId: string;
  outcome: 'remove' | 'approve' | 'report' | 'error';
  matchedCondition?: string;
  reason: string;
  runAt: number;
};

const STORAGE_KEY = 'test_matrix_v1';

function loadAll(): Record<string, MatrixCell> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, MatrixCell>;
  } catch {
    return {};
  }
}

function saveAll(cells: Record<string, MatrixCell>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
  } catch {
    // ignore
  }
}

function makeKey(changeId: string, testId: string): string {
  return `${changeId}::${testId}`;
}

export function saveMatrixCell(cell: MatrixCell): void {
  const all = loadAll();
  all[makeKey(cell.changeId, cell.testId)] = cell;
  saveAll(all);
}

export function getMatrixCell(changeId: string, testId: string): MatrixCell | undefined {
  const all = loadAll();
  return all[makeKey(changeId, testId)];
}

export function getAllMatrixCells(): MatrixCell[] {
  const all = loadAll();
  return Object.values(all);
}

export function clearMatrixForChange(changeId: string): void {
  const all = loadAll();
  Object.keys(all).forEach((key) => {
    if (key.startsWith(`${changeId}::`)) {
      delete all[key];
    }
  });
  saveAll(all);
}
