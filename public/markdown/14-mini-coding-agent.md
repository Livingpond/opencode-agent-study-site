# 从 OpenCode 反推 mini coding agent

## 0. 本章学习目标

这一章不是继续介绍 OpenCode 的某个单独模块，而是把前面章节反推成一个你可以自己实现的 mini coding agent。

学完你应该能：

1. 从 OpenCode 的真实源码里提炼一个最小 agent 架构。
2. 知道第一版必须保留哪些模块，哪些可以延后。
3. 能用 Java 后端分层方式理解 TypeScript agent 代码。
4. 能写出一个 mini agent 的 CLI、Session、LLM、Tool、Permission、事件输出骨架。

## 1. 一句话讲明白

一个 mini coding agent 的最小闭环是：接收用户输入，保存成 session message，调用 LLM，发现 tool call，执行工具并写回 tool result，再把结果发回 LLM，直到模型停止。

这条链路在 OpenCode 里的真实来源主要是：

- CLI 输入：`packages/opencode/src/cli/cmd/run.ts:768-803`
- prompt/session 入口：`packages/opencode/src/session/prompt.ts:1211-1230`
- agent loop：`packages/opencode/src/session/prompt.ts:1248-1489`
- LLM 输入类型：`packages/opencode/src/session/llm.ts:39-60`
- tool 统一接口：`packages/opencode/src/tool/tool.ts:16-45`
- tool 包装和执行：`packages/opencode/src/session/tools.ts:42-115`
- tool result 写回：`packages/opencode/src/session/processor.ts:451-500`
- 权限审批：`packages/opencode/src/permission/index.ts:161-195`

## 2. 它在 OpenCode agent 中的位置

这章是前面所有章节的“缩小版总装图”。

OpenCode 是成熟实现，包含：

- 多入口：CLI、TUI、Desktop、VS Code、SDK/API。
- 多模型 provider。
- 内置工具、MCP 工具、插件工具。
- session 存储、事件流、权限审批、LSP、文件系统、shell。
- 构建、测试、SDK 生成、跨平台打包。

mini agent 不需要一次实现这些全部能力。第一版只要保留闭环：

```text
CLI -> Session -> LLM -> Tool Registry -> Tool Execution -> Tool Result -> LLM -> Final Answer
```

## 3. 生活类比

OpenCode 像一间成熟的软件工作室：

- 用户是产品经理，提出需求。
- Session 是项目记录本，记录每轮对话和每次工具结果。
- LLM 是主程，决定下一步要读文件、改代码还是执行命令。
- Tool 是具体工种，比如读文件、改文件、跑命令。
- Permission 是安全负责人，危险操作先审批。
- Processor 是会议纪要员，把主程说的话、调用的工具、工具结果写回记录本。

mini agent 第一版只需要一个小团队：产品经理、主程、两个工种、一个审批开关、一本记录本。

## 4. Java 开发者类比

| Mini agent 概念 | Java 后端类比 | OpenCode 源码依据 |
|---|---|---|
| CLI 输入 | `main(String[] args)` / Picocli command | `run.ts:768-803` |
| SessionPrompt | Application Service | `prompt.ts:1211-1230` |
| Message/Part | Aggregate + child entity | `message-v2.ts`，前面章节已读 |
| Agent loop | State machine / workflow engine | `prompt.ts:1248-1489` |
| LLM service | Gateway / Client adapter | `llm.ts:39-60` |
| Tool registry | Strategy registry / plugin registry | `session/tools.ts:75-115` |
| Permission | Spring Security interceptor + async approval | `permission/index.ts:161-195` |
| Event stream | ApplicationEventPublisher + SSE | `handlers/event.ts:21-53` |

## 5. 最小源码路径

如果你只想反推 mini agent，按这个顺序读：

1. `packages/opencode/src/cli/cmd/run.ts:768-803`：非交互 CLI 如何把输入送进 `client.session.prompt`。
2. `packages/opencode/src/session/prompt.ts:1211-1230`：prompt 如何创建 user message 并进入 loop。
3. `packages/opencode/src/session/prompt.ts:1248-1276`：loop 如何判断继续还是退出。
4. `packages/opencode/src/session/prompt.ts:1325-1440`：loop 如何创建 assistant message、resolve tools、调用 processor。
5. `packages/opencode/src/session/llm.ts:39-60`：LLM stream 需要的输入。
6. `packages/opencode/src/tool/tool.ts:16-45`：工具接口长什么样。
7. `packages/opencode/src/session/tools.ts:42-115`：工具如何被包装成模型可调用函数。
8. `packages/opencode/src/permission/index.ts:161-195`：工具执行前如何 ask。
9. `packages/opencode/src/session/processor.ts:451-500`：tool result 如何写回。
10. `packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:21-53`：如果需要 UI，事件流如何输出。

## 6. 用户输入到 agent 行动的整体链路

以非交互 CLI 为例，OpenCode 的链路是：

```text
用户输入 prompt
  -> run.ts 调用 client.session.prompt
  -> SessionPrompt.prompt 创建 user message
  -> loop 读取 session message
  -> 选择 agent/model
  -> 创建 assistant message
  -> SessionTools.resolve 暴露工具
  -> handle.process 调用 LLM stream
  -> LLM 输出 text/tool-call/tool-result event
  -> processor 写回 text/tool part
  -> 工具执行时通过 ctx.ask 走权限
  -> tool result 写回 message part
  -> loop 再次把 tool result 发给 LLM
  -> 模型 finish 后退出
```

如果你自己实现 mini agent，可以先不做 TUI、Desktop、MCP、插件、LSP，只保留这条链路。

## 7. 核心源码逐段讲解

### 7.1 CLI 只负责把输入送进 session

路径：`packages/opencode/src/cli/cmd/run.ts:768-803`

```ts
if (!args.interactive) {
  const events = await client.event.subscribe()
  loop(client, events).catch((e) => {
    console.error(e)
    process.exit(1)
  })

  const model = pick(args.model)
  const result = await client.session.prompt({
    sessionID,
    agent,
    model,
    variant: args.variant,
    parts: [...files, { type: "text", text: message }],
  })
  if (result.error) {
    if (!emit("error", { error: result.error })) UI.error(formatRunError(result.error))
    process.exitCode = 1
  }
  return
}
```

这段对 mini agent 的启发：CLI 不应该直接实现 agent loop。CLI 只负责解析参数、整理 parts，然后调用 session service。

Java 类比：Controller 不写业务状态机，只调用 Application Service。

### 7.2 prompt 创建 user message，然后进入 loop

路径：`packages/opencode/src/session/prompt.ts:1211-1230`

```ts
const prompt: (input: PromptInput) => Effect.Effect<MessageV2.WithParts, Image.Error> = Effect.fn(
  "SessionPrompt.prompt",
)(function* (input: PromptInput) {
  const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
  yield* revert.cleanup(session)
  const message = yield* createUserMessage(input)
  yield* sessions.touch(input.sessionID)

  const permissions: Permission.Ruleset = []
  for (const [t, enabled] of Object.entries(input.tools ?? {})) {
    permissions.push({ permission: t, action: enabled ? "allow" : "deny", pattern: "*" })
  }

  if (input.noReply === true) return message
  return yield* loop({ sessionID: input.sessionID })
})
```

mini agent 第一版可以简化成：

```text
prompt(input):
  session.addUserMessage(input.text)
  if noReply return
  return runLoop(session.id)
```

关键不是 Effect 语法，而是职责边界：prompt 负责写入用户消息，loop 负责后续推理。

### 7.3 loop 是一个状态机

路径：`packages/opencode/src/session/prompt.ts:1248-1276`

```ts
while (true) {
  yield* status.set(sessionID, { type: "busy" })
  let msgs = yield* MessageV2.filterCompactedEffect(sessionID)

  const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)

  if (!lastUser) throw new Error("No user message found in stream. This should never happen.")

  const hasToolCalls =
    lastAssistantMsg?.parts.some((part) => part.type === "tool" && !part.metadata?.providerExecuted) ?? false

  if (
    lastAssistant?.finish &&
    !["tool-calls"].includes(lastAssistant.finish) &&
    !hasToolCalls &&
    lastUser.id < lastAssistant.id
  ) {
    yield* slog.info("exiting loop")
    break
  }
```

这就是 agent 的心脏：不是“调用一次 LLM 就结束”，而是根据 message 状态判断是否继续。

mini agent 可以先用更简单的条件：

```text
while true:
  response = llm.stream(messages, tools)
  append assistant output
  if response has tool calls:
    execute tools
    append tool results
    continue
  break
```

### 7.4 每一步都创建 assistant message 和工具集合

路径：`packages/opencode/src/session/prompt.ts:1325-1440`

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

const tools = yield* SessionTools.resolve({
  agent,
  session,
  model,
  processor: handle,
  bypassAgentCheck,
  messages: msgs,
  promptOps,
})

const result = yield* handle.process({
  user: lastUser,
  agent,
  permission: session.permission,
  sessionID,
  system,
  messages: [...modelMsgs, ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS }] : [])],
  tools,
  model,
})
```

这给 mini agent 一个很重要的设计：LLM 调用前要准备好 4 样东西：

- 当前 user / session。
- system prompts。
- 历史 messages。
- tools。

### 7.5 LLM service 是一个流式网关

路径：`packages/opencode/src/session/llm.ts:39-60`

```ts
export type StreamInput = {
  user: MessageV2.User
  sessionID: string
  parentSessionID?: string
  model: Provider.Model
  agent: Agent.Info
  permission?: Permission.Ruleset
  system: string[]
  messages: ModelMessage[]
  small?: boolean
  tools: Record<string, Tool>
  retries?: number
  toolChoice?: "auto" | "required" | "none"
}

export interface Interface {
  readonly stream: (input: StreamInput) => Stream.Stream<LLMEvent, unknown>
}
```

mini agent 的 `LlmClient` 可以先简单很多：

```ts
type LlmInput = {
  messages: ModelMessage[]
  tools: Record<string, ToolDef>
}

interface LlmClient {
  stream(input: LlmInput): AsyncIterable<LlmEvent>
}
```

这是教学示例，不是 OpenCode 源码。

### 7.6 Tool 接口要先设计好

路径：`packages/opencode/src/tool/tool.ts:16-45`

```ts
export type Context<M extends Metadata = Metadata> = {
  sessionID: SessionID
  messageID: MessageID
  agent: string
  abort: AbortSignal
  callID?: string
  extra?: { [key: string]: unknown }
  messages: MessageV2.WithParts[]
  metadata(input: { title?: string; metadata?: M }): Effect.Effect<void>
  ask(input: Omit<Permission.Request, "id" | "sessionID" | "tool">): Effect.Effect<void>
}

export interface ExecuteResult<M extends Metadata = Metadata> {
  title: string
  metadata: M
  output: string
  attachments?: Omit<MessageV2.FilePart, "id" | "sessionID" | "messageID">[]
}

export interface Def<Parameters extends Schema.Decoder<unknown> = Schema.Decoder<unknown>, M extends Metadata = Metadata> {
  id: string
  description: string
  parameters: Parameters
  execute(args: Schema.Schema.Type<Parameters>, ctx: Context): Effect.Effect<ExecuteResult<M>>
}
```

这个接口说明，工具不只是一个函数。工具需要：

- 参数 schema。
- 执行上下文。
- 权限申请能力。
- 结果 metadata。
- 可选附件。

mini agent 第一版至少保留 `id`、`description`、`parameters`、`execute`。

### 7.7 SessionTools.resolve 把内部工具包装成模型工具

路径：`packages/opencode/src/session/tools.ts:42-115`

```ts
const context = (args: Record<string, unknown>, options: ToolExecutionOptions): Tool.Context => ({
  sessionID: input.session.id,
  abort: options.abortSignal!,
  messageID: input.processor.message.id,
  callID: options.toolCallId,
  agent: input.agent.name,
  messages: input.messages,
  metadata: (val) => input.processor.updateToolCall(options.toolCallId, ...),
  ask: (req) =>
    permission
      .ask({
        ...req,
        sessionID: input.session.id,
        tool: { messageID: input.processor.message.id, callID: options.toolCallId },
        ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
      })
      .pipe(Effect.orDie),
})

for (const item of yield* registry.tools({ modelID, providerID, agent })) {
  const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))
  tools[item.id] = tool({
    description: item.description,
    inputSchema: jsonSchema(schema),
    execute(args, options) {
      return run.promise(Effect.gen(function* () {
        const ctx = context(args, options)
        const result = yield* item.execute(args, ctx)
        return output
      }))
    },
  })
}
```

这里有一个适配器模式：OpenCode 内部 Tool 和 AI SDK 需要的 `tool(...)` 不是同一个接口，所以 `SessionTools.resolve` 做了转换。

mini agent 如果直接调用某个 provider SDK，也可能需要这一层。

### 7.8 权限是工具执行前的闸门

路径：`packages/opencode/src/permission/index.ts:161-195`

```ts
const ask = Effect.fn("Permission.ask")(function* (input: AskInput) {
  const { approved, pending } = yield* InstanceState.get(state)
  const { ruleset, ...request } = input
  let needsAsk = false

  for (const pattern of request.patterns) {
    const rule = evaluate(request.permission, pattern, ruleset, approved)
    if (rule.action === "deny") {
      return yield* new DeniedError({ ruleset: ruleset.filter((rule) => Wildcard.match(request.permission, rule.permission)) })
    }
    if (rule.action === "allow") continue
    needsAsk = true
  }

  if (!needsAsk) return

  const id = request.id ?? PermissionID.ascending()
  const deferred = yield* Deferred.make<void, RejectedError | CorrectedError>()
  pending.set(id, { info, deferred })
  yield* bus.publish(Event.Asked, info)
  return yield* Effect.ensuring(Deferred.await(deferred), Effect.sync(() => pending.delete(id)))
})
```

mini agent 可以先实现同步版：

```text
if rule == deny: throw
if rule == allow: run
if rule == ask: print prompt and wait for y/n
```

但是架构上最好保留 `PermissionService.ask(...)`，因为以后接 TUI 或 Web UI 时，审批会变成异步。

### 7.9 文件读写和 shell 是最小 coding agent 的两个核心工具

读文件路径：`packages/opencode/src/tool/read.ts:29-39`

```ts
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file or directory to read" }),
  offset: Schema.optional(NonNegativeInt).annotate({
    description: "The line number to start reading from (1-indexed)",
  }),
  limit: Schema.optional(NonNegativeInt).annotate({
    description: "The maximum number of lines to read (defaults to 2000)",
  }),
})

export const ReadTool = Tool.define("read", ...)
```

编辑文件路径：`packages/opencode/src/tool/edit.ts:47-69`

```ts
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file to modify" }),
  oldString: Schema.String.annotate({ description: "The text to replace" }),
  newString: Schema.String.annotate({
    description: "The text to replace it with (must be different from oldString)",
  }),
  replaceAll: Schema.optional(Schema.Boolean).annotate({
    description: "Replace all occurrences of oldString (default false)",
  }),
})

export const EditTool = Tool.define("edit", ...)
```

Shell 路径：`packages/opencode/src/tool/shell.ts:260-287`

```ts
const parse = Effect.fn("ShellTool.parse")(function* (command: string, ps: boolean) {
  const tree = yield* Effect.promise(() => parser().then((p) => (ps ? p.ps : p.bash).parse(command)))
  if (!tree) throw new Error("Failed to parse command")
  return tree
})

const ask = Effect.fn("ShellTool.ask")(function* (ctx: Tool.Context, scan: Scan) {
  if (scan.dirs.size > 0) {
    yield* ctx.ask({ permission: "external_directory", patterns: globs, always: globs, metadata: {} })
  }

  if (scan.patterns.size === 0) return
  yield* ctx.ask({ permission: ShellID.ToolID, patterns: Array.from(scan.patterns), always: Array.from(scan.always), metadata: {} })
})
```

mini agent 第一版可以只做：

- `read_file`
- `edit_file`
- `run_shell`

并给 `edit_file` 和 `run_shell` 加权限确认。

### 7.10 tool result 被 processor 写回，再进入下一轮

路径：`packages/opencode/src/session/processor.ts:451-500`

```ts
case "tool-result": {
  const toolCall = yield* readToolCall(value.id)
  const rawOutput = toolResultOutput(value)
  const output = {
    ...rawOutput,
    output:
      omitted === 0
        ? rawOutput.output
        : `${rawOutput.output}\n\n[${omitted} images omitted: could not be resized below the image size limit.]`,
    attachments: attachments.length ? attachments : undefined,
  }
  yield* completeToolCall(value.id, output)
  return
}
```

路径：`packages/opencode/src/session/prompt.ts:1449-1477`

```ts
const finished = handle.message.finish && !["tool-calls", "unknown"].includes(handle.message.finish)

if (result === "stop") return "break" as const
if (result === "compact") {
  yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })
}
return "continue" as const
```

这就是“工具执行结果回到模型”的关键。mini agent 一定要把 tool result 写进 messages，否则下一轮 LLM 不知道工具做了什么。

## 8. 关键 TypeScript 语法复习

### 8.1 `Record<string, Tool>`

来源：`packages/opencode/src/session/llm.ts:49`

```ts
tools: Record<string, Tool>
```

表示一个 key 是 string、value 是 Tool 的对象。Java 类比：`Map<String, Tool>`。

### 8.2 literal union

来源：`packages/opencode/src/session/llm.ts:51`

```ts
toolChoice?: "auto" | "required" | "none"
```

这比 Java enum 更轻量，运行时只是字符串，编译期限制只能取这三个值。

### 8.3 optional property

来源：`packages/opencode/src/session/llm.ts:42-51`

```ts
parentSessionID?: string
small?: boolean
retries?: number
```

`?` 表示字段可以是 `undefined`。Java 类比是 nullable field，但 TS 会在类型层提醒你处理。

### 8.4 泛型接口

来源：`packages/opencode/src/tool/tool.ts:28-45`

```ts
export interface ExecuteResult<M extends Metadata = Metadata> {
  title: string
  metadata: M
  output: string
}
```

`M extends Metadata = Metadata` 表示 metadata 类型可定制，默认是 Metadata。Java 类比：`class ExecuteResult<M extends Metadata>`，但 TS 可以给泛型默认值。

### 8.5 `Omit`

来源：`packages/opencode/src/tool/tool.ts:25`

```ts
ask(input: Omit<Permission.Request, "id" | "sessionID" | "tool">): Effect.Effect<void>
```

工具调用 `ask` 时不需要自己填 `id/sessionID/tool`，这些由上下文补齐。Java 里通常会建一个 `PermissionRequestDraft` DTO；TS 可以直接用 `Omit` 从已有类型裁剪。

### 8.6 `as const`

来源：`packages/opencode/src/session/prompt.ts:1436`

```ts
{ role: "assistant" as const, content: MAX_STEPS }
```

`as const` 让 `"assistant"` 保持字面量类型，而不是泛化成 `string`。

## 9. 涉及的设计模式和架构思想

### 9.1 Controller -> Service -> State Machine

`run.ts` 像 Controller；`SessionPrompt.prompt` 像 Application Service；`runLoop` 是状态机。

### 9.2 Strategy / Registry

每个 tool 是一个 strategy；registry 根据 agent/model 选出可用工具。来源：`session/tools.ts:75-115`。

### 9.3 Adapter

内部 Tool 接口被适配成 provider/AI SDK 可调用的 tool。来源：`session/tools.ts:80-115`。

### 9.4 Event Bus

权限请求和 server event stream 都依赖事件发布。来源：`permission/index.ts:187-190`、`handlers/event.ts:21-53`。

### 9.5 Safety Gate

文件编辑和 shell 执行必须经过权限层。来源：`edit.ts:98-107`、`shell.ts:266-287`、`permission/index.ts:161-195`。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

mini agent 里可以压缩成 5 个服务：

| 服务 | 职责 | OpenCode 对应 |
|---|---|---|
| `SessionStore` | 保存 user/assistant/tool messages | `Session.Service`、`MessageV2` |
| `AgentLoop` | while 循环，判断继续/停止 | `SessionPrompt.runLoop` |
| `LlmClient` | 把 messages/tools 发给模型并返回事件 | `LLM.Service` |
| `ToolRegistry` | 管理 read/edit/shell 工具 | `ToolRegistry.Service`、`SessionTools.resolve` |
| `PermissionService` | allow/deny/ask | `Permission.Service` |

不要一开始就做插件、MCP、TUI、LSP。先做闭环，再加能力。

## 11. 如果自己实现 mini agent，这一章对应什么代码

下面是建议实现顺序。示例代码是“你可以自己写的 mini agent 草图”，不是 OpenCode 源码。

### 11.1 第一步：定义消息类型

```ts
type Role = "user" | "assistant" | "tool"

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[]; finish?: "stop" | "tool-calls" }
  | { role: "tool"; toolCallID: string; content: string }

type ToolCall = {
  id: string
  name: string
  input: unknown
}
```

对应 OpenCode：`MessageV2.User`、`MessageV2.Assistant`、tool part。

### 11.2 第二步：定义 Tool 接口

```ts
type ToolContext = {
  sessionID: string
  ask(input: { permission: string; pattern: string }): Promise<void>
}

type ToolDef<TInput = unknown> = {
  id: string
  description: string
  parameters: unknown
  execute(input: TInput, ctx: ToolContext): Promise<{ output: string }>
}
```

对应 OpenCode：`packages/opencode/src/tool/tool.ts:16-45`。

### 11.3 第三步：写 agent loop

```ts
async function runLoop(session: Session, llm: LlmClient, tools: Record<string, ToolDef>) {
  while (true) {
    const result = await llm.complete({
      messages: session.messages,
      tools,
    })

    session.messages.push(result.assistant)

    if (!result.assistant.toolCalls?.length) break

    for (const call of result.assistant.toolCalls) {
      const tool = tools[call.name]
      if (!tool) throw new Error(`Unknown tool: ${call.name}`)
      const output = await tool.execute(call.input, makeToolContext(session, call))
      session.messages.push({ role: "tool", toolCallID: call.id, content: output.output })
    }
  }
}
```

对应 OpenCode：`prompt.ts:1248-1489`、`session/tools.ts:42-115`、`processor.ts:451-500`。

### 11.4 第四步：实现 read/edit/shell

第一版推荐顺序：

1. `read_file`：只读项目目录内文本文件。
2. `edit_file`：只支持 `oldString/newString`。
3. `run_shell`：先只支持白名单命令，例如 `ls`、`cat`、`npm test`。

对应 OpenCode：`read.ts:29-39`、`edit.ts:47-69`、`shell.ts:260-287`。

### 11.5 第五步：加权限

第一版不要做复杂 ruleset，先做：

```text
read_file: allow
edit_file: ask
run_shell: ask 或 deny
```

对应 OpenCode：`permission/index.ts:161-195`。

### 11.6 第六步：加事件输出

如果你要接 Web UI，再加：

```text
event: message.created
event: part.updated
event: tool.started
event: tool.finished
event: permission.asked
```

对应 OpenCode：`handlers/event.ts:21-53`。

## 12. 费曼复述区

### 12.1 请你用自己的话解释

请你不用“agent loop”这个词，向一个 Java 同事解释：

> 为什么 coding agent 不能只调用一次 LLM？为什么 tool result 必须写回消息历史？

### 12.2 如果解释不出来，说明卡在这里

常见卡点：

- 以为 tool call 是本地代码主动决定的，而不是模型输出的结构化请求。
- 以为工具执行完就可以直接把结果给用户，不需要再给模型。
- 分不清 session message 和 UI event。
- 分不清 Tool 内部接口和 provider 看到的 tool schema。

### 12.3 换一种说法再解释

模型像一个只会发指令的主程。它说“读这个文件”，工具读完文件后，必须把结果告诉主程。主程看完结果，才能决定下一步是修改文件、跑测试，还是回答用户。

## 13. 练习题

### 入门题

1. 用 5 句话解释 `CLI -> Session -> LLM -> Tool -> LLM`。
2. 写出 mini agent 至少需要的 3 个 tool。
3. 说明为什么 `edit_file` 需要权限，而 `read_file` 第一版可以先宽松一些。

### 进阶题

1. 把 OpenCode 的 `Tool.Context` 简化成你自己的 `ToolContext`。
2. 写一个 `ToolRegistry`，输入 agent 名称，返回可用工具集合。
3. 写一个 `PermissionService.ask`，支持 allow/deny/ask 三种行为。

### 源码追踪题

1. 从 `run.ts:792` 的 `client.session.prompt` 追到 `prompt.ts:1211`。
2. 从 `prompt.ts:1372` 的 `SessionTools.resolve` 追到 `session/tools.ts:75`。
3. 从 `session/tools.ts:93` 的 `item.execute(args, ctx)` 追到 `edit.ts:69`。
4. 从 `edit.ts:98` 的 `ctx.ask` 追到 `permission/index.ts:161`。
5. 从 `processor.ts:499` 的 `completeToolCall` 回到 `prompt.ts:1461-1477` 的 continue/break 判断。

### 小实现题

实现一个真正能跑的 mini agent skeleton：

```text
src/
  cli.ts
  session.ts
  llm.ts
  tools/
    read-file.ts
    edit-file.ts
    run-shell.ts
  permission.ts
```

要求：

1. CLI 接收一句 prompt。
2. Session 保存 messages 到内存数组。
3. LLM 先用 fake client：如果用户说 “read package”，就返回 `read_file` tool call。
4. Tool 执行后把结果写回 messages。
5. Loop 再调用 fake LLM，让它输出最终回答。

## 14. 源码追踪任务

请你按下面顺序打开源码，并在旁边写一句“mini agent 里对应什么”：

1. `packages/opencode/src/cli/cmd/run.ts:768-803`
2. `packages/opencode/src/session/prompt.ts:1211-1230`
3. `packages/opencode/src/session/prompt.ts:1248-1489`
4. `packages/opencode/src/session/llm.ts:39-60`
5. `packages/opencode/src/tool/tool.ts:16-45`
6. `packages/opencode/src/session/tools.ts:42-115`
7. `packages/opencode/src/tool/read.ts:29-39`
8. `packages/opencode/src/tool/edit.ts:47-69`
9. `packages/opencode/src/tool/shell.ts:260-287`
10. `packages/opencode/src/permission/index.ts:161-195`
11. `packages/opencode/src/session/processor.ts:451-500`

## 15. 面试式自测

1. 你如何解释 agent loop 和普通 chatbot 的区别？
2. Tool result 为什么必须进入 message history？
3. Tool registry 为什么比 `if toolName === ...` 更适合扩展？
4. 权限系统为什么不应该写死在 `edit_file` 里？
5. 如果 LLM provider 的 tool schema 格式不同，你会在哪一层做适配？
6. 如果用户在工具执行中途取消，mini agent 至少要清理什么状态？

## 16. 下一步阅读建议

下一步最建议做一个真实小项目：

1. 先写 fake LLM，把 loop 跑通。
2. 再接一个真实 provider，但只开放 `read_file`。
3. 再加 `edit_file` 和权限确认。
4. 最后加 `run_shell` 和测试输出截断。

配置系统本轮没有生成完整章节。如果你希望站点完全覆盖最初的功能大纲，下一章建议补 `10-config-system`，因为它会解释 agent、provider、permission、plugin 的默认值从哪里来。
