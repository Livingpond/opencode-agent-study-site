# CLI / 启动入口

> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.1 CLI / 启动入口”。  
> 主要源码：`packages/opencode/src/index.ts`、`packages/opencode/src/cli/cmd/run.ts`、`packages/opencode/src/cli/effect-cmd.ts`。

## 0. 本章学习目标

你会学到：`opencode` 进程如何启动，yargs 如何注册子命令，`run` 命令如何处理 CLI 参数、stdin、文件附件、session 创建/恢复、事件订阅，以及为什么本地模式最终也走同一套 server/SDK 通道。

## 1. 一句话讲明白

OpenCode 的 CLI 层不是 agent 本体，而是一个入口适配层：它负责把命令行输入整理成 session API 请求，再交给 runtime 的 `SessionPrompt` 和 agent loop。来源：`packages/opencode/src/index.ts:70-180`、`packages/opencode/src/cli/cmd/run.ts:768-879`。

## 2. 它在 OpenCode agent 中的位置

`packages/opencode/src/index.ts` 相当于进程 `main()`：注册全局参数、初始化日志/环境、注册所有命令。`RunCommand` 是学习 agent 的第一入口，因为它最终调用 `client.session.prompt` 或 `client.session.command`。来源：`packages/opencode/src/index.ts:70-91`、`packages/opencode/src/index.ts:158-180`、`packages/opencode/src/cli/cmd/run.ts:127-245`。

## 3. 生活类比

CLI 像服务台：用户说“帮我改这个项目”，服务台先确认目录、附件、是否继续旧会话、是否需要交互界面，再把工单交给后面的 agent 服务系统。

## 4. Java 开发者类比

- `index.ts` 类似 `public static void main(String[] args)` + Picocli/JCommander 根命令。
- `RunCommand` 类似一个 `@Command` handler。
- `effectCmd` 类似命令执行拦截器：负责加载项目上下文、注入依赖、finally 清理。
- `createOpencodeClient` + `Server.Default().app.fetch` 类似本地 in-process controller 调用，而不是重复实现 service 逻辑。

## 5. 最小源码路径

1. `packages/opencode/src/index.ts:58-91`：从 `process.argv` 得到 args，创建 yargs。
2. `packages/opencode/src/index.ts:158-180`：注册 `RunCommand` 等命令。
3. `packages/opencode/src/cli/effect-cmd.ts:70-93`：把 yargs handler 包成 Effect runtime，并加载/释放 instance。
4. `packages/opencode/src/cli/cmd/run.ts:127-245`：定义 `run [message..]` 的参数。
5. `packages/opencode/src/cli/cmd/run.ts:246-360`：处理 message、stdin、目录和文件附件。
6. `packages/opencode/src/cli/cmd/run.ts:396-516`：创建、继续、fork session。
7. `packages/opencode/src/cli/cmd/run.ts:768-879`：订阅事件并调用 session prompt/command。

## 6. 用户输入到 agent 行动的整体链路

```text
process.argv
  -> hideBin
  -> yargs(args)
  -> RunCommand handler
  -> resolve message/stdin/files/session
  -> createOpencodeClient
  -> client.session.prompt
  -> session HTTP handler
  -> SessionPrompt.prompt
```

关键片段：

```ts
const args = hideBin(process.argv)

const cli = yargs(args)
  .scriptName("opencode")
  .option("pure", { describe: "run without external plugins", type: "boolean" })
  .middleware(async (opts) => {
    if (opts.pure) {
      process.env.OPENCODE_PURE = "1"
    }
    await Log.init({ print: process.argv.includes("--print-logs") })
    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.OPENCODE_PID = String(process.pid)
  })
```

路径：`packages/opencode/src/index.ts:58-110`

```ts
.command(RunCommand)
.command(ServeCommand)
.command(WebCommand)
.command(SessionCommand)
.command(PluginCommand)
```

路径：`packages/opencode/src/index.ts:158-180`

## 7. 核心源码逐段讲解

### 7.1 顶层错误兜底

```ts
process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", { e: errorMessage(e) })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", { e: errorMessage(e) })
})
```

路径：`packages/opencode/src/index.ts:46-56`

这是 CLI 进程级兜底，避免 promise rejection 或未捕获异常悄悄丢失。

### 7.2 yargs 注册全局参数和中间件

```ts
const cli = yargs(args)
  .scriptName("opencode")
  .help("help", "show help")
  .option("print-logs", { type: "boolean" })
  .option("log-level", { choices: ["DEBUG", "INFO", "WARN", "ERROR"] })
  .option("pure", { describe: "run without external plugins", type: "boolean" })
```

路径：`packages/opencode/src/index.ts:70-90`

中间件初始化日志、Heap 和环境变量。Java 类比：Spring Boot 启动前的 global filter/bootstrap hook。

### 7.3 `effectCmd`：命令 handler 的运行时外壳

```ts
const useInstance = typeof opts.instance === "function" ? opts.instance(args) : opts.instance !== false
if (!useInstance) {
  await AppRuntime.runPromise(opts.handler(args))
  return
}
const directory = opts.directory?.(args) ?? process.cwd()
const { store, ctx } = await AppRuntime.runPromise(
  InstanceStore.Service.use((store) => store.load({ directory }).pipe(Effect.map((ctx) => ({ store, ctx })))),
)
try {
  await AppRuntime.runPromise(opts.handler(args).pipe(Effect.provideService(InstanceRef, ctx)))
} finally {
  await AppRuntime.runPromise(store.dispose(ctx))
}
```

路径：`packages/opencode/src/cli/effect-cmd.ts:70-93`

这段是 CLI 的关键工程设计：命令本身不用关心项目实例怎么加载和释放，`effectCmd` 统一处理。`run --attach` 不需要本地 instance，所以 `RunCommand` 的 `instance: (args) => !args.attach` 会跳过本地项目加载。来源：`packages/opencode/src/cli/cmd/run.ts:127-135`。

### 7.4 `RunCommand` 参数面很宽

`RunCommand` 支持 message、command、continue、session、fork、share、model、agent、format、file、attach、dir、interactive、dangerously-skip-permissions 等。来源：`packages/opencode/src/cli/cmd/run.ts:127-245`。

这说明 CLI 不只是“把字符串发给模型”，它还负责会话选择、模型选择、文件附件、交互模式和权限策略。

### 7.5 文件附件和 stdin

```ts
const files: FilePart[] = []
if (args.file) {
  const list = Array.isArray(args.file) ? args.file : [args.file]
  for (const filePath of list) {
    const resolvedPath = path.resolve(args.attach ? root : (directory ?? root), filePath)
    if (!(await Filesystem.exists(resolvedPath))) {
      UI.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    files.push({
      type: "file",
      url: pathToFileURL(resolvedPath).href,
      filename: path.basename(resolvedPath),
      mime,
    })
  }
}

const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
message = resolveRunInput(message, piped) ?? ""
```

路径：`packages/opencode/src/cli/cmd/run.ts:334-358`

TS 里的 `FilePart[]` 是编译期类型；真正传给 runtime 的是普通对象数组。

### 7.6 session 创建、继续和 fork

```ts
if (args.session) {
  const current = await sdk.session.get({ sessionID: args.session }).catch(() => undefined)
  if (args.fork) {
    const forked = await sdk.session.fork({ sessionID: args.session })
    return { id, title: forked.data?.title ?? current.data.title }
  }
  return { id: current.data.id, title: current.data.title, directory: current.data.directory }
}

const base = args.continue ? (await sdk.session.list()).data?.find((item) => !item.parentID) : undefined
```

路径：`packages/opencode/src/cli/cmd/run.ts:396-456`

这段解释了为什么 CLI 是 session-aware 的：agent 任务需要可恢复的上下文，而不是一次性进程。

### 7.7 事件订阅驱动输出

```ts
const events = await client.event.subscribe()
loop(client, events).catch((e) => {
  console.error(e)
  process.exit(1)
})
```

路径：`packages/opencode/src/cli/cmd/run.ts:768-773`

事件 loop 监听 `message.updated`、`message.part.updated`、`session.error`、`session.status`、`permission.asked`。来源：`packages/opencode/src/cli/cmd/run.ts:637-759`。

这就是 CLI 的“UI 层”：agent runtime 更新 message parts，CLI 只负责把事件渲染出来。

### 7.8 本地模式复用 Server.Default

```ts
const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const { Server } = await import("@/server/server")
  const request = new Request(input, init)
  return Server.Default().app.fetch(request)
}) as typeof globalThis.fetch
const sdk = createOpencodeClient({
  baseUrl: "http://opencode.internal",
  fetch: fetchFn,
  directory,
})
await execute(sdk)
```

路径：`packages/opencode/src/cli/cmd/run.ts:869-879`

这是很值得学的一点：本地 CLI 不绕过 API，而是构造一个 in-process fetch，让 SDK 走同一套 server handler。

## 8. 关键 TypeScript 语法复习

- default import：`import yargs from "yargs"`，路径：`packages/opencode/src/index.ts:1`。
- named import：`import { RunCommand } from "./cli/cmd/run"`，路径：`packages/opencode/src/index.ts:3`。
- namespace import：`import * as Log from "@opencode-ai/core/util/log"`，路径：`packages/opencode/src/index.ts:5`。
- arrow function：`.middleware(async (opts) => { ... })`，路径：`packages/opencode/src/index.ts:91-110`。
- 泛型函数：`export const effectCmd = <Args, A>(opts: EffectCmdOpts<Args, A>) => ...`，路径：`packages/opencode/src/cli/effect-cmd.ts:70`。
- optional property：`directory?: (args: Args) => string`，路径：`packages/opencode/src/cli/effect-cmd.ts:48-49`。
- object spread：`parts: [...files, { type: "text", text: message }]`，路径：`packages/opencode/src/cli/cmd/run.ts:791-798`。
- dynamic import：`const { Server } = await import("@/server/server")`，路径：`packages/opencode/src/cli/cmd/run.ts:869-872`。

## 9. 涉及的设计模式和架构思想

- Command Pattern：每个 yargs command 是一个命令对象。
- Adapter：CLI 参数适配成 session API payload。
- Interceptor：`effectCmd` 包住 handler，统一 instance 加载/释放。
- Event-driven UI：CLI 订阅事件渲染输出。
- Single runtime path：本地 CLI 和远程 attach 都通过 SDK/API 进入 runtime。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- Session：`run.ts` 创建/继续/fork session，然后调用 `client.session.prompt`。来源：`packages/opencode/src/cli/cmd/run.ts:396-516`、`packages/opencode/src/cli/cmd/run.ts:791-798`。
- Provider：CLI 只解析 `provider/model` 字符串，不直接调 provider。来源：`packages/opencode/src/cli/cmd/run.ts:31-41`。
- Tool：CLI 可通过 `--file` 附带文件，真正读文件在 `SessionPrompt.createUserMessage` 和 `ReadTool` 中发生。来源：`packages/opencode/src/cli/cmd/run.ts:334-354`。
- 文件系统：CLI 负责 cwd、`--dir` 和附件存在性检查。来源：`packages/opencode/src/cli/cmd/run.ts:310-356`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

先写 CLI wrapper：

```ts
async function main(argv: string[]) {
  const args = parseArgs(argv)
  const cwd = resolveDirectory(args.dir)
  const files = await resolveFiles(args.file, cwd)
  const client = createMiniAgentClient({ cwd })
  const sessionID = await getOrCreateSession(client, args)
  const events = client.subscribe(sessionID)
  renderEvents(events)
  await client.prompt(sessionID, {
    agent: args.agent,
    model: parseModel(args.model),
    parts: [...files, { type: "text", text: args.message }],
  })
}
```

先不要做 TUI。先把 CLI -> session -> event render 跑通。

## 12. 费曼复述区

请用自己的话回答：

1. 为什么 CLI 不是 agent 核心？
2. `effectCmd` 帮命令 handler 解决了什么重复问题？
3. 为什么本地模式也要走 `createOpencodeClient`？

如果答不出来，通常是把“输入适配层”和“agent runtime”混在一起了。换句话说：CLI 是门口，agent loop 是厨房。

## 13. 练习题

### 入门题

1. 找到 `index.ts` 中注册 `RunCommand` 的地方。
2. 找到 `RunCommand` 的 `--model` 和 `--agent` 参数定义。
3. 找到 `run.ts` 读取 piped stdin 的代码。

### 进阶题

1. 解释 `run --attach` 为什么不需要本地 instance。
2. 解释 `Server.Default().app.fetch` 让本地 CLI 获得了什么好处。
3. 解释 `permission.asked` 事件在非交互 CLI 中如何处理。

### 小实现题

写一个最小 CLI：支持 `mini-agent run "hello"`、`--file a.ts`、`--session id`，然后打印模拟的 event stream。

## 14. 源码追踪任务

1. 从 `packages/opencode/src/index.ts:158-180` 追到 `RunCommand`。
2. 从 `packages/opencode/src/cli/effect-cmd.ts:70-93` 追到 `InstanceStore.Service.load`。
3. 从 `packages/opencode/src/cli/cmd/run.ts:791-798` 追到 session API handler。
4. 从 `packages/opencode/src/cli/cmd/run.ts:637-759` 找出 CLI 渲染哪些事件。
5. 从 `packages/opencode/src/cli/cmd/run.ts:869-879` 解释本地 SDK 如何调用 server handler。

## 15. 面试式自测

1. CLI 层应该不应该直接调用模型？为什么？
2. 一个 coding agent CLI 为什么要支持 session resume/fork？
3. `--file` 在 CLI 层和 runtime 层分别做什么？
4. 为什么非交互 CLI 默认会 auto-reject permission？
5. 如果你要支持远程 server，CLI 入口要怎么设计？

## 16. 下一步阅读建议

下一章读 “用户输入与会话”。CLI 已经把输入交给了 `client.session.prompt`，下一步要理解 session API 如何把 payload 转成 `MessageV2.User` 和 parts。

