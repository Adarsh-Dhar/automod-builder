import type {
  AutomodAST,
  AutomodCondition,
  MockPost,
  SimulationResult,
  SimulationDiff,
  AutomodActionType,
} from "../types";

const SAMPLE_TITLES = [
  "Check out my new NFT collection!!!",
  "Why Bitcoin will hit 1M by 2025",
  "Need help with my Python script",
  "Best subreddits for learning programming?",
  "Crypto pumping right now - don't miss out!",
  "My cat finally let me pet her after 3 weeks",
  "Spam spam spam buy now limited offer",
  "I just got my first job as a developer!",
  "How to get rich quick with this one trick",
  "Discussion: Is functional programming overhyped?",
  "Free robux generator no survey 2024",
  "Just finished reading Clean Code - thoughts?",
  "Elon Musk crypto giveaway - send 0.1 BTC get 0.2 back",
  "Weekly thread: What are you working on?",
  "I made $50k last month doing nothing - here's how",
];

const SAMPLE_AUTHORS = [
  "throwaway_real123",
  "CryptoKing2024",
  "helpful_developer",
  "random_user_42",
  "spammer_bot",
  "longtime_lurker",
  "new_account_2024",
  "mod_veteran",
];

const SAMPLE_DOMAINS = [
  "self",
  "i.redd.it",
  "reddit.com",
  "github.com",
  "youtube.com",
  "bit.ly",
  "tinyurl.com",
  "pump.fun",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateMockPosts(count: number = 1000): MockPost[] {
  const posts: MockPost[] = [];
  for (let i = 0; i < count; i++) {
    const authorIdx = randomInt(0, SAMPLE_AUTHORS.length - 1);
    const titleIdx = randomInt(0, SAMPLE_TITLES.length - 1);
    posts.push({
      id: `post_${i}`,
      title: SAMPLE_TITLES[titleIdx],
      body: i % 3 === 0 ? "Check out https://bit.ly/fakelink for more info" : "",
      author: SAMPLE_AUTHORS[authorIdx],
      authorKarma: randomInt(-100, 50000),
      accountAgeDays: randomInt(0, 3650),
      domain: SAMPLE_DOMAINS[randomInt(0, SAMPLE_DOMAINS.length - 1)],
      url: `https://reddit.com/post_${i}`,
      subreddit: "testsubreddit",
      isTopLevel: i % 4 !== 0,
      createdAt: Date.now() - randomInt(0, 30 * 24 * 60 * 60 * 1000),
    });
  }
  return posts;
}

function evaluateCondition(condition: AutomodCondition, post: MockPost): boolean {
  const { type, operator, value } = condition;
  const numVal = typeof value === "string" ? parseFloat(value) : value;

  switch (type) {
    case "karma": {
      const karma = post.authorKarma;
      if (operator === "<") return karma < numVal;
      if (operator === ">") return karma > numVal;
      if (operator === "<=") return karma <= numVal;
      if (operator === ">=") return karma >= numVal;
      if (operator === "==") return karma === numVal;
      return false;
    }
    case "account_age": {
      const age = post.accountAgeDays;
      if (operator === "<") return age < numVal;
      if (operator === ">") return age > numVal;
      if (operator === "<=") return age <= numVal;
      if (operator === ">=") return age >= numVal;
      if (operator === "==") return age === numVal;
      return false;
    }
    case "title_regex": {
      try {
        const regex = new RegExp(String(value), "i");
        return regex.test(post.title);
      } catch {
        return post.title.toLowerCase().includes(String(value).toLowerCase());
      }
    }
    case "body_regex": {
      try {
        const regex = new RegExp(String(value), "i");
        return regex.test(post.body);
      } catch {
        return post.body.toLowerCase().includes(String(value).toLowerCase());
      }
    }
    case "domain": {
      return post.domain === String(value);
    }
    case "url_regex": {
      try {
        const regex = new RegExp(String(value), "i");
        return regex.test(post.url);
      } catch {
        return post.url.toLowerCase().includes(String(value).toLowerCase());
      }
    }
    case "subreddit": {
      return post.subreddit === String(value);
    }
    case "is_top_level": {
      return post.isTopLevel === (value === "true" || value === true);
    }
    default:
      return false;
  }
}

export function runSimulation(ast: AutomodAST, posts: MockPost[]): SimulationDiff {
  const results: SimulationResult[] = [];

  for (const post of posts) {
    let finalAction: AutomodActionType | "none" = "none";
    const matchedRules: string[] = [];
    const reasons: string[] = [];

    for (const rule of ast) {
      const condResults = rule.conditions.map((c) => evaluateCondition(c, post));
      const matches =
        rule.conditionCombination === "all"
          ? condResults.every(Boolean)
          : condResults.some(Boolean);

      if (matches && rule.actions.length > 0) {
        matchedRules.push(rule.name);
        const firstAction = rule.actions[0];
        finalAction = firstAction.type;
        reasons.push(
          `Rule "${rule.name}": ${rule.conditions
            .map((c) => `${c.type} ${c.operator} ${c.value}`)
            .join(` ${rule.conditionCombination} `)}`
        );
        break;
      }
    }

    results.push({
      postId: post.id,
      postTitle: post.title,
      postAuthor: post.author,
      matchedRules,
      action: finalAction,
      reasons,
    });
  }

  return {
    totalPosts: posts.length,
    removed: results.filter((r) => r.action === "remove" || r.action === "spam"),
    approved: results.filter((r) => r.action === "approve"),
    reported: results.filter((r) => r.action === "report"),
    untouched: results.filter((r) => r.action === "none"),
    runAt: Date.now(),
  };
}
