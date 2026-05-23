import { context, redis } from '@devvit/web/server';
import { evaluateRule, type AutomodRule, type SimulationPost } from '../../shared/automod';
import type { BlastRadiusResult, CachedPost } from '../../shared/blast-types';

const BLAST_CACHE_KEY = 'blast:posts';

function getCacheKey(): string {
  return `${BLAST_CACHE_KEY}:${context.subredditName ?? 'default'}`;
}

function parseCachedPosts(raw: string | null | undefined): CachedPost[] {
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
    linkKarma: 0,
    commentKarma: 0,
    subreddit: '',
    domain: '',
    url: '',
    isSelf: false,
    over18: false,
    spoiler: false,
    stickied: false,
    numComments: 0,
    score: 0,
    upvoteRatio: 1,
    authorFlairText: '',
    linkFlairText: '',
    distinguished: '',
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
  const spamPosts = posts.filter((post) => post.isSpam);
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

// Helper: calculate blast radius from an in-memory list of cached posts (used by tests)
export function calculateBlastRadius(posts: CachedPost[], rule: AutomodRule): BlastRadiusResult {
  if (!posts || posts.length === 0) {
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
  const spamPosts = posts.filter((post) => post.isSpam);
  const falsePositives = posts.filter((post) => caughtIds.has(post.id) && !post.isSpam);
  const missedSpam = spamPosts.filter((post) => !caughtIds.has(post.id));
  const wouldCatch = spamPosts.filter((post) => caughtIds.has(post.id)).length;

  // debug logging removed

  return {
    totalTested: posts.length,
    wouldCatch,
    falsePositives,
    missedSpam,
    catchRate: spamPosts.length > 0 ? wouldCatch / spamPosts.length : 0,
    falsePositiveRate: caughtIds.size > 0 ? falsePositives.length / caughtIds.size : 0,
  };
}

// Helper: evaluate a rule against cached posts and return detailed items
export function evaluateRuleAgainstCachedPosts(posts: CachedPost[], rule: AutomodRule) {
  const simulationPosts = (posts || []).map(toSimulationPost);
  const evaluation = evaluateRule(rule, simulationPosts);

  const matchedItems = evaluation.items.filter((i) => i.outcome !== 'approve');

  return {
    matched: evaluation.matched,
    removed: posts.filter((p) => p.wasRemoved).length,
    items: matchedItems,
  };
}

// Helper: format a BlastRadiusResult into a presentable object
export function formatBlastRadiusResult(result: BlastRadiusResult, ruleName: string) {
  const catchesPercentage = Math.round((result.catchRate ?? 0) * 100);
  const falsePositivePercentage = Math.round((result.falsePositiveRate ?? 0) * 100);

  return {
    ruleName,
    totalTested: result.totalTested,
    catches: {
      count: result.wouldCatch,
      percentage: catchesPercentage,
    },
    falsePositives: {
      count: result.falsePositives.length,
      percentage: falsePositivePercentage,
      posts: result.falsePositives,
    },
    missedSpam: {
      count: result.missedSpam.length,
      posts: result.missedSpam,
    },
  };
}