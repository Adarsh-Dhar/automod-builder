export type RuleStageMode = 'code' | 'drag' | 'chat' | 'decoder';

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

export const DEFAULT_AUTOMOD_RULE: AutomodRule = {
  id: 'drop-shipping-spam',
  name: 'Drop-shipping spam guard',
  type: 'submission',
  enabled: true,
  conditions: [
    {
      field: 'title',
      comparator: 'includes',
      value: 'look what i got, just arrived, grab yours here',
    },
    {
      field: 'account_age',
      comparator: '<',
      value: '30 days',
    },
    {
      field: 'combined_karma',
      comparator: '<',
      value: '50',
    },
  ],
  satisfyAnyThreshold: true,
  action: 'remove',
  comment:
    'Your post was automatically removed by our anti-spam filter. Please contact the moderators if you think this was a mistake.',
  commentStickied: true,
  modmail:
    'Potential drop-shipping spam removed: {{permalink}}\nUser: u/{{author}}\nTitle: {{title}}',
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

  return condition.value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .some((phrase) => phrase.length > 0 && text.toLowerCase().includes(phrase));
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
      return actualValue === targetValue;
    default:
      return actualValue < targetValue;
  }
}

export function serializeAutomodRule(rule: AutomodRule): string {
  const titleCondition = rule.conditions.find((condition) => condition.field === 'title');
  const bodyCondition = rule.conditions.find((condition) => condition.field === 'body');
  const accountAgeCondition = rule.conditions.find((condition) => condition.field === 'account_age');
  const karmaCondition = rule.conditions.find((condition) => condition.field === 'combined_karma');

  return [
    '---',
    `# ${rule.name}`,
    `type: ${rule.type}`,
    serializeTextCondition('title', titleCondition),
    serializeTextCondition('body', bodyCondition),
    'author:',
    `  satisfy_any_threshold: ${rule.satisfyAnyThreshold ? 'true' : 'false'}`,
    accountAgeCondition ? `  account_age: "${accountAgeCondition.comparator} ${accountAgeCondition.value}"` : null,
    karmaCondition ? `  combined_karma: "${karmaCondition.comparator} ${karmaCondition.value}"` : null,
    `action: ${rule.action}`,
    `comment_stickied: ${rule.commentStickied ? 'true' : 'false'}`,
    'comment: |',
    ...rule.comment.split('\n').map((line) => `  ${line}`),
    'modmail: |',
    ...rule.modmail.split('\n').map((line) => `  ${line}`),
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
    },
    {
      id: 'post-2',
      title: 'Weekly discussion thread',
      body: 'Thoughts on the latest release',
      author: 'communityhelper',
      accountAgeDays: 418,
      combinedKarma: 1204,
    },
    {
      id: 'post-3',
      title: 'Just arrived - shipping update',
      body: 'This feels like another promo post',
      author: 'vendorthrowaway',
      accountAgeDays: 8,
      combinedKarma: 2,
    },
    {
      id: 'post-4',
      title: 'Grab yours here before it is gone',
      body: 'Limited offer',
      author: 'lowkarmaaccount',
      accountAgeDays: 54,
      combinedKarma: 32,
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
    const numericConditions = [accountAgeCondition, karmaCondition].filter((condition): condition is AutomodCondition => !!condition);

    const textMatch = textConditions.length === 0 ? true : (!titleCondition || titleMatch) && (!bodyCondition || bodyMatch);
    const thresholdMatch =
      numericConditions.length === 0
        ? true
        : rule.satisfyAnyThreshold
          ? ageMatch || karmaMatch
          : ageMatch && karmaMatch;

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