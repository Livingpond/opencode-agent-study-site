---
title: "Agent 核心循环"
description: "理解 OpenCode 如何在 session 内反复读取消息、选择模型和工具、调用 LLM、处理 tool call，并决定继续或结束。"
sidebar:
  label: "03. Agent 核心循环"
  order: 3
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>较难</div>
  <div><strong>预计阅读</strong>55 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/03-agent-core-loop.md"><code>markdown/03-agent-core-loop.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`03-agent-core-loop`
- 章节摘要：理解 OpenCode 如何在 session 内反复读取消息、选择模型和工具、调用 LLM、处理 tool call，并决定继续或结束。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/session/prompt.ts</code></li>
<li><code>packages/opencode/src/session/processor.ts</code></li>
<li><code>packages/opencode/src/session/run-state.ts</code></li>
<li><code>packages/opencode/src/session/tools.ts</code></li>
<li><code>packages/opencode/src/session/llm.ts</code></li>
<li><code>packages/opencode/src/session/llm/ai-sdk.ts</code></li>
<li><code>packages/opencode/src/session/message-v2.ts</code></li>
<li><code>packages/opencode/src/cli/cmd/run.ts</code></li>
<li><code>packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts</code></li>

</ul>


> 模块来源：`study-output/02-opencode-function-outline.md` 的 “2.3 Agent 核心循环”。  
> 主要源码：`packages/opencode/src/session/prompt.ts`、`packages/opencode/src/session/processor.ts`、`packages/opencode/src/session/tools.ts`、`packages/opencode/src/session/llm.ts`、`packages/opencode/src/session/message-v2.ts`。

## 0. 本章学习目标

学完这一章，你应该能用自己的话解释：

1. 用户输入如何进入 `SessionPrompt.prompt`。
2. OpenCode 为什么需要 `runLoop`，而不是直接调用一次模型。
3. `runLoop` 如何选择 agent、model、tools 和 system prompt。
4. `SessionProcessor` 如何把 LLM 流式事件转成 text/tool parts。
5. tool result 如何回到 message history，并触发下一轮推理。
6. 如果自己写 mini agent，最小 loop 应该包含哪些代码。

## 1. 一句话讲明白

Agent 核心循环就是一个会持续运行的会话状态机：它读取最近的用户消息，准备模型和工具，调用 LLM，处理模型产生的文本或工具调用，把工具结果写回消息历史，然后决定继续下一轮还是停止。  
来源：`packages/opencode/src/session/prompt.ts:1240-1489`、`packages/opencode/src/session/processor.ts:779-847`。

## 2. 它在 OpenCode agent 中的位置

它处在四个模块的交叉点：

- Session：保存 user/assistant/tool parts。来源：`packages/opencode/src/session/message-v2.ts:554-561`。
- Agent/Model：决定这轮用哪个 agent 和 provider/model。来源：`packages/opencode/src/session/prompt.ts:1287-1317`。
- Tool：把 read/edit/shell 等工具暴露给模型。来源：`packages/opencode/src/session/tools.ts:24-116`。
- LLM：发送 system/messages/tools，消费流式响应。来源：`packages/opencode/src/session/llm.ts:39-60`、`packages/opencode/src/session/llm.ts:471-493`。

最小位置图：

```text
CLI/API
  -> SessionPrompt.prompt
  -> SessionPrompt.runLoop
  -> SessionTools.resolve
  -> SessionProcessor.process
  -> LLM.stream
  -> SessionProcessor.handleEvent
  -> message parts
  -> runLoop next round
```

## 3. 生活类比

把 agent loop 想成一个项目经理在处理任务：

1. 用户给项目经理一个需求。
2. 项目经理看当前项目记录和最近进展。
3. 项目经理决定找哪个专家、用哪些工具。
4. 专家给出建议，可能说“我需要先查文件”或“我需要跑命令”。
5. 项目经理让工具执行，把结果贴回工作记录。
6. 专家看到新结果后继续判断。
7. 直到专家说“完成了”，项目经理停止循环。

这个类比对应源码里的 `while (true)`：每一轮都从 session message history 重新构造上下文。来源：`packages/opencode/src/session/prompt.ts:1248-1477`。

## 4. Java 开发者类比

如果用 Java 写，`SessionPrompt.runLoop` 很像一个 Application Service + State Machine：

```java
while (true) {
  List<Message> messages = messageRepository.loadContext(sessionId);
  Latest latest = MessageV2.latest(messages);
  Agent agent = agentService.get(latest.user().agent());
  Model model = providerService.getModel(latest.user().model());
  Map<String, Tool> tools = toolRegistry.resolve(agent, model, session);
  LlmResult result = llmGateway.stream(system, messages, tools);
  processor.apply(result, session);
  if (result.stop()) break;
}
```

但 OpenCode 不是 Java class 风格。它大量使用：

- `Effect.gen(function* () { ... })` 表达带依赖和错误通道的异步流程。来源：`packages/opencode/src/session/prompt.ts:1240-1241`。
- 对象字面量创建 message。来源：`packages/opencode/src/session/prompt.ts:1332-1346`。
- union/literal type 表达 tool state。来源：`packages/opencode/src/session/message-v2.ts:248-320`。

## 5. 最小源码路径

先只记这条路径：

1. CLI 非交互输入调用 `client.session.prompt`。  
   路径：`packages/opencode/src/cli/cmd/run.ts:791-798`

2. HTTP handler 调用 `promptSvc.prompt`。  
   路径：`packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-290`

3. `SessionPrompt.prompt` 创建 user message，然后调用 `loop`。  
   路径：`packages/opencode/src/session/prompt.ts:1211-1229`

4. `runLoop` 执行真正的 while 循环。  
   路径：`packages/opencode/src/session/prompt.ts:1240-1481`

5. `SessionProcessor.process` 调用 `llm.stream` 并消费 stream。  
   路径：`packages/opencode/src/session/processor.ts:779-847`

6. `LLM.stream` 调用 `streamText` 或 native runtime，并转成 `LLMEvent`。  
   路径：`packages/opencode/src/session/llm.ts:402-493`

7. `SessionProcessor` 处理 tool-call/tool-result/text 事件，更新 message parts。  
   路径：`packages/opencode/src/session/processor.ts:376-500`、`packages/opencode/src/session/processor.ts:618-685`

## 6. 用户输入到 agent 行动的整体链路

### 6.1 用户输入

CLI 非交互模式会订阅事件，然后调用 session prompt：

```ts
const model = pick(args.model)
const result = await client.session.prompt({
  sessionID,
  agent,
  model,
  variant: args.variant,
  parts: [...files, { type: "text", text: message }],
})
```

路径：`packages/opencode/src/cli/cmd/run.ts:791-798`

如果是 HTTP/API，则 handler 把 payload 加上 `sessionID` 后交给 `promptSvc.prompt`：

```ts
const message = yield* promptSvc
  .prompt({
    ...ctx.payload,
    sessionID: ctx.params.sessionID,
  })
```

路径：`packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-289`

### 6.2 session / message

`SessionPrompt.prompt` 不直接调模型，它先创建 user message：

```ts
const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
yield* revert.cleanup(session)
const message = yield* createUserMessage(input)
yield* sessions.touch(input.sessionID)
if (input.noReply === true) return message
return yield* loop({ sessionID: input.sessionID })
```

路径：`packages/opencode/src/session/prompt.ts:1211-1229`

`createUserMessage` 会决定 agent、model、variant，并构造 `MessageV2.User`：

```ts
const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))

const info: MessageV2.User = {
  id: input.messageID ?? MessageID.ascending(),
  role: "user",
  sessionID: input.sessionID,
  tools: input.tools,
  agent: ag.name,
  model: {
    providerID: model.providerID,
    modelID: model.modelID,
    variant,
  },
}
```

路径：`packages/opencode/src/session/prompt.ts:689-731`

最后它把 message 和 parts 写入 session：

```ts
yield* sessions.updateMessage(info)
for (const part of parts) yield* sessions.updatePart(part)
```

路径：`packages/opencode/src/session/prompt.ts:1116-1117`

### 6.3 agent 决策

进入 `runLoop` 后，OpenCode 每轮先取上下文和最近状态：

```ts
let msgs = yield* MessageV2.filterCompactedEffect(sessionID)
const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)
if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
```

路径：`packages/opencode/src/session/prompt.ts:1252-1256`

`MessageV2.latest` 不是按数组位置找最新，而是按递增 message id 找最新 user/assistant/finished，并找还没处理的 compaction/subtask：

```ts
export function latest(msgs: WithParts[]) {
  let user: User | undefined
  let assistant: Assistant | undefined
  let finished: Assistant | undefined
  for (const msg of msgs) {
    const info = msg.info
    if (info.role === "user" && (!user || info.id > user.id)) user = info
    if (info.role === "assistant" && (!assistant || info.id > assistant.id)) assistant = info
    if (info.role === "assistant" && info.finish && (!finished || info.id > finished.id)) finished = info
  }
  const tasks = msgs.flatMap((m) =>
    finished && m.info.id <= finished.id
      ? []
      : m.parts.filter((p): p is CompactionPart | SubtaskPart => p.type === "compaction" || p.type === "subtask"),
  )
  return { user, assistant, finished, tasks }
}
```

路径：`packages/opencode/src/session/message-v2.ts:1070-1093`

然后 loop 解析模型和 agent：

```ts
const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)
const agent = yield* agents.get(lastUser.agent)
const maxSteps = agent.steps ?? Infinity
```

路径：`packages/opencode/src/session/prompt.ts:1287-1325`

### 6.4 LLM 调用

在调用 LLM 前，loop 会准备工具、system prompt、模型消息：

```ts
const tools = yield* SessionTools.resolve({
  agent,
  session,
  model,
  processor: handle,
  bypassAgentCheck,
  messages: msgs,
  promptOps,
})

const [skills, env, instructions, modelMsgs] = yield* Effect.all([
  sys.skills(agent),
  sys.environment(model),
  instruction.system().pipe(Effect.orDie),
  MessageV2.toModelMessagesEffect(msgs, model),
])
const system = [...env, ...instructions, ...(skills ? [skills] : [])]
```

路径：`packages/opencode/src/session/prompt.ts:1372-1428`

真正调用发生在 `handle.process`：

```ts
const result = yield* handle.process({
  user: lastUser,
  agent,
  permission: session.permission,
  sessionID,
  parentSessionID: session.parentID,
  system,
  messages: [...modelMsgs, ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS }] : [])],
  tools,
  model,
  toolChoice: format.type === "json_schema" ? "required" : undefined,
})
```

路径：`packages/opencode/src/session/prompt.ts:1429-1440`

`LLM.StreamInput` 的类型正好说明一次模型请求需要哪些东西：

```ts
export type StreamInput = {
  user: MessageV2.User
  sessionID: string
  model: Provider.Model
  agent: Agent.Info
  system: string[]
  messages: ModelMessage[]
  tools: Record<string, Tool>
  toolChoice?: "auto" | "required" | "none"
}
```

路径：`packages/opencode/src/session/llm.ts:39-52`

### 6.5 tool call

工具不是直接从 `ToolRegistry` 传给模型，而是通过 `SessionTools.resolve` 转成 AI SDK tool：

```ts
const tools: Record<string, AITool> = {}

for (const item of yield* registry.tools({
  modelID: ModelID.make(input.model.api.id),
  providerID: input.model.providerID,
  agent: input.agent,
})) {
  const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))
  tools[item.id] = tool({
    description: item.description,
    inputSchema: jsonSchema(schema),
    execute(args, options) {
      return run.promise(
        Effect.gen(function* () {
          const ctx = context(args, options)
          const result = yield* item.execute(args, ctx)
          return output
        }),
      )
    },
  })
}
```

路径：`packages/opencode/src/session/tools.ts:24-116`

模型发出 tool-call 后，AI SDK event 会被转成 OpenCode `LLMEvent.toolCall`：

```ts
case "tool-call":
  return Effect.sync(() => {
    state.toolNames[event.toolCallId] = event.toolName
    return [
      LLMEvent.toolCall({
        id: event.toolCallId,
        name: event.toolName,
        input: event.input,
      }),
    ]
  })
```

路径：`packages/opencode/src/session/llm/ai-sdk.ts:191-203`

`SessionProcessor` 收到 tool-call 后创建或更新 `ToolPart`，状态从 pending 进入 running：

```ts
case "tool-call": {
  const toolCall = yield* ensureToolCall(value)
  const input = toolInput(value.input)
  yield* updateToolCall(value.id, (match) => ({
    ...match,
    tool: value.name,
    state:
      match.state.status === "running"
        ? { ...match.state, input }
        : {
            status: "running",
            input,
            time: { start: Date.now() },
          },
  }))
}
```

路径：`packages/opencode/src/session/processor.ts:376-421`

### 6.6 tool result

工具执行后的结果也会作为 stream event 回来：

```ts
case "tool-result":
  return Effect.sync(() => {
    const name = state.toolNames[event.toolCallId] ?? "unknown"
    delete state.toolNames[event.toolCallId]
    return [
      LLMEvent.toolResult({
        id: event.toolCallId,
        name,
        result: ToolResultValue.make(event.output),
      }),
    ]
  })
```

路径：`packages/opencode/src/session/llm/ai-sdk.ts:205-218`

Processor 把 tool result 标记为 completed：

```ts
const completeToolCall = Effect.fn("SessionProcessor.completeToolCall")(function* (toolCallID, output) {
  const match = yield* readToolCall(toolCallID)
  if (!match || match.part.state.status !== "running") return
  yield* session.updatePart({
    ...match.part,
    state: {
      status: "completed",
      input: match.part.state.input,
      output: output.output,
      metadata: output.metadata,
      title: output.title,
      time: { start: match.part.state.time.start, end: Date.now() },
      attachments: output.attachments,
    },
  })
  yield* settleToolCall(toolCallID)
})
```

路径：`packages/opencode/src/session/processor.ts:169-193`

`ToolPart` 的状态模型也证明了工具结果会进入 session message part：

```ts
export const ToolState = Schema.Union([
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
]).annotate({ discriminator: "status" })

export const ToolPart = Schema.Struct({
  type: Schema.Literal("tool"),
  callID: Schema.String,
  tool: Schema.String,
  state: ToolState,
})
```

路径：`packages/opencode/src/session/message-v2.ts:248-320`

### 6.7 再次推理

`SessionProcessor.process` 结束后返回 `"continue"`、`"stop"` 或 `"compact"`：

```ts
if (ctx.needsCompaction) return "compact"
if (ctx.blocked || ctx.assistantMessage.error) return "stop"
return "continue"
```

路径：`packages/opencode/src/session/processor.ts:844-846`

`runLoop` 根据结果决定结束、compact，或者继续下一轮：

```ts
if (result === "stop") return "break" as const
if (result === "compact") {
  yield* compaction.create({
    sessionID,
    agent: lastUser.agent,
    model: lastUser.model,
    auto: true,
    overflow: !handle.message.finish,
  })
}
return "continue" as const
```

路径：`packages/opencode/src/session/prompt.ts:1461-1471`

如果 `outcome` 是 continue，`while (true)` 进入下一轮，这时刚刚写入的 tool parts 已在 message history 中，下一次 `MessageV2.toModelMessagesEffect(msgs, model)` 会把新的历史转成模型上下文。  
来源：`packages/opencode/src/session/prompt.ts:1248-1477`、`packages/opencode/src/session/prompt.ts:1420-1425`。  
说明：这里“tool parts 会被下一轮模型上下文消费”的结论来自 `runLoop` 每轮重新读取 `MessageV2.filterCompactedEffect(sessionID)` 并调用 `MessageV2.toModelMessagesEffect(msgs, model)`；具体 tool part 到 provider message 的格式转换需要继续阅读 `MessageV2.toModelMessagesEffect`，本章不展开。

### 6.8 输出结果

如果模型输出普通文本，processor 会创建 text part、追加 delta、结束时更新 part：

```ts
case "text-start":
  ctx.currentText = {
    id: PartID.ascending(),
    messageID: ctx.assistantMessage.id,
    sessionID: ctx.assistantMessage.sessionID,
    type: "text",
    text: "",
    time: { start: Date.now() },
  }
  yield* session.updatePart(ctx.currentText)

case "text-delta":
  ctx.currentText.text += value.text
  yield* session.updatePartDelta({ field: "text", delta: value.text })

case "text-end":
  ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }
  yield* session.updatePart(ctx.currentText)
```

路径：`packages/opencode/src/session/processor.ts:618-685`

## 7. 核心源码逐段讲解

### 7.1 `prompt`：入口不直接问模型

```ts
const message = yield* createUserMessage(input)
yield* sessions.touch(input.sessionID)
if (input.noReply === true) return message
return yield* loop({ sessionID: input.sessionID })
```

路径：`packages/opencode/src/session/prompt.ts:1211-1229`

它解决的问题：先把用户输入落到 session，保证后续 loop 只依赖统一的消息历史。

Java 理解：这是 Application Service 的 command handler。先 `save(UserMessage)`，再调用 `agentLoop.run(sessionId)`。

复述检查：为什么 OpenCode 不在 CLI handler 里直接调用 LLM？

### 7.2 `loop`：同一 session 不能随便并发跑

```ts
const loop: (input: LoopInput) => Effect.Effect<MessageV2.WithParts> = Effect.fn("SessionPrompt.loop")(function* (
  input: LoopInput,
) {
  return yield* state.ensureRunning(input.sessionID, lastAssistant(input.sessionID), runLoop(input.sessionID))
})
```

路径：`packages/opencode/src/session/prompt.ts:1485-1489`

它解决的问题：同一个 session 的 agent run 需要 busy/idle/cancel 管理，避免多个 loop 同时写同一组 messages。

`ensureRunning` 来自 `SessionRunState`：

```ts
readonly ensureRunning: (
  sessionID: SessionID,
  onInterrupt: Effect.Effect<MessageV2.WithParts>,
  work: Effect.Effect<MessageV2.WithParts>,
) => Effect.Effect<MessageV2.WithParts>
```

路径：`packages/opencode/src/session/run-state.ts:10-23`

Java 理解：类似给 `sessionId` 加一个 runner/lock，并注册 interrupt fallback。

### 7.3 `runLoop`：真正的状态机

```ts
while (true) {
  yield* status.set(sessionID, { type: "busy" })
  let msgs = yield* MessageV2.filterCompactedEffect(sessionID)
  const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)
  if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
  // ...
}
```

路径：`packages/opencode/src/session/prompt.ts:1248-1256`

它解决的问题：每轮都从持久化消息状态重新恢复上下文，而不是把上下文藏在内存局部变量里。

Java 理解：这是典型状态机，`MessageV2.latest` 是状态选择器。

### 7.4 退出条件：不是所有 stop 都能停

```ts
const hasToolCalls =
  lastAssistantMsg?.parts.some((part) => part.type === "tool" && !part.metadata?.providerExecuted) ?? false

if (
  lastAssistant?.finish &&
  !["tool-calls"].includes(lastAssistant.finish) &&
  !hasToolCalls &&
  lastUser.id < lastAssistant.id
) {
  break
}
```

路径：`packages/opencode/src/session/prompt.ts:1258-1276`

它解决的问题：有些 provider 可能返回 stop，但 assistant message 里仍有 tool calls。OpenCode 明确注释说这种情况下要继续 loop，让 tool results 能发回模型。  
来源：`packages/opencode/src/session/prompt.ts:1261-1264`。

Java 理解：退出条件不能只看一个状态字段，要看是否还有未反馈给模型的工具调用。

### 7.5 准备 assistant message 和 processor

```ts
const msg: MessageV2.Assistant = {
  id: MessageID.ascending(),
  parentID: lastUser.id,
  role: "assistant",
  agent: agent.name,
  modelID: model.id,
  providerID: model.providerID,
  time: { created: Date.now() },
  sessionID,
}
yield* sessions.updateMessage(msg)

const handle = yield* processor.create({
  assistantMessage: msg,
  sessionID,
  model,
})
```

路径：`packages/opencode/src/session/prompt.ts:1332-1365`

它解决的问题：LLM stream 还没开始前，先创建 assistant message 容器。后续 text/tool/reasoning 都作为 parts 挂到这个 assistant message 下。

Java 理解：先创建一个 `AssistantMessage aggregate root`，processor 后续只更新这个 aggregate 的 children。

### 7.6 准备工具

```ts
const tools = yield* SessionTools.resolve({
  agent,
  session,
  model,
  processor: handle,
  bypassAgentCheck,
  messages: msgs,
  promptOps,
})
```

路径：`packages/opencode/src/session/prompt.ts:1372-1386`

`SessionTools.resolve` 内部会创建 `Tool.Context`，其中 `ask` 会合并 agent permission 和 session permission：

```ts
ask: (req) =>
  permission
    .ask({
      ...req,
      sessionID: input.session.id,
      tool: { messageID: input.processor.message.id, callID: options.toolCallId },
      ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
    })
```

路径：`packages/opencode/src/session/tools.ts:42-73`

Java 理解：工具执行被一个上下文对象包住，里面有 session、message、permission、metadata callback，类似 Spring Interceptor + Strategy context。

### 7.7 调 LLM 并消费事件

```ts
const stream = llm.stream(streamInput)

yield* stream.pipe(
  Stream.tap((event) => handleEvent(event)),
  Stream.takeUntil(() => ctx.needsCompaction),
  Stream.runDrain,
)
```

路径：`packages/opencode/src/session/processor.ts:779-795`

它解决的问题：LLM 输出不是一次性字符串，而是一串事件。processor 逐个消费事件，并更新 session 状态。

Java 理解：像 `Flux<LlmEvent>` 或 `Flow.Publisher<LlmEvent>`，每个 event 被 event handler 消费。

### 7.8 处理 tool-call 和 tool-result

tool-call：

```ts
case "tool-call": {
  const toolCall = yield* ensureToolCall(value)
  const input = toolInput(value.input)
  yield* updateToolCall(value.id, (match) => ({
    ...match,
    tool: value.name,
    state: { status: "running", input, time: { start: Date.now() } },
  }))
}
```

路径：`packages/opencode/src/session/processor.ts:376-421`

tool-result：

```ts
case "tool-result": {
  const rawOutput = toolResultOutput(value)
  const output = { ...rawOutput, attachments: attachments.length ? attachments : undefined }
  yield* completeToolCall(value.id, output)
  return
}
```

路径：`packages/opencode/src/session/processor.ts:451-500`

Java 理解：tool call 是任务进入 running；tool result 是任务完成并持久化 result。

### 7.9 继续、停止、压缩

```ts
if (ctx.needsCompaction) return "compact"
if (ctx.blocked || ctx.assistantMessage.error) return "stop"
return "continue"
```

路径：`packages/opencode/src/session/processor.ts:844-846`

```ts
if (result === "stop") return "break" as const
if (result === "compact") {
  yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })
}
return "continue" as const
```

路径：`packages/opencode/src/session/prompt.ts:1461-1471`

Java 理解：processor 返回状态机事件，loop 根据事件跳转到 break/compact/next iteration。

## 8. 关键 TypeScript 语法复习

### 8.1 `Effect.gen(function* () { ... })`

例子：

```ts
const runLoop: (sessionID: SessionID) => Effect.Effect<MessageV2.WithParts> = Effect.fn("SessionPrompt.run")(
  function* (sessionID: SessionID) {
    const ctx = yield* InstanceState.context
    // ...
  },
)
```

路径：`packages/opencode/src/session/prompt.ts:1240-1243`

理解：这不是普通 generator 用来产出数组，而是 Effect 用 generator 语法把异步、依赖、错误通道写得像同步代码。Java 类比是 Reactor/CompletableFuture 链，但语法更接近同步 Service。

### 8.2 destructuring

```ts
const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)
```

路径：`packages/opencode/src/session/prompt.ts:1254`

理解：从返回对象里取字段，并重命名。Java 里通常会写 `latest.user()`、`latest.assistant()`。

### 8.3 literal union

```ts
export type Result = "compact" | "stop" | "continue"
```

路径：`packages/opencode/src/session/processor.ts:36`

理解：比 Java enum 更轻量，运行时就是字符串，编译期限制只能是这三个值。

### 8.4 Record

```ts
const tools: Record<string, AITool> = {}
```

路径：`packages/opencode/src/session/tools.ts:34`

理解：类似 `Map<String, AITool>`，但这里用 JS object 表示工具名到工具对象的映射。

### 8.5 object spread

```ts
const output = {
  ...result,
  attachments: result.attachments?.map((attachment) => ({
    ...attachment,
    id: PartID.ascending(),
    sessionID: ctx.sessionID,
    messageID: input.processor.message.id,
  })),
}
```

路径：`packages/opencode/src/session/tools.ts:93-102`

理解：浅拷贝原对象并覆盖/补充字段，类似 Java builder copy。

### 8.6 discriminated union

```ts
export const ToolState = Schema.Union([
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
]).annotate({
  discriminator: "status",
})
```

路径：`packages/opencode/src/session/message-v2.ts:299-308`

理解：`status` 是判别字段，类似 Java sealed interface + 多个 record 实现。

## 9. 涉及的设计模式和架构思想

1. State Machine  
   `runLoop` 的 `while (true)` 根据 `stop/continue/compact/subtask` 切换状态。来源：`packages/opencode/src/session/prompt.ts:1248-1477`。

2. Application Service / Orchestrator  
   `SessionPrompt` 不做具体 tool 实现，但协调 session、agent、provider、processor、tools。来源：`packages/opencode/src/session/prompt.ts`。

3. Strategy / Registry  
   工具由 registry 解析，具体工具实现由 `item.execute` 执行。来源：`packages/opencode/src/session/tools.ts:75-116`。

4. Gateway / Adapter  
   `LLM.stream` 隐藏 AI SDK/native runtime 差异。来源：`packages/opencode/src/session/llm.ts:471-493`。

5. Event Processor  
   `SessionProcessor` 消费 LLMEvent 并更新消息 parts。来源：`packages/opencode/src/session/processor.ts:779-847`。

6. Policy / Interceptor  
   `SessionTools.resolve` 里的 `ctx.ask` 把权限检查插入工具执行上下文。来源：`packages/opencode/src/session/tools.ts:64-72`。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

### Session

Session 是 loop 的状态仓库。`prompt` 写入 user message；`runLoop` 每轮读取 messages；processor 写入 assistant text/tool parts。  
来源：`packages/opencode/src/session/prompt.ts:1116-1117`、`packages/opencode/src/session/prompt.ts:1252-1254`、`packages/opencode/src/session/processor.ts:618-685`。

### Tool

`SessionTools.resolve` 根据 agent/model/session 解析工具，并给每个工具提供 `ctx.metadata` 和 `ctx.ask`。工具执行结果通过 processor 的 `completeToolCall` 写回 tool part。  
来源：`packages/opencode/src/session/tools.ts:24-116`、`packages/opencode/src/session/processor.ts:169-193`。

### Provider / LLM

`LLM.StreamInput` 包含 model、agent、system、messages、tools；`LLM.stream` 使用 `streamText` 发送请求，并把 AI SDK fullStream 变成统一事件。  
来源：`packages/opencode/src/session/llm.ts:39-60`、`packages/opencode/src/session/llm.ts:402-493`。

### 文件系统

Agent 核心循环本身不直接写文件。它通过 tools 间接调用文件系统，比如 edit/write/read/shell。样章只验证了 loop 到 tool 的通道；具体文件读写请继续读 `packages/opencode/src/tool/read.ts`、`edit.ts`、`write.ts`。  
不确定点：本章没有展开 `MessageV2.toModelMessagesEffect` 如何把文件/tool parts 转成 provider message，需要在后续 “Tool 调用系统” 或 “文件读写与代码修改” 章节补充。

## 11. 如果自己实现 mini agent，这一章对应什么代码

最小实现可以这样拆：

```ts
type ToolState = "pending" | "running" | "completed" | "error"

async function runLoop(sessionID: string) {
  while (true) {
    const messages = await sessionStore.loadMessages(sessionID)
    const latestUser = findLatestUser(messages)
    const tools = toolRegistry.resolve()
    const result = await llm.stream({ messages, tools })

    await processor.apply(sessionID, result)

    if (result.finish === "stop" && !hasUnresolvedToolCalls(sessionID)) break
    if (result.finish === "tool-calls") continue
  }
}
```

对照 OpenCode：

- `sessionStore.loadMessages` 对应 `MessageV2.filterCompactedEffect`。
- `findLatestUser` 对应 `MessageV2.latest`。
- `toolRegistry.resolve` 对应 `SessionTools.resolve`。
- `llm.stream` 对应 `LLM.stream`。
- `processor.apply` 对应 `SessionProcessor.process` / `handleEvent`。

先不要实现 LSP、compaction、subtask、plugin。先把 user -> llm -> tool -> result -> next loop 跑通。

## 12. 费曼复述区

### 12.1 请你用自己的话解释

用 3 句话解释：

1. `SessionPrompt.prompt` 做了什么？
2. `runLoop` 为什么要 while？
3. tool result 是如何让模型继续推理的？

### 12.2 如果解释不出来，说明卡在这里

常见卡点：

- 把 CLI handler 当成真正 agent runtime。
- 以为模型一次返回最终答案，不理解 tool call 会触发下一轮。
- 分不清 `SessionTools.resolve` 和具体 tool execute。
- 分不清 `LLM.stream` 和 `SessionProcessor.process`。

### 12.3 换一种说法再解释

OpenCode 的 agent loop 就像一个“带工具的消息驱动工作流”：

- session 保存事实。
- loop 选择下一步。
- LLM 产生行动建议。
- tool 执行动作。
- processor 把动作结果写回事实。
- loop 再读事实继续判断。

## 13. 练习题

### 入门题

1. 找到 `SessionPrompt.prompt`，写出它调用的三个关键动作。
2. 找到 `MessageV2.latest`，说明它为什么按 message id 判断最新消息。
3. 找到 `SessionProcessor.process`，说明它返回哪三种结果。

### 进阶题

1. 解释为什么 `lastAssistant.finish` 存在时，OpenCode 仍然可能继续 loop。
2. 解释 `SessionTools.resolve` 为什么需要 `processor`。
3. 解释 `ToolStatePending -> Running -> Completed/Error` 对 UI 有什么价值。

### 小实现题

用 TypeScript 写一个最小内存版 agent loop：

- messages 存在数组里。
- tool 只有 `echo`。
- 假 LLM 第一次返回 tool-call，第二次返回 text。
- loop 能执行 echo tool，并把结果喂给第二轮。

## 14. 源码追踪任务

1. 从 `packages/opencode/src/cli/cmd/run.ts:791-798` 追到 `SessionPrompt.prompt`。
2. 从 `packages/opencode/src/session/prompt.ts:1429-1440` 追到 `SessionProcessor.process`。
3. 从 `packages/opencode/src/session/processor.ts:789-795` 追到 `LLM.stream`。
4. 从 `packages/opencode/src/session/llm/ai-sdk.ts:191-218` 追到 `SessionProcessor` 的 `tool-call` / `tool-result` case。
5. 从 `SessionTools.resolve` 追一个具体工具，例如 `read` 或 `edit`。

## 15. 面试式自测

1. OpenCode 的 agent loop 和普通 chat completion 最大区别是什么？
2. 为什么 agent loop 需要持久化 message parts？
3. `SessionProcessor` 为什么不直接返回字符串？
4. OpenCode 如何处理模型返回了 tool call 的情况？
5. 什么情况下 loop 会返回 `compact`？
6. 为什么 tool 执行上下文里要有 `ask`？
7. 如果你要避免同一 session 并发跑两个 loop，你会怎么设计？
8. 如果模型不停调用同一个工具，OpenCode 有哪些防护迹象？提示：看 `doom_loop`。

## 16. 下一步阅读建议

建议下一章生成 “Tool 调用系统”。理由：Agent 核心循环里最难理解的下一跳就是 `SessionTools.resolve`，它连接模型 tool schema、具体工具执行、权限系统、plugin hook 和 tool result 回填。

下一步重点源码：

- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/registry.ts`
- `packages/opencode/src/session/tools.ts`
- `packages/opencode/src/tool/read.ts`
- `packages/opencode/src/tool/edit.ts`


