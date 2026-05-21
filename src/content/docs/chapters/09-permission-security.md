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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:64-72</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span><span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span><span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span><span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span><span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-196</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span><span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span><span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span><span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span><span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span><span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span><span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span><span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span><span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span><span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span><span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span><span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span><span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span><span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span><span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span><span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span><span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span><span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span><span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span><span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span><span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span><span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span><span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span><span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/evaluate.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/evaluate.ts:9-15</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">export function evaluate(permission: string, pattern: string, ...rulesets: Rule[][]): Rule {</span></span><span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  const rules = rulesets.flat()</span></span><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  const match = rules.findLast(</span></span><span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    (rule) =&gt; Wildcard.match(permission, rule.permission) &amp;&amp; Wildcard.match(pattern, rule.pattern),</span></span><span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  )</span></span><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  return match ?? { action: &quot;ask&quot;, permission, pattern: &quot;*&quot; }</span></span><span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">}</span></span></code></pre>
</details>


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

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:42-72</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  const context = (args: Record&lt;string, unknown&gt;, options: ToolExecutionOptions): Tool.Context =&gt; ({</span></span><span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    sessionID: input.session.id,</span></span><span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">    abort: options.abortSignal!,</span></span><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">    messageID: input.processor.message.id,</span></span><span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    callID: options.toolCallId,</span></span><span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps: input.promptOps },</span></span><span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    agent: input.agent.name,</span></span><span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">    messages: input.messages,</span></span><span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">    metadata: (val) =&gt;</span></span><span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      input.processor.updateToolCall(options.toolCallId, (match) =&gt; {</span></span><span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        if (![&quot;running&quot;, &quot;pending&quot;].includes(match.state.status)) return match</span></span><span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">        return {</span></span><span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          ...match,</span></span><span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">          state: {</span></span><span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            title: val.title,</span></span><span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            metadata: val.metadata,</span></span><span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            status: &quot;running&quot;,</span></span><span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            input: args,</span></span><span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            time: { start: Date.now() },</span></span><span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      }),</span></span><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span><span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span><span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span><span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span><span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span></code></pre>
  </details>

- `packages/opencode/src/permission/index.ts:19-45`：权限 action、rule、request schema。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:19-45</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">export const Action = Schema.Literals([&quot;allow&quot;, &quot;deny&quot;, &quot;ask&quot;]).annotate({ identifier: &quot;PermissionAction&quot; })</span></span><span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">export type Action = Schema.Schema.Type&lt;typeof Action&gt;</span></span><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">export const Rule = Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  pattern: Schema.String,</span></span><span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  action: Action,</span></span><span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}).annotate({ identifier: &quot;PermissionRule&quot; })</span></span><span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">export type Rule = Schema.Schema.Type&lt;typeof Rule&gt;</span></span><span class="source-line"><span class="source-line-number">28</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">export const Ruleset = Schema.mutable(Schema.Array(Rule)).annotate({ identifier: &quot;PermissionRuleset&quot; })</span></span><span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">export type Ruleset = Schema.Schema.Type&lt;typeof Ruleset&gt;</span></span><span class="source-line"><span class="source-line-number">31</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">export class Request extends Schema.Class&lt;Request&gt;(&quot;PermissionRequest&quot;)({</span></span><span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  id: PermissionID,</span></span><span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  sessionID: SessionID,</span></span><span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  patterns: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  metadata: Schema.Record(Schema.String, Schema.Unknown),</span></span><span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  always: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  tool: Schema.optional(</span></span><span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      messageID: MessageID,</span></span><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      callID: Schema.String,</span></span><span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    }),</span></span><span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  ),</span></span><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}) {}</span></span></code></pre>
  </details>

- `packages/opencode/src/permission/index.ts:161-196`：ask 的核心状态机。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-196</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span><span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span><span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span><span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span><span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span><span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span><span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span><span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span><span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span><span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span><span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span><span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span><span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span><span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span><span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span><span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span><span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span><span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span><span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span><span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span><span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span><span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span><span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span><span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

- `packages/opencode/src/permission/index.ts:198-254`：reply 如何唤醒 pending request。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:198-254</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">    const reply = Effect.fn(&quot;Permission.reply&quot;)(function* (input: ReplyInput) {</span></span><span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      const existing = pending.get(input.requestID)</span></span><span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      if (!existing) return</span></span><span class="source-line"><span class="source-line-number">202</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">      pending.delete(input.requestID)</span></span><span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">        sessionID: existing.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        requestID: existing.info.id,</span></span><span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        reply: input.reply,</span></span><span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">209</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">      if (input.reply === &quot;reject&quot;) {</span></span><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        yield* Deferred.fail(</span></span><span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">          existing.deferred,</span></span><span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">          input.message ? new CorrectedError({ feedback: input.message }) : new RejectedError(),</span></span><span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">215</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">          yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">            sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">          yield* Deferred.fail(item.deferred, new RejectedError())</span></span><span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">        return</span></span><span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">228</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      yield* Deferred.succeed(existing.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      if (input.reply === &quot;once&quot;) return</span></span><span class="source-line"><span class="source-line-number">231</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      for (const pattern of existing.info.always) {</span></span><span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        approved.push({</span></span><span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">          permission: existing.info.permission,</span></span><span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          pattern,</span></span><span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">          action: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">239</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">        if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        const ok = item.info.patterns.every(</span></span><span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">          (pattern) =&gt; evaluate(item.info.permission, pattern, approved).action === &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">        if (!ok) continue</span></span><span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">        pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">        yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">          requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          reply: &quot;always&quot;,</span></span><span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">        yield* Deferred.succeed(item.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

- `packages/opencode/src/agent/agent.ts:103-122`：默认权限基线。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/agent/agent.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/agent/agent.ts:103-122</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">        const defaults = Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">          &quot;*&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          doom_loop: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">          external_directory: {</span></span><span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            &quot;*&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            ...Object.fromEntries(whitelistedDirs.map((dir) =&gt; [dir, &quot;allow&quot;])),</span></span><span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">          question: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">          plan_enter: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          plan_exit: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">          repo_clone: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">          repo_overview: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files</span></span><span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">          read: {</span></span><span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">            &quot;*&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">            &quot;*.env&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">            &quot;*.env.*&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">            &quot;*.env.example&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">        })</span></span></code></pre>
  </details>

- `packages/opencode/src/agent/agent.ts:142-160`：plan agent 禁止大多数 edit。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/agent/agent.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/agent/agent.ts:142-160</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">          plan: {</span></span><span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">            name: &quot;plan&quot;,</span></span><span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">            description: &quot;Plan mode. Disallows all edit tools.&quot;,</span></span><span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">            options: {},</span></span><span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">            permission: Permission.merge(</span></span><span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">              defaults,</span></span><span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">              Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">                question: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">                plan_exit: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">                external_directory: {</span></span><span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">                  [path.join(Global.Path.data, &quot;plans&quot;, &quot;*&quot;)]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">                },</span></span><span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">                edit: {</span></span><span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">                  &quot;*&quot;: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">                  [path.join(&quot;.opencode&quot;, &quot;plans&quot;, &quot;*.md&quot;)]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join(&quot;plans&quot;, &quot;*.md&quot;)))]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">                },</span></span><span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">              }),</span></span><span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">              user,</span></span></code></pre>
  </details>

- `packages/opencode/src/cli/cmd/run.ts:736-755`：非交互模式下 permission.asked 的自动处理。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:736-755</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">736</span><span class="source-line-text">            if (event.type === &quot;permission.asked&quot;) {</span></span><span class="source-line"><span class="source-line-number">737</span><span class="source-line-text">              const permission = event.properties</span></span><span class="source-line"><span class="source-line-number">738</span><span class="source-line-text">              if (permission.sessionID !== sessionID) continue</span></span><span class="source-line"><span class="source-line-number">739</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">740</span><span class="source-line-text">              if (args[&quot;dangerously-skip-permissions&quot;]) {</span></span><span class="source-line"><span class="source-line-number">741</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">742</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">743</span><span class="source-line-text">                  reply: &quot;once&quot;,</span></span><span class="source-line"><span class="source-line-number">744</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">745</span><span class="source-line-text">              } else {</span></span><span class="source-line"><span class="source-line-number">746</span><span class="source-line-text">                UI.println(</span></span><span class="source-line"><span class="source-line-number">747</span><span class="source-line-text">                  UI.Style.TEXT_WARNING_BOLD + &quot;!&quot;,</span></span><span class="source-line"><span class="source-line-number">748</span><span class="source-line-text">                  UI.Style.TEXT_NORMAL +</span></span><span class="source-line"><span class="source-line-number">749</span><span class="source-line-text">                    `permission requested: ${permission.permission} (${permission.patterns.join(&quot;, &quot;)}); auto-rejecting`,</span></span><span class="source-line"><span class="source-line-number">750</span><span class="source-line-text">                )</span></span><span class="source-line"><span class="source-line-number">751</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">752</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">753</span><span class="source-line-text">                  reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">754</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">755</span><span class="source-line-text">              }</span></span></code></pre>
  </details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-254</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span><span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span><span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span><span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span><span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span><span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span><span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span><span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span><span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span><span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span><span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span><span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span><span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span><span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span><span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span><span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span><span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span><span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span><span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span><span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span><span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span><span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span><span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span><span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span><span class="source-line"><span class="source-line-number">197</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">    const reply = Effect.fn(&quot;Permission.reply&quot;)(function* (input: ReplyInput) {</span></span><span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      const existing = pending.get(input.requestID)</span></span><span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      if (!existing) return</span></span><span class="source-line"><span class="source-line-number">202</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">      pending.delete(input.requestID)</span></span><span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">        sessionID: existing.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        requestID: existing.info.id,</span></span><span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        reply: input.reply,</span></span><span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">209</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">      if (input.reply === &quot;reject&quot;) {</span></span><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        yield* Deferred.fail(</span></span><span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">          existing.deferred,</span></span><span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">          input.message ? new CorrectedError({ feedback: input.message }) : new RejectedError(),</span></span><span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">215</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">          yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">            sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">          yield* Deferred.fail(item.deferred, new RejectedError())</span></span><span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">        return</span></span><span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">228</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      yield* Deferred.succeed(existing.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      if (input.reply === &quot;once&quot;) return</span></span><span class="source-line"><span class="source-line-number">231</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      for (const pattern of existing.info.always) {</span></span><span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        approved.push({</span></span><span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">          permission: existing.info.permission,</span></span><span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          pattern,</span></span><span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">          action: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">239</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">        if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        const ok = item.info.patterns.every(</span></span><span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">          (pattern) =&gt; evaluate(item.info.permission, pattern, approved).action === &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">        if (!ok) continue</span></span><span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">        pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">        yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">          requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          reply: &quot;always&quot;,</span></span><span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">        yield* Deferred.succeed(item.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">    })</span></span></code></pre>
</details>


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

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:19-45</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">export const Action = Schema.Literals([&quot;allow&quot;, &quot;deny&quot;, &quot;ask&quot;]).annotate({ identifier: &quot;PermissionAction&quot; })</span></span><span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">export type Action = Schema.Schema.Type&lt;typeof Action&gt;</span></span><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">export const Rule = Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  pattern: Schema.String,</span></span><span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  action: Action,</span></span><span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}).annotate({ identifier: &quot;PermissionRule&quot; })</span></span><span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">export type Rule = Schema.Schema.Type&lt;typeof Rule&gt;</span></span><span class="source-line"><span class="source-line-number">28</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">export const Ruleset = Schema.mutable(Schema.Array(Rule)).annotate({ identifier: &quot;PermissionRuleset&quot; })</span></span><span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">export type Ruleset = Schema.Schema.Type&lt;typeof Ruleset&gt;</span></span><span class="source-line"><span class="source-line-number">31</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">export class Request extends Schema.Class&lt;Request&gt;(&quot;PermissionRequest&quot;)({</span></span><span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  id: PermissionID,</span></span><span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  sessionID: SessionID,</span></span><span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  patterns: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  metadata: Schema.Record(Schema.String, Schema.Unknown),</span></span><span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  always: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  tool: Schema.optional(</span></span><span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      messageID: MessageID,</span></span><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      callID: Schema.String,</span></span><span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    }),</span></span><span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  ),</span></span><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}) {}</span></span></code></pre>
  </details>

2. `packages/opencode/src/permission/evaluate.ts:9-15`：最后匹配规则决定 action，默认 ask。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/evaluate.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/evaluate.ts:9-15</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">export function evaluate(permission: string, pattern: string, ...rulesets: Rule[][]): Rule {</span></span><span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  const rules = rulesets.flat()</span></span><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  const match = rules.findLast(</span></span><span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    (rule) =&gt; Wildcard.match(permission, rule.permission) &amp;&amp; Wildcard.match(pattern, rule.pattern),</span></span><span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  )</span></span><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  return match ?? { action: &quot;ask&quot;, permission, pattern: &quot;*&quot; }</span></span><span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">}</span></span></code></pre>
  </details>

3. `packages/opencode/src/permission/index.ts:123-130`：pending 和 approved state。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:123-130</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">123</span><span class="source-line-text">interface State {</span></span><span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">  pending: Map&lt;PermissionID, PendingEntry&gt;</span></span><span class="source-line"><span class="source-line-number">125</span><span class="source-line-text">  approved: Ruleset</span></span><span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">}</span></span><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">export function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]): Rule {</span></span><span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">  return evalRule(permission, pattern, ...rulesets)</span></span><span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">}</span></span></code></pre>
  </details>

4. `packages/opencode/src/permission/index.ts:161-196`：`ask` 核心流程。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-196</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span><span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span><span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span><span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span><span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span><span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span><span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span><span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span><span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span><span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span><span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span><span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span><span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span><span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span><span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span><span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span><span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span><span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span><span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span><span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span><span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span><span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span><span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span><span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

5. `packages/opencode/src/permission/index.ts:198-254`：`reply` 处理 once/always/reject。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:198-254</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">    const reply = Effect.fn(&quot;Permission.reply&quot;)(function* (input: ReplyInput) {</span></span><span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      const existing = pending.get(input.requestID)</span></span><span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      if (!existing) return</span></span><span class="source-line"><span class="source-line-number">202</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">      pending.delete(input.requestID)</span></span><span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">        sessionID: existing.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        requestID: existing.info.id,</span></span><span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        reply: input.reply,</span></span><span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">209</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">      if (input.reply === &quot;reject&quot;) {</span></span><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        yield* Deferred.fail(</span></span><span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">          existing.deferred,</span></span><span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">          input.message ? new CorrectedError({ feedback: input.message }) : new RejectedError(),</span></span><span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">215</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">          yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">            sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">          yield* Deferred.fail(item.deferred, new RejectedError())</span></span><span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">        return</span></span><span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">228</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      yield* Deferred.succeed(existing.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      if (input.reply === &quot;once&quot;) return</span></span><span class="source-line"><span class="source-line-number">231</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      for (const pattern of existing.info.always) {</span></span><span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        approved.push({</span></span><span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">          permission: existing.info.permission,</span></span><span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          pattern,</span></span><span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">          action: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">239</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">        if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        const ok = item.info.patterns.every(</span></span><span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">          (pattern) =&gt; evaluate(item.info.permission, pattern, approved).action === &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">        if (!ok) continue</span></span><span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">        pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">        yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">          requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          reply: &quot;always&quot;,</span></span><span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">        yield* Deferred.succeed(item.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

6. `packages/opencode/src/permission/index.ts:273-285`：config permission 转 ruleset。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:273-285</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">export function fromConfig(permission: ConfigPermission.Info) {</span></span><span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">  const ruleset: Ruleset = []</span></span><span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">  for (const [key, value] of Object.entries(permission)) {</span></span><span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">    if (typeof value === &quot;string&quot;) {</span></span><span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">      ruleset.push({ permission: key, action: value, pattern: &quot;*&quot; })</span></span><span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">      continue</span></span><span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    }</span></span><span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">    ruleset.push(</span></span><span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">      ...Object.entries(value).map(([pattern, action]) =&gt; ({ permission: key, pattern: expand(pattern), action })),</span></span><span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">    )</span></span><span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  }</span></span><span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">  return ruleset</span></span><span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">}</span></span></code></pre>
  </details>

7. `packages/opencode/src/permission/index.ts:287-302`：merge 和 disabled tools。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:287-302</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">export function merge(...rulesets: Ruleset[]): Ruleset {</span></span><span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">  return rulesets.flat()</span></span><span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">}</span></span><span class="source-line"><span class="source-line-number">290</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">const EDIT_TOOLS = [&quot;edit&quot;, &quot;write&quot;, &quot;apply_patch&quot;]</span></span><span class="source-line"><span class="source-line-number">292</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">export function disabled(tools: string[], ruleset: Ruleset): Set&lt;string&gt; {</span></span><span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">  const result = new Set&lt;string&gt;()</span></span><span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">  for (const tool of tools) {</span></span><span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">    const permission = EDIT_TOOLS.includes(tool) ? &quot;edit&quot; : tool</span></span><span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">    const rule = ruleset.findLast((rule) =&gt; Wildcard.match(permission, rule.permission))</span></span><span class="source-line"><span class="source-line-number">298</span><span class="source-line-text">    if (!rule) continue</span></span><span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">    if (rule.pattern === &quot;*&quot; &amp;&amp; rule.action === &quot;deny&quot;) result.add(tool)</span></span><span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">  }</span></span><span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">  return result</span></span><span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">}</span></span></code></pre>
  </details>

8. `packages/opencode/src/session/tools.ts:64-72`：tool context 的 `ask`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:64-72</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span><span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span><span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span><span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span><span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span></code></pre>
  </details>

9. `packages/opencode/src/agent/agent.ts:103-160`：默认 agent/plan agent 权限。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/agent/agent.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/agent/agent.ts:103-160</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">        const defaults = Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">          &quot;*&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          doom_loop: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">          external_directory: {</span></span><span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            &quot;*&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            ...Object.fromEntries(whitelistedDirs.map((dir) =&gt; [dir, &quot;allow&quot;])),</span></span><span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">          question: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">          plan_enter: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          plan_exit: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">          repo_clone: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">          repo_overview: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files</span></span><span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">          read: {</span></span><span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">            &quot;*&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">            &quot;*.env&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">            &quot;*.env.*&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">            &quot;*.env.example&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">123</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">        const user = Permission.fromConfig(cfg.permission ?? {})</span></span><span class="source-line"><span class="source-line-number">125</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">        const agents: Record&lt;string, Info&gt; = {</span></span><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">          build: {</span></span><span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">            name: &quot;build&quot;,</span></span><span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">            description: &quot;The default agent. Executes tools based on configured permissions.&quot;,</span></span><span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">            options: {},</span></span><span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">            permission: Permission.merge(</span></span><span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">              defaults,</span></span><span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">              Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">                question: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">                plan_enter: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">              }),</span></span><span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">              user,</span></span><span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">            ),</span></span><span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">            mode: &quot;primary&quot;,</span></span><span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">            native: true,</span></span><span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">          plan: {</span></span><span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">            name: &quot;plan&quot;,</span></span><span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">            description: &quot;Plan mode. Disallows all edit tools.&quot;,</span></span><span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">            options: {},</span></span><span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">            permission: Permission.merge(</span></span><span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">              defaults,</span></span><span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">              Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">                question: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">                plan_exit: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">                external_directory: {</span></span><span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">                  [path.join(Global.Path.data, &quot;plans&quot;, &quot;*&quot;)]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">                },</span></span><span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">                edit: {</span></span><span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">                  &quot;*&quot;: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">                  [path.join(&quot;.opencode&quot;, &quot;plans&quot;, &quot;*.md&quot;)]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join(&quot;plans&quot;, &quot;*.md&quot;)))]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">                },</span></span><span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">              }),</span></span><span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">              user,</span></span></code></pre>
  </details>

10. `packages/opencode/src/cli/cmd/run.ts:736-755`：非交互 run 如何处理审批。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:736-755</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">736</span><span class="source-line-text">            if (event.type === &quot;permission.asked&quot;) {</span></span><span class="source-line"><span class="source-line-number">737</span><span class="source-line-text">              const permission = event.properties</span></span><span class="source-line"><span class="source-line-number">738</span><span class="source-line-text">              if (permission.sessionID !== sessionID) continue</span></span><span class="source-line"><span class="source-line-number">739</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">740</span><span class="source-line-text">              if (args[&quot;dangerously-skip-permissions&quot;]) {</span></span><span class="source-line"><span class="source-line-number">741</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">742</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">743</span><span class="source-line-text">                  reply: &quot;once&quot;,</span></span><span class="source-line"><span class="source-line-number">744</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">745</span><span class="source-line-text">              } else {</span></span><span class="source-line"><span class="source-line-number">746</span><span class="source-line-text">                UI.println(</span></span><span class="source-line"><span class="source-line-number">747</span><span class="source-line-text">                  UI.Style.TEXT_WARNING_BOLD + &quot;!&quot;,</span></span><span class="source-line"><span class="source-line-number">748</span><span class="source-line-text">                  UI.Style.TEXT_NORMAL +</span></span><span class="source-line"><span class="source-line-number">749</span><span class="source-line-text">                    `permission requested: ${permission.permission} (${permission.patterns.join(&quot;, &quot;)}); auto-rejecting`,</span></span><span class="source-line"><span class="source-line-number">750</span><span class="source-line-text">                )</span></span><span class="source-line"><span class="source-line-number">751</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">752</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">753</span><span class="source-line-text">                  reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">754</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">755</span><span class="source-line-text">              }</span></span></code></pre>
  </details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:64-72</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span><span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span><span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span><span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span><span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/evaluate.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/evaluate.ts:9-15</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">9</span><span class="source-line-text">export function evaluate(permission: string, pattern: string, ...rulesets: Rule[][]): Rule {</span></span><span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">  const rules = rulesets.flat()</span></span><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  const match = rules.findLast(</span></span><span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    (rule) =&gt; Wildcard.match(permission, rule.permission) &amp;&amp; Wildcard.match(pattern, rule.pattern),</span></span><span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  )</span></span><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">  return match ?? { action: &quot;ask&quot;, permission, pattern: &quot;*&quot; }</span></span><span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">}</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-196</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span><span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span><span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span><span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span><span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span><span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span><span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span><span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span><span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span><span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span><span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span><span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span><span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span><span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span><span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span><span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span><span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span><span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span><span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span><span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span><span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span><span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span><span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span><span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:210-230</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">      if (input.reply === &quot;reject&quot;) {</span></span><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        yield* Deferred.fail(</span></span><span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">          existing.deferred,</span></span><span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">          input.message ? new CorrectedError({ feedback: input.message }) : new RejectedError(),</span></span><span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">215</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">          yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">            sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">          yield* Deferred.fail(item.deferred, new RejectedError())</span></span><span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">        return</span></span><span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">228</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      yield* Deferred.succeed(existing.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      if (input.reply === &quot;once&quot;) return</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:232-253</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      for (const pattern of existing.info.always) {</span></span><span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        approved.push({</span></span><span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">          permission: existing.info.permission,</span></span><span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          pattern,</span></span><span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">          action: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">239</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">        if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        const ok = item.info.patterns.every(</span></span><span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">          (pattern) =&gt; evaluate(item.info.permission, pattern, approved).action === &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">        if (!ok) continue</span></span><span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">        pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">        yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">          requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          reply: &quot;always&quot;,</span></span><span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">        yield* Deferred.succeed(item.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">      }</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:736-755</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">736</span><span class="source-line-text">            if (event.type === &quot;permission.asked&quot;) {</span></span><span class="source-line"><span class="source-line-number">737</span><span class="source-line-text">              const permission = event.properties</span></span><span class="source-line"><span class="source-line-number">738</span><span class="source-line-text">              if (permission.sessionID !== sessionID) continue</span></span><span class="source-line"><span class="source-line-number">739</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">740</span><span class="source-line-text">              if (args[&quot;dangerously-skip-permissions&quot;]) {</span></span><span class="source-line"><span class="source-line-number">741</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">742</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">743</span><span class="source-line-text">                  reply: &quot;once&quot;,</span></span><span class="source-line"><span class="source-line-number">744</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">745</span><span class="source-line-text">              } else {</span></span><span class="source-line"><span class="source-line-number">746</span><span class="source-line-text">                UI.println(</span></span><span class="source-line"><span class="source-line-number">747</span><span class="source-line-text">                  UI.Style.TEXT_WARNING_BOLD + &quot;!&quot;,</span></span><span class="source-line"><span class="source-line-number">748</span><span class="source-line-text">                  UI.Style.TEXT_NORMAL +</span></span><span class="source-line"><span class="source-line-number">749</span><span class="source-line-text">                    `permission requested: ${permission.permission} (${permission.patterns.join(&quot;, &quot;)}); auto-rejecting`,</span></span><span class="source-line"><span class="source-line-number">750</span><span class="source-line-text">                )</span></span><span class="source-line"><span class="source-line-number">751</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">752</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">753</span><span class="source-line-text">                  reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">754</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">755</span><span class="source-line-text">              }</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:19-30</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">export const Action = Schema.Literals([&quot;allow&quot;, &quot;deny&quot;, &quot;ask&quot;]).annotate({ identifier: &quot;PermissionAction&quot; })</span></span><span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">export type Action = Schema.Schema.Type&lt;typeof Action&gt;</span></span><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">export const Rule = Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  pattern: Schema.String,</span></span><span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  action: Action,</span></span><span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}).annotate({ identifier: &quot;PermissionRule&quot; })</span></span><span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">export type Rule = Schema.Schema.Type&lt;typeof Rule&gt;</span></span><span class="source-line"><span class="source-line-number">28</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">export const Ruleset = Schema.mutable(Schema.Array(Rule)).annotate({ identifier: &quot;PermissionRuleset&quot; })</span></span><span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">export type Ruleset = Schema.Schema.Type&lt;typeof Ruleset&gt;</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:32-45</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">export class Request extends Schema.Class&lt;Request&gt;(&quot;PermissionRequest&quot;)({</span></span><span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  id: PermissionID,</span></span><span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  sessionID: SessionID,</span></span><span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  patterns: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  metadata: Schema.Record(Schema.String, Schema.Unknown),</span></span><span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  always: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  tool: Schema.optional(</span></span><span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      messageID: MessageID,</span></span><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      callID: Schema.String,</span></span><span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    }),</span></span><span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  ),</span></span><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}) {}</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:63-73</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">export const Event = {</span></span><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">  Asked: BusEvent.define(&quot;permission.asked&quot;, Request),</span></span><span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">  Replied: BusEvent.define(</span></span><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">    &quot;permission.replied&quot;,</span></span><span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">    Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">      sessionID: SessionID,</span></span><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      requestID: PermissionID,</span></span><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">      reply: Reply,</span></span><span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">    }),</span></span><span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  ),</span></span><span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">}</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/agent/agent.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/agent/agent.ts:103-122</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">        const defaults = Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">          &quot;*&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          doom_loop: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">          external_directory: {</span></span><span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            &quot;*&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            ...Object.fromEntries(whitelistedDirs.map((dir) =&gt; [dir, &quot;allow&quot;])),</span></span><span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">          question: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">          plan_enter: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          plan_exit: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">          repo_clone: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">          repo_overview: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files</span></span><span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">          read: {</span></span><span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">            &quot;*&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">            &quot;*.env&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">            &quot;*.env.*&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">            &quot;*.env.example&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">        })</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/agent/agent.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/agent/agent.ts:142-160</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">          plan: {</span></span><span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">            name: &quot;plan&quot;,</span></span><span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">            description: &quot;Plan mode. Disallows all edit tools.&quot;,</span></span><span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">            options: {},</span></span><span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">            permission: Permission.merge(</span></span><span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">              defaults,</span></span><span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">              Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">                question: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">                plan_exit: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">                external_directory: {</span></span><span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">                  [path.join(Global.Path.data, &quot;plans&quot;, &quot;*&quot;)]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">                },</span></span><span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">                edit: {</span></span><span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">                  &quot;*&quot;: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">                  [path.join(&quot;.opencode&quot;, &quot;plans&quot;, &quot;*.md&quot;)]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join(&quot;plans&quot;, &quot;*.md&quot;)))]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">                },</span></span><span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">              }),</span></span><span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">              user,</span></span></code></pre>
</details>


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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/config/permission.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/config/permission.ts:4-37</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">4</span><span class="source-line-text">export const Action = Schema.Literals([&quot;ask&quot;, &quot;allow&quot;, &quot;deny&quot;]).annotate({ identifier: &quot;PermissionActionConfig&quot; })</span></span><span class="source-line"><span class="source-line-number">5</span><span class="source-line-text">export type Action = Schema.Schema.Type&lt;typeof Action&gt;</span></span><span class="source-line"><span class="source-line-number">6</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">7</span><span class="source-line-text">export const Object = Schema.Record(Schema.String, Action).annotate({ identifier: &quot;PermissionObjectConfig&quot; })</span></span><span class="source-line"><span class="source-line-number">8</span><span class="source-line-text">export type Object = Schema.Schema.Type&lt;typeof Object&gt;</span></span><span class="source-line"><span class="source-line-number">9</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">export const Rule = Schema.Union([Action, Object]).annotate({ identifier: &quot;PermissionRuleConfig&quot; })</span></span><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">export type Rule = Schema.Schema.Type&lt;typeof Rule&gt;</span></span><span class="source-line"><span class="source-line-number">12</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">// Known permission keys get explicit types in the Effect schema for generated</span></span><span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">// docs/types. Runtime config parsing uses Effect's `propertyOrder: &quot;original&quot;`</span></span><span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">// parse option so user key order is preserved for permission precedence.</span></span><span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">const InputObject = Schema.StructWithRest(</span></span><span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">    read: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    edit: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    glob: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    grep: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    list: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">    bash: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">    task: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">    external_directory: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">    todowrite: Schema.optional(Action),</span></span><span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">    question: Schema.optional(Action),</span></span><span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">    webfetch: Schema.optional(Action),</span></span><span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">    websearch: Schema.optional(Action),</span></span><span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">    repo_clone: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">    repo_overview: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">    lsp: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">    doom_loop: Schema.optional(Action),</span></span><span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">    skill: Schema.optional(Rule),</span></span><span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  }),</span></span><span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  [Schema.Record(Schema.String, Rule)],</span></span><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">)</span></span></code></pre>
</details>


配置可以写简写 action，也可以写 pattern -> action。`StructWithRest` 表示已知 key 有类型，未知自定义 permission 也允许存在。

## 8. 关键 TypeScript 语法复习

### literal union

```ts
Schema.Literals(["allow", "deny", "ask"])
```

路径：`packages/opencode/src/permission/index.ts:19`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:19</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">export const Action = Schema.Literals([&quot;allow&quot;, &quot;deny&quot;, &quot;ask&quot;]).annotate({ identifier: &quot;PermissionAction&quot; })</span></span></code></pre>
</details>


Java 类比 enum。TS 里常用字符串字面量 union 表示有限状态。

### Schema.Class

```ts
export class Request extends Schema.Class<Request>("PermissionRequest")({ ... }) {}
```

路径：`packages/opencode/src/permission/index.ts:32-45`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:32-45</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">export class Request extends Schema.Class&lt;Request&gt;(&quot;PermissionRequest&quot;)({</span></span><span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  id: PermissionID,</span></span><span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  sessionID: SessionID,</span></span><span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  patterns: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  metadata: Schema.Record(Schema.String, Schema.Unknown),</span></span><span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  always: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  tool: Schema.optional(</span></span><span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      messageID: MessageID,</span></span><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      callID: Schema.String,</span></span><span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    }),</span></span><span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  ),</span></span><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}) {}</span></span></code></pre>
</details>


这里既定义运行时 schema，也定义 TS 类型和 class。Java 类比 `record` + Bean Validation + JSON schema，但 TS 需要显式 schema 才能运行时校验。

### optional

```ts
tool: Schema.optional(Schema.Struct({ messageID: MessageID, callID: Schema.String }))
```

路径：`packages/opencode/src/permission/index.ts:39-44`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:39-44</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  tool: Schema.optional(</span></span><span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      messageID: MessageID,</span></span><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      callID: Schema.String,</span></span><span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    }),</span></span><span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  ),</span></span></code></pre>
</details>


审批不一定来自 tool call，所以 `tool` 是可选的。

### rest object

```ts
const { ruleset, ...request } = input
```

路径：`packages/opencode/src/permission/index.ts:163`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:163</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span></code></pre>
</details>


从 input 中剥离 `ruleset`，其余字段组成 `request`。Java 通常会手动构造另一个 DTO。

### findLast

```ts
const match = rules.findLast(
  (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
)
```

路径：`packages/opencode/src/permission/evaluate.ts:11-13`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/evaluate.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/evaluate.ts:11-13</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  const match = rules.findLast(</span></span><span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">    (rule) =&gt; Wildcard.match(permission, rule.permission) &amp;&amp; Wildcard.match(pattern, rule.pattern),</span></span><span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  )</span></span></code></pre>
</details>


后面的规则覆盖前面的规则。Java 里通常倒序 for 循环。

### mapped type 去 readonly

```ts
export type Info = { -readonly [K in keyof _Info]: _Info[K] }
```

路径：`packages/opencode/src/config/permission.ts:57-58`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/config/permission.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/config/permission.ts:57-58</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">type _Info = Schema.Schema.Type&lt;typeof InputObject&gt;</span></span><span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export type Info = { -readonly [K in keyof _Info]: _Info[K] }</span></span></code></pre>
</details>


这是 TS 的 mapped type，`-readonly` 去掉只读修饰。Java 没有直接等价物。

### Deferred

```ts
const deferred = yield* Deferred.make<void, RejectedError | CorrectedError>()
pending.set(id, { info, deferred })
yield* bus.publish(Event.Asked, info)
return yield* Deferred.await(deferred)
```

路径：`packages/opencode/src/permission/index.ts:187-191`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:187-191</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span><span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span><span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span><span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span></code></pre>
</details>


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

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:64-72</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span><span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span><span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span><span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span><span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span></code></pre>
  </details>

- 和 Provider：权限系统不参与 provider HTTP 请求；但 `LLM.resolveTools` 会根据权限禁用工具，避免模型看到不可用工具。来源：`packages/opencode/src/session/llm.ts:512-518`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:512-518</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">512</span><span class="source-line-text">function resolveTools(input: Pick&lt;StreamInput, &quot;tools&quot; | &quot;agent&quot; | &quot;permission&quot; | &quot;user&quot;&gt;) {</span></span><span class="source-line"><span class="source-line-number">513</span><span class="source-line-text">  const disabled = Permission.disabled(</span></span><span class="source-line"><span class="source-line-number">514</span><span class="source-line-text">    Object.keys(input.tools),</span></span><span class="source-line"><span class="source-line-number">515</span><span class="source-line-text">    Permission.merge(input.agent.permission, input.permission ?? []),</span></span><span class="source-line"><span class="source-line-number">516</span><span class="source-line-text">  )</span></span><span class="source-line"><span class="source-line-number">517</span><span class="source-line-text">  return Record.filter(input.tools, (_, k) =&gt; input.user.tools?.[k] !== false &amp;&amp; !disabled.has(k))</span></span><span class="source-line"><span class="source-line-number">518</span><span class="source-line-text">}</span></span></code></pre>
  </details>

- 和 Session：request 包含 `sessionID`，reject 会拒绝同 session 的其它 pending request。来源：`packages/opencode/src/permission/index.ts:216-225`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:216-225</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">          yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">            sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">          yield* Deferred.fail(item.deferred, new RejectedError())</span></span><span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">        }</span></span></code></pre>
  </details>

- 和文件系统：read/edit/write/shell/external_directory 等工具把具体路径或 glob pattern 交给权限系统判断。
- 和 CLI/UI：CLI 监听 `permission.asked` 事件，非交互模式默认 reject。来源：`packages/opencode/src/cli/cmd/run.ts:736-755`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:736-755</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">736</span><span class="source-line-text">            if (event.type === &quot;permission.asked&quot;) {</span></span><span class="source-line"><span class="source-line-number">737</span><span class="source-line-text">              const permission = event.properties</span></span><span class="source-line"><span class="source-line-number">738</span><span class="source-line-text">              if (permission.sessionID !== sessionID) continue</span></span><span class="source-line"><span class="source-line-number">739</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">740</span><span class="source-line-text">              if (args[&quot;dangerously-skip-permissions&quot;]) {</span></span><span class="source-line"><span class="source-line-number">741</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">742</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">743</span><span class="source-line-text">                  reply: &quot;once&quot;,</span></span><span class="source-line"><span class="source-line-number">744</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">745</span><span class="source-line-text">              } else {</span></span><span class="source-line"><span class="source-line-number">746</span><span class="source-line-text">                UI.println(</span></span><span class="source-line"><span class="source-line-number">747</span><span class="source-line-text">                  UI.Style.TEXT_WARNING_BOLD + &quot;!&quot;,</span></span><span class="source-line"><span class="source-line-number">748</span><span class="source-line-text">                  UI.Style.TEXT_NORMAL +</span></span><span class="source-line"><span class="source-line-number">749</span><span class="source-line-text">                    `permission requested: ${permission.permission} (${permission.patterns.join(&quot;, &quot;)}); auto-rejecting`,</span></span><span class="source-line"><span class="source-line-number">750</span><span class="source-line-text">                )</span></span><span class="source-line"><span class="source-line-number">751</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">752</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">753</span><span class="source-line-text">                  reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">754</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">755</span><span class="source-line-text">              }</span></span></code></pre>
  </details>


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

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:19-73</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">export const Action = Schema.Literals([&quot;allow&quot;, &quot;deny&quot;, &quot;ask&quot;]).annotate({ identifier: &quot;PermissionAction&quot; })</span></span><span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">export type Action = Schema.Schema.Type&lt;typeof Action&gt;</span></span><span class="source-line"><span class="source-line-number">21</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">export const Rule = Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">  pattern: Schema.String,</span></span><span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  action: Action,</span></span><span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">}).annotate({ identifier: &quot;PermissionRule&quot; })</span></span><span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">export type Rule = Schema.Schema.Type&lt;typeof Rule&gt;</span></span><span class="source-line"><span class="source-line-number">28</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">export const Ruleset = Schema.mutable(Schema.Array(Rule)).annotate({ identifier: &quot;PermissionRuleset&quot; })</span></span><span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">export type Ruleset = Schema.Schema.Type&lt;typeof Ruleset&gt;</span></span><span class="source-line"><span class="source-line-number">31</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">export class Request extends Schema.Class&lt;Request&gt;(&quot;PermissionRequest&quot;)({</span></span><span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  id: PermissionID,</span></span><span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  sessionID: SessionID,</span></span><span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  permission: Schema.String,</span></span><span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  patterns: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  metadata: Schema.Record(Schema.String, Schema.Unknown),</span></span><span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  always: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  tool: Schema.optional(</span></span><span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">    Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">      messageID: MessageID,</span></span><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">      callID: Schema.String,</span></span><span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    }),</span></span><span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  ),</span></span><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">}) {}</span></span><span class="source-line"><span class="source-line-number">46</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">export const Reply = Schema.Literals([&quot;once&quot;, &quot;always&quot;, &quot;reject&quot;])</span></span><span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">export type Reply = Schema.Schema.Type&lt;typeof Reply&gt;</span></span><span class="source-line"><span class="source-line-number">49</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">const reply = {</span></span><span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  reply: Reply,</span></span><span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">  message: Schema.optional(Schema.String),</span></span><span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">}</span></span><span class="source-line"><span class="source-line-number">54</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">export const ReplyBody = Schema.Struct(reply).annotate({ identifier: &quot;PermissionReplyBody&quot; })</span></span><span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">export type ReplyBody = Schema.Schema.Type&lt;typeof ReplyBody&gt;</span></span><span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export class Approval extends Schema.Class&lt;Approval&gt;(&quot;PermissionApproval&quot;)({</span></span><span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  projectID: ProjectID,</span></span><span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">  patterns: Schema.Array(Schema.String),</span></span><span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">}) {}</span></span><span class="source-line"><span class="source-line-number">62</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">export const Event = {</span></span><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">  Asked: BusEvent.define(&quot;permission.asked&quot;, Request),</span></span><span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">  Replied: BusEvent.define(</span></span><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">    &quot;permission.replied&quot;,</span></span><span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">    Schema.Struct({</span></span><span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">      sessionID: SessionID,</span></span><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">      requestID: PermissionID,</span></span><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">      reply: Reply,</span></span><span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">    }),</span></span><span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">  ),</span></span><span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">}</span></span></code></pre>
  </details>

3. `packages/opencode/src/permission/index.ts:161-254`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/permission/index.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/permission/index.ts:161-254</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">161</span><span class="source-line-text">    const ask = Effect.fn(&quot;Permission.ask&quot;)(function* (input: AskInput) {</span></span><span class="source-line"><span class="source-line-number">162</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">163</span><span class="source-line-text">      const { ruleset, ...request } = input</span></span><span class="source-line"><span class="source-line-number">164</span><span class="source-line-text">      let needsAsk = false</span></span><span class="source-line"><span class="source-line-number">165</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">166</span><span class="source-line-text">      for (const pattern of request.patterns) {</span></span><span class="source-line"><span class="source-line-number">167</span><span class="source-line-text">        const rule = evaluate(request.permission, pattern, ruleset, approved)</span></span><span class="source-line"><span class="source-line-number">168</span><span class="source-line-text">        log.info(&quot;evaluated&quot;, { permission: request.permission, pattern, action: rule })</span></span><span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">        if (rule.action === &quot;deny&quot;) {</span></span><span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">          return yield* new DeniedError({</span></span><span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">            ruleset: ruleset.filter((rule) =&gt; Wildcard.match(request.permission, rule.permission)),</span></span><span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">        if (rule.action === &quot;allow&quot;) continue</span></span><span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">        needsAsk = true</span></span><span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">177</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">      if (!needsAsk) return</span></span><span class="source-line"><span class="source-line-number">179</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">      const id = request.id ?? PermissionID.ascending()</span></span><span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">      const info = Schema.decodeUnknownSync(Request)({</span></span><span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">        id,</span></span><span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">        ...request,</span></span><span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">      log.info(&quot;asking&quot;, { id, permission: info.permission, patterns: info.patterns })</span></span><span class="source-line"><span class="source-line-number">186</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">      const deferred = yield* Deferred.make&lt;void, RejectedError | CorrectedError&gt;()</span></span><span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">      pending.set(id, { info, deferred })</span></span><span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">      yield* bus.publish(Event.Asked, info)</span></span><span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">      return yield* Effect.ensuring(</span></span><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        Deferred.await(deferred),</span></span><span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        Effect.sync(() =&gt; {</span></span><span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        }),</span></span><span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">      )</span></span><span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">    })</span></span><span class="source-line"><span class="source-line-number">197</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">    const reply = Effect.fn(&quot;Permission.reply&quot;)(function* (input: ReplyInput) {</span></span><span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">      const { approved, pending } = yield* InstanceState.get(state)</span></span><span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">      const existing = pending.get(input.requestID)</span></span><span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">      if (!existing) return</span></span><span class="source-line"><span class="source-line-number">202</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">      pending.delete(input.requestID)</span></span><span class="source-line"><span class="source-line-number">204</span><span class="source-line-text">      yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">        sessionID: existing.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">        requestID: existing.info.id,</span></span><span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        reply: input.reply,</span></span><span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">      })</span></span><span class="source-line"><span class="source-line-number">209</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">      if (input.reply === &quot;reject&quot;) {</span></span><span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">        yield* Deferred.fail(</span></span><span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">          existing.deferred,</span></span><span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">          input.message ? new CorrectedError({ feedback: input.message }) : new RejectedError(),</span></span><span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">215</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">        for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">          if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">          pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">          yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">            sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">            requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">            reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">          })</span></span><span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">          yield* Deferred.fail(item.deferred, new RejectedError())</span></span><span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">        return</span></span><span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">228</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">229</span><span class="source-line-text">      yield* Deferred.succeed(existing.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">230</span><span class="source-line-text">      if (input.reply === &quot;once&quot;) return</span></span><span class="source-line"><span class="source-line-number">231</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">232</span><span class="source-line-text">      for (const pattern of existing.info.always) {</span></span><span class="source-line"><span class="source-line-number">233</span><span class="source-line-text">        approved.push({</span></span><span class="source-line"><span class="source-line-number">234</span><span class="source-line-text">          permission: existing.info.permission,</span></span><span class="source-line"><span class="source-line-number">235</span><span class="source-line-text">          pattern,</span></span><span class="source-line"><span class="source-line-number">236</span><span class="source-line-text">          action: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">237</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">238</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">239</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">240</span><span class="source-line-text">      for (const [id, item] of pending.entries()) {</span></span><span class="source-line"><span class="source-line-number">241</span><span class="source-line-text">        if (item.info.sessionID !== existing.info.sessionID) continue</span></span><span class="source-line"><span class="source-line-number">242</span><span class="source-line-text">        const ok = item.info.patterns.every(</span></span><span class="source-line"><span class="source-line-number">243</span><span class="source-line-text">          (pattern) =&gt; evaluate(item.info.permission, pattern, approved).action === &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">244</span><span class="source-line-text">        )</span></span><span class="source-line"><span class="source-line-number">245</span><span class="source-line-text">        if (!ok) continue</span></span><span class="source-line"><span class="source-line-number">246</span><span class="source-line-text">        pending.delete(id)</span></span><span class="source-line"><span class="source-line-number">247</span><span class="source-line-text">        yield* bus.publish(Event.Replied, {</span></span><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">          sessionID: item.info.sessionID,</span></span><span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">          requestID: item.info.id,</span></span><span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">          reply: &quot;always&quot;,</span></span><span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">        yield* Deferred.succeed(item.deferred, undefined)</span></span><span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">      }</span></span><span class="source-line"><span class="source-line-number">254</span><span class="source-line-text">    })</span></span></code></pre>
  </details>

4. `packages/opencode/src/session/tools.ts:42-72`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:42-72</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  const context = (args: Record&lt;string, unknown&gt;, options: ToolExecutionOptions): Tool.Context =&gt; ({</span></span><span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    sessionID: input.session.id,</span></span><span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">    abort: options.abortSignal!,</span></span><span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">    messageID: input.processor.message.id,</span></span><span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    callID: options.toolCallId,</span></span><span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps: input.promptOps },</span></span><span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    agent: input.agent.name,</span></span><span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">    messages: input.messages,</span></span><span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">    metadata: (val) =&gt;</span></span><span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      input.processor.updateToolCall(options.toolCallId, (match) =&gt; {</span></span><span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        if (![&quot;running&quot;, &quot;pending&quot;].includes(match.state.status)) return match</span></span><span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">        return {</span></span><span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          ...match,</span></span><span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">          state: {</span></span><span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            title: val.title,</span></span><span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            metadata: val.metadata,</span></span><span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            status: &quot;running&quot;,</span></span><span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            input: args,</span></span><span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            time: { start: Date.now() },</span></span><span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">        }</span></span><span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      }),</span></span><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span><span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span><span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span><span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span><span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span><span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span><span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span></code></pre>
  </details>

5. `packages/opencode/src/agent/agent.ts:103-160`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/agent/agent.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/agent/agent.ts:103-160</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">        const defaults = Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">          &quot;*&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">          doom_loop: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">          external_directory: {</span></span><span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            &quot;*&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            ...Object.fromEntries(whitelistedDirs.map((dir) =&gt; [dir, &quot;allow&quot;])),</span></span><span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">          question: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">          plan_enter: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          plan_exit: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">          repo_clone: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">          repo_overview: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files</span></span><span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">          read: {</span></span><span class="source-line"><span class="source-line-number">117</span><span class="source-line-text">            &quot;*&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">118</span><span class="source-line-text">            &quot;*.env&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">119</span><span class="source-line-text">            &quot;*.env.*&quot;: &quot;ask&quot;,</span></span><span class="source-line"><span class="source-line-number">120</span><span class="source-line-text">            &quot;*.env.example&quot;: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">121</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">122</span><span class="source-line-text">        })</span></span><span class="source-line"><span class="source-line-number">123</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">124</span><span class="source-line-text">        const user = Permission.fromConfig(cfg.permission ?? {})</span></span><span class="source-line"><span class="source-line-number">125</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">126</span><span class="source-line-text">        const agents: Record&lt;string, Info&gt; = {</span></span><span class="source-line"><span class="source-line-number">127</span><span class="source-line-text">          build: {</span></span><span class="source-line"><span class="source-line-number">128</span><span class="source-line-text">            name: &quot;build&quot;,</span></span><span class="source-line"><span class="source-line-number">129</span><span class="source-line-text">            description: &quot;The default agent. Executes tools based on configured permissions.&quot;,</span></span><span class="source-line"><span class="source-line-number">130</span><span class="source-line-text">            options: {},</span></span><span class="source-line"><span class="source-line-number">131</span><span class="source-line-text">            permission: Permission.merge(</span></span><span class="source-line"><span class="source-line-number">132</span><span class="source-line-text">              defaults,</span></span><span class="source-line"><span class="source-line-number">133</span><span class="source-line-text">              Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">134</span><span class="source-line-text">                question: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">135</span><span class="source-line-text">                plan_enter: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">136</span><span class="source-line-text">              }),</span></span><span class="source-line"><span class="source-line-number">137</span><span class="source-line-text">              user,</span></span><span class="source-line"><span class="source-line-number">138</span><span class="source-line-text">            ),</span></span><span class="source-line"><span class="source-line-number">139</span><span class="source-line-text">            mode: &quot;primary&quot;,</span></span><span class="source-line"><span class="source-line-number">140</span><span class="source-line-text">            native: true,</span></span><span class="source-line"><span class="source-line-number">141</span><span class="source-line-text">          },</span></span><span class="source-line"><span class="source-line-number">142</span><span class="source-line-text">          plan: {</span></span><span class="source-line"><span class="source-line-number">143</span><span class="source-line-text">            name: &quot;plan&quot;,</span></span><span class="source-line"><span class="source-line-number">144</span><span class="source-line-text">            description: &quot;Plan mode. Disallows all edit tools.&quot;,</span></span><span class="source-line"><span class="source-line-number">145</span><span class="source-line-text">            options: {},</span></span><span class="source-line"><span class="source-line-number">146</span><span class="source-line-text">            permission: Permission.merge(</span></span><span class="source-line"><span class="source-line-number">147</span><span class="source-line-text">              defaults,</span></span><span class="source-line"><span class="source-line-number">148</span><span class="source-line-text">              Permission.fromConfig({</span></span><span class="source-line"><span class="source-line-number">149</span><span class="source-line-text">                question: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">150</span><span class="source-line-text">                plan_exit: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">151</span><span class="source-line-text">                external_directory: {</span></span><span class="source-line"><span class="source-line-number">152</span><span class="source-line-text">                  [path.join(Global.Path.data, &quot;plans&quot;, &quot;*&quot;)]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">153</span><span class="source-line-text">                },</span></span><span class="source-line"><span class="source-line-number">154</span><span class="source-line-text">                edit: {</span></span><span class="source-line"><span class="source-line-number">155</span><span class="source-line-text">                  &quot;*&quot;: &quot;deny&quot;,</span></span><span class="source-line"><span class="source-line-number">156</span><span class="source-line-text">                  [path.join(&quot;.opencode&quot;, &quot;plans&quot;, &quot;*.md&quot;)]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">157</span><span class="source-line-text">                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join(&quot;plans&quot;, &quot;*.md&quot;)))]: &quot;allow&quot;,</span></span><span class="source-line"><span class="source-line-number">158</span><span class="source-line-text">                },</span></span><span class="source-line"><span class="source-line-number">159</span><span class="source-line-text">              }),</span></span><span class="source-line"><span class="source-line-number">160</span><span class="source-line-text">              user,</span></span></code></pre>
  </details>

6. `packages/opencode/src/cli/cmd/run.ts:736-755`

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:736-755</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">736</span><span class="source-line-text">            if (event.type === &quot;permission.asked&quot;) {</span></span><span class="source-line"><span class="source-line-number">737</span><span class="source-line-text">              const permission = event.properties</span></span><span class="source-line"><span class="source-line-number">738</span><span class="source-line-text">              if (permission.sessionID !== sessionID) continue</span></span><span class="source-line"><span class="source-line-number">739</span><span class="source-line-text"></span></span><span class="source-line"><span class="source-line-number">740</span><span class="source-line-text">              if (args[&quot;dangerously-skip-permissions&quot;]) {</span></span><span class="source-line"><span class="source-line-number">741</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">742</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">743</span><span class="source-line-text">                  reply: &quot;once&quot;,</span></span><span class="source-line"><span class="source-line-number">744</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">745</span><span class="source-line-text">              } else {</span></span><span class="source-line"><span class="source-line-number">746</span><span class="source-line-text">                UI.println(</span></span><span class="source-line"><span class="source-line-number">747</span><span class="source-line-text">                  UI.Style.TEXT_WARNING_BOLD + &quot;!&quot;,</span></span><span class="source-line"><span class="source-line-number">748</span><span class="source-line-text">                  UI.Style.TEXT_NORMAL +</span></span><span class="source-line"><span class="source-line-number">749</span><span class="source-line-text">                    `permission requested: ${permission.permission} (${permission.patterns.join(&quot;, &quot;)}); auto-rejecting`,</span></span><span class="source-line"><span class="source-line-number">750</span><span class="source-line-text">                )</span></span><span class="source-line"><span class="source-line-number">751</span><span class="source-line-text">                await client.permission.reply({</span></span><span class="source-line"><span class="source-line-number">752</span><span class="source-line-text">                  requestID: permission.id,</span></span><span class="source-line"><span class="source-line-number">753</span><span class="source-line-text">                  reply: &quot;reject&quot;,</span></span><span class="source-line"><span class="source-line-number">754</span><span class="source-line-text">                })</span></span><span class="source-line"><span class="source-line-number">755</span><span class="source-line-text">              }</span></span></code></pre>
  </details>


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


