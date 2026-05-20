---
title: "用户输入与会话"
description: "理解 CLI/API 输入如何变成 session、message 和 part，并被后续 agent loop 消费。"
sidebar:
  label: "02. 用户输入与会话"
  order: 2
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>中等</div>
  <div><strong>预计阅读</strong>35 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/02-session-message.md"><code>markdown/02-session-message.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`02-session-message`
- 章节摘要：理解 CLI/API 输入如何变成 session、message 和 part，并被后续 agent loop 消费。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/server/routes/instance/httpapi/groups/session.ts</code></li>
<li><code>packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts</code></li>
<li><code>packages/opencode/src/session/prompt.ts</code></li>
<li><code>packages/opencode/src/session/session.ts</code></li>
<li><code>packages/opencode/src/session/message-v2.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.2 用户输入与会话”。  
> 主要源码：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`、`handlers/session.ts`、`packages/opencode/src/session/prompt.ts`、`session.ts`、`message-v2.ts`。

## 0. 本章学习目标

你会学到：session API 的 payload 如何定义，HTTP handler 如何调用 `SessionPrompt`，`createUserMessage` 如何选择 agent/model 并解析 parts，`MessageV2` 如何建模 user/assistant/tool/text/file，用户输入如何被持久化为后续 agent loop 的上下文。

## 1. 一句话讲明白

用户输入与会话模块负责把外部请求变成稳定的内部事实：一个 session 下的 user message 和一组 message parts。来源：`packages/opencode/src/session/prompt.ts:689-731`、`packages/opencode/src/session/prompt.ts:1116-1230`。

## 2. 它在 OpenCode agent 中的位置

CLI/API 只提供输入，agent loop 只消费消息历史。中间的桥就是 session/message 层：它把文本、文件、agent mention、MCP resource、权限覆盖、模型选择等都整理成统一结构。来源：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66-68`、`packages/opencode/src/session/message-v2.ts:327-380`。

## 3. 生活类比

把 session 看成一份项目档案，message 是档案里的每次沟通记录，part 是沟通记录里的附件、正文、工具结果或系统补充。agent 每轮工作前都先读档案，而不是只听最后一句话。

## 4. Java 开发者类比

- `Session.Info` 类似会话 aggregate。
- `MessageV2.User` / `Assistant` 类似消息实体。
- `Part` 是 message 的子实体集合，像 `List<MessagePart>`。
- `SessionPrompt.prompt` 是 Application Service。
- `groups/session.ts` 是 Controller 的 request/response schema。

## 5. 最小源码路径

1. `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66-68`：用 `Struct.omit` 从 `SessionPrompt` 输入类型派生 API payload。
2. `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-324`：定义 `session.prompt` endpoint。
3. `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-290`：handler 调用 `promptSvc.prompt`。
4. `packages/opencode/src/session/prompt.ts:689-731`：创建 user message info。
5. `packages/opencode/src/session/prompt.ts:788-1085`：解析 file/resource/agent parts。
6. `packages/opencode/src/session/prompt.ts:1116-1208`：写入 message/parts 并发布 prompt event。
7. `packages/opencode/src/session/prompt.ts:1211-1230`：设置 session 权限并启动 loop。

## 6. 用户输入到 agent 行动的整体链路

```text
client.session.prompt(payload)
  -> SessionApi PromptPayload
  -> sessionHandlers.prompt
  -> SessionPrompt.prompt
  -> createUserMessage
  -> resolvePart for each input part
  -> sessions.updateMessage/updatePart
  -> optional SessionEvent.Prompted
  -> loop(sessionID)
```

API payload 不是复制粘贴 DTO，而是从 `SessionPrompt.PromptInput` 去掉 `sessionID` 派生：

```ts
export const PromptPayload = Schema.Struct(Struct.omit(SessionPrompt.PromptInput.fields, ["sessionID"]))
```

路径：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66`

这保证 API payload 和内部 prompt input 不容易漂移。

## 7. 核心源码逐段讲解

### 7.1 session API 声明

```ts
HttpApiEndpoint.post("prompt", SessionPaths.prompt, {
  params: { sessionID: SessionID },
  query: WorkspaceRoutingQuery,
  payload: PromptPayload,
  success: described(MessageV2.WithParts, "Created message"),
})
```

路径：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-324`

Java 理解：这像 Spring Controller 方法签名 + OpenAPI 注解，只是 OpenCode 用 Effect HTTP API 和 Schema 描述。

### 7.2 handler 做边界转换

```ts
const prompt = Effect.fn("SessionHttpApi.prompt")(function* (ctx) {
  yield* requireSession(ctx.params.sessionID)
  const message = yield* promptSvc
    .prompt({
      ...ctx.payload,
      sessionID: ctx.params.sessionID,
    })
    .pipe(Effect.mapError(() => new HttpApiError.BadRequest({})))
  return HttpServerResponse.stream(Stream.make(JSON.stringify(message)).pipe(Stream.encodeText))
})
```

路径：`packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-292`

handler 不自己解析 agent，也不自己调模型，只负责补上 path param 里的 `sessionID` 并调用 service。

### 7.3 Session schema

```ts
export const Info = Schema.Struct({
  id: SessionID,
  slug: Schema.String,
  projectID: ProjectID,
  directory: Schema.String,
  title: Schema.String,
  agent: optionalOmitUndefined(Schema.String),
  model: optionalOmitUndefined(Model),
  permission: optionalOmitUndefined(Permission.Ruleset),
})
```

路径：`packages/opencode/src/session/session.ts:208-228`

Session 保存的是会话级状态：目录、标题、当前 agent/model、权限等。

### 7.4 User message schema

```ts
export const User = Schema.Struct({
  role: Schema.Literal("user"),
  time: Schema.Struct({ created: NonNegativeInt }),
  agent: Schema.String,
  model: Schema.Struct({
    providerID: ProviderID,
    modelID: ModelID,
    variant: Schema.optional(Schema.String),
  }),
  system: Schema.optional(Schema.String),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
})
```

路径：`packages/opencode/src/session/message-v2.ts:327-350`

注意 user message 不只是 text，它还携带 agent、model、tools override、format/system 等控制信息。

### 7.5 Part union

```ts
export const Part = Schema.Union([
  TextPart,
  SubtaskPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  RetryPart,
  CompactionPart,
]).annotate({ discriminator: "type", identifier: "Part" })
```

路径：`packages/opencode/src/session/message-v2.ts:352-365`

这就是 OpenCode 能统一表示文本、附件、工具、推理、快照、压缩任务的关键。

### 7.6 创建 user message

```ts
const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))

const info: MessageV2.User = {
  id: input.messageID ?? MessageID.ascending(),
  role: "user",
  sessionID: input.sessionID,
  tools: input.tools,
  agent: ag.name,
  model: { providerID: model.providerID, modelID: model.modelID, variant },
  system: input.system,
  format: input.format,
}
```

路径：`packages/opencode/src/session/prompt.ts:689-731`

Java 理解：这是一个 command handler 把 request DTO 转成 domain entity。

### 7.7 解析文件 part

文件 part 的解析分多种来源：MCP resource、data URL、file URL、目录、图片等。关键路径之一是 file URL 文本文件会调用 read 工具：

```ts
const { read } = yield* registry.named()
const execRead = (args, extra) => {
  const controller = new AbortController()
  return read.execute(args, {
    sessionID: input.sessionID,
    abort: controller.signal,
    agent: input.agent!,
    messageID: info.id,
    extra: { bypassCwdCheck: true, ...extra },
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  })
}
```

路径：`packages/opencode/src/session/prompt.ts:867-888`

这说明用户通过 CLI `--file` 附加文件时，OpenCode 会在创建 user message 阶段把文件内容读进 synthetic text context。具体文件权限这里被 bypass，因为这是用户主动附加文件。这个判断来自 `extra: { bypassCwdCheck: true }` 和 `ask: () => Effect.void`，来源同上。

### 7.8 plugin hook 可改消息

```ts
yield* plugin.trigger(
  "chat.message",
  {
    sessionID: input.sessionID,
    agent: input.agent,
    model: input.model,
    messageID: input.messageID,
    variant: input.variant,
  },
  { message: info, parts: resolvedParts },
)
```

路径：`packages/opencode/src/session/prompt.ts:1069-1079`

这表示消息入库前有扩展点。Java 类比：类似 `ApplicationEvent` 或拦截器可以修改 request context。

### 7.9 写入 message 和 parts

```ts
yield* sessions.updateMessage(info)
for (const part of parts) yield* sessions.updatePart(part)
```

路径：`packages/opencode/src/session/prompt.ts:1116-1117`

这一步之后，agent loop 可以只依赖 session store，而不关心输入来自 CLI、API 还是 TUI。

### 7.10 发布 Prompted/Synthetic 事件

`nextPrompt` 会把 text/file/agent/reference/synthetic 分组，并在 experimental event system 打开时发布事件。来源：`packages/opencode/src/session/prompt.ts:1118-1206`。

### 7.11 prompt 启动 loop

```ts
if (input.noReply === true) return message
return yield* loop({ sessionID: input.sessionID })
```

路径：`packages/opencode/src/session/prompt.ts:1228-1229`

用户输入与会话模块的终点，就是把新事实交给 agent 核心循环。

## 8. 关键 TypeScript 语法复习

- `Schema.Struct(Struct.omit(...))`：从内部 schema 派生 API payload。来源：`groups/session.ts:66-68`。
- object spread：`{ ...ctx.payload, sessionID: ctx.params.sessionID }`。来源：`handlers/session.ts:284-288`。
- optional field：`variant: Schema.optional(Schema.String)`。来源：`message-v2.ts:342-346`。
- discriminated union：`Part` 以 `type` 为 discriminator。来源：`message-v2.ts:352-365`。
- generic/context service：`export class Service extends Context.Service<Service, Interface>()(...)`。来源：`prompt.ts:94`。
- `Effect.forEach(..., { concurrency: "unbounded" })`：并发解析 parts。来源：`prompt.ts:1065-1067`。
- non-null assertion：`agent: input.agent!`，源码在 file part read context 中使用。来源：`prompt.ts:878-882`。

## 9. 涉及的设计模式和架构思想

- DTO 派生：API payload 从 service input schema 派生，减少类型漂移。
- Aggregate：session 是聚合根，message/part 是子状态。
- Event Sourcing 味道：message parts 和 events 共同驱动 UI/agent 继续工作。
- Interceptor/Hook：`plugin.trigger("chat.message")`。
- Adapter：HTTP handler 只把 API ctx 适配为 service input。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- Tool：file part 解析时会直接调用 `registry.named().read`。来源：`prompt.ts:873-888`。
- Provider：创建 user message 时根据 input/agent/current session 选择 model。来源：`prompt.ts:700-715`。
- Session：`sessions.updateMessage` 和 `sessions.updatePart` 持久化输入事实。来源：`prompt.ts:1116-1117`。
- 文件系统：file URL 会通过 `fileURLToPath`、`fsys.isDir`、`fsys.readFile` 等读取。来源：`prompt.ts:867-1039`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

```ts
type UserMessage = {
  id: string
  role: "user"
  sessionID: string
  agent: string
  model: { providerID: string; modelID: string }
}

type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; url: string; filename: string; mime: string }

async function prompt(input: PromptInput) {
  const session = await sessions.get(input.sessionID)
  const user = createUserMessage(input, session)
  const parts = await resolveParts(input.parts)
  await sessions.saveMessage(user)
  await sessions.saveParts(user.id, parts)
  return input.noReply ? { info: user, parts } : runLoop(input.sessionID)
}
```

先把 message/part 建模清楚，再写 agent loop。

## 12. 费曼复述区

请回答：

1. 为什么 user message 里要保存 agent/model？
2. part union 解决了什么问题？
3. 为什么 file attachment 会在创建 user message 时被 read tool 读取？

如果卡住，换句话说：session/message 层是在把“外部输入”变成“agent 可以反复读取的内部事实”。

## 13. 练习题

### 入门题

1. 找到 `PromptPayload` 的定义，解释为什么要 omit `sessionID`。
2. 找到 `User` schema，列出 user message 的核心字段。
3. 找到 `Part` union，数一数有几种 part。

### 进阶题

1. 解释 `createUserMessage` 如何决定使用哪个 model。
2. 解释 `plugin.trigger("chat.message")` 的扩展价值。
3. 解释 synthetic text 和普通 user text 的区别。

### 小实现题

写一个 `resolveParts(parts)`：支持 text 和 file 两种 part，file part 读取本地文件并生成 synthetic text。

## 14. 源码追踪任务

1. 从 `groups/session.ts:312-324` 追到 `handlers/session.ts:279-290`。
2. 从 `handlers/session.ts:284-288` 追到 `SessionPrompt.prompt`。
3. 从 `createUserMessage` 的 model 选择追到 `currentModel`。
4. 从 `part.type === "file"` 追到 `read.execute`。
5. 从 `sessions.updatePart` 追到消息如何被 event/API 读取。

## 15. 面试式自测

1. 为什么 agent 项目要把 message 和 part 分开？
2. 为什么 prompt API 的 success 类型是 `MessageV2.WithParts`？
3. 如果用户上传目录，源码怎么处理？
4. 如果插件想修改用户消息，扩展点在哪里？
5. session permission 和 prompt input tools 有什么关系？

## 16. 下一步阅读建议

下一步读 “Agent 核心循环” 或 “Tool 调用系统”。如果你已经读完样章 `03-agent-core-loop`，建议直接进入 `05-tool-calling`，因为会话层保存的 parts 会在工具调用中继续变成 agent 的行动记录。


