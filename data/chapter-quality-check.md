# 03-agent-core-loop 样章质量自检

检查对象：

- `learning-site/markdown/03-agent-core-loop.md`
- `learning-site/chapters/03-agent-core-loop.html`

## 自检结果

| 检查项 | 结果 | 说明 |
|---|---|---|
| 是否引用了真实源码路径 | 通过 | 样章引用了 `packages/opencode/src/session/prompt.ts`、`processor.ts`、`tools.ts`、`llm.ts`、`message-v2.ts`、`run-state.ts`、CLI/API handler 等真实路径，并包含行号范围。 |
| 是否有完整调用链 | 通过 | 覆盖了用户输入 -> session/message -> agent 决策 -> LLM 调用 -> tool call -> tool result -> 再次推理 -> 输出结果。 |
| 是否有 Java 类比 | 通过 | 用 Application Service、State Machine、Gateway、Strategy、Policy/Interceptor 类比 OpenCode 结构，并给出 Java 伪代码。 |
| 是否解释了关键 TS 语法 | 通过 | 覆盖了 `Effect.gen`、destructuring、literal union、`Record`、object spread、discriminated union。 |
| 是否有费曼复述区 | 通过 | Markdown 和 HTML 都包含 “费曼复述区”，并列出复述问题与常见卡点。 |
| 是否有练习题 | 通过 | 包含入门题、进阶题和小实现题。 |
| 是否有源码追踪任务 | 通过 | 包含 5 个源码追踪任务，覆盖 CLI、prompt、processor、LLM adapter、tool。 |
| 是否有 mini agent 实现任务 | 通过 | 第 11 节给出 mini agent loop 伪代码，第 13 节给出 echo tool 小实现题。 |
| 是否明确标注不确定内容 | 通过 | 明确标注 `MessageV2.toModelMessagesEffect` 的具体转换格式未展开，需要后续章节补充。 |
| 是否适合 Java 开发者阅读 | 通过 | 每个关键机制都配有 Java 类比或 Java 视角解释，避免只讲 TS 概念。 |

## 需要后续补充

1. 深入阅读 `MessageV2.toModelMessagesEffect`，补全 tool part 到 provider message 的具体格式转换。
2. 在 “Tool 调用系统” 章节中追踪一个具体工具，例如 `read` 或 `edit`，验证 tool execute 的完整路径。
3. 如果后续要做可视化，可以把本章调用链画成 Mermaid 或静态 SVG，但当前 HTML 已满足离线学习要求。

---

# Batch 1 质量自检：01-cli-startup / 02-session-message

检查对象：

- `learning-site/markdown/01-cli-startup.md`
- `learning-site/chapters/01-cli-startup.html`
- `learning-site/markdown/02-session-message.md`
- `learning-site/chapters/02-session-message.html`

## 自检结果

| 检查项 | 01-cli-startup | 02-session-message | 说明 |
|---|---|---|---|
| 是否重新阅读相关源码 | 通过 | 通过 | 已读取 `index.ts`、`run.ts`、`effect-cmd.ts`、session API groups/handlers、`prompt.ts`、`session.ts`、`message-v2.ts` 的关键行。 |
| 是否引用真实源码路径 | 通过 | 通过 | 两章均包含真实路径和行号范围。 |
| 是否有完整调用链 | 通过 | 通过 | CLI 章覆盖 `process.argv -> yargs -> RunCommand -> SDK prompt`；会话章覆盖 `PromptPayload -> handler -> createUserMessage -> updateMessage/updatePart -> loop`。 |
| 是否有 Java 类比 | 通过 | 通过 | CLI 章使用 `main`、Picocli、拦截器类比；会话章使用 aggregate、entity、Application Service 类比。 |
| 是否解释关键 TS 语法 | 通过 | 通过 | 覆盖 import、泛型、spread、dynamic import、schema 派生、discriminated union、Effect 等。 |
| 是否有费曼复述区 | 通过 | 通过 | 两章均有复述问题和卡点提示。 |
| 是否有练习题 | 通过 | 通过 | 两章均包含入门/进阶/小实现方向。 |
| 是否有源码追踪任务 | 通过 | 通过 | 两章均包含具体路径追踪任务。 |
| 是否有 mini agent 实现任务 | 通过 | 通过 | CLI 章有 mini CLI，Session 章有 mini prompt/session 建模。 |
| 是否明确标注不确定内容 | 需要改进 | 需要改进 | 两章没有发现必须标注的推测；后续章节如出现推测需显式写出。 |
| 是否适合 Java 开发者阅读 | 通过 | 通过 | 类比和实现任务都面向 Java 后端理解路径。 |

## Batch 1 后续改进点

1. 后续如果生成更复杂章节，应增加更多“边界条件/错误处理”段落。
2. `index.html` 的章节链接已存在；章节文件已落盘后链接可直接打开。

---

# Batch 2 质量自检：05-tool-calling / 06-file-editing

检查对象：

- `learning-site/markdown/05-tool-calling.md`
- `learning-site/chapters/05-tool-calling.html`
- `learning-site/markdown/06-file-editing.md`
- `learning-site/chapters/06-file-editing.html`

## 自检结果

| 检查项 | 05-tool-calling | 06-file-editing | 说明 |
|---|---|---|---|
| 是否重新阅读相关源码 | 通过 | 通过 | 已读取 `tool.ts`、`registry.ts`、`session/tools.ts`、plugin tool API、`read.ts`、`edit.ts`、`write.ts`、`external-directory.ts`、`lsp.ts`。 |
| 是否引用真实源码路径 | 通过 | 通过 | 两章均包含真实源码路径和行号。 |
| 是否有完整调用链 | 通过 | 通过 | Tool 章覆盖 registry -> AI SDK tool -> execute -> processor；文件章覆盖 model tool call -> read/edit/write -> permission -> fs -> format/LSP -> result。 |
| 是否有 Java 类比 | 通过 | 通过 | Tool 章用 Strategy/Registry/Adapter/SPI；文件章用 Application Service/FileRepository/Domain Event/diagnostics service。 |
| 是否解释关键 TS 语法 | 通过 | 通过 | 覆盖泛型、条件类型、Omit、Record、dynamic import、Schema.Struct、Effect.catchIf、template literal。 |
| 是否有费曼复述区 | 通过 | 通过 | 两章均包含复述问题。 |
| 是否有练习题 | 通过 | 通过 | 两章均包含入门、进阶和小实现题。 |
| 是否有源码追踪任务 | 通过 | 通过 | 两章均包含跨文件追踪任务。 |
| 是否有 mini agent 实现任务 | 通过 | 通过 | Tool 章有 `resolveTools`，文件章有 `editFile`。 |
| 是否明确标注不确定内容 | 通过 | 通过 | 文件章明确说明 Provider 不直接参与文件工具执行，后续 Provider 章验证 schema transform。 |
| 是否适合 Java 开发者阅读 | 通过 | 通过 | 两章都把 TS/Effect/tool runtime 映射到 Java 后端概念。 |

## Batch 2 后续改进点

1. `ToolRegistry.fromPlugin` 的适配细节在当前章节只解释到扩展入口，后续如做插件专题可展开。
2. 文件章未深入 `Format.Service` 具体 formatter 选择逻辑，后续可在工程化或配置章节补充。

---

# Batch 3 质量自检：07-shell-execution / 04-llm-provider

检查对象：

- `learning-site/markdown/07-shell-execution.md`
- `learning-site/chapters/07-shell-execution.html`
- `learning-site/markdown/04-llm-provider.md`
- `learning-site/chapters/04-llm-provider.html`

## 自检结果

| 检查项 | 07-shell-execution | 04-llm-provider | 说明 |
|---|---|---|---|
| 是否重新阅读相关源码 | 通过 | 通过 | 已重读 `tool/shell.ts`、`session/prompt.ts` shell path、`run-state.ts`、`permission/index.ts`、`session/llm.ts`、`llm/ai-sdk.ts`、`llm/native-runtime.ts`、`provider/provider.ts`、`provider/transform.ts`。 |
| 是否引用真实源码路径 | 通过 | 通过 | 两章均包含真实源码路径和行号范围。 |
| 是否有完整调用链 | 通过 | 通过 | Shell 章覆盖 tool call -> parse/collect/ask/run -> metadata/result；Provider 章覆盖 runLoop -> LLM.stream -> provider language -> streamText/native -> LLMEvent -> processor。 |
| 是否有 Java 类比 | 通过 | 通过 | Shell 章用 ShellCommandService/ProcessBuilder/per-session lock；Provider 章用 LlmGateway/ClientFactory/MessageConverter/event adapter。 |
| 是否解释关键 TS 语法 | 通过 | 通过 | Shell 章覆盖 Set、literal union、optional/default、dynamic import、Effect.acquireRelease、spread；Provider 章覆盖 Pick、Record、union literal、optional property、spread、dynamic import、as const。 |
| 是否有费曼复述区 | 通过 | 通过 | 两章均包含复述问题和常见卡点提示。 |
| 是否有练习题 | 通过 | 通过 | 两章均有入门题、进阶题、源码追踪题和小实现题。 |
| 是否有源码追踪任务 | 通过 | 通过 | 两章均给出跨文件追踪路线。 |
| 是否有 mini agent 实现任务 | 通过 | 通过 | Shell 章给出 mini shell runner；Provider 章给出 mini LLM gateway。 |
| 是否明确标注不确定内容 | 通过 | 通过 | Shell 章明确标注未完全展开 AST helper；Provider 章明确说明文件系统不由 LLM 层直接处理。 |
| 是否适合 Java 开发者阅读 | 通过 | 通过 | 两章都用 Java 后端常见概念解释 TS/Effect/agent runtime。 |

## Batch 3 后续改进点

1. Shell 章后续可继续拆一个“命令 AST 安全扫描”子页，深入 `commands`、`parts`、`pathArgs`、`argPath`。
2. Provider 章后续可拆一个“ProviderTransform 兼容性案例”子页，专门比较 Anthropic、Mistral、DeepSeek、OpenAI-compatible 的 message 变换。

---

# Batch 4 质量自检：09-permission-security / 08-lsp-diagnostics

检查对象：

- `learning-site/markdown/09-permission-security.md`
- `learning-site/chapters/09-permission-security.html`
- `learning-site/markdown/08-lsp-diagnostics.md`
- `learning-site/chapters/08-lsp-diagnostics.html`

## 自检结果

| 检查项 | 09-permission-security | 08-lsp-diagnostics | 说明 |
|---|---|---|---|
| 是否重新阅读相关源码 | 通过 | 通过 | 已重读 `permission/index.ts`、`evaluate.ts`、`schema.ts`、`config/permission.ts`、`agent/agent.ts`、`session/tools.ts`、`run.ts`、`lsp/lsp.ts`、`lsp/client.ts`、`lsp/server.ts`、`lsp/diagnostic.ts`、`tool/lsp.ts`、`edit.ts`、`write.ts`。 |
| 是否引用真实源码路径 | 通过 | 通过 | 两章均包含真实源码路径和行号范围。 |
| 是否有完整调用链 | 通过 | 通过 | 权限章覆盖 tool ctx.ask -> Permission.ask -> event -> reply；LSP 章覆盖 edit/write -> touchFile -> getClients -> notify.open -> diagnostics -> tool output。 |
| 是否有 Java 类比 | 通过 | 通过 | 权限章用 Spring Security/CompletableFuture 类比；LSP 章用 LanguageIntelligenceService/Factory/JSON-RPC client/IDE diagnostics 类比。 |
| 是否解释关键 TS 语法 | 通过 | 通过 | 权限章覆盖 literal union、Schema.Class、optional、rest、findLast、mapped type、Deferred；LSP 章覆盖 as const、interface、optional parameter、generic、getter、flat/filter。 |
| 是否有费曼复述区 | 通过 | 通过 | 两章均包含复述问题和常见卡点。 |
| 是否有练习题 | 通过 | 通过 | 两章均含入门、进阶、源码追踪、小实现题。 |
| 是否有源码追踪任务 | 通过 | 通过 | 两章均给出跨文件阅读顺序。 |
| 是否有 mini agent 实现任务 | 通过 | 通过 | 权限章有 mini permission service；LSP 章有 mini diagnostics service。 |
| 是否明确标注不确定内容 | 通过 | 通过 | 两章未引入未经源码支撑的流程；对 LSP 仅以源码支持的 edit/write/lsp tool 路径为准。 |
| 是否适合 Java 开发者阅读 | 通过 | 通过 | 两章均从后端安全、异步审批、语言服务和 IDE 反馈角度解释。 |

## Batch 4 后续改进点

1. 权限章后续可以补一个“规则优先级实验”小练习，用几组 ruleset 验证 `findLast`。
2. LSP 章后续可以补一个“TypeScript LSP 实战追踪”子页，选择一个 `.ts` 文件观察 didOpen/didChange/diagnostics。

---

# Batch 5 质量自检：11-ui-tui-desktop-ide / 12-sdk-api-extension

检查对象：

- `learning-site/markdown/11-ui-tui-desktop-ide.md`
- `learning-site/chapters/11-ui-tui-desktop-ide.html`
- `learning-site/markdown/12-sdk-api-extension.md`
- `learning-site/chapters/12-sdk-api-extension.html`

## 自检结果

| 检查项 | 11-ui-tui-desktop-ide | 12-sdk-api-extension | 说明 |
|---|---|---|---|
| 是否重新阅读相关源码 | 通过 | 通过 | 已重读 `run.ts` interactive path、`run/runtime.ts`、TUI `app.tsx`、SDK/SSE/sync context、Web app provider tree、Desktop sidecar、VS Code extension、server/httpapi routes、SSE handler、JS SDK、plugin service。 |
| 是否引用真实源码路径 | 通过 | 通过 | 两章均包含真实源码路径和行号范围。 |
| 是否有完整调用链 | 通过 | 通过 | UI 章覆盖 CLI -> interactive runtime -> SDK/SSE -> sync reducer -> UI，以及 Desktop/VS Code 如何接入；SDK/API 章覆盖 Server.Default/listen -> HttpApi -> session endpoints/event SSE -> generated SDK/plugin hooks。 |
| 是否有 Java 类比 | 通过 | 通过 | UI 章用 MVC/BFF/Event Bus/IDE plugin 类比；SDK/API 章用 Spring MVC Controller、OpenAPI client、ApplicationEventPublisher、SPI 类比。 |
| 是否解释关键 TS 语法 | 通过 | 通过 | 覆盖 React props/provider、union type、for await、nullable、async generator/SSE、generic client、hook map、Effect layer 等。 |
| 是否有费曼复述区 | 通过 | 通过 | 两章均包含复述问题和常见卡点提示。 |
| 是否有练习题 | 通过 | 通过 | 两章均有入门题、进阶题、源码追踪题和小实现题。 |
| 是否有源码追踪任务 | 通过 | 通过 | 两章均给出跨 CLI/TUI/App/Desktop/VS Code 或 Server/SDK/Plugin 的阅读路线。 |
| 是否有 mini agent 实现任务 | 通过 | 通过 | UI 章给出 mini TUI/SSE store；SDK/API 章给出 mini HTTP API + SDK + plugin hook。 |
| 是否明确标注不确定内容 | 通过 | 通过 | UI 章明确把 Desktop/VS Code 视作外壳接入同一 runtime；SDK/API 章明确说明 server layer 不是 agent 决策层。 |
| 是否适合 Java 开发者阅读 | 通过 | 通过 | 两章都从后端分层、事件流和扩展点角度解释。 |

## Batch 5 后续改进点

1. UI 章后续可以单独拆一个“TUI 状态同步 reducer”子页，逐个事件讲 `sync-v2.tsx`。
2. SDK/API 章后续可以补一个“写一个最小插件”实战页，把 plugin hook 和 plugin tool 串起来。

---

# Batch 6 质量自检：13-testing-engineering / 14-mini-coding-agent

检查对象：

- `learning-site/markdown/13-testing-engineering.md`
- `learning-site/chapters/13-testing-engineering.html`
- `learning-site/markdown/14-mini-coding-agent.md`
- `learning-site/chapters/14-mini-coding-agent.html`

## 自检结果

| 检查项 | 13-testing-engineering | 14-mini-coding-agent | 说明 |
|---|---|---|---|
| 是否重新阅读相关源码 | 通过 | 通过 | 工程化章重读根 `package.json`、`turbo.json`、`tsconfig.json`、`bunfig.toml`、`AGENTS.md`、package scripts、真实测试、SDK/build 脚本；mini agent 章重读 `run.ts`、`prompt.ts`、`llm.ts`、`tool.ts`、`session/tools.ts`、`permission/index.ts`、`read/edit/shell`、`processor.ts`、SSE handler。 |
| 是否引用真实源码路径 | 通过 | 通过 | 两章均包含真实源码路径和行号范围。 |
| 是否有完整调用链 | 通过 | 通过 | 工程化章覆盖 root workspace -> catalog -> turbo -> package scripts -> tests/build；mini agent 章覆盖 CLI -> session -> loop -> LLM -> tool -> permission -> tool result -> re-loop -> final。 |
| 是否有 Java 类比 | 通过 | 通过 | 工程化章用 Gradle/Maven/OpenAPI Generator 类比；mini agent 章用 Controller/Application Service/State Machine/Gateway/Strategy/Security interceptor 类比。 |
| 是否解释关键 TS 语法 | 通过 | 通过 | 工程化章覆盖 `import type`、`Partial`、spread、literal union、Bun tagged template、type assertion；mini agent 章覆盖 `Record`、literal union、optional property、generic default、`Omit`、`as const`。 |
| 是否有费曼复述区 | 通过 | 通过 | 两章均包含复述题、卡点和换一种说法。 |
| 是否有练习题 | 通过 | 通过 | 两章均含入门、进阶、源码追踪、小实现题。 |
| 是否有源码追踪任务 | 通过 | 通过 | 两章均给出具体路径和阅读顺序。 |
| 是否有 mini agent 实现任务 | 通过 | 通过 | 工程化章给出 mini project scaffold/test；mini agent 章给出 fake LLM + read/edit/shell + permission skeleton。 |
| 是否明确标注不确定内容 | 通过 | 通过 | mini agent 章明确区分“OpenCode 源码”和“教学草图”；配置系统明确标注为本轮未生成完整章节。 |
| 是否适合 Java 开发者阅读 | 通过 | 通过 | 两章都围绕 Java 后端熟悉的 module、task graph、service、state machine、gateway、security 边界展开。 |

## Batch 6 后续改进点

1. `10-config-system` 仍是元数据占位，本轮用户指定顺序未包含它；如果要站点零占位，下一章应补配置系统。
2. mini agent 章已经给出实现骨架，后续可以继续生成一个真实可运行的 `mini-agent/` 示例项目。
