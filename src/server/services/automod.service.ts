import { context, redis } from '@devvit/web/server';
import {
  createDefaultSimulationPosts,
  DEFAULT_AUTOMOD_RULE,
  evaluateRule,
  parseAutomodRuleDraft,
  serializeAutomodRule,
  type AutomodRule,
  type SimulationPost,
} from '../../shared/automod';

const RULE_KEY = 'rulestage:rule:current';
const MOCK_POSTS_KEY = 'rulestage:simulation:posts';

function getSubredditKey(): string {
  return context.subredditName ?? 'default';
}

function ruleStorageKey(): string {
  return `${RULE_KEY}:${getSubredditKey()}`;
}

function postsStorageKey(): string {
  return `${MOCK_POSTS_KEY}:${getSubredditKey()}`;
}

export async function getCurrentRule(): Promise<AutomodRule> {
  const raw = await redis.get(ruleStorageKey());

  if (!raw) {
    return DEFAULT_AUTOMOD_RULE;
  }

  try {
    return parseAutomodRuleDraft(raw, DEFAULT_AUTOMOD_RULE);
  } catch (error) {
    console.warn('[RuleStage] Failed to parse stored rule, using default.', error);
    return DEFAULT_AUTOMOD_RULE;
  }
}

export async function saveCurrentRule(rule: AutomodRule): Promise<AutomodRule> {
  const normalized = parseAutomodRuleDraft(serializeAutomodRule(rule), rule);
  await redis.set(ruleStorageKey(), serializeAutomodRule(normalized));
  return normalized;
}

export async function getMockSimulationPosts(): Promise<SimulationPost[]> {
  const raw = await redis.get(postsStorageKey());

  if (!raw) {
    const defaults = createDefaultSimulationPosts();
    await redis.set(postsStorageKey(), JSON.stringify(defaults));
    return defaults;
  }

  try {
    return JSON.parse(raw) as SimulationPost[];
  } catch (error) {
    console.warn('[RuleStage] Failed to parse stored simulation posts, reseeding defaults.', error);
    const defaults = createDefaultSimulationPosts();
    await redis.set(postsStorageKey(), JSON.stringify(defaults));
    return defaults;
  }
}

export async function runSimulation(rule?: AutomodRule) {
  const activeRule = rule ?? (await getCurrentRule());
  const posts = await getMockSimulationPosts();

  return evaluateRule(activeRule, posts);
}

export async function resetRuleStageState(): Promise<AutomodRule> {
  await redis.set(ruleStorageKey(), serializeAutomodRule(DEFAULT_AUTOMOD_RULE));
  await redis.set(postsStorageKey(), JSON.stringify(createDefaultSimulationPosts()));
  return DEFAULT_AUTOMOD_RULE;
}