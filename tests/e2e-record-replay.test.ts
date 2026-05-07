import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { agentBasalt, clearEngineRegistry } from "../src/core/engine.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMRequest, LLMResponse } from "../src/core/types.js";

function makeRequest(content: string, model = "gpt-4o"): LLMRequest {
  return {
    messages: [{ role: "user", content }],
    model,
  };
}

function makeResponse(content: string, model = "gpt-4o"): LLMResponse {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model,
    finishReason: "stop",
    raw: null,
  };
}

describe("E2E: record → save → replay", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "agentbasalt-e2e-"));
    clearEngineRegistry();
  });

  afterEach(async () => {
    clearEngineRegistry();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("records responses, saves to disk, replays them", async () => {
    // ── Record phase ──
    const recordEngine = agentBasalt({
      mode: "record",
      cassetteDir: tmpDir,
      cassetteName: "e2e-test",
    });

    const recordHandler = recordEngine.createHandler();

    // Simulate two API calls
    const res1 = await recordHandler.handle(
      makeRequest("What is the weather?"),
      async () => makeResponse("Sunny, 25°C"),
    );
    expect(res1.content).toBe("Sunny, 25°C");

    const res2 = await recordHandler.handle(
      makeRequest("What time is it?"),
      async () => makeResponse("It is 3pm"),
    );
    expect(res2.content).toBe("It is 3pm");

    // Save cassettes to disk
    const savedPath = await recordEngine.saveCassettes();
    expect(savedPath).toBeTruthy();
    expect(savedPath!.startsWith(tmpDir)).toBe(true);

    // Verify the file exists
    const { readFile } = await import("node:fs/promises");
    const fileContent = await readFile(savedPath!, "utf-8");
    const cassette = JSON.parse(fileContent);
    expect(cassette.name).toBe("e2e-test");
    expect(cassette.agentBasaltVersion).toBe("0.1.5");
    expect(cassette.interactions).toHaveLength(2);
    expect(cassette.interactions[0].response.content).toBe("Sunny, 25°C");
    expect(cassette.interactions[1].response.content).toBe("It is 3pm");

    // ── Replay phase ──
    const replayEngine = agentBasalt({
      mode: "replay",
      cassetteDir: tmpDir,
    });

    const replayHandler = replayEngine.createHandler();

    // Same requests should return recorded responses
    const replay1 = await replayHandler.handle(
      makeRequest("What is the weather?"),
      async () => {
        throw new Error("should not call real API");
      },
    );
    expect(replay1.content).toBe("Sunny, 25°C");

    const replay2 = await replayHandler.handle(
      makeRequest("What time is it?"),
      async () => {
        throw new Error("should not call real API");
      },
    );
    expect(replay2.content).toBe("It is 3pm");
  });

  it("replay throws when no cassette matches", async () => {
    // Record one request
    const recordEngine = agentBasalt({
      mode: "record",
      cassetteDir: tmpDir,
      cassetteName: "minimal",
    });

    const recordHandler = recordEngine.createHandler();
    await recordHandler.handle(makeRequest("hello"), async () =>
      makeResponse("hi"),
    );
    await recordEngine.saveCassettes();

    // Try to replay a different request
    const replayEngine = agentBasalt({
      mode: "replay",
      cassetteDir: tmpDir,
    });

    const replayHandler = replayEngine.createHandler();
    await expect(
      replayHandler.handle(
        makeRequest("completely different request"),
        async () => {
          throw new Error("no");
        },
      ),
    ).rejects.toThrow("No recorded response found");
  });

  it("record mode records tool calls", async () => {
    const recordEngine = agentBasalt({
      mode: "record",
      cassetteDir: tmpDir,
      cassetteName: "tool-calls",
    });

    const recordHandler = recordEngine.createHandler();

    const res = await recordHandler.handle(
      makeRequest("search for weather"),
      async () => ({
        content: "",
        toolCalls: [
          { id: "c1", name: "search", arguments: { query: "weather" } },
        ],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: "gpt-4o",
        finishReason: "tool_calls" as const,
        raw: null,
      }),
    );

    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls![0].name).toBe("search");

    await recordEngine.saveCassettes();

    // Replay and verify tool calls are preserved
    const replayEngine = agentBasalt({
      mode: "replay",
      cassetteDir: tmpDir,
    });

    const replayHandler = replayEngine.createHandler();
    const replayed = await replayHandler.handle(
      makeRequest("search for weather"),
      async () => {
        throw new Error("no");
      },
    );

    expect(replayed.toolCalls).toHaveLength(1);
    expect(replayed.toolCalls![0].name).toBe("search");
    expect(replayed.toolCalls![0].arguments).toEqual({ query: "weather" });
    expect(replayed.finishReason).toBe("tool_calls");
  });

  it("saveAllCassettes saves all record-mode engines", async () => {
    const { saveAllCassettes } = await import("../src/core/engine.js");

    // Create two engines in record mode
    const engine1 = agentBasalt({
      mode: "record",
      cassetteDir: tmpDir,
      cassetteName: "batch-1",
    });
    const engine2 = agentBasalt({
      mode: "record",
      cassetteDir: tmpDir,
      cassetteName: "batch-2",
    });

    const handler1 = engine1.createHandler();
    const handler2 = engine2.createHandler();

    await handler1.handle(makeRequest("q1"), async () => makeResponse("a1"));
    await handler2.handle(makeRequest("q2"), async () => makeResponse("a2"));

    // Save all at once
    const paths = await saveAllCassettes();
    expect(paths).toHaveLength(2);

    // Verify both files exist
    const { readFile } = await import("node:fs/promises");
    for (const p of paths) {
      const content = await readFile(p, "utf-8");
      const cassette = JSON.parse(content);
      expect(cassette.interactions).toHaveLength(1);
    }
  });
});
