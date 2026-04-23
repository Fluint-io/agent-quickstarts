import { fetchGongTranscript } from "./gong.js";
import { runSummaryAgent } from "./managed-agent.js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  MANAGED_AGENT_ID: string;
  MANAGED_ENVIRONMENT_ID: string;
  GONG_ACCESS_KEY: string;
  GONG_ACCESS_KEY_SECRET: string;
  GONG_WEBHOOK_SECRET: string;
  GONG_BASE_URL?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    const signature = request.headers.get("x-gong-signature");
    if (!signature || !safeEqual(signature, env.GONG_WEBHOOK_SECRET)) {
      return json({ error: "invalid signature" }, 401);
    }

    const event = (await request.json()) as GongCallEndedEvent;
    if (event.eventType !== "call_ended" || !event.callId) {
      return json({ error: "unsupported event" }, 400);
    }

    const transcript = await fetchGongTranscript(env, event.callId);
    const result = await runSummaryAgent(env, {
      callId: event.callId,
      callTitle: event.title ?? "Untitled call",
      ownerEmail: event.ownerEmail,
      attendees: event.attendees ?? [],
      transcript,
    });

    return json({ ok: true, sessionId: result.sessionId });
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

type GongCallEndedEvent = {
  eventType: string;
  callId: string;
  title?: string;
  ownerEmail?: string;
  attendees?: Array<{ email: string; name?: string }>;
};
