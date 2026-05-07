# AgentBasalt

**Test your AI agent code — not the AI itself.**

[English](https://github.com/YoungDan-hero/agentbasalt/blob/main/README.md) | [中文](https://github.com/YoungDan-hero/agentbasalt/blob/main/README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/agentbasalt)](https://www.npmjs.com/package/agentbasalt)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What does this test?

You wrote an AI agent. It calls OpenAI/Anthropic, gets a response, then does something with it — sends an email, updates a database, calls an API, formats output.

**AgentBasalt tests YOUR code, not the AI.** The AI is an external dependency. You mock it, so you can test your logic deterministically.

```
┌──────────────────────────────────────────────────┐
│                 Your Agent Code                   │
│                                                  │
│   call LLM → get response → process → take action │
│                                                  │
│   AgentBasalt tests this part: ^^^^^^^^^^^^^^^^  │
│                                                  │
│   - Did it call the right tool?                  │
│   - Did it handle the "spam" label correctly?    │
│   - Did it crash on empty response?              │
│   - Did it notify the user?                      │
└──────────────────────────────────────────────────┘
```

## Why do I need this?

Without AgentBasalt:

```ts
// ❌ This test is flaky — AI might return "spam" or "not spam"
test("blocks spam", async () => {
  const result = await processEmail("You won a prize!");
  expect(result.blocked).toBe(true); // might fail randomly
});
```

With AgentBasalt:

```ts
// ✅ This test is deterministic — AI always returns "spam"
test("blocks spam", async () => {
  engine.addMock({
    match: { contains: "prize" },
    response: { content: "spam" },
  });
  const result = await processEmail("You won a prize!");
  expect(result.blocked).toBe(true); // always passes
});
```

| Without AgentBasalt                           | With AgentBasalt                                |
| --------------------------------------------- | ----------------------------------------------- |
| Tests are flaky (AI returns different things) | Tests are deterministic                         |
| Every test costs real API money               | Mock mode is free, record once & replay forever |
| 100 tests take 5 minutes                      | 100 tests take 2 seconds                        |
| Can't tell if your code broke                 | Regression testing works                        |

## Quick Start

### Install

```bash
npm install -D agentbasalt
```

### Write a test

```ts
// tests/spam-filter.spec.ts
import { test, expect, agentBasalt } from "agentbasalt";

// Your actual agent code
async function processEmail(email: string, llmClient: any) {
  const response = await llmClient.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: `Is this spam? Reply only "spam" or "not spam": ${email}`,
      },
    ],
  });
  const label = response.choices[0].message.content.trim();

  if (label === "spam") {
    return { blocked: true, reason: "spam" };
  }
  return { blocked: false };
}

// Tests
test("blocks spam emails", async () => {
  const engine = agentBasalt({
    mode: "mock",
    mockResponses: [
      {
        match: { contains: "prize" },
        response: { content: "spam" },
      },
    ],
  });

  const mockClient = createMockOpenAIClient(engine);
  const result = await processEmail("You won a free prize!", mockClient);

  expect(result).toHaveProperty("blocked", true);
});

test("allows normal emails", async () => {
  const engine = agentBasalt({
    mode: "mock",
    mockResponses: [
      {
        match: { contains: "meeting" },
        response: { content: "not spam" },
      },
    ],
  });

  const mockClient = createMockOpenAIClient(engine);
  const result = await processEmail("Meeting at 3pm tomorrow", mockClient);

  expect(result).toHaveProperty("blocked", false);
});

test("handles empty AI response gracefully", async () => {
  const engine = agentBasalt({
    mode: "mock",
    mockResponses: [
      {
        match: { contains: "edge" },
        response: { content: "" }, // AI returns empty
      },
    ],
  });

  const mockClient = createMockOpenAIClient(engine);
  // Your code should not crash
  const result = await processEmail("edge case", mockClient);
  expect(result).toHaveProperty("blocked", false);
});
```

### Run

```bash
npx agentbasalt test
```

## Features

### 1. Mock Mode — Control what the AI returns

```ts
const engine = agentBasalt({
  mode: "mock",
  mockResponses: [
    { match: { contains: "weather" }, response: { content: "sunny, 25°C" } },
    {
      match: { pattern: "meeting.*tomorrow" },
      response: { content: "confirmed" },
    },
    { match: { exact: "ping" }, response: { content: "pong" } },
  ],
});
```

### 2. Record & Replay — Record once, replay forever

```bash
# Step 1: Record real API responses (costs money, do once)
npx agentbasalt test --record

# Step 2: Replay from saved files (free, instant)
npx agentbasalt test

# Step 3: Commit the cassettes to git
git add __cassettes__/
```

### 3. Tool Call Assertions — Verify your agent calls the right tools

```ts
expect(result).toHaveCalledTool("send_email", { to: "user@example.com" });
expect(result).toHaveNotCalledTool("delete_database");
expect(result).toHaveToolCallCount(2);
```

### 4. Response Assertions

```ts
expect(result).toHaveRespondedContaining("Tokyo");
expect(result).toHaveRespondedMatching(/temperature.*\d+/);
expect(result).toHaveRespondedWith("exact string");
expect(result).toHaveEmptyResponse();
```

### 5. Performance Assertions

```ts
expect(result).toHaveCompletedWithin(3000); // under 3 seconds
expect(result).toHaveUsedTokensLessThan(500); // under 500 tokens
expect(result).toHaveUsedModel("gpt-4o");
expect(result).toHaveFinishReason("stop");
```

### 6. Tool Mocking — Mock external services

```ts
import { mockTool } from "agentbasalt";

const weatherAPI = mockTool("get_weather", {
  handler: (params) => ({ temp: 25, city: params.city, condition: "sunny" }),
  requiredParams: ["city"],
  maxCalls: 3,
  delay: 100, // simulate latency
});

// After test, inspect what was called
console.log(weatherAPI.calls);
// [{ params: { city: 'Tokyo' }, result: {...}, duration: 102 }]
```

### 7. Dataset Testing — Test with many inputs

```ts
import { loadDataset, testScenario } from "agentbasalt";

const dataset = await loadDataset("./test-data/emails.json");

testScenario("email classification", dataset, async (input, expected) => {
  const result = await myAgent.run(input.text);
  expect(result).toHaveRespondedContaining(expected.label);
});
```

```json
// test-data/emails.json
{
  "cases": [
    {
      "input": { "text": "Win a free iPhone!" },
      "expected": { "label": "spam" }
    },
    {
      "input": { "text": "Meeting at 3pm" },
      "expected": { "label": "not spam" }
    }
  ]
}
```

### 8. Cost Tracking — Know how much you're spending

```ts
import { costTracker, expect } from "agentbasalt";

test("agent is cost-efficient", async () => {
  const tracker = costTracker();
  await tracker.track(myAgent.run("summarize this"));

  expect(tracker).toHaveCostLessThan(0.05); // max $0.05
  expect(tracker).toHaveTokenCountLessThan(2000); // max 2000 tokens

  console.log(tracker.breakdown());
  // [{ model: 'gpt-4o', calls: 3, cost: 0.011 }]
});
```

### 9. Multi-step Agent Trace — Track complex agent flows

```ts
import { trace, expect } from "agentbasalt";

const t = trace();

await t.run(async () => {
  const plan = await t.step("plan", "llm", async () => {
    return llm.call("How to answer?");
  });
  const data = await t.step("search", "tool", async () => {
    return searchAPI(plan.query);
  });
  await t.step("answer", "llm", async () => {
    return llm.call(`Summarize: ${data}`);
  });
});

expect(t).toHaveStepCount(3);
expect(t).toHaveStepSequence(["plan", "search", "answer"]);
expect(t).toHaveLLMCallCount(2);
expect(t).toHaveToolCallCount(1);
expect(t).toHaveNoErrors();
```

## Adapters

| Provider      | Import                           | Status |
| ------------- | -------------------------------- | ------ |
| OpenAI        | `agentbasalt/adapters/openai`    | Stable |
| Anthropic     | `agentbasalt/adapters/anthropic` | Stable |
| Vercel AI SDK | `agentbasalt/adapters/vercel-ai` | Stable |
| LangChain     | `agentbasalt/adapters/langchain` | Stable |

```ts
import { wrapOpenAI } from "agentbasalt/adapters/openai";
const handler = engine.createHandler();
const mockClient = wrapOpenAI(new OpenAI(), handler);

import { wrapAnthropic } from "agentbasalt/adapters/anthropic";
const handler = engine.createHandler();
const mockClient = wrapAnthropic(new Anthropic(), handler);
```

## CI Integration

```yaml
# .github/workflows/test.yml
name: Agent Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npx agentbasalt test
```

## Configuration

```ts
// agentbasalt.config.ts
import { defineConfig } from "agentbasalt";

export default defineConfig({
  mode: "replay",
  cassetteDir: "__cassettes__",
  matchStrategy: "contains", // 'exact' | 'contains' | 'pattern' | 'fuzzy'
  sanitize: {
    maskApiKeys: true,
    maskEmails: true,
  },
});
```

```bash
# Or use environment variables
AGENTBASALT_MODE=record npx agentbasalt test
```

## How It Works

```
Your Test
    │
    ▼
AgentBasalt Engine intercepts LLM SDK calls
    │
    ├─ Mock Mode ──────► Returns your predefined response
    ├─ Record Mode ────► Calls real API, saves response to file
    └─ Replay Mode ────► Loads saved response from file
```

AgentBasalt wraps the LLM SDK client (OpenAI, Anthropic, etc.) at the SDK level. When your code calls the LLM, AgentBasalt intercepts the call and returns a mock/recorded response instead.

## Contributing

```bash
git clone https://github.com/YoungDan-hero/agentbasalt.git
cd agentbasalt
npm install
npm test
```

## License

MIT
