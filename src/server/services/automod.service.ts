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
  try {
    const liveYaml = await getLiveAutomodYaml(getSubredditKey());
    if (liveYaml.trim()) {
      return parseAutomodRuleDraft(liveYaml, DEFAULT_AUTOMOD_RULE);
    }
  } catch {
    // fall through to Redis draft
  }

  const raw = await redis.get(ruleStorageKey());
  if (!raw) return DEFAULT_AUTOMOD_RULE;
  try {
    return parseAutomodRuleDraft(raw, DEFAULT_AUTOMOD_RULE);
  } catch {
    return DEFAULT_AUTOMOD_RULE;
  }
}

export async function saveCurrentRule(rule: AutomodRule): Promise<AutomodRule> {
  const normalized = parseAutomodRuleDraft(serializeAutomodRule(rule), rule);
  const yaml = serializeAutomodRule(normalized);
  await redis.set(ruleStorageKey(), yaml);     // keep Redis as draft cache
  await pushYamlToWiki(yaml);           // push to live wiki
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

export async function pushYamlToWiki(yaml: string): Promise<void> {
  const subredditName = getSubredditKey();
  if (!subredditName || subredditName === 'default') {
    throw new Error('No subreddit context available');
  }

  // READ existing content first to preserve existing rules
  let existingContent = '';
  try {
    existingContent = await getLiveAutomodYaml(subredditName);
  } catch {
    // Wiki doesn't exist yet, that's fine
  }

  // MERGE new rule with existing content
  const mergedContent = existingContent.trim()
    ? existingContent + '\n\n' + yaml
    : yaml;

  await reddit.updateWikiPage({
    subredditName,
    page: 'config/automoderator',
    content: mergedContent,
    reason: 'Updated via AutoMod Builder app',
  });
}

export async function resetRuleStageState(): Promise<AutomodRule> {
  await redis.del(ruleStorageKey());
  await redis.set(postsStorageKey(), JSON.stringify([]));
  return DEFAULT_AUTOMOD_RULE;
}