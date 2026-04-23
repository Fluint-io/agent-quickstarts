# Gong → HubSpot Call Summary

> A Gong call ends. Within 60 seconds, the matching HubSpot deal has a crisp summary note and a clean list of follow-up tasks — assigned to the right person, with due dates where they were mentioned on the call.

Built on **Claude Managed Agents**. Roughly 200 lines of code. Deployed to Cloudflare Workers.

---

## The Problem

Every sales team loses the same battle with post-call hygiene:

- Reps end a call, get pulled into the next one, and never update the CRM.
- The "next steps" spoken on the call evaporate by end of day.
- Managers can't see what's actually happening in the pipeline without listening to every recording.

Gong captures the conversation. HubSpot is the system of record. The gap between them is where deals go cold.

## The Outcome

This quickstart closes that gap automatically. When Gong fires a `call_ended` webhook, a Claude agent:

1. **Pulls the transcript** from the Gong API
2. **Summarizes the call** — 5-8 bullets: context, topics, pain, objections, decisions
3. **Extracts next steps** — action + owner + due date (if mentioned)
4. **Finds the deal** in HubSpot by matching attendee emails → contacts → deals
5. **Writes a note** on the deal with the summary, titled `Gong call: <call title>`
6. **Creates tasks** for each next step, assigned to the call owner's HubSpot user

No rep input required. The rep's job is just to have the conversation.

### What the output looks like

**Deal note:**

> **Gong call: Acme Corp — discovery**
>
> - Acme's AE team is evaluating three vendors (us, Fluint, Gong); decision timeline is end of Q2.
> - Primary pain: 6-hour weekly ops cycle rebuilding the same spreadsheet, blocking forecast reviews.
> - Economic buyer is Jane Doe (VP RevOps); she joined late and asked twice about SOC 2.
> - Objection: concerned about migration risk — they've been burned by two prior vendors.
> - Agreed to a second call Tuesday with their CFO to walk through pricing.
> - Jane to share current ops runbook this week so we can spec the migration path.

**Tasks created:**

| Task | Owner | Due |
|------|-------|-----|
| Send SOC 2 report + security one-pager | Jon Crawley | Tomorrow |
| Schedule CFO call for Tuesday | Jon Crawley | Friday |
| Review ops runbook when Jane sends it | Jon Crawley | Next week |

---

## How it works

```
 Gong call ends
      │
      │  webhook: POST with callId
      ▼
 Cloudflare Worker  (src/index.ts)
      │
      │  1. verify X-Gong-Signature
      │  2. GET /v2/calls/transcript  ──►  Gong API
      │  3. create Managed Agent session
      │  4. send user.message event (transcript + attendees + instructions)
      │
      ▼
 Claude Managed Agent
      │  system prompt: summarizer with HubSpot tool access
      │  mcp_toolset: hubspot
      │
      │  thinks, then calls HubSpot MCP:
      │    - search_contacts by email
      │    - get_contact_associations → deal
      │    - create_note on deal
      │    - create_task (one per next step)
      │
      ▼
 HubSpot
      │  note + N tasks written back to the deal
```

**What the Worker does:** validates the webhook, fetches the transcript, opens a session. ~100 lines.

**What the agent does:** everything else — reasoning, deal matching, tool orchestration, error handling.

The split matters. The Worker is stateless and cheap. The agent carries the session state and handles all the messy CRM logic declaratively, via the system prompt.

---

## Why this pattern works well for agents

Post-call CRM updates are a near-ideal Managed Agents workload:

- **Bounded input, unbounded reasoning.** The transcript is finite but the fan-out of "what to do with it" (match deal, decide assignee, parse dates) is exactly where a model beats rules.
- **Deterministic output shape.** One note + N tasks. Easy to evaluate, easy to retry.
- **Write path lives in an MCP server.** The agent doesn't know HubSpot internals — it just uses the tools the MCP exposes. Swap HubSpot for Salesforce with a config change.
- **Async by nature.** Nobody is waiting on the response. Sessions can run for minutes; billing is per session-hour.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node 20+, pnpm 10+ | |
| Anthropic API key | With Managed Agents beta access — [platform.claude.com](https://platform.claude.com) |
| Managed Agents environment ID | Create in the Console; looks like `env_...` |
| HubSpot MCP server URL | Anthropic-hosted connector, or your own MCP server |
| Gong account | With webhook + API access (paid tier) |
| Cloudflare account | Free tier is fine; install `wrangler` CLI |

---

## Setup

Estimated time: **20-30 minutes** end-to-end.

### 1. Clone and install

```bash
git clone git@github.com:Fluint-io/agent-quickstarts.git
cd agent-quickstarts/gong-to-hubspot-summary
pnpm install
```

### 2. Create the Managed Agent

The agent definition lives in [`agent/agent-definition.ts`](./agent/agent-definition.ts). Review the system prompt — this is where you'd tune tone, what counts as a "next step," how aggressive to be about deal matching, etc.

Then register it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export HUBSPOT_MCP_URL=https://your-hubspot-mcp/
pnpm run create-agent
```

The script prints `agent_...`. Save it for the next step.

### 3. Configure Worker secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put MANAGED_AGENT_ID          # agent_... from step 2
wrangler secret put MANAGED_ENVIRONMENT_ID    # env_... from the Console
wrangler secret put GONG_ACCESS_KEY
wrangler secret put GONG_ACCESS_KEY_SECRET
wrangler secret put GONG_WEBHOOK_SECRET       # any strong random string
```

### 4. Test locally

```bash
pnpm run dev
```

In another terminal, send the fixture event:

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Gong-Signature: $GONG_WEBHOOK_SECRET" \
  -d @fixtures/sample-gong-event.json
```

Response: `{"ok":true,"sessionId":"sesn_..."}`. Open the session in the Anthropic Console to watch the agent work in real time.

### 5. Deploy

```bash
pnpm run deploy
```

Wrangler prints the public Worker URL.

### 6. Wire up the Gong webhook

In Gong → Integrations → Webhooks:

- **URL:** your Worker URL from step 5
- **Event:** `Call Ended`
- **Custom header:** `X-Gong-Signature: <your GONG_WEBHOOK_SECRET value>`

Have a test call, end it, and watch HubSpot.

---

## Running the test suite

The quickstart ships with a [vitest](https://vitest.dev) suite that mocks the Anthropic SDK — so no network calls, and you can assert exactly what the agent receives.

```bash
pnpm install
pnpm test
```

What's covered:
- [`tests/gong.test.ts`](./tests/gong.test.ts) — transcript parser plus the Gong API client (with `fetch` stubbed out).
- [`tests/handler.test.ts`](./tests/handler.test.ts) — signature rejection, wrong event types, and the full happy path (`call_ended` → transcript fetch → session opened → `200 { sessionId }`).
- [`tests/agent.test.ts`](./tests/agent.test.ts) — asserts the session is created with the right agent/environment IDs and the user message contains the transcript and attendees.

The Anthropic SDK mock pattern lives at the top of [`tests/agent.test.ts`](./tests/agent.test.ts) (`vi.hoisted` + `vi.mock("@anthropic-ai/sdk", ...)`). Copy it when you add new agent tests.

---

## How the agent decides

The system prompt ([`agent/agent-definition.ts`](./agent/agent-definition.ts)) encodes the entire decision tree:

- **Summary structure:** "5-8 bullets covering context, topics, pain, objections, decisions." Constrained enough for consistency, loose enough to skip sections that didn't come up.
- **Next-step extraction:** "action + owner + due date (if mentioned)." The `if mentioned` matters — hallucinated due dates are worse than missing ones.
- **Deal matching:** email → contact → primary deal. If multiple deals match, most recently modified wins.
- **Fail-safe:** if no deal matches, the agent stops and reports which emails it searched. No orphan notes.

Tune these to taste. The agent's behavior is a prompt edit away — no code changes needed.

---

## Extending the pattern

The same skeleton works for any **call-data → CRM-write-back** workflow. Swap one or both sides:

| Trigger source | Sink | Changes needed |
|----------------|------|----------------|
| Zoom / Teams / Chorus | HubSpot | Swap the transcript-fetch client |
| Gong | Salesforce | Swap HubSpot MCP for Salesforce MCP |
| Calendar invite | HubSpot activity log | Swap trigger, keep agent |
| Support ticket closed | Zendesk macros | Swap both; same agent pattern |

If the input is text and the output is "write structured data somewhere," this pattern is a fit.

---

## Operational notes

- **Idempotency.** `create_note` and `create_task` in HubSpot are not idempotent. If Gong redelivers a webhook (and it will), you'll get duplicate writes. For production, dedupe on `gong_call_id` via a [Workers KV](https://developers.cloudflare.com/kv/) binding before calling `runSummaryAgent`.
- **Security.** We check `x-gong-signature` against a shared secret in constant time. If your Gong plan supports HMAC-signed webhooks, swap in HMAC verification — stronger guarantees against replay.
- **Cost.** Managed Agents pricing is $0.08 per session-hour + standard Claude token usage. A typical call summary session completes in under 60 seconds, so the session fee is effectively rounding error — token cost dominates. Budget ~$0.05-0.15 per call.
- **Scale.** Cloudflare Workers scale to zero and horizontally without config. Managed Agents handles session concurrency. You can fire 100 webhooks simultaneously and the pipeline just works.
- **Observability.** Every session is visible in the Anthropic Console with a full event log — MCP calls, tool results, model turns. For production, pipe session IDs to your logging stack so you can correlate incidents to sessions.

---

## Troubleshooting

**The agent says "no matching deal found."**
Check that the attendees on the Gong call have HubSpot contacts with matching email addresses. If your team uses multiple emails (work/personal), you may need to extend the system prompt to also search by domain.

**Duplicate notes after a redelivery.**
Add the KV-based dedupe described in Operational notes. Gong retries aggressively on non-2xx responses, so always return `{ ok: true }` fast.

**Worker times out.**
Cloudflare Workers has a 30-second wall for synchronous requests. The fix is to `ctx.waitUntil(runSummaryAgent(...))` and return `{ ok: true }` immediately — the session keeps running in the background.

**The agent creates tasks with no due date when a date was mentioned.**
The transcript timestamps are relative. Tell the agent the call's absolute date in the user message so it can resolve "next Tuesday" correctly. (TODO in this quickstart — PR welcome.)

---

## Files

| File | What it does |
|------|--------------|
| [`src/index.ts`](./src/index.ts) | Worker fetch handler: signature check, transcript fetch, session handoff |
| [`src/gong.ts`](./src/gong.ts) | Minimal Gong API client (transcript only) |
| [`src/managed-agent.ts`](./src/managed-agent.ts) | Opens a session and sends the transcript as a user event |
| [`agent/agent-definition.ts`](./agent/agent-definition.ts) | System prompt + MCP toolset config |
| [`scripts/create-agent.ts`](./scripts/create-agent.ts) | One-shot script to register the agent with Anthropic |
| [`wrangler.toml`](./wrangler.toml) | Cloudflare Workers deploy config |
| [`fixtures/sample-gong-event.json`](./fixtures/sample-gong-event.json) | Example webhook payload for local testing |
| [`tests/`](./tests) | Vitest suite: handler, agent, and Gong helper tests |
| [`vitest.config.ts`](./vitest.config.ts) | Vitest config (node env, runs `tests/**/*.test.ts`) |

---

## Related reading

- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart.md)
- [MCP specification](https://modelcontextprotocol.io)
- [Gong API — List Calls Transcripts](https://app.gong.io/settings/api/documentation)
- [HubSpot Engagements API](https://developers.hubspot.com/docs/api/crm/engagements)
