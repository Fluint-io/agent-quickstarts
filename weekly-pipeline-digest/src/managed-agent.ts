import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./index.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

export type RunContext = {
  slackChannel: string;
  windowDays: number;
  today: string;
  windowStart: string;
};

export async function runDigestAgent(env: Env, ctx: RunContext): Promise<{ sessionId: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const session = await client.beta.sessions.create({
    agent: { id: env.MANAGED_AGENT_ID, type: "agent" },
    environment_id: env.MANAGED_ENVIRONMENT_ID,
    metadata: { digest_week_of: ctx.windowStart },
    betas: [MANAGED_AGENTS_BETA],
  });

  const userMessage = [
    `Today: ${ctx.today}`,
    `Week window: ${ctx.windowStart} → ${ctx.today} (${ctx.windowDays} days).`,
    `Post the digest to Slack channel: ${ctx.slackChannel}`,
    "",
    "Task: produce and post the weekly pipeline digest per your instructions. Synthesize what moved forward, what stalled, what closed, and where coverage gaps are. Include deal-level recommendations with specific next steps.",
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
