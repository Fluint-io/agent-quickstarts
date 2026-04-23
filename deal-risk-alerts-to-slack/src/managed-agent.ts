import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./index.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

export type RunContext = {
  goingDarkDays: number;
  stalledStageDays: number;
  activeStageIds: string[];
  today: string;
};

export async function runRiskScanAgent(env: Env, ctx: RunContext): Promise<{ sessionId: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const session = await client.beta.sessions.create({
    agent: { id: env.MANAGED_AGENT_ID, type: "agent" },
    environment_id: env.MANAGED_ENVIRONMENT_ID,
    metadata: { run_date: ctx.today },
    betas: [MANAGED_AGENTS_BETA],
  });

  const userMessage = [
    `Run date: ${ctx.today}`,
    `Going-dark threshold: ${ctx.goingDarkDays} days without activity.`,
    `Stalled-stage threshold: ${ctx.stalledStageDays} days in the same stage.`,
    ctx.activeStageIds.length
      ? `Scope: only scan deals in these stages: ${ctx.activeStageIds.join(", ")}.`
      : "Scope: all open-pipeline stages.",
    "",
    "Task: run the nightly risk scan per your instructions. Pull the pipeline from HubSpot, identify at-risk deals, group by owner, and DM each owner in Slack with their prioritized list plus pre-drafted next steps.",
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
