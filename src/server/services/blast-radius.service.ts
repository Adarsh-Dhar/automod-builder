import { context, redis } from '@devvit/web/server';
import { evaluateRule, type AutomodRule, type SimulationPost } from '../../shared/automod';
import type { BlastRadiusResult, CachedPost } from '../../shared/blast-types';

const BLAST_CACHE_KEY = 'blast:posts';

function getCacheKey(): string {
  return `${BLAST_CACHE_KEY}:${context.subredditName ?? 'default'}`;
}

function parseCachedPosts(raw: string | null): CachedPost[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CachedPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toSimulationPost(post: CachedPost): SimulationPost {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    author: post.author,
    accountAgeDays: post.accountAgeDays,
    combinedKarma: post.combinedKarma,
  };
}

export async function runBlastRadius(rule: AutomodRule): Promise<BlastRadiusResult> {
  const raw = await redis.get(getCacheKey());
  const posts = parseCachedPosts(raw);

  if (posts.length === 0) {
    return {
      totalTested: 0,
      wouldCatch: 0,
      falsePositives: [],
      missedSpam: [],
      catchRate: 0,
      falsePositiveRate: 0,
    };
  }

  const simulationPosts = posts.map(toSimulationPost);
  const evaluation = evaluateRule(rule, simulationPosts);
  const caughtIds = new Set(evaluation.items.filter((item) => item.outcome === rule.action).map((item) => item.id));
  const spamPosts = posts.filter((post) => post.wasRemoved);
  const falsePositives = posts.filter((post) => caughtIds.has(post.id) && !post.wasRemoved);
  const missedSpam = spamPosts.filter((post) => !caughtIds.has(post.id));
  const wouldCatch = spamPosts.filter((post) => caughtIds.has(post.id)).length;

  return {
    totalTested: posts.length,
    wouldCatch,
    falsePositives,
    missedSpam,
    catchRate: spamPosts.length > 0 ? wouldCatch / spamPosts.length : 0,
    falsePositiveRate: caughtIds.size > 0 ? falsePositives.length / caughtIds.size : 0,
  };
}