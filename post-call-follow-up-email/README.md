# Post-Call Follow-Up Email

> A Gong call ends. Two minutes later, a draft recap email is sitting in the rep's Gmail — written in the customer's language, with the commitments spelled out, ready to review and send.

Built on **Claude Managed Agents**. Roughly 200 lines of code. Deployed to Cloudflare Workers.

---

## The Problem

The post-call recap is the highest-leverage email in the sales cycle and the one reps most consistently skip.

- Rep ends a call, gets pulled into the next one.
- By the time they sit down to write the recap, half the nuance is gone.
- What gets sent is a generic "great chatting today!" that adds nothing.
- The customer's own language — the exact phrase they used to describe their pain — never makes it into writing.

The commitments made on the call evaporate. The champion has nothing to forward internally. The deal loses momentum before the next meeting.

## The Outcome

When Gong fires a `call_ended` webhook, a Claude agent:

1. **Pulls the transcript** from Gong.
2. **Drafts a recap email** in the customer's language: what we heard, what we committed to, open questions (if any).
3. **Creates a Gmail draft** in the rep's inbox — not sent, not queued. Just a draft, ready for a 10-second review.

The rep's job is to have the conversation. The draft is waiting when they get back to their desk.

### What the output looks like

**Subject:** Acme Corp <> Fluint — recap & next steps

> Hi Jane,
>
> Thanks for the time today. Quick recap so we're aligned.
>
> **What we heard**
> - Your AE team is spending ~6 hours a week rebuilding the same forecast spreadsheet, which is blocking weekly pipeline reviews.
> - You're evaluating three vendors with a decision target of end of Q2.
> - Migration risk is the #1 concern — you've had two prior vendors miss on this.
> - SOC 2 is table stakes for procurement.
>
> **What we committed to**
> - Jon to send SOC 2 report and security one-pager by tomorrow.
> - Jon to schedule a pricing call with your CFO for Tuesday.
> - Jane to share the current ops runbook this week.
>
> Let me know if I missed anything.
>
> Jon

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
      │  4. send user.message event (transcript + attendees + rep)
      │
      ▼
 Claude Managed Agent
      │  system prompt: recap-email writer with Gmail tool access
      │  mcp_toolset: gmail
      │
      │  thinks, then calls Gmail MCP:
      │    - drafts.create (To, Subject, Body)
      │
      ▼
 Gmail
      │  draft in rep's inbox, ready to review
```

**What the Worker does:** validates the webhook, fetches the transcript, opens a session. ~100 lines.

**What the agent does:** everything else — summarization, tone, recipient selection, draft creation.

---

## Why this pattern works well for agents

The recap email is an almost perfect Managed Agents workload:

- **Bounded input, judgment-heavy output.** Transcripts are finite, but "what matters and how to phrase it" is where a model earns its keep.
- **Human review built in.** The output is a *draft*. The rep is the final check. This is the safest place to start with agent writes: no auto-send, no external side effects.
- **Format is prose.** Not structured data, not API calls — just well-written English (or whatever language the call was in).
- **Async by nature.** Nobody's blocking on the response. The draft appearing 2 minutes post-call is fine; 30 seconds is great.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node 20+, pnpm 10+ | |
| Anthropic API key | With Managed Agents beta access — [platform.claude.com](https://platform.claude.com) |
| Managed Agents environment ID | Create in the Console; looks like `env_...` |
| Gmail MCP server URL | Anthropic-hosted connector, or your own MCP server |
| Gong account | With webhook + API access (paid tier) |
| Cloudflare account | Free tier is fine; install `wrangler` CLI |

> **Outlook instead of Gmail?** The Gmail MCP is a swap-target. Point `MCP_URL` at an Outlook/Graph MCP and tweak the tool names in the system prompt. No Worker code changes.

---

## Setup

Estimated time: **20-30 minutes** end-to-end.

### 1. Clone and install

```bash
git clone git@github.com:Fluint-io/agent-quickstarts.git
cd agent-quickstarts/post-call-follow-up-email
pnpm install
```

### 2. Create the Managed Agent

The agent definition lives in [`agent/agent-definition.ts`](./agent/agent-definition.ts). Review the system prompt — this is where you'd tune tone, email length, signature style, or customer-language guardrails.

Then register it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export GMAIL_MCP_URL=https://your-gmail-mcp/
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

Response: `{"ok":true,"sessionId":"sesn_..."}`. Open the session in the Anthropic Console to watch the agent work. Then check the rep's Gmail drafts.

### 5. Deploy

```bash
pnpm run deploy
```

### 6. Wire up the Gong webhook

In Gong → Integrations → Webhooks:

- **URL:** your Worker URL from step 5
- **Event:** `Call Ended`
- **Custom header:** `X-Gong-Signature: <your GONG_WEBHOOK_SECRET value>`

Have a test call, end it, and check the drafts folder.

---

## Running the test suite

The quickstart ships with a [vitest](https://vitest.dev) suite that mocks the Anthropic SDK — so no network calls, and you can assert exactly what the agent receives.

```bash
pnpm install
pnpm test
```

What's covered:
- [`tests/gong.test.ts`](./tests/gong.test.ts) — transcript parser plus the Gong API client (with `fetch` stubbed out).
- [`tests/handler.test.ts`](./tests/handler.test.ts) — signature + event rejection paths, happy path, and the `callDate` fallback when the event doesn't include one.
- [`tests/agent.test.ts`](./tests/agent.test.ts) — primary-recipient selection (first non-rep attendee; empty when only the rep is present) plus transcript inclusion in the user message.

The Anthropic SDK mock pattern lives at the top of [`tests/agent.test.ts`](./tests/agent.test.ts) (`vi.hoisted` + `vi.mock("@anthropic-ai/sdk", ...)`). Copy it when you add new agent tests.

---

## How the agent decides

The system prompt ([`agent/agent-definition.ts`](./agent/agent-definition.ts)) encodes the writing rules:

- **Customer language, not vendor speak.** If the customer said "the weekly ops crunch," that phrase goes in the email verbatim.
- **No invented commitments.** If it wasn't said on the call, it doesn't go in the email. Hallucinated next steps erode trust faster than a missed recap.
- **Length cap.** Under ~250 words. A draft a rep won't edit is a draft that won't get sent.
- **Draft only.** Never sends. The agent has no `send` permission in the system prompt even if the MCP exposes one.

Tune these in the prompt — no code changes needed.

---

## Extending the pattern

| Trigger source | Email destination | Changes needed |
|----------------|-------------------|----------------|
| Zoom / Teams / Chorus | Gmail | Swap the transcript-fetch client |
| Gong | Outlook | Swap Gmail MCP for Outlook MCP |
| Calendar meeting ended | Gmail | Swap trigger (Google Calendar webhook), keep agent |

If the input is a transcript and the output is "a draft email in someone's inbox," this pattern fits.

---

## Operational notes

- **Idempotency.** Gong may redeliver webhooks; without dedupe you'll get duplicate drafts. For production, dedupe on `callId` via a [Workers KV](https://developers.cloudflare.com/kv/) binding before calling `runFollowUpAgent`.
- **Security.** We check `x-gong-signature` against a shared secret in constant time. For HMAC-signed webhooks, swap in HMAC verification.
- **Language detection.** Add the call language (from Gong) to the user message so the agent writes the recap in the right language — the default assumes English.
- **Cost.** A typical recap session runs under 30 seconds. Budget ~$0.03-0.08 per call.

---

## Troubleshooting

**Draft appears but goes to the wrong recipient.**
The agent picks the first non-rep attendee as the primary recipient. If your calls have multiple customer attendees with different seniority, tune the system prompt to prefer the senior person (e.g., match on job title from a CRM enrichment step).

**Draft includes facts that weren't said on the call.**
Make the "never invent" rule more aggressive in the system prompt, and/or add a validation step that greps the draft for facts not present in the transcript.

**Worker times out.**
Cloudflare Workers has a 30-second wall for synchronous requests. Use `ctx.waitUntil(runFollowUpAgent(...))` and return `{ ok: true }` immediately — the session keeps running.

---

## Files

| File | What it does |
|------|--------------|
| [`src/index.ts`](./src/index.ts) | Worker fetch handler: signature check, transcript fetch, session handoff |
| [`src/gong.ts`](./src/gong.ts) | Minimal Gong API client (transcript only) |
| [`src/managed-agent.ts`](./src/managed-agent.ts) | Opens a session and sends the transcript as a user event |
| [`agent/agent-definition.ts`](./agent/agent-definition.ts) | System prompt + Gmail MCP toolset config |
| [`scripts/create-agent.ts`](./scripts/create-agent.ts) | One-shot script to register the agent with Anthropic |
| [`wrangler.toml`](./wrangler.toml) | Cloudflare Workers deploy config |
| [`fixtures/sample-gong-event.json`](./fixtures/sample-gong-event.json) | Example webhook payload for local testing |
| [`tests/`](./tests) | Vitest suite: handler, agent, and Gong helper tests |
| [`vitest.config.ts`](./vitest.config.ts) | Vitest config (node env, runs `tests/**/*.test.ts`) |

---

## Related reading

- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart.md)
- [MCP specification](https://modelcontextprotocol.io)
- [Gmail API — Drafts](https://developers.google.com/gmail/api/reference/rest/v1/users.drafts)
- [Gong API — List Calls Transcripts](https://app.gong.io/settings/api/documentation)
