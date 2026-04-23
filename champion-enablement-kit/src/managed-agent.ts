import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./index.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

export type AgentInput = {
  dealId: string;
  newStage: string;
  driveFolderId: string;
};

export async function runChampionKitAgent(env: Env, input: AgentInput): Promise<{ sessionId: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const session = await client.beta.sessions.create({
    agent: { id: env.MANAGED_AGENT_ID, type: "agent" },
    environment_id: env.MANAGED_ENVIRONMENT_ID,
    metadata: { hubspot_deal_id: input.dealId, trigger_stage: input.newStage },
    betas: [MANAGED_AGENTS_BETA],
  });

  const userMessage = [
    `HubSpot deal moved to stage: ${input.newStage}`,
    `Deal ID: ${input.dealId}`,
    `Google Drive folder to drop the kit into: ${input.driveFolderId}`,
    "",
    "Task: generate the champion enablement kit for this deal per your instructions. Pull deal context from HubSpot, call transcripts from Gong, then produce and save the kit to the provided Drive folder.",
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
