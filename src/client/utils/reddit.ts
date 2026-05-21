export type SubredditRule = {
  short_name: string;
  description?: string;
};

export type SubredditContext = {
  name: string;
  subscribers: number;
  rules: SubredditRule[];
};

export async function fetchSubredditContext(name: string): Promise<SubredditContext> {
  const result: SubredditContext = { name, subscribers: 0, rules: [] };

  try {
    const aboutRes = await fetch(`https://www.reddit.com/r/${encodeURIComponent(name)}/about.json`);
    if (aboutRes.ok) {
      const about = await aboutRes.json();
      result.subscribers = about?.data?.subscribers ?? 0;
    }
  } catch (e) {
    // ignore network errors and return partial data
  }

  try {
    const rulesRes = await fetch(`https://www.reddit.com/r/${encodeURIComponent(name)}/about/rules.json`);
    if (rulesRes.ok) {
      const rulesJson = await rulesRes.json();
      const rulesArray = rulesJson?.rules ?? rulesJson?.data?.rules ?? [];
      result.rules = Array.isArray(rulesArray)
        ? rulesArray.map((r: any) => ({ short_name: r.short_name ?? r.shortName ?? r.shortname ?? (r.short ?? 'rule'), description: r.description ?? r.short_description ?? '' }))
        : [];
    }
  } catch (e) {
    // ignore
  }

  return result;
}

export function buildSubredditContextPrompt(ctx: SubredditContext): string {
  const parts: string[] = [];
  parts.push(`Subreddit: r/${ctx.name}`);
  parts.push(`Subscribers: ${ctx.subscribers.toLocaleString()}`);

  if (ctx.rules && ctx.rules.length > 0) {
    parts.push('Top community rules:');
    for (const r of ctx.rules.slice(0, 8)) {
      const desc = r.description ? ` — ${r.description.replace(/\s+/g, ' ').trim()}` : '';
      parts.push(`- ${r.short_name}${desc}`);
    }
  } else {
    parts.push('No community rules available.');
  }

  return parts.join('\n');
}
