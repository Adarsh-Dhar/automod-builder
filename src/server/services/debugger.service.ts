import { reddit } from '@devvit/web/server';
import {
  DEFAULT_AUTOMOD_RULE,
  evaluateRule,
  parseAutomodRuleDraft,
  type AutomodCondition,
  type AutomodRule,
  type SimulationPost,
} from '../../shared/automod';
import type { DebugCondition, DebugConfidence, DebugMatch, DebugResponse } from '../../shared/debug-types';
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
  const rawPost = (await reddit.getPostById(postId)) as RedditPost | null;
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

  return {
    postId: post.id,
    subredditName,
    postTitle: post.title,
    postBody: post.body,
    postAuthor: post.author,
    matches,
    aiFixYaml: '',
  };
}