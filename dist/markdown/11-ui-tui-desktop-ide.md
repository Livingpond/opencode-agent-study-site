# UI / TUI / Desktop / IDE

> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.11 UI / TUI / Desktop / IDE 相关”。  
> 主要源码：`packages/opencode/src/cli/cmd/run.ts`、`packages/opencode/src/cli/cmd/run/runtime.ts`、`packages/opencode/src/cli/cmd/tui/app.tsx`、`packages/opencode/src/cli/cmd/tui/context/sdk.tsx`、`packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx`、`packages/app/src/app.tsx`、`packages/app/src/context/sdk.tsx`、`packages/app/src/context/global-sdk.tsx`、`packages/desktop/src/main/index.ts`、`packages/desktop/src/main/server.ts`、`packages/desktop/src/renderer/index.tsx`、`sdks/vscode/src/extension.ts`。

## 0. 本章学习目标

这一章的重点不是 UI 细节，而是 OpenCode 如何让多种界面复用同一个 agent runtime。

学完你应该能说清：

- CLI interactive 和 non-interactive 如何共用 SDK/session API。
- TUI 如何通过 SDK 和 event stream 同步 message/tool/reasoning 状态。
- Web app 如何用 `AppInterface`、`ServerProvider`、`GlobalSDKProvider` 连接 server。
- Desktop 如何启动本地 sidecar server，再让 renderer 加载同一套 app。
- VS Code extension 如何通过 terminal 启动 opencode，并把当前文件以 `@file#Lx` 形式追加给 TUI。
- 为什么 UI 层不应该重写 agent loop。

## 1. 一句话讲明白

OpenCode 的 UI/TUI/Desktop/IDE 层是“多种壳，共用一个 runtime”：CLI/TUI/Web/Desktop/VS Code 都通过 SDK、HTTP API、SSE event stream 或本地 sidecar 连接到同一个 session/tool/provider/permission 后端；UI 负责输入、展示、同步和审批，不负责重新实现 agent 决策。来源：`packages/opencode/src/cli/cmd/run.ts:768-879`、`packages/opencode/src/cli/cmd/run/runtime.ts:159-165`、`packages/opencode/src/cli/cmd/tui/context/sdk.tsx:24-40`、`packages/app/src/app.tsx:295-329`、`packages/desktop/src/main/index.ts:258-345`、`sdks/vscode/src/extension.ts:45-100`。

## 2. 它在 OpenCode agent 中的位置

可以把 OpenCode 前端层分成四类：

```text
CLI non-interactive
  -> createOpencodeClient
  -> session.prompt / session.command
  -> event.subscribe

CLI/TUI interactive
  -> runInteractiveMode / runInteractiveLocalMode
  -> SDK event stream
  -> runtime queue + footer lifecycle

Web/Desktop app
  -> AppInterface
  -> ServerProvider + GlobalSDKProvider + GlobalSyncProvider
  -> HTTP API + SSE

VS Code extension
  -> create/focus terminal
  -> opencode --port <random>
  -> /tui/append-prompt with @file reference
```

关键判断：

- `run.ts` 在非交互模式直接调用 `client.session.prompt`，交互模式进入 `runInteractiveMode`。来源：`packages/opencode/src/cli/cmd/run.ts:768-825`。
- 本地交互模式用 `Server.Default().app.fetch` 做 in-process fetch，不一定需要外部 HTTP 监听。来源：`packages/opencode/src/cli/cmd/run.ts:832-879`。
- TUI SDK context 创建 client 并订阅 global event stream。来源：`packages/opencode/src/cli/cmd/tui/context/sdk.tsx:24-40`、`packages/opencode/src/cli/cmd/tui/context/sdk.tsx:74-124`。
- Desktop main process 会启动 sidecar server，renderer 用 `@opencode-ai/app`。来源：`packages/desktop/src/main/index.ts:258-345`、`packages/desktop/src/renderer/index.tsx:3-16`。

## 3. 生活类比

把 OpenCode runtime 想成一家厨房，UI 是不同点餐窗口：

- CLI 是柜台：一句话点餐，等结果。
- TUI 是堂食菜单：实时看到厨师做菜、审批、工具进度。
- Web app 是网页点餐。
- Desktop 是把厨房和网页打包进一个本地应用。
- VS Code extension 是在 IDE 里开一个窗口，把当前文件路径递给厨房。

这些窗口不各自做菜。真正做菜的是 session/agent/tool/provider runtime。

## 4. Java 开发者类比

- CLI/TUI/Web/Desktop 像不同 client：命令行客户端、Swing/JavaFX 客户端、Web 前端、桌面壳。
- SDK 像 Java 里的 OpenFeign/WebClient client。
- SSE event stream 像 WebFlux `Flux<Event>`。
- TUI sync context 像前端 Redux/Zustand store，根据后端事件更新状态。
- Desktop sidecar 像 Electron 主进程启动本地 Spring Boot sidecar，然后 WebView 访问它。
- VS Code extension 像 IDE 插件只负责打开终端、传文件上下文，不实现业务服务。

## 5. 最小源码路径

1. `packages/opencode/src/cli/cmd/run.ts:768-879`：run 命令如何分 non-interactive、interactive、local in-process、attach。
2. `packages/opencode/src/cli/cmd/run/runtime.ts:1-15`：interactive runtime 顶层说明。
3. `packages/opencode/src/cli/cmd/run/runtime.ts:159-238`：启动 lifecycle、session、stream transport。
4. `packages/opencode/src/cli/cmd/run/runtime.ts:238-382`：权限回复、问题回复、模型切换、中断。
5. `packages/opencode/src/cli/cmd/tui/app.tsx:166-220`：TUI 入口和 provider 树。
6. `packages/opencode/src/cli/cmd/tui/context/sdk.tsx:24-40`、`74-124`：TUI 创建 SDK 和订阅事件。
7. `packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx:73-236`：把 session.next 事件同步成 UI store。
8. `packages/app/src/app.tsx:295-329`：Web app 的 provider/router 外壳。
9. `packages/app/src/context/global-sdk.tsx:36-91`、`125-205`：全局 SDK 和事件流。
10. `packages/desktop/src/main/index.ts:258-345`：Desktop 启动本地 sidecar 并创建窗口。
11. `packages/desktop/src/main/server.ts:69-201`：sidecar server 进程和健康检查。
12. `sdks/vscode/src/extension.ts:45-100`：VS Code terminal 启动和 append prompt。

## 6. 用户输入到 agent 行动的整体链路

### 6.1 CLI non-interactive

非交互模式直接走 SDK session API：

```ts
if (!args.interactive) {
  const events = await client.event.subscribe()
  loop(client, events).catch((e) => {
    console.error(e)
    process.exit(1)
  })

  const result = await client.session.prompt({
    sessionID,
    agent,
    model,
    variant: args.variant,
    parts: [...files, { type: "text", text: message }],
  })
  ...
  return
}
```

路径：`packages/opencode/src/cli/cmd/run.ts:768-803`

CLI 自己不跑 agent loop。它把用户输入发到 session API，然后通过 event stream 等状态变化。

### 6.2 CLI/TUI interactive

交互模式进入 runtime：

```ts
const { runInteractiveMode } = await runtimeTask
await runInteractiveMode({
  sdk: client,
  directory: cwd,
  sessionID,
  sessionTitle: sess.title,
  resume: Boolean(args.session || args.continue) && !args.fork,
  replay,
  replayLimit: args["replay-limit"],
  agent,
  model,
  variant: args.variant,
  files,
  initialInput,
  createSession: createFreshSession,
  thinking,
  demo: args.demo,
})
```

路径：`packages/opencode/src/cli/cmd/run.ts:806-825`

本地 in-process 模式会构造一个 fetch，把请求直接交给 server web handler：

```ts
const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const { Server } = await import("@/server/server")
  const request = new Request(input, init)
  return Server.Default().app.fetch(request)
}) as typeof globalThis.fetch
```

路径：`packages/opencode/src/cli/cmd/run.ts:834-839`

这说明本地 TUI 可以不启动外部端口，直接走同一套 HTTP handler。

### 6.3 interactive runtime 做什么

`runtime.ts` 顶部注释直接说明职责：

```ts
// Top-level orchestrator for `run --interactive`.
//
// Wires the boot sequence, lifecycle (renderer + footer), stream transport,
// and prompt queue together into a single session loop. Two entry points:
//
//   runInteractiveMode     -- used when an SDK client already exists (attach mode)
//   runInteractiveLocalMode -- used for local in-process mode (no server)
//
// Both delegate to runInteractiveRuntime, which:
//   1. resolves keybinds, diff style, model info, and session history,
//   2. creates the split-footer lifecycle (renderer + RunFooter),
//   3. starts the stream transport (SDK event subscription), lazily for fresh
//      local sessions,
//   4. runs the prompt queue until the footer closes.
```

路径：`packages/opencode/src/cli/cmd/run/runtime.ts:1-15`

运行中，它把 footer 的审批按钮接到 SDK：

```ts
onPermissionReply: async (next) => {
  log?.write("send.permission.reply", next)
  await ctx.sdk.permission.reply(next)
},
onQuestionReply: async (next) => {
  await ctx.sdk.question.reply(next)
},
onInterrupt: () => {
  if (!hasSession(input, state) || state.aborting) return
  state.aborting = true
  void ctx.sdk.session
    .abort({
      sessionID: state.sessionID,
    })
    .catch(() => {})
    .finally(() => {
      state.aborting = false
    })
},
```

路径：`packages/opencode/src/cli/cmd/run/runtime.ts:257-374`

UI 层只把用户操作转成 API call：permission reply、question reply、session abort。

### 6.4 TUI SDK 和事件流

TUI 创建 SDK：

```ts
function createSDK() {
  return createOpencodeClient({
    baseUrl: props.url,
    signal: abort.signal,
    directory: props.directory,
    fetch: props.fetch,
    headers: props.headers,
  })
}
```

路径：`packages/opencode/src/cli/cmd/tui/context/sdk.tsx:24-31`

没有外部 event source 时，用 SDK 的 global event stream：

```ts
const events = await sdk.global.event({
  signal: ctrl.signal,
  sseMaxRetryAttempts: 0,
})

for await (const event of events.stream) {
  if (ctrl.signal.aborted) break
  handleEvent(event)
}
```

路径：`packages/opencode/src/cli/cmd/tui/context/sdk.tsx:83-97`

为了减少重渲染，它把事件放进 queue，再用 Solid 的 `batch` 一次发出：

```ts
batch(() => {
  for (const event of events) {
    emitter.emit("event", event)
  }
})
```

路径：`packages/opencode/src/cli/cmd/tui/context/sdk.tsx:52-57`

### 6.5 TUI 如何同步消息

`sync-v2` 根据 `session.next.*` 事件维护 message store：

```ts
case "session.next.prompted": {
  update(event.properties.sessionID, (draft) => {
    draft.unshift({
      id: event.id,
      type: "user",
      text: event.properties.prompt.text,
      files: event.properties.prompt.files,
      agents: event.properties.prompt.agents,
      time: { created: event.properties.timestamp },
    })
  })
  break
}
```

路径：`packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx:73-87`

tool 状态也由事件更新：

```ts
case "session.next.tool.called":
  update(event.properties.sessionID, (draft) => {
    const match = latestTool(activeAssistant(draft), event.properties.callID)
    if (!match) return
    match.time.ran = event.properties.timestamp
    match.provider = event.properties.provider
    match.state = { status: "running", input: event.properties.input, structured: {}, content: [] }
  })
  break
case "session.next.tool.success":
  update(event.properties.sessionID, (draft) => {
    const match = latestTool(activeAssistant(draft), event.properties.callID)
    if (match?.state.status !== "running") return
    match.state = {
      status: "completed",
      input: match.state.input,
      structured: event.properties.structured,
      content: [...event.properties.content],
    }
    match.provider = event.properties.provider
    match.time.completed = event.properties.timestamp
  })
  break
```

路径：`packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx:191-220`

这说明 UI 是 event-sourced store：后端发布事件，前端把事件 reducer 到 UI 状态。

### 6.6 Web App

Web app 的核心外壳是 `AppInterface`：

```tsx
export function AppInterface(props: {
  children?: JSX.Element
  defaultServer: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
  disableHealthCheck?: boolean
}) {
  return (
    <ServerProvider defaultServer={props.defaultServer} disableHealthCheck={props.disableHealthCheck} servers={props.servers}>
      <ConnectionGate disableHealthCheck={props.disableHealthCheck}>
        <ServerKey>
          <QueryProvider>
            <GlobalSDKProvider>
              <GlobalSyncProvider>
                <Dynamic component={props.router ?? Router} root={(routerProps) => <RouterRoot appChildren={props.children}>{routerProps.children}</RouterRoot>}>
                  <Route path="/" component={HomeRoute} />
                  <Route path="/:dir" component={DirectoryLayout}>
                    <Route path="/" component={SessionIndexRoute} />
                    <Route path="/session/:id?" component={SessionRoute} />
                  </Route>
                </Dynamic>
              </GlobalSyncProvider>
            </GlobalSDKProvider>
          </QueryProvider>
        </ServerKey>
      </ConnectionGate>
    </ServerProvider>
  )
}
```

路径：`packages/app/src/app.tsx:295-329`

Web app 关心 server 连接、健康检查、SDK、全局同步和路由，不直接调用 session internals。

### 6.7 Desktop

Desktop main process 会找端口、生成密码、启动 sidecar：

```ts
const port = yield* Effect.gen(function* () {
  const fromEnv = process.env.OPENCODE_PORT
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10)
    if (!Number.isNaN(parsed)) return parsed
  }
  ...
})
const hostname = "127.0.0.1"
const url = `http://${hostname}:${port}`
const password = randomUUID()

const { listener, health } = yield* Effect.promise(() =>
  spawnLocalServer(hostname, port, password, {
    needsMigration,
    userDataPath: app.getPath("userData"),
    onSqliteProgress: (progress) => initEmitter.emit("sqlite", progress),
    onStdout: (message) => logger.log("sidecar stdout", { message }),
    onStderr: (message) => logger.warn("sidecar stderr", { message }),
    onExit: (code) => logger.warn("sidecar exited", { code }),
  }),
)
server = listener
yield* Deferred.succeed(serverReady, {
  url,
  username: "opencode",
  password,
})
```

路径：`packages/desktop/src/main/index.ts:258-313`

`spawnLocalServer` 用 Electron utility process 启动 sidecar，并等 `ready` 和 `/global/health`：

```ts
const child = utilityProcess.fork(sidecar, [], {
  cwd: process.cwd(),
  env: createSidecarEnv(),
  serviceName: SIDECAR_SERVICE_NAME,
  stdio: "pipe",
})
...
child.postMessage({
  type: "start",
  hostname,
  port,
  password,
  userDataPath: options.userDataPath,
  needsMigration: options.needsMigration,
})
```

路径：`packages/desktop/src/main/server.ts:69-160`

Renderer 复用 `@opencode-ai/app`：

```ts
import {
  AppBaseProviders,
  AppInterface,
  PlatformProvider,
  ServerConnection,
  useCommand,
} from "@opencode-ai/app"
```

路径：`packages/desktop/src/renderer/index.tsx:3-16`

### 6.8 VS Code extension

VS Code extension 不嵌入 agent runtime，只打开终端运行 opencode：

```ts
const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
const terminal = vscode.window.createTerminal({
  name: TERMINAL_NAME,
  ...
  env: {
    _EXTENSION_OPENCODE_PORT: port.toString(),
    OPENCODE_CALLER: "vscode",
  },
})

terminal.show()
terminal.sendText(`opencode --port ${port}`)
```

路径：`sdks/vscode/src/extension.ts:45-65`

然后把当前文件追加到 TUI prompt：

```ts
async function appendPrompt(port: number, text: string) {
  await fetch(`http://localhost:${port}/tui/append-prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  })
}
```

路径：`sdks/vscode/src/extension.ts:93-100`

文件引用格式：

```ts
const relativePath = vscode.workspace.asRelativePath(document.uri)
let filepathWithAt = `@${relativePath}`

if (!selection.isEmpty) {
  const startLine = selection.start.line + 1
  const endLine = selection.end.line + 1
  if (startLine === endLine) {
    filepathWithAt += `#L${startLine}`
  } else {
    filepathWithAt += `#L${startLine}-${endLine}`
  }
}
```

路径：`sdks/vscode/src/extension.ts:115-135`

这和用户在 prompt 里手动输入 `@file#Lx` 是同一条上下文入口。

## 7. 核心源码逐段讲解

### 7.1 TUI App provider 树

`tui/app.tsx` 使用 Solid/OpenTUI，把 SDK、同步、路由、主题、对话框、prompt history 等 context 组合起来。入口签名：

```ts
export function tui(input: {
  url: string
  args: Args
  config: TuiConfig.Resolved
  onSnapshot?: () => Promise<string[]>
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
}) {
```

路径：`packages/opencode/src/cli/cmd/tui/app.tsx:166-175`

这里的 `url/fetch/headers/events` 就是 TUI 和后端 runtime 的连接参数。

### 7.2 Web app 的 ServerConnection

```ts
export namespace ServerConnection {
  export type Http = {
    type: "http"
    http: HttpBase
    authToken?: boolean
  } & Base

  export type Sidecar = {
    type: "sidecar"
    http: HttpBase
  } & (
    | { variant: "base" }
    | {
        variant: "wsl"
        distro: string
      }
  ) &
    Base

  export type Ssh = {
    type: "ssh"
    host: string
    http: HttpBase
  } & Base
}
```

路径：`packages/app/src/context/server.tsx:63-105`

Web app 抽象了三种连接：普通 HTTP、Desktop sidecar、SSH 代理。UI 不关心 server 具体在哪里。

### 7.3 全局事件流 coalescing

```ts
const key = (directory: string, payload: Event) => {
  if (payload.type === "session.status") return `session.status:${directory}:${payload.properties.sessionID}`
  if (payload.type === "lsp.updated") return `lsp.updated:${directory}`
  if (payload.type === "message.part.updated") {
    const part = payload.properties.part
    return `message.part.updated:${directory}:${part.messageID}:${part.id}`
  }
}
```

路径：`packages/app/src/context/global-sdk.tsx:59-66`

Web app 会合并部分高频事件，避免 UI 因为 token/tool metadata 频繁更新而过度渲染。

## 8. 关键 TypeScript 语法复习

### TSX / JSX

```tsx
<ServerProvider defaultServer={props.defaultServer}>
  <ConnectionGate>
    <GlobalSDKProvider>
      <GlobalSyncProvider>{...}</GlobalSyncProvider>
    </GlobalSDKProvider>
  </ConnectionGate>
</ServerProvider>
```

路径：`packages/app/src/app.tsx:303-329`

Java 类比模板/组件树，但 TSX 本质是函数调用和对象 props。

### `as const`

```ts
const appBindingCommands = [
  "command.palette.show",
  "session.list",
  ...
] as const
```

路径：`packages/opencode/src/cli/cmd/tui/app.tsx:82-124`

让命令数组变成 literal union。

### Accessor

```ts
init: (props: { directory: Accessor<string> }) => {
  const directory = createMemo(props.directory)
```

路径：`packages/app/src/context/sdk.tsx:11-17`

Solid 的 `Accessor<T>` 类似 `() => T` 的 getter signal。Java 没有直接对应，可类比 `Supplier<T>`。

### discriminated union

```ts
export type Any =
  | Http
  | (Sidecar | Ssh)
```

路径：`packages/app/src/context/server.tsx:101-105`

`type` 字段区分不同 server connection。

### async iterator

```ts
for await (const event of events.stream) {
  handleEvent(event)
}
```

路径：`packages/opencode/src/cli/cmd/tui/context/sdk.tsx:94-97`

Java 类比 Reactive Stream/Flux，一边接收一边处理。

### createMemo/createEffect/onCleanup

```ts
const client = createMemo(() =>
  globalSDK.createClient({
    directory: directory(),
    throwOnError: true,
  }),
)

createEffect(() => {
  const unsub = globalSDK.event.on(directory(), (event) => {
    emitter.emit(event.type, event)
  })
  onCleanup(unsub)
})
```

路径：`packages/app/src/context/sdk.tsx:16-31`

Solid 的响应式 primitive。Java 后端可以类比依赖变化时重建 bean 监听，但前端是细粒度响应式。

## 9. 涉及的设计模式和架构思想

- **Thin client**：UI 只负责输入、展示、同步、审批。
- **Shared runtime**：所有 UI 复用 session/tool/provider/permission runtime。
- **Event-sourced UI state**：TUI/Web 根据 event stream reducer 出消息状态。
- **Adapter**：Desktop sidecar、VS Code terminal、Web HTTP 都是对 runtime 的适配。
- **Provider tree**：Solid context/provider 组合跨层共享 SDK、server、settings、sync。
- **Backpressure/coalescing**：高频事件批处理，降低渲染压力。
- **Local in-process server**：CLI TUI 可用 `Server.Default().app.fetch` 走同一 handler。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：UI 展示 tool pending/running/completed/error，并发送 permission reply。来源：`packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx:172-236`、`packages/opencode/src/cli/cmd/run/runtime.ts:257-264`。
- 和 Provider：UI 只选择模型/variant；实际 provider 调用在 LLM 层。来源：`packages/opencode/src/cli/cmd/run/runtime.ts:297-335`。
- 和 Session：UI 通过 `session.prompt`、`session.command`、`session.abort` 和 event stream 操作 session。来源：`packages/opencode/src/cli/cmd/run.ts:775-803`、`packages/opencode/src/cli/cmd/run/runtime.ts:361-374`。
- 和文件系统：VS Code extension 把当前文件转成 `@relativePath#Lx`；真正文件读取由 session prompt/file tools 处理。来源：`sdks/vscode/src/extension.ts:115-135`。
- 和 Desktop：Desktop 负责启动 sidecar 和窗口，renderer 复用 app。来源：`packages/desktop/src/main/index.ts:258-345`、`packages/desktop/src/renderer/index.tsx:3-16`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

mini agent 的 UI 先不要做复杂 TUI。最小结构：

```ts
async function runCli(client: AgentClient) {
  const events = client.events()
  void (async () => {
    for await (const event of events) {
      renderEvent(event)
      if (event.type === "permission.asked") {
        const reply = await promptUser(event)
        await client.permission.reply(reply)
      }
    }
  })()

  while (true) {
    const text = await readLine("> ")
    await client.session.prompt({ text })
  }
}
```

实现顺序：

1. CLI 输入框。
2. 事件流渲染 text delta。
3. 渲染 tool call 状态。
4. permission asked 时让用户选择 once/reject。
5. session abort。
6. 再考虑 Web/Desktop/IDE 插件。

## 12. 费曼复述区

请你不看源码复述：

1. 为什么 UI 层不应该重写 agent loop？
2. TUI 如何从 event stream 同步 tool 状态？
3. `runInteractiveLocalMode` 为什么可以不用外部 HTTP server？
4. Desktop sidecar 解决了什么问题？
5. VS Code extension 为什么只开 terminal，而不是自己实现 chat UI？

如果说不出来，常见卡点是：

- 把 UI 当成 agent runtime，而不是 runtime client。
- 不理解 event stream 是 UI 状态的来源。
- 不知道 Desktop 的主进程和 renderer 分工。

换一种说法：UI 是 agent 的“仪表盘和遥控器”，不是发动机。

## 13. 练习题

### 入门题

1. 找到 `run.ts` 中 non-interactive 和 interactive 分支。
2. 找到 TUI `SDKProvider`，说明它如何创建 SDK。
3. 找到 VS Code extension 的 `getActiveFile`，说明它如何生成 `@file#Lx`。

### 进阶题

1. 阅读 `sync-v2`，列出 user/text/tool/reasoning 四类事件如何更新 store。
2. 阅读 `global-sdk.tsx`，解释 coalescing 为什么需要跳过 stale delta。
3. 阅读 Desktop `spawnLocalServer`，解释 ready 和 health check 的差异。

### 源码追踪题

1. 从 `opencode run --interactive` 追到 `runInteractiveRuntime`。
2. 从 `permission.asked` 事件追到 footer 的 `onPermissionReply`。
3. 从 Desktop main 的 `spawnLocalServer` 追到 renderer `AppInterface`。
4. 从 VS Code command 追到 `/tui/append-prompt`。

### 小实现题

写一个 mini TUI store：

- 输入 event stream。
- 支持 `text.delta` 追加文本。
- 支持 `tool.called/tool.success/tool.failed` 更新 tool 状态。
- 支持 `permission.asked` 暂停渲染并等待用户选择。

## 14. 源码追踪任务

建议阅读顺序：

1. `packages/opencode/src/cli/cmd/run.ts:768-879`
2. `packages/opencode/src/cli/cmd/run/runtime.ts:1-15`
3. `packages/opencode/src/cli/cmd/run/runtime.ts:238-382`
4. `packages/opencode/src/cli/cmd/tui/context/sdk.tsx`
5. `packages/opencode/src/cli/cmd/tui/context/sync-v2.tsx`
6. `packages/app/src/app.tsx:295-329`
7. `packages/desktop/src/main/index.ts:258-345`
8. `sdks/vscode/src/extension.ts`

## 15. 面试式自测

1. TUI 和 Web app 如何避免重复实现 agent loop？
2. 为什么 UI 需要 event stream，而不是 prompt API 返回最终字符串就够了？
3. Desktop sidecar 为什么要有随机 password 和 health check？
4. VS Code extension 的 `@file#Lx` 最终会被哪个模块解析？
5. 如果 UI 因为 token delta 太频繁卡顿，源码里有哪些批处理/合并思路可以借鉴？
6. 如果你要做 JetBrains 插件，最小可行方案会更像 VS Code extension，还是更像 Web app？为什么？

## 16. 下一步阅读建议

下一章读 “SDK / API / 对外扩展点”。UI 章已经看到所有界面都依赖 SDK/API；下一章会专门看这些 API 是怎样被定义、组合、生成和扩展的。

