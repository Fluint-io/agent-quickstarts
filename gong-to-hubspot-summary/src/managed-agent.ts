import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./index.js";
import { transcriptToPlainText, type GongTranscript } from "./gong.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

export type AgentInput = {
  callId: string;
  callTitle: string;
  ownerEmail?: string;
  attendees: Array<{ email: string; name?: string }>;
  transcript: GongTranscript;
};

export async function runSummaryAgent(env: Env, input: AgentInput): Promise<{ sessionId: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const session = await client.beta.sessions.create({
    agent: { id: env.MANAGED_AGENT_ID, type: "agent" },
    environment_id: env.MANAGED_ENVIRONMENT_ID,
    metadata: { gong_call_id: input.callId },
    betas: [MANAGED_AGENTS_BETA],
  });

  const userMessage = [
    `Gong call: ${input.callTitle} (id: ${input.callId})`,
    `Call owner: ${input.ownerEmail ?? "unknown"}`,
    `Attendees: ${input.attendees.map((a) => `${a.name ?? ""} <${a.email}>`).join(", ")}`,
    "",
    "Transcript:",
    transcriptToPlainText(input.transcript),
    "",
    "Task: summarize this call, extract next steps, then push a note and tasks to HubSpot per your instructions.",
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
