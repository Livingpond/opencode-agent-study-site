# 文件读写与代码修改

> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.6 文件读写与代码修改”。  
> 主要源码：`packages/opencode/src/tool/read.ts`、`edit.ts`、`write.ts`、`external-directory.ts`、`packages/opencode/src/lsp/lsp.ts`。

## 0. 本章学习目标

你会学到：read/edit/write 工具如何定义参数，如何解析相对/绝对路径，如何检查外部目录，如何申请 read/edit 权限，如何写文件、格式化、发布文件事件，以及如何用 LSP diagnostics 反馈给模型。

## 1. 一句话讲明白

文件读写模块是 coding agent 真正改变工程的地方：它把模型的 read/edit/write 意图变成受权限保护、可诊断、可反馈的文件系统操作。来源：`packages/opencode/src/tool/read.ts:200-260`、`packages/opencode/src/tool/edit.ts:88-208`、`packages/opencode/src/tool/write.ts:38-102`。

## 2. 它在 OpenCode agent 中的位置

它位于 Tool 系统下面，是最关键的本地能力。`SessionTools.resolve` 把 read/edit/write 暴露给模型；模型发起 tool-call；工具执行时走路径解析、权限、文件操作、格式化、LSP 诊断；结果再写回 `ToolPart`。来源：`packages/opencode/src/session/tools.ts:75-116`、`packages/opencode/src/tool/read.ts:200-260`。

## 3. 生活类比

像让助理改合同：助理不能直接乱改。它先确认文件在哪里，检查是否越权，展示变更 diff，请你批准，再修改文件，最后跑一遍检查，告诉你还有哪些错误。

## 4. Java 开发者类比

- `ReadTool` / `EditTool` / `WriteTool` 类似三个 Application Service。
- `AppFileSystem` 类似 FileRepository。
- `ctx.ask` 类似审批拦截器。
- `Format.Service` 类似保存后的 formatter hook。
- `LSP.Service` 类似 IDE/编译器诊断服务。
- `Bus.publish(File.Event.Edited)` 类似 domain event。

## 5. 最小源码路径

1. `packages/opencode/src/tool/read.ts:29-39`：read 参数和 tool 定义。
2. `packages/opencode/src/tool/read.ts:200-260`：路径解析、外部目录检查、read 权限、目录输出。
3. `packages/opencode/src/tool/edit.ts:47-65`：edit 参数和依赖。
4. `packages/opencode/src/tool/edit.ts:88-160`：diff、审批、写文件、格式化、事件。
5. `packages/opencode/src/tool/edit.ts:192-208`：LSP diagnostics 反馈。
6. `packages/opencode/src/tool/write.ts:20-30`：write 参数和定义。
7. `packages/opencode/src/tool/write.ts:38-102`：写文件完整流程。
8. `packages/opencode/src/tool/external-directory.ts:16-45`：外部目录审批。
9. `packages/opencode/src/lsp/lsp.ts:346-379`：touchFile/diagnostics。

## 6. 用户输入到 agent 行动的整体链路

```text
model emits read/edit/write tool-call
  -> SessionTools.resolve execute
  -> ReadTool/EditTool/WriteTool.execute
  -> path resolve and external directory check
  -> ctx.ask(read/edit)
  -> fs read/write
  -> format.file for edit/write
  -> File.Event.Edited and FileWatcher.Event.Updated
  -> lsp.touchFile + lsp.diagnostics
  -> ToolResult output to model
```

## 7. 核心源码逐段讲解

### 7.1 ReadTool 参数

```ts
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file or directory to read" }),
  offset: Schema.optional(NonNegativeInt),
  limit: Schema.optional(NonNegativeInt),
})
```

路径：`packages/opencode/src/tool/read.ts:29-37`

读工具支持文件和目录，也支持分页读取。

### 7.2 ReadTool 路径和权限

```ts
let filepath = params.filePath
if (!path.isAbsolute(filepath)) {
  filepath = path.resolve(instance.directory, filepath)
}
yield* assertExternalDirectoryEffect(ctx, filepath, {
  bypass: Boolean(ctx.extra?.["bypassCwdCheck"]) || (yield* reference.contains(filepath)),
  kind: stat?.type === "Directory" ? "directory" : "file",
})

yield* ctx.ask({
  permission: "read",
  patterns: [path.relative(instance.worktree, filepath)],
  always: ["*"],
  metadata: {},
})
```

路径：`packages/opencode/src/tool/read.ts:200-232`

这里有两道边界：外部目录审批、read 权限审批。

### 7.3 外部目录检查

```ts
if (options?.bypass) return
const ins = yield* InstanceState.context
if (containsPath(full, ins)) return
const glob = path.join(dir, "*").replaceAll("\\", "/")
yield* ctx.ask({
  permission: "external_directory",
  patterns: [glob],
  always: [glob],
  metadata: { filepath: full, parentDir: dir },
})
```

路径：`packages/opencode/src/tool/external-directory.ts:16-45`

这说明 prompt 里说“不要乱访问外部目录”不够，runtime 必须 enforce。

### 7.4 EditTool 参数

```ts
export const Parameters = Schema.Struct({
  filePath: Schema.String,
  oldString: Schema.String,
  newString: Schema.String,
  replaceAll: Schema.optional(Schema.Boolean),
})
```

路径：`packages/opencode/src/tool/edit.ts:47-56`

Edit 是基于 oldString/newString 的替换式修改，不是直接让模型传 patch 字符串。

### 7.5 EditTool diff 和审批

```ts
diff = trimDiff(createTwoFilesPatch(filePath, filePath, contentOld, contentNew))
yield* ctx.ask({
  permission: "edit",
  patterns: [path.relative(instance.worktree, filePath)],
  always: ["*"],
  metadata: {
    filepath: filePath,
    diff,
  },
})
yield* afs.writeWithDirs(filePath, Bom.join(contentNew, desiredBom))
```

路径：`packages/opencode/src/tool/edit.ts:90-107`、`packages/opencode/src/tool/edit.ts:133-151`

审批 metadata 带 diff，所以 UI/用户可以看到即将发生的变更。

### 7.6 EditTool 写入后格式化和事件

```ts
if (yield* format.file(filePath)) {
  contentNew = yield* Bom.syncFile(afs, filePath, desiredBom)
}
yield* bus.publish(File.Event.Edited, { file: filePath })
yield* bus.publish(FileWatcher.Event.Updated, {
  file: filePath,
  event: "change",
})
```

路径：`packages/opencode/src/tool/edit.ts:151-159`

文件写入不是静默操作，而会触发事件，给 UI/同步/后续逻辑使用。

### 7.7 EditTool LSP 诊断

```ts
let output = "Edit applied successfully."
yield* lsp.touchFile(filePath, "document")
const diagnostics = yield* lsp.diagnostics()
const block = LSP.Diagnostic.report(filePath, diagnostics[normalizedFilePath] ?? [])
if (block) output += `\n\nLSP errors detected in this file, please fix:\n${block}`
```

路径：`packages/opencode/src/tool/edit.ts:192-198`

诊断文本进入 tool output，模型下一轮能继续修复。

### 7.8 WriteTool 完整写入

```ts
const filepath = path.isAbsolute(params.filePath)
  ? params.filePath
  : path.join(instance.directory, params.filePath)
yield* assertExternalDirectoryEffect(ctx, filepath)
const exists = yield* fs.existsSafe(filepath)
const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))
yield* ctx.ask({ permission: "edit", patterns: [path.relative(instance.worktree, filepath)], metadata: { filepath, diff } })
yield* fs.writeWithDirs(filepath, Bom.join(contentNew, desiredBom))
```

路径：`packages/opencode/src/tool/write.ts:38-64`

Write 和 Edit 一样走 edit 权限，因为它会改变文件。

### 7.9 WriteTool 项目级 diagnostics

```ts
yield* lsp.touchFile(filepath, "document")
const diagnostics = yield* lsp.diagnostics()
for (const [file, issues] of Object.entries(diagnostics)) {
  const current = file === normalizedFilepath
  const block = LSP.Diagnostic.report(current ? filepath : file, issues)
  if (current) {
    output += `\n\nLSP errors detected in this file, please fix:\n${block}`
    continue
  }
  output += `\n\nLSP errors detected in other files:\n${block}`
}
```

路径：`packages/opencode/src/tool/write.ts:74-90`

WriteTool 不只报告当前文件，还会有限报告其他文件的诊断。

### 7.10 LSP touch 和 diagnostics

```ts
const clients = yield* getClients(input)
yield* Effect.promise(() =>
  Promise.all(
    clients.map(async (client) => {
      const version = await client.notify.open({ path: input })
      if (!diagnostics) return
      return client.waitForDiagnostics({ path: input, version, mode: diagnostics, after })
    }),
  ).catch((err) => {
    log.error("failed to touch file", { err, file: input })
  }),
)
```

路径：`packages/opencode/src/lsp/lsp.ts:346-366`

这把文件修改和语言服务反馈连接起来。

## 8. 关键 TypeScript 语法复习

- `Schema.Struct` 定义工具参数。来源：`read.ts:29-37`、`edit.ts:47-56`。
- optional property：`offset`、`limit`、`replaceAll`。来源同上。
- Effect error recovery：`fs.stat(...).pipe(Effect.catchIf(...))`。来源：`read.ts:215-220`。
- object literal metadata：`metadata: { filepath, diff }`。来源：`write.ts:54-62`。
- template literal：把 diagnostics 拼进 output。来源：`edit.ts:197`、`write.ts:85-89`。
- path normalization：`process.platform === "win32"` 分支。来源：`read.ts:209-211`、`external-directory.ts:26-34`。

## 9. 涉及的设计模式和架构思想

- Policy enforcement：外部目录和 read/edit permission。
- Unit of Work：编辑时锁定文件，生成 diff，写入，格式化，诊断。
- Domain Event：发布 `File.Event.Edited` 和 `FileWatcher.Event.Updated`。
- Feedback Loop：LSP diagnostics 进入 tool output，供模型继续推理。
- Adapter：工具把模型参数适配成本地文件系统操作。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- Tool：通过 `Tool.define` 暴露为工具。来源：`read.ts:39-41`、`edit.ts:58-60`、`write.ts:27-30`。
- Session：Tool.Context 带 session/message，用于权限和结果回写。
- 文件系统：`AppFileSystem` 负责 stat/read/writeWithDirs。
- LSP：`lsp.touchFile` 和 `lsp.diagnostics` 提供反馈。
- Provider：本章不直接接触 Provider；Provider 只通过工具 schema 间接影响模型如何调用工具。这个判断来自本章源码未看到 provider service 直接参与 read/edit/write 执行，需要在 Provider 章验证工具 schema transform。

## 11. 如果自己实现 mini agent，这一章对应什么代码

```ts
async function editFile(args: { filePath: string; oldString: string; newString: string }, ctx: ToolContext) {
  const filePath = resolveInsideProject(args.filePath, ctx.cwd)
  const oldContent = await fs.readFile(filePath, "utf8")
  const newContent = oldContent.replace(args.oldString, args.newString)
  const diff = makeDiff(oldContent, newContent)
  await ctx.ask({ permission: "edit", patterns: [relative(ctx.root, filePath)], metadata: { diff } })
  await fs.writeFile(filePath, newContent)
  const diagnostics = await runTypecheckOrLsp(filePath)
  return { output: diagnostics ? `Edit applied.\n${diagnostics}` : "Edit applied." }
}
```

## 12. 费曼复述区

请复述：

1. ReadTool 执行前有哪些边界检查？
2. EditTool 为什么要生成 diff 再 ask？
3. LSP diagnostics 为什么要进入 tool output？

换一种说法：文件工具的目标不是“能改文件”，而是“可控地改文件，并把后果反馈给模型”。

## 13. 练习题

### 入门题

1. 找到 ReadTool 的参数定义。
2. 找到 EditTool 申请 `edit` 权限的代码。
3. 找到 WriteTool 调用 `lsp.touchFile` 的代码。

### 进阶题

1. 解释 `external_directory` 和 `read/edit` 两类权限的区别。
2. 解释为什么写入后要格式化。
3. 解释为什么 edit 要处理 BOM 和行尾。

### 小实现题

实现一个 `writeFile` tool：写文件前生成 diff，调用 `ctx.ask`，写入后运行一个假 diagnostics 函数。

## 14. 源码追踪任务

1. 从 `ToolRegistry` 的 `read/edit/write` 初始化追到具体工具文件。
2. 从 `ReadTool.execute` 追到 `assertExternalDirectoryEffect`。
3. 从 `EditTool` 的 `ctx.ask` 追到 permission 模块。
4. 从 `WriteTool` 的 `lsp.touchFile` 追到 `LSP.diagnostics`。
5. 从 `FileWatcher.Event.Updated` 追到 UI 或同步事件消费者。

## 15. 面试式自测

1. 为什么文件工具不能直接 `fs.writeFile`？
2. 如何防止 agent 修改项目外的文件？
3. 为什么 diff 要放进权限请求 metadata？
4. LSP diagnostics 对 agent loop 有什么作用？
5. `read` 和用户通过 `--file` 附加文件时的 read 有什么差异？

## 16. 下一步阅读建议

下一章读 “Shell / 命令执行”。文件工具和 shell 工具都操作本地环境，但 shell 的风险更高，会引入命令解析、cwd、timeout、环境变量和更复杂的权限扫描。

