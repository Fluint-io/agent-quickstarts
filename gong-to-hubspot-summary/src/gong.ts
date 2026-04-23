import type { Env } from "./index.js";

export type GongTranscript = {
  callId: string;
  speakers: Array<{ id: string; name: string; email?: string }>;
  entries: Array<{ speakerId: string; start: number; text: string }>;
};

export async function fetchGongTranscript(env: Env, callId: string): Promise<GongTranscript> {
  const baseUrl = env.GONG_BASE_URL ?? "https://api.gong.io";
  const auth = btoa(`${env.GONG_ACCESS_KEY}:${env.GONG_ACCESS_KEY_SECRET}`);

  const res = await fetch(`${baseUrl}/v2/calls/transcript`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filter: { callIds: [callId] } }),
  });

  if (!res.ok) {
    throw new Error(`Gong transcript fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as GongTranscriptResponse;
  const call = data.callTranscripts?.[0];
  if (!call) throw new Error(`No transcript returned for call ${callId}`);

  return {
    callId,
    speakers: call.parties ?? [],
    entries: (call.transcript ?? []).flatMap((turn) =>
      turn.sentences.map((s) => ({
        speakerId: turn.speakerId,
        start: s.start,
        text: s.text,
      })),
    ),
  };
}

export function transcriptToPlainText(t: GongTranscript): string {
  const speakerById = new Map(t.speakers.map((s) => [s.id, s.name]));
  return t.entries
    .map((e) => `${speakerById.get(e.speakerId) ?? "Unknown"}: ${e.text}`)
    .join("\n");
}

type GongTranscriptResponse = {
  callTranscripts?: Array<{
    callId: string;
    parties?: Array<{ id: string; name: string; email?: string }>;
    transcript?: Array<{
      speakerId: string;
      sentences: Array<{ start: number; text: string }>;
    }>;
  }>;
};
