import type { DebugResponse } from '../../shared/debug-types';

export function parsePostId(text: string): string | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(/comments\/([a-z0-9]+)(?:[/?#]|$)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const fullnameMatch = trimmed.match(/\bt3_([a-z0-9]+)\b/i);
  if (fullnameMatch?.[1]) {
    return fullnameMatch[1];
  }

  if (/^[a-z0-9]+$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function formatDebugMessage(result: DebugResponse): string {
  const matchLines = result.matches.length > 0
    ? result.matches
        .map((match, index) => {
          return [
            `${index + 1}. ${match.ruleName} [${match.confidence}]`,
            `   matched ${match.matchedCondition.field} ${match.matchedCondition.comparator} ${match.matchedCondition.value}`,
            `   lines ${match.lineStart}-${match.lineEnd}`,
          ].join('\n');
        })
        .join('\n\n')
    : 'No AutoMod blocks matched this post.';

  return [
    `Debug result for u/${result.postAuthor}'s post`,
    `Title: ${result.postTitle}`,
    `Post ID: ${result.postId}`,
    '',
    matchLines,
    '',
    'Suggested fix:',
    '```yaml',
    result.aiFixYaml,
    '```',
  ].join('\n');
}