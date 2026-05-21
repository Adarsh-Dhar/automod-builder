/** @jsxImportSource @devvit/public-api */
import { Devvit, useState } from "@devvit/public-api";

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

const REDIS_RULES_KEY = "rulestage:rules:yaml";
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
    const post = await context.reddit.submitPost({
      title: "RuleStage Configuration",
      subredditName: subreddit.name,
      preview: Devvit.createElement(
        "vstack",
        {
          height: "100%",
          width: "100%",
          alignment: "middle center",
          gap: "medium",
        },
        Devvit.createElement(
          "text",
          {
            size: "large",
            weight: "bold",
          },
          "Loading RuleStage..."
        )
      ),
      textFallback: {
        text: "Loading RuleStage...",
      },
    });

    await context.ui.showToast(`Created RuleStage post for r/${subreddit.name}`);
    context.ui.navigateTo(post);
  },
});

Devvit.addCustomPostType({
  name: "RuleStage",
  description: "Automod CI/CD and configuration builder",
  height: "tall",
  render: (context) => {
    const [viewState, setViewState] = useState<"splash" | "loading" | "ready">("splash");

    const createBlock = Devvit.createElement;

    if (viewState === "splash") {
      return createBlock(
        "vstack",
        {
          height: "100%",
          width: "100%",
          alignment: "middle center",
          gap: "medium",
          padding: "large",
          backgroundColor: "#0B1020",
        },
        createBlock(
          "text",
          {
            size: "xxlarge",
            weight: "bold",
            color: "#F8FAFC",
            alignment: "center",
          },
          "RuleStage"
        ),
        createBlock(
          "text",
          {
            size: "large",
            color: "#CBD5E1",
            alignment: "center",
          },
          "Build automod rules faster."
        ),
        createBlock(
          "text",
          {
            size: "small",
            color: "#94A3B8",
            alignment: "center",
          },
          "Tap to open the editor."
        ),
        createBlock(
          "button",
          {
            appearance: "primary",
            onPress: () => setViewState("loading"),
          },
          "Open RuleStage"
        )
      );
    }

    const webview = createBlock("webview", {
      id: WEBVIEW_ID,
      width: "100%",
      height: "100%",
      url: "index.html",
      onMessage: async (message: Partial<WebViewToDevvitMessage>) => {
        // Debug: log inbound messages from webview
        // eslint-disable-next-line no-console
        console.log("[Devvit Host] Received webview message:", message);
        const payload = message as Partial<WebViewToDevvitMessage>;

        if (payload.type === "APP_READY") {
          // eslint-disable-next-line no-console
          console.log("[Devvit Host] APP_READY received from webview, switching to ready state");
          setViewState("ready");
          const subreddit = await context.reddit.getCurrentSubreddit();
          // eslint-disable-next-line no-console
          console.log("[Devvit Host] Posting SUBREDDIT_INFO to webview", subreddit.name);
          context.ui.webView.postMessage(WEBVIEW_ID, {
            type: "SUBREDDIT_INFO",
            subredditName: subreddit.name,
          } satisfies DevvitToWebViewMessage);
          return;
        }

        if (payload.type === "LOAD_RULES") {
          const yaml = (await context.redis.get(REDIS_RULES_KEY)) ?? "";
          const subreddit = await context.reddit.getCurrentSubreddit();
          // eslint-disable-next-line no-console
          console.log("[Devvit Host] Posting RULES_LOADED to webview (yaml length)", yaml.length, subreddit.name);
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
            // eslint-disable-next-line no-console
            console.log("[Devvit Host] Posted SAVE_RULES_ACK to webview");
            context.ui.webView.postMessage(WEBVIEW_ID, { type: "SAVE_RULES_ACK" } satisfies DevvitToWebViewMessage);
            await context.ui.showToast("RuleStage saved to Redis");
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error("[Devvit Host] Error saving rules to Redis", error);
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
      },
    });

    if (viewState === "ready") {
      return createBlock("zstack", { height: "100%", width: "100%" }, webview);
    }

    return createBlock(
      "zstack",
      { height: "100%", width: "100%" },
      webview,
      createBlock(
        "vstack",
        {
          height: "100%",
          width: "100%",
          alignment: "middle center",
          gap: "small",
          padding: "large",
          backgroundColor: "#0B1020",
        },
        createBlock(
          "text",
          {
            size: "xlarge",
            weight: "bold",
            color: "#F8FAFC",
            alignment: "center",
          },
          "Loading RuleStage"
        ),
        createBlock(
          "text",
          {
            size: "small",
            color: "#CBD5E1",
            alignment: "center",
          },
          "Opening the editor. If this stays here, the webview did not finish booting."
        )
      )
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