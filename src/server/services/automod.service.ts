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
  return context.subredditName || 'default';
}

function ruleStorageKey(): string {
  return `${RULE_KEY}:${getSubredditKey()}`;
}

function postsStorageKey(): string {
  return `${MOCK_POSTS_KEY}:${getSubredditKey()}`;
}

function extractWikiContent(page: unknown): string {
  let content = '';

  if (typeof page === 'string') {
    content = page;
  } else if (page && typeof page === 'object') {
    const record = page as Record<string, unknown>;
    const rawContent = record.content_md ?? record.content ?? record.wikitext ?? record.body ?? record.md;
    if (typeof rawContent === 'string') {
      content = rawContent;
    }
  }

  // Strip markdown code fences if present (```yaml ... ```)
  const codeBlockMatch = content.match(/^[\s]*```(?:yaml)?\s*([\s\S]*?)\s*```[\s]*$/m);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  return content;
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

export async function saveCurrentRule(rule: AutomodRule, title?: string): Promise<AutomodRule> {
  const normalized = parseAutomodRuleDraft(serializeAutomodRule(rule), rule);
  const yaml = serializeAutomodRule(normalized);
  await redis.set(ruleStorageKey(), yaml);     // keep Redis as draft cache
  await pushYamlToWiki(yaml, getSubredditKey(), title);           // push to live wiki
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

export async function pushYamlToWiki(yaml: string, subredditName: string, reason?: string): Promise<void> {
  console.log('[AutoModService] pushYamlToWiki called for subreddit:', subredditName, 'with reason:', reason);
  if (!subredditName || subredditName === 'default') {
    throw new Error('No subreddit context available');
  }
  try {
    // Wrap YAML in markdown code blocks for Reddit wiki API compatibility
    const markdownContent = ` \`\`\`yaml\n${yaml}\n\`\`\` `;
    await reddit.updateWikiPage({
      subredditName,
      page: 'config/automoderator',
      content: markdownContent,
      reason: reason || 'Updated via AutoMod Builder app',
    });
    console.log('[AutoModService] Wiki page updated successfully for subreddit:', subredditName);
  } catch (error) {
    console.error('[AutoModService] Failed to update wiki page:', error);
    throw error;
  }
}

export async function resetRuleStageState(): Promise<AutomodRule> {
  await redis.del(ruleStorageKey());
  await redis.set(postsStorageKey(), JSON.stringify([]));
  return DEFAULT_AUTOMOD_RULE;
}