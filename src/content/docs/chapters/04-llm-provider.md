---
title: "模型 Provider / LLM 调用"
description: "理解内部消息、system prompt、工具 schema 如何被转换成不同 provider 的模型请求。"
sidebar:
  label: "04. 模型 Provider / LLM 调用"
  order: 4
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>较难</div>
  <div><strong>预计阅读</strong>50 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/04-llm-provider.md"><code>markdown/04-llm-provider.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`04-llm-provider`
- 章节摘要：理解内部消息、system prompt、工具 schema 如何被转换成不同 provider 的模型请求。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/session/llm.ts</code></li>
<li><code>packages/opencode/src/session/llm/ai-sdk.ts</code></li>
<li><code>packages/opencode/src/session/llm/native-runtime.ts</code></li>
<li><code>packages/opencode/src/provider/provider.ts</code></li>
<li><code>packages/opencode/src/provider/transform.ts</code></li>
<li><code>packages/llm/src/protocols/index.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.4 模型 Provider / LLM 调用”。  
> 主要源码：`packages/opencode/src/session/llm.ts`、`packages/opencode/src/session/llm/ai-sdk.ts`、`packages/opencode/src/session/llm/native-runtime.ts`、`packages/opencode/src/provider/provider.ts`、`packages/opencode/src/provider/transform.ts`、`packages/llm/src/protocols/index.ts`。

## 0. 本章学习目标

这一章要看清楚 agent loop 和真实模型 API 之间的“网关层”。

学完你应该能说清：

- `LLM.stream` 的输入里有哪些东西：user、session、model、agent、system、messages、tools。
- OpenCode 如何把 agent/system/user prompt 合并成最终 system prompt。
- Provider service 如何把 `Provider.Model` 解析成 AI SDK `LanguageModelV3`。
- `streamText` 如何拿到 messages、tools、toolChoice、headers、providerOptions。
- AI SDK 的 stream event 如何被转成 OpenCode 自己的 `LLMEvent`。
- 为什么需要 `ProviderTransform.message` 这种 provider 兼容层。

## 1. 一句话讲明白

模型 Provider / LLM 调用层是 OpenCode 的“网关适配层”：上游接收 agent loop 准备好的消息、工具、模型和权限；中间按 provider/model 合并 system prompt、参数、headers 和 schema；下游调用 AI SDK 或 native runtime 的流式接口；最后把 provider 的事件转成 OpenCode 统一的 `LLMEvent`，交给 processor 写回 session。来源：`packages/opencode/src/session/llm.ts:39-60`、`packages/opencode/src/session/llm.ts:99-188`、`packages/opencode/src/session/llm.ts:402-493`、`packages/opencode/src/session/llm/ai-sdk.ts:61-236`。

## 2. 它在 OpenCode agent 中的位置

这一层位于 `SessionPrompt.runLoop` 和各家模型 API 之间：

```text
runLoop
  -> build ModelMessage[]
  -> SessionTools.resolve(...)
  -> LLM.stream({
       user, sessionID, model, agent,
       system, messages, tools, toolChoice
     })
  -> Provider.getLanguage(model)
  -> ProviderTransform.message(...)
  -> streamText(...) or LLMNativeRuntime.stream(...)
  -> LLMAISDK.toLLMEvents(...)
  -> SessionProcessor.process(...)
```

关键判断：

- `LLM.StreamInput` 明确了 agent loop 传入 LLM 层的数据合同。来源：`packages/opencode/src/session/llm.ts:39-52`。
- `Provider.Interface` 暴露 `getProvider`、`getModel`、`getLanguage`，说明 provider 层负责模型解析和 SDK language model 获取。来源：`packages/opencode/src/provider/provider.ts:989-1000`。
- `ProviderTransform.message` 说明 OpenCode 不把内部消息直接丢给所有 provider，而是按 provider 能力做转换。来源：`packages/opencode/src/provider/transform.ts:429-474`。

## 3. 生活类比

把这一层想成国际会议的同声传译和会务系统。

Agent loop 准备的是“会议内容”：议题、上下文、可用工具、参会专家。Provider 层负责找到具体会议室和翻译设备：OpenAI、Anthropic、Gemini、Bedrock、OpenRouter 等。不同会议室对发言格式要求不同：有人不接受空消息，有人要求 tool_result 紧跟 tool_use，有人支持图片，有人不支持 PDF。`ProviderTransform` 就是在入场前把材料整理成对方能接受的格式。

## 4. Java 开发者类比

如果用 Java/Spring 来类比：

- `LLM.Service` 像 `LlmGateway` 接口。
- `LLM.stream` 像返回 `Flux<LlmEvent>` 的 gateway 方法。
- `Provider.Service` 像 `ProviderRegistry + ClientFactory`。
- `ProviderTransform` 像一组 `HttpMessageConverter` 或 provider-specific request interceptor。
- `LLMAISDK.toLLMEvents` 像把第三方 SDK callback 转成内部领域事件。
- `Plugin.trigger("chat.params")` 和 `Plugin.trigger("chat.headers")` 像请求拦截器链。

Java 伪代码：

```java
Flux<LlmEvent> stream(StreamInput input) {
    ProviderInfo provider = providerRegistry.getProvider(input.model.providerId());
    LanguageModel client = providerClientFactory.getLanguage(input.model());
    List<ModelMessage> messages = providerTransform.message(input.messages(), input.model());
    Map<String, Tool> tools = permissionFilter.resolveTools(input.tools(), input.agent());
    return client.stream(messages, tools, requestOptions(input))
                 .flatMap(aiSdkAdapter::toLlmEvents);
}
```

OpenCode 的实现不是 class hierarchy，而是 Effect service + 函数组合。核心服务定义在 `packages/opencode/src/session/llm.ts:58-62`。

## 5. 最小源码路径

建议按这个顺序读：

1. `packages/opencode/src/session/llm.ts:39-60`：`StreamInput` 和 LLM service interface。
2. `packages/opencode/src/session/llm.ts:99-107`：并发取 language model、config、provider、auth。
3. `packages/opencode/src/session/llm.ts:112-168`：拼 system prompt 和 messages。
4. `packages/opencode/src/session/llm.ts:170-204`：插件改写参数、headers，并解析 tools。
5. `packages/opencode/src/session/llm.ts:204-225`、`packages/opencode/src/session/llm.ts:512-518`：按权限和用户设置过滤 tools。
6. `packages/opencode/src/session/llm.ts:330-350`：构造 request headers。
7. `packages/opencode/src/session/llm.ts:352-392`：尝试 native runtime，否则回退 AI SDK。
8. `packages/opencode/src/session/llm.ts:402-467`：调用 `streamText`。
9. `packages/opencode/src/session/llm.ts:471-493`：把 AI SDK fullStream 转成 Effect stream。
10. `packages/opencode/src/session/llm/ai-sdk.ts:61-236`：把 AI SDK event 转成 `LLMEvent`。
11. `packages/opencode/src/provider/provider.ts:1508-1649`：provider SDK 动态加载和缓存。
12. `packages/opencode/src/provider/transform.ts:429-474`：消息兼容转换入口。

## 6. 用户输入到 agent 行动的整体链路

### 6.1 runLoop 准备 LLM.stream 输入

在 agent 核心循环里，OpenCode 会把 session messages 转换成 AI SDK 的 `ModelMessage[]`，同时准备 tools。到了 LLM 层，输入类型是：

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
```

路径：`packages/opencode/src/session/llm.ts:39-52`

这里最重要的是 `tools: Record<string, Tool>` 和 `messages: ModelMessage[]`。模型 provider 层并不关心 session 存储细节，只关心“给模型的消息”和“模型可调用的工具”。

### 6.2 并发解析 provider、model client、配置和认证

```ts
const [language, cfg, item, info] = yield* Effect.all(
  [
    provider.getLanguage(input.model),
    config.get(),
    provider.getProvider(input.model.providerID),
    auth.get(input.model.providerID),
  ],
  { concurrency: "unbounded" },
)
```

路径：`packages/opencode/src/session/llm.ts:99-107`

Java 类比：`CompletableFuture.allOf(getLanguage, getConfig, getProvider, getAuth)`。`language` 是真正会传给 AI SDK 的 language model；`item` 是 provider 配置；`info` 是认证信息。

### 6.3 拼 system prompt

```ts
const system: string[] = []
system.push(
  [
    ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
    ...input.system,
    ...(input.user.system ? [input.user.system] : []),
  ]
    .filter((x) => x)
    .join("\n"),
)
```

路径：`packages/opencode/src/session/llm.ts:112-124`

优先级可以这样理解：

1. 如果 agent 自己有 prompt，用 agent prompt。
2. 否则用 provider/model 对应的默认 system prompt。
3. 加上本次调用传入的 system。
4. 加上最后 user message 里带的 custom system。

然后插件还能修改 system：

```ts
yield* plugin.trigger(
  "experimental.chat.system.transform",
  { sessionID: input.sessionID, model: input.model },
  { system },
)
```

路径：`packages/opencode/src/session/llm.ts:126-131`

### 6.4 拼请求参数和 headers

```ts
const params = yield* plugin.trigger(
  "chat.params",
  {
    sessionID: input.sessionID,
    agent: input.agent.name,
    model: input.model,
    provider: item,
    message: input.user,
  },
  {
    temperature: input.model.capabilities.temperature
      ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
      : undefined,
    topP: input.agent.topP ?? ProviderTransform.topP(input.model),
    topK: ProviderTransform.topK(input.model),
    maxOutputTokens: ProviderTransform.maxOutputTokens(input.model, flags.outputTokenMax),
    options,
  },
)
```

路径：`packages/opencode/src/session/llm.ts:170-188`

`chat.params` 是一个扩展点：插件可以修改 temperature、topP、maxOutputTokens 和 provider options。

headers 也有 hook：

```ts
const { headers } = yield* plugin.trigger(
  "chat.headers",
  {
    sessionID: input.sessionID,
    agent: input.agent.name,
    model: input.model,
    provider: item,
    message: input.user,
  },
  {
    headers: {},
  },
)
```

路径：`packages/opencode/src/session/llm.ts:190-202`

### 6.5 过滤 tools

```ts
function resolveTools(input: Pick<StreamInput, "tools" | "agent" | "permission" | "user">) {
  const disabled = Permission.disabled(
    Object.keys(input.tools),
    Permission.merge(input.agent.permission, input.permission ?? []),
  )
  return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k))
}
```

路径：`packages/opencode/src/session/llm.ts:512-518`

这一步很重要：即使 `SessionTools.resolve` 准备了工具，到了 LLM 调用前仍会根据 agent permission、session permission、user message 里的 tools 开关过滤一次。

### 6.6 调用 AI SDK streamText

```ts
return {
  type: "ai-sdk" as const,
  result: streamText({
    onError(error) {
      l.error("stream error", { error })
    },
    async experimental_repairToolCall(failed) {
      const lower = failed.toolCall.toolName.toLowerCase()
      if (lower !== failed.toolCall.toolName && sortedTools[lower]) {
        return { ...failed.toolCall, toolName: lower }
      }
      return {
        ...failed.toolCall,
        input: JSON.stringify({
          tool: failed.toolCall.toolName,
          error: failed.error.message,
        }),
        toolName: "invalid",
      }
    },
    temperature: params.temperature,
    topP: params.topP,
    topK: params.topK,
    providerOptions: ProviderTransform.providerOptions(input.model, params.options),
    activeTools: Object.keys(sortedTools).filter((x) => x !== "invalid"),
    tools: sortedTools,
    toolChoice: input.toolChoice,
    maxOutputTokens: params.maxOutputTokens,
    abortSignal: input.abort,
    headers: requestHeaders,
    maxRetries: input.retries ?? 0,
    messages,
    model: wrapLanguageModel({
      model: language,
      middleware: [
        {
          specificationVersion: "v3" as const,
          async transformParams(args) {
            if (args.type === "stream") {
              args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)
            }
            return args.params
          },
        },
      ],
    }),
  }),
}
```

路径：`packages/opencode/src/session/llm.ts:402-467`

重点看四件事：

- `tools` 和 `activeTools` 决定模型可见的工具。
- `experimental_repairToolCall` 尝试修复大小写不匹配的 tool name；修不了就转给 `invalid` tool。
- `wrapLanguageModel(... middleware ...)` 在 stream 前调用 `ProviderTransform.message`。
- `abortSignal` 把 agent 的取消能力传到模型请求。

### 6.7 把 AI SDK fullStream 转成 OpenCode LLMEvent

```ts
const state = LLMAISDK.adapterState()
return Stream.fromAsyncIterable(result.result.fullStream, (e) =>
  e instanceof Error ? e : new Error(String(e)),
).pipe(
  Stream.mapEffect((event) => LLMAISDK.toLLMEvents(state, event)),
  Stream.flatMap((events) => Stream.fromIterable(events)),
)
```

路径：`packages/opencode/src/session/llm.ts:484-490`

这一步把第三方 SDK 事件流变成 OpenCode 内部统一事件流。Processor 后面只需要处理 `LLMEvent`，不需要直接理解 AI SDK 的 fullStream 事件。

## 7. 核心源码逐段讲解

### 7.1 LLM Service 的数据合同

```ts
export interface Interface {
  readonly stream: (input: StreamInput) => Stream.Stream<LLMEvent, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}
```

路径：`packages/opencode/src/session/llm.ts:58-62`

这就是 LLM 层对外暴露的能力：传入 `StreamInput`，得到 `Stream<LLMEvent>`。它不是返回一个完整字符串，而是返回事件流。

### 7.2 Provider service 是 ClientFactory

```ts
export interface Interface {
  readonly list: () => Effect.Effect<Record<ProviderID, Info>>
  readonly getProvider: (providerID: ProviderID) => Effect.Effect<Info>
  readonly getModel: (providerID: ProviderID, modelID: ModelID) => Effect.Effect<Model, ModelNotFoundError>
  readonly getLanguage: (model: Model) => Effect.Effect<LanguageModelV3, ModelNotFoundError>
  readonly closest: (
    providerID: ProviderID,
    query: string[],
  ) => Effect.Effect<{ providerID: ProviderID; modelID: string } | undefined>
  readonly getSmallModel: (providerID: ProviderID) => Effect.Effect<Model | undefined>
  readonly defaultModel: () => Effect.Effect<{ providerID: ProviderID; modelID: ModelID }>
}
```

路径：`packages/opencode/src/provider/provider.ts:989-1000`

Provider 层的关键不是“发请求”，而是管理 provider/model catalog、model lookup、SDK 加载、默认模型和模糊建议。

### 7.3 resolveSDK：动态加载 provider SDK

```ts
async function resolveSDK(model: Model, s: State, envs: Record<string, string | undefined>) {
  const provider = s.providers[model.providerID]
  const options = { ...provider.options }

  const baseURL = iife(() => {
    let url =
      typeof options["baseURL"] === "string" && options["baseURL"] !== "" ? options["baseURL"] : model.api.url
    if (!url) return
    const loader = s.varsLoaders[model.providerID]
    if (loader) {
      const vars = loader(options)
      for (const [key, value] of Object.entries(vars)) {
        const field = "${" + key + "}"
        url = url.replaceAll(field, value)
      }
    }
    url = url.replace(/\$\{([^}]+)\}/g, (item, key) => {
      const val = envs[String(key)]
      return val ?? item
    })
    return url
  })
```

路径：`packages/opencode/src/provider/provider.ts:1508-1543`

这段说明 provider 的 baseURL 可以来自 provider options、model api url、custom vars loader 和环境变量替换。

缓存和加载 SDK：

```ts
const key = Hash.fast(
  JSON.stringify({
    providerID: model.providerID,
    npm: model.api.npm,
    options,
  }),
)
const existing = s.sdk.get(key)
if (existing) return existing

const bundledLoader = BUNDLED_PROVIDERS[model.api.npm]
if (bundledLoader) {
  const factory = await bundledLoader()
  const loaded = factory({
    name: model.providerID,
    ...options,
  })
  s.sdk.set(key, loaded)
  return loaded as SDK
}
```

路径：`packages/opencode/src/provider/provider.ts:1553-1622`

如果不是 bundled provider，就安装/导入 npm 包：

```ts
let installedPath: string
if (!model.api.npm.startsWith("file://")) {
  const item = await Npm.add(model.api.npm)
  if (!item.entrypoint) throw new Error(`Package ${model.api.npm} has no import entrypoint`)
  installedPath = item.entrypoint
} else {
  installedPath = model.api.npm
}

const importSpec = installedPath.startsWith("file://") ? installedPath : pathToFileURL(installedPath).href
const mod = await import(importSpec)

const fn = mod[Object.keys(mod).find((key) => key.startsWith("create"))!]
const loaded = fn({
  name: model.providerID,
  ...options,
})
```

路径：`packages/opencode/src/provider/provider.ts:1624-1645`

Java 类比：这像一个运行时 `ServiceLoader` + Maven artifact resolver + client factory。TS 的 `await import(importSpec)` 是动态加载模块。

### 7.4 getLanguage：缓存 language model

```ts
const getLanguage = Effect.fn("Provider.getLanguage")(function* (model: Model) {
  const s = yield* InstanceState.get(state)
  const envs = yield* env.all()
  const key = `${model.providerID}/${model.id}`
  if (s.models.has(key)) return s.models.get(key)!

  const provider = s.providers[model.providerID]
  return yield* EffectPromise.refineRejection(
    async () => {
      const sdk = await resolveSDK(model, s, envs)
      const language = s.modelLoaders[model.providerID]
        ? await s.modelLoaders[model.providerID](sdk, model.api.id, {
            ...provider.options,
            ...model.options,
          })
        : sdk.languageModel(model.api.id)
      s.models.set(key, language)
      return language
    },
    ...
  )
})
```

路径：`packages/opencode/src/provider/provider.ts:1679-1703`

这说明同一个 provider/model 的 language model 会缓存，避免每次请求都重新创建 SDK client。

### 7.5 ProviderTransform.message：兼容层入口

```ts
export function message(msgs: ModelMessage[], model: Provider.Model, options: Record<string, unknown>) {
  msgs = unsupportedParts(msgs, model)
  msgs = normalizeMessages(msgs, model, options)
  if (
    (model.providerID === "anthropic" ||
      model.providerID === "google-vertex-anthropic" ||
      model.api.id.includes("anthropic") ||
      model.api.id.includes("claude") ||
      model.id.includes("anthropic") ||
      model.id.includes("claude") ||
      model.api.npm === "@ai-sdk/anthropic" ||
      model.api.npm === "@ai-sdk/alibaba") &&
    model.api.npm !== "@ai-sdk/gateway"
  ) {
    msgs = applyCaching(msgs, model)
  }

  const key = sdkKey(model.api.npm)
  if (key && key !== model.providerID) {
    ...
  }

  return msgs
}
```

路径：`packages/opencode/src/provider/transform.ts:429-474`

这段告诉我们：ProviderTransform 先处理不支持的多模态 part，再规范化消息，再对 Anthropic/Claude 类模型加 cache control，最后重映射 providerOptions key。

### 7.6 为什么 normalizeMessages 很复杂

```ts
// Anthropic rejects messages with empty content - filter out empty string messages
if (model.api.npm === "@ai-sdk/anthropic") {
  msgs = msgs
    .map((msg) => {
      if (typeof msg.content === "string") {
        if (msg.content === "") return undefined
        return msg
      }
      ...
    })
    .filter((msg): msg is ModelMessage => msg !== undefined && msg.content !== "")
}
```

路径：`packages/opencode/src/provider/transform.ts:125-152`

还有 Claude tool id 清洗：

```ts
if (model.api.id.includes("claude")) {
  const scrub = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_")
  msgs = msgs.map((msg) => {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((part) => {
          if (part.type === "tool-call" || part.type === "tool-result") {
            return { ...part, toolCallId: scrub(part.toolCallId) }
          }
          return part
        }),
      }
    }
    ...
  })
}
```

路径：`packages/opencode/src/provider/transform.ts:182-209`

这不是“业务逻辑”，而是真实 provider API 的兼容性成本。coding agent 的 LLM 层一定会积累这种适配代码。

### 7.7 LLMAISDK adapter：事件翻译

```ts
export function adapterState() {
  return {
    step: 0,
    text: 0,
    reasoning: 0,
    currentTextID: undefined as string | undefined,
    currentReasoningID: undefined as string | undefined,
    toolNames: {} as Record<string, string>,
  }
}
```

路径：`packages/opencode/src/session/llm/ai-sdk.ts:9-18`

`adapterState` 用来记住当前 text/reasoning block id 和 toolCallId -> toolName 映射。

文本事件：

```ts
case "text-delta":
  return Effect.succeed([
    LLMEvent.textDelta({
      id: currentTextID(state, event.id),
      text: event.text,
      providerMetadata: providerMetadata(event.providerMetadata),
    }),
  ])
```

路径：`packages/opencode/src/session/llm/ai-sdk.ts:108-115`

工具事件：

```ts
case "tool-call":
  return Effect.sync(() => {
    state.toolNames[event.toolCallId] = event.toolName
    return [
      LLMEvent.toolCall({
        id: event.toolCallId,
        name: event.toolName,
        input: event.input,
        providerExecuted: "providerExecuted" in event ? event.providerExecuted : undefined,
        providerMetadata: providerMetadata(event.providerMetadata),
      }),
    ]
  })
```

路径：`packages/opencode/src/session/llm/ai-sdk.ts:191-203`

工具结果事件：

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
        providerExecuted: "providerExecuted" in event ? event.providerExecuted : undefined,
        providerMetadata: providerMetadata(event.providerMetadata),
      }),
    ]
  })
```

路径：`packages/opencode/src/session/llm/ai-sdk.ts:205-218`

### 7.8 native runtime 分支

```ts
if (flags.experimentalNativeLlm) {
  const native = LLMNativeRuntime.stream({
    model: input.model,
    provider: item,
    auth: info,
    llmClient,
    isOpenaiOauth,
    system,
    messages,
    tools: sortedTools,
    toolChoice: input.toolChoice,
    temperature: params.temperature,
    topP: params.topP,
    topK: params.topK,
    maxOutputTokens: params.maxOutputTokens,
    providerOptions: params.options,
    headers: requestHeaders,
    abort: input.abort,
  })
  if (native.type === "supported") {
    return {
      type: "native" as const,
      stream: native.stream,
    }
  }
}
```

路径：`packages/opencode/src/session/llm.ts:352-383`

native runtime 不是默认替代所有 provider，它先判断是否支持。`LLMNativeRuntime.status` 目前只支持 openai/opencode/anthropic 且 provider package 是 OpenAI 或 Anthropic，并且不支持 OAuth。来源：`packages/opencode/src/session/llm/native-runtime.ts:39-56`。

## 8. 关键 TypeScript 语法复习

### Pick

```ts
function resolveTools(input: Pick<StreamInput, "tools" | "agent" | "permission" | "user">) {
```

路径：`packages/opencode/src/session/llm.ts:512`

`Pick` 从大类型里挑出需要的字段。Java 没有内置等价物，通常会建一个小 DTO。这里表示 `resolveTools` 不应该依赖完整 `StreamInput`。

### Record

```ts
tools: Record<string, Tool>
```

路径：`packages/opencode/src/session/llm.ts:49`

Java 类比：`Map<String, Tool>`。

### union literal

```ts
toolChoice?: "auto" | "required" | "none"
```

路径：`packages/opencode/src/session/llm.ts:51`

Java 类比 enum：`ToolChoice.AUTO / REQUIRED / NONE`，但 TS 可以直接用字符串字面量 union。

### optional property

```ts
parentSessionID?: string
small?: boolean
retries?: number
```

路径：`packages/opencode/src/session/llm.ts:42-50`

`?` 表示属性可能是 `undefined`。Java 类比 nullable field 或 `Optional`，但 TS 运行时没有自动检查。

### spread 和条件数组

```ts
[
  ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
  ...input.system,
  ...(input.user.system ? [input.user.system] : []),
]
```

路径：`packages/opencode/src/session/llm.ts:115-120`

这是常见 TS/JS 写法：用 spread 把数组拼起来，用三元表达式决定加不加元素。

### dynamic import

```ts
const mod = await import(importSpec)
const fn = mod[Object.keys(mod).find((key) => key.startsWith("create"))!]
```

路径：`packages/opencode/src/provider/provider.ts:1636-1640`

`!` 是 non-null assertion，告诉 TS “这里我确信不为 undefined”。Java 类比强行跳过空检查，风险是运行时如果找不到 create 函数会报错。

### `as const`

```ts
return {
  type: "ai-sdk" as const,
  result: streamText({ ... }),
}
```

路径：`packages/opencode/src/session/llm.ts:402-405`

`as const` 把 `type` 收窄为字面量 `"ai-sdk"`，便于后面 `if (result.type === "native")` 做类型收窄。

### `Effect.all`

```ts
const [language, cfg, item, info] = yield* Effect.all([...], { concurrency: "unbounded" })
```

路径：`packages/opencode/src/session/llm.ts:99-107`

Java 类比 `CompletableFuture.allOf`，但 Effect 同时管理错误类型、依赖环境和中断。

## 9. 涉及的设计模式和架构思想

- **Gateway**：`LLM.Service` 是 agent loop 到模型世界的统一出口。
- **Adapter**：`LLMAISDK.toLLMEvents` 把 AI SDK event 转成内部事件。
- **Factory + cache**：`Provider.getLanguage` 和 `resolveSDK` 创建并缓存 provider client。
- **Interceptor/hook**：`chat.params`、`chat.headers`、`experimental.chat.system.transform` 允许插件改写请求。
- **Compatibility layer**：`ProviderTransform.message` 是多 provider 支持的关键。
- **Strategy**：native runtime 和 AI SDK runtime 两条分支按能力选择。
- **Policy filter**：`resolveTools` 在 LLM 调用前按权限关闭工具。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：LLM 层拿到的是 `tools: Record<string, Tool>`，并传给 `streamText` 的 `tools` 字段。来源：`packages/opencode/src/session/llm.ts:204-225`、`packages/opencode/src/session/llm.ts:431-437`。
- 和 Provider：`provider.getLanguage(input.model)` 负责获取 AI SDK language model。来源：`packages/opencode/src/session/llm.ts:99-107`、`packages/opencode/src/provider/provider.ts:1679-1703`。
- 和 Session：`sessionID`、`parentSessionID` 被写进 headers 和 telemetry metadata，用来关联请求。来源：`packages/opencode/src/session/llm.ts:334-350`、`packages/opencode/src/session/llm.ts:458-466`。
- 和权限：`resolveTools` 合并 agent/session permission，过滤 disabled tools。来源：`packages/opencode/src/session/llm.ts:512-518`。
- 和文件系统：本章的 LLM 层不直接读写文件；文件系统能力通过 tools 暴露给模型，例如 read/edit/write/shell。这个判断来自 `StreamInput.tools` 和 `streamText({ tools })`，不是来自文件工具源码。来源：`packages/opencode/src/session/llm.ts:49`、`packages/opencode/src/session/llm.ts:431-437`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

mini agent 的 LLM gateway 可以先做成这样：

```ts
type LlmGatewayInput = {
  model: string
  system: string
  messages: Array<{ role: "user" | "assistant" | "tool"; content: unknown }>
  tools: Record<string, {
    description: string
    inputSchema: unknown
    execute(args: unknown): Promise<unknown>
  }>
  signal: AbortSignal
}

async function* streamLlm(input: LlmGatewayInput) {
  const client = await providerRegistry.getClient(input.model)
  const request = providerTransform.toRequest(input)
  for await (const event of client.stream(request, { signal: input.signal })) {
    yield aiSdkAdapter.toInternalEvent(event)
  }
}
```

实现顺序：

1. 先只支持一个 provider，比如 OpenAI-compatible。
2. 定义内部 `LlmEvent`：`textDelta`、`toolCall`、`toolResult`、`finish`。
3. 把工具 schema 传给模型。
4. 适配模型 stream event 到内部事件。
5. 加 `AbortSignal`。
6. 再做 provider-specific transform。

## 12. 费曼复述区

请你不看源码复述：

1. `LLM.stream` 输入里为什么要同时有 `agent`、`model`、`user` 和 `tools`？
2. `Provider.getLanguage` 解决什么问题？为什么不在 runLoop 里直接 new client？
3. `ProviderTransform.message` 为什么是 agent 项目长期维护成本最高的地方之一？
4. AI SDK 的 `fullStream` 为什么要转成 OpenCode 自己的 `LLMEvent`？
5. `resolveTools` 为什么放在 LLM 层再过滤一次？

如果解释不出来，通常卡在：

- 把 Provider 当成“配置文件读取”，没有意识到它还负责动态加载和缓存 SDK。
- 把 `streamText` 当成一次普通 HTTP 请求，没有看到它承载 tool calling 和事件流。
- 没有区分“内部 message history”和“provider API 能接受的 messages”。

换一种说法：LLM 层就是 agent 的“外交部”：同一份内部任务，要翻译成不同国家能接受的格式，还要把对方的回信翻译回国内统一事件。

## 13. 练习题

### 入门题

1. 找到 `StreamInput`，把每个字段按“session 相关 / model 相关 / prompt 相关 / tool 相关 / 控制相关”分组。
2. 找到 `Provider.Interface`，解释 `getModel` 和 `getLanguage` 的区别。
3. 找到 `LLMAISDK.adapterState`，说明为什么要记录 `toolNames`。

### 进阶题

1. 阅读 `ProviderTransform.message`，列出它对消息做了哪几类转换。
2. 阅读 `resolveSDK`，解释 bundled provider 和动态 npm provider 的差异。
3. 阅读 `streamText` 调用，说明 `activeTools` 和 `tools` 的区别。

### 源码追踪题

1. 从 `SessionPrompt.runLoop` 追到 `LLM.stream`。
2. 从 `LLM.stream` 追到 `provider.getLanguage`。
3. 从 `streamText.fullStream` 追到 `LLMAISDK.toLLMEvents`。
4. 从 `tool-call` event 追到 `SessionProcessor` 如何创建/更新 tool part。

### 小实现题

实现一个 mini LLM adapter：

- 输入内部 messages 和 tools。
- 调用一个模拟 provider stream。
- 把 provider event `{ type: "delta", text }` 转成 `{ type: "text-delta", text }`。
- 把 provider event `{ type: "tool_call", id, name, args }` 转成 `{ type: "tool-call", id, name, input }`。
- 支持 abort signal。

## 14. 源码追踪任务

建议开四个窗口：

1. `packages/opencode/src/session/prompt.ts`：看 runLoop 给 `LLM.stream` 传了什么。
2. `packages/opencode/src/session/llm.ts`：看 system、params、headers、tools、runtime selection。
3. `packages/opencode/src/provider/provider.ts`：看 provider SDK 如何加载。
4. `packages/opencode/src/provider/transform.ts`：看 provider-specific message transform。
5. `packages/opencode/src/session/llm/ai-sdk.ts`：看 event adapter。

画一张图：`Internal Message -> ProviderTransform -> streamText -> fullStream -> LLMEvent -> Processor`。

## 15. 面试式自测

1. 为什么 OpenCode 不直接把 session message 原样发给 provider？
2. 如果某个模型不支持图片输入，代码里在哪里处理？
3. 如果 tool name 大小写错了，哪段代码尝试修复？
4. 如果 provider SDK 不在 bundled list 中，OpenCode 如何加载它？
5. 为什么要有 native runtime 分支？它什么时候不会被使用？
6. 为什么 `LLM.stream` 返回的是 `Stream<LLMEvent>`，而不是 `Promise<string>`？

## 16. 下一步阅读建议

下一章建议读 “权限、审批、安全边界”。Provider 章说明模型如何得到工具；权限章会说明模型即使得到了工具，也不是想怎么用就怎么用。


