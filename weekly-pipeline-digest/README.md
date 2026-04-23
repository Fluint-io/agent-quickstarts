# Weekly Pipeline Digest

> Monday morning at 6am PT. The sales leader opens Slack and sees a written weekly digest of the pipeline: what closed, what moved, what stalled, and five specific things to do this week. No dashboards. No exports.

Built on **Claude Managed Agents**. Deployed to Cloudflare Workers with a weekly cron.

---

## The Problem

Every sales leader has the same Monday-morning ritual: open the CRM, pull up a saved report, squint at it, try to remember what was different last week, then do it again on Tuesday because the report shows deltas weirdly.

- Dashboards show state. They don't show *change*.
- Change is what a leader needs — what moved, what stalled, what closed.
- Synthesis is a human job, and it's the job reps and CROs spend hours a week not doing well.

## The Outcome

Monday at 6am, a Claude agent:

1. **Pulls the pipeline** from HubSpot.
2. **Looks at the week's changes**: closed deals, stage transitions, new pipe, stalls.
3. **Synthesizes** into a written digest: what happened, what it means, what to do about it.
4. **Posts to a Slack channel** — one message, Block Kit formatted, under 600 words.

The leader opens Slack with their coffee, reads the digest, and knows what to focus on before the weekly pipeline call at 9.

### What the output looks like

**Posted to #pipeline-weekly:**

> **Week of 2026-04-13 → 2026-04-20**
>
> **Closed**
> - *Won:* Initech — $80k (Jon), Globex — $45k (Mara). Total: $125k across 2 deals.
> - *Lost:* Umbrella Corp — $60k (Mara). Loss reason: price.
>
> **Moved forward**
> - Acme Corp — $120k · `Discovery` → `Proposal` · Jon
> - Stark Industries — $250k · `Proposal` → `Negotiation` · Mara
>
> **Stalled or regressed**
> - Wayne Enterprises — $90k · stuck in `Negotiation` for 22 days · Jon · champion (Lucius) has gone quiet since Apr 8.
> - Tyrell — $180k · regressed `Negotiation` → `Proposal` · Mara · procurement added a security review mid-cycle.
>
> **New in pipeline**
> - Hooli — $200k (inbound, Jon), Pied Piper — $60k (outbound, Mara). Total new: $260k.
>
> **Coverage gaps**
> - Q2 coverage is 2.1x on Jon's book — below the 3x bar. No new late-stage pipe added this week.
>
> **Recommendations**
> - Push Jon on Wayne Enterprises: champion has gone dark 12 days, needs a direct CFO intro before Q2 close.
> - Mara — Tyrell's security review looks like a two-week stall. Ask Tyrell's IT to start the review in parallel with legal.
> - Jon's coverage is thin. Run a pipeline-gen block with him this week; he has 4 warm inbound leads unworked.

---

## How it works

```
 Cron (Monday 13:00 UTC)
      │
      ▼
 Cloudflare Worker  (src/index.ts)
      │
      │  scheduled() handler
      │  opens a Managed Agent session with window + channel
      │
      ▼
 Claude Managed Agent
      │  system prompt: weekly-digest analyst with HubSpot + Slack tools
      │
      │  1. HubSpot: open deals, closed-this-week, stage changes, new deals
      │  2. synthesize into sections (closed / moved / stalled / new / gaps)
      │  3. generate 3-5 specific recommendations tied to real deals
      │  4. Slack: post single Block Kit message to the channel
      │
      ▼
 Slack channel
      │  one digest, ~500 words, ready to skim
```

---

## Why this pattern works well for agents

This is pure synthesis — the agent's strongest move:

- **Many inputs, one output.** Dozens of deals, dozens of stage changes, four close reasons. A good digest picks the signal. This is what language models are for.
- **Writing matters.** The quality of the digest lives in the prose, not the data. A CSV of the same facts is useless; a well-written paragraph is gold.
- **Leverage from prompt tuning.** Want a different digest shape for sales ops vs. the CEO? Same data, different prompt. Zero code changes.
- **Read-only + one write.** The agent reads the CRM and writes one Slack message. Minimal surface area for things to go wrong.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node 20+, pnpm 10+ | |
| Anthropic API key | With Managed Agents beta access — [platform.claude.com](https://platform.claude.com) |
| Managed Agents environment ID | Create in the Console; looks like `env_...` |
| HubSpot MCP server URL | Anthropic-hosted connector, or your own MCP server |
| Slack MCP server URL | With `chat:write` scope in the target channel |
| Slack channel ID | The channel to post the digest to (e.g., `C0123456789`) |
| Cloudflare account | Free tier is fine; install `wrangler` CLI |

> **Email the leader instead?** Swap the Slack MCP for a Gmail or Outlook MCP and change the "post the digest" step in the system prompt to "draft an email and send to <leader email>."

---

## Setup

### 1. Clone and install

```bash
git clone git@github.com:Fluint-io/agent-quickstarts.git
cd agent-quickstarts/weekly-pipeline-digest
pnpm install
```

### 2. Create the Managed Agent

Review [`agent/agent-definition.ts`](./agent/agent-definition.ts). Tune digest structure, tone, or section list.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export HUBSPOT_MCP_URL=https://your-hubspot-mcp/
export SLACK_MCP_URL=https://your-slack-mcp/
pnpm run create-agent
```

### 3. Configure Worker secrets + vars

Set the channel in `wrangler.toml`:

```toml
[vars]
DIGEST_SLACK_CHANNEL = "C0123456789"
WINDOW_DAYS = "7"
```

Secrets:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put MANAGED_AGENT_ID
wrangler secret put MANAGED_ENVIRONMENT_ID
wrangler secret put MANUAL_TRIGGER_SECRET    # optional: for test runs
```

### 4. Test locally

```bash
pnpm run dev
curl "http://localhost:8787/__scheduled?cron=0+13+*+*+1"
```

Or POST-trigger:

```bash
curl -X POST http://localhost:8787 \
  -H "X-Trigger-Secret: $MANUAL_TRIGGER_SECRET"
```

Watch the session in the Anthropic Console, then check the Slack channel.

### 5. Deploy

```bash
pnpm run deploy
```

---

## Running the test suite

The quickstart ships with a [vitest](https://vitest.dev) suite that mocks the Anthropic SDK — so no network calls, and you can assert exactly what the agent receives.

```bash
pnpm install
pnpm test
```

What's covered:
- [`tests/handler.test.ts`](./tests/handler.test.ts) — scheduled cron opens a session; throws with a clear error when `DIGEST_SLACK_CHANNEL` isn't configured; manual POST trigger with secret check.
- [`tests/agent.test.ts`](./tests/agent.test.ts) — window-date math with fake timers (7 days back from 2026-04-22 = 2026-04-15); session metadata is tagged with `digest_week_of`; custom `WINDOW_DAYS` is respected.

The Anthropic SDK mock pattern lives at the top of [`tests/agent.test.ts`](./tests/agent.test.ts) (`vi.hoisted` + `vi.mock("@anthropic-ai/sdk", ...)`). Copy it when you add new agent tests.

---

## How the agent decides

- **Skip empty sections.** "No closed-lost this week" is padding. The agent omits sections with zero content.
- **Specific recommendations.** Each recommendation is tied to a deal or rep, not generic advice.
- **No marketing language.** The audience is skeptical. "Great week" is banned.
- **Length cap.** Under ~600 words. Leaders skim.

Edit the prompt in [`agent/agent-definition.ts`](./agent/agent-definition.ts) to change any of this.

---

## Extending the pattern

| Variation | How |
|-----------|-----|
| Multiple leaders, one per segment | Create multiple agents (or one agent with a grouping instruction) and multiple Slack channels |
| Monthly digest instead of weekly | Change cron to `0 13 1 * *` and `WINDOW_DAYS` to `30` |
| Email output for CEO | Swap Slack MCP for Gmail/Outlook MCP + change output instruction |
| PDF attached snapshot | Add a document generation MCP + Google Drive MCP |

---

## Operational notes

- **First-run data quality.** The quality of the digest is bounded by the quality of your CRM data. If "loss reason" is optional and half-filled, the digest will reflect that.
- **Cost.** A weekly digest session runs 1-3 minutes. Budget ~$0.40-1.00 per week.
- **Time zone.** The cron is UTC. Adjust for your leader's Monday morning — `0 13 * * 1` = 6am PT / 9am ET.

---

## Troubleshooting

**Digest is generic / feels like filler.**
The prompt is working but your CRM data is thin. Check that stage-change history, loss reasons, and activity logs are actually populated. An agent can't synthesize what isn't there.

**Digest is too long.**
Tighten the word cap in the system prompt or cut a section (e.g., "skip New in pipeline unless total new > $X").

**Nothing posted but session succeeded.**
Check that `DIGEST_SLACK_CHANNEL` is set (it's a `var`, not a secret) and that the Slack MCP has access to that channel.

---

## Files

| File | What it does |
|------|--------------|
| [`src/index.ts`](./src/index.ts) | Worker cron + manual-trigger handler |
| [`src/managed-agent.ts`](./src/managed-agent.ts) | Opens a session and sends the run context |
| [`agent/agent-definition.ts`](./agent/agent-definition.ts) | System prompt + HubSpot & Slack MCP toolsets |
| [`scripts/create-agent.ts`](./scripts/create-agent.ts) | One-shot script to register the agent |
| [`wrangler.toml`](./wrangler.toml) | Deploy config, cron schedule, channel + window vars |
| [`tests/`](./tests) | Vitest suite: scheduled handler, manual trigger, and window-math tests |
| [`vitest.config.ts`](./vitest.config.ts) | Vitest config (node env, runs `tests/**/*.test.ts`) |

---

## Related reading

- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart.md)
- [Slack Block Kit](https://api.slack.com/block-kit)
- [HubSpot API — Deals](https://developers.hubspot.com/docs/api/crm/deals)
