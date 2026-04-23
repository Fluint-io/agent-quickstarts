# Agent Quickstarts

Production-shaped reference implementations for deploying **Claude Managed Agents** against real workflows. Each quickstart is a standalone, deployable project — not a toy script. Fork it, wire it to your systems, and ship.

---

## Why Managed Agents

The hard part of running an AI agent in production isn't the model call. It's everything around it:

- **Session state** — an agent doing real work needs to hold context across multiple tool calls, retries, and turns.
- **Tool execution** — calling an MCP server, waiting on a human confirmation, handling a tool error, resuming cleanly.
- **Sandboxing** — if the agent runs code or shells, you need an isolated environment per session.
- **Observability** — a durable event stream of what the agent did, what it called, and what it decided.
- **Billing** — pay-per-session pricing that makes the cost model predictable for async workflows.

Anthropic's **Managed Agents** helps you with a baseline. These quickstarts show you how to build on top of it with as little glue code as possible.

> Learn more: [Managed Agents docs](https://platform.claude.com/docs/en/managed-agents/quickstart.md)

---

## Available Quickstarts

| Quickstart | What it does | Integrations | Trigger |
|------------|--------------|--------------|---------|
| [**gong-to-hubspot-summary**](./gong-to-hubspot-summary) | Gong call ends → Claude summarizes the transcript, extracts next steps, writes a deal note + tasks back to HubSpot. | Gong · HubSpot | Webhook |
| [**post-call-follow-up-email**](./post-call-follow-up-email) | Gong call ends → Claude drafts a forwardable recap email in the customer's language and saves it as a Gmail draft for the rep. | Gong · Gmail | Webhook |
| [**deal-risk-alerts-to-slack**](./deal-risk-alerts-to-slack) | Nightly pipeline scan → flags at-risk deals (going dark, stalled, single-threaded, missing next step) and DMs each rep in Slack with a prioritized list + pre-drafted next steps. | HubSpot · Slack | Cron |
| [**weekly-pipeline-digest**](./weekly-pipeline-digest) | Monday morning → synthesizes the full pipeline (closed / moved / stalled / new / coverage gaps) into a written digest, posted to a Slack channel for the sales leader. | HubSpot · Slack | Cron |
| [**multi-thread-nudge**](./multi-thread-nudge) | Deal sits in a late stage single-threaded → drafts personalized outreach for 1-3 additional stakeholders as Gmail drafts, DMs the rep in Slack. | HubSpot · Gmail · Slack · (optional research MCP) | Cron |
| [**champion-enablement-kit**](./champion-enablement-kit) | Deal moves to Proposal/Negotiation → generates an internal business case, stakeholder map, and executive summary (in the customer's language), saved to Google Drive and linked on the HubSpot deal. | HubSpot · Gong · Google Drive | Webhook |

All quickstarts deploy to **Cloudflare Workers**. Each is self-contained — fork one, point the MCP URLs at your tenants, and ship.

Want a workflow we haven't covered? Open an issue.

---

## The Pattern Every Quickstart Uses

Under the hood, every quickstart here follows the same four-step shape:

```
 External event        Your webhook/trigger          Claude Managed Agent          External system
 ─────────────         ────────────────────          ────────────────────          ───────────────
     │                         │                              │                           │
     │  webhook                │                              │                           │
     ├────────────────────────►│                              │                           │
     │                         │  1. validate                 │                           │
     │                         │  2. fetch context            │                           │
     │                         │  3. create session           │                           │
     │                         ├─────────────────────────────►│                           │
     │                         │                              │  agent thinks             │
     │                         │                              │  calls MCP tools          │
     │                         │                              ├──────────────────────────►│
     │                         │                              │◄──────────────────────────┤
     │                         │                              │  writes result            │
     │                         │  (optional) stream events    │                           │
     │                         │◄─────────────────────────────┤                           │
```

What you write: **the trigger handler and the agent's system prompt**. Everything between is infrastructure you get for free.

---

## Common Prerequisites

Every quickstart assumes:

- **Node 20+** and **pnpm 10+**
- An **Anthropic API key** with access to the Managed Agents beta — https://platform.claude.com
- A **Managed Agents environment ID** — created once per project in the Console (or via `client.beta.environments.create`)
- Whatever **MCP servers** the quickstart integrates with (HubSpot, Gmail, Linear, etc.)

Individual quickstarts list their own extras (Gong API creds, Cloudflare account, etc.) in their READMEs.

---

## Repository Layout

```
agent-quickstarts/
├── README.md                          ← you are here
├── gong-to-hubspot-summary/           ← Gong call → HubSpot note + tasks
├── post-call-follow-up-email/         ← Gong call → Gmail draft
├── deal-risk-alerts-to-slack/         ← nightly cron → Slack DMs
├── weekly-pipeline-digest/            ← weekly cron → Slack channel
├── multi-thread-nudge/                ← weekday cron → Gmail drafts + Slack DM
└── champion-enablement-kit/           ← deal stage change → Google Drive docs
```

Each subdirectory is self-contained with its own `package.json`, `README.md`, and deploy config. You can `cd` into one and run it in isolation.

Every quickstart follows the same skeleton:

```
<quickstart>/
├── README.md              ← full walkthrough
├── src/                   ← Worker code (fetch and/or scheduled handler)
├── agent/                 ← agent definition (system prompt, MCP toolsets)
├── scripts/               ← one-shot scripts (agent registration)
├── wrangler.toml          ← deploy config
└── package.json           ← dependencies
```

---

## Contributing

Found a bug or want to extend a quickstart? PRs welcome. Two rules:

1. **Keep each quickstart focused.** One workflow, one deploy target, one README.
2. **Make it work end-to-end.** If a reader can't go from clone → deploy → see-it-fire in under an hour, the quickstart needs trimming.

---

## About

Built and maintained by [Fluint](https://fluint.io). We build AI for sales and revenue teams.
