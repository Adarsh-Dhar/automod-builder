import { Devvit } from "@devvit/public-api";

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

const REDIS_RULES_KEY = "rulestage:rules:yaml";
const REDIS_POSTS_KEY = "rulestage:mock:posts";

Devvit.addMenuItem({
  label: "Open RuleStage",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const { reddit, ui } = context;
    const subreddit = await reddit.getCurrentSubreddit();
    await context.ui.showToast("Opening RuleStage...");
    await context.ui.navigateTo(
      `https://rulestage.replit.app?subreddit=${subreddit.name}`
    );
  },
});

Devvit.addCustomPostType({
  name: "RuleStage",
  description: "Automod CI/CD and configuration builder",
  height: "tall",
  render: (context) => {
    return (
      <vstack height="100%" width="100%" alignment="center middle">
        <text size="xlarge" weight="bold" color="orangered">
          RuleStage
        </text>
        <text size="medium" color="secondary">
          Automoderator Configuration Builder
        </text>
        <spacer size="medium" />
        <button
          appearance="primary"
          onPress={async () => {
            const subreddit = await context.reddit.getCurrentSubreddit();
            context.ui.showToast(`Moderating r/${subreddit.name}`);
          }}
        >
          Open Editor
        </button>
      </vstack>
    );
  },
});

Devvit.addTrigger({
  event: "PostSubmit",
  onEvent: async (event, context) => {
    const { redis } = context;
    const rulesYaml = await redis.get(REDIS_RULES_KEY);
    if (!rulesYaml) return;
    await redis.set(
      `rulestage:log:${event.post?.id}`,
      JSON.stringify({ postId: event.post?.id, checkedAt: Date.now() })
    );
  },
});

export default Devvit;
