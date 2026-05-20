import { Devvit } from "@devvit/public-api";

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

const REDIS_RULES_KEY = "rulestage:rules:yaml";
const REDIS_POSTS_KEY = "rulestage:mock:posts";
const WEBVIEW_ID = "rulestage-ui";

type WebViewToDevvitMessage =
  | { type: "APP_READY" }
  | { type: "LOAD_RULES" }
  | { type: "SAVE_RULES"; yaml: string }
  | { type: "GET_SUBREDDIT" };

type DevvitToWebViewMessage =
  | { type: "RULES_LOADED"; yaml: string; subredditName: string }
  | { type: "SUBREDDIT_INFO"; subredditName: string }
  | { type: "SAVE_RULES_ACK" }
  | { type: "SAVE_RULES_ERROR"; error: string };

Devvit.addMenuItem({
  label: "Open RuleStage",
  location: "subreddit",
  forUserType: "moderator",
  onPress: async (_event, context) => {
    const subreddit = await context.reddit.getCurrentSubreddit();
    await context.ui.showToast("Opening RuleStage...");
    await context.ui.showToast(`Open the RuleStage post for r/${subreddit.name}`);
  },
});

Devvit.addCustomPostType({
  name: "RuleStage",
  description: "Automod CI/CD and configuration builder",
  height: "tall",
  render: (context) => {
    return (
      <vstack height="100%" width="100%" alignment="start top">
        <webview
          id={WEBVIEW_ID}
          width="100%"
          height="100%"
          url="index.html"
          onMessage={async (message) => {
            const payload = message as Partial<WebViewToDevvitMessage>;

            if (payload.type === "APP_READY") {
              const subreddit = await context.reddit.getCurrentSubreddit();
              context.ui.webView.postMessage(WEBVIEW_ID, {
                type: "SUBREDDIT_INFO",
                subredditName: subreddit.name,
              } satisfies DevvitToWebViewMessage);
              return;
            }

            if (payload.type === "LOAD_RULES") {
              const yaml = (await context.redis.get(REDIS_RULES_KEY)) ?? "";
              const subreddit = await context.reddit.getCurrentSubreddit();
              context.ui.webView.postMessage(WEBVIEW_ID, {
                type: "RULES_LOADED",
                yaml,
                subredditName: subreddit.name,
              } satisfies DevvitToWebViewMessage);
              return;
            }

            if (payload.type === "SAVE_RULES" && typeof payload.yaml === "string") {
              try {
                await context.redis.set(REDIS_RULES_KEY, payload.yaml);
                context.ui.webView.postMessage(WEBVIEW_ID, { type: "SAVE_RULES_ACK" } satisfies DevvitToWebViewMessage);
                await context.ui.showToast("RuleStage saved to Redis");
              } catch (error) {
                context.ui.webView.postMessage(WEBVIEW_ID, {
                  type: "SAVE_RULES_ERROR",
                  error: error instanceof Error ? error.message : "Failed to save rules",
                } satisfies DevvitToWebViewMessage);
              }
              return;
            }

            if (payload.type === "GET_SUBREDDIT") {
              const subreddit = await context.reddit.getCurrentSubreddit();
              context.ui.webView.postMessage(WEBVIEW_ID, {
                type: "SUBREDDIT_INFO",
                subredditName: subreddit.name,
              } satisfies DevvitToWebViewMessage);
            }
          }}
        />
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
