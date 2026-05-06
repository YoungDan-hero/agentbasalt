# AgentBasalt

**测试你的 AI Agent 代码 — 而不是测试 AI 本身。**

[English](https://github.com/YoungDan-hero/agentbasalt/blob/main/README.md) | [中文](https://github.com/YoungDan-hero/agentbasalt/blob/main/README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/agentbasalt)](https://www.npmjs.com/package/agentbasalt)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 这个框架测试什么？

你写了一个 AI Agent。它调用 OpenAI/Anthropic，拿到回复，然后做一些事情 — 发邮件、更新数据库、调用 API、格式化输出。

**AgentBasalt 测试的是你的代码，不是 AI。** AI 是外部依赖，你需要 mock 掉它，才能稳定地测试自己的逻辑。

```
┌──────────────────────────────────────────────────┐
│                 你的 Agent 代码                    │
│                                                  │
│   调用 LLM → 拿到回复 → 处理逻辑 → 执行动作        │
│                                                  │
│   AgentBasalt 测试的是这部分: ^^^^^^^^^^^^^^^^    │
│                                                  │
│   - 有没有调用正确的 tool？                       │
│   - 拿到 "spam" 标签后有没有正确处理？             │
│   - AI 返回空值时代码会不会崩？                    │
│   - 有没有给用户发通知？                          │
└──────────────────────────────────────────────────┘
```

## 为什么需要这个？

没有 AgentBasalt：

```ts
// ❌ 这个测试不稳定 — AI 可能返回 "spam" 也可能返回 "not spam"
test("拦截垃圾邮件", async () => {
  const result = await processEmail("恭喜你中奖了！");
  expect(result.blocked).toBe(true); // 可能随机失败
});
```

有了 AgentBasalt：

```ts
// ✅ 这个测试是确定性的 — AI 永远返回 "spam"
test("拦截垃圾邮件", async () => {
  engine.addMock({
    match: { contains: "中奖" },
    response: { content: "spam" },
  });
  const result = await processEmail("恭喜你中奖了！");
  expect(result.blocked).toBe(true); // 永远通过
});
```

| 没有 AgentBasalt              | 有 AgentBasalt                  |
| ----------------------------- | ------------------------------- |
| 测试不稳定（AI 每次返回不同） | 测试确定性（100% 可复现）       |
| 每次测试都花 API 费用         | Mock 模式免费，录制一次永远回放 |
| 100 个测试跑 5 分钟           | 100 个测试跑 2 秒               |
| 无法知道代码是否改坏了        | 回归测试一目了然                |

## 快速开始

### 安装

```bash
npm install -D agentbasalt
```

### 写测试

```ts
// tests/spam-filter.spec.ts
import { test, expect, agentBasalt } from "agentbasalt";

// 你的业务代码
async function processEmail(email: string, llmClient: any) {
  const response = await llmClient.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: `判断是否是垃圾邮件，只回复 "spam" 或 "not spam"：${email}`,
      },
    ],
  });
  const label = response.choices[0].message.content.trim();

  if (label === "spam") {
    return { blocked: true, reason: "spam" };
  }
  return { blocked: false };
}

// 测试
test("拦截垃圾邮件", async () => {
  const engine = agentBasalt({
    mode: "mock",
    mockResponses: [
      {
        match: { contains: "中奖" },
        response: { content: "spam" },
      },
    ],
  });

  const mockClient = createMockOpenAIClient(engine);
  const result = await processEmail(
    "恭喜你中奖了！免费领取 iPhone！",
    mockClient,
  );

  expect(result).toHaveProperty("blocked", true);
});

test("放行正常邮件", async () => {
  const engine = agentBasalt({
    mode: "mock",
    mockResponses: [
      {
        match: { contains: "开会" },
        response: { content: "not spam" },
      },
    ],
  });

  const mockClient = createMockOpenAIClient(engine);
  const result = await processEmail("明天下午3点开会", mockClient);

  expect(result).toHaveProperty("blocked", false);
});

test("AI 返回空值时不崩溃", async () => {
  const engine = agentBasalt({
    mode: "mock",
    mockResponses: [
      {
        match: { contains: "edge" },
        response: { content: "" }, // AI 返回空字符串
      },
    ],
  });

  const mockClient = createMockOpenAIClient(engine);
  // 你的代码应该能处理这种情况，而不是抛异常
  const result = await processEmail("edge case", mockClient);
  expect(result).toHaveProperty("blocked", false);
});
```

### 运行

```bash
npx agentbasalt test
```

## 功能

### 1. Mock 模式 — 控制 AI 返回什么

```ts
const engine = agentBasalt({
  mode: "mock",
  mockResponses: [
    { match: { contains: "天气" }, response: { content: "晴天，25°C" } },
    { match: { pattern: "明天.*会议" }, response: { content: "已确认" } },
    { match: { exact: "ping" }, response: { content: "pong" } },
  ],
});
```

### 2. 录制与回放 — 录制一次，永远回放

```bash
# 第一步：录制真实 API 响应（花钱，只跑一次）
npx agentbasalt test --record

# 第二步：从保存的文件回放（免费，瞬间完成）
npx agentbasalt test

# 第三步：把录制文件提交到 git
git add __cassettes__/
```

### 3. Tool Call 断言 — 验证你的 agent 调用了正确的工具

```ts
expect(result).toHaveCalledTool("send_email", { to: "user@example.com" });
expect(result).toHaveNotCalledTool("delete_database");
expect(result).toHaveToolCallCount(2);
```

### 4. 响应断言

```ts
expect(result).toHaveRespondedContaining("北京");
expect(result).toHaveRespondedMatching(/温度.*\d+/);
expect(result).toHaveRespondedWith("精确匹配");
expect(result).toHaveEmptyResponse();
```

### 5. 性能断言

```ts
expect(result).toHaveCompletedWithin(3000); // 3 秒内完成
expect(result).toHaveUsedTokensLessThan(500); // 不超过 500 tokens
expect(result).toHaveUsedModel("gpt-4o");
expect(result).toHaveFinishReason("stop");
```

### 6. Tool Mock — Mock 外部服务

```ts
import { mockTool } from "agentbasalt";

const weatherAPI = mockTool("get_weather", {
  handler: (params) => ({ temp: 25, city: params.city, condition: "sunny" }),
  requiredParams: ["city"],
  maxCalls: 3,
  delay: 100, // 模拟延迟
});

// 测试后查看调用记录
console.log(weatherAPI.calls);
// [{ params: { city: '北京' }, result: {...}, duration: 102 }]
```

### 7. 数据集测试 — 批量测试

```ts
import { loadDataset, testScenario } from "agentbasalt";

const dataset = await loadDataset("./test-data/emails.json");

testScenario("邮件分类", dataset, async (input, expected) => {
  const result = await myAgent.run(input.text);
  expect(result).toHaveRespondedContaining(expected.label);
});
```

```json
// test-data/emails.json
{
  "cases": [
    {
      "input": { "text": "恭喜你中奖了！" },
      "expected": { "label": "垃圾邮件" }
    },
    {
      "input": { "text": "明天下午3点开会" },
      "expected": { "label": "正常邮件" }
    }
  ]
}
```

### 9. 多步 Agent 追踪 — 跟踪复杂 agent 流程

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

### 8. 成本追踪 — 知道花了多少钱

```ts
import { costTracker, expect } from "agentbasalt";

test("agent 成本可控", async () => {
  const tracker = costTracker();
  await tracker.track(myAgent.run("总结这篇文章"));

  expect(tracker).toHaveCostLessThan(0.05); // 最多 $0.05
  expect(tracker).toHaveTokenCountLessThan(2000); // 最多 2000 tokens

  console.log(tracker.breakdown());
  // [{ model: 'gpt-4o', calls: 3, cost: 0.011 }]
});
```

## 适配器

| 提供商        | 引入方式                         | 状态 |
| ------------- | -------------------------------- | ---- |
| OpenAI        | `agentbasalt/adapters/openai`    | 稳定 |
| Anthropic     | `agentbasalt/adapters/anthropic` | 稳定 |
| Vercel AI SDK | `agentbasalt/adapters/vercel-ai` | 稳定 |
| LangChain     | `agentbasalt/adapters/langchain` | 稳定 |

```ts
import { wrapOpenAI } from "agentbasalt/adapters/openai";
const handler = engine.createHandler();
const mockClient = wrapOpenAI(new OpenAI(), handler);

import { wrapAnthropic } from "agentbasalt/adapters/anthropic";
const handler = engine.createHandler();
const mockClient = wrapAnthropic(new Anthropic(), handler);
```

## CI 集成

```yaml
# .github/workflows/test.yml
name: Agent 测试
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

## 配置

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
# 或者用环境变量
AGENTBASALT_MODE=record npx agentbasalt test
```

## 工作原理

```
你的测试代码
    │
    ▼
AgentBasalt 引擎拦截 LLM SDK 调用
    │
    ├─ Mock 模式 ──────► 返回你预设的响应
    ├─ 录制模式 ────────► 调用真实 API，保存响应到文件
    └─ 回放模式 ────────► 从文件加载已保存的响应
```

AgentBasalt 在 SDK 层面包装 LLM 客户端（OpenAI、Anthropic 等）。当你的代码调用 LLM 时，AgentBasalt 会拦截调用并返回 mock/录制的响应，而不是真正调用 API。

## 贡献

```bash
git clone https://github.com/YoungDan-hero/agentbasalt.git
cd agentbasalt
npm install
npm test
```

## 许可证

MIT
