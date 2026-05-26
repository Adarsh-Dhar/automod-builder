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

  console.log('[AutoModService] Validation passed - Content length:', yaml.length, 'bytes');
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
  const isPlaytest = !subredditName || subredditName === 'default';

  if (isPlaytest) {
    // Playtest: simulate a successful wiki write by persisting to Redis
    console.log('[AutoModService] Playtest mode: mocking wiki publish → storing to Redis.');
    await redis.set(`wiki:mock:${subredditName}`, yaml);
    // Also update the rule storage key for consistency
    await redis.set(ruleStorageKey(), yaml);
    return; // pretend success
  }

  // Production: real wiki write
  // READ existing content first to preserve existing rules
  let existingContent = '';
  try {
    existingContent = await getLiveAutomodYaml(subredditName);
    console.log('[AutoModService] Existing wiki content length:', existingContent.length);
  } catch (error) {
    console.log('[AutoModService] Wiki page does not exist yet or could not be read:', error);
    // Wiki doesn't exist yet, that's fine
  }

  // MERGE new rule with existing content (replace by name, append if new)
  const mergedContent = replaceOrAppendRule(existingContent, yaml);

  console.log('[AutoModService] Wiki update - Content length:', mergedContent.length, 'bytes');
  console.log('[AutoModService] Wiki update - Content preview:', mergedContent.substring(0, 200));
  console.log('[AutoModService] Wiki update - Subreddit:', subredditName, 'Page: config/automoderator');

  // AutoModerator config page expects plain YAML, not markdown
  // The 415 error might be due to content size or other issues
  // Try sending plain YAML as-is

  // Check if content is too large - Devvit might have a lower limit than 100KB
  const MAX_WIKI_CONTENT_SIZE = 50000; // 50KB limit to be safe
  let contentToSend = mergedContent;
  if (mergedContent.length > MAX_WIKI_CONTENT_SIZE) {
    console.warn('[AutoModService] Content exceeds 50KB, truncating to avoid 415 error');
    contentToSend = mergedContent.substring(0, MAX_WIKI_CONTENT_SIZE);
  }

  // Normalize subreddit name to lowercase (Reddit API expects lowercase)
  const normalizedSubredditName = subredditName.toLowerCase();

  console.log('[AutoModService] Using normalized subreddit name:', normalizedSubredditName);
  console.log('[AutoModService] Content to send length:', contentToSend.length);

  // RETRY logic with exponential backoff
  const maxRetries = 3;
  const delays = [1000, 2000, 4000]; // 1s, 2s, 4s

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[AutoModService] Wiki update attempt ${attempt + 1}/${maxRetries}`);
      await reddit.updateWikiPage({
        subredditName: normalizedSubredditName,
        page: 'config/automoderator',
        content: contentToSend,
        reason: reason ?? 'Updated via AutoMod Builder app',
      });
      console.log('[AutoModService] Wiki update successful');

      // Store revision history in Redis after successful wiki update
      await addWikiRevisionToHistory(subredditName, contentToSend, reason);

      return; // Success, exit retry loop
    } catch (error) {
      const errorMessage = (error as Error).message.toLowerCase();
      console.error(`[AutoModService] Wiki update attempt ${attempt + 1} failed:`, error);
      console.error(`[AutoModService] Error details:`, {
        message: (error as Error).message,
        name: (error as Error).name,
        stack: (error as Error).stack,
      });
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

// ============================================================================
// NEW: Wiki Revisions Support
// ============================================================================

export interface WikiRevision {
  id: string;
  timestamp: number;
  author: string;
  reason?: string;
}

function wikiRevisionsKey(subredditName: string): string {
  return `wiki:revisions:${subredditName}`;
}

function wikiRevisionContentKey(subredditName: string, revisionId: string): string {
  return `wiki:revision:${subredditName}:${revisionId}`;
}

/**
 * Add a revision to the local Redis history after successful wiki update.
 * This provides a workaround since Devvit doesn't allow direct HTTP requests to oauth.reddit.com.
 */
async function addWikiRevisionToHistory(
  subredditName: string,
  content: string,
  reason?: string
): Promise<void> {
  try {
    const revisionId = `rev_${Date.now()}`;
    const timestamp = Date.now();
    const author = context.userId ?? 'unknown';

    const revision: WikiRevision = {
      id: revisionId,
      timestamp,
      author,
      reason: reason ?? 'Updated via AutoMod Builder app',
    };

    // Get existing revisions
    const existingRaw = await redis.get(wikiRevisionsKey(subredditName));
    const existingRevisions: WikiRevision[] = existingRaw ? JSON.parse(existingRaw) : [];

    // Add new revision at the beginning
    const updatedRevisions = [revision, ...existingRevisions].slice(0, 50); // Keep last 50 revisions

    // Save revisions
    await redis.set(wikiRevisionsKey(subredditName), JSON.stringify(updatedRevisions));

    // Save revision content
    await redis.set(wikiRevisionContentKey(subredditName, revisionId), content);

    console.log('[AutoModService] Added revision to history:', revisionId);
  } catch (error) {
    console.warn('[AutoModService] Failed to add revision to history:', error);
    // Don't throw - this is a non-critical feature
  }
}

/**
 * Fetch wiki revision history from local Redis storage.
 * This provides a workaround since Devvit doesn't allow direct HTTP requests to oauth.reddit.com.
 */
export async function getWikiRevisions(
  subredditName: string,
  limit: number = 50
): Promise<WikiRevision[]> {
  try {
    const raw = await redis.get(wikiRevisionsKey(subredditName));
    if (!raw) return [];

    const revisions: WikiRevision[] = JSON.parse(raw);
    return revisions.slice(0, limit);
  } catch (error) {
    console.error('[AutoModService] Failed to fetch wiki revisions from Redis:', error);
    return [];
  }
}

/**
 * Get the content of a specific wiki revision from local Redis storage.
 * This provides a workaround since Devvit doesn't allow direct HTTP requests to oauth.reddit.com.
 */
export async function getWikiRevisionContent(
  subredditName: string,
  revisionId: string
): Promise<string> {
  try {
    const content = await redis.get(wikiRevisionContentKey(subredditName, revisionId));
    return content ?? '';
  } catch (error) {
    console.error('[AutoModService] Failed to fetch revision content from Redis:', error);
    return '';
  }
}

// ============================================================================
// END NEW CODE
// ============================================================================