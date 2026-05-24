import type { MockPostDebugRequest } from '../../shared/debug-types';

export type SavedMockTest = {
  id: string;
  label: string;
  createdAt: number;
  post: MockPostDebugRequest;
};

const STORAGE_KEY = 'mock_tests_v1';
const MAX_TESTS = 50;

function loadAll(): SavedMockTest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedMockTest[];
  } catch {
    return [];
  }
}

function saveAll(tests: SavedMockTest[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tests.slice(0, MAX_TESTS)));
  } catch {
    // ignore
  }
}

export function saveMockTest(post: MockPostDebugRequest, label?: string): SavedMockTest[] {
  const all = loadAll();
  const test: SavedMockTest = {
    id: `mock-${Date.now().toString(36)}`,
    label: label ?? `Mock Test #${all.length + 1}`,
    createdAt: Date.now(),
    post,
  };
  all.unshift(test);
  saveAll(all);
  return all;
}

export function deleteMockTest(id: string): SavedMockTest[] {
  const all = loadAll().filter((t) => t.id !== id);
  saveAll(all);
  return all;
}

export function getMockTests(): SavedMockTest[] {
  return loadAll();
}

export function getMockTestById(id: string): SavedMockTest | undefined {
  return loadAll().find((t) => t.id === id);
}
