import type { DebugMatch } from './debug-types';

export type RuleStageMode = 'code' | 'chat' | 'decoder' | 'escape-hatch' | 'debug';

export type YamlLimitation =
  | 'external-api'
  | 'json-parsing'
  | 'database-check'
  | 'complex-math'
  | 'conditional-logic'
  | 'state-management'
  | 'batch-processing'
  | 'other';

export type YamlLimitationAnalysis = {
  hasLimitation: boolean;
  limitation: YamlLimitation | null;
  explanation: string;
  recommendation: 'yaml' | 'typescript';
};

export type EscapeHatchCode = {
  triggerCode: string;
  description: string;
  limitations: string[];
  installationSteps: string[];
  confidence: 'high' | 'medium' | 'low';
};

export type ObfuscationTrick =
  | 'homoglyph'
  | 'zero-width'
  | 'look-alike'
  | 'separator-noise'
  | 'evasive-phrasing'
  | 'mixed-script';

export type DecoderAnalysis = {
  tricks: ObfuscationTrick[];
  explanation: string;
  regexPattern: string;
  automodYaml: string;
  confidence: 'high' | 'medium' | 'low';
};

export function buildDecoderAnalysisPrompt(examples: [string, string, string]): string {
  return [
    'You are analyzing spam messages that bypass moderation by using Unicode and phrasing obfuscation.',
    'Inspect all three examples and identify the shared tricks used across the campaign.',
    'Return a single JSON object only. Do not wrap it in markdown fences or add commentary.',
    'The JSON object must match this shape exactly:',
    '{',
    '  "tricks": ["homoglyph" | "zero-width" | "look-alike" | "separator-noise" | "evasive-phrasing" | "mixed-script"],',
    '  "explanation": "human readable breakdown of each trick and how it works",',
    '  "regexPattern": "a single regex string that would match the campaign",',
    '  "automodYaml": "AutoModerator YAML snippet that applies the regex pattern",',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    'Example 1:',
    examples[0],
    '',
    'Example 2:',
    examples[1],
    '',
    'Example 3:',
    examples[2],
  ].join('\n');
}

export type AutomodAction = 'remove' | 'approve' | 'report';

export type AutomodComparator = 'includes' | 'matches' | '<' | '>' | '<=' | '>=';

export type AutomodCondition = {
  field: 'title' | 'body' | 'account_age' | 'combined_karma';
  comparator: AutomodComparator;
  value: string;
};

export type AutomodRule = {
  id: string;
  name: string;
  type: 'submission';
  enabled: boolean;
  conditions: AutomodCondition[];
  satisfyAnyThreshold: boolean;
  action: AutomodAction;
  comment: string;
  commentStickied: boolean;
  modmail: string;
};

export type SimulationPost = {
  id: string;
  title: string;
  body: string;
  author: string;
  accountAgeDays: number;
  combinedKarma: number;
  linkKarma: number;
  commentKarma: number;
  subreddit: string;
  domain: string;
  url: string;
  isSelf: boolean;
  over18: boolean;
  spoiler: boolean;
  stickied: boolean;
  numComments: number;
  score: number;
  upvoteRatio: number;
  authorFlairText: string;
  linkFlairText: string;
  distinguished: string;
};

export type SimulationOutcome = 'remove' | 'approve' | 'report';

export type SimulationItem = {
  id: string;
  title: string;
  author: string;
  outcome: SimulationOutcome;
  reason: string;
};

export type SimulationResult = {
  matched: number;
  removed: number;
  approved: number;
  reported: number;
  items: SimulationItem[];
};

export type RuleChatSuggestion = {
  title: string;
  description: string;
  rule: Partial<AutomodRule>;
};

export function buildDebugPrompt(post: SimulationPost, matchedRules: DebugMatch[]): string {
  const matchSummary = matchedRules
    .map((match, index) => {
      const condition = match.matchedCondition;

      return [
        `Match ${index + 1}:`,
        `Rule name: ${match.ruleName}`,
        `Confidence: ${match.confidence}`,
        `Line range: ${match.lineStart}-${match.lineEnd}`,
        `Matched condition: ${condition.field} ${condition.comparator} ${condition.value}`,
        'Rule YAML:',
        match.rawYaml,
      ].join('\n');
    })
    .join('\n\n');

  return [
    'You are explaining why AutoModerator matched a Reddit post and how to tighten the rule with a minimal rewrite.',
    'Return a single JSON object only. Do not include markdown fences or commentary.',
    'The JSON object must match this shape exactly:',
    '{',
    '  "explanation": "short human readable explanation of why the rule fired",',
    '  "fixedYaml": "a minimal YAML rewrite that preserves the intent while reducing false positives",',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    'Post title:',
    post.title,
    '',
    'Post body:',
    post.body,
    '',
    'Post author:',
    post.author,
    '',
    'Matched rules:',
    matchSummary || 'No matched rules were detected.',
    '',
    'Keep the rewrite focused on the matched blocks only. Do not invent unrelated rule changes.',
  ].join('\n');
}

export type UnifiedAnalysis = {
  needsYaml: boolean;
  needsTypeScript: boolean;
  yamlPart: string;
  typescriptPart: string;
  explanation: string;
};

export function buildUnifiedAnalysisPrompt(request: string): string {
  return [
    'You are analyzing a Reddit moderation request to decide what can be handled by AutoModerator YAML vs Devvit TypeScript triggers.',
    'Return a single JSON object only. No markdown fences.',
    '',
    'Rules:',
    '- AutoMod YAML can handle: keyword matching, karma thresholds, account age, flair checks, domain blocking.',
    '- TypeScript is needed for: external API calls, Redis/database lookups, JSON body parsing, stateful logic, sending modmail conditionally.',
    '- Many requests need BOTH: YAML for the cheap pattern checks, TypeScript for the logic YAML cannot do.',
    '',
    'Return this shape:',
    '{',
    '  "needsYaml": boolean,',
    '  "needsTypeScript": boolean,',
    '  "yamlPart": "description of what YAML will handle, empty string if none",',
    '  "typescriptPart": "description of what TypeScript will handle, empty string if none",',
    '  "explanation": "one sentence explaining why"',
    '}',
    '',
    'Moderator request:',
    request,
  ].join('\n');
}

export function buildEscapeHatchPrompt(request: string): string {
  return [
    'You are helping a moderator determine whether AutoModerator YAML can handle a request.',
    'First decide whether the request can be expressed natively in YAML.',
    'If YAML can handle it, return a JSON object that says so.',
    'If YAML cannot handle it, explain the limitation and recommend TypeScript.',
    '',
    'AutoModerator YAML can handle text matching, thresholds, and simple rule actions.',
    'AutoModerator YAML cannot handle external API calls, JSON parsing, database checks, complex math, stateful logic, or batch processing.',
    '',
    'IMPORTANT: Return ONLY the JSON object below.',
    'Do NOT use markdown code fences (```json or ```).',
    'Do NOT include any other text, explanation, or preamble.',
    'Output the raw JSON object starting with { and ending with }.',
    '',
    'JSON schema:',
    '{',
    '  "hasLimitation": boolean,',
    '  "limitation": "external-api" | "json-parsing" | "database-check" | "complex-math" | "conditional-logic" | "state-management" | "batch-processing" | "other" | null,',
    '  "recommendation": "yaml" | "typescript"',
    '}',
    '',
    'Moderator request:',
    request,
  ].join('\n');
}

export function buildEscapeHatchAnalysisPrompt(request: string): string {
  return [
    buildEscapeHatchPrompt(request),
    '',
    'Be strict. If the request requires any capability outside native AutoModerator YAML, mark hasLimitation as true and recommend TypeScript.',
    'CRITICAL: Output ONLY the JSON object. No conversational text, no "Here is the JSON", no explanations. Just the JSON.',
  ].join('\n');
}

export function buildEscapeHatchGenerationPrompt(request: string): string {
  return [
    'You are generating a Devvit TypeScript moderation trigger for a request that AutoModerator YAML cannot handle.',
    'Create a focused onPostSubmit trigger and keep the code production-safe and readable.',
    '',
    'Requirements:',
    '- Return a single JSON object only.',
    '- Include a complete TypeScript trigger in the code string.',
    '- Prefer simple, safe logic with clear error handling.',
    '- CRITICAL: Use the EXACT field names, values, and URLs from the moderator request below.',
    '- CRITICAL: If the request says "returns verified: false", the code must check result.verified === false, NOT result.isSpam.',
    '- CRITICAL: If the request gives a specific URL, use that exact URL in the fetch() call.',
    '- Include installation steps that explain how to paste the trigger into the app.',
    '- List practical limitations honestly.',
    '',
    'Return this shape:',
    '{',
    '  "code": "full TypeScript code as a string",',
    '  "description": "brief explanation",',
    '  "limitations": ["string"],',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    'Moderator request:',
    request,
  ].join('\n');
}

export const DEFAULT_AUTOMOD_RULE: AutomodRule = {
  id: 'rule-stage-draft',
  name: '',
  type: 'submission',
  enabled: true,
  conditions: [],
  satisfyAnyThreshold: true,
  action: 'remove',
  comment: '',
  commentStickied: false,
  modmail: '',
};

const CONDITION_FIELD_LABELS: Record<AutomodCondition['field'], string> = {
  title: 'title',
  body: 'body',
  account_age: 'author.account_age',
  combined_karma: 'author.combined_karma',
};

function serializeTextCondition(field: 'title' | 'body', condition: AutomodCondition | undefined): string | null {
  if (!condition) {
    return null;
  }

  const comparatorLabel = condition.comparator === 'matches' ? 'matches' : 'includes';
  return `${field} (${comparatorLabel}): ['${condition.value}']`;
}

function extractBracketValue(line: string): string {
  const valueMatch = line.match(/\[(.*)\]/);
  return valueMatch?.[1]?.replaceAll("'", '').trim() ?? '';
}

function matchesTextCondition(condition: AutomodCondition, text: string): boolean {
  if (condition.comparator === 'matches') {
    try {
      return new RegExp(condition.value, 'i').test(text);
    } catch {
      return false;
    }
  }

  const parts = condition.value.split(/[,|]/).map((part) => part.trim().toLowerCase());

  const result = parts.some((phrase) => phrase.length > 0 && text.toLowerCase().includes(phrase));

  return result;
}

function matchesNumericCondition(condition: AutomodCondition, actualValue: number): boolean {
  const targetValue = Number.parseInt(condition.value, 10);

  if (Number.isNaN(targetValue)) {
    return false;
  }

  switch (condition.comparator) {
    case '<':
      return actualValue < targetValue;
    case '<=':
      return actualValue <= targetValue;
    case '>':
      return actualValue > targetValue;
    case '>=':
      return actualValue >= targetValue;
    case 'matches':
      return false;
    default:
      return actualValue < targetValue;
  }
}

export function serializeAutomodRule(rule: AutomodRule): string {
  // Don't serialize if the rule is empty (no name, no conditions, no comment)
  if (!rule.name && rule.conditions.length === 0 && !rule.comment && !rule.modmail) {
    return '';
  }

  const titleCondition = rule.conditions.find((condition) => condition.field === 'title');
  const bodyCondition = rule.conditions.find((condition) => condition.field === 'body');
  const accountAgeCondition = rule.conditions.find((condition) => condition.field === 'account_age');
  const karmaCondition = rule.conditions.find((condition) => condition.field === 'combined_karma');

  return [
    '---',
    rule.name ? `# ${rule.name}` : null,
    `type: ${rule.type}`,
    serializeTextCondition('title', titleCondition),
    serializeTextCondition('body', bodyCondition),
    'author:',
    `  satisfy_any_threshold: ${rule.satisfyAnyThreshold ? 'true' : 'false'}`,
    accountAgeCondition ? `  account_age: "${accountAgeCondition.comparator} ${accountAgeCondition.value}"` : null,
    karmaCondition ? `  combined_karma: "${karmaCondition.comparator} ${karmaCondition.value}"` : null,
    `action: ${rule.action}`,
    `comment_stickied: ${rule.commentStickied ? 'true' : 'false'}`,
    rule.comment ? 'comment: |' : null,
    ...(rule.comment ? rule.comment.split('\n').map((line) => `  ${line}`) : []),
    rule.modmail ? 'modmail: |' : null,
    ...(rule.modmail ? rule.modmail.split('\n').map((line) => `  ${line}`) : []),
    '---',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function readBlockValue(lines: string[], startIndex: number): { value: string; nextIndex: number } {
  const collected: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const currentLine = lines[index];

    if (!currentLine || !currentLine.startsWith('  ')) {
      break;
    }

    collected.push(currentLine.slice(2));
    index += 1;
  }

  return {
    value: collected.join('\n').trim(),
    nextIndex: index,
  };
}

export function parseAutomodRuleDraft(draft: string, fallback: AutomodRule = DEFAULT_AUTOMOD_RULE): AutomodRule {
  const lines = draft.split('\n');
  const nextRule: AutomodRule = {
    ...fallback,
    conditions: fallback.conditions.map((condition) => ({ ...condition })),
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';

    if (line.startsWith('# ')) {
      nextRule.name = line.slice(2).trim();
      continue;
    }

    if (line.startsWith('type:')) {
      nextRule.type = 'submission';
      continue;
    }

    if (line.startsWith('title (includes):') || line.startsWith('title (matches):')) {
      const titleValue = extractBracketValue(line);
      const titleCondition = nextRule.conditions.find((condition) => condition.field === 'title');

      if (titleCondition) {
        titleCondition.comparator = line.includes('(matches)') ? 'matches' : 'includes';
        titleCondition.value = titleValue;
      }
      continue;
    }

    if (line.startsWith('body (includes):') || line.startsWith('body (matches):')) {
      const bodyValue = extractBracketValue(line);
      const bodyCondition = nextRule.conditions.find((condition) => condition.field === 'body');

      if (bodyCondition) {
        bodyCondition.comparator = line.includes('(matches)') ? 'matches' : 'includes';
        bodyCondition.value = bodyValue;
      }
      continue;
    }

    if (line === 'author:') {
      continue;
    }

    if (line.startsWith('satisfy_any_threshold:')) {
      nextRule.satisfyAnyThreshold = line.includes('true');
      continue;
    }

    if (line.startsWith('account_age:')) {
      const valueMatch = line.match(/"([<>]=?)\s*(.*)"/);
      const accountAgeCondition = nextRule.conditions.find((condition) => condition.field === 'account_age');
      if (accountAgeCondition) {
        accountAgeCondition.comparator = (valueMatch?.[1] ?? '<') as AutomodComparator;
        accountAgeCondition.value = valueMatch?.[2]?.trim() ?? accountAgeCondition.value;
      }
      continue;
    }

    if (line.startsWith('combined_karma:')) {
      const valueMatch = line.match(/"([<>]=?)\s*(.*)"/);
      const karmaCondition = nextRule.conditions.find((condition) => condition.field === 'combined_karma');
      if (karmaCondition) {
        karmaCondition.comparator = (valueMatch?.[1] ?? '<') as AutomodComparator;
        karmaCondition.value = valueMatch?.[2]?.trim() ?? karmaCondition.value;
      }
      continue;
    }

    if (line.startsWith('action:')) {
      nextRule.action = (line.split(':')[1]?.trim() ?? nextRule.action) as AutomodAction;
      continue;
    }

    if (line.startsWith('comment_stickied:')) {
      nextRule.commentStickied = line.includes('true');
      continue;
    }

    if (line === 'comment: |') {
      const parsed = readBlockValue(lines, index + 1);
      nextRule.comment = parsed.value || nextRule.comment;
      index = parsed.nextIndex - 1;
      continue;
    }

    if (line === 'modmail: |') {
      const parsed = readBlockValue(lines, index + 1);
      nextRule.modmail = parsed.value || nextRule.modmail;
      index = parsed.nextIndex - 1;
    }
  }

  return nextRule;
}

export function createDefaultSimulationPosts(): SimulationPost[] {
  return [
    {
      id: 'post-1',
      title: 'Look what I got in the mail today',
      body: 'Brand launch teaser',
      author: 'newshopper88',
      accountAgeDays: 12,
      combinedKarma: 14,
      linkKarma: 10,
      commentKarma: 4,
      subreddit: 'r/shopping',
      domain: 'self.shopping',
      url: 'https://reddit.com/r/shopping/comments/abc123',
      isSelf: true,
      over18: false,
      spoiler: false,
      stickied: false,
      numComments: 5,
      score: 3,
      upvoteRatio: 0.6,
      authorFlairText: '',
      linkFlairText: '',
      distinguished: '',
    },
    {
      id: 'post-2',
      title: 'Weekly discussion thread',
      body: 'Thoughts on the latest release',
      author: 'communityhelper',
      accountAgeDays: 418,
      combinedKarma: 1204,
      linkKarma: 800,
      commentKarma: 404,
      subreddit: 'r/technology',
      domain: 'self.technology',
      url: 'https://reddit.com/r/technology/comments/def456',
      isSelf: true,
      over18: false,
      spoiler: false,
      stickied: true,
      numComments: 150,
      score: 250,
      upvoteRatio: 0.85,
      authorFlairText: 'Moderator',
      linkFlairText: 'Discussion',
      distinguished: 'moderator',
    },
    {
      id: 'post-3',
      title: 'Just arrived - shipping update',
      body: 'This feels like another promo post',
      author: 'vendorthrowaway',
      accountAgeDays: 8,
      combinedKarma: 2,
      linkKarma: 1,
      commentKarma: 1,
      subreddit: 'r/deals',
      domain: 'imgur.com',
      url: 'https://imgur.com/gallery/xyz789',
      isSelf: false,
      over18: false,
      spoiler: false,
      stickied: false,
      numComments: 2,
      score: -5,
      upvoteRatio: 0.3,
      authorFlairText: '',
      linkFlairText: 'Promo',
      distinguished: '',
    },
    {
      id: 'post-4',
      title: 'Grab yours here before it is gone',
      body: 'Limited offer',
      author: 'lowkarmaaccount',
      accountAgeDays: 54,
      combinedKarma: 32,
      linkKarma: 20,
      commentKarma: 12,
      subreddit: 'r/gaming',
      domain: 'amazon.com',
      url: 'https://amazon.com/product/123',
      isSelf: false,
      over18: false,
      spoiler: false,
      stickied: false,
      numComments: 8,
      score: 1,
      upvoteRatio: 0.45,
      authorFlairText: '',
      linkFlairText: 'Deal',
      distinguished: '',
    },
  ];
}

export function evaluateRule(rule: AutomodRule, posts = createDefaultSimulationPosts()): SimulationResult {
  const items: SimulationItem[] = [];
  let removed = 0;
  let approved = 0;
  let reported = 0;

  for (const post of posts) {
    const titleCondition = rule.conditions.find((condition) => condition.field === 'title');
    const bodyCondition = rule.conditions.find((condition) => condition.field === 'body');
    const accountAgeCondition = rule.conditions.find((condition) => condition.field === 'account_age');
    const karmaCondition = rule.conditions.find((condition) => condition.field === 'combined_karma');

    const titleMatch = titleCondition ? matchesTextCondition(titleCondition, post.title) : false;
    const bodyMatch = bodyCondition ? matchesTextCondition(bodyCondition, post.body) : false;

    const ageMatch = accountAgeCondition ? matchesNumericCondition(accountAgeCondition, post.accountAgeDays) : false;

    const karmaMatch = karmaCondition ? matchesNumericCondition(karmaCondition, post.combinedKarma) : false;

    const textConditions = [titleCondition, bodyCondition].filter((condition): condition is AutomodCondition => !!condition);

    const textMatch = textConditions.length === 0 ? true : (!titleCondition || titleMatch) && (!bodyCondition || bodyMatch);

    const numericMatches: boolean[] = [];
    if (accountAgeCondition) numericMatches.push(ageMatch);
    if (karmaCondition) numericMatches.push(karmaMatch);

    const thresholdMatch =
      numericMatches.length === 0
        ? true
        : rule.satisfyAnyThreshold
          ? numericMatches.some((v) => v)
          : numericMatches.every((v) => v);

    const shouldMatch = textMatch && thresholdMatch;

    if (shouldMatch) {
      items.push({
        id: post.id,
        title: post.title,
        author: post.author,
        outcome: rule.action,
        reason: `${rule.name} matched`,
      });

      if (rule.action === 'remove') {
        removed += 1;
      } else if (rule.action === 'report') {
        reported += 1;
      }
      continue;
    }

    items.push({
      id: post.id,
      title: post.title,
      author: post.author,
      outcome: 'approve',
      reason: 'No rule match',
    });
    approved += 1;
  }

  return {
    matched: items.length - approved,
    removed,
    approved,
    reported,
    items,
  };
}

export function describeCondition(condition: AutomodCondition): string {
  if (condition.field === 'title' || condition.field === 'body') {
    const comparatorLabel = condition.comparator === 'matches' ? 'matches' : 'includes';
    return `${CONDITION_FIELD_LABELS[condition.field]} (${comparatorLabel}) ${condition.value}`;
  }

  return `${CONDITION_FIELD_LABELS[condition.field]} ${condition.comparator} ${condition.value}`;
}

export type RichContext = {
  subredditName: string;
  subscribers: number;
  rules: { short_name: string; description?: string }[];
  liveYaml: string;
  postFlairs: string[];
  userFlairs: string[];
  removalReasons: string[];
  moderators: string[];
  blastSummary?: string;
};

export function buildRichContextPrompt(ctx: RichContext): string {
  const parts: string[] = [];

  parts.push(`Subreddit: r/${ctx.subredditName} (${ctx.subscribers.toLocaleString()} subscribers)`);

  if (ctx.rules.length > 0) {
    parts.push('\nCommunity rules:');
    ctx.rules.slice(0, 10).forEach((r) => {
      parts.push(`- ${r.short_name}${r.description ? ': ' + r.description.slice(0, 120) : ''}`);
    });
  }

  if (ctx.postFlairs.length > 0) {
    parts.push(`\nAvailable post flairs: ${ctx.postFlairs.join(', ')}`);
  }

  if (ctx.userFlairs.length > 0) {
    parts.push(`Available user flairs: ${ctx.userFlairs.join(', ')}`);
  }

  if (ctx.removalReasons.length > 0) {
    parts.push('\nStandard removal reasons (use these verbatim in AutoMod comments):');
    ctx.removalReasons.slice(0, 5).forEach((r) => parts.push(`- ${r}`));
  }

  if (ctx.liveYaml.trim()) {
    // Send only the rule names from live YAML, not the full text, to save tokens
    const ruleNames = ctx.liveYaml
      .split('---')
      .map((block) => block.match(/^#\s*(.+)$/m)?.[1]?.trim())
      .filter(Boolean);
    if (ruleNames.length > 0) {
      parts.push(`\nExisting AutoMod rules (${ruleNames.length} total): ${ruleNames.join(', ')}`);
    }
    // Include full live YAML so agent can avoid conflicts
    parts.push(`\nFull live AutoMod config:\n\`\`\`yaml\n${ctx.liveYaml.slice(0, 4000)}\n\`\`\``);
  }

  if (ctx.blastSummary) {
    parts.push(`\nLast blast radius result: ${ctx.blastSummary}`);
  }

  return parts.join('\n');
}