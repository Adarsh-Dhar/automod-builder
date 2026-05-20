# RuleStage

RuleStage is a Reddit Devvit app for building and testing AutoModerator rules with a React-based web UI.

## Project layout

- `rulestage/` contains the Devvit app and the packaged webroot frontend.
- `rulestage/src/main.tsx` hosts the Devvit post and Redis/webview bridge.
- `rulestage/webroot/` contains the editor UI that is built into `rulestage/webroot/dist`.

## Setup

1. Install dependencies from the repository root:

	```bash
	pnpm install
	```

2. Install the package-local dependencies that are not linked from the top-level workspace graph:

	```bash
	cd rulestage && pnpm install --ignore-workspace
	cd webroot && pnpm install --ignore-workspace
	```

## Build

From `rulestage/`:

```bash
pnpm run build
```

That runs the webroot build first and then `devvit build`.

To build just the frontend:

```bash
cd webroot && pnpm run build
```

The frontend build now emits to `rulestage/webroot/dist`, which is the path referenced by `devvit.yaml`.

## Playtest

From `rulestage/`:

```bash
pnpm run dev
```

That launches `devvit playtest` for the custom post.

## Notes

- The web UI uses `window.parent.postMessage(...)` to talk to Devvit.
- Devvit replies through `context.ui.webView.postMessage(...)`.
- Rule data is stored in Redis under `rulestage:rules:yaml`.
