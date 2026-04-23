import { runRiskScanAgent } from "./managed-agent.js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  MANAGED_AGENT_ID: string;
  MANAGED_ENVIRONMENT_ID: string;
  GOING_DARK_DAYS?: string;
  STALLED_STAGE_DAYS?: string;
  ACTIVE_STAGE_IDS?: string;
  MANUAL_TRIGGER_SECRET?: string;
}

export default {
  // Cron trigger — runs on the schedule in wrangler.toml.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runRiskScanAgent(env, runContext(env)));
  },

  // Optional manual trigger for testing. Protected by a shared secret.
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    const provided = request.headers.get("x-trigger-secret");
    if (!env.MANUAL_TRIGGER_SECRET || provided !== env.MANUAL_TRIGGER_SECRET) {
      return json({ error: "forbidden" }, 403);
    }

    const result = await runRiskScanAgent(env, runContext(env));
    return json({ ok: true, sessionId: result.sessionId });
  },
};

function runContext(env: Env) {
  return {
    goingDarkDays: Number(env.GOING_DARK_DAYS ?? "7"),
    stalledStageDays: Number(env.STALLED_STAGE_DAYS ?? "14"),
    activeStageIds: (env.ACTIVE_STAGE_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    today: new Date().toISOString().slice(0, 10),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
