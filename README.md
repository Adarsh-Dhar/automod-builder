# RuleStage

RuleStage is a Reddit Devvit app for building and testing AutoModerator rules with a React-based web UI.

## Project layout

- `devvit.yaml` at the repository root is the config file used by `devvit playtest` and `devvit build`.
- `main.ts` at the repository root hosts the Devvit post and Redis/webview bridge.
- `artifacts/rulestage/` contains the editor UI that is built into `artifacts/rulestage/dist/public`.

## Setup

1. Install dependencies from the repository root:

	```bash
	pnpm install
	```

2. Install the package-local dependencies that are not linked from the top-level workspace graph:

	```bash
	cd artifacts/rulestage && pnpm install --ignore-workspace
	```

## Build

From the repository root:

```bash
PORT=22143 BASE_PATH=/ pnpm run build
```

That typechecks the workspace and then builds the frontend into `artifacts/rulestage/dist/public`.

To build just the frontend:

```bash
cd artifacts/rulestage && PORT=22143 BASE_PATH=/ pnpm run build
```

The frontend build now emits to `artifacts/rulestage/dist/public`, which is the path referenced by `devvit.yaml`.

## Playtest

From the repository root:

```bash
npx -y devvit playtest testAdarsh2
```

That launches `devvit playtest` using the root-level `devvit.yaml`.

## Notes

- The web UI uses `window.parent.postMessage(...)` to talk to Devvit.
- Devvit replies through `context.ui.webView.postMessage(...)`.
- Rule data is stored in Redis under `rulestage:rules:yaml`.
