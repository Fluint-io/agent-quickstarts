import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./index.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

export type RunContext = {
  watchedStageIds: string[];
  minDaysInStage: number;
  maxDraftsPerDeal: number;
  today: string;
};

export async function runMultiThreadAgent(env: Env, ctx: RunContext): Promise<{ sessionId: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const session = await client.beta.sessions.create({
    agent: { id: env.MANAGED_AGENT_ID, type: "agent" },
    environment_id: env.MANAGED_ENVIRONMENT_ID,
    metadata: { run_date: ctx.today },
    betas: [MANAGED_AGENTS_BETA],
  });

  const userMessage = [
    `Run date: ${ctx.today}`,
    `Minimum days in stage: ${ctx.minDaysInStage}`,
    `Max stakeholder drafts per deal: ${ctx.maxDraftsPerDeal}`,
    ctx.watchedStageIds.length
      ? `Watched stages: ${ctx.watchedStageIds.join(", ")}.`
      : "Scope: all late-stage open deals.",
    "",
    "Task: run the multi-thread sweep per your instructions. Find single-threaded deals past the threshold, identify additional stakeholders to engage, draft personalized outreach emails in the rep's Gmail, and DM the rep in Slack summarizing the drafts.",
  ].join("\n");

  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: userMessage }],
      },
    ],
    betas: [MANAGED_AGENTS_BETA],
  });

  return { sessionId: session.id };
}
