# Deal Risk Alerts → Slack

> Every morning at 6am PT, each rep gets a Slack DM with their at-risk deals and a pre-drafted next step for each one. No dashboards to check. No pipeline reviews to dread.

Built on **Claude Managed Agents**. Deployed to Cloudflare Workers with a cron trigger.

---

## The Problem

Pipeline reviews are a workaround for the fact that reps don't act on dashboards.

- Manager stares at a Salesforce report once a week, identifies 5 deals that look stuck, and asks about them in the Monday call.
- Between those calls, 50 other deals go quietly cold.
- Dashboards sit unopened. Alerts get filtered. The rep knows they *should* check the pipeline daily; they don't.

What reps actually read: Slack DMs. Especially ones that tell them exactly what to do.

## The Outcome

A nightly cron fires. A Claude agent:

1. **Scans the open pipeline** in HubSpot.
2. **Flags at-risk deals** on four signals: going dark, stalled stage, single-threaded, missing next step.
3. **Groups flagged deals by owner.**
4. **Drafts a specific next step** per deal — not "reach out to champion" but "send Jane the SOC 2 doc she asked for on the Apr 10 call."
5. **DMs each owner** in Slack with their prioritized list.

Owners with no risks get no DM. No-news is not news.

### What the output looks like

**Slack DM to @jon:**

> Nightly pipeline check — 3 deals need attention.
>
> **Acme Corp — $120k** `stalled 18d in Negotiation · single-threaded`
> Only Jane (champion) is engaged. Ask her to intro the CFO this week — pricing is stuck without economic-buyer approval.
>
> **Globex — $45k** `going dark 9d`
> Last activity: Apr 13 email. The proposal is open but no response. Send a short check-in referencing their Q2 decision timeline.
>
> **Initech — $80k** `missing next step`
> Demo was Apr 18, stage is Proposal, no task on file. Draft and send the SOW — they asked for one on the call.

---

## How it works

```
 Cron (nightly 13:00 UTC)
      │
      ▼
 Cloudflare Worker  (src/index.ts)
      │
      │  scheduled() handler
      │  opens a Managed Agent session with run config
      │
      ▼
 Claude Managed Agent
      │  system prompt: pipeline-risk analyst with HubSpot + Slack tools
      │  mcp_toolsets: hubspot, slack
      │
      │  1. HubSpot: list open deals + activity + contacts
      │  2. analyze each deal for risk signals
      │  3. group by owner; draft a specific next step per deal
      │  4. Slack: resolve owner → Slack user; send DM per owner
      │
      ▼
 Slack
      │  one DM per rep with a flagged pipeline
```

**What the Worker does:** fires the trigger, opens a session, passes config. ~50 lines.

**What the agent does:** the pipeline scan, the risk scoring, the next-step drafting, the Slack routing.

---

## Why this pattern works well for agents

Pipeline scans are what managers do in their heads during reviews. The mental model maps cleanly to an agent:

- **Multi-signal, judgment-required.** "Is this deal stuck?" combines time-in-stage, activity recency, contact depth, and stage-appropriate next steps. Rules catch the easy ones; an agent catches the subtle ones.
- **Per-rep fan-out.** The agent iterates owners without code — just a prompt instruction. Adding a second manager or a different grouping is a prompt edit.
- **Write path is gated.** DMs only go to owners with real flagged deals. Agents can be instructed to stay silent, which rules-based schedulers struggle with ("don't message if empty" ends up as code).
- **Cron trigger + MCP reads.** The Worker is stateless. No database, no cached CRM snapshot, no drift.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node 20+, pnpm 10+ | |
| Anthropic API key | With Managed Agents beta access — [platform.claude.com](https://platform.claude.com) |
| Managed Agents environment ID | Create in the Console; looks like `env_...` |
| HubSpot MCP server URL | Anthropic-hosted connector, or your own MCP server |
| Slack MCP server URL | With `chat:write` and `users:read` scopes |
| Cloudflare account | Free tier is fine; install `wrangler` CLI |

> **Salesforce instead of HubSpot?** The HubSpot MCP is a swap-target. Point `HUBSPOT_MCP_URL` at a Salesforce MCP and adjust the tool names referenced in the system prompt. No Worker code changes.

---

## Setup

Estimated time: **20-30 minutes** end-to-end.

### 1. Clone and install

```bash
git clone git@github.com:Fluint-io/agent-quickstarts.git
cd agent-quickstarts/deal-risk-alerts-to-slack
pnpm install
```

### 2. Create the Managed Agent

The agent definition lives in [`agent/agent-definition.ts`](./agent/agent-definition.ts). Review the system prompt — tune the risk signals, DM format, or next-step drafting style.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export HUBSPOT_MCP_URL=https://your-hubspot-mcp/
export SLACK_MCP_URL=https://your-slack-mcp/
pnpm run create-agent
```

The script prints `agent_...`. Save it for the next step.

### 3. Configure Worker secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put MANAGED_AGENT_ID
wrangler secret put MANAGED_ENVIRONMENT_ID
wrangler secret put MANUAL_TRIGGER_SECRET    # optional: for POST-triggered test runs
```

Non-secret config lives in [`wrangler.toml`](./wrangler.toml): thresholds, stage scope, cron schedule.

### 4. Test locally

```bash
pnpm run dev
```

`wrangler dev` supports scheduled triggers. In another terminal:

```bash
curl "http://localhost:8787/__scheduled?cron=0+13+*+*+*"
```

Or POST-trigger (if you set `MANUAL_TRIGGER_SECRET`):

```bash
curl -X POST http://localhost:8787 \
  -H "X-Trigger-Secret: $MANUAL_TRIGGER_SECRET"
```

Open the session in the Anthropic Console to watch the agent work, then check Slack.

### 5. Deploy

```bash
pnpm run deploy
```

The cron runs automatically on the schedule in `wrangler.toml`.

---

## Running the test suite

The quickstart ships with a [vitest](https://vitest.dev) suite that mocks the Anthropic SDK — so no network calls, and you can assert exactly what the agent receives.

```bash
pnpm install
pnpm test
```

What's covered:
- [`tests/handler.test.ts`](./tests/handler.test.ts) — scheduled cron fires the agent via `ctx.waitUntil`; the manual POST trigger rejects missing or wrong secrets and runs the agent with the right one.
- [`tests/agent.test.ts`](./tests/agent.test.ts) — default thresholds are applied, CSV parsing of `ACTIVE_STAGE_IDS` (including tolerant handling of empty entries), and the user-message contents (going-dark and stalled-stage thresholds, scope line).

The Anthropic SDK mock pattern lives at the top of [`tests/agent.test.ts`](./tests/agent.test.ts) (`vi.hoisted` + `vi.mock("@anthropic-ai/sdk", ...)`). Copy it when you add new agent tests.

---

## How the agent decides

The system prompt ([`agent/agent-definition.ts`](./agent/agent-definition.ts)) defines the rules:

- **Four signals:** going dark, stalled stage, single-threaded, missing next step. Any one fires a flag.
- **Priority:** by amount × severity, top 10 per rep, remainder counted but not listed.
- **Next-step specificity:** drafted next steps must reference actual deal state (last call date, champion name, blocker) — never generic.
- **No spurious DMs:** owners with zero flags get zero messages.

Tune thresholds in `wrangler.toml`; tune everything else in the prompt.

---

## Extending the pattern

| Change | How |
|--------|-----|
| Different cron schedule | Edit `[triggers].crons` in `wrangler.toml` |
| Different signals | Add/remove in the system prompt's step 2 |
| Channel posts (to manager) instead of DMs (to rep) | Change the Slack routing instruction in step 4 |
| Different CRM | Swap the HubSpot MCP URL; the prompt is CRM-agnostic in concept |

---

## Operational notes

- **Silent on empty pipelines.** If no deals are flagged, the agent sends nothing. Check the session log in the Anthropic Console if you're not sure whether it ran.
- **Slack rate limits.** For orgs with 100+ reps, add a small delay between DMs. The agent can do this via tool call spacing — add an instruction in the prompt.
- **Owner → Slack mapping.** The agent resolves by email. If your HubSpot owner emails don't match Slack emails (e.g., aliases), maintain a mapping in the prompt or via a separate MCP call.
- **Cost.** A full pipeline scan on a ~200-deal pipeline runs in under 2 minutes. Budget ~$0.30-0.80 per run depending on pipeline size.

---

## Troubleshooting

**No DMs sent but the session succeeded.**
Either the pipeline has no flagged deals, or the owner → Slack user resolution failed. Check the session log in the Anthropic Console for the resolution attempts.

**Wrong deals flagged.**
Adjust `GOING_DARK_DAYS` / `STALLED_STAGE_DAYS` in `wrangler.toml`, or tune the signal definitions in the system prompt.

**DMs are too long.**
Tighten the per-deal format in step 3 of the system prompt. The default is ~3 lines per deal; you can cut to 2.

---

## Files

| File | What it does |
|------|--------------|
| [`src/index.ts`](./src/index.ts) | Worker cron + manual-trigger handler |
| [`src/managed-agent.ts`](./src/managed-agent.ts) | Opens a session and sends the run config |
| [`agent/agent-definition.ts`](./agent/agent-definition.ts) | System prompt + HubSpot & Slack MCP toolsets |
| [`scripts/create-agent.ts`](./scripts/create-agent.ts) | One-shot script to register the agent |
| [`wrangler.toml`](./wrangler.toml) | Cloudflare Workers deploy config + cron schedule |
| [`tests/`](./tests) | Vitest suite: scheduled handler, manual trigger, and agent context tests |
| [`vitest.config.ts`](./vitest.config.ts) | Vitest config (node env, runs `tests/**/*.test.ts`) |

---

## Related reading

- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart.md)
- [Cloudflare Workers cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Slack API — chat.postMessage](https://api.slack.com/methods/chat.postMessage)
- [HubSpot API — Deals](https://developers.hubspot.com/docs/api/crm/deals)
