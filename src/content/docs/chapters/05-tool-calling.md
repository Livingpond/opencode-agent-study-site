---
title: "Tool 调用系统"
description: "理解 Tool 定义、注册、暴露给模型、执行、权限和结果回填的完整机制。"
sidebar:
  label: "05. Tool 调用系统"
  order: 5
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>中等</div>
  <div><strong>预计阅读</strong>45 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/05-tool-calling.md"><code>markdown/05-tool-calling.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`05-tool-calling`
- 章节摘要：理解 Tool 定义、注册、暴露给模型、执行、权限和结果回填的完整机制。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/tool/tool.ts</code></li>
<li><code>packages/opencode/src/tool/registry.ts</code></li>
<li><code>packages/opencode/src/session/tools.ts</code></li>
<li><code>packages/plugin/src/tool.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.5 Tool 调用系统”。  
> 主要源码：`packages/opencode/src/tool/tool.ts`、`packages/opencode/src/tool/registry.ts`、`packages/opencode/src/session/tools.ts`、`packages/plugin/src/tool.ts`。

## 0. 本章学习目标

你会学到：工具的统一接口是什么，内置工具和插件工具如何注册，OpenCode 如何把工具转成 AI SDK tool，工具执行上下文如何携带 session/message/permission，tool result 如何回到 processor。

## 1. 一句话讲明白

Tool 调用系统是 OpenCode 的“行动层”：模型只能提出 tool call，真正的参数校验、权限检查、执行、截断、附件补 ID、状态回写都由 runtime 完成。来源：`packages/opencode/src/tool/tool.ts:16-45`、`packages/opencode/src/session/tools.ts:24-116`。

## 2. 它在 OpenCode agent 中的位置

`SessionPrompt.runLoop` 会调用 `SessionTools.resolve` 准备工具；`LLM.stream` 把这些工具交给模型；模型产生 tool-call 后，AI SDK 调用工具的 `execute`；执行结果被 processor 写回 `ToolPart`。来源：`packages/opencode/src/session/prompt.ts:1372-1440`、`packages/opencode/src/session/tools.ts:75-116`、`packages/opencode/src/session/processor.ts:169-193`。

## 3. 生活类比

模型像项目经理，它说“我要查文件”或“我要执行命令”；工具系统像公司的工具台账和审批台：先确认工具存在、参数合法、权限允许，再派具体工具执行，最后把结果登记回工单。

## 4. Java 开发者类比

- `Tool.Def` 类似 `ToolStrategy` 接口。
- `ToolRegistry` 类似 `Map<String, ToolStrategy>` + 自动装配。
- `SessionTools.resolve` 类似 adapter，把内部 Strategy 包装成 LLM SDK 能调用的函数。
- `ctx.ask` 类似 Spring Security method interceptor。
- plugin tool 类似 SPI 扩展。

## 5. 最小源码路径

1. `packages/opencode/src/tool/tool.ts:16-45`：工具上下文、结果、定义。
2. `packages/opencode/src/tool/tool.ts:79-130`：wrap 校验参数、截断输出、加 tracing span。
3. `packages/opencode/src/tool/tool.ts:132-162`：`Tool.define` 和 `Tool.init`。
4. `packages/opencode/src/tool/registry.ts:203-224`：加载本地自定义工具和插件工具。
5. `packages/opencode/src/tool/registry.ts:229-275`：初始化内置工具列表。
6. `packages/opencode/src/tool/registry.ts:322-367`：根据模型/agent 过滤并返回工具定义。
7. `packages/opencode/src/session/tools.ts:24-116`：把内部工具包装成 AI SDK tool。
8. `packages/opencode/src/session/tools.ts:118-205`：把 MCP tools 也接入同一工具表。

## 6. 用户输入到 agent 行动的整体链路

```text
runLoop
  -> SessionTools.resolve(agent, session, model, processor)
  -> ToolRegistry.tools(model/provider/agent)
  -> ProviderTransform.schema
  -> AI SDK tool({ description, inputSchema, execute })
  -> model emits tool-call
  -> execute(args, options)
  -> Tool.Context with ask/metadata
  -> item.execute(args, ctx)
  -> tool result
  -> processor.completeToolCall
```

## 7. 核心源码逐段讲解

### 7.1 工具上下文

```ts
export type Context<M extends Metadata = Metadata> = {
  sessionID: SessionID
  messageID: MessageID
  agent: string
  abort: AbortSignal
  callID?: string
  messages: MessageV2.WithParts[]
  metadata(input: { title?: string; metadata?: M }): Effect.Effect<void>
  ask(input: Omit<Permission.Request, "id" | "sessionID" | "tool">): Effect.Effect<void>
}
```

路径：`packages/opencode/src/tool/tool.ts:16-26`

工具不只是函数，它知道当前 session、assistant message、agent、abort signal，并且能更新 metadata 和发起权限审批。

### 7.2 工具定义

```ts
export interface Def<Parameters extends Schema.Decoder<unknown>, M extends Metadata = Metadata> {
  id: string
  description: string
  parameters: Parameters
  jsonSchema?: JSONSchema7
  execute(args: Schema.Schema.Type<Parameters>, ctx: Context): Effect.Effect<ExecuteResult<M>>
}
```

路径：`packages/opencode/src/tool/tool.ts:35-45`

Java 理解：`parameters` 是运行时 schema，`execute` 是 Strategy 方法，`ExecuteResult` 是标准返回值。

### 7.3 wrap：参数校验和输出截断

```ts
const decode = Schema.decodeUnknownEffect(toolInfo.parameters)
toolInfo.execute = (args, ctx) => {
  return Effect.gen(function* () {
    const decoded = yield* decode(args).pipe(Effect.mapError(...))
    const result = yield* execute(decoded as Schema.Schema.Type<Parameters>, ctx)
    const agent = yield* agents.get(ctx.agent)
    const truncated = yield* truncate.output(result.output, {}, agent)
    return {
      ...result,
      output: truncated.content,
      metadata: {
        ...result.metadata,
        truncated: truncated.truncated,
      },
    }
  })
}
```

路径：`packages/opencode/src/tool/tool.ts:79-130`

关键点：LLM 传来的 args 是不可信 JSON，所以必须 decode；工具输出可能很长，所以统一截断。

### 7.4 Tool.define

```ts
export function define<Parameters extends Schema.Decoder<unknown>, Result extends Metadata, R, ID extends string = string>(
  id: ID,
  init: Effect.Effect<Init<Parameters, Result>, never, R>,
) {
  return Object.assign(
    Effect.gen(function* () {
      const resolved = yield* init
      const truncate = yield* Truncate.Service
      const agents = yield* Agent.Service
      return { id, init: wrap(id, resolved, truncate, agents) }
    }),
    { id },
  )
}
```

路径：`packages/opencode/src/tool/tool.ts:132-150`

这是工具定义 helper，既返回 Effect，又把 `id` 作为属性挂上去。TS 这里比 Java 更偏函数组合。

### 7.5 ToolRegistry 初始化工具

```ts
const tool = yield* Effect.all({
  invalid: Tool.init(invalid),
  shell: Tool.init(shell),
  read: Tool.init(read),
  glob: Tool.init(globtool),
  grep: Tool.init(greptool),
  edit: Tool.init(edit),
  write: Tool.init(writetool),
  task: Tool.init(task),
  fetch: Tool.init(webfetch),
  todo: Tool.init(todo),
  search: Tool.init(websearch),
  skill: Tool.init(skilltool),
  patch: Tool.init(patchtool),
  lsp: Tool.init(lsptool),
  plan: Tool.init(plan),
})
```

路径：`packages/opencode/src/tool/registry.ts:229-249`

内置工具不是写死在 LLM prompt 里，而是统一初始化成 `Tool.Def`。

### 7.6 自定义和插件工具

```ts
const matches = dirs.flatMap((dir) =>
  Glob.scanSync("{tool,tools}/*.{js,ts}", { cwd: dir, absolute: true, dot: true, symlink: true }),
)
const mod = yield* Effect.promise(() => import(pathToFileURL(match).href))
for (const [id, def] of Object.entries(mod)) {
  if (!isPluginTool(def)) continue
  custom.push(fromPlugin(id === "default" ? namespace : `${namespace}_${id}`, def))
}

const plugins = yield* plugin.list()
for (const p of plugins) {
  for (const [id, def] of Object.entries(p.tool ?? {})) {
    custom.push(fromPlugin(id, def))
  }
}
```

路径：`packages/opencode/src/tool/registry.ts:203-224`

这说明 tool 系统有两个扩展入口：项目/配置目录下的 tool 文件，以及 plugin hook 提供的 tool。

### 7.7 按模型过滤工具

```ts
const usePatch =
  input.modelID.includes("gpt-") && !input.modelID.includes("oss") && !input.modelID.includes("gpt-4")
if (tool.id === ApplyPatchTool.id) return usePatch
if (tool.id === EditTool.id || tool.id === WriteTool.id) return !usePatch
```

路径：`packages/opencode/src/tool/registry.ts:328-332`

同一个 agent 在不同模型下可用工具可能不同。这里 GPT 系列部分模型用 patch tool 替代 edit/write。

### 7.8 SessionTools.resolve 包装成 AI SDK tool

```ts
const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))
tools[item.id] = tool({
  description: item.description,
  inputSchema: jsonSchema(schema),
  execute(args, options) {
    return run.promise(
      Effect.gen(function* () {
        const ctx = context(args, options)
        yield* plugin.trigger("tool.execute.before", { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID }, { args })
        const result = yield* item.execute(args, ctx)
        const output = {
          ...result,
          attachments: result.attachments?.map((attachment) => ({
            ...attachment,
            id: PartID.ascending(),
            sessionID: ctx.sessionID,
            messageID: input.processor.message.id,
          })),
        }
        yield* plugin.trigger("tool.execute.after", { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args }, output)
        return output
      }),
    )
  },
})
```

路径：`packages/opencode/src/session/tools.ts:75-116`

这就是模型 tool call 到真实执行的桥。

### 7.9 权限上下文

```ts
ask: (req) =>
  permission.ask({
    ...req,
    sessionID: input.session.id,
    tool: { messageID: input.processor.message.id, callID: options.toolCallId },
    ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
  })
```

路径：`packages/opencode/src/session/tools.ts:64-72`

工具自己只说“我要 read/edit/shell”，最终规则来自 agent permission + session permission。

### 7.10 MCP tools

MCP tool 也被包装进同一个 `tools` 对象，并且执行前强制 `ctx.ask({ permission: key, ... })`。来源：`packages/opencode/src/session/tools.ts:118-205`。

## 8. 关键 TypeScript 语法复习

- 泛型接口：`Def<Parameters extends Schema.Decoder<unknown>, M extends Metadata>`。来源：`tool.ts:35-45`。
- 条件类型：`InferParameters<T>`。来源：`tool.ts:63-68`。
- `Omit`：`ask(input: Omit<Permission.Request, ...>)`。来源：`tool.ts:24-25`。
- `Record<string, AITool>`：工具名到工具对象。来源：`session/tools.ts:34`。
- dynamic import：加载自定义工具文件。来源：`registry.ts:203-215`。
- object spread：补附件 id/sessionID/messageID。来源：`session/tools.ts:93-102`。
- function property：plugin tool 的 `execute(args, context)`。来源：`packages/plugin/src/tool.ts:45-50`。

## 9. 涉及的设计模式和架构思想

- Strategy：每个 tool 是可替换策略。
- Registry：`ToolRegistry` 统一发现和筛选。
- Adapter：`SessionTools.resolve` 把内部 tool 转 AI SDK tool。
- Interceptor：`tool.execute.before/after` 和 `ctx.ask`。
- SPI/Plugin：`packages/plugin/src/tool.ts` 暴露轻量插件 API。
- Runtime validation：schema decode 保护工具边界。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- Provider：`ProviderTransform.schema` 会按模型/provider 调整工具 schema。来源：`session/tools.ts:80`。
- Session：Tool.Context 带 `sessionID` 和 assistant `messageID`。来源：`session/tools.ts:42-49`。
- Processor：工具 metadata 和 complete 会调用 processor handle。来源：`session/tools.ts:50-63`、`session/tools.ts:108-110`。
- 文件系统：具体 read/edit/write/shell 工具里操作文件或进程，本章只讲工具总线。

## 11. 如果自己实现 mini agent，这一章对应什么代码

```ts
type ToolDef<Args> = {
  name: string
  description: string
  schema: unknown
  execute(args: Args, ctx: ToolContext): Promise<ToolResult>
}

function resolveTools(registry: ToolDef<any>[], ctxBase: ToolContextBase) {
  const tools: Record<string, unknown> = {}
  for (const item of registry) {
    tools[item.name] = {
      description: item.description,
      inputSchema: item.schema,
      async execute(args: unknown, options: { toolCallId: string }) {
        const ctx = makeToolContext(ctxBase, options)
        await ctx.ask({ permission: item.name, patterns: ["*"] })
        return item.execute(args as never, ctx)
      },
    }
  }
  return tools
}
```

## 12. 费曼复述区

请复述：

1. ToolRegistry 和 SessionTools.resolve 的职责差异是什么？
2. 为什么工具参数必须运行时 decode？
3. 为什么工具执行上下文里要有 `ask` 和 `metadata`？

换一种说法：ToolRegistry 管“有哪些工具”，SessionTools.resolve 管“这一轮模型怎么调用这些工具”。

## 13. 练习题

### 入门题

1. 找到 `Tool.Context`，列出它包含哪些上下文字段。
2. 找到内置工具列表，数出默认有哪些工具。
3. 找到 `tool.execute.before` 和 `tool.execute.after`。

### 进阶题

1. 解释 patch/edit/write 的模型过滤规则。
2. 解释 MCP tool 和内置 tool 的包装差异。
3. 解释截断为什么放在 `Tool.wrap` 层。

### 小实现题

实现一个 `echo` tool，参数 `{ text: string }`，执行前调用 `ctx.metadata({ title: "Echo" })`，返回同样文本。

## 14. 源码追踪任务

1. 从 `SessionPrompt.runLoop` 追到 `SessionTools.resolve`。
2. 从 `SessionTools.resolve` 追到 `ToolRegistry.tools`。
3. 从 `ToolRegistry.tools` 追到 `Tool.init(read)`。
4. 从 `Tool.define` 追到 `wrap`。
5. 从 plugin tool API 追到 `fromPlugin`。

## 15. 面试式自测

1. Tool 系统为什么要分 Def、Info、Registry、SessionTools 四层？
2. 如果模型传了错误参数，哪一层负责报错？
3. 如果 tool output 太长，哪一层负责截断？
4. 如果一个 tool 要访问外部目录，权限在哪里触发？
5. 如何让第三方插件增加一个 tool？

## 16. 下一步阅读建议

下一章读 “文件读写与代码修改”。它是 Tool 系统的最典型落地：路径解析、diff、权限、写文件、格式化、LSP 诊断都会出现。


