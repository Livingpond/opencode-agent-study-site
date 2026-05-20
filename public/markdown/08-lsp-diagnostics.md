# LSP / 诊断 / 上下文增强

> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.8 LSP / 诊断 / 上下文增强”。  
> 主要源码：`packages/opencode/src/lsp/lsp.ts`、`packages/opencode/src/lsp/client.ts`、`packages/opencode/src/lsp/server.ts`、`packages/opencode/src/lsp/diagnostic.ts`、`packages/opencode/src/tool/lsp.ts`、`packages/opencode/src/tool/edit.ts`、`packages/opencode/src/tool/write.ts`。

## 0. 本章学习目标

这一章要理解 OpenCode 如何把“代码编辑后有没有错”和“代码语义查询”接回 agent。

学完你应该能说明：

- LSP service 如何按文件类型和 project root 懒启动 language server。
- `touchFile` 为什么会 open/change 文件并等待 diagnostics。
- edit/write 工具如何把 LSP 错误追加到 tool output。
- lsp tool 如何提供 hover、definition、references、documentSymbol 等语义能力。
- LSP client 如何处理 push diagnostics 和 pull diagnostics。
- 为什么 LSP 是 agent 的上下文增强，而不是核心 loop 的替代品。

## 1. 一句话讲明白

LSP 模块是 OpenCode 的“代码语义反馈层”：它按文件找到可用 language server，懒启动 JSON-RPC client，编辑后通过 `touchFile` 通知 LSP 并等待 diagnostics，再把错误报告塞回 tool output；同时 `lsp` tool 允许模型主动查询定义、引用、hover、符号和调用层级。来源：`packages/opencode/src/lsp/lsp.ts:211-299`、`packages/opencode/src/lsp/lsp.ts:346-379`、`packages/opencode/src/tool/edit.ts:192-207`、`packages/opencode/src/tool/lsp.ts:37-110`。

## 2. 它在 OpenCode agent 中的位置

LSP 有两条主要路径：

```text
edit/write tool
  -> modify file
  -> lsp.touchFile(file, "document" or "full")
  -> lsp.diagnostics()
  -> Diagnostic.report(...)
  -> tool output includes errors
  -> next LLM round sees diagnostics
```

和：

```text
model calls lsp tool
  -> permission ask("lsp")
  -> lsp.touchFile(file, "document")
  -> lsp.definition / references / hover / symbols
  -> JSON result returned as tool output
```

关键判断：

- `LSP.Interface` 既有 `touchFile/diagnostics`，也有 hover/definition/references 等语义接口。来源：`packages/opencode/src/lsp/lsp.ts:123-138`。
- `EditTool` 修改后调用 `lsp.touchFile(filePath, "document")` 并读取 diagnostics。来源：`packages/opencode/src/tool/edit.ts:192-197`。
- `WriteTool` 修改后会报告当前文件和其它文件的 diagnostics。来源：`packages/opencode/src/tool/write.ts:80-99`。
- `LspTool` 在执行语义查询前也调用 `lsp.touchFile(file, "document")`。来源：`packages/opencode/src/tool/lsp.ts:77-83`。

## 3. 生活类比

把 LSP 想成你身边的 IDE 审稿员。

你改完代码以后，IDE 会告诉你：“第 12 行类型不对”“这个方法不存在”。OpenCode 也是这样：agent 用 edit/write 改文件以后，LSP 模块会让 language server 重新看这份文件，把诊断结果交回给工具输出。下一轮模型看到这些错误，就可以继续修。

主动查询部分像在 IDE 里按 F12、找引用、看 hover 文档。模型也可以通过 `lsp` tool 做这些动作，而不只是 grep 字符串。

## 4. Java 开发者类比

- `LSP.Service` 像一个 `LanguageIntelligenceService`。
- `LSPServer.Info` 像 language server 的 `FactoryBean`，包含 extensions、root finder 和 spawn 方法。
- `LSPClient.create` 像初始化一个 JSON-RPC client。
- `touchFile` 像 IDE 的 `documentOpened/documentChanged` 事件。
- `Diagnostic.report` 像把编译错误格式化成 agent 可读文本。
- `LspTool` 像把 IDE 功能暴露成 remote service。

Java 后端类比：

```java
List<LspClient> clients = lspRegistry.getClients(file);
for (LspClient client : clients) {
    int version = client.openOrChange(file);
    client.waitForDiagnostics(file, version);
}
Map<Path, List<Diagnostic>> diagnostics = lspRegistry.diagnostics();
toolResult.append(DiagnosticReport.forFile(file, diagnostics.get(file)));
```

## 5. 最小源码路径

1. `packages/opencode/src/lsp/lsp.ts:123-138`：LSP service interface。
2. `packages/opencode/src/lsp/lsp.ts:148-208`：加载 server 配置和初始化 state。
3. `packages/opencode/src/lsp/lsp.ts:211-299`：`getClients` 按文件懒启动 LSP client。
4. `packages/opencode/src/lsp/lsp.ts:346-379`：`touchFile` 和 `diagnostics`。
5. `packages/opencode/src/lsp/client.ts:141-244`：创建 JSON-RPC connection 和处理 server request/notification。
6. `packages/opencode/src/lsp/client.ts:248-305`：initialize handshake 和 capabilities。
7. `packages/opencode/src/lsp/client.ts:421-483`：pull diagnostics 请求。
8. `packages/opencode/src/lsp/client.ts:594-692`：open/change 文件并等待 diagnostics。
9. `packages/opencode/src/lsp/diagnostic.ts:5-27`：诊断格式化。
10. `packages/opencode/src/tool/lsp.ts:37-110`：把 LSP 操作暴露成 tool。
11. `packages/opencode/src/tool/edit.ts:192-207`、`packages/opencode/src/tool/write.ts:80-99`：编辑后诊断回填。

## 6. 用户输入到 agent 行动的整体链路

### 6.1 edit/write 后触发诊断

编辑成功后，`EditTool` 会触发 LSP：

```ts
let output = "Edit applied successfully."
yield* lsp.touchFile(filePath, "document")
const diagnostics = yield* lsp.diagnostics()
const normalizedFilePath = AppFileSystem.normalizePath(filePath)
const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])
if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`
```

路径：`packages/opencode/src/tool/edit.ts:192-197`

`WriteTool` 会把当前文件和其它文件的 diagnostics 都拼到输出里：

```ts
const block = LSP.Diagnostic.report(current ? filepath : file, issues)
if (!block) continue
if (current) {
  output += `\n\nLSP errors detected in this file, please fix:\n${block}`
  continue
}
projectDiagnosticsCount++
output += `\n\nLSP errors detected in other files:\n${block}`
```

路径：`packages/opencode/src/tool/write.ts:80-89`

这就是 agent 能“改了继续修”的关键反馈链路。

### 6.2 lsp tool 主动查询语义

```ts
const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
] as const
```

路径：`packages/opencode/src/tool/lsp.ts:11-21`

执行时先做路径和权限检查：

```ts
const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(instance.directory, args.filePath)
yield* assertExternalDirectoryEffect(ctx, file)
yield* ctx.ask({
  permission: "lsp",
  patterns: ["*"],
  always: ["*"],
  metadata: meta,
})
```

路径：`packages/opencode/src/tool/lsp.ts:47-61`

然后检查文件存在、是否有可用 client，触发 document diagnostics，再执行具体操作：

```ts
const exists = yield* fs.existsSafe(file)
if (!exists) throw new Error(`File not found: ${file}`)

const available = yield* lsp.hasClients(file)
if (!available) throw new Error("No LSP server available for this file type.")

yield* lsp.touchFile(file, "document")

const result: unknown[] = yield* (() => {
  switch (args.operation) {
    case "goToDefinition":
      return lsp.definition(position)
    case "findReferences":
      return lsp.references(position)
    case "hover":
      return lsp.hover(position)
    case "documentSymbol":
      return lsp.documentSymbol(uri)
    case "workspaceSymbol":
      return lsp.workspaceSymbol(args.query ?? "")
    ...
  }
})()
```

路径：`packages/opencode/src/tool/lsp.ts:74-103`

### 6.3 按文件懒启动 LSP client

```ts
const getClients = Effect.fnUntraced(function* (file: string) {
  const ctx = yield* InstanceState.context
  if (!containsPath(file, ctx)) return [] as LSPClient.Info[]
  const s = yield* InstanceState.get(state)
  return yield* Effect.promise(async () => {
    const extension = path.parse(file).ext || file
    const result: LSPClient.Info[] = []

    for (const server of Object.values(s.servers)) {
      if (server.extensions.length && !server.extensions.includes(extension)) continue

      const root = await server.root(file, ctx)
      if (!root) continue
      if (s.broken.has(root + server.id)) continue

      const match = s.clients.find((x) => x.root === root && x.serverID === server.id)
      if (match) {
        result.push(match)
        continue
      }

      const inflight = s.spawning.get(root + server.id)
      if (inflight) {
        const client = await inflight
        if (!client) continue
        result.push(client)
        continue
      }

      const task = schedule(server, root, root + server.id)
      s.spawning.set(root + server.id, task)
      const client = await task
      if (!client) continue

      result.push(client)
      await Bus.publish(ctx, Event.Updated, {})
    }

    return result
  })
})
```

路径：`packages/opencode/src/lsp/lsp.ts:211-299`

关键点：

- 只处理 instance 内部文件：`containsPath(file, ctx)`。
- 根据 extension 匹配 server。
- 根据 server root function 找项目根。
- 已有 client 直接复用。
- 正在 spawn 的 client 复用 inflight promise，避免重复启动。
- 启动失败会放入 `broken`，避免反复重试。

## 7. 核心源码逐段讲解

### 7.1 LSP service interface

```ts
export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<Status[]>
  readonly hasClients: (file: string) => Effect.Effect<boolean>
  readonly touchFile: (input: string, diagnostics?: "document" | "full") => Effect.Effect<void>
  readonly diagnostics: () => Effect.Effect<Record<string, LSPClient.Diagnostic[]>>
  readonly hover: (input: LocInput) => Effect.Effect<any>
  readonly definition: (input: LocInput) => Effect.Effect<any[]>
  readonly references: (input: LocInput) => Effect.Effect<any[]>
  readonly implementation: (input: LocInput) => Effect.Effect<any[]>
  readonly documentSymbol: (uri: string) => Effect.Effect<(DocumentSymbol | Symbol)[]>
  readonly workspaceSymbol: (query: string) => Effect.Effect<Symbol[]>
  readonly prepareCallHierarchy: (input: LocInput) => Effect.Effect<any[]>
  readonly incomingCalls: (input: LocInput) => Effect.Effect<any[]>
  readonly outgoingCalls: (input: LocInput) => Effect.Effect<any[]>
}
```

路径：`packages/opencode/src/lsp/lsp.ts:123-138`

这个接口分三类：生命周期/状态、诊断、语义查询。

### 7.2 server 配置和自定义 LSP

```ts
if (!cfg.lsp) {
  log.info("all LSPs are disabled")
} else {
  for (const server of Object.values(LSPServer)) {
    servers[server.id] = server
  }

  filterExperimentalServers(servers, flags)

  if (cfg.lsp !== true) {
    for (const [name, item] of Object.entries(cfg.lsp)) {
      const existing = servers[name]
      if (item.disabled) {
        delete servers[name]
        continue
      }
      servers[name] = {
        ...existing,
        id: name,
        root: existing?.root ?? (async (_file, ctx) => ctx.directory),
        extensions: item.extensions ?? existing?.extensions ?? [],
        spawn: async (root) => ({
          process: lspspawn(item.command[0], item.command.slice(1), {
            cwd: root,
            env: { ...process.env, ...item.env },
          }),
          initialization: item.initialization,
        }),
      }
    }
  }
}
```

路径：`packages/opencode/src/lsp/lsp.ts:154-185`

LSP 可以全关、使用内置 server，也可以通过配置覆盖/新增 server。这里的 `spawn` 是用户配置命令。

### 7.3 TypeScript language server 配置

```ts
export const Typescript: Info = {
  id: "typescript",
  root: NearestRoot(
    ["package-lock.json", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock"],
    ["deno.json", "deno.jsonc"],
  ),
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  async spawn(root, ctx) {
    const tsserver = Module.resolve("typescript/lib/tsserver.js", ctx.directory)
    if (!tsserver) return
    const bin = await Npm.which("typescript-language-server")
    if (!bin) return
    const proc = spawn(bin, ["--stdio"], {
      cwd: root,
      env: { ...process.env },
    })
    return {
      process: proc,
      initialization: {
        tsserver: { path: tsserver },
      },
    }
  },
}
```

路径：`packages/opencode/src/lsp/server.ts:94-121`

Java 类比：这是一个 `LanguageServerFactory`，按文件扩展和项目根决定是否能服务。

### 7.4 创建 JSON-RPC client

```ts
const connection = createMessageConnection(
  new StreamMessageReader(input.server.process.stdout as any),
  new StreamMessageWriter(input.server.process.stdin as any),
)
```

路径：`packages/opencode/src/lsp/client.ts:152-155`

LSP 本质是基于 stdin/stdout 的 JSON-RPC。OpenCode 启动 language server 进程，然后用 `vscode-jsonrpc` 建连接。

initialize 请求：

```ts
const initialized = await withTimeout(
  connection.sendRequest<{ capabilities?: ServerCapabilities }>("initialize", {
    rootUri: pathToFileURL(input.root).href,
    processId: input.server.process.pid,
    workspaceFolders: [
      {
        name: "workspace",
        uri: pathToFileURL(input.root).href,
      },
    ],
    initializationOptions: {
      ...input.server.initialization,
    },
    capabilities: {
      workspace: {
        configuration: true,
        didChangeWatchedFiles: { dynamicRegistration: true },
        diagnostics: { refreshSupport: false },
      },
      textDocument: {
        synchronization: { didOpen: true, didChange: true },
        diagnostic: { dynamicRegistration: true, relatedDocumentSupport: true },
        publishDiagnostics: { versionSupport: false },
      },
    },
  }),
  INITIALIZE_TIMEOUT_MS,
)
```

路径：`packages/opencode/src/lsp/client.ts:248-290`

### 7.5 push diagnostics 和 pull diagnostics

push diagnostics 来自 server 主动推送：

```ts
connection.onNotification("textDocument/publishDiagnostics", (params) => {
  const filePath = getFilePath(params.uri)
  if (!filePath) return
  published.set(filePath, {
    at: Date.now(),
    version: typeof params.version === "number" ? params.version : undefined,
  })
  if (shouldSeedDiagnosticsOnFirstPush(input.serverID) && !pushDiagnostics.has(filePath)) {
    pushDiagnostics.set(filePath, params.diagnostics)
    return
  }
  updatePushDiagnostics(filePath, params.diagnostics)
})
```

路径：`packages/opencode/src/lsp/client.ts:191-208`

pull diagnostics 是 OpenCode 主动请求：

```ts
async function requestDiagnosticReport(filePath: string, identifier?: string): Promise<DiagnosticRequestResult> {
  const report = await withTimeout(
    connection.sendRequest<DocumentDiagnosticReport | null>("textDocument/diagnostic", {
      ...(identifier ? { identifier } : {}),
      textDocument: {
        uri: pathToFileURL(filePath).href,
      },
    }),
    DIAGNOSTICS_REQUEST_TIMEOUT_MS,
  ).catch(() => null)
  if (!report) return { handled: false, matched: false, byFile: new Map<string, Diagnostic[]>() }
  ...
}
```

路径：`packages/opencode/src/lsp/client.ts:332-366`

这解释了为什么 LSP diagnostics 逻辑比“读一个错误列表”复杂：有些 server push，有些支持 pull，有些动态注册 diagnostic capability。

### 7.6 touchFile

```ts
const touchFile = Effect.fn("LSP.touchFile")(function* (input: string, diagnostics?: "document" | "full") {
  const clients = yield* getClients(input)
  yield* Effect.promise(() =>
    Promise.all(
      clients.map(async (client) => {
        const after = Date.now()
        const version = await client.notify.open({ path: input })
        if (!diagnostics) return
        return client.waitForDiagnostics({
          path: input,
          version,
          mode: diagnostics,
          after,
        })
      }),
    ).catch((err) => {
      log.error("failed to touch file", { err, file: input })
    }),
  )
})
```

路径：`packages/opencode/src/lsp/lsp.ts:346-366`

`touchFile` 做两件事：打开/变更文件，必要时等待诊断。它吞掉错误并记录日志，避免 LSP 故障直接让 edit/write 失败。

### 7.7 client.notify.open

```ts
async open(request: { path: string }) {
  request.path = Filesystem.normalizePath(
    path.isAbsolute(request.path) ? request.path : path.resolve(input.directory, request.path),
  )
  const text = await Filesystem.readText(request.path)
  const extension = path.extname(request.path)
  const languageId = LANGUAGE_EXTENSIONS[extension] ?? "plaintext"

  const document = files[request.path]
  if (document !== undefined) {
    await connection.sendNotification("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToFileURL(request.path).href, type: FILE_CHANGE_CHANGED }],
    })
    const next = document.version + 1
    files[request.path] = { version: next, text }
    await connection.sendNotification("textDocument/didChange", {
      textDocument: { uri: pathToFileURL(request.path).href, version: next },
      contentChanges: syncKind === TEXT_DOCUMENT_SYNC_INCREMENTAL
        ? [{ range: { start: { line: 0, character: 0 }, end: endPosition(document.text) }, text }]
        : [{ text }],
    })
    return next
  }

  await connection.sendNotification("textDocument/didOpen", {
    textDocument: {
      uri: pathToFileURL(request.path).href,
      languageId,
      version: 0,
      text,
    },
  })
  files[request.path] = { version: 0, text }
  return 0
}
```

路径：`packages/opencode/src/lsp/client.ts:594-669`

如果文件已经 open，就发 `didChange`；否则发 `didOpen`。这和 IDE 打开文件后编辑的行为一样。

### 7.8 diagnostics 聚合和格式化

```ts
const diagnostics = Effect.fn("LSP.diagnostics")(function* () {
  const results: Record<string, LSPClient.Diagnostic[]> = {}
  const all = yield* runAll(async (client) => client.diagnostics)
  for (const result of all) {
    for (const [p, diags] of result.entries()) {
      const arr = results[p] || []
      arr.push(...diags)
      results[p] = arr
    }
  }
  return results
})
```

路径：`packages/opencode/src/lsp/lsp.ts:368-379`

格式化：

```ts
export function report(file: string, issues: LSPClient.Diagnostic[]) {
  const errors = issues.filter((item) => item.severity === 1)
  if (errors.length === 0) return ""
  const limited = errors.slice(0, MAX_PER_FILE)
  const more = errors.length - MAX_PER_FILE
  const suffix = more > 0 ? `\n... and ${more} more` : ""
  return `<diagnostics file="${file}">\n${limited.map(pretty).join("\n")}${suffix}\n</diagnostics>`
}
```

路径：`packages/opencode/src/lsp/diagnostic.ts:20-27`

注意只报告 severity 为 1 的 errors，不把 warn/info/hint 都塞给模型。

## 8. 关键 TypeScript 语法复习

### `as const`

```ts
const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  ...
] as const
```

路径：`packages/opencode/src/tool/lsp.ts:11-21`

`as const` 让数组元素变成字面量类型，后面 `Schema.Literals(operations)` 可以生成 operation union。

### interface

```ts
export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly status: () => Effect.Effect<Status[]>
  ...
}
```

路径：`packages/opencode/src/lsp/lsp.ts:123-138`

Java 类比 interface，但 TS interface 只在编译期存在，运行时没有。

### optional parameter

```ts
readonly touchFile: (input: string, diagnostics?: "document" | "full") => Effect.Effect<void>
```

路径：`packages/opencode/src/lsp/lsp.ts:127`

`diagnostics?` 可以不传；如果传，只能是 `"document"` 或 `"full"`。

### generic function

```ts
const run = Effect.fnUntraced(function* <T>(file: string, fn: (client: LSPClient.Info) => Promise<T>) {
  const clients = yield* getClients(file)
  return yield* Effect.promise(() => Promise.all(clients.map((x) => fn(x))))
})
```

路径：`packages/opencode/src/lsp/lsp.ts:301-304`

`<T>` 表示返回类型由传入函数决定。Java 类比 `<T> List<T> run(String file, Function<Client, T> fn)`。

### getter

```ts
get diagnostics() {
  const result = new Map<string, Diagnostic[]>()
  ...
  return result
}
```

路径：`packages/opencode/src/lsp/client.ts:671-677`

这是 JS/TS getter，调用时像属性：`client.diagnostics`。

### Array flat/filter(Boolean)

```ts
return results.flat().filter(Boolean)
```

路径：`packages/opencode/src/lsp/lsp.ts:392-402`

把多 client 结果拍平，并过滤 null/undefined。Java 类比 stream `flatMap(...).filter(Objects::nonNull)`。

### discriminated switch

```ts
switch (args.operation) {
  case "goToDefinition":
    return lsp.definition(position)
  case "findReferences":
    return lsp.references(position)
  ...
}
```

路径：`packages/opencode/src/tool/lsp.ts:82-103`

operation 是 literal union，所以 switch 分支可被 TS 检查。

## 9. 涉及的设计模式和架构思想

- **Lazy initialization**：只在文件需要时启动 LSP client。
- **Factory**：`LSPServer.Info.spawn` 创建不同 language server。
- **Registry**：`servers` 和 `clients` 维护可用 server/client。
- **JSON-RPC adapter**：`LSPClient.create` 封装 stdin/stdout connection。
- **Feedback loop**：edit/write 后 diagnostics 回到 tool output，再进入下一轮 LLM。
- **Capability probing**：initialize 后根据 capabilities 决定 diagnostics 路径。
- **Best-effort enhancement**：`touchFile` 捕获错误记录日志，LSP 故障不应让文件编辑整体崩掉。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：edit/write 自动触发 diagnostics；lsp tool 暴露语义查询。来源：`packages/opencode/src/tool/edit.ts:192-207`、`packages/opencode/src/tool/write.ts:80-99`、`packages/opencode/src/tool/lsp.ts:37-110`。
- 和 Provider：Provider 不直接调用 LSP；LLM 通过 tool result 或主动 lsp tool 获取 LSP 信息。
- 和 Session：diagnostics 被写进 tool output，成为 message history 的一部分，下一轮模型能看到。
- 和文件系统：client.open 读取文件文本，发送 didOpen/didChange。来源：`packages/opencode/src/lsp/client.ts:594-669`。
- 和权限：lsp tool 会 `ctx.ask({ permission: "lsp" })`；外部路径还会走 external directory 检查。来源：`packages/opencode/src/tool/lsp.ts:47-61`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

mini agent 可以先实现“编辑后跑检查”的低配版，不必一开始接 LSP：

```ts
async function afterEdit(file: string, ctx: ToolContext) {
  const diagnostics = await diagnosticsService.check(file)
  if (diagnostics.errors.length === 0) {
    return "Edit applied successfully."
  }
  return [
    "Edit applied successfully.",
    "",
    "Diagnostics detected, please fix:",
    formatDiagnostics(file, diagnostics.errors),
  ].join("\n")
}
```

再逐步升级：

1. 用 `tsc --noEmit` 或 `eslint` 作为第一版 diagnostics。
2. 接入一个 TypeScript language server。
3. 实现 `touchFile`：open/change 文件。
4. 实现 `diagnostics()` 聚合。
5. 增加 `definition/hover/references` tool。
6. 把 errors 写回 tool result，让下一轮 LLM 修。

## 12. 费曼复述区

请你不看源码复述：

1. 为什么 edit/write 工具要在修改后调用 LSP？
2. `getClients` 为什么要按文件扩展和 root 懒启动？
3. `touchFile` 做了哪两件事？
4. push diagnostics 和 pull diagnostics 的差异是什么？
5. `lsp` tool 和 edit/write 自动 diagnostics 的关系是什么？

如果说不出来，常见卡点是：

- 把 LSP 当成一次性 lint 命令，没有理解它是长期运行的 JSON-RPC server。
- 只看 `lsp.diagnostics()`，没看 `touchFile` 如何让 server 更新状态。
- 没把 diagnostics 回填到 tool output 和下一轮 LLM 联系起来。

换一种说法：LSP 是 agent 的“IDE 感官”。agent 可以写代码，但 LSP 让它知道自己刚才写出来的代码有没有被语言服务认可。

## 13. 练习题

### 入门题

1. 找到 `LSP.Interface`，把方法分成 lifecycle、diagnostics、semantic query 三类。
2. 找到 `Typescript` server，说明它支持哪些文件扩展。
3. 找到 `Diagnostic.report`，说明它为什么只输出 error。

### 进阶题

1. 阅读 `getClients`，解释 `clients`、`spawning`、`broken` 三个状态集合的用途。
2. 阅读 `client.notify.open`，解释 didOpen 和 didChange 的差异。
3. 阅读 `waitForDocumentDiagnostics`，说明它如何同时等待 push 和 pull。

### 源码追踪题

1. 从 `EditTool` 的 `lsp.touchFile` 追到 `client.notify.open`。
2. 从 `WriteTool` 的 diagnostics 输出追到 `Diagnostic.report`。
3. 从 `LspTool.execute` 追到 `lsp.definition` 和 `connection.sendRequest("textDocument/definition")`。
4. 从 `LSPServer.Typescript.spawn` 追到 `LSPClient.create`。

### 小实现题

写一个 mini diagnostics service：

- `touchFile(file)`：记录文件版本。
- `diagnostics()`：返回 `{ [file]: Diagnostic[] }`。
- `report(file, diagnostics)`：只输出 error。
- 在 edit tool 修改后调用它，并把结果追加到 tool output。

## 14. 源码追踪任务

建议按这个顺序读：

1. `packages/opencode/src/tool/edit.ts:192-207`
2. `packages/opencode/src/lsp/lsp.ts:346-379`
3. `packages/opencode/src/lsp/lsp.ts:211-299`
4. `packages/opencode/src/lsp/client.ts:594-692`
5. `packages/opencode/src/lsp/client.ts:191-208`
6. `packages/opencode/src/lsp/client.ts:332-483`
7. `packages/opencode/src/tool/lsp.ts:37-110`

读完画一条链：`edit -> touchFile -> getClients -> notify.open -> wait diagnostics -> Diagnostic.report -> tool output`。

## 15. 面试式自测

1. 为什么 LSP client 要缓存，而不是每次查询都启动一个 language server？
2. 如果 language server 启动失败，OpenCode 如何避免反复失败？
3. 为什么 `touchFile` 捕获错误而不是让 edit/write 失败？
4. 为什么 `LspTool` 查询前还要做权限审批？
5. diagnostics 是 session 状态的一部分吗？它最终怎样进入下一轮推理？
6. 如果你要给 mini agent 加 Java 支持，你会在哪里增加 Java language server？

## 16. 下一步阅读建议

下一章建议读 “UI / TUI / Desktop / IDE”。LSP 和权限都通过事件、tool output 和 session 状态对外呈现，UI 章会看到这些状态如何被不同前端消费。

