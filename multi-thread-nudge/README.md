# Multi-Thread Nudge

> A deal sits in Proposal too long with only one contact engaged. The next morning, three personalized outreach emails are waiting in the rep's Gmail drafts — addressed to the CFO, the technical buyer, and the influencer they forgot about. Plus a Slack DM: "3 drafts ready for Acme Corp, you're single-threaded."

Built on **Claude Managed Agents**. Deployed to Cloudflare Workers with a weekday cron.

---

## The Problem

Single-threading is the most predictable way to lose a deal, and reps know it.

- The playbook is clear: once you're past discovery, you need 3+ engaged contacts at the account.
- The behavior is missing: reps don't multi-thread, because cold-ish intros to strangers feel like real work.
- Writing three different emails — one for the CFO, one for the security lead, one for the VP of Ops — takes 45 focused minutes that no one schedules.

What reps will do: review a draft and hit send. What they won't do: write the draft from scratch.

## The Outcome

A weekday cron fires. A Claude agent:

1. **Scans open late-stage deals** in HubSpot.
2. **Flags the single-threaded ones** past a configurable stage-age threshold.
3. **Identifies additional stakeholders to engage** from contacts on the deal (and, if a research MCP is wired up, from web enrichment).
4. **Drafts personalized outreach** for each stakeholder — role-specific angle, customer's language from recent calls, under 120 words.
5. **Saves them as Gmail drafts** in the rep's mailbox.
6. **DMs the rep in Slack**: "3 drafts ready for Acme Corp — check your Gmail."

The rep opens their inbox, reviews three drafts in two minutes, hits send. Multi-threading without the activation energy.

### What the output looks like

**Slack DM to @jon:**

> 3 drafts ready for **Acme Corp** — you're single-threaded (only Jane engaged, 12 days in Negotiation).
>
> • **Mike Torres (CFO)** — ROI angle, references Jane's concern about migration cost on the Apr 10 call.
> • **Sarah Chen (VP RevOps)** — workflow angle, ties to the 6-hour weekly spreadsheet pain Jane mentioned.
> • **[TBD — Head of Security]** — couldn't resolve a name. Draft is ready with a placeholder; fill in before sending.
>
> Drafts are in Gmail. Nothing sent.

---

## How it works

```
 Cron (weekdays 14:00 UTC)
      │
      ▼
 Cloudflare Worker  (src/index.ts)
      │
      │  scheduled() handler
      │  opens a Managed Agent session with stage config
      │
      ▼
 Claude Managed Agent
      │  system prompt: multi-thread analyst with HubSpot + Gmail + Slack
      │
      │  1. HubSpot: list late-stage deals, associated contacts, recent activity
      │  2. detect single-threading; identify next stakeholders
      │  3. research enrichment (optional MCP) for missing named contacts
      │  4. draft a personalized email per stakeholder
      │  5. Gmail: save drafts in the rep's mailbox (never send)
      │  6. Slack: DM the rep with a summary
      │
      ▼
 Rep's Gmail + Slack
      │  drafts + one summary DM per rep
```

---

## Why this pattern works well for agents

Multi-threading is the textbook "remove the friction" agent use case:

- **Per-stakeholder personalization** requires real reasoning: the CFO email is different from the security email, and both are different from the influencer email. Templates fail.
- **Customer language reuse.** The agent references actual phrases from recent call activity. "Your 6-hour spreadsheet crunch" lands; "your operational challenges" doesn't.
- **Human in the loop by design.** Output is *drafts*. The rep is always the final check. If a draft is wrong, the rep fixes it — but the activation energy to start is gone.
- **Mixed I/O.** Read from CRM + call transcripts, write to email + Slack. This is where agents beat scripts.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node 20+, pnpm 10+ | |
| Anthropic API key | With Managed Agents beta access — [platform.claude.com](https://platform.claude.com) |
| Managed Agents environment ID | Create in the Console; looks like `env_...` |
| HubSpot MCP server URL | Anthropic-hosted connector, or your own MCP server |
| Gmail MCP server URL | With `gmail.compose` scope |
| Slack MCP server URL | With `chat:write` and `users:read` scopes |
| Research MCP (optional) | Any web-search or company-intel MCP (Tavily, Perplexity, etc.) |
| Cloudflare account | Free tier is fine; install `wrangler` CLI |

---

## Setup

### 1. Clone and install

```bash
git clone git@github.com:Fluint-io/agent-quickstarts.git
cd agent-quickstarts/multi-thread-nudge
pnpm install
```

### 2. Create the Managed Agent

Review [`agent/agent-definition.ts`](./agent/agent-definition.ts) — tune the stakeholder-identification rules, email tone, or per-role angles.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export HUBSPOT_MCP_URL=https://your-hubspot-mcp/
export GMAIL_MCP_URL=https://your-gmail-mcp/
export SLACK_MCP_URL=https://your-slack-mcp/
# Optional:
export RESEARCH_MCP_URL=https://your-research-mcp/
pnpm run create-agent
```

### 3. Configure Worker secrets + vars

Thresholds live in `wrangler.toml`:

```toml
[vars]
WATCHED_STAGE_IDS = "presentationscheduled,decisionmakerboughtin,contractsent"
MIN_DAYS_IN_STAGE = "5"
MAX_DRAFTS_PER_DEAL = "3"
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
curl "http://localhost:8787/__scheduled?cron=0+14+*+*+1-5"
```

Or POST-trigger:

```bash
curl -X POST http://localhost:8787 \
  -H "X-Trigger-Secret: $MANUAL_TRIGGER_SECRET"
```

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
- [`tests/handler.test.ts`](./tests/handler.test.ts) — scheduled cron fires via `ctx.waitUntil`; manual POST trigger with secret check.
- [`tests/agent.test.ts`](./tests/agent.test.ts) — defaults applied when env vars are unset (5 days in stage, 3 drafts per deal); configured stage list is passed through; run date recorded in session metadata.

The Anthropic SDK mock pattern lives at the top of [`tests/agent.test.ts`](./tests/agent.test.ts) (`vi.hoisted` + `vi.mock("@anthropic-ai/sdk", ...)`). Copy it when you add new agent tests.

---

## How the agent decides

- **Single-threading definition.** One contact with activity in the last 30 days, and/or no engaged C-level/VP contact. Both trigger the flag.
- **Stakeholder priority.** Economic buyer first (C-level/VP), then technical buyer, then influencer.
- **Never invent people.** If a role can't be filled with a real name (even with research), the draft goes in with a placeholder and the Slack DM flags it. Reps fill in names; they don't discover hallucinated ones mid-send.
- **Customer language.** Quotes in drafts come from recent call activity — not the agent's best guess.
- **Draft only.** Never sends. Always leaves in drafts.

Everything above is a prompt edit away.

---

## Extending the pattern

| Variation | How |
|-----------|-----|
| Outlook instead of Gmail | Swap `GMAIL_MCP_URL` for an Outlook/Graph MCP; adjust tool names in the prompt |
| Only flag enterprise deals (>$50k) | Add a filter to step 1 of the system prompt |
| Research MCP enabled | Wire up a Tavily/Perplexity MCP and set `RESEARCH_MCP_URL`; the agent uses it automatically |
| Post to a manager channel instead of DMing the rep | Change step 6 in the system prompt |

---

## Operational notes

- **Idempotency.** Running the cron daily will try to create drafts for the same single-threaded deals repeatedly. For production, write a note on the deal when drafts are created, and have the agent skip deals that already have a recent "multi-thread drafts created" note. (Or dedupe in KV.)
- **Draft clutter.** If reps don't work the drafts, they pile up. Pair this quickstart with a weekly Slack nudge listing un-sent drafts older than N days.
- **Cost.** Depends on pipeline size. A sweep of 50 open late-stage deals with ~10 single-threaded runs ~3-5 minutes; budget ~$0.80-1.50 per run.

---

## Troubleshooting

**No drafts created but the session succeeded.**
Either nothing was single-threaded, or the HubSpot MCP is returning empty contact associations. Check the session log.

**Drafts reference wrong call context.**
The agent is pulling whatever activity the HubSpot MCP returns. If your HubSpot doesn't have call notes synced from Gong, the context will be thin. Consider running the `post-call-follow-up-email` quickstart first to enrich the note history.

**Research MCP returning random names.**
Tighten the system prompt: "Only use real names the research MCP returns from the company's public team page, LinkedIn, or press releases."

---

## Files

| File | What it does |
|------|--------------|
| [`src/index.ts`](./src/index.ts) | Worker cron + manual-trigger handler |
| [`src/managed-agent.ts`](./src/managed-agent.ts) | Opens a session and sends the run context |
| [`agent/agent-definition.ts`](./agent/agent-definition.ts) | System prompt + HubSpot, Gmail, Slack, optional Research MCP |
| [`scripts/create-agent.ts`](./scripts/create-agent.ts) | One-shot script to register the agent |
| [`wrangler.toml`](./wrangler.toml) | Deploy config, cron, stage + threshold vars |
| [`tests/`](./tests) | Vitest suite: scheduled handler, manual trigger, and agent context tests |
| [`vitest.config.ts`](./vitest.config.ts) | Vitest config (node env, runs `tests/**/*.test.ts`) |

---

## Related reading

- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart.md)
- [Gmail API — Drafts](https://developers.google.com/gmail/api/reference/rest/v1/users.drafts)
- [HubSpot API — Contacts & Deals](https://developers.hubspot.com/docs/api/crm/contacts)
