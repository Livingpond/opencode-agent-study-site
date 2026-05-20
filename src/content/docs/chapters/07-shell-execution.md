---
title: "Shell / 命令执行"
description: "理解 shell tool 如何解析命令、识别路径和命令模式、审批并执行进程。"
sidebar:
  label: "07. Shell / 命令执行"
  order: 7
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>较难</div>
  <div><strong>预计阅读</strong>45 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/07-shell-execution.md"><code>markdown/07-shell-execution.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`07-shell-execution`
- 章节摘要：理解 shell tool 如何解析命令、识别路径和命令模式、审批并执行进程。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/tool/shell.ts</code></li>
<li><code>packages/opencode/src/session/prompt.ts</code></li>
<li><code>packages/opencode/src/session/run-state.ts</code></li>
<li><code>packages/opencode/src/permission/index.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.7 Shell / 命令执行”。  
> 主要源码：`packages/opencode/src/tool/shell.ts`、`packages/opencode/src/session/prompt.ts`、`packages/opencode/src/session/run-state.ts`、`packages/opencode/src/permission/index.ts`。

## 0. 本章学习目标

这一章要解决的问题不是“怎么在 Node 里 spawn 一个进程”，而是 OpenCode 作为 coding agent，如何把“执行命令”变成一个可审计、可取消、可截断、可审批、可回填到消息历史的动作。

学完你应该能复述：

- shell tool 为什么先 parse/collect，再 ask，最后 run。
- shell 命令如何识别外部目录访问和命令权限模式。
- 直接由用户触发的 shell 和模型 tool call 触发的 shell 有什么差异。
- shell 输出如何持续更新 tool metadata，并在过长时写入截断文件。
- 在 mini agent 里，命令执行最少需要哪些安全边界。

## 1. 一句话讲明白

OpenCode 的 Shell 模块把一条命令当成“需要静态扫描 + 权限审批 + 受控进程执行 + 输出流式回写”的 tool action；它不是简单 `child_process.exec`，而是先用 tree-sitter 分析命令会访问哪些路径和命令模式，再通过 `ctx.ask` 审批，最后用 `ChildProcess` 执行并把 stdout/stderr 持续写回 `ToolPart.metadata`。来源：`packages/opencode/src/tool/shell.ts:266-287`、`packages/opencode/src/tool/shell.ts:374-410`、`packages/opencode/src/tool/shell.ts:424-596`。

## 2. 它在 OpenCode agent 中的位置

当模型在 agent loop 里调用 shell tool 时，链路大致是：

```text
runLoop
  -> SessionTools.resolve
  -> ToolRegistry.tools
  -> ShellTool.execute
  -> parse command
  -> collect command patterns / external dirs
  -> ctx.ask(...)
  -> ChildProcessSpawner.spawn(...)
  -> stream output into tool metadata
  -> return tool result
  -> processor writes tool result
  -> next LLM round
```

关键路径：

- `packages/opencode/src/tool/shell.ts:334-645`：模型调用 shell tool 时走的实现。
- `packages/opencode/src/session/tools.ts:42-73`：工具上下文提供 `ask` 和 `metadata`，shell tool 用它更新状态和触发审批。
- `packages/opencode/src/permission/index.ts:161-196`：权限服务把 `ask` 转成 pending request。
- `packages/opencode/src/session/processor.ts`：接收 tool result 并写回 message parts；这是 agent 下一轮推理的输入。

还有一条容易混淆的路径：用户在 UI/CLI 中直接执行 shell 命令，不一定是模型 tool call。这个路径由 `SessionPrompt.shellImpl` 处理，会人工构造一个 synthetic user message 和一个 assistant tool part。来源：`packages/opencode/src/session/prompt.ts:492-650`。

## 3. 生活类比

把 shell tool 想成公司里的“机房操作单”。

你不能直接说“去服务器跑这个命令”就结束了。真正流程是：

1. 先读操作单，看命令类型和涉及目录。
2. 如果要碰公司外部目录，先单独申请。
3. 如果命令本身危险或需要确认，再申请命令审批。
4. 执行时持续记录输出。
5. 输出太长就归档原始日志，只把尾部摘要贴回工单。
6. 任务取消或超时，要杀掉进程并把原因写进记录。

这和 `ShellTool.collect -> ask -> run` 的结构基本对应。来源：`packages/opencode/src/tool/shell.ts:374-410`、`packages/opencode/src/tool/shell.ts:266-287`、`packages/opencode/src/tool/shell.ts:424-596`。

## 4. Java 开发者类比

如果用 Java 后端风格理解：

- `ShellTool` 像一个 `ShellCommandService`，但它以 Tool Strategy 形式注册。
- `collect` 像命令执行前的 `PreAuthorize` 分析器。
- `ctx.ask` 像 Spring Security 的 `AccessDecisionManager`，只不过可以异步等用户批准。
- `ChildProcessSpawner` 像封装过的 `ProcessBuilder`。
- `SessionRunState` 像 session 级别的锁和任务运行状态管理器。
- `ctx.metadata` 像不断更新任务表里的 `progress_snapshot` 字段。

Java 伪代码：

```java
ShellPlan plan = shellAnalyzer.scan(command, cwd);
permissionService.ask(sessionId, plan.permissions());
ProcessHandle handle = processRunner.start(command, cwd, env);
while (handle.hasOutput()) {
    toolPartRepository.updateMetadata(callId, handle.latestOutput());
}
ToolResult result = outputLimiter.finish(handle);
messageRepository.appendToolResult(sessionId, result);
```

OpenCode 的差异是：它用 Effect 管理依赖、取消、资源释放和错误；用对象字面量表示 tool result；用 async stream/Effect Stream 消费进程输出。来源：`packages/opencode/src/tool/shell.ts:424-596`。

## 5. 最小源码路径

建议按这个顺序读：

1. `packages/opencode/src/tool/shell.ts:28-78`：哪些命令会触发路径扫描，`Scan` 里记录什么。
2. `packages/opencode/src/tool/shell.ts:266-287`：`ask` 如何把扫描结果变成权限请求。
3. `packages/opencode/src/tool/shell.ts:289-332`：跨平台创建命令和 lazy 初始化 tree-sitter parser。
4. `packages/opencode/src/tool/shell.ts:334-373`：`ShellTool` 初始化依赖、解析路径。
5. `packages/opencode/src/tool/shell.ts:374-410`：`collect` 从 AST 中提取命令模式和外部目录。
6. `packages/opencode/src/tool/shell.ts:424-596`：`run` 执行命令、流式更新 metadata、处理截断/超时/取消。
7. `packages/opencode/src/tool/shell.ts:598-645`：`execute` 把 parse/collect/ask/run 串起来。
8. `packages/opencode/src/session/prompt.ts:492-650`：用户直接 shell 命令如何进入 session。
9. `packages/opencode/src/session/run-state.ts:10-24`、`packages/opencode/src/session/run-state.ts:70-104`：session 运行状态如何阻止并发冲突。

## 6. 用户输入到 agent 行动的整体链路

### 6.1 模型发起 shell tool call

OpenCode 的 agent loop 会先通过 `SessionTools.resolve` 把 `ShellTool` 包成 AI SDK tool。模型选择调用 shell 后，AI SDK 调用 `ShellTool.execute`。这部分在 Tool 调用系统章已经讲过，这里只看 shell 内部。

`ShellTool` 在初始化时把配置、进程、文件系统、截断、插件、运行参数等服务取出来：

```ts
export const ShellTool = Tool.define(
  ShellID.ToolID,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const spawner = yield* ChildProcessSpawner
    const fs = yield* AppFileSystem.Service
    const trunc = yield* Truncate.Service
    const plugin = yield* Plugin.Service
    const flags = yield* RuntimeFlags.Service
    const defaultTimeout = flags.bashDefaultTimeoutMs ?? 2 * 60 * 1000
```

路径：`packages/opencode/src/tool/shell.ts:334-343`

这说明 shell tool 不是纯函数，它依赖配置、进程抽象、文件系统、输出截断、插件 hook 和 runtime flags。

### 6.2 解析命令与扫描风险

在真正执行前，`execute` 会 parse 命令，然后 collect：

```ts
const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =>
  Effect.sync(() => tree.delete()),
)
const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)
if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)
yield* ask(ctx, scan)
```

路径：`packages/opencode/src/tool/shell.ts:621-629`

这里关键点是：命令执行前先构造 AST，并且用 `acquireRelease` 确保 tree-sitter tree 被释放。对 Java 开发者来说，这像 `try-with-resources`。

### 6.3 权限审批

`ask` 会根据扫描结果发两个维度的审批：

```ts
if (scan.dirs.size > 0) {
  const globs = Array.from(scan.dirs).map((dir) => {
    if (process.platform === "win32") return AppFileSystem.normalizePathPattern(path.join(dir, "*"))
    return path.join(dir, "*")
  })
  yield* ctx.ask({
    permission: "external_directory",
    patterns: globs,
    always: globs,
    metadata: {},
  })
}

if (scan.patterns.size === 0) return
yield* ctx.ask({
  permission: ShellID.ToolID,
  patterns: Array.from(scan.patterns),
  always: Array.from(scan.always),
  metadata: {},
})
```

路径：`packages/opencode/src/tool/shell.ts:266-287`

第一段保护工作区外目录；第二段保护 shell 命令模式。`always` 是“以后总是允许”的候选 pattern。真正是否允许由 `Permission.ask` 根据规则集和已批准记录判断。来源：`packages/opencode/src/permission/index.ts:161-196`。

### 6.4 执行进程

命令创建分 Windows PowerShell 和普通 shell 两类：

```ts
function cmd(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv) {
  if (process.platform === "win32" && Shell.ps(shell)) {
    return ChildProcess.make(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd,
      env,
      stdin: "ignore",
      detached: false,
    })
  }

  return ChildProcess.make(command, [], {
    shell,
    cwd,
    env,
    stdin: "ignore",
    detached: process.platform !== "win32",
  })
}
```

路径：`packages/opencode/src/tool/shell.ts:289-305`

注意 `stdin: "ignore"`，这表示 shell tool 不适合运行需要交互输入的命令。超时提示也会提醒用户：如果命令不是在等输入，可以用更大的 timeout 重试。来源：`packages/opencode/src/tool/shell.ts:561-565`。

### 6.5 输出回写、截断、超时和取消

`run` 会把输出流解码成文本，不断更新 tool metadata：

```ts
yield* Effect.forkScoped(
  Stream.runForEach(Stream.decodeText(handle.all), (chunk) => {
    const size = Buffer.byteLength(chunk, "utf-8")
    list.push({ text: chunk, size })
    used += size

    last = preview(last + chunk)

    return ctx.metadata({
      metadata: {
        output: last,
        description: input.description,
      },
    })
  }),
)
```

路径：`packages/opencode/src/tool/shell.ts:484-530`

然后同时等待三件事：正常退出、用户 abort、超时。

```ts
const exit = yield* Effect.raceAll([
  handle.exitCode.pipe(Effect.map((code) => ({ kind: "exit" as const, code }))),
  abort.pipe(Effect.map(() => ({ kind: "abort" as const, code: null }))),
  timeout.pipe(Effect.map(() => ({ kind: "timeout" as const, code: null }))),
])

if (exit.kind === "abort") {
  aborted = true
  yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
}
if (exit.kind === "timeout") {
  expired = true
  yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
}
```

路径：`packages/opencode/src/tool/shell.ts:542-555`

最后把输出尾部和 metadata 组成标准 tool result：

```ts
return {
  title: input.description,
  metadata: {
    output: last || preview(output),
    exit: code,
    description: input.description,
    truncated: cut,
    ...(cut && file ? { outputPath: file } : {}),
  },
  output,
}
```

路径：`packages/opencode/src/tool/shell.ts:585-595`

这就是 shell result 回到 agent loop 的内容。下一轮 LLM 会看到 tool output，而 UI 可以根据 metadata 展示进行中输出。

## 7. 核心源码逐段讲解

### 7.1 命令风险词表和 Scan 类型

```ts
const CWD = new Set(["cd", "chdir", "popd", "pushd", "push-location", "set-location"])
const FILES = new Set([
  ...CWD,
  "rm",
  "cp",
  "mv",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "cat",
  "get-content",
  "set-content",
  "add-content",
  "copy-item",
  "move-item",
  "remove-item",
  "new-item",
  "rename-item",
])

type Scan = {
  dirs: Set<string>
  patterns: Set<string>
  always: Set<string>
}
```

路径：`packages/opencode/src/tool/shell.ts:28-78`

`FILES` 表示这些命令参数可能是文件路径，需要被解析并检查是否在工作区外。`CWD` 表示只改变目录的命令，后面会避免把它当成普通 shell permission pattern。`Scan` 是预扫描结果：涉及外部目录、命令审批 pattern、以及可记住的 allow pattern。

Java 类比：这是一个 `CommandRiskScanner.Result` DTO，字段类型用 `Set<String>` 去重。

### 7.2 lazy parser：为什么 shell tool 不只正则解析

```ts
const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  await Parser.init({ locateFile() { return treePath } })
  const [bashLanguage, psLanguage] = await Promise.all([Language.load(bashPath), Language.load(psPath)])
  const bash = new Parser()
  bash.setLanguage(bashLanguage)
  const ps = new Parser()
  ps.setLanguage(psLanguage)
  return { bash, ps }
})
```

路径：`packages/opencode/src/tool/shell.ts:307-332`

这里用 tree-sitter 的 bash/PowerShell grammar，是因为 shell 命令里有引号、变量、管道、子命令、转义字符，靠字符串 split 很容易错。`lazy` 的意义是第一次用到 shell tool 时才加载 wasm parser。

不确定点：本章没有继续展开 `commands`、`parts`、`pathArgs` 等 helper 的完整 AST 遍历细节；如果后续要写“命令安全扫描”专题，需要继续追踪 `packages/opencode/src/tool/shell.ts` 中这些 helper 的实现。

### 7.3 collect：把 AST 变成审批对象

```ts
const collect = Effect.fn("ShellTool.collect")(function* (
  root: Node,
  cwd: string,
  ps: boolean,
  shell: string,
  instance: InstanceContext,
) {
  const scan: Scan = {
    dirs: new Set<string>(),
    patterns: new Set<string>(),
    always: new Set<string>(),
  }
  const shellKind = ShellID.toKind(Shell.name(shell))

  for (const node of commands(root)) {
    const command = parts(node)
    const tokens = command.map((item) => item.text)
    const cmd = ps || shellKind === "cmd" ? tokens[0]?.toLowerCase() : tokens[0]

    if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
      for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
        const resolved = yield* argPath(arg, cwd, ps, shell)
        if (!resolved || containsPath(resolved, instance)) continue
        const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
        scan.dirs.add(dir)
      }
    }

    if (tokens.length && (!cmd || !CWD.has(cmd))) {
      scan.patterns.add(source(node))
      scan.always.add(BashArity.prefix(tokens).join(" ") + " *")
    }
  }

  return scan
})
```

路径：`packages/opencode/src/tool/shell.ts:374-410`

这段是 shell 安全的中心：

- 对文件相关命令，解析参数路径。
- 如果路径不在当前 instance/worktree 内，加入 `scan.dirs`。
- 对非 `cd` 类命令，加入 `scan.patterns`，用于 shell permission。
- `BashArity.prefix(tokens).join(" ") + " *"` 用来生成可复用的 allow pattern。

Java 类比：一个 `CommandAuthorizationPreprocessor`，输入 AST，输出 permission request。

### 7.4 shell.env 插件 hook

```ts
const shellEnv = Effect.fn("ShellTool.shellEnv")(function* (ctx: Tool.Context, cwd: string) {
  const extra = yield* plugin.trigger(
    "shell.env",
    { cwd, sessionID: ctx.sessionID, callID: ctx.callID },
    { env: {} },
  )
  return {
    ...process.env,
    ...extra.env,
  }
})
```

路径：`packages/opencode/src/tool/shell.ts:412-422`

Shell 执行环境不是固定的。插件可以通过 `shell.env` hook 注入环境变量。对于 Java 开发者，可以类比 Spring Boot 里某个 `EnvironmentPostProcessor`，但这里是按每次 shell call 触发。

### 7.5 direct shell：用户手动执行命令的路径

`SessionPrompt.shellImpl` 不是模型 tool call，而是用户直接发起 shell 命令时的 session 记录路径。

```ts
const userMsg: MessageV2.User = {
  id: input.messageID ?? MessageID.ascending(),
  sessionID: input.sessionID,
  time: { created: Date.now() },
  role: "user",
  agent: input.agent,
  model: { providerID: model.providerID, modelID: model.modelID },
}
yield* sessions.updateMessage(userMsg)
const userPart: MessageV2.Part = {
  type: "text",
  id: PartID.ascending(),
  messageID: userMsg.id,
  sessionID: input.sessionID,
  text: "The following tool was executed by the user",
  synthetic: true,
}
```

路径：`packages/opencode/src/session/prompt.ts:511-528`

然后它创建 assistant message 和一个 running shell tool part：

```ts
const part: MessageV2.ToolPart = {
  type: "tool",
  id: PartID.ascending(),
  messageID: msg.id,
  sessionID: input.sessionID,
  tool: ShellID.ToolID,
  callID: ulid(),
  state: {
    status: "running",
    time: { start: started },
    input: { command: input.command },
  },
}
yield* sessions.updatePart(part)
```

路径：`packages/opencode/src/session/prompt.ts:546-559`

这条路径的特点：它把“用户执行过命令”也写进 session history，这样后续 agent 可以看到上下文。它不经过模型的 tool call 决策，但仍使用 message/part 模型。

### 7.6 SessionRunState：避免同一 session 并发乱跑

```ts
export interface Interface {
  readonly assertNotBusy: (sessionID: SessionID) => Effect.Effect<void, Session.BusyError>
  readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  readonly ensureRunning: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<MessageV2.WithParts>,
    work: Effect.Effect<MessageV2.WithParts>,
  ) => Effect.Effect<MessageV2.WithParts>
  readonly startShell: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<MessageV2.WithParts>,
    work: Effect.Effect<MessageV2.WithParts>,
    ready?: Latch.Latch,
  ) => Effect.Effect<MessageV2.WithParts, Session.BusyError>
}
```

路径：`packages/opencode/src/session/run-state.ts:10-24`

实现里用 `runners: Map<SessionID, Runner.Runner<MessageV2.WithParts>>` 管理每个 session 的运行状态；`startShell` 如果 RunnerBusy 会转成 session busy error。来源：`packages/opencode/src/session/run-state.ts:34-67`、`packages/opencode/src/session/run-state.ts:95-104`。

Java 类比：`ConcurrentHashMap<SessionId, SessionRunner>` + per-session lock，避免同一个会话同时跑 agent loop 和 shell 修改同一份状态。

## 8. 关键 TypeScript 语法复习

### Set 和 object literal

```ts
const scan: Scan = {
  dirs: new Set<string>(),
  patterns: new Set<string>(),
  always: new Set<string>(),
}
```

路径：`packages/opencode/src/tool/shell.ts:381-385`

Java 类比：`new Scan(new HashSet<>(), new HashSet<>(), new HashSet<>())`。TS 更常用对象字面量，不一定创建 class。

### literal type 和 discriminated union

```ts
handle.exitCode.pipe(Effect.map((code) => ({ kind: "exit" as const, code })))
abort.pipe(Effect.map(() => ({ kind: "abort" as const, code: null })))
timeout.pipe(Effect.map(() => ({ kind: "timeout" as const, code: null })))
```

路径：`packages/opencode/src/tool/shell.ts:542-546`

`as const` 把 `"exit"` 收窄为字面量类型，这样后面 `if (exit.kind === "abort")` 时 TS 能准确知道分支类型。Java 类比 sealed interface：

```java
sealed interface Exit permits NormalExit, AbortExit, TimeoutExit {}
```

### optional property 和默认值

```ts
const timeout = params.timeout ?? defaultTimeout
```

路径：`packages/opencode/src/tool/shell.ts:619`

`??` 只在 `null` 或 `undefined` 时使用默认值。Java 类比 `timeout != null ? timeout : defaultTimeout`。

### async dynamic import

```ts
const { Parser } = await import("web-tree-sitter")
```

路径：`packages/opencode/src/tool/shell.ts:307-308`

这是运行时动态加载模块，不是 Java 的静态 import；更像 `ClassLoader` 或延迟初始化某个重依赖。

### Effect.acquireRelease

```ts
const tree = yield* Effect.acquireRelease(parse(params.command, ps), (tree) =>
  Effect.sync(() => tree.delete()),
)
```

路径：`packages/opencode/src/tool/shell.ts:623-625`

Java 类比 `try (Tree tree = parser.parse(command)) { ... }`。它把资源申请和释放绑定在 Effect scope 里。

### Rest/spread object

```ts
return {
  ...process.env,
  ...extra.env,
}
```

路径：`packages/opencode/src/tool/shell.ts:418-421`

后面的 `extra.env` 会覆盖前面的同名环境变量。Java 类比先 `putAll(System.getenv())`，再 `putAll(extraEnv)`。

## 9. 涉及的设计模式和架构思想

- **Strategy**：`ShellTool` 是 `Tool.Def` 的一个具体策略。
- **Preflight scanner**：`collect` 先扫描命令，避免执行时才发现风险。
- **Policy enforcement point**：`ctx.ask` 是工具层的统一权限入口。
- **Adapter**：`cmd` 把不同平台 shell 差异适配成 `ChildProcess.make`。
- **Streaming progress update**：进程输出不是最后一次性写入，而是持续更新 metadata。
- **Resource scope**：parser tree、child process、output sink 都在 Effect scope 中管理。
- **Backpressure by truncation**：输出过长时保留文件，只回传摘要，防止污染上下文窗口。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：`ShellTool` 通过 `Tool.define` 注册，执行函数签名是 `execute(params, ctx)`。来源：`packages/opencode/src/tool/shell.ts:334-645`。
- 和 Provider：Provider 不直接执行 shell。Provider/LLM 只看到工具 schema，模型发出 tool call 后 runtime 执行。来源：`packages/opencode/src/session/tools.ts:75-116`。
- 和 Session：执行中通过 `ctx.metadata` 更新 `ToolPart`；用户直接 shell 路径会手工创建 user/assistant message。来源：`packages/opencode/src/session/prompt.ts:511-559`。
- 和权限：`ctx.ask` 会进入 `Permission.ask`，可能等待用户回复。来源：`packages/opencode/src/permission/index.ts:161-196`。
- 和文件系统：`collect` 会用 `fs.isDir` 判断路径是目录还是文件，并用 `containsPath` 判断是否超出 instance。来源：`packages/opencode/src/tool/shell.ts:393-400`。
- 和插件：`shell.env` hook 可以给每次命令注入环境变量。来源：`packages/opencode/src/tool/shell.ts:412-422`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

最小实现不要先追 tree-sitter，可以先写保守版：

```ts
type ShellResult = {
  exitCode: number | null
  output: string
  truncated: boolean
}

async function runShellTool(input: {
  command: string
  cwd: string
  timeoutMs?: number
}, ctx: {
  ask(permission: string, patterns: string[]): Promise<void>
  updateMetadata(meta: Record<string, unknown>): Promise<void>
  signal: AbortSignal
}): Promise<ShellResult> {
  const pattern = input.command.split(/\s+/).slice(0, 2).join(" ") + " *"
  await ctx.ask("shell", [pattern])

  // 真实项目里用 execa / child_process.spawn，并处理 stdout/stderr 流。
  // 第一版 mini agent 可以只支持非交互命令，设置 timeout，并限制输出长度。
  throw new Error("implement spawn + streaming + timeout")
}
```

实现顺序：

1. 支持 `cwd`、`timeout`、`AbortSignal`。
2. stdout/stderr 合并为一个 stream。
3. 每来一段输出就更新 tool metadata。
4. 输出超过阈值时截断。
5. 加入简单 permission pattern，例如 `npm test *`、`git status *`。
6. 再考虑 AST 解析和外部目录检测。

## 12. 费曼复述区

请你不看源码复述：

1. 为什么 shell tool 不能直接 `exec(command)`？
2. `collect` 输出的 `dirs`、`patterns`、`always` 分别有什么用？
3. `ctx.ask` 和 `Permission.ask` 的职责差异是什么？
4. 为什么 OpenCode 要把 shell 输出持续写入 metadata，而不是等命令结束？
5. 用户直接执行 shell 和模型调用 shell tool 的 session 记录有什么共同点和差异？

如果说不出来，通常是卡在这三处：

- 把“模型决定调用工具”和“runtime 执行工具”混成一件事。
- 只看到 `ChildProcess.make`，忽略了执行前的 `parse/collect/ask`。
- 没有把 shell result 和下一轮 LLM message history 联系起来。

换一种说法：Shell 模块本质是 agent 的“手”，但这只手每次伸出去前都要看权限单，伸出去时要录像，回来后要把结果贴回会话记录。

## 13. 练习题

### 入门题

1. 在 `packages/opencode/src/tool/shell.ts` 中找到 `CWD`、`FILES`、`CMD_FILES`，解释它们为什么要分开。
2. 找到 `defaultTimeout`，说明默认值来自哪里。
3. 找到 `stdin: "ignore"`，解释为什么这对 agent 很重要。

### 进阶题

1. 阅读 `collect`，说明 `cd /tmp` 和 `cat /tmp/a.txt` 在扫描结果上有什么差异。
2. 阅读 `run`，说明输出过长时 `file`、`cut`、`outputPath` 如何协作。
3. 阅读 `Permission.ask`，说明 deny、allow、ask 三种结果分别怎样影响 shell 执行。

### 源码追踪题

1. 从 `ToolRegistry` 找到 shell tool 如何被注册。
2. 从 `SessionTools.resolve` 找到 shell tool 的 `execute` 如何被 AI SDK 调用。
3. 从 `ctx.metadata` 追到 `SessionProcessor` 如何更新 tool part。
4. 从 `SessionPrompt.shellImpl` 追踪用户直接 shell 命令如何变成 synthetic user part。

### 小实现题

实现一个 mini shell runner：

- 输入：`command`、`cwd`、`timeoutMs`。
- 执行前要求 `permission.ask("shell", [pattern])`。
- 实时收集输出，只保存最后 200 行。
- 超时后 kill 进程。
- 返回 `{ exitCode, output, truncated }`。

## 14. 源码追踪任务

建议打开这些文件，边读边画链路：

1. `packages/opencode/src/tool/registry.ts`：找到 `shell: Tool.init(shell)`。
2. `packages/opencode/src/session/tools.ts`：看 `context.metadata` 和 `context.ask`。
3. `packages/opencode/src/tool/shell.ts`：按 `execute -> parse -> collect -> ask -> run` 做笔记。
4. `packages/opencode/src/permission/index.ts`：追踪 pending permission 如何等待 reply。
5. `packages/opencode/src/session/prompt.ts`：比较 `shellImpl` 和 agent loop tool call 的差异。

## 15. 面试式自测

1. 如果模型想执行 `rm -rf /tmp/foo`，OpenCode 代码里有哪些机会阻止它？
2. 为什么 shell 输出需要截断？截断信息保存在哪里？
3. 如果命令卡住不退出，哪段代码负责超时？
4. 如果用户点击取消，哪段代码会 kill 子进程？
5. 为什么 shell module 要关心 PowerShell、cmd、bash 的差异？
6. 如果要加“禁止 sudo”策略，应该放在 `collect`、`ask`、还是 `Permission.evaluate`？请说明取舍。

## 16. 下一步阅读建议

下一章建议读 “模型 Provider / LLM 调用”。Shell tool 是 agent 的行动能力，而 Provider 章会告诉你：模型如何拿到 tool schema、如何流式返回 tool call，以及不同 provider 的消息格式为什么要被转换。


