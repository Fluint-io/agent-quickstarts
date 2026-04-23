import { runChampionKitAgent } from "./managed-agent.js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  MANAGED_AGENT_ID: string;
  MANAGED_ENVIRONMENT_ID: string;
  HUBSPOT_WEBHOOK_SECRET: string;
  TRIGGER_STAGE_IDS: string;
  DRIVE_FOLDER_ID: string;
}

type HubSpotEvent = {
  subscriptionType: string;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    const signature = request.headers.get("x-hubspot-signature-v3");
    if (!signature || !safeEqual(signature, env.HUBSPOT_WEBHOOK_SECRET)) {
      return json({ error: "invalid signature" }, 401);
    }

    if (!env.DRIVE_FOLDER_ID) {
      return json({ error: "DRIVE_FOLDER_ID not configured" }, 500);
    }

    const events = (await request.json()) as HubSpotEvent[];
    const triggerStages = env.TRIGGER_STAGE_IDS.split(",").map((s) => s.trim()).filter(Boolean);

    const matched = events.filter(
      (e) =>
        e.subscriptionType === "deal.propertyChange" &&
        e.propertyName === "dealstage" &&
        e.propertyValue &&
        triggerStages.includes(e.propertyValue),
    );

    if (matched.length === 0) {
      return json({ ok: true, matched: 0 });
    }

    const sessions: string[] = [];
    for (const e of matched) {
      const result = await runChampionKitAgent(env, {
        dealId: String(e.objectId),
        newStage: e.propertyValue!,
        driveFolderId: env.DRIVE_FOLDER_ID,
      });
      sessions.push(result.sessionId);
    }

    ctx.waitUntil(Promise.resolve());
    return json({ ok: true, matched: matched.length, sessions });
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
