import type { YamlLimitation } from '../../shared/automod';

export type EscapeHatchTemplate = {
  limitation: YamlLimitation;
  label: string;
  description: string;
  code: string;
  limitations: string[];
};

export const ESCAPE_HATCH_TEMPLATES: EscapeHatchTemplate[] = [
  {
    limitation: 'external-api',
    label: 'External API Check',
    description: 'Call an external service before deciding whether to remove a post.',
    code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';

export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const response = await fetch('https://api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: event.post.id,
        title: event.post.title,
        body: event.post.body,
        author: event.author.name,
      }),
    });

    if (!response.ok) return;

    const result = (await response.json()) as { isSpam?: boolean };
    if (result.isSpam) {
      await context.reddit.remove(event.post.id);
    }
  } catch (error) {
    console.error('Escape hatch external API check failed:', error);
  }
};`,
    limitations: [
      'Requires the remote API to be reachable at moderation time.',
      'Fails open if the API request throws or returns a non-2xx response.',
    ],
  },
  {
    limitation: 'json-parsing',
    label: 'JSON Body Parsing',
    description: 'Parse JSON from a post body and inspect fields that YAML cannot read.',
    code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';

export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const parsed = JSON.parse(event.post.body) as Record<string, unknown>;
    if (parsed.blocked === true || parsed.kind === 'forbidden') {
      await context.reddit.remove(event.post.id);
    }
  } catch {
    return;
  }
};`,
    limitations: [
      'Only works when the post body is valid JSON.',
      'The trigger should fail open when parsing fails.',
    ],
  },
  {
    limitation: 'database-check',
    label: 'Redis Ban Check',
    description: 'Check a Redis-backed list before allowing the post through.',
    code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';

export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const banKey = 'banned:user:' + event.author.name;
    const isBanned = await context.redis.get(banKey);
    if (isBanned) {
      await context.reddit.remove(event.post.id);
    }
  } catch (error) {
    console.error('Escape hatch Redis check failed:', error);
  }
};`,
    limitations: [
      'Requires the moderation state to be stored in Redis or another supported datastore.',
      'The trigger assumes the ban list is kept in sync elsewhere.',
    ],
  },
  {
    limitation: 'database-check',
    label: 'Redis Set Member Check',
    description: 'Check a Redis set using sismember before allowing the post through.',
    code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';

export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const isMember = await context.redis.sismember('scammer-list', event.author.name);
    if (isMember) {
      await context.reddit.remove(event.post.id);
    }
  } catch (error) {
    console.error('Escape hatch Redis set check failed:', error);
  }
};`,
    limitations: [
      'Requires the Redis set to be populated and kept in sync separately.',
      'The set name must match exactly what is used when adding banned users.',
    ],
  },
];

export function getEscapeHatchTemplate(limitation: YamlLimitation) {
  return ESCAPE_HATCH_TEMPLATES.find((t) => t.limitation === limitation) ?? null;
}
