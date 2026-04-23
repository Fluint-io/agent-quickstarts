import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchGongTranscript, transcriptToPlainText } from "../src/gong.js";

describe("transcriptToPlainText", () => {
  it("joins each entry as '<speaker name>: <text>'", () => {
    const result = transcriptToPlainText({
      callId: "c1",
      speakers: [
        { id: "s1", name: "Jon" },
        { id: "s2", name: "Jane" },
      ],
      entries: [
        { speakerId: "s1", start: 0, text: "Hi Jane." },
        { speakerId: "s2", start: 1000, text: "Hi Jon." },
      ],
    });
    expect(result).toBe("Jon: Hi Jane.\nJane: Hi Jon.");
  });

  it("uses 'Unknown' when an entry's speakerId isn't in the speakers list", () => {
    const result = transcriptToPlainText({
      callId: "c1",
      speakers: [{ id: "s1", name: "Jon" }],
      entries: [{ speakerId: "ghost", start: 0, text: "..." }],
    });
    expect(result).toBe("Unknown: ...");
  });
});

describe("fetchGongTranscript", () => {
  const fetchMock = vi.fn();
  const env = {
    GONG_ACCESS_KEY: "key",
    GONG_ACCESS_KEY_SECRET: "secret",
  } as any;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /v2/calls/transcript with basic auth and returns a flattened transcript", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        callTranscripts: [
          {
            callId: "c1",
            parties: [{ id: "s1", name: "Jon" }],
            transcript: [
              { speakerId: "s1", sentences: [{ start: 0, text: "Hi." }] },
            ],
          },
        ],
      }),
    });

    const result = await fetchGongTranscript(env, "c1");
    expect(result.entries).toEqual([{ speakerId: "s1", start: 0, text: "Hi." }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.gong.io/v2/calls/transcript");
    expect((init.headers as any).Authorization).toMatch(/^Basic /);
    expect(JSON.parse(init.body as string)).toEqual({ filter: { callIds: ["c1"] } });
  });

  it("throws when Gong returns a non-OK response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "server error",
    });
    await expect(fetchGongTranscript(env, "c1")).rejects.toThrow(/Gong transcript fetch failed/);
  });

  it("throws when no transcripts are returned for the call", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ callTranscripts: [] }),
    });
    await expect(fetchGongTranscript(env, "c1")).rejects.toThrow(/No transcript returned/);
  });
});
