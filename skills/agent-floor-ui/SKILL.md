---
name: agent-floor-ui
description: 'Use when integrating Agent Floor UI with an AI agent, Claude workflow, VS Code project, or multi-agent factory. Map agent lifecycle events into a live Three.js workspace using the event API or local relay.'
---

# Agent Floor UI Integration

## Scope

Connect the host project's actual agent lifecycle to Agent Floor UI. This skill provides integration instructions, not automatic session access or an agent runtime. Do not invent progress, completions, or agent activity.

## Procedure

1. Identify the host's real agent lifecycle callbacks, tool hooks, or event bus. Ask for the host interface if it is unavailable. Do not scrape private conversations or read credentials.
2. Choose a transport: direct `createFloorStore().dispatch` in a JavaScript application, or HTTP events to the local relay from any language. Keep adapter code in the host project.
3. Use a stable ID for every agent and emit `agent.upsert` when it starts or changes status. All fields are required. Follow the [event contract](./events.md).
4. Emit `agent.move` when the agent's work context changes: `desks` for implementation, `meeting` for coordination, `lab` for validation, `lounge` for idle or research. Map teams or pipelines to floors with the optional `floor` field. Include `progress` only when the host reports real progress. Emit `activity` only for real events. Emit `agent.remove` when the agent leaves.
5. Start `npx agent-floor-ui relay` after installing the package. In a source checkout, run `npm run build` first, then `npm run relay`. Connect the UI to `http://127.0.0.1:4310/events`. The relay binds only to localhost. Use `--origin` for a custom frontend origin.
6. Validate with one real lifecycle operation. Confirm the right ID, status, task, and zone appear. Close streams and unmount UI when the host disposes its adapter.

## Embedding

```tsx
import { AgentFloor, createFloorStore } from 'agent-floor-ui';
import 'agent-floor-ui/style.css';

const store = createFloorStore();
// Render <AgentFloor store={store} demo={false} title="My factory" />.
// Dispatch only observed host events to store.dispatch(event).
```

For a non-React mount, use `mountAgentFloor(element, { demo: false })`. It returns `dispatch`, `store`, and `unmount`.

## Boundaries

- Never claim that installing this skill observes VS Code, Copilot, or Claude sessions automatically.
- Do not add a VS Code extension or Claude hooks until the host integration mechanism is known and authorized.
- Keep the relay local. Do not expose it publicly or put secrets or full prompts in activity messages.
- SSE consumes JSON in ordinary `data:` messages. Reject malformed events rather than passing untrusted data into the scene.
- Cross-window integrations must use `connectWindowMessages(store, exactOrigin, trustedWindow)`, never `*`.