import { context, redis, reddit } from '@devvit/web/server';
import {
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

function extractWikiContent(page: unknown): string {
  if (typeof page === 'string') {
    return page;
  }

  if (page && typeof page === 'object') {
    const record = page as Record<string, unknown>;
    const content = record.content_md ?? record.content ?? record.wikitext ?? record.body ?? record.md;
    if (typeof content === 'string') {
      return content;
    }
  }

  return '';
}

export async function getCurrentRule(): Promise<AutomodRule> {
  const raw = await redis.get(ruleStorageKey());

  if (!raw) {
    return DEFAULT_AUTOMOD_RULE;
  }

  try {
    const parsed = parseAutomodRuleDraft(raw, DEFAULT_AUTOMOD_RULE);

    // Check if the saved rule is the old template (has "Rule draft" name)
    if (parsed.name === 'Rule draft') {
      // Return empty rule instead of template
      return DEFAULT_AUTOMOD_RULE;
    }

    return parsed;
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
    const empty: SimulationPost[] = [];
    await redis.set(postsStorageKey(), JSON.stringify(empty));
    return empty;
  }

  try {
    return JSON.parse(raw) as SimulationPost[];
  } catch (error) {
    console.warn('[RuleStage] Failed to parse stored simulation posts, resetting to empty.', error);
    const empty: SimulationPost[] = [];
    await redis.set(postsStorageKey(), JSON.stringify(empty));
    return empty;
  }
}

export async function runSimulation(rule?: AutomodRule) {
  const activeRule = rule ?? (await getCurrentRule());
  const posts = await getMockSimulationPosts();

  return evaluateRule(activeRule, posts);
}

export async function getLiveAutomodYaml(subredditName: string): Promise<string> {
  try {
    const wikiPage = await reddit.getWikiPage(subredditName, 'config/automoderator');
    const liveYaml = extractWikiContent(wikiPage);

    if (liveYaml.trim()) {
      return liveYaml;
    }
  } catch (error) {
    console.warn('[RuleStage] Failed to load live automod wiki, falling back to Redis draft.', error);
  }

  const draft = await redis.get(ruleStorageKey());
  return draft?.trim() ? draft : serializeAutomodRule(DEFAULT_AUTOMOD_RULE);
}

export async function resetRuleStageState(): Promise<AutomodRule> {
  await redis.del(ruleStorageKey());
  await redis.set(postsStorageKey(), JSON.stringify([]));
  return DEFAULT_AUTOMOD_RULE;
}