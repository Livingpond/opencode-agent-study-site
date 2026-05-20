---
title: "测试与工程化"
description: "理解 monorepo 构建、类型检查、测试任务和开发规范如何支撑大型 agent 项目。"
sidebar:
  label: "13. 测试与工程化"
  order: 13
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>入门</div>
  <div><strong>预计阅读</strong>25 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/13-testing-engineering.md"><code>markdown/13-testing-engineering.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`13-testing-engineering`
- 章节摘要：理解 monorepo 构建、类型检查、测试任务和开发规范如何支撑大型 agent 项目。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>package.json</code></li>
<li><code>turbo.json</code></li>
<li><code>tsconfig.json</code></li>
<li><code>AGENTS.md</code></li>
<li><code>packages/opencode/package.json</code></li>
<li><code>packages/sdk/js/package.json</code></li>

</ul>


## 0. 本章学习目标

学完这一章，你应该能回答 4 个问题：

1. OpenCode 这个 monorepo 是如何组织包、脚本和依赖版本的。
2. 为什么根目录故意不让你直接跑 `bun test`。
3. 核心 runtime、Web app、UI package、SDK package 各自怎样做 typecheck、test、build。
4. 如果你自己写 mini coding agent，最小但靠谱的工程化脚手架应该长什么样。

本章不是“怎么配置 Bun/Turbo”的普通教程，而是基于 OpenCode 当前源码的工程化阅读笔记。

## 1. 一句话讲明白

OpenCode 的工程化不是一个单体 `npm test`，而是一个 Bun workspace + Turbo task graph：根目录负责统一包、依赖版本和跨包任务，具体 package 负责自己的 typecheck、test、build。

来源：`package.json:7-21`、`package.json:23-30`、`turbo.json:5-43`。

## 2. 它在 OpenCode agent 中的位置

工程化不是 agent loop 的一部分，但它决定了 agent 项目能不能长期演进。

对 OpenCode 来说：

- CLI/runtime 在 `packages/opencode`，它有自己的 bin、dev、test、build。来源：`packages/opencode/package.json:8-23`。
- Web app 在 `packages/app`，它有 unit test、E2E test、Vite build。来源：`packages/app/package.json:11-24`。
- UI 组件在 `packages/ui`，它暴露组件、theme、hooks、样式和单测脚本。来源：`packages/ui/package.json:6-33`。
- JS SDK 在 `packages/sdk/js`，它有 generated client 和 build 脚本。来源：`packages/sdk/js/package.json:7-19`、`packages/sdk/js/script/build.ts:14-47`。
- 根目录通过 workspace catalog 固定共享依赖版本。来源：`package.json:23-87`。

Java 开发者可以把它理解成 Gradle multi-project：根项目管理版本和 task graph，子项目分别声明自己的 task。

## 3. 生活类比

一个 coding agent 项目像一座大型实验室：

- 根目录是实验室行政办公室：规定有哪些实验组、采购哪些统一版本的设备。
- `packages/opencode` 是核心机器人实验组：做 agent runtime。
- `packages/app` 是操作台实验组：做可视化界面。
- `packages/sdk/js` 是外部接口组：给别人发工具箱。
- `turbo.json` 是实验排班表：哪个任务需要先等别的组完成，哪个任务产出可以缓存。
- `AGENTS.md` 是实验室守则：告诉未来的 agent/开发者怎样写代码、怎样测试。

## 4. Java 开发者类比

| OpenCode 概念 | Java 类比 | 源码依据 |
|---|---|---|
| Bun workspace | Gradle multi-project / Maven reactor | `package.json:23-30` |
| catalog dependency | Gradle version catalog / Maven dependencyManagement | `package.json:30-87` |
| `turbo.json` tasks | Gradle task graph | `turbo.json:5-43` |
| package-level `typecheck/test/build` | 子模块自己的 `test`、`check`、`assemble` | `packages/opencode/package.json:8-19` |
| generated SDK build | OpenAPI Generator / Feign client 生成 | `packages/sdk/js/script/build.ts:14-47` |
| `AGENTS.md` | 项目级开发规范 + code review checklist | `AGENTS.md:7-127` |

重点差异：Java 生态常把编译、测试、打包都塞进 Maven/Gradle 生命周期；OpenCode 这里更像“包内脚本 + Turbo 编排 + Bun runtime”。

## 5. 最小源码路径

建议按这个顺序读：

1. `package.json:7-21`：根目录脚本，尤其 `typecheck` 和禁止 root test。
2. `package.json:23-87`：workspace 与 catalog。
3. `turbo.json:5-43`：跨 package task graph。
4. `AGENTS.md:119-127`：项目明确的测试和 typecheck 规则。
5. `packages/opencode/package.json:8-23`：核心 runtime package 的脚本和 CLI bin。
6. `packages/app/package.json:11-24`：Web app 的 unit/E2E test。
7. `packages/sdk/js/script/build.ts:14-47`：SDK 生成流程。
8. `packages/app/src/context/global-sync/event-reducer.test.ts:1-6` 和 `packages/llm/test/tool-stream.test.ts:1-23`：真实测试风格。

## 6. 工程化整体链路

OpenCode 的工程链路大致是：

```text
根 package.json
  -> workspaces 定义 package 集合
  -> catalog 固定共享依赖版本
  -> turbo.json 编排 typecheck/build/test
  -> package 自己定义脚本
  -> package 内测试读取真实实现
  -> SDK/build 脚本生成或打包产物
```

重要的是：根目录不是执行全部测试的入口。源码里有一个非常明确的保护。

路径：`package.json:8-21`

```json
"scripts": {
  "dev": "bun run --cwd packages/opencode --conditions=browser src/index.ts",
  "dev:desktop": "bun --cwd packages/desktop dev",
  "dev:web": "bun --cwd packages/app dev",
  "lint": "oxlint",
  "typecheck": "bun turbo typecheck",
  "test": "echo 'do not run tests from root' && exit 1"
}
```

这里的设计选择很清楚：根目录可以跑 `typecheck`，但 `test` 必须进入具体 package。这个判断还被 `AGENTS.md` 再次强调。

路径：`AGENTS.md:119-127`

```md
## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.
```

## 7. 核心源码逐段讲解

### 7.1 根目录负责 workspace 和统一版本

路径：`package.json:23-30`

```json
"workspaces": {
  "packages": [
    "packages/*",
    "packages/console/*",
    "packages/sdk/js",
    "packages/slack"
  ],
  "catalog": {
```

这段说明 OpenCode 是一个 workspace monorepo。`packages/*` 是主要 package 集合，`packages/sdk/js` 被显式放入 workspace，说明 SDK 虽然在更深目录，但仍是 monorepo 的一等模块。

路径：`package.json:31-87`

```json
"catalog": {
  "@types/bun": "1.3.13",
  "@types/node": "24.12.2",
  "effect": "4.0.0-beta.65",
  "ai": "6.0.168",
  "hono": "4.10.7",
  "typescript": "5.8.2",
  "zod": "4.1.8",
  "vite": "7.1.4",
  "solid-js": "1.9.10"
}
```

这和 Java 的 `dependencyManagement` 很像：子 package 可以写 `"effect": "catalog:"`，最终版本由根目录决定。

### 7.2 Turbo 只编排关键任务

路径：`turbo.json:5-23`

```json
"tasks": {
  "typecheck": {},
  "build": {
    "dependsOn": [],
    "outputs": ["dist/**"]
  },
  "opencode#test": {
    "dependsOn": ["^build"],
    "outputs": [],
    "passThroughEnv": ["*"]
  },
  "test:ci": {
    "outputs": [".artifacts/unit/junit.xml"],
    "passThroughEnv": ["*"]
  }
}
```

这里能看到两个工程化思想：

- `build` 的产物是 `dist/**`，适合缓存。
- `opencode#test` 依赖上游 build，说明核心 runtime 测试可能需要其他 workspace 包先构建。

### 7.3 核心 runtime package 的脚本

路径：`packages/opencode/package.json:8-19`

```json
"scripts": {
  "typecheck": "tsgo --noEmit",
  "test": "bun test --timeout 30000",
  "test:ci": "mkdir -p .artifacts/unit && bun test --timeout 30000 --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml",
  "test:httpapi": "bun run script/httpapi-exercise.ts --mode coverage --fail-on-missing --fail-on-skip && bun run script/httpapi-exercise.ts --mode auth --fail-on-missing --fail-on-skip && bun run script/httpapi-exercise.ts --mode effect --fail-on-missing --fail-on-skip",
  "build": "bun run script/build.ts",
  "dev": "bun run --conditions=browser ./src/index.ts"
}
```

几个点很值得学：

- typecheck 用 `tsgo --noEmit`，不是直接 `tsc`。
- runtime 测试用 `bun test`，并设置 30 秒 timeout。
- HTTP API 有专门 exercise 脚本，不只是单元测试。
- build 交给脚本 `script/build.ts`，说明打包逻辑复杂，不适合塞在 package.json 一行命令里。

### 7.4 CLI bin 和条件导入

路径：`packages/opencode/package.json:21-38`

```json
"bin": {
  "opencode": "./bin/opencode"
},
"exports": {
  "./*": "./src/*.ts"
},
"imports": {
  "#db": {
    "bun": "./src/storage/db.bun.ts",
    "node": "./src/storage/db.node.ts",
    "default": "./src/storage/db.bun.ts"
  },
  "#pty": {
    "bun": "./src/pty/pty.bun.ts",
    "node": "./src/pty/pty.node.ts",
    "default": "./src/pty/pty.bun.ts"
  }
}
```

这段对 agent 项目很关键：同一个源码包可能要跑在 Bun、Node、打包后二进制等环境里，所以 `imports` 为数据库和 PTY 做环境分支。

Java 类比：这有点像 Spring profile 或 conditional bean，只是 TS/Node 的条件发生在 package resolution 阶段。

### 7.5 根目录 bunfig 再次防止误跑测试

路径：`bunfig.toml:1-8`

```toml
[install]
exact = true
minimumReleaseAge = 259200

[test]
root = "./do-not-run-tests-from-root"
```

这里的 `test.root` 和根 `package.json` 的 `"test": "echo 'do not run tests from root' && exit 1"` 是双保险。OpenCode 明确希望测试从 package 目录运行。

### 7.6 UI/Web package 的测试分层

路径：`packages/app/package.json:11-24`

```json
"scripts": {
  "typecheck": "tsgo -b",
  "start": "vite",
  "dev": "vite",
  "build": "vite build",
  "test": "bun run test:unit",
  "test:ci": "mkdir -p .artifacts/unit && bun test --preload ./happydom.ts ./src --reporter=junit --reporter-outfile=.artifacts/unit/junit.xml",
  "test:unit": "bun test --preload ./happydom.ts ./src",
  "test:e2e": "playwright test"
}
```

Web app 的单测用 `happydom`，E2E 用 Playwright。这和 Java Web 项目里 “JUnit 单元测试 + Testcontainers/Playwright/Selenium 集成测试” 的分层很像。

### 7.7 真实测试风格：少 mock，测 reducer / 工具流

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:1-6`

```ts
import { describe, expect, test } from "bun:test"
import type { Message, Part, PermissionRequest, Project, QuestionRequest, Session } from "@opencode-ai/sdk/v2/client"
import { createStore } from "solid-js/store"
import type { State } from "./types"
import { applyDirectoryEvent, applyGlobalEvent, cleanupDroppedSessionCaches } from "./event-reducer"
```

这不是测试 UI 截图，而是测试事件 reducer。它符合 `AGENTS.md:121-122` 的要求：尽量测真实实现，不把逻辑复制到测试里。

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:88-133`

```ts
describe("applyGlobalEvent", () => {
  test("upserts project.updated in sorted position", () => {
    const project = [{ id: "a" }, { id: "c" }] as Project[]
    let refreshCount = 0
    applyGlobalEvent({
      event: { type: "project.updated", properties: { id: "b" } },
      project,
      refresh: () => {
        refreshCount += 1
      },
      setGlobalProject(next) {
        if (typeof next === "function") next(project)
      },
    })

    expect(project.map((x) => x.id)).toEqual(["a", "b", "c"])
    expect(refreshCount).toBe(0)
  })
})
```

这个测试用一个很小的输入验证状态更新行为。Java 类比是 service-level unit test：构造输入 DTO，调用真实 service 方法，断言状态。

路径：`packages/llm/test/tool-stream.test.ts:1-23`

```ts
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { LLMError } from "../src/schema"
import { ToolStream } from "../src/protocols/utils/tool-stream"
import { it } from "./lib/effect"

describe("ToolStream", () => {
  it.effect("starts from OpenAI-style deltas and finalizes parsed input", () =>
    Effect.gen(function* () {
      const first = ToolStream.appendOrStart(
        ADAPTER,
        ToolStream.empty<number>(),
        0,
        { id: "call_1", name: "lookup", text: '{"query"' },
        "missing tool",
      )
```

这个测试更贴近 agent 核心风险：模型 provider 可能分片输出 tool call JSON，测试要确认分片能够被累积、解析、结束。

### 7.8 SDK 生成是工程化的一等流程

路径：`packages/sdk/js/script/build.ts:14-47`

```ts
await $`bun dev generate > ${dir}/openapi.json`.cwd(opencode)

await createClient({
  input: "./openapi.json",
  output: {
    path: "./src/v2/gen",
    tsConfigPath: path.join(dir, "tsconfig.json"),
    clean: true,
  },
  plugins: [
    { name: "@hey-api/typescript", exportFromIndex: false },
    { name: "@hey-api/sdk", instance: "OpencodeClient", exportFromIndex: false, auth: false, paramsStructure: "flat" },
    { name: "@hey-api/client-fetch", exportFromIndex: false, baseUrl: "http://localhost:4096" },
  ],
})

await $`bun prettier --write src/gen`
await $`bun prettier --write src/v2`
await $`rm -rf dist`
await $`bun tsc`
await $`rm openapi.json`
```

这里说明 SDK 不是手写维护，而是通过 OpenAPI 生成。这和 Java 里用 OpenAPI Generator 生成 Feign/Retrofit client 是同一类工程实践。

注意：脚本里有 `rm -rf dist` 和 `rm openapi.json`，这是 build 脚本内部行为。本学习站点没有执行这些脚本，只是阅读源码。

### 7.9 发布构建比想象中复杂

路径：`packages/opencode/script/build.ts:57-81`

```ts
const createEmbeddedWebUIBundle = async () => {
  console.log(`Building Web UI to embed in the binary`)
  const appDir = path.join(import.meta.dirname, "../../app")
  const dist = path.join(appDir, "dist")
  await $`bun run --cwd ${appDir} build`
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: dist })))
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.endsWith(".map"))
    .sort()
```

OpenCode 的 CLI binary 会嵌入 Web UI bundle。也就是说，工程化支撑的是“一个 agent runtime + 内嵌 UI + 多平台二进制”的交付形态。

路径：`packages/opencode/script/build.ts:83-168`

```ts
const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "win32", arch: "arm64" },
  { os: "win32", arch: "x64" },
]
```

这段告诉你：成熟 coding agent 不是只跑在开发者电脑的一次性脚本，它要考虑跨平台构建和分发。

## 8. 关键 TypeScript 语法复习

### 8.1 `import type`

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:2-4`

```ts
import type { Message, Part, PermissionRequest, Project, QuestionRequest, Session } from "@opencode-ai/sdk/v2/client"
import type { State } from "./types"
```

`import type` 只引入类型，运行时不会产生 import。Java 没有这个概念，因为 Java 的 import 本来就是编译期符号解析；TS 需要区分“类型导入”和“运行时代码导入”。

### 8.2 对象展开 `...input`

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:60-86`

```ts
const baseState = (input: Partial<State> = {}) =>
  ({
    status: "complete",
    agent: [],
    command: [],
    ...input,
  }) as State
```

`...input` 用来覆盖默认值。Java 里常见写法是 Builder 默认值 + `withXxx` 覆盖。

### 8.3 `Partial<State>`

同一段代码里的 `Partial<State>` 表示“State 的所有字段都变成可选”。这对测试很常用：只覆盖本 case 关心的字段。

Java 类比：测试里构造一个 `StateBuilder`，只设置少数字段，其余走默认值。

### 8.4 泛型对象类型

路径：`packages/opencode/script/build.ts:83-88`

```ts
const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
```

这里是数组元素的 inline type。`arch` 是 literal union，只能是 `"arm64"` 或 `"x64"`；`abi?` 是 optional property。

### 8.5 Bun 的 shell template

路径：`packages/sdk/js/script/build.ts:14`

```ts
await $`bun dev generate > ${dir}/openapi.json`.cwd(opencode)
```

`$` 来自 Bun，语法像 shell command builder。Java 类比是 `ProcessBuilder`，但 Bun 把命令写成 tagged template，并能链式设置 cwd。

### 8.6 `as Project[]` / `as Message`

路径：`packages/app/src/context/global-sync/event-reducer.test.ts:88-90`

```ts
const project = [{ id: "a" }, { id: "c" }] as Project[]
```

这是类型断言，告诉 TypeScript “把这个对象当成 Project[]”。Java 类比不完全对应，比较像测试里用简化对象填充 DTO；但 TS 的断言只影响编译期，不会在运行时补字段。

## 9. 涉及的设计模式和架构思想

### 9.1 Monorepo + Package Boundary

每个 package 有自己的脚本和 exports。根目录只负责编排。这个边界对 agent 项目很重要，因为 CLI、UI、SDK、LLM、plugin 往往演进速度不同。

### 9.2 Generated Client

SDK 由 OpenAPI 生成，降低 API drift。Java 后端常见做法是 OpenAPI contract + generated client/server stub。

### 9.3 Test Real Implementation

`AGENTS.md:121-122` 明确要求少 mock、测真实实现。这对 agent 项目尤其关键，因为大量 bug 来自流式事件、状态同步、provider 兼容性，不适合只 mock happy path。

### 9.4 Build Script as Application Code

`packages/opencode/script/build.ts` 很像一个小程序：读取 migration、生成 embedded Web UI、计算 targets、调用 `Bun.build`。复杂 build 不写成一行 shell，有利于类型检查和维护。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

工程化层本身不参与运行时协作，但它保护这些模块：

- Tool/provider 相关测试在 `packages/llm/test/tool-stream.test.ts` 这类文件中验证 provider tool stream 边界。
- Session/UI 同步测试在 `packages/app/src/context/global-sync/event-reducer.test.ts` 验证事件到状态的转换。
- 文件系统和 shell 这类平台相关能力通过 `packages/opencode/package.json:27-38` 的 conditional imports 区分 Bun/Node 实现。
- SDK build 通过 `packages/sdk/js/script/build.ts` 把 server API contract 转成 client，保护外部调用者。

## 11. 如果自己实现 mini agent，这一章对应什么代码

最小工程化建议：

```text
mini-agent/
  package.json
  tsconfig.json
  src/
    cli.ts
    session.ts
    llm.ts
    tool.ts
  test/
    session.test.ts
    tool-stream.test.ts
```

第一版脚本可以是：

```json
{
  "type": "module",
  "scripts": {
    "dev": "bun run src/cli.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  }
}
```

如果你以后拆包，再学习 OpenCode 的 workspace + catalog + package-level tests。

## 12. 费曼复述区

### 12.1 请你用自己的话解释

请不用“monorepo”“Turbo”这些词，向一个 Java 同事解释：

> 为什么 OpenCode 根目录不能直接跑测试？为什么要让每个 package 自己跑？

### 12.2 如果解释不出来，说明卡在这里

常见卡点：

- 把根目录当成普通单体 Node 项目。
- 不理解 workspace catalog 和子包依赖的关系。
- 把 `turbo.json` 当成测试框架，而不是 task graph。
- 以为 generated SDK 是手写文件。

### 12.3 换一种说法再解释

OpenCode 的根目录像公司总部：总部定版本、定流程、定规则，但不会替每个团队跑自己的业务验收。核心 runtime、Web app、SDK 都有自己的测试方式，因为它们面对的运行环境不同。

## 13. 练习题

### 入门题

1. 找出根目录 `package.json` 里所有 `dev:*` 脚本，说出它们分别启动哪个 package。
2. 找出 `packages/opencode/package.json` 的 `bin` 字段，说出 CLI 名称是什么。
3. 解释 `bunfig.toml` 为什么把 test root 指向 `do-not-run-tests-from-root`。

### 进阶题

1. 根据 `turbo.json`，解释为什么 `opencode#test` 要依赖 `^build`。
2. 阅读 `packages/sdk/js/script/build.ts`，画出 SDK 生成流程。
3. 阅读一个 app 测试文件，判断它是测纯函数、状态 reducer，还是 DOM 行为。

### 源码追踪题

1. 从 `package.json:15` 的 `bun turbo typecheck` 追到 `packages/opencode/package.json:9` 和 `packages/app/package.json:12`。
2. 从 `AGENTS.md:119-127` 追到根目录 `package.json:21` 和 `bunfig.toml:7-8`，说明规则如何被代码/配置落实。
3. 从 `packages/sdk/js/package.json:9` 追到 `packages/sdk/js/script/build.ts:14-47`。

### 小实现题

给 mini agent 加一个最小测试：

- `tool-stream.test.ts`：模拟模型分两次输出 `{"filePath"` 和 `:"README.md"}`。
- 断言最后能得到 `{ filePath: "README.md" }`。
- 不要 mock parser，直接测试你的真实 `appendToolDelta` 实现。

## 14. 源码追踪任务

建议你真的打开这些文件：

1. `package.json`
2. `turbo.json`
3. `bunfig.toml`
4. `AGENTS.md`
5. `packages/opencode/package.json`
6. `packages/app/package.json`
7. `packages/sdk/js/script/build.ts`
8. `packages/app/src/context/global-sync/event-reducer.test.ts`
9. `packages/llm/test/tool-stream.test.ts`

每读一个文件，写下它回答的是“版本、任务、测试、构建、发布、规范”里的哪一类问题。

## 15. 面试式自测

1. 如果你要给 OpenCode 增加一个新 package，你会检查哪些根目录配置？
2. 为什么根目录 `test` 明确失败，反而是好事？
3. `catalog:` 解决了什么依赖管理问题？
4. 为什么 SDK 生成应该进入 CI？
5. 对 agent 项目来说，为什么 tool stream 解析值得单独测试？
6. 如果一个测试复制了生产逻辑，风险是什么？

## 16. 下一步阅读建议

下一章建议读“从 OpenCode 反推 mini coding agent”。工程化这章告诉你项目如何站稳，mini agent 章会告诉你从哪些 runtime 骨架开始写。

如果要继续深入工程化，可以单独拆 3 个子页：

- `ProviderTransform` 的兼容性测试。
- HTTP API exercise 的覆盖模式。
- 多平台二进制 build 与 embedded Web UI。

