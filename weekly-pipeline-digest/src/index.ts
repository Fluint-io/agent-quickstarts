import { runDigestAgent } from "./managed-agent.js";

export interface Env {
  ANTHROPIC_API_KEY: string;
  MANAGED_AGENT_ID: string;
  MANAGED_ENVIRONMENT_ID: string;
  DIGEST_SLACK_CHANNEL: string;
  WINDOW_DAYS?: string;
  MANUAL_TRIGGER_SECRET?: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDigestAgent(env, runContext(env)));
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    const provided = request.headers.get("x-trigger-secret");
    if (!env.MANUAL_TRIGGER_SECRET || provided !== env.MANUAL_TRIGGER_SECRET) {
      return json({ error: "forbidden" }, 403);
    }

    const result = await runDigestAgent(env, runContext(env));
    return json({ ok: true, sessionId: result.sessionId });
  },
};

function runContext(env: Env) {
  if (!env.DIGEST_SLACK_CHANNEL) {
    throw new Error("DIGEST_SLACK_CHANNEL must be set in wrangler.toml [vars].");
  }
  const windowDays = Number(env.WINDOW_DAYS ?? "7");
  const today = new Date();
  const windowStart = new Date(today.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return {
    slackChannel: env.DIGEST_SLACK_CHANNEL,
    windowDays,
    today: today.toISOString().slice(0, 10),
    windowStart: windowStart.toISOString().slice(0, 10),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
