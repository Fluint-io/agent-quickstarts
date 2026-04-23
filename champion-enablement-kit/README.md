# Champion Enablement Kit

> A deal moves to Proposal in HubSpot. Within ten minutes, three documents appear in a Google Drive folder: a one-page executive summary, an internal business case with quantified ROI, and a stakeholder map. All written in the customer's own language, ready for the champion to forward internally without editing.

Built on **Claude Managed Agents**. Deployed to Cloudflare Workers. The compound quickstart — multiple input sources, heavy content generation, document output.

---

## The Problem

Champions can't close the deal for you, but they're the only people who can close it when you're not in the room — and the room where the deal actually gets decided is an internal meeting you'll never attend.

- Your champion needs to sell you to their CFO, their security team, their execs.
- They will do this with whatever they can pull from their inbox.
- If you haven't given them good material, they'll paraphrase your deck poorly. The deal dies in a meeting you didn't know happened.
- Writing a champion kit takes a senior rep 2-3 hours. They skip it.

## The Outcome

A deal moves to a configured stage. A Claude agent:

1. **Pulls deal context** from HubSpot: contacts, company info, deal properties, notes.
2. **Pulls call transcripts** from Gong for the deal: the actual language the customer used for their pain, their quantified impact, their objections.
3. **Generates three documents** in Google Docs format, saved to a shared Drive folder:
   - **Internal Business Case** (1-2 pages): quantified problem, solution, expected ROI.
   - **Stakeholder Map** (1 page): who's who, what they care about, how to speak to them.
   - **Executive Summary** (1 page, <300 words): the forwardable one-pager.
4. **Attaches them to the HubSpot deal** as a note with links.

The rep reviews, tweaks what's off, and sends the Drive link to the champion.

### What the output looks like

**Executive Summary (one-pager preview):**

> **Acme Corp — Fluint Evaluation**
>
> **The problem.** Acme's AE team spends ~6 hours per rep per week rebuilding the same forecast spreadsheet — roughly 72 hours weekly across 12 AEs, or ~$180k annually in loaded cost. This directly blocks weekly pipeline reviews, which Jane Doe (VP RevOps) described as "the weekly ops crunch that makes forecast calls unreliable."
>
> **Why now.** Acme's Q2 planning cycle requires a reliable forecast. Three vendors are under evaluation with a decision target of end of Q2. Migration risk — driven by two prior vendor failures — is the primary concern.
>
> **What we do.** Fluint replaces the manual forecast rollup with a governed data layer feeding directly into Acme's existing BI tools. Implementation takes 4 weeks with a phased cutover; the first forecast cycle runs in parallel to eliminate migration risk.
>
> **Investment.** $120k year one, $80k ongoing. Expected payback at month 4, assuming 75% time savings across the AE team.

---

## How it works

```
 HubSpot deal moves to Proposal
      │
      │  webhook: deal.propertyChange on dealstage
      ▼
 Cloudflare Worker  (src/index.ts)
      │
      │  1. verify X-HubSpot-Signature-v3
      │  2. filter for stage in trigger list
      │  3. open a Managed Agent session per matched deal
      │
      ▼
 Claude Managed Agent
      │  system prompt: champion-kit writer with HubSpot + Gong + Drive
      │  mcp_toolsets: hubspot, gong, google_drive
      │
      │  1. HubSpot: deal, company, contacts, notes
      │  2. Gong: recent call transcripts → customer language, quantified pain
      │  3. write 3 docs: business case, stakeholder map, exec summary
      │  4. Drive: save each as a Google Doc in the configured folder
      │  5. HubSpot: attach a note linking the 3 files
      │
      ▼
 Google Drive folder + HubSpot note
      │  3 docs ready to forward, linked from the deal
```

---

## Why this pattern works well for agents

This is the most demanding quickstart in the repo and the clearest case for an agent:

- **Multi-source synthesis.** CRM structured data + call transcripts + company info. An agent is the cheapest thing that can combine these fluently.
- **Voice matters.** The kit lives or dies on whether it sounds like the customer, not the vendor. Templates can't do this; an agent reading transcripts can.
- **Content generation with traceability.** Every claim in the business case should trace back to a specific source. The agent enforces "no invented numbers" by prompt — and you can verify in the session log.
- **High-value output.** One champion kit takes a senior rep 2+ hours. Even at $5/session in API cost, this is a 20-40x productivity win.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node 20+, pnpm 10+ | |
| Anthropic API key | With Managed Agents beta access — [platform.claude.com](https://platform.claude.com) |
| Managed Agents environment ID | Create in the Console; looks like `env_...` |
| HubSpot MCP server URL | Anthropic-hosted connector, or your own MCP server |
| Gong MCP server URL | With access to calls + transcripts |
| Google Drive MCP server URL | With write access to the target folder |
| Google Drive folder | Shared with your team; ID set in `wrangler.toml` |
| HubSpot webhook access | To fire on `deal.propertyChange` for `dealstage` |
| Cloudflare account | Free tier is fine; install `wrangler` CLI |

---

## Setup

### 1. Clone and install

```bash
git clone git@github.com:Fluint-io/agent-quickstarts.git
cd agent-quickstarts/champion-enablement-kit
pnpm install
```

### 2. Create the Managed Agent

Review [`agent/agent-definition.ts`](./agent/agent-definition.ts). This is the longest and most opinionated system prompt in the repo — tune the three docs' structures, length caps, and tone rules.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export HUBSPOT_MCP_URL=https://your-hubspot-mcp/
export GONG_MCP_URL=https://your-gong-mcp/
export GOOGLE_DRIVE_MCP_URL=https://your-drive-mcp/
pnpm run create-agent
```

### 3. Configure Worker secrets + vars

Set trigger stages and Drive folder in `wrangler.toml`:

```toml
[vars]
TRIGGER_STAGE_IDS = "presentationscheduled,decisionmakerboughtin"
DRIVE_FOLDER_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz"
```

Secrets:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put MANAGED_AGENT_ID
wrangler secret put MANAGED_ENVIRONMENT_ID
wrangler secret put HUBSPOT_WEBHOOK_SECRET    # shared secret for signature verify
```

### 4. Test locally

```bash
pnpm run dev
```

In another terminal:

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-HubSpot-Signature-v3: $HUBSPOT_WEBHOOK_SECRET" \
  -d @fixtures/sample-hubspot-event.json
```

Response: `{"ok":true,"matched":1,"sessions":["sesn_..."]}`. Open the session in the Anthropic Console. You'll see it call HubSpot, then Gong, then Google Drive, in order.

### 5. Deploy

```bash
pnpm run deploy
```

### 6. Wire up the HubSpot webhook

In HubSpot → Settings → Integrations → Webhooks:

- **Target URL:** your Worker URL from step 5
- **Subscription:** `deal.propertyChange` on property `dealstage`

HubSpot's signature scheme is more complex than the simple shared-secret check shown here — for production, implement proper v3 HMAC verification.

---

## Running the test suite

The quickstart ships with a [vitest](https://vitest.dev) suite that mocks the Anthropic SDK — so no network calls, and you can assert exactly what the agent receives.

```bash
pnpm install
pnpm test
```

What's covered:
- [`tests/handler.test.ts`](./tests/handler.test.ts) — signature rejection, the 500 when `DRIVE_FOLDER_ID` is unconfigured, event filtering by `propertyName` + stage, and fan-out (N matched events → N sessions opened).
- [`tests/agent.test.ts`](./tests/agent.test.ts) — session metadata is tagged with deal ID and trigger stage; the user message includes the deal ID, new stage, and Drive folder.

The Anthropic SDK mock pattern lives at the top of [`tests/agent.test.ts`](./tests/agent.test.ts) (`vi.hoisted` + `vi.mock("@anthropic-ai/sdk", ...)`). Copy it when you add new agent tests.

---

## How the agent decides

- **Customer language, always.** Every phrase the kit uses must come from either the CRM or a call transcript. No vendor re-phrasing.
- **No invented numbers.** If quantified pain isn't in the transcripts, the business case gets a TODO marker, not a hallucinated ROI.
- **Traceability.** Every major claim should be traceable to a specific source. This keeps reps honest when they review the kit.
- **Document length caps.** Business case under 800 words, exec summary under 300. Long docs don't get forwarded.
- **Google Docs format.** Not PDF. Reps need to edit.

Everything above is in the system prompt. Tune freely.

---

## Extending the pattern

| Variation | How |
|-----------|-----|
| Salesforce instead of HubSpot | Swap the HubSpot MCP URL; webhook schema will change too |
| Chorus instead of Gong | Swap the Gong MCP URL |
| PDF output instead of Google Docs | Ask for PDF export in step 3 of the prompt; Drive MCP can usually export |
| Additional docs (e.g., pricing overview) | Add a fourth doc to the system prompt's step 2 |
| Attach to CRM instead of Drive | Swap Google Drive MCP for a direct file-attach via HubSpot MCP |

---

## Operational notes

- **Cost.** This is the most expensive quickstart. A full kit run pulls 3-5 transcripts (each can be long) and generates 3 documents of 300-1500 words each. Budget **$2-5 per kit**. Even at the high end, this is ~1% of the cost of a senior rep writing it manually.
- **Idempotency.** HubSpot may redeliver webhooks. Dedupe on `dealId + newStage + date` via KV so the same deal doesn't generate 4 kits.
- **Data quality.** The kit is only as good as the transcripts and CRM data. If your reps don't log stakeholders or call notes, the stakeholder map will be thin. The agent will flag TODOs where data is missing — pay attention to those.
- **Review before forwarding.** Never configure this to auto-send the kit to the champion. The rep is always the final check — the agent produces drafts, not sent artifacts.
- **Session time.** A full kit takes 3-8 minutes to generate. Cloudflare Workers has a 30-second synchronous wall, but the session continues in the background after the Worker returns.

---

## Troubleshooting

**Kit has TODO markers for quantified pain.**
The agent couldn't find numbers in the call transcripts. Listen to the calls — did the customer ever quantify the pain? If not, the kit honestly reflects that. Coach reps to ask quantifying questions.

**Exec summary sounds like marketing copy.**
The prompt says "customer language, not vendor speak," but the call transcripts may not have strong customer phrases. Add an explicit instruction: "If the customer did not describe the problem in their own words, write the summary in plain language and skip quotes entirely."

**Docs are in the wrong format.**
The Google Drive MCP you're using may not support Docs creation. Check its tool inventory — some drive MCPs only do file uploads. You may need a Docs-specific MCP.

**Kit generated twice for the same deal.**
Implement KV-based dedupe in `src/index.ts` before calling `runChampionKitAgent`. Key on `dealId` + date.

---

## Files

| File | What it does |
|------|--------------|
| [`src/index.ts`](./src/index.ts) | Worker fetch handler: HubSpot webhook verify, stage filter, session fan-out |
| [`src/managed-agent.ts`](./src/managed-agent.ts) | Opens a session per matched deal and sends the run input |
| [`agent/agent-definition.ts`](./agent/agent-definition.ts) | System prompt + HubSpot, Gong, Drive MCP toolsets |
| [`scripts/create-agent.ts`](./scripts/create-agent.ts) | One-shot script to register the agent |
| [`wrangler.toml`](./wrangler.toml) | Deploy config, trigger stages, Drive folder |
| [`fixtures/sample-hubspot-event.json`](./fixtures/sample-hubspot-event.json) | Example HubSpot webhook payload for local testing |
| [`tests/`](./tests) | Vitest suite: handler filtering, fan-out, and agent context tests |
| [`vitest.config.ts`](./vitest.config.ts) | Vitest config (node env, runs `tests/**/*.test.ts`) |

---

## Related reading

- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart.md)
- [HubSpot Webhooks API](https://developers.hubspot.com/docs/api/webhooks)
- [Google Drive API — Files](https://developers.google.com/drive/api/reference/rest/v3/files)
- [Gong API — List Calls Transcripts](https://app.gong.io/settings/api/documentation)
