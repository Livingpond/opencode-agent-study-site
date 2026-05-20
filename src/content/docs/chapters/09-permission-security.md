---
title: "权限、审批、安全边界"
description: "理解 allow/deny/ask ruleset 如何保护读写文件、执行命令和外部目录访问。"
sidebar:
  label: "09. 权限、审批、安全边界"
  order: 9
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>中等</div>
  <div><strong>预计阅读</strong>40 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/09-permission-security.md"><code>markdown/09-permission-security.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`09-permission-security`
- 章节摘要：理解 allow/deny/ask ruleset 如何保护读写文件、执行命令和外部目录访问。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/permission/index.ts</code></li>
<li><code>packages/opencode/src/permission/evaluate.ts</code></li>
<li><code>packages/opencode/src/permission/schema.ts</code></li>
<li><code>packages/opencode/src/agent/agent.ts</code></li>
<li><code>packages/opencode/src/session/tools.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.9 权限、审批、安全边界”。  
> 主要源码：`packages/opencode/src/permission/index.ts`、`packages/opencode/src/permission/evaluate.ts`、`packages/opencode/src/permission/schema.ts`、`packages/opencode/src/config/permission.ts`、`packages/opencode/src/agent/agent.ts`、`packages/opencode/src/session/tools.ts`、`packages/opencode/src/cli/cmd/run.ts`。

## 0. 本章学习目标

这一章要理解：模型不是直接拥有系统权限，OpenCode 在 tool runtime 和 session 之间放了一层权限系统。

学完你应该能说清：

- 权限规则由 `permission + pattern + action` 组成。
- `allow / deny / ask` 三种 action 在执行链路上的差异。
- `ctx.ask` 如何把工具请求变成 `Permission.ask`。
- `Permission.ask` 为什么要维护 pending map 和 Deferred。
- `reply: once / always / reject` 如何影响当前和后续请求。
- 默认 agent 如何配置安全边界，例如 `.env`、外部目录、plan mode edit deny。

## 1. 一句话讲明白

权限系统是 OpenCode 的 runtime 安全闸门：每个工具在真正读文件、写文件、执行 shell、访问外部目录或做 LSP 操作前，都可以调用 `ctx.ask`；权限服务按规则集和已批准记录判断是直接允许、直接拒绝，还是发布 `permission.asked` 事件等待用户回复。来源：`packages/opencode/src/session/tools.ts:64-72`、`packages/opencode/src/permission/index.ts:161-196`、`packages/opencode/src/permission/evaluate.ts:9-15`。

## 2. 它在 OpenCode agent 中的位置

权限不属于模型 Provider，也不属于具体文件系统实现。它位于 tool execution 的入口处：

```text
model emits tool-call
  -> SessionTools.resolve execute(...)
  -> Tool.Context.ask(...)
  -> Permission.ask({ permission, patterns, ruleset })
  -> evaluate rules
     -> allow: continue
     -> deny: throw DeniedError
     -> ask: publish permission.asked and wait
  -> UI/CLI replies once/always/reject
  -> tool continues or fails
```

关键路径：

- `packages/opencode/src/session/tools.ts:42-72`：工具上下文把 `ctx.ask` 接到 `Permission.ask`。
- `packages/opencode/src/permission/index.ts:19-45`：权限 action、rule、request schema。
- `packages/opencode/src/permission/index.ts:161-196`：ask 的核心状态机。
- `packages/opencode/src/permission/index.ts:198-254`：reply 如何唤醒 pending request。
- `packages/opencode/src/agent/agent.ts:103-122`：默认权限基线。
- `packages/opencode/src/agent/agent.ts:142-160`：plan agent 禁止大多数 edit。
- `packages/opencode/src/cli/cmd/run.ts:736-755`：非交互模式下 permission.asked 的自动处理。

## 3. 生活类比

把权限系统想成公司门禁和临时通行证。

员工（模型）想去资料室（read）、机房（shell）、外部办公室（external_directory），不能直接进去。门禁系统先查规则：

- 规则写着“永远允许”：直接开门。
- 规则写着“禁止”：直接拒绝。
- 没有明确规则或规则写着“询问”：发起审批单。

审批人可以说：

- `once`：这次放行。
- `always`：这类 pattern 以后也放行。
- `reject`：拒绝当前请求，可能还会拒绝同 session 的其它 pending 请求。

源码对应：`Permission.ask` 查规则和挂起，`Permission.reply` 处理 once/always/reject。来源：`packages/opencode/src/permission/index.ts:161-254`。

## 4. Java 开发者类比

- `Permission.Rule` 像 Spring Security 的 `ConfigAttribute`。
- `evaluate` 像 `AccessDecisionVoter`，根据 permission/pattern 找最后匹配规则。
- `Permission.ask` 像一个可以异步等待用户批准的 `AccessDecisionManager`。
- `Bus.Event.Asked` 像发布审批事件给 UI。
- `Deferred` 像 `CompletableFuture<Void>`，UI 回复后 complete/fail。
- `approved` 像项目级别的“记住选择”缓存。

Java 伪代码：

```java
void ask(AskInput input) {
    boolean needsAsk = false;
    for (String pattern : input.patterns()) {
        Rule rule = evaluate(input.permission(), pattern, input.ruleset(), approved);
        if (rule.action() == DENY) throw new PermissionDeniedException();
        if (rule.action() == ASK) needsAsk = true;
    }
    if (!needsAsk) return;

    PermissionRequest request = decode(input);
    CompletableFuture<Void> future = new CompletableFuture<>();
    pending.put(request.id(), future);
    eventBus.publish(new PermissionAsked(request));
    future.join();
}
```

## 5. 最小源码路径

1. `packages/opencode/src/permission/index.ts:19-45`：`Action`、`Rule`、`Ruleset`、`Request`。
2. `packages/opencode/src/permission/evaluate.ts:9-15`：最后匹配规则决定 action，默认 ask。
3. `packages/opencode/src/permission/index.ts:123-130`：pending 和 approved state。
4. `packages/opencode/src/permission/index.ts:161-196`：`ask` 核心流程。
5. `packages/opencode/src/permission/index.ts:198-254`：`reply` 处理 once/always/reject。
6. `packages/opencode/src/permission/index.ts:273-285`：config permission 转 ruleset。
7. `packages/opencode/src/permission/index.ts:287-302`：merge 和 disabled tools。
8. `packages/opencode/src/session/tools.ts:64-72`：tool context 的 `ask`。
9. `packages/opencode/src/agent/agent.ts:103-160`：默认 agent/plan agent 权限。
10. `packages/opencode/src/cli/cmd/run.ts:736-755`：非交互 run 如何处理审批。

## 6. 用户输入到 agent 行动的整体链路

### 6.1 工具调用触发 ctx.ask

每个工具都能拿到 `Tool.Context`。`SessionTools.resolve` 创建上下文时，把 `ask` 接到权限服务：

```ts
ask: (req) =>
  permission
    .ask({
      ...req,
      sessionID: input.session.id,
      tool: { messageID: input.processor.message.id, callID: options.toolCallId },
      ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
    })
    .pipe(Effect.orDie),
```

路径：`packages/opencode/src/session/tools.ts:64-72`

这说明权限规则来自两层：agent 自身权限和 session 临时权限。工具不用自己拼 sessionID/messageID/callID，context 会补齐。

### 6.2 权限规则匹配

```ts
export function evaluate(permission: string, pattern: string, ...rulesets: Rule[][]): Rule {
  const rules = rulesets.flat()
  const match = rules.findLast(
    (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
  )
  return match ?? { action: "ask", permission, pattern: "*" }
}
```

路径：`packages/opencode/src/permission/evaluate.ts:9-15`

关键点：

- 所有 ruleset 会 flat。
- 使用 `findLast`，后面的规则优先级更高。
- permission 和 pattern 都支持 wildcard。
- 没匹配到规则时默认 `ask`，不是默认 allow。

### 6.3 Permission.ask 的状态机

```ts
const ask = Effect.fn("Permission.ask")(function* (input: AskInput) {
  const { approved, pending } = yield* InstanceState.get(state)
  const { ruleset, ...request } = input
  let needsAsk = false

  for (const pattern of request.patterns) {
    const rule = evaluate(request.permission, pattern, ruleset, approved)
    if (rule.action === "deny") {
      return yield* new DeniedError({
        ruleset: ruleset.filter((rule) => Wildcard.match(request.permission, rule.permission)),
      })
    }
    if (rule.action === "allow") continue
    needsAsk = true
  }

  if (!needsAsk) return

  const id = request.id ?? PermissionID.ascending()
  const info = Schema.decodeUnknownSync(Request)({
    id,
    ...request,
  })

  const deferred = yield* Deferred.make<void, RejectedError | CorrectedError>()
  pending.set(id, { info, deferred })
  yield* bus.publish(Event.Asked, info)
  return yield* Effect.ensuring(
    Deferred.await(deferred),
    Effect.sync(() => {
      pending.delete(id)
    }),
  )
})
```

路径：`packages/opencode/src/permission/index.ts:161-196`

这段就是权限核心：

- 任一 pattern 被 deny，整个请求失败。
- 全部 pattern allow，就无需询问。
- 只要有一个需要 ask，就创建 request，放入 pending，发布事件，然后等待 Deferred。
- 等待结束时确保 pending 删除。

### 6.4 用户回复

```ts
if (input.reply === "reject") {
  yield* Deferred.fail(
    existing.deferred,
    input.message ? new CorrectedError({ feedback: input.message }) : new RejectedError(),
  )

  for (const [id, item] of pending.entries()) {
    if (item.info.sessionID !== existing.info.sessionID) continue
    pending.delete(id)
    yield* bus.publish(Event.Replied, {
      sessionID: item.info.sessionID,
      requestID: item.info.id,
      reply: "reject",
    })
    yield* Deferred.fail(item.deferred, new RejectedError())
  }
  return
}

yield* Deferred.succeed(existing.deferred, undefined)
if (input.reply === "once") return
```

路径：`packages/opencode/src/permission/index.ts:210-230`

`reject` 不只是拒绝当前 request，还会拒绝同一个 session 下其它 pending request。`once` 只放行当前 request，不写入 approved。

`always` 会把 `existing.info.always` 写入 approved，并尝试放行同 session 里已经被新规则覆盖的 pending request：

```ts
for (const pattern of existing.info.always) {
  approved.push({
    permission: existing.info.permission,
    pattern,
    action: "allow",
  })
}

for (const [id, item] of pending.entries()) {
  if (item.info.sessionID !== existing.info.sessionID) continue
  const ok = item.info.patterns.every(
    (pattern) => evaluate(item.info.permission, pattern, approved).action === "allow",
  )
  if (!ok) continue
  pending.delete(id)
  yield* bus.publish(Event.Replied, {
    sessionID: item.info.sessionID,
    requestID: item.info.id,
    reply: "always",
  })
  yield* Deferred.succeed(item.deferred, undefined)
}
```

路径：`packages/opencode/src/permission/index.ts:232-253`

### 6.5 非交互 CLI 的处理

在 non-interactive `opencode run` 里，遇到 permission request 时默认拒绝；只有 `--dangerously-skip-permissions` 才自动 once：

```ts
if (event.type === "permission.asked") {
  const permission = event.properties
  if (permission.sessionID !== sessionID) continue

  if (args["dangerously-skip-permissions"]) {
    await client.permission.reply({
      requestID: permission.id,
      reply: "once",
    })
  } else {
    UI.println(
      UI.Style.TEXT_WARNING_BOLD + "!",
      UI.Style.TEXT_NORMAL +
        `permission requested: ${permission.permission} (${permission.patterns.join(", ")}); auto-rejecting`,
    )
    await client.permission.reply({
      requestID: permission.id,
      reply: "reject",
    })
  }
}
```

路径：`packages/opencode/src/cli/cmd/run.ts:736-755`

这个设计很重要：非交互模式没有人在屏幕前确认，所以默认拒绝，除非用户显式选择危险跳过。

## 7. 核心源码逐段讲解

### 7.1 权限类型

```ts
export const Action = Schema.Literals(["allow", "deny", "ask"]).annotate({ identifier: "PermissionAction" })

export const Rule = Schema.Struct({
  permission: Schema.String,
  pattern: Schema.String,
  action: Action,
}).annotate({ identifier: "PermissionRule" })

export const Ruleset = Schema.mutable(Schema.Array(Rule)).annotate({ identifier: "PermissionRuleset" })
```

路径：`packages/opencode/src/permission/index.ts:19-30`

Java 类比：

```java
record PermissionRule(String permission, String pattern, Action action) {}
enum Action { ALLOW, DENY, ASK }
```

### 7.2 Permission.Request

```ts
export class Request extends Schema.Class<Request>("PermissionRequest")({
  id: PermissionID,
  sessionID: SessionID,
  permission: Schema.String,
  patterns: Schema.Array(Schema.String),
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  always: Schema.Array(Schema.String),
  tool: Schema.optional(
    Schema.Struct({
      messageID: MessageID,
      callID: Schema.String,
    }),
  ),
}) {}
```

路径：`packages/opencode/src/permission/index.ts:32-45`

`metadata` 给 UI 展示审批详情；`always` 给“总是允许”按钮提供可保存 pattern；`tool` 把审批和具体 tool call 关联起来。

### 7.3 事件

```ts
export const Event = {
  Asked: BusEvent.define("permission.asked", Request),
  Replied: BusEvent.define(
    "permission.replied",
    Schema.Struct({
      sessionID: SessionID,
      requestID: PermissionID,
      reply: Reply,
    }),
  ),
}
```

路径：`packages/opencode/src/permission/index.ts:63-73`

这说明权限系统不是直接调用 UI，而是发布事件。CLI/TUI/Desktop/API 都可以监听或转发这些事件。

### 7.4 默认 agent 权限

```ts
const defaults = Permission.fromConfig({
  "*": "allow",
  doom_loop: "ask",
  external_directory: {
    "*": "ask",
    ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
  },
  question: "deny",
  plan_enter: "deny",
  plan_exit: "deny",
  repo_clone: "deny",
  repo_overview: "deny",
  read: {
    "*": "allow",
    "*.env": "ask",
    "*.env.*": "ask",
    "*.env.example": "allow",
  },
})
```

路径：`packages/opencode/src/agent/agent.ts:103-122`

默认并不是“所有工具都 ask”。很多工具默认 allow，但敏感点被收紧：

- `external_directory` 默认 ask。
- `.env` 文件 read 默认 ask，但 `.env.example` allow。
- `question`、`plan_enter/exit`、repo 相关默认 deny。

### 7.5 plan agent 禁止编辑

```ts
plan: {
  name: "plan",
  description: "Plan mode. Disallows all edit tools.",
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({
      question: "allow",
      plan_exit: "allow",
      external_directory: {
        [path.join(Global.Path.data, "plans", "*")]: "allow",
      },
      edit: {
        "*": "deny",
        [path.join(".opencode", "plans", "*.md")]: "allow",
        [path.relative(ctx.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
      },
    }),
    user,
  ),
}
```

路径：`packages/opencode/src/agent/agent.ts:142-160`

这是很好的 agent 设计例子：不是所有 agent 都有同样权限。plan mode 主要用于思考和写计划，默认禁止编辑普通文件，只允许计划文件路径。

### 7.6 配置输入结构

```ts
export const Action = Schema.Literals(["ask", "allow", "deny"])
export const Object = Schema.Record(Schema.String, Action)
export const Rule = Schema.Union([Action, Object])

const InputObject = Schema.StructWithRest(
  Schema.Struct({
    read: Schema.optional(Rule),
    edit: Schema.optional(Rule),
    glob: Schema.optional(Rule),
    grep: Schema.optional(Rule),
    list: Schema.optional(Rule),
    bash: Schema.optional(Rule),
    task: Schema.optional(Rule),
    external_directory: Schema.optional(Rule),
    ...
  }),
  [Schema.Record(Schema.String, Rule)],
)
```

路径：`packages/opencode/src/config/permission.ts:4-37`

配置可以写简写 action，也可以写 pattern -> action。`StructWithRest` 表示已知 key 有类型，未知自定义 permission 也允许存在。

## 8. 关键 TypeScript 语法复习

### literal union

```ts
Schema.Literals(["allow", "deny", "ask"])
```

路径：`packages/opencode/src/permission/index.ts:19`

Java 类比 enum。TS 里常用字符串字面量 union 表示有限状态。

### Schema.Class

```ts
export class Request extends Schema.Class<Request>("PermissionRequest")({ ... }) {}
```

路径：`packages/opencode/src/permission/index.ts:32-45`

这里既定义运行时 schema，也定义 TS 类型和 class。Java 类比 `record` + Bean Validation + JSON schema，但 TS 需要显式 schema 才能运行时校验。

### optional

```ts
tool: Schema.optional(Schema.Struct({ messageID: MessageID, callID: Schema.String }))
```

路径：`packages/opencode/src/permission/index.ts:39-44`

审批不一定来自 tool call，所以 `tool` 是可选的。

### rest object

```ts
const { ruleset, ...request } = input
```

路径：`packages/opencode/src/permission/index.ts:163`

从 input 中剥离 `ruleset`，其余字段组成 `request`。Java 通常会手动构造另一个 DTO。

### findLast

```ts
const match = rules.findLast(
  (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
)
```

路径：`packages/opencode/src/permission/evaluate.ts:11-13`

后面的规则覆盖前面的规则。Java 里通常倒序 for 循环。

### mapped type 去 readonly

```ts
export type Info = { -readonly [K in keyof _Info]: _Info[K] }
```

路径：`packages/opencode/src/config/permission.ts:57-58`

这是 TS 的 mapped type，`-readonly` 去掉只读修饰。Java 没有直接等价物。

### Deferred

```ts
const deferred = yield* Deferred.make<void, RejectedError | CorrectedError>()
pending.set(id, { info, deferred })
yield* bus.publish(Event.Asked, info)
return yield* Deferred.await(deferred)
```

路径：`packages/opencode/src/permission/index.ts:187-191`

Java 类比 `CompletableFuture<Void>`，但 Effect 的 Deferred 也带错误类型和中断语义。

## 9. 涉及的设计模式和架构思想

- **Policy engine**：`evaluate` 根据规则集决定 action。
- **Event bus**：审批请求和回复通过 `permission.asked/replied` 事件流转。
- **Async gate**：`Deferred.await` 让 tool execution 暂停，直到用户回复。
- **Layered ruleset**：agent permission、session permission、approved rules 合并判断。
- **Least privilege by agent mode**：plan/general/build agent 权限不同。
- **Fail closed**：没有规则默认 ask；非交互 run 默认 reject。
- **Remembered approvals**：`always` 写入 approved，减少重复打扰。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- 和 Tool：工具通过 `ctx.ask` 申请权限，不直接访问 Permission service。来源：`packages/opencode/src/session/tools.ts:64-72`。
- 和 Provider：权限系统不参与 provider HTTP 请求；但 `LLM.resolveTools` 会根据权限禁用工具，避免模型看到不可用工具。来源：`packages/opencode/src/session/llm.ts:512-518`。
- 和 Session：request 包含 `sessionID`，reject 会拒绝同 session 的其它 pending request。来源：`packages/opencode/src/permission/index.ts:216-225`。
- 和文件系统：read/edit/write/shell/external_directory 等工具把具体路径或 glob pattern 交给权限系统判断。
- 和 CLI/UI：CLI 监听 `permission.asked` 事件，非交互模式默认 reject。来源：`packages/opencode/src/cli/cmd/run.ts:736-755`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

最小权限系统可以这样写：

```ts
type Action = "allow" | "deny" | "ask"
type Rule = { permission: string; pattern: string; action: Action }
type PermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  always: string[]
}

function evaluate(permission: string, pattern: string, rules: Rule[]): Rule {
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i]
    if (wildcard(permission, rule.permission) && wildcard(pattern, rule.pattern)) return rule
  }
  return { permission, pattern: "*", action: "ask" }
}

async function ask(input: PermissionRequest & { ruleset: Rule[] }) {
  for (const pattern of input.patterns) {
    const rule = evaluate(input.permission, pattern, input.ruleset)
    if (rule.action === "deny") throw new Error("permission denied")
    if (rule.action === "ask") return await waitForUserReply(input)
  }
}
```

实现顺序：

1. 先实现 `Rule` 和 `evaluate`。
2. 给 shell/read/edit 加 `permission.ask`。
3. 做一个 pending map，等待 UI/CLI 回复。
4. 支持 `once/reject`。
5. 再支持 `always` 和 wildcard。
6. 最后把不同 agent mode 的默认权限拆开。

## 12. 费曼复述区

请你不看源码复述：

1. `allow / deny / ask` 三种 action 怎么影响 tool 执行？
2. 为什么 `evaluate` 用 `findLast`？
3. `ctx.ask` 和 `Permission.ask` 的边界在哪里？
4. `reply: always` 除了放行当前 request，还做了什么？
5. 为什么非交互 CLI 默认拒绝 permission request？

如果说不出来，常见卡点是：

- 把权限系统误认为只是 UI 弹窗。
- 忽略 `approved` 和 `ruleset` 是两层规则。
- 不知道 `Deferred` 是如何把 tool execution 挂起的。

换一种说法：权限系统不是“问一下用户”这么简单，它是 tool runtime 的同步闸门，只是闸门背后可以用异步事件让用户来开锁。

## 13. 练习题

### 入门题

1. 找到 `Action`、`Rule`、`Request`，画出字段表。
2. 找到 `evaluate`，解释默认返回为什么是 `ask`。
3. 找到 `PermissionID.ascending`，说明 permission request id 的前缀是什么。

### 进阶题

1. 阅读 `Permission.reply`，解释 reject 为什么要拒绝同 session 的其它 pending request。
2. 阅读 `Agent.state` 默认权限，列出哪些默认 deny，哪些默认 ask。
3. 阅读 `Permission.disabled`，解释为什么 edit/write/apply_patch 被归到 `edit` permission。

### 源码追踪题

1. 从 `EditTool.execute` 追到 `ctx.ask`，再追到 `Permission.ask`。
2. 从 `ShellTool.ask` 追到 `external_directory` 权限请求。
3. 从 CLI `permission.asked` 事件追到 `client.permission.reply`。
4. 从 `reply: always` 追踪 approved rules 如何影响后续 pending request。

### 小实现题

写一个 mini permission service：

- 支持 ruleset。
- 默认 ask。
- 支持 pending request。
- 支持 `once / always / reject`。
- 支持 `always` 后自动放行同 session 的其它 pending request。

## 14. 源码追踪任务

建议阅读顺序：

1. `packages/opencode/src/permission/evaluate.ts`
2. `packages/opencode/src/permission/index.ts:19-73`
3. `packages/opencode/src/permission/index.ts:161-254`
4. `packages/opencode/src/session/tools.ts:42-72`
5. `packages/opencode/src/agent/agent.ts:103-160`
6. `packages/opencode/src/cli/cmd/run.ts:736-755`

阅读时画出两个状态表：pending request 表、approved rules 表。

## 15. 面试式自测

1. 为什么 agent 项目不能只靠 prompt 告诉模型“不要乱操作”？
2. `deny` 和 `reject` 有什么区别？
3. `always` 为什么保存的是 `existing.info.always`，不是原始 `patterns`？
4. 如果你要给 `npm install` 加审批，应该在哪个 tool 里调用 `ctx.ask`？
5. 如果某个工具根本没有调用 `ctx.ask`，权限系统能保护它吗？
6. 为什么 plan agent 要在权限层禁止 edit，而不是只靠 UI 隐藏按钮？

## 16. 下一步阅读建议

下一章建议读 “LSP / 诊断 / 上下文增强”。权限负责“能不能做”，LSP 负责“做完以后代码有没有问题、还能不能给 agent 更多代码语义”。


