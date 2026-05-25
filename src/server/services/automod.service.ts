import { context, redis, reddit } from '@devvit/web/server';
import pkg from '../../../package.json';
import {
  DEFAULT_AUTOMOD_RULE,
  evaluateRule,
  parseAutomodRuleDraft,
  replaceOrAppendRule,
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

function validateWikiUpdateInputs(yaml: string): void {
  if (typeof yaml !== 'string' || yaml.length === 0) {
    throw new Error('YAML content must be a non-empty string');
  }

  if (yaml.trim().length === 0) {
    throw new Error('YAML content must not be whitespace only');
  }

  if (yaml.includes('\x00')) {
    throw new Error('YAML content contains invalid null characters');
  }

  if (yaml.length > 100_000) {
    throw new Error('YAML content exceeds maximum size of 100KB');
  }

  // Check for multiple code blocks
  const codeBlockMatches = yaml.match(/```/g);
  if (codeBlockMatches && codeBlockMatches.length > 2) {
    throw new Error('YAML content contains multiple code blocks');
  }

  // Check for unclosed code block
  const openMatches = yaml.match(/```/g);
  if (openMatches && openMatches.length === 1) {
    throw new Error('YAML content contains unclosed code block');
  }
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
  const versionedRule = { ...rule, version: pkg.version };
  const normalized = parseAutomodRuleDraft(serializeAutomodRule(versionedRule), versionedRule);
  const yaml = serializeAutomodRule(normalized);
  await redis.set(ruleStorageKey(), yaml);     // keep Redis as draft cache
  await pushYamlToWiki(yaml, rule.name);      // push to live wiki with rule name as reason
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

export async function pushYamlToWiki(yaml: string, reason?: string): Promise<void> {
  validateWikiUpdateInputs(yaml);

  const subredditName = getSubredditKey();
  if (!subredditName || subredditName === 'default' || subredditName === 'AutoModDemo') {
    throw new Error('Wiki publishing is not available in playtest mode. This feature only works in production subreddits.');
  }

  // READ existing content first to preserve existing rules
  let existingContent = '';
  try {
    existingContent = await getLiveAutomodYaml(subredditName);
  } catch {
    // Wiki doesn't exist yet, that's fine
  }

  // MERGE new rule with existing content (replace by name, append if new)
  const mergedContent = replaceOrAppendRule(existingContent, yaml);

  // RETRY logic with exponential backoff
  const maxRetries = 3;
  const delays = [1000, 2000, 4000]; // 1s, 2s, 4s

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await reddit.updateWikiPage({
        subredditName,
        page: 'config/automoderator',
        content: mergedContent,
        reason: reason ?? 'Updated via AutoMod Builder app',
      });
      return; // Success, exit retry loop
    } catch (error) {
      const errorMessage = (error as Error).message.toLowerCase();
      const isRetryable = errorMessage.includes('415') || errorMessage.includes('unknown') || errorMessage.includes('grpc');

      if (!isRetryable || attempt === maxRetries - 1) {
        console.error('[AutoModService] Failed to publish to wiki after all retries:', error);
        throw error; // Not retryable or last attempt exhausted
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

export async function resetRuleStageState(): Promise<AutomodRule> {
  await redis.del(ruleStorageKey());
  await redis.set(postsStorageKey(), JSON.stringify([]));
  return DEFAULT_AUTOMOD_RULE;
}