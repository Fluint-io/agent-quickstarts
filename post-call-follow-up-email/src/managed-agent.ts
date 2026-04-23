import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "./index.js";
import { transcriptToPlainText, type GongTranscript } from "./gong.js";

const MANAGED_AGENTS_BETA = "managed-agents-2026-04-01";

export type AgentInput = {
  callId: string;
  callTitle: string;
  callDate: string;
  ownerEmail?: string;
  attendees: Array<{ email: string; name?: string }>;
  transcript: GongTranscript;
};

export async function runFollowUpAgent(env: Env, input: AgentInput): Promise<{ sessionId: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const session = await client.beta.sessions.create({
    agent: { id: env.MANAGED_AGENT_ID, type: "agent" },
    environment_id: env.MANAGED_ENVIRONMENT_ID,
    metadata: { gong_call_id: input.callId },
    betas: [MANAGED_AGENTS_BETA],
  });

  const customerAttendees = input.attendees.filter((a) => a.email !== input.ownerEmail);
  const primaryRecipient = customerAttendees[0]?.email ?? "";

  const userMessage = [
    `Gong call: ${input.callTitle} (id: ${input.callId})`,
    `Call date: ${input.callDate}`,
    `Rep (email the draft will appear in): ${input.ownerEmail ?? "unknown"}`,
    `Primary recipient: ${primaryRecipient}`,
    `All attendees: ${input.attendees.map((a) => `${a.name ?? ""} <${a.email}>`).join(", ")}`,
    "",
    "Transcript:",
    transcriptToPlainText(input.transcript),
    "",
    "Task: draft a forwardable recap email per your instructions and save it to the rep's Gmail drafts.",
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
