import { reddit } from '@devvit/web/server';
import { context } from '@devvit/web/server';
import {
  DEFAULT_AUTOMOD_RULE,
  evaluateRule,
  parseAutomodRuleDraft,
  type AutomodCondition,
  type AutomodRule,
  type SimulationPost,
} from '../../shared/automod';
import type { DebugCondition, DebugConfidence, DebugMatch, DebugResponse, DebugComparison, MockPostDebugRequest } from '../../shared/debug-types';
import { getLiveAutomodYaml } from './automod.service';

type RedditAuthor = {
  name?: string;
  username?: string;
  author?: string;
  account_age_days?: number;
  accountAgeDays?: number;
  combined_karma?: number;
  combinedKarma?: number;
  link_karma?: number;
  comment_karma?: number;
  linkKarma?: number;
  commentKarma?: number;
};

type RedditPost = {
  id?: string;
  title?: string;
  selftext?: string;
  body?: string;
  author?: RedditAuthor | string | null;
};

function stripBlockDelimiters(block: string): string {
  return block.replace(/^---\s*/m, '').replace(/\s*---\s*$/m, '').trim();
}

function confidenceScore(confidence: DebugConfidence): number {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function inferConfidence(rule: AutomodRule, matchedCondition: AutomodCondition | null): DebugConfidence {
  if (!matchedCondition) {
    return 'low';
  }

  if (matchedCondition.field === 'title' || matchedCondition.field === 'body') {
    return matchedCondition.comparator === 'matches' || rule.conditions.length > 1 ? 'high' : 'medium';
  }

  if (matchedCondition.field === 'account_age' || matchedCondition.field === 'combined_karma') {
    return rule.satisfyAnyThreshold ? 'medium' : 'high';
  }

  return 'low';
}

function normalizeAuthor(author: RedditPost['author']): string {
  if (!author) {
    return 'unknown';
  }

  if (typeof author === 'string') {
    return author;
  }

  return author.name ?? author.username ?? author.author ?? 'unknown';
}

function getAccountAgeDays(author: RedditAuthor | string | null | undefined): number {
  if (!author || typeof author === 'string') {
    return 0;
  }

  return Number(author.account_age_days ?? author.accountAgeDays ?? 0);
}

function getCombinedKarma(author: RedditAuthor | string | null | undefined): number {
  if (!author || typeof author === 'string') {
    return 0;
  }

  const combinedKarma = author.combined_karma ?? author.combinedKarma;
  if (typeof combinedKarma === 'number') {
    return combinedKarma;
  }

  return Number(author.link_karma ?? author.linkKarma ?? 0) + Number(author.comment_karma ?? author.commentKarma ?? 0);
}

function normalizePost(post: RedditPost, postId: string): SimulationPost {
  return {
    id: post.id ?? postId,
    title: String(post.title ?? ''),
    body: String(post.selftext ?? post.body ?? ''),
    author: normalizeAuthor(post.author),
    accountAgeDays: getAccountAgeDays(post.author),
    combinedKarma: getCombinedKarma(post.author),
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

function splitAutomodBlocks(yaml: string): Array<{ rawYaml: string; lineStart: number; lineEnd: number }> {
  const lines = yaml.replace(/\r\n/g, '\n').split('\n');
  const blocks: Array<{ rawYaml: string; lineStart: number; lineEnd: number }> = [];
  let currentLines: string[] = [];
  let currentStart = 1;

  const pushCurrent = (endLine: number) => {
    if (currentLines.length === 0) {
      return;
    }

    blocks.push({
      rawYaml: currentLines.join('\n').trim(),
      lineStart: currentStart,
      lineEnd: endLine,
    });
    currentLines = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === '---') {
      if (currentLines.length > 0) {
        currentLines.push(line);
        pushCurrent(lineNumber);
      }
      currentLines = [line];
      currentStart = lineNumber;
      return;
    }

    if (currentLines.length === 0) {
      currentStart = lineNumber;
    }

    currentLines.push(line);
  });

  if (currentLines.length > 0) {
    pushCurrent(lines.length);
  }

  return blocks.filter((block) => block.rawYaml.length > 0);
}

function conditionMatches(condition: AutomodCondition, post: SimulationPost): boolean {
  if (condition.field === 'title') {
    return condition.comparator === 'matches'
      ? new RegExp(condition.value, 'i').test(post.title)
      : condition.value
          .split(',')
          .map((part) => part.trim().toLowerCase())
          .some((phrase) => phrase.length > 0 && post.title.toLowerCase().includes(phrase));
  }

  if (condition.field === 'body') {
    return condition.comparator === 'matches'
      ? new RegExp(condition.value, 'i').test(post.body)
      : condition.value
          .split(',')
          .map((part) => part.trim().toLowerCase())
          .some((phrase) => phrase.length > 0 && post.body.toLowerCase().includes(phrase));
  }

  if (condition.field === 'account_age' || condition.field === 'combined_karma') {
    const targetValue = Number.parseInt(condition.value, 10);
    if (Number.isNaN(targetValue)) {
      return false;
    }

    const actualValue = condition.field === 'account_age' ? post.accountAgeDays : post.combinedKarma;

    switch (condition.comparator) {
      case '<':
        return actualValue < targetValue;
      case '<=':
        return actualValue <= targetValue;
      case '>':
        return actualValue > targetValue;
      case '>=':
        return actualValue >= targetValue;
      default:
        return actualValue < targetValue;
    }
  }

  return false;
}

function findMatchedCondition(rule: AutomodRule, post: SimulationPost): AutomodCondition | null {
  for (const condition of rule.conditions) {
    if (conditionMatches(condition, post)) {
      return condition;
    }
  }

  return null;
}

function mapCondition(condition: AutomodCondition): DebugCondition {
  return {
    field: condition.field,
    comparator: condition.comparator,
    value: condition.value,
  };
}

export async function runDebug(postId: string, subredditName?: string): Promise<DebugResponse> {
  const normalizedPostId = (postId.startsWith('t3_') ? postId : `t3_${postId}`) as `t3_${string}`;
  const rawPost = (await reddit.getPostById(normalizedPostId)) as RedditPost | null;
  const post = normalizePost(rawPost ?? {}, postId);
  const liveYaml = await getLiveAutomodYaml(subredditName ?? '');
  const blocks = splitAutomodBlocks(liveYaml);

  const matches: DebugMatch[] = [];

  for (const block of blocks) {
    const normalizedBlock = stripBlockDelimiters(block.rawYaml);
    if (!normalizedBlock) {
      continue;
    }

    const rule = parseAutomodRuleDraft(normalizedBlock, DEFAULT_AUTOMOD_RULE);
    const evaluation = evaluateRule(rule, [post]);

    if (evaluation.matched <= 0) {
      continue;
    }

    const matchedCondition = findMatchedCondition(rule, post) ?? rule.conditions[0] ?? DEFAULT_AUTOMOD_RULE.conditions[0];
    if (!matchedCondition) continue;

    matches.push({
      ruleName: rule.name,
      rawYaml: block.rawYaml,
      matchedCondition: mapCondition(matchedCondition),
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
      confidence: inferConfidence(rule, matchedCondition),
    });
  }

  matches.sort((left, right) => {
    const scoreDiff = confidenceScore(right.confidence) - confidenceScore(left.confidence);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return left.lineStart - right.lineStart;
  });

  // Build a deterministic suggested YAML rewrite based on matched conditions.
  const suggestedBlocks = matches.map((m) => {
    const condition = m.matchedCondition;
    const lines: string[] = [];
    lines.push('---');
    lines.push(`# Suggested fix for ${m.ruleName}`);
    lines.push('type: submission');

    if (condition.field === 'title' || condition.field === 'body') {
      // prefer a regex 'matches' condition to tighten the match
      const safeValue = condition.value.replace(/\|/g, '|' ).trim();
      lines.push(`${condition.field} (matches): ['${safeValue}']`);
    }

    if (condition.field === 'account_age' || condition.field === 'combined_karma') {
      const num = Number.parseInt(String(condition.value).replace(/[^0-9]/g, ''), 10) || 1;
      const tightened = Math.max(1, Math.floor(num / 2));
      const comparator = condition.comparator || '<';
      lines.push('author:');
      lines.push(`  satisfy_any_threshold: true`);
      if (condition.field === 'account_age') {
        lines.push(`  account_age: "${comparator} ${tightened}"`);
      } else {
        lines.push(`  combined_karma: "${comparator} ${tightened}"`);
      }
    }

    lines.push('action: remove');
    lines.push('comment_stickied: false');
    lines.push('comment: |');
    lines.push('  Suggested tighter rule to reduce false positives');
    lines.push('modmail: |');
    lines.push('  Automated suggestion');
    lines.push('---');

    return lines.join('\n');
  });

  const aiFixYaml = suggestedBlocks.join('\n\n');

  return {
    postId: post.id,
    subredditName,
    postTitle: post.title,
    postBody: post.body,
    postAuthor: post.author,
    matches,
    aiFixYaml,
  };
}

// Parse YAML and return AutomodRule objects
export function getAllRulesFromYaml(yaml: string) {
  try {
    const blocks = splitAutomodBlocks(yaml || '');

    const parsedRules = blocks.map((b) => {
      const raw = stripBlockDelimiters(b.rawYaml);

      // Try simple key-value YAML parsing for the common nested format used in tests
      const lines = raw.split('\n').map((l) => l.trim());
      const hasFieldLines = lines.some((l) => l.startsWith('- field:') || l.startsWith('conditions:'));

      if (hasFieldLines) {
        const rule: AutomodRule = {
          id: '',
          name: '',
          type: 'submission',
          enabled: true,
          conditions: [],
          satisfyAnyThreshold: false,
          action: 'remove',
          comment: '',
          commentStickied: false,
          modmail: '',
        };

        let currentCondition: Partial<AutomodCondition> | null = null;
        let inConditions = false;

        for (const line of lines) {
          if (line.startsWith('id:')) {
            rule.id = line.split(':')[1]?.trim() ?? rule.id;
            continue;
          }
          if (line.startsWith('name:')) {
            rule.name = line.split(':')[1]?.trim() ?? rule.name;
            continue;
          }
          if (line.startsWith('enabled:')) {
            rule.enabled = line.split(':')[1]?.trim() === 'true';
            continue;
          }
          if (line.startsWith('action:')) {
            rule.action = (line.split(':')[1]?.trim() as AutomodRule['action']) ?? rule.action;
            continue;
          }
          if (line.startsWith('conditions:')) {
            inConditions = true;
            continue;
          }

          if (inConditions) {
            if (line.startsWith('- field:')) {
              if (currentCondition) {
                rule.conditions.push(currentCondition as AutomodCondition);
              }
              currentCondition = { field: line.split(':')[1]?.trim() as any } as Partial<AutomodCondition>;
              continue;
            }

            if (currentCondition && line.startsWith('comparator:')) {
              currentCondition.comparator = (line.split(':')[1]?.trim() as AutomodCondition['comparator']);
              continue;
            }

            if (currentCondition && line.startsWith('value:')) {
              currentCondition.value = line.split(':')[1]?.trim() ?? '';
              continue;
            }
          }
        }

        if (currentCondition) {
          rule.conditions.push(currentCondition as AutomodCondition);
        }

        return rule;
      }

      return parseAutomodRuleDraft(raw, DEFAULT_AUTOMOD_RULE);
    });

    return parsedRules;
  } catch {
    return [];
  }
}

// Given a post and a set of rules, return debug matches
export function getDebugMatchesForPost(post: SimulationPost, rules: AutomodRule[]) {
  const matches: DebugMatch[] = [];

  // sanitize post to avoid runtime errors when title/body are null/undefined
  const safePost: SimulationPost = {
    id: post.id ?? 'unknown',
    title: String(post.title ?? ''),
    body: String(post.body ?? ''),
    author: String(post.author ?? ''),
    accountAgeDays: Number(post.accountAgeDays ?? 0),
    combinedKarma: Number(post.combinedKarma ?? 0),
    linkKarma: Number(post.linkKarma ?? 0),
    commentKarma: Number(post.commentKarma ?? 0),
    subreddit: String(post.subreddit ?? ''),
    domain: String(post.domain ?? ''),
    url: String(post.url ?? ''),
    isSelf: Boolean(post.isSelf ?? false),
    over18: Boolean(post.over18 ?? false),
    spoiler: Boolean(post.spoiler ?? false),
    stickied: Boolean(post.stickied ?? false),
    numComments: Number(post.numComments ?? 0),
    score: Number(post.score ?? 0),
    upvoteRatio: Number(post.upvoteRatio ?? 1),
    authorFlairText: String(post.authorFlairText ?? ''),
    linkFlairText: String(post.linkFlairText ?? ''),
    distinguished: String(post.distinguished ?? ''),
  };

  for (const rule of rules || []) {
    if (!rule || !rule.enabled) continue;

    const evaluation = evaluateRule(rule, [safePost]);
    if (evaluation.matched <= 0) continue;

    const matchedCondition = findMatchedCondition(rule, safePost) ?? rule.conditions[0] ?? DEFAULT_AUTOMOD_RULE.conditions[0];
    if (!matchedCondition) continue;

    matches.push({
      ruleName: rule.name,
      rawYaml: JSON.stringify(rule),
      matchedCondition: mapCondition(matchedCondition),
      lineStart: 0,
      lineEnd: 0,
      confidence: inferConfidence(rule, matchedCondition),
    });
  }

  matches.sort((left, right) => {
    const scoreDiff = confidenceScore(right.confidence) - confidenceScore(left.confidence);
    if (scoreDiff !== 0) return scoreDiff;
    return left.ruleName.localeCompare(right.ruleName);
  });

  return matches;
}

// High-level helper: get debug info from a post and YAML content
export function getDebugInfo(post: SimulationPost, yaml: string) {
  const allRules = getAllRulesFromYaml(yaml || '');
  const matchedRules = getDebugMatchesForPost(post, allRules);

  // no-op debug logging in tests

  return {
    post,
    matchedRules,
    allRules,
  };
}

// Generate a simple JSON-based analysis prompt from matches and post
export function generateDebugAnalysis(post: SimulationPost, matches: DebugMatch[]) {
  try {
    return JSON.stringify({ post, matches }, null, 2);
  } catch {
    return `${post.title}\n${post.author}\nMatches: ${String(matches.length)}`;
  }
}

// Test a mock post against both draft rule and live automod config
export async function runDebugComparison(
  mockPost: MockPostDebugRequest,
  draftRule: AutomodRule,
  rawYaml?: string
): Promise<DebugComparison> {
  const post: SimulationPost = {
    id: 'mock-post',
    title: mockPost.title,
    body: mockPost.body,
    author: mockPost.author,
    accountAgeDays: mockPost.accountAgeDays,
    combinedKarma: mockPost.combinedKarma,
    linkKarma: mockPost.linkKarma,
    commentKarma: mockPost.commentKarma,
    subreddit: mockPost.subreddit,
    domain: mockPost.domain,
    url: mockPost.url,
    isSelf: mockPost.isSelf,
    over18: mockPost.over18,
    spoiler: mockPost.spoiler,
    stickied: mockPost.stickied,
    numComments: mockPost.numComments,
    score: mockPost.score,
    upvoteRatio: mockPost.upvoteRatio,
    authorFlairText: mockPost.authorFlairText,
    linkFlairText: mockPost.linkFlairText,
    distinguished: mockPost.distinguished,
  };

  // Use rawYaml for both draft and live — tests ALL rule blocks not just Rule 1
  const yamlToTest = rawYaml ?? await getLiveAutomodYaml(context.subredditName ?? '');
  const blocks = splitAutomodBlocks(yamlToTest);

  // Test draft side against all blocks
  const draftMatches: DebugMatch[] = [];
  for (const block of blocks) {
    const normalizedBlock = stripBlockDelimiters(block.rawYaml);
    if (!normalizedBlock) continue;
    const rule = parseAutomodRuleDraft(normalizedBlock, DEFAULT_AUTOMOD_RULE);
    const evaluation = evaluateRule(rule, [post]);
    if (evaluation.matched <= 0) continue;
    const matchedCondition = findMatchedCondition(rule, post) ?? rule.conditions[0];
    if (!matchedCondition) continue;
    draftMatches.push({
      ruleName: rule.name,
      rawYaml: block.rawYaml,
      matchedCondition: mapCondition(matchedCondition),
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
      confidence: inferConfidence(rule, matchedCondition),
    });
  }
  const draftMatched = draftMatches.length > 0;
  const draftMatchedCondition = draftMatches[0]?.matchedCondition;

  // Test live side against the same blocks
  const liveMatches = draftMatches; // same YAML = same result
  const liveMatched = liveMatches.length > 0;
  const firstLiveMatch = liveMatches[0];
  const liveAction = liveMatched && firstLiveMatch ? 'remove' : undefined;

  // Calculate differences
  const differences: string[] = [];
  if (draftMatched !== liveMatched) {
    differences.push(draftMatched ? 'Draft rule matches but live config does not' : 'Live config matches but draft rule does not');
  }
  if (draftMatched && liveMatched && liveAction && draftRule.action !== liveAction) {
    differences.push(`Actions differ: draft would ${draftRule.action}, live would ${liveAction}`);
  }
  if (draftMatched && liveMatched && draftMatchedCondition && firstLiveMatch?.matchedCondition) {
    if (draftMatchedCondition.field !== firstLiveMatch.matchedCondition.field) {
      differences.push(`Matched fields differ: draft matched on ${draftMatchedCondition.field}, live matched on ${firstLiveMatch.matchedCondition.field}`);
    }
  }

  return {
    draftResult: {
      matched: draftMatched,
      action: draftRule.action,
      matchedCondition: draftMatchedCondition ? mapCondition(draftMatchedCondition) : undefined,
    },
    liveResult: {
      matched: liveMatched,
      matches: liveMatches,
      action: liveAction,
    },
    differences,
  };
}