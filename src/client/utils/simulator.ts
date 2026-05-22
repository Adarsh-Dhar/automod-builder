import type { AutomodAST, SimulationDiff, SimulationResult } from "../types";

export function generateMockPosts(count = 1000) {
  const posts: { id: string; title: string; author: string; score: number; commentCount: number }[] = [];
  for (let i = 0; i < count; i++) {
    posts.push({ id: `t3_${i}`, title: `Mock post ${i}`, author: `user${i}`, score: Math.floor(Math.random() * 1000), commentCount: Math.floor(Math.random() * 500) });
  }
  return posts;
}

export function runSimulation(_ast: AutomodAST, posts: { id: string; title: string; author: string; score: number; commentCount: number }[]): SimulationDiff {
  // Minimal stub: mark nothing removed/reported/approved — return untouched as all posts
  const untouched: SimulationResult[] = posts.map((p) => ({ postId: p.id, postTitle: p.title, postAuthor: p.author, action: 'none', reasons: [] }));
  return {
    removed: [],
    reported: [],
    approved: [],
    untouched,
    totalPosts: posts.length,
    runAt: Date.now(),
  };
}
