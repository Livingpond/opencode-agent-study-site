---
title: "SDK / API / 对外扩展点"
description: "理解 HTTP API、generated SDK、plugin hooks 和扩展点如何让外部程序接入 OpenCode。"
sidebar:
  label: "12. SDK / API / 对外扩展点"
  order: 12
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>中等</div>
  <div><strong>预计阅读</strong>40 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/12-sdk-api-extension.md"><code>markdown/12-sdk-api-extension.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`12-sdk-api-extension`
- 章节摘要：理解 HTTP API、generated SDK、plugin hooks 和扩展点如何让外部程序接入 OpenCode。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/server/server.ts</code></li>
<li><code>packages/opencode/src/server/routes/instance/httpapi/api.ts</code></li>
<li><code>packages/opencode/src/server/routes/instance/httpapi/groups/session.ts</code></li>
<li><code>packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts</code></li>
<li><code>packages/sdk/js/src/client.ts</code></li>
<li><code>packages/sdk/js/src/server.ts</code></li>
<li><code>packages/opencode/src/plugin/index.ts</code></li>
<li><code>packages/plugin/src/index.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.12 SDK / API / 对外扩展点”。  
> 主要源码：`packages/opencode/src/server/server.ts`、`packages/opencode/src/server/routes/instance/httpapi/api.ts`、`packages/opencode/src/server/routes/instance/httpapi/server.ts`、`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`、`packages/opencode/src/server/routes/instance/httpapi/groups/event.ts`、`packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts`、`packages/sdk/js/src/client.ts`、`packages/sdk/js/src/server.ts`、`packages/opencode/src/plugin/index.ts`、`packages/plugin/src/index.ts`、`packages/plugin/src/tool.ts`。

## 0. 本章学习目标

这一章要理解 OpenCode 如何把内部 agent runtime 暴露给外部世界。

学完你应该能说清：

- HTTP API 如何按 group 组合成 Root/Instance/Event/Pty/OpenCode API。
- server routes 如何把 API handlers 和 runtime services 装配到 Effect layer。
- SDK client 如何包装 generated client，并注入 directory header。
- SDK server helper 如何启动 `opencode serve` 或 TUI。
- Event API 如何用 SSE 输出 Bus events。
- Plugin 系统如何加载内部/外部插件，提供 SDK client、project/worktree/serverUrl，并触发 hooks。
- Tool 插件 API 如何让外部插件提供新工具。

## 1. 一句话讲明白

SDK / API / 扩展层是 OpenCode 的“外部接口层”：server 用 Effect HTTP API 把 session、file、provider、permission、event 等能力组合成 typed API；JS SDK 包装 generated client 给 CLI/UI/插件使用；插件系统把 SDK、项目上下文和 hook trigger 暴露给外部模块，让外部代码能参与 provider、tool、shell.env、chat.params、event 等扩展点。来源：`packages/opencode/src/server/routes/instance/httpapi/api.ts:30-62`、`packages/opencode/src/server/routes/instance/httpapi/server.ts:182-240`、`packages/sdk/js/src/client.ts:33-57`、`packages/opencode/src/plugin/index.ts:43-55`、`packages/opencode/src/plugin/index.ts:126-150`、`packages/opencode/src/plugin/index.ts:261-274`。

## 2. 它在 OpenCode agent 中的位置

这一层位于 runtime 外围：

```text
CLI / TUI / Web / Desktop / Plugin
  -> JS SDK / HTTP API
  -> HttpApi handlers
  -> Effect services
  -> SessionPrompt / ToolRegistry / Provider / Permission / LSP ...

Runtime events
  -> Bus
  -> EventApi SSE
  -> SDK event stream
  -> UI/plugin consumers

Plugin modules
  -> PluginLoader
  -> Hooks[]
  -> Plugin.trigger(...)
  -> modify params/tools/env/events
```

关键判断：

- `OpenCodeHttpApi` 是 Root、Event、Instance、PtyConnect 的组合。来源：`packages/opencode/src/server/routes/instance/httpapi/api.ts:54-59`。
- `createRoutes` 把 handlers 和大量 runtime service layer 组合起来。来源：`packages/opencode/src/server/routes/instance/httpapi/server.ts:182-240`。
- SDK `createOpencodeClient` 在 client interceptor 中改写 directory query。来源：`packages/sdk/js/src/client.ts:17-31`、`packages/sdk/js/src/client.ts:33-57`。
- Plugin input 里直接给插件一个 SDK client 和 project/worktree/directory/serverUrl。来源：`packages/opencode/src/plugin/index.ts:126-150`。

## 3. 生活类比

如果 agent runtime 是公司内部各部门，那么 API/SDK 是对外服务大厅：

- HTTP API 是窗口编号和办理事项。
- SDK 是客户拿到的一本“办事小程序”，不用自己拼 URL。
- SSE event 是排队叫号屏。
- Plugin 是外包团队的入驻机制：给它工牌、内部系统客户端和规则，允许它在指定 hook 点参与工作。

## 4. Java 开发者类比

- `HttpApiGroup` 像 Spring Controller group。
- `HttpApiEndpoint` 像 `@PostMapping` + request/response schema。
- handlers 像 Controller method 调 Service。
- Effect Layer 装配像 Spring Boot auto configuration / application context。
- JS SDK 像 OpenAPI generated client + wrapper。
- `EventApi` SSE 像 Spring WebFlux `text/event-stream`。
- Plugin hook 像 SPI + application events + interceptor。

## 5. 最小源码路径

1. `packages/opencode/src/server/server.ts:58-67`：in-process `Server.Default().app.fetch`。
2. `packages/opencode/src/server/server.ts:75-100`：listen 对外启动 HTTP server。
3. `packages/opencode/src/server/routes/instance/httpapi/api.ts:30-62`：API group 组合。
4. `packages/opencode/src/server/routes/instance/httpapi/server.ts:103-151`：root/event/instance routes 分层。
5. `packages/opencode/src/server/routes/instance/httpapi/server.ts:182-240`：createRoutes 装配 services。
6. `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-363`：session prompt/command/shell endpoint。
7. `packages/opencode/src/server/routes/instance/httpapi/groups/event.ts:9-24`：SSE event API 定义。
8. `packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:21-53`：SSE event response。
9. `packages/sdk/js/src/client.ts:33-57`：JS SDK client wrapper。
10. `packages/sdk/js/src/server.ts:22-134`：启动 server/TUI 的 SDK helper。
11. `packages/opencode/src/plugin/index.ts:43-55`：Plugin service interface。
12. `packages/opencode/src/plugin/index.ts:126-150`：PluginInput。
13. `packages/opencode/src/plugin/index.ts:261-274`：Plugin.trigger。
14. `packages/plugin/src/index.ts:56-80`：插件包对外类型。

## 6. 用户输入到 agent 行动的整体链路

### 6.1 API group 组合

```ts
export const RootHttpApi = HttpApi.make("opencode-root")
  .addHttpApi(ControlApi)
  .addHttpApi(GlobalApi)
  .middleware(SchemaErrorMiddleware)
  .middleware(Authorization)

export const InstanceHttpApi = HttpApi.make("opencode-instance")
  .addHttpApi(ConfigApi)
  .addHttpApi(ExperimentalApi)
  .addHttpApi(FileApi)
  .addHttpApi(InstanceApi)
  .addHttpApi(McpApi)
  .addHttpApi(ProjectApi)
  .addHttpApi(PtyApi)
  .addHttpApi(QuestionApi)
  .addHttpApi(PermissionApi)
  .addHttpApi(ProviderApi)
  .addHttpApi(SessionApi)
  .addHttpApi(SyncApi)
  .addHttpApi(V2Api)
  .addHttpApi(TuiApi)
  .addHttpApi(WorkspaceApi)
  .middleware(SchemaErrorMiddleware)

export const OpenCodeHttpApi = HttpApi.make("opencode")
  .addHttpApi(RootHttpApi)
  .addHttpApi(EventApi)
  .addHttpApi(InstanceHttpApi)
  .addHttpApi(PtyConnectApi)
```

路径：`packages/opencode/src/server/routes/instance/httpapi/api.ts:30-59`

这说明 HTTP API 是模块化 group，不是一个巨大 controller 文件。

### 6.2 API route 到 runtime services

```ts
export function createRoutes(
  corsOptions?: CorsOptions,
): Layer.Layer<never, EffectConfig.ConfigError, RouteRequirements> {
  return Layer.mergeAll(rootApiRoutes, eventApiRoutes, instanceRoutes, docRoute, uiRoute).pipe(
    Layer.provide([
      errorLayer,
      compressionLayer,
      corsVaryFix,
      fenceLayer,
      cors(corsOptions),
      Account.defaultLayer,
      Agent.defaultLayer,
      Auth.defaultLayer,
      Command.defaultLayer,
      Config.defaultLayer,
      File.defaultLayer,
      FileWatcher.defaultLayer,
      Format.defaultLayer,
      LSP.defaultLayer,
      MCP.defaultLayer,
      Permission.defaultLayer,
      Plugin.defaultLayer,
      Project.defaultLayer,
      Provider.defaultLayer,
      Pty.defaultLayer,
      Question.defaultLayer,
      Session.defaultLayer,
      SessionPrompt.defaultLayer,
      SessionRunState.defaultLayer,
      ToolRegistry.defaultLayer,
      ...
    ]),
    Layer.provide(InstanceLayer.layer),
    Layer.provide(Observability.layer),
  )
}
```

路径：`packages/opencode/src/server/routes/instance/httpapi/server.ts:182-240`

Java 类比：这是把 Controller、Service、Repository、EventBus、ToolRegistry、Provider 等全部放进 Spring ApplicationContext。

### 6.3 in-process server

```ts
export const Default = lazy(() => {
  const handler = HttpApiApp.webHandler().handler
  const app: ServerApp = {
    fetch: (request: Request) => handler(request, HttpApiApp.context),
    request(input, init) {
      return app.fetch(input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init))
    },
  }
  return { app }
})
```

路径：`packages/opencode/src/server/server.ts:58-67`

这就是为什么 CLI/TUI local 模式可以用 `Server.Default().app.fetch`，不必真的监听端口。

### 6.4 Session API endpoint

```ts
HttpApiEndpoint.post("prompt", SessionPaths.prompt, {
  params: { sessionID: SessionID },
  query: WorkspaceRoutingQuery,
  payload: PromptPayload,
  success: described(MessageV2.WithParts, "Created message"),
  error: [HttpApiError.BadRequest, ApiNotFoundError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "session.prompt",
    summary: "Send message",
    description: "Create and send a new message to a session, streaming the AI response.",
  }),
)
```

路径：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-324`

`command` 和 `shell` 也是同一组 session API：

```ts
HttpApiEndpoint.post("command", SessionPaths.command, { ... })
HttpApiEndpoint.post("shell", SessionPaths.shell, { ... })
```

路径：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:339-363`

### 6.5 Event API / SSE

```ts
export const EventApi = HttpApi.make("event").add(
  HttpApiGroup.make("event").add(
    HttpApiEndpoint.get("subscribe", EventPaths.event, {
      query: WorkspaceRoutingQuery,
      success: Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/event-stream" })),
    })
  )
)
```

路径：`packages/opencode/src/server/routes/instance/httpapi/groups/event.ts:9-24`

handler 把 Bus events 和 heartbeat 编成 SSE：

```ts
const events = (yield* bus.subscribeAll()).pipe(
  Stream.takeUntil((event) => event.type === Bus.InstanceDisposed.type),
)
const heartbeat = Stream.tick("10 seconds").pipe(
  Stream.drop(1),
  Stream.map(() => ({ id: Bus.createID(), type: "server.heartbeat", properties: {} })),
)

return HttpServerResponse.stream(
  Stream.make({ id: Bus.createID(), type: "server.connected", properties: {} }).pipe(
    Stream.concat(events.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
    Stream.map(eventData),
    Stream.pipeThroughChannel(Sse.encode()),
    Stream.encodeText,
  ),
  { contentType: "text/event-stream", headers: { "Cache-Control": "no-cache, no-transform" } },
)
```

路径：`packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:21-53`

### 6.6 JS SDK client wrapper

```ts
export function createOpencodeClient(config?: Config & { directory?: string }) {
  if (!config?.fetch) {
    const customFetch: any = (req: any) => {
      req.timeout = false
      return fetch(req)
    }
    config = {
      ...config,
      fetch: customFetch,
    }
  }

  if (config?.directory) {
    config.headers = {
      ...config.headers,
      "x-opencode-directory": encodeURIComponent(config.directory),
    }
  }

  const client = createClient(config)
  client.interceptors.request.use((request) => rewrite(request, config?.directory))
  client.interceptors.error.use(wrapClientError)
  return new OpencodeClient({ client })
}
```

路径：`packages/sdk/js/src/client.ts:33-57`

`rewrite` 会把 GET/HEAD 的 `x-opencode-directory` 变成 query：

```ts
function rewrite(request: Request, directory?: string) {
  if (request.method !== "GET" && request.method !== "HEAD") return request

  const value = pick(request.headers.get("x-opencode-directory"), directory)
  if (!value) return request

  const url = new URL(request.url)
  if (!url.searchParams.has("directory")) {
    url.searchParams.set("directory", value)
  }

  const next = new Request(url, request)
  next.headers.delete("x-opencode-directory")
  return next
}
```

路径：`packages/sdk/js/src/client.ts:17-31`

### 6.7 SDK helper 启动 server/TUI

```ts
export async function createOpencodeServer(options?: ServerOptions) {
  options = Object.assign(
    {
      hostname: "127.0.0.1",
      port: 4096,
      timeout: 5000,
    },
    options ?? {},
  )

  const args = [`serve`, `--hostname=${options.hostname}`, `--port=${options.port}`]
  if (options.config?.logLevel) args.push(`--log-level=${options.config.logLevel}`)

  const proc = launch(`opencode`, args, {
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config ?? {}),
    },
  })
  ...
}
```

路径：`packages/sdk/js/src/server.ts:22-40`

启动 TUI：

```ts
export function createOpencodeTui(options?: TuiOptions) {
  const args = []
  if (options?.project) args.push(`--project=${options.project}`)
  if (options?.model) args.push(`--model=${options.model}`)
  if (options?.session) args.push(`--session=${options.session}`)
  if (options?.agent) args.push(`--agent=${options.agent}`)

  const proc = launch(`opencode`, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(options?.config ?? {}),
    },
  })
  ...
}
```

路径：`packages/sdk/js/src/server.ts:102-134`

### 6.8 Plugin service interface 和 trigger

```ts
export interface Interface {
  readonly trigger: <
    Name extends TriggerName,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(
    name: Name,
    input: Input,
    output: Output,
  ) => Effect.Effect<Output>
  readonly list: () => Effect.Effect<Hooks[]>
  readonly init: () => Effect.Effect<void>
}
```

路径：`packages/opencode/src/plugin/index.ts:43-55`

插件加载时，OpenCode 给插件的输入：

```ts
const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  directory: ctx.directory,
  headers: ServerAuth.headers(),
  fetch: async (...args) => Server.Default().app.fetch(...args),
})
const input: PluginInput = {
  client,
  project: ctx.project,
  worktree: ctx.worktree,
  directory: ctx.directory,
  experimental_workspace: {
    register(type: string, adapter: PluginWorkspaceAdapter) {
      registerAdapter(ctx.project.id, type, adapter as WorkspaceAdapter)
    },
  },
  get serverUrl(): URL {
    return Server.url ?? new URL("http://localhost:4096")
  },
  $: typeof Bun === "undefined" ? undefined : Bun.$,
}
```

路径：`packages/opencode/src/plugin/index.ts:126-150`

trigger 执行 hooks：

```ts
const trigger = Effect.fn("Plugin.trigger")(function* <Name extends TriggerName>(name: Name, input: Input, output: Output) {
  if (!name) return output
  const s = yield* InstanceState.get(state)
  for (const hook of s.hooks) {
    const fn = hook[name] as any
    if (!fn) continue
    yield* Effect.promise(async () => fn(input, output))
  }
  return output
})
```

路径：`packages/opencode/src/plugin/index.ts:261-274`

这就是 LLM 章看到的 `chat.params`、Shell 章看到的 `shell.env`、Tool 章看到的 `tool.execute.before/after` 的底层机制。

### 6.9 对外插件类型

```ts
export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>
  project: Project
  directory: string
  worktree: string
  experimental_workspace: {
    register(type: string, adapter: WorkspaceAdapter): void
  }
  serverUrl: URL
  $: BunShell
}

export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>

export type PluginModule = {
  id?: string
  server: Plugin
  tui?: never
}
```

路径：`packages/plugin/src/index.ts:56-80`

插件包不是随便导出函数，而是有类型约束的 server plugin module。

## 7. 核心源码逐段讲解

### 7.1 API 组合不是目录树，而是 typed contract

`api.ts` 通过 `HttpApi.make().addHttpApi()` 组合 typed endpoint group。每个 group 定义 endpoint payload、success、error 和 OpenAPI annotations。Java 开发者可以理解为 Controller 接口 + OpenAPI schema。

### 7.2 server routes 是 runtime 装配点

`server.ts` 的 `createRoutes` 是非常重要的架构中心：它同时合并 route layer 和 runtime service layer。agent 项目的 HTTP 层不是薄薄的 controller，它需要把 SessionPrompt、ToolRegistry、Provider、Permission、LSP、MCP、Plugin 全部装配进请求上下文。

### 7.3 SDK 是所有 UI 的公共语言

CLI/TUI/Web/Desktop/Plugin 都倾向于使用 SDK，而不是手写 fetch。这样 session.prompt、permission.reply、event.subscribe、global.event 等调用方式一致。源码证据：

- CLI run imports `createOpencodeClient`。来源：`packages/opencode/src/cli/cmd/run.ts:23`。
- TUI SDK context 调用 `createOpencodeClient`。来源：`packages/opencode/src/cli/cmd/tui/context/sdk.tsx:1-31`。
- Plugin service 给插件注入 SDK client。来源：`packages/opencode/src/plugin/index.ts:126-150`。

### 7.4 Event API 是 UI 实时性的基础

SSE handler 先发 `server.connected`，再合并 bus events 和 heartbeat。这个设计避免 UI 只能靠轮询拿状态。来源：`packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:21-53`。

### 7.5 Plugin 是受控扩展，不是随意 monkey patch

Plugin 系统加载 hooks，然后在运行时显式调用 `Plugin.trigger(name, input, output)`。插件只能在 OpenCode 暴露的 hook 点影响流程，不是随意改内部对象。来源：`packages/opencode/src/plugin/index.ts:261-274`。

## 8. 关键 TypeScript 语法复习

### generic + keyof + conditional mapped type

```ts
type TriggerName = {
  [K in keyof Hooks]-?: NonNullable<Hooks[K]> extends (input: any, output: any) => Promise<void> ? K : never
}[keyof Hooks]
```

路径：`packages/opencode/src/plugin/index.ts:38-41`

这段从 `Hooks` 中筛选出符合 `(input, output) => Promise<void>` 形状的 hook 名。Java 没有直接等价物，这是 TS 类型编程。

### Parameters

```ts
Input = Parameters<Required<Hooks>[Name]>[0]
Output = Parameters<Required<Hooks>[Name]>[1]
```

路径：`packages/opencode/src/plugin/index.ts:45-48`

从 hook 函数类型中抽取第 0、第 1 个参数类型。Java 泛型做不到这么直接。

### namespace

```ts
export namespace ServerConnection {
  export type Http = ...
  export const key = (conn: Any): Key => { ... }
}
```

路径：`packages/app/src/context/server.tsx:63-120`

TS namespace 可以把类型和函数放在同一命名空间下。现代项目更常用 module export，但这里用于组织相关类型/函数。

### function overload

`lsp/launch.ts` 中有 overload，本章 SDK 虽未深入，但你在 server/desktop 里会看到类似 API shape。TS overload 用多个签名描述同一函数的不同调用形式，Java 用方法重载。

### ReturnType

```ts
client: ReturnType<typeof createOpencodeClient>
```

路径：`packages/plugin/src/index.ts:56-58`

从函数返回值推导类型，避免重复定义 SDK client 类型。

### async iterator / stream

SSE 在 SDK 里通常被消费成 async iterable，UI 用 `for await`。Java 类比 Reactive Streams。

## 9. 涉及的设计模式和架构思想

- **Typed API contract**：endpoint 有 payload/success/error schema。
- **Layered service assembly**：HTTP routes 和 runtime services 通过 Effect Layer 装配。
- **Generated SDK + wrapper**：生成客户端再加目录、错误处理、fetch 适配。
- **SSE event bus bridge**：Bus events 通过 SSE 变成外部可消费 stream。
- **Plugin SPI**：插件通过 typed hooks 接入。
- **In-process adapter**：`Server.Default().app.fetch` 让插件/CLI 不必起外部 HTTP。
- **Separation of extension points**：tools、provider params、shell env、events 各自有 hook。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：ToolRegistry 会读取 plugin tools；插件 hook 可在 tool definition/execution 前后介入。来源：`packages/opencode/src/tool/registry.ts:219-224`、`packages/opencode/src/session/tools.ts:90-116`。
- 和 Provider：LLM 层调用 `chat.params`、`chat.headers`、system transform 等 plugin hooks。来源：`packages/opencode/src/session/llm.ts:126-202`。
- 和 Session：Session API 暴露 prompt/command/shell/revert/permissionRespond 等 endpoint。来源：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-405`。
- 和文件系统：FileApi、WorkspaceRoutingQuery、directory header/query 让同一 server 能按工作区路由请求。来源：`packages/sdk/js/src/client.ts:17-31`。
- 和 UI：Event API/SSE 是 UI 同步状态的基础。来源：`packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:21-53`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

mini agent 至少要有这三层：

```ts
// 1. HTTP API
app.post("/session/:id/prompt", async (req) => {
  return sessionPrompt.prompt(req.params.id, await req.json())
})

app.get("/event", async () => {
  return sse(bus.subscribeAll())
})

// 2. SDK
export function createMiniClient(baseUrl: string) {
  return {
    session: {
      prompt: (id: string, body: unknown) => fetch(`${baseUrl}/session/${id}/prompt`, { method: "POST", body: JSON.stringify(body) }),
    },
    event: () => connectSse(`${baseUrl}/event`),
  }
}

// 3. Plugin hooks
const hooks: Hooks[] = []
async function trigger(name, input, output) {
  for (const hook of hooks) await hook[name]?.(input, output)
  return output
}
```

实现顺序：

1. `POST /session/:id/prompt`。
2. `GET /event` SSE。
3. JS SDK wrapper。
4. permission reply endpoint。
5. plugin hook registry。
6. plugin tool extension。

## 12. 费曼复述区

请你不看源码复述：

1. RootHttpApi、InstanceHttpApi、EventApi 的差异是什么？
2. 为什么 SDK client 要处理 directory header/query？
3. Event API 为什么要加 heartbeat？
4. PluginInput 为什么要给插件 SDK client 和 serverUrl？
5. Plugin.trigger 和随意 monkey patch 的差异是什么？

如果说不出来，常见卡点是：

- 只看到 HTTP endpoint，没有看到 Effect Layer 装配 runtime。
- 把 SDK 当成简单 fetch wrapper，没有看到 directory routing 和 error interceptor。
- 把 plugin 理解成“加载脚本”，没有看到 typed hooks 和 trigger 点。

换一种说法：API/SDK 是 agent 的“外部神经接口”，插件是可控的“神经接线板”。

## 13. 练习题

### 入门题

1. 找到 `OpenCodeHttpApi`，列出它包含哪些 API group。
2. 找到 `SessionApi.prompt` endpoint，写出 params、payload、success。
3. 找到 `createOpencodeClient`，解释 directory 是如何传给后端的。

### 进阶题

1. 阅读 `createRoutes`，把 service layer 分成 session/tool/provider/UI/infra 几组。
2. 阅读 Event handler，解释为什么先发 `server.connected`。
3. 阅读 Plugin service，解释内部插件和外部插件加载路径的差异。

### 源码追踪题

1. 从 `client.session.prompt` 追到 Session API endpoint，再追到 handler。
2. 从 `sdk.global.event` 追到 `/event` SSE handler。
3. 从 `Plugin.trigger("chat.params")` 追到 plugin hook 类型。
4. 从 plugin tool 定义追到 ToolRegistry 加载。

### 小实现题

写一个 mini SDK/API：

- `POST /prompt`
- `POST /permission/:id`
- `GET /event`
- `createMiniClient`
- `registerPlugin(hooks)`
- `triggerHook(name, input, output)`

## 14. 源码追踪任务

建议阅读顺序：

1. `packages/opencode/src/server/routes/instance/httpapi/api.ts`
2. `packages/opencode/src/server/routes/instance/httpapi/server.ts`
3. `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`
4. `packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts`
5. `packages/sdk/js/src/client.ts`
6. `packages/sdk/js/src/server.ts`
7. `packages/opencode/src/plugin/index.ts`
8. `packages/plugin/src/index.ts`
9. `packages/plugin/src/tool.ts`

## 15. 面试式自测

1. API group 和 handler 为什么分开？
2. 为什么 local CLI/TUI 可以不用监听端口也走 HTTP handler？
3. 如果要给外部程序提供“创建 session 并 prompt”的能力，应该从 SDK 哪里开始？
4. 如果要让插件修改 LLM temperature，应该接哪个 hook？
5. 如果插件执行失败，为什么不应该让整个 server 崩掉？
6. 如果要给 mini agent 做插件系统，你会先支持 tool plugin，还是 chat.params hook？为什么？

## 16. 下一步阅读建议

下一章读 “测试与工程化”。API/SDK/Plugin 已经说明系统边界，工程化章会看这个多 package 项目如何构建、检查和测试。


