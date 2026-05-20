export interface SubredditRule {
  kind: string;
  short_name: string;
  description: string;
  violation_reason: string;
  priority: number;
}

export interface SubredditContext {
  name: string;
  title: string;
  description: string;
  subscribers: number;
  rules: SubredditRule[];
  fetchedAt: number;
}

function cleanName(raw: string): string {
  return raw.trim().replace(/^\/?(r\/)?/, "");
}

export async function fetchSubredditContext(
  subredditName: string
): Promise<SubredditContext> {
  const name = cleanName(subredditName);
  if (!name) throw new Error("Enter a subreddit name");

  const [rulesRes, aboutRes] = await Promise.all([
    fetch(`https://www.reddit.com/r/${name}/about/rules.json`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`https://www.reddit.com/r/${name}/about.json`, {
      headers: { Accept: "application/json" },
    }),
  ]);

  if (!rulesRes.ok) {
    throw new Error(
      rulesRes.status === 404
        ? `r/${name} not found`
        : `Could not reach r/${name} (${rulesRes.status})`
    );
  }

  const [rulesData, aboutData] = await Promise.all([
    rulesRes.json() as Promise<{ rules?: SubredditRule[] }>,
    aboutRes.ok
      ? (aboutRes.json() as Promise<{ data?: { title?: string; public_description?: string; subscribers?: number } }>)
      : Promise.resolve({ data: {} }),
  ]);

  const sub = (aboutData as { data?: { title?: string; public_description?: string; subscribers?: number } }).data ?? {};

  return {
    name,
    title: sub.title ?? name,
    description: sub.public_description ?? "",
    subscribers: sub.subscribers ?? 0,
    rules: rulesData.rules ?? [],
    fetchedAt: Date.now(),
  };
}

export function buildSubredditContextPrompt(ctx: SubredditContext): string {
  const lines: string[] = [
    `Subreddit: r/${ctx.name}`,
    `Title: ${ctx.title}`,
  ];
  if (ctx.description) {
    lines.push(`Description: ${ctx.description.slice(0, 300)}`);
  }
  lines.push(`Subscribers: ${ctx.subscribers.toLocaleString()}`);

  if (ctx.rules.length > 0) {
    lines.push(`\nCommunity Rules (${ctx.rules.length} rules):`);
    ctx.rules.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.short_name}`);
      if (r.description) {
        lines.push(`   ${r.description.slice(0, 200)}`);
      }
    });
  } else {
    lines.push("\nNo community rules found for this subreddit.");
  }

  return lines.join("\n");
}
