---
title: "Agent 核心循环"
description: "理解 OpenCode 如何在 session 内反复读取消息、选择模型和工具、调用 LLM、处理 tool call，并决定继续或结束。"
sidebar:
  label: "03. Agent 核心循环"
  order: 3
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>较难</div>
  <div><strong>预计阅读</strong>55 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/03-agent-core-loop.md"><code>markdown/03-agent-core-loop.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`03-agent-core-loop`
- 章节摘要：理解 OpenCode 如何在 session 内反复读取消息、选择模型和工具、调用 LLM、处理 tool call，并决定继续或结束。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/session/prompt.ts</code></li>
<li><code>packages/opencode/src/session/processor.ts</code></li>
<li><code>packages/opencode/src/session/run-state.ts</code></li>
<li><code>packages/opencode/src/session/tools.ts</code></li>
<li><code>packages/opencode/src/session/llm.ts</code></li>
<li><code>packages/opencode/src/session/llm/ai-sdk.ts</code></li>
<li><code>packages/opencode/src/session/message-v2.ts</code></li>
<li><code>packages/opencode/src/cli/cmd/run.ts</code></li>
<li><code>packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts</code></li>

</ul>


> 模块来源：`study-output/02-opencode-function-outline.md` 的 “2.3 Agent 核心循环”。  
> 主要源码：`packages/opencode/src/session/prompt.ts`、`packages/opencode/src/session/processor.ts`、`packages/opencode/src/session/tools.ts`、`packages/opencode/src/session/llm.ts`、`packages/opencode/src/session/message-v2.ts`。

## 0. 本章学习目标

学完这一章，你应该能用自己的话解释：

1. 用户输入如何进入 `SessionPrompt.prompt`。
2. OpenCode 为什么需要 `runLoop`，而不是直接调用一次模型。
3. `runLoop` 如何选择 agent、model、tools 和 system prompt。
4. `SessionProcessor` 如何把 LLM 流式事件转成 text/tool parts。
5. tool result 如何回到 message history，并触发下一轮推理。
6. 如果自己写 mini agent，最小 loop 应该包含哪些代码。

## 1. 一句话讲明白

Agent 核心循环就是一个会持续运行的会话状态机：它读取最近的用户消息，准备模型和工具，调用 LLM，处理模型产生的文本或工具调用，把工具结果写回消息历史，然后决定继续下一轮还是停止。  
来源：`packages/opencode/src/session/prompt.ts:1240-1489`、`packages/opencode/src/session/processor.ts:779-847`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1240-1489</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1240</span><span class="source-line-text">    const runLoop: (sessionID: SessionID) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt; = Effect.fn(&quot;SessionPrompt.run&quot;)(</span></span>
<span class="source-line"><span class="source-line-number">1241</span><span class="source-line-text">      function* (sessionID: SessionID) {</span></span>
<span class="source-line"><span class="source-line-number">1242</span><span class="source-line-text">        const ctx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">1243</span><span class="source-line-text">        const slog = elog.with({ sessionID })</span></span>
<span class="source-line"><span class="source-line-number">1244</span><span class="source-line-text">        let structured: unknown</span></span>
<span class="source-line"><span class="source-line-number">1245</span><span class="source-line-text">        let step = 0</span></span>
<span class="source-line"><span class="source-line-number">1246</span><span class="source-line-text">        const session = yield* sessions.get(sessionID).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">1247</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
<span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
<span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
<span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
<span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
<span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
<span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
<span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
<span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
<span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
<span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
<span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
<span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1277</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1278</span><span class="source-line-text">          step++</span></span>
<span class="source-line"><span class="source-line-number">1279</span><span class="source-line-text">          if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1280</span><span class="source-line-text">            yield* title({</span></span>
<span class="source-line"><span class="source-line-number">1281</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1282</span><span class="source-line-text">              modelID: lastUser.model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">1283</span><span class="source-line-text">              providerID: lastUser.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1284</span><span class="source-line-text">              history: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1285</span><span class="source-line-text">            }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1286</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
<span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
<span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
<span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
<span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
<span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
<span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
<span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
<span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span>
<span class="source-line"><span class="source-line-number">1318</span><span class="source-line-text">            const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">1319</span><span class="source-line-text">            const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">1320</span><span class="source-line-text">            const error = new NamedError.Unknown({ message: `Agent not found: &quot;${lastUser.agent}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">1321</span><span class="source-line-text">            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">1322</span><span class="source-line-text">            throw error</span></span>
<span class="source-line"><span class="source-line-number">1323</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1324</span><span class="source-line-text">          const maxSteps = agent.steps ?? Infinity</span></span>
<span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
<span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
<span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
<span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
<span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
<span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
<span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
<span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
<span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
<span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
<span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
<span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
<span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
<span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
<span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
<span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
<span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
<span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
<span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
<span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
<span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
<span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
<span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
<span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
<span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
<span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
<span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
<span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
<span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
<span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
<span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
<span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
<span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
<span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
<span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
<span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
<span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
<span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
<span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
<span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
<span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
<span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
<span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
<span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
<span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
<span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
<span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
<span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
<span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
<span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
<span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
<span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1441</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1442</span><span class="source-line-text">            if (structured !== undefined) {</span></span>
<span class="source-line"><span class="source-line-number">1443</span><span class="source-line-text">              handle.message.structured = structured</span></span>
<span class="source-line"><span class="source-line-number">1444</span><span class="source-line-text">              handle.message.finish = handle.message.finish ?? &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">1445</span><span class="source-line-text">              yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1446</span><span class="source-line-text">              return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1447</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1448</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1449</span><span class="source-line-text">            const finished = handle.message.finish &amp;&amp; ![&quot;tool-calls&quot;, &quot;unknown&quot;].includes(handle.message.finish)</span></span>
<span class="source-line"><span class="source-line-number">1450</span><span class="source-line-text">            if (finished &amp;&amp; !handle.message.error) {</span></span>
<span class="source-line"><span class="source-line-number">1451</span><span class="source-line-text">              if (format.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1452</span><span class="source-line-text">                handle.message.error = new MessageV2.StructuredOutputError({</span></span>
<span class="source-line"><span class="source-line-number">1453</span><span class="source-line-text">                  message: &quot;Model did not produce structured output&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1454</span><span class="source-line-text">                  retries: 0,</span></span>
<span class="source-line"><span class="source-line-number">1455</span><span class="source-line-text">                }).toObject()</span></span>
<span class="source-line"><span class="source-line-number">1456</span><span class="source-line-text">                yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1457</span><span class="source-line-text">                return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1458</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1459</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1460</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
<span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
<span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
<span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
<span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
<span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1472</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1473</span><span class="source-line-text">            Effect.ensuring(instruction.clear(handle.message.id)),</span></span>
<span class="source-line"><span class="source-line-number">1474</span><span class="source-line-text">            Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant),</span></span>
<span class="source-line"><span class="source-line-number">1475</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1476</span><span class="source-line-text">          if (outcome === &quot;break&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1477</span><span class="source-line-text">          continue</span></span>
<span class="source-line"><span class="source-line-number">1478</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">1479</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1480</span><span class="source-line-text">        yield* compaction.prune({ sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1481</span><span class="source-line-text">        return yield* lastAssistant(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1482</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">1483</span><span class="source-line-text">    )</span></span>
<span class="source-line"><span class="source-line-number">1484</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1485</span><span class="source-line-text">    const loop: (input: LoopInput) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt; = Effect.fn(&quot;SessionPrompt.loop&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">1486</span><span class="source-line-text">      input: LoopInput,</span></span>
<span class="source-line"><span class="source-line-number">1487</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">1488</span><span class="source-line-text">      return yield* state.ensureRunning(input.sessionID, lastAssistant(input.sessionID), runLoop(input.sessionID))</span></span>
<span class="source-line"><span class="source-line-number">1489</span><span class="source-line-text">    })</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:779-847</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">      const process = Effect.fn(&quot;SessionProcessor.process&quot;)(function* (streamInput: LLM.StreamInput) {</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">        slog.info(&quot;process&quot;)</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">        ctx.needsCompaction = false</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">        ctx.shouldBreak = (yield* config.get()).experimental?.continue_loop_on_deny !== true</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">        return yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">          yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">            ctx.currentText = undefined</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            ctx.reasoningMap = {}</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            yield* status.set(ctx.sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">            const stream = llm.stream(streamInput)</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">            yield* stream.pipe(</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">              Stream.tap((event) =&gt; handleEvent(event)),</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">              Stream.takeUntil(() =&gt; ctx.needsCompaction),</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">              Stream.runDrain,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            Effect.onInterrupt(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">              Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">                aborted = true</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">                if (!ctx.assistantMessage.error) {</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">                  yield* halt(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;))</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">804</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">805</span><span class="source-line-text">            Effect.catchCauseIf(</span></span>
<span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">              (cause) =&gt; !Cause.hasInterruptsOnly(cause),</span></span>
<span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">              (cause) =&gt; Effect.fail(Cause.squash(cause)),</span></span>
<span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">            Effect.retry(</span></span>
<span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">              SessionRetry.policy({</span></span>
<span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">                provider: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">                parse,</span></span>
<span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">                set: (info) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">                  // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">                  const event = flags.experimentalEventSystem</span></span>
<span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">                    ? events.publish(SessionEvent.Retried, {</span></span>
<span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">                        sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">                        attempt: info.attempt,</span></span>
<span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">                        error: {</span></span>
<span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">                          message: info.message,</span></span>
<span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">                          isRetryable: true,</span></span>
<span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">                        timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">                      })</span></span>
<span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">                    : Effect.void</span></span>
<span class="source-line"><span class="source-line-number">826</span><span class="source-line-text">                  return event.pipe(</span></span>
<span class="source-line"><span class="source-line-number">827</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">828</span><span class="source-line-text">                      status.set(ctx.sessionID, {</span></span>
<span class="source-line"><span class="source-line-number">829</span><span class="source-line-text">                        type: &quot;retry&quot;,</span></span>
<span class="source-line"><span class="source-line-number">830</span><span class="source-line-text">                        attempt: info.attempt,</span></span>
<span class="source-line"><span class="source-line-number">831</span><span class="source-line-text">                        message: info.message,</span></span>
<span class="source-line"><span class="source-line-number">832</span><span class="source-line-text">                        action: info.action,</span></span>
<span class="source-line"><span class="source-line-number">833</span><span class="source-line-text">                        next: info.next,</span></span>
<span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">840</span><span class="source-line-text">            Effect.catch(halt),</span></span>
<span class="source-line"><span class="source-line-number">841</span><span class="source-line-text">            Effect.ensuring(cleanup()),</span></span>
<span class="source-line"><span class="source-line-number">842</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">843</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">          if (ctx.needsCompaction) return &quot;compact&quot;</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">          if (ctx.blocked || ctx.assistantMessage.error) return &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">          return &quot;continue&quot;</span></span>
<span class="source-line"><span class="source-line-number">847</span><span class="source-line-text">        })</span></span></code></pre>
</details>


## 2. 它在 OpenCode agent 中的位置

它处在四个模块的交叉点：

- Session：保存 user/assistant/tool parts。来源：`packages/opencode/src/session/message-v2.ts:554-561`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/message-v2.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/message-v2.ts:554-561</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">554</span><span class="source-line-text">export const WithParts = Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">555</span><span class="source-line-text">  info: Info,</span></span>
  <span class="source-line"><span class="source-line-number">556</span><span class="source-line-text">  parts: Schema.Array(Part),</span></span>
  <span class="source-line"><span class="source-line-number">557</span><span class="source-line-text">})</span></span>
  <span class="source-line"><span class="source-line-number">558</span><span class="source-line-text">export type WithParts = {</span></span>
  <span class="source-line"><span class="source-line-number">559</span><span class="source-line-text">  info: Info</span></span>
  <span class="source-line"><span class="source-line-number">560</span><span class="source-line-text">  parts: Part[]</span></span>
  <span class="source-line"><span class="source-line-number">561</span><span class="source-line-text">}</span></span></code></pre>
  </details>

- Agent/Model：决定这轮用哪个 agent 和 provider/model。来源：`packages/opencode/src/session/prompt.ts:1287-1317`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1287-1317</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
  <span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
  <span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
  <span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
  <span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
  <span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
  <span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
  <span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
  <span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
  <span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
  <span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
  <span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
  <span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
  <span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
  <span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
  <span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
  <span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
  <span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span></code></pre>
  </details>

- Tool：把 read/edit/shell 等工具暴露给模型。来源：`packages/opencode/src/session/tools.ts:24-116`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:24-116</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">export const resolve = Effect.fn(&quot;SessionTools.resolve&quot;)(function* (input: {</span></span>
  <span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  agent: Agent.Info</span></span>
  <span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  model: Provider.Model</span></span>
  <span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">  session: Session.Info</span></span>
  <span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">  processor: Pick&lt;SessionProcessor.Handle, &quot;message&quot; | &quot;updateToolCall&quot; | &quot;completeToolCall&quot;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  bypassAgentCheck: boolean</span></span>
  <span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  messages: MessageV2.WithParts[]</span></span>
  <span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  promptOps: TaskPromptOps</span></span>
  <span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">}) {</span></span>
  <span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  using _ = log.time(&quot;resolveTools&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  const tools: Record&lt;string, AITool&gt; = {}</span></span>
  <span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  const run = yield* EffectBridge.make()</span></span>
  <span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  const plugin = yield* Plugin.Service</span></span>
  <span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  const permission = yield* Permission.Service</span></span>
  <span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  const registry = yield* ToolRegistry.Service</span></span>
  <span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  const mcp = yield* MCP.Service</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  const truncate = yield* Truncate.Service</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  const context = (args: Record&lt;string, unknown&gt;, options: ToolExecutionOptions): Tool.Context =&gt; ({</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    sessionID: input.session.id,</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">    abort: options.abortSignal!,</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">    messageID: input.processor.message.id,</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    callID: options.toolCallId,</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps: input.promptOps },</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    agent: input.agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">    messages: input.messages,</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">    metadata: (val) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      input.processor.updateToolCall(options.toolCallId, (match) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        if (![&quot;running&quot;, &quot;pending&quot;].includes(match.state.status)) return match</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">        return {</span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          ...match,</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">          state: {</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            title: val.title,</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            metadata: val.metadata,</span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            status: &quot;running&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            input: args,</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            time: { start: Date.now() },</span></span>
  <span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      }),</span></span>
  <span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span>
  <span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span>
  <span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span>
  <span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span>
  <span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span>
  <span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span>
  <span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span>
  <span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span>
  <span class="source-line"><span class="source-line-number">74</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
  <span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    modelID: ModelID.make(input.model.api.id),</span></span>
  <span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    providerID: input.model.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">    agent: input.agent,</span></span>
  <span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">  })) {</span></span>
  <span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))</span></span>
  <span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">    tools[item.id] = tool({</span></span>
  <span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      description: item.description,</span></span>
  <span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      inputSchema: jsonSchema(schema),</span></span>
  <span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      execute(args, options) {</span></span>
  <span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">        return run.promise(</span></span>
  <span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            const ctx = context(args, options)</span></span>
  <span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
  <span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">              &quot;tool.execute.before&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
  <span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">              { args },</span></span>
  <span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            const result = yield* item.execute(args, ctx)</span></span>
  <span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            const output = {</span></span>
  <span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              ...result,</span></span>
  <span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              attachments: result.attachments?.map((attachment) =&gt; ({</span></span>
  <span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                ...attachment,</span></span>
  <span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                id: PartID.ascending(),</span></span>
  <span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                messageID: input.processor.message.id,</span></span>
  <span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">              })),</span></span>
  <span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
  <span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">              &quot;tool.execute.after&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },</span></span>
  <span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">              output,</span></span>
  <span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            if (options.abortSignal?.aborted) {</span></span>
  <span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">              yield* input.processor.completeToolCall(options.toolCallId, output)</span></span>
  <span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">            return output</span></span>
  <span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          }),</span></span>
  <span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">        )</span></span>
  <span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      },</span></span>
  <span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span>
  <span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">  }</span></span></code></pre>
  </details>

- LLM：发送 system/messages/tools，消费流式响应。来源：`packages/opencode/src/session/llm.ts:39-60`、`packages/opencode/src/session/llm.ts:471-493`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:39-60</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export type StreamInput = {</span></span>
  <span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  user: MessageV2.User</span></span>
  <span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  sessionID: string</span></span>
  <span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  parentSessionID?: string</span></span>
  <span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  model: Provider.Model</span></span>
  <span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  agent: Agent.Info</span></span>
  <span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  permission?: Permission.Ruleset</span></span>
  <span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  system: string[]</span></span>
  <span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  messages: ModelMessage[]</span></span>
  <span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  small?: boolean</span></span>
  <span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span>
  <span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  retries?: number</span></span>
  <span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span>
  <span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">53</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">export type StreamRequest = StreamInput &amp; {</span></span>
  <span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  abort: AbortSignal</span></span>
  <span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export interface Interface {</span></span>
  <span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  readonly stream: (input: StreamInput) =&gt; Stream.Stream&lt;LLMEvent, unknown&gt;</span></span>
  <span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">}</span></span></code></pre>
  </details>

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:471-493</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">    const stream: Interface[&quot;stream&quot;] = (input) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      Stream.scoped(</span></span>
  <span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        Stream.unwrap(</span></span>
  <span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
  <span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            const ctrl = yield* Effect.acquireRelease(</span></span>
  <span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">              Effect.sync(() =&gt; new AbortController()),</span></span>
  <span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              (ctrl) =&gt; Effect.sync(() =&gt; ctrl.abort()),</span></span>
  <span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">479</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">            const result = yield* run({ ...input, abort: ctrl.signal })</span></span>
  <span class="source-line"><span class="source-line-number">481</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">            if (result.type === &quot;native&quot;) return result.stream</span></span>
  <span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">            const state = LLMAISDK.adapterState()</span></span>
  <span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            return Stream.fromAsyncIterable(result.result.fullStream, (e) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              e instanceof Error ? e : new Error(String(e)),</span></span>
  <span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">            ).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              Stream.mapEffect((event) =&gt; LLMAISDK.toLLMEvents(state, event)),</span></span>
  <span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              Stream.flatMap((events) =&gt; Stream.fromIterable(events)),</span></span>
  <span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">          }),</span></span>
  <span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">        ),</span></span>
  <span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      )</span></span></code></pre>
  </details>


最小位置图：

```text
CLI/API
  -> SessionPrompt.prompt
  -> SessionPrompt.runLoop
  -> SessionTools.resolve
  -> SessionProcessor.process
  -> LLM.stream
  -> SessionProcessor.handleEvent
  -> message parts
  -> runLoop next round
```

## 3. 生活类比

把 agent loop 想成一个项目经理在处理任务：

1. 用户给项目经理一个需求。
2. 项目经理看当前项目记录和最近进展。
3. 项目经理决定找哪个专家、用哪些工具。
4. 专家给出建议，可能说“我需要先查文件”或“我需要跑命令”。
5. 项目经理让工具执行，把结果贴回工作记录。
6. 专家看到新结果后继续判断。
7. 直到专家说“完成了”，项目经理停止循环。

这个类比对应源码里的 `while (true)`：每一轮都从 session message history 重新构造上下文。来源：`packages/opencode/src/session/prompt.ts:1248-1477`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1248-1477</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
<span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
<span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
<span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
<span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
<span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
<span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
<span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
<span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
<span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
<span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
<span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
<span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1277</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1278</span><span class="source-line-text">          step++</span></span>
<span class="source-line"><span class="source-line-number">1279</span><span class="source-line-text">          if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1280</span><span class="source-line-text">            yield* title({</span></span>
<span class="source-line"><span class="source-line-number">1281</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1282</span><span class="source-line-text">              modelID: lastUser.model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">1283</span><span class="source-line-text">              providerID: lastUser.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1284</span><span class="source-line-text">              history: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1285</span><span class="source-line-text">            }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1286</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
<span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
<span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
<span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
<span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
<span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
<span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
<span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
<span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span>
<span class="source-line"><span class="source-line-number">1318</span><span class="source-line-text">            const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">1319</span><span class="source-line-text">            const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">1320</span><span class="source-line-text">            const error = new NamedError.Unknown({ message: `Agent not found: &quot;${lastUser.agent}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">1321</span><span class="source-line-text">            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">1322</span><span class="source-line-text">            throw error</span></span>
<span class="source-line"><span class="source-line-number">1323</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1324</span><span class="source-line-text">          const maxSteps = agent.steps ?? Infinity</span></span>
<span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
<span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
<span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
<span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
<span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
<span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
<span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
<span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
<span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
<span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
<span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
<span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
<span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
<span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
<span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
<span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
<span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
<span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
<span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
<span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
<span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
<span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
<span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
<span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
<span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
<span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
<span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
<span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
<span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
<span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
<span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
<span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
<span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
<span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
<span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
<span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
<span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
<span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
<span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
<span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
<span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
<span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
<span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
<span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
<span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
<span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
<span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
<span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
<span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
<span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
<span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
<span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1441</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1442</span><span class="source-line-text">            if (structured !== undefined) {</span></span>
<span class="source-line"><span class="source-line-number">1443</span><span class="source-line-text">              handle.message.structured = structured</span></span>
<span class="source-line"><span class="source-line-number">1444</span><span class="source-line-text">              handle.message.finish = handle.message.finish ?? &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">1445</span><span class="source-line-text">              yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1446</span><span class="source-line-text">              return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1447</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1448</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1449</span><span class="source-line-text">            const finished = handle.message.finish &amp;&amp; ![&quot;tool-calls&quot;, &quot;unknown&quot;].includes(handle.message.finish)</span></span>
<span class="source-line"><span class="source-line-number">1450</span><span class="source-line-text">            if (finished &amp;&amp; !handle.message.error) {</span></span>
<span class="source-line"><span class="source-line-number">1451</span><span class="source-line-text">              if (format.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1452</span><span class="source-line-text">                handle.message.error = new MessageV2.StructuredOutputError({</span></span>
<span class="source-line"><span class="source-line-number">1453</span><span class="source-line-text">                  message: &quot;Model did not produce structured output&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1454</span><span class="source-line-text">                  retries: 0,</span></span>
<span class="source-line"><span class="source-line-number">1455</span><span class="source-line-text">                }).toObject()</span></span>
<span class="source-line"><span class="source-line-number">1456</span><span class="source-line-text">                yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1457</span><span class="source-line-text">                return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1458</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1459</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1460</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
<span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
<span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
<span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
<span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
<span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1472</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1473</span><span class="source-line-text">            Effect.ensuring(instruction.clear(handle.message.id)),</span></span>
<span class="source-line"><span class="source-line-number">1474</span><span class="source-line-text">            Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant),</span></span>
<span class="source-line"><span class="source-line-number">1475</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1476</span><span class="source-line-text">          if (outcome === &quot;break&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1477</span><span class="source-line-text">          continue</span></span></code></pre>
</details>


## 4. Java 开发者类比

如果用 Java 写，`SessionPrompt.runLoop` 很像一个 Application Service + State Machine：

```java
while (true) {
  List<Message> messages = messageRepository.loadContext(sessionId);
  Latest latest = MessageV2.latest(messages);
  Agent agent = agentService.get(latest.user().agent());
  Model model = providerService.getModel(latest.user().model());
  Map<String, Tool> tools = toolRegistry.resolve(agent, model, session);
  LlmResult result = llmGateway.stream(system, messages, tools);
  processor.apply(result, session);
  if (result.stop()) break;
}
```

但 OpenCode 不是 Java class 风格。它大量使用：

- `Effect.gen(function* () { ... })` 表达带依赖和错误通道的异步流程。来源：`packages/opencode/src/session/prompt.ts:1240-1241`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1240-1241</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1240</span><span class="source-line-text">    const runLoop: (sessionID: SessionID) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt; = Effect.fn(&quot;SessionPrompt.run&quot;)(</span></span>
  <span class="source-line"><span class="source-line-number">1241</span><span class="source-line-text">      function* (sessionID: SessionID) {</span></span></code></pre>
  </details>

- 对象字面量创建 message。来源：`packages/opencode/src/session/prompt.ts:1332-1346`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1332-1346</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
  <span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
  <span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
  <span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
  <span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
  <span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
  <span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
  <span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
  <span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
  <span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
  <span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
  <span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span></code></pre>
  </details>

- union/literal type 表达 tool state。来源：`packages/opencode/src/session/message-v2.ts:248-320`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/message-v2.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/message-v2.ts:248-320</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">export const ToolStatePending = Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">  status: Schema.Literal(&quot;pending&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">  input: Schema.Record(Schema.String, Schema.Any),</span></span>
  <span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">  raw: Schema.String,</span></span>
  <span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolStatePending&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">export type ToolStatePending = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolStatePending&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">254</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">export const ToolStateRunning = Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">  status: Schema.Literal(&quot;running&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">  input: Schema.Record(Schema.String, Schema.Any),</span></span>
  <span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">  title: Schema.optional(Schema.String),</span></span>
  <span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),</span></span>
  <span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">  time: Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">    start: NonNegativeInt,</span></span>
  <span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">  }),</span></span>
  <span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolStateRunning&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">export type ToolStateRunning = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolStateRunning&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">265</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">export const ToolStateCompleted = Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">  status: Schema.Literal(&quot;completed&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">  input: Schema.Record(Schema.String, Schema.Any),</span></span>
  <span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">  output: Schema.String,</span></span>
  <span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">  title: Schema.String,</span></span>
  <span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">  metadata: Schema.Record(Schema.String, Schema.Any),</span></span>
  <span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">  time: Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">    start: NonNegativeInt,</span></span>
  <span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">    end: NonNegativeInt,</span></span>
  <span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">    compacted: Schema.optional(NonNegativeInt),</span></span>
  <span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">  }),</span></span>
  <span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">  attachments: Schema.optional(Schema.Array(FilePart)),</span></span>
  <span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolStateCompleted&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">export type ToolStateCompleted = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolStateCompleted&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">280</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">function truncateToolOutput(text: string, maxChars?: number) {</span></span>
  <span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">  if (!maxChars || text.length &lt;= maxChars) return text</span></span>
  <span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  const omitted = text.length - maxChars</span></span>
  <span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">  return `${text.slice(0, maxChars)}\n[Tool output truncated for compaction: omitted ${omitted} chars]`</span></span>
  <span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">}</span></span>
  <span class="source-line"><span class="source-line-number">286</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">export const ToolStateError = Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">  status: Schema.Literal(&quot;error&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">  input: Schema.Record(Schema.String, Schema.Any),</span></span>
  <span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">  error: Schema.String,</span></span>
  <span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),</span></span>
  <span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">  time: Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">    start: NonNegativeInt,</span></span>
  <span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">    end: NonNegativeInt,</span></span>
  <span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">  }),</span></span>
  <span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolStateError&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">export type ToolStateError = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolStateError&gt;&gt;</span></span>
  <span class="source-line"><span class="source-line-number">298</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">export const ToolState = Schema.Union([</span></span>
  <span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">  ToolStatePending,</span></span>
  <span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">  ToolStateRunning,</span></span>
  <span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">  ToolStateCompleted,</span></span>
  <span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">  ToolStateError,</span></span>
  <span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">]).annotate({</span></span>
  <span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">  discriminator: &quot;status&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">  identifier: &quot;ToolState&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">})</span></span>
  <span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError</span></span>
  <span class="source-line"><span class="source-line-number">309</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">export const ToolPart = Schema.Struct({</span></span>
  <span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">  ...partBase,</span></span>
  <span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">  type: Schema.Literal(&quot;tool&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">  callID: Schema.String,</span></span>
  <span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">  tool: Schema.String,</span></span>
  <span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">  state: ToolState,</span></span>
  <span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),</span></span>
  <span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolPart&quot; })</span></span>
  <span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">export type ToolPart = Omit&lt;Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolPart&gt;&gt;, &quot;state&quot;&gt; &amp; {</span></span>
  <span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">  state: ToolState</span></span>
  <span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">}</span></span></code></pre>
  </details>


## 5. 最小源码路径

先只记这条路径：

1. CLI 非交互输入调用 `client.session.prompt`。  
   路径：`packages/opencode/src/cli/cmd/run.ts:791-798`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:791-798</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span></code></pre>
</details>


2. HTTP handler 调用 `promptSvc.prompt`。  
   路径：`packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-290`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-290</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    const prompt = Effect.fn(&quot;SessionHttpApi.prompt&quot;)(function* (ctx: {</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">      params: { sessionID: SessionID }</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">      payload: typeof PromptPayload.Type</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">    }) {</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">      yield* requireSession(ctx.params.sessionID)</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">      const message = yield* promptSvc</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">        .prompt({</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">          ...ctx.payload,</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">          sessionID: ctx.params.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">        .pipe(Effect.mapError(() =&gt; new HttpApiError.BadRequest({})))</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">      return HttpServerResponse.stream(Stream.make(JSON.stringify(message)).pipe(Stream.encodeText), {</span></span></code></pre>
</details>


3. `SessionPrompt.prompt` 创建 user message，然后调用 `loop`。  
   路径：`packages/opencode/src/session/prompt.ts:1211-1229`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1211-1229</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1211</span><span class="source-line-text">    const prompt: (input: PromptInput) =&gt; Effect.Effect&lt;MessageV2.WithParts, Image.Error&gt; = Effect.fn(</span></span>
<span class="source-line"><span class="source-line-number">1212</span><span class="source-line-text">      &quot;SessionPrompt.prompt&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1213</span><span class="source-line-text">    )(function* (input: PromptInput) {</span></span>
<span class="source-line"><span class="source-line-number">1214</span><span class="source-line-text">      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">1215</span><span class="source-line-text">      yield* revert.cleanup(session)</span></span>
<span class="source-line"><span class="source-line-number">1216</span><span class="source-line-text">      const message = yield* createUserMessage(input)</span></span>
<span class="source-line"><span class="source-line-number">1217</span><span class="source-line-text">      yield* sessions.touch(input.sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1218</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1219</span><span class="source-line-text">      const permissions: Permission.Ruleset = []</span></span>
<span class="source-line"><span class="source-line-number">1220</span><span class="source-line-text">      for (const [t, enabled] of Object.entries(input.tools ?? {})) {</span></span>
<span class="source-line"><span class="source-line-number">1221</span><span class="source-line-text">        permissions.push({ permission: t, action: enabled ? &quot;allow&quot; : &quot;deny&quot;, pattern: &quot;*&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1222</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1223</span><span class="source-line-text">      if (permissions.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">1224</span><span class="source-line-text">        session.permission = permissions</span></span>
<span class="source-line"><span class="source-line-number">1225</span><span class="source-line-text">        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })</span></span>
<span class="source-line"><span class="source-line-number">1226</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1227</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1228</span><span class="source-line-text">      if (input.noReply === true) return message</span></span>
<span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span></code></pre>
</details>


4. `runLoop` 执行真正的 while 循环。  
   路径：`packages/opencode/src/session/prompt.ts:1240-1481`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1240-1481</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1240</span><span class="source-line-text">    const runLoop: (sessionID: SessionID) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt; = Effect.fn(&quot;SessionPrompt.run&quot;)(</span></span>
<span class="source-line"><span class="source-line-number">1241</span><span class="source-line-text">      function* (sessionID: SessionID) {</span></span>
<span class="source-line"><span class="source-line-number">1242</span><span class="source-line-text">        const ctx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">1243</span><span class="source-line-text">        const slog = elog.with({ sessionID })</span></span>
<span class="source-line"><span class="source-line-number">1244</span><span class="source-line-text">        let structured: unknown</span></span>
<span class="source-line"><span class="source-line-number">1245</span><span class="source-line-text">        let step = 0</span></span>
<span class="source-line"><span class="source-line-number">1246</span><span class="source-line-text">        const session = yield* sessions.get(sessionID).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">1247</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
<span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
<span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
<span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
<span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
<span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
<span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
<span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
<span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
<span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
<span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
<span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
<span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1277</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1278</span><span class="source-line-text">          step++</span></span>
<span class="source-line"><span class="source-line-number">1279</span><span class="source-line-text">          if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1280</span><span class="source-line-text">            yield* title({</span></span>
<span class="source-line"><span class="source-line-number">1281</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1282</span><span class="source-line-text">              modelID: lastUser.model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">1283</span><span class="source-line-text">              providerID: lastUser.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1284</span><span class="source-line-text">              history: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1285</span><span class="source-line-text">            }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1286</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
<span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
<span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
<span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
<span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
<span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
<span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
<span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
<span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span>
<span class="source-line"><span class="source-line-number">1318</span><span class="source-line-text">            const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">1319</span><span class="source-line-text">            const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">1320</span><span class="source-line-text">            const error = new NamedError.Unknown({ message: `Agent not found: &quot;${lastUser.agent}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">1321</span><span class="source-line-text">            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">1322</span><span class="source-line-text">            throw error</span></span>
<span class="source-line"><span class="source-line-number">1323</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1324</span><span class="source-line-text">          const maxSteps = agent.steps ?? Infinity</span></span>
<span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
<span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
<span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
<span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
<span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
<span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
<span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
<span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
<span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
<span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
<span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
<span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
<span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
<span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
<span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
<span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
<span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
<span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
<span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
<span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
<span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
<span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
<span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
<span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
<span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
<span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
<span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
<span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
<span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
<span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
<span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
<span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
<span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
<span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
<span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
<span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
<span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
<span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
<span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
<span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
<span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
<span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
<span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
<span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
<span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
<span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
<span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
<span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
<span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
<span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
<span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
<span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1441</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1442</span><span class="source-line-text">            if (structured !== undefined) {</span></span>
<span class="source-line"><span class="source-line-number">1443</span><span class="source-line-text">              handle.message.structured = structured</span></span>
<span class="source-line"><span class="source-line-number">1444</span><span class="source-line-text">              handle.message.finish = handle.message.finish ?? &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">1445</span><span class="source-line-text">              yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1446</span><span class="source-line-text">              return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1447</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1448</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1449</span><span class="source-line-text">            const finished = handle.message.finish &amp;&amp; ![&quot;tool-calls&quot;, &quot;unknown&quot;].includes(handle.message.finish)</span></span>
<span class="source-line"><span class="source-line-number">1450</span><span class="source-line-text">            if (finished &amp;&amp; !handle.message.error) {</span></span>
<span class="source-line"><span class="source-line-number">1451</span><span class="source-line-text">              if (format.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1452</span><span class="source-line-text">                handle.message.error = new MessageV2.StructuredOutputError({</span></span>
<span class="source-line"><span class="source-line-number">1453</span><span class="source-line-text">                  message: &quot;Model did not produce structured output&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1454</span><span class="source-line-text">                  retries: 0,</span></span>
<span class="source-line"><span class="source-line-number">1455</span><span class="source-line-text">                }).toObject()</span></span>
<span class="source-line"><span class="source-line-number">1456</span><span class="source-line-text">                yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1457</span><span class="source-line-text">                return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1458</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1459</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1460</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
<span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
<span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
<span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
<span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
<span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1472</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1473</span><span class="source-line-text">            Effect.ensuring(instruction.clear(handle.message.id)),</span></span>
<span class="source-line"><span class="source-line-number">1474</span><span class="source-line-text">            Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant),</span></span>
<span class="source-line"><span class="source-line-number">1475</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1476</span><span class="source-line-text">          if (outcome === &quot;break&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1477</span><span class="source-line-text">          continue</span></span>
<span class="source-line"><span class="source-line-number">1478</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">1479</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1480</span><span class="source-line-text">        yield* compaction.prune({ sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1481</span><span class="source-line-text">        return yield* lastAssistant(sessionID)</span></span></code></pre>
</details>


5. `SessionProcessor.process` 调用 `llm.stream` 并消费 stream。  
   路径：`packages/opencode/src/session/processor.ts:779-847`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:779-847</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">      const process = Effect.fn(&quot;SessionProcessor.process&quot;)(function* (streamInput: LLM.StreamInput) {</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">        slog.info(&quot;process&quot;)</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">        ctx.needsCompaction = false</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">        ctx.shouldBreak = (yield* config.get()).experimental?.continue_loop_on_deny !== true</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">        return yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">          yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">            ctx.currentText = undefined</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            ctx.reasoningMap = {}</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            yield* status.set(ctx.sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">            const stream = llm.stream(streamInput)</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">            yield* stream.pipe(</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">              Stream.tap((event) =&gt; handleEvent(event)),</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">              Stream.takeUntil(() =&gt; ctx.needsCompaction),</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">              Stream.runDrain,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            Effect.onInterrupt(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">              Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">                aborted = true</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">                if (!ctx.assistantMessage.error) {</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">                  yield* halt(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;))</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">804</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">805</span><span class="source-line-text">            Effect.catchCauseIf(</span></span>
<span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">              (cause) =&gt; !Cause.hasInterruptsOnly(cause),</span></span>
<span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">              (cause) =&gt; Effect.fail(Cause.squash(cause)),</span></span>
<span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">            Effect.retry(</span></span>
<span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">              SessionRetry.policy({</span></span>
<span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">                provider: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">                parse,</span></span>
<span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">                set: (info) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">                  // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">                  const event = flags.experimentalEventSystem</span></span>
<span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">                    ? events.publish(SessionEvent.Retried, {</span></span>
<span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">                        sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">                        attempt: info.attempt,</span></span>
<span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">                        error: {</span></span>
<span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">                          message: info.message,</span></span>
<span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">                          isRetryable: true,</span></span>
<span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">                        timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">                      })</span></span>
<span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">                    : Effect.void</span></span>
<span class="source-line"><span class="source-line-number">826</span><span class="source-line-text">                  return event.pipe(</span></span>
<span class="source-line"><span class="source-line-number">827</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">828</span><span class="source-line-text">                      status.set(ctx.sessionID, {</span></span>
<span class="source-line"><span class="source-line-number">829</span><span class="source-line-text">                        type: &quot;retry&quot;,</span></span>
<span class="source-line"><span class="source-line-number">830</span><span class="source-line-text">                        attempt: info.attempt,</span></span>
<span class="source-line"><span class="source-line-number">831</span><span class="source-line-text">                        message: info.message,</span></span>
<span class="source-line"><span class="source-line-number">832</span><span class="source-line-text">                        action: info.action,</span></span>
<span class="source-line"><span class="source-line-number">833</span><span class="source-line-text">                        next: info.next,</span></span>
<span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">840</span><span class="source-line-text">            Effect.catch(halt),</span></span>
<span class="source-line"><span class="source-line-number">841</span><span class="source-line-text">            Effect.ensuring(cleanup()),</span></span>
<span class="source-line"><span class="source-line-number">842</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">843</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">          if (ctx.needsCompaction) return &quot;compact&quot;</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">          if (ctx.blocked || ctx.assistantMessage.error) return &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">          return &quot;continue&quot;</span></span>
<span class="source-line"><span class="source-line-number">847</span><span class="source-line-text">        })</span></span></code></pre>
</details>


6. `LLM.stream` 调用 `streamText` 或 native runtime，并转成 `LLMEvent`。  
   路径：`packages/opencode/src/session/llm.ts:402-493`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:402-493</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">        type: &quot;ai-sdk&quot; as const,</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">        result: streamText({</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">          onError(error) {</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            l.error(&quot;stream error&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">              error,</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">          async experimental_repairToolCall(failed) {</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">            const lower = failed.toolCall.toolName.toLowerCase()</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">            if (lower !== failed.toolCall.toolName &amp;&amp; sortedTools[lower]) {</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">              l.info(&quot;repairing tool call&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">                tool: failed.toolCall.toolName,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">                repaired: lower,</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">              return {</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">                ...failed.toolCall,</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">                toolName: lower,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">              ...failed.toolCall,</span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">              input: JSON.stringify({</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">                tool: failed.toolCall.toolName,</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">                error: failed.error.message,</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">              toolName: &quot;invalid&quot;,</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">          temperature: params.temperature,</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">          topP: params.topP,</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">          topK: params.topK,</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">          providerOptions: ProviderTransform.providerOptions(input.model, params.options),</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">          activeTools: Object.keys(sortedTools).filter((x) =&gt; x !== &quot;invalid&quot;),</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">          tools: sortedTools,</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">          toolChoice: input.toolChoice,</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">          maxOutputTokens: params.maxOutputTokens,</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">          abortSignal: input.abort,</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">          headers: requestHeaders,</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">          maxRetries: input.retries ?? 0,</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">          messages,</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">          model: wrapLanguageModel({</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">            model: language,</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">            middleware: [</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">              {</span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">                specificationVersion: &quot;v3&quot; as const,</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">                async transformParams(args) {</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">                  if (args.type === &quot;stream&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">                    // @ts-expect-error</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">                    args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">                  }</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">                  return args.params</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">            ],</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">          experimental_telemetry: {</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">            isEnabled: cfg.experimental?.openTelemetry,</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">            functionId: &quot;session.llm&quot;,</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">            tracer: telemetryTracer,</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">            metadata: {</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">              userId: cfg.username ?? &quot;unknown&quot;,</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">              sessionId: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">    const stream: Interface[&quot;stream&quot;] = (input) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      Stream.scoped(</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        Stream.unwrap(</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            const ctrl = yield* Effect.acquireRelease(</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">              Effect.sync(() =&gt; new AbortController()),</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              (ctrl) =&gt; Effect.sync(() =&gt; ctrl.abort()),</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">            const result = yield* run({ ...input, abort: ctrl.signal })</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">            if (result.type === &quot;native&quot;) return result.stream</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">            const state = LLMAISDK.adapterState()</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            return Stream.fromAsyncIterable(result.result.fullStream, (e) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              e instanceof Error ? e : new Error(String(e)),</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">            ).pipe(</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              Stream.mapEffect((event) =&gt; LLMAISDK.toLLMEvents(state, event)),</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              Stream.flatMap((events) =&gt; Stream.fromIterable(events)),</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">        ),</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      )</span></span></code></pre>
</details>


7. `SessionProcessor` 处理 tool-call/tool-result/text 事件，更新 message parts。  
   路径：`packages/opencode/src/session/processor.ts:376-500`、`packages/opencode/src/session/processor.ts:618-685`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:376-500</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">          case &quot;tool-call&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">            if (ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">              throw new Error(`Tool call not allowed while generating summary: ${value.name}`)</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">            const toolCall = yield* ensureToolCall(value)</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">            const input = toolInput(value.input)</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">            if (!toolCall.call.inputEnded) {</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">                yield* events.publish(SessionEvent.Tool.Input.Ended, {</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text">                  callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">                  text: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Called, {</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">                callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">                tool: value.name,</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">                input,</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">                provider: {</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">                  executed: toolCall.part.metadata?.providerExecuted === true,</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">                  ...(value.providerMetadata ? { metadata: value.providerMetadata } : {}),</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">            yield* updateToolCall(value.id, (match) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text">              ...match,</span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">              tool: value.name,</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">              state:</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">                match.state.status === &quot;running&quot;</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">                  ? { ...match.state, input }</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">                  : {</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">                      status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">                      input,</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">                      time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">                    },</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">              metadata: match.metadata?.providerExecuted</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">                ? { ...value.providerMetadata, providerExecuted: true }</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">                : value.providerMetadata,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">            }))</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">            const parts = MessageV2.parts(ctx.assistantMessage.id)</span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">            const recentParts = parts.slice(-DOOM_LOOP_THRESHOLD)</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">            if (</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">              recentParts.length !== DOOM_LOOP_THRESHOLD ||</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">              !recentParts.every(</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">                (part) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">                  part.type === &quot;tool&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">                  part.tool === value.name &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">                  part.state.status !== &quot;pending&quot; &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">                  JSON.stringify(part.state.input) === JSON.stringify(input),</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">            ) {</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">              return</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">            const agent = yield* agents.get(ctx.assistantMessage.agent)</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">            yield* permission.ask({</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">              permission: &quot;doom_loop&quot;,</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">              patterns: [value.name],</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">              sessionID: ctx.assistantMessage.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">              metadata: { tool: value.name, input },</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">              always: [value.name],</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">              ruleset: agent.permission,</span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          case &quot;tool-result&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            const toolCall = yield* readToolCall(value.id)</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            const rawOutput = toolResultOutput(value)</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            const normalized = yield* Effect.forEach(rawOutput.attachments ?? [], (attachment) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              attachment.mime.startsWith(&quot;image/&quot;)</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">                ? image.normalize(attachment).pipe(</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                    Effect.catchIf(</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                      (error) =&gt; error instanceof Image.ResizerUnavailableError,</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                      () =&gt; Effect.succeed(attachment),</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                    Effect.exit,</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">                : Effect.succeed(Exit.succeed&lt;MessageV2.FilePart&gt;(attachment)),</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">            const omitted = normalized.filter(Exit.isFailure).length</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">            const attachments = normalized.filter(Exit.isSuccess).map((item) =&gt; item.value)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">            const output = {</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">              ...rawOutput,</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">              output:</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">                omitted === 0</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">                  ? rawOutput.output</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">                  : `${rawOutput.output}\n\n[${omitted} image${omitted === 1 ? &quot;&quot; : &quot;s&quot;} omitted: could not be resized below the image size limit.]`,</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">              attachments: attachments.length ? attachments : undefined,</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Success, {</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">                callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">                structured: output.metadata,</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">                content: [</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">                  {</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">                    text: output.output,</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">                  },</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">                  ...(output.attachments?.map((item: MessageV2.FilePart) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">                    type: &quot;file&quot; as const,</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">                    uri: item.url,</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">                    mime: item.mime,</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                    name: item.filename,</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                  })) ?? []),</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                ],</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                provider: {</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">                  executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">            yield* completeToolCall(value.id, output)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">            return</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:618-685</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">618</span><span class="source-line-text">          case &quot;text-start&quot;:</span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">            if (!ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">                yield* events.publish(SessionEvent.Text.Started, {</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">            ctx.currentText = {</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">              messageID: ctx.assistantMessage.id,</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">              sessionID: ctx.assistantMessage.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">              type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">              text: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">              time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">              metadata: value.providerMetadata,</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">            yield* session.updatePart(ctx.currentText)</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">          case &quot;text-delta&quot;:</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">            if (!ctx.currentText) return</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">            ctx.currentText.text += value.text</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">            if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">            yield* session.updatePartDelta({</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">              sessionID: ctx.currentText.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">              messageID: ctx.currentText.messageID,</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">              partID: ctx.currentText.id,</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">              field: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">              delta: value.text,</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">652</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">          case &quot;text-end&quot;:</span></span>
<span class="source-line"><span class="source-line-number">654</span><span class="source-line-text">            if (!ctx.currentText) return</span></span>
<span class="source-line"><span class="source-line-number">655</span><span class="source-line-text">            // oxlint-disable-next-line no-self-assign -- reactivity trigger</span></span>
<span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">            ctx.currentText.text = ctx.currentText.text</span></span>
<span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">            ctx.currentText.text = (yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">658</span><span class="source-line-text">              &quot;experimental.text.complete&quot;,</span></span>
<span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">              {</span></span>
<span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">                messageID: ctx.assistantMessage.id,</span></span>
<span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">                partID: ctx.currentText.id,</span></span>
<span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">              { text: ctx.currentText.text },</span></span>
<span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">            )).text</span></span>
<span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">            if (!ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">668</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">                yield* events.publish(SessionEvent.Text.Ended, {</span></span>
<span class="source-line"><span class="source-line-number">670</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">                  text: ctx.currentText.text,</span></span>
<span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">            {</span></span>
<span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">              const end = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">678</span><span class="source-line-text">              ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }</span></span>
<span class="source-line"><span class="source-line-number">679</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">680</span><span class="source-line-text">            if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata</span></span>
<span class="source-line"><span class="source-line-number">681</span><span class="source-line-text">            yield* session.updatePart(ctx.currentText)</span></span>
<span class="source-line"><span class="source-line-number">682</span><span class="source-line-text">            ctx.currentText = undefined</span></span>
<span class="source-line"><span class="source-line-number">683</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">684</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">685</span><span class="source-line-text">          case &quot;finish&quot;:</span></span></code></pre>
</details>


## 6. 用户输入到 agent 行动的整体链路

### 6.1 用户输入

CLI 非交互模式会订阅事件，然后调用 session prompt：

```ts
const model = pick(args.model)
const result = await client.session.prompt({
  sessionID,
  agent,
  model,
  variant: args.variant,
  parts: [...files, { type: "text", text: message }],
})
```

路径：`packages/opencode/src/cli/cmd/run.ts:791-798`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:791-798</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span></code></pre>
</details>


如果是 HTTP/API，则 handler 把 payload 加上 `sessionID` 后交给 `promptSvc.prompt`：

```ts
const message = yield* promptSvc
  .prompt({
    ...ctx.payload,
    sessionID: ctx.params.sessionID,
  })
```

路径：`packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-289`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-289</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">    const prompt = Effect.fn(&quot;SessionHttpApi.prompt&quot;)(function* (ctx: {</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text">      params: { sessionID: SessionID }</span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">      payload: typeof PromptPayload.Type</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">    }) {</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">      yield* requireSession(ctx.params.sessionID)</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">      const message = yield* promptSvc</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">        .prompt({</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text">          ...ctx.payload,</span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">          sessionID: ctx.params.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">        .pipe(Effect.mapError(() =&gt; new HttpApiError.BadRequest({})))</span></span></code></pre>
</details>


### 6.2 session / message

`SessionPrompt.prompt` 不直接调模型，它先创建 user message：

```ts
const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
yield* revert.cleanup(session)
const message = yield* createUserMessage(input)
yield* sessions.touch(input.sessionID)
if (input.noReply === true) return message
return yield* loop({ sessionID: input.sessionID })
```

路径：`packages/opencode/src/session/prompt.ts:1211-1229`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1211-1229</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1211</span><span class="source-line-text">    const prompt: (input: PromptInput) =&gt; Effect.Effect&lt;MessageV2.WithParts, Image.Error&gt; = Effect.fn(</span></span>
<span class="source-line"><span class="source-line-number">1212</span><span class="source-line-text">      &quot;SessionPrompt.prompt&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1213</span><span class="source-line-text">    )(function* (input: PromptInput) {</span></span>
<span class="source-line"><span class="source-line-number">1214</span><span class="source-line-text">      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">1215</span><span class="source-line-text">      yield* revert.cleanup(session)</span></span>
<span class="source-line"><span class="source-line-number">1216</span><span class="source-line-text">      const message = yield* createUserMessage(input)</span></span>
<span class="source-line"><span class="source-line-number">1217</span><span class="source-line-text">      yield* sessions.touch(input.sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1218</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1219</span><span class="source-line-text">      const permissions: Permission.Ruleset = []</span></span>
<span class="source-line"><span class="source-line-number">1220</span><span class="source-line-text">      for (const [t, enabled] of Object.entries(input.tools ?? {})) {</span></span>
<span class="source-line"><span class="source-line-number">1221</span><span class="source-line-text">        permissions.push({ permission: t, action: enabled ? &quot;allow&quot; : &quot;deny&quot;, pattern: &quot;*&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1222</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1223</span><span class="source-line-text">      if (permissions.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">1224</span><span class="source-line-text">        session.permission = permissions</span></span>
<span class="source-line"><span class="source-line-number">1225</span><span class="source-line-text">        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })</span></span>
<span class="source-line"><span class="source-line-number">1226</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1227</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1228</span><span class="source-line-text">      if (input.noReply === true) return message</span></span>
<span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span></code></pre>
</details>


`createUserMessage` 会决定 agent、model、variant，并构造 `MessageV2.User`：

```ts
const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))

const info: MessageV2.User = {
  id: input.messageID ?? MessageID.ascending(),
  role: "user",
  sessionID: input.sessionID,
  tools: input.tools,
  agent: ag.name,
  model: {
    providerID: model.providerID,
    modelID: model.modelID,
    variant,
  },
}
```

路径：`packages/opencode/src/session/prompt.ts:689-731`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:689-731</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">689</span><span class="source-line-text">    const createUserMessage = Effect.fn(&quot;SessionPrompt.createUserMessage&quot;)(function* (input: PromptInput) {</span></span>
<span class="source-line"><span class="source-line-number">690</span><span class="source-line-text">      const agentName = input.agent</span></span>
<span class="source-line"><span class="source-line-number">691</span><span class="source-line-text">      const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()</span></span>
<span class="source-line"><span class="source-line-number">692</span><span class="source-line-text">      if (!ag) {</span></span>
<span class="source-line"><span class="source-line-number">693</span><span class="source-line-text">        const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">694</span><span class="source-line-text">        const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">695</span><span class="source-line-text">        const error = new NamedError.Unknown({ message: `Agent not found: &quot;${agentName}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">696</span><span class="source-line-text">        yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">697</span><span class="source-line-text">        throw error</span></span>
<span class="source-line"><span class="source-line-number">698</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">699</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">700</span><span class="source-line-text">      const current = Database.use((db) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">701</span><span class="source-line-text">        db</span></span>
<span class="source-line"><span class="source-line-number">702</span><span class="source-line-text">          .select({ agent: SessionTable.agent, model: SessionTable.model })</span></span>
<span class="source-line"><span class="source-line-number">703</span><span class="source-line-text">          .from(SessionTable)</span></span>
<span class="source-line"><span class="source-line-number">704</span><span class="source-line-text">          .where(eq(SessionTable.id, input.sessionID))</span></span>
<span class="source-line"><span class="source-line-number">705</span><span class="source-line-text">          .get(),</span></span>
<span class="source-line"><span class="source-line-number">706</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">707</span><span class="source-line-text">      const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))</span></span>
<span class="source-line"><span class="source-line-number">708</span><span class="source-line-text">      const same = ag.model &amp;&amp; model.providerID === ag.model.providerID &amp;&amp; model.modelID === ag.model.modelID</span></span>
<span class="source-line"><span class="source-line-number">709</span><span class="source-line-text">      const full =</span></span>
<span class="source-line"><span class="source-line-number">710</span><span class="source-line-text">        !input.variant &amp;&amp; ag.variant &amp;&amp; same</span></span>
<span class="source-line"><span class="source-line-number">711</span><span class="source-line-text">          ? yield* provider</span></span>
<span class="source-line"><span class="source-line-number">712</span><span class="source-line-text">              .getModel(model.providerID, model.modelID)</span></span>
<span class="source-line"><span class="source-line-number">713</span><span class="source-line-text">              .pipe(Effect.catchIf(Provider.ModelNotFoundError.isInstance, () =&gt; Effect.succeed(undefined)))</span></span>
<span class="source-line"><span class="source-line-number">714</span><span class="source-line-text">          : undefined</span></span>
<span class="source-line"><span class="source-line-number">715</span><span class="source-line-text">      const variant = input.variant ?? (ag.variant &amp;&amp; full?.variants?.[ag.variant] ? ag.variant : undefined)</span></span>
<span class="source-line"><span class="source-line-number">716</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">717</span><span class="source-line-text">      const info: MessageV2.User = {</span></span>
<span class="source-line"><span class="source-line-number">718</span><span class="source-line-text">        id: input.messageID ?? MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">719</span><span class="source-line-text">        role: &quot;user&quot;,</span></span>
<span class="source-line"><span class="source-line-number">720</span><span class="source-line-text">        sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">721</span><span class="source-line-text">        time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">722</span><span class="source-line-text">        tools: input.tools,</span></span>
<span class="source-line"><span class="source-line-number">723</span><span class="source-line-text">        agent: ag.name,</span></span>
<span class="source-line"><span class="source-line-number">724</span><span class="source-line-text">        model: {</span></span>
<span class="source-line"><span class="source-line-number">725</span><span class="source-line-text">          providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">726</span><span class="source-line-text">          modelID: model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">727</span><span class="source-line-text">          variant,</span></span>
<span class="source-line"><span class="source-line-number">728</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">729</span><span class="source-line-text">        system: input.system,</span></span>
<span class="source-line"><span class="source-line-number">730</span><span class="source-line-text">        format: input.format,</span></span>
<span class="source-line"><span class="source-line-number">731</span><span class="source-line-text">      }</span></span></code></pre>
</details>


最后它把 message 和 parts 写入 session：

```ts
yield* sessions.updateMessage(info)
for (const part of parts) yield* sessions.updatePart(part)
```

路径：`packages/opencode/src/session/prompt.ts:1116-1117`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1116-1117</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1116</span><span class="source-line-text">      yield* sessions.updateMessage(info)</span></span>
<span class="source-line"><span class="source-line-number">1117</span><span class="source-line-text">      for (const part of parts) yield* sessions.updatePart(part)</span></span></code></pre>
</details>


### 6.3 agent 决策

进入 `runLoop` 后，OpenCode 每轮先取上下文和最近状态：

```ts
let msgs = yield* MessageV2.filterCompactedEffect(sessionID)
const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)
if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
```

路径：`packages/opencode/src/session/prompt.ts:1252-1256`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1252-1256</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
<span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span></code></pre>
</details>


`MessageV2.latest` 不是按数组位置找最新，而是按递增 message id 找最新 user/assistant/finished，并找还没处理的 compaction/subtask：

```ts
export function latest(msgs: WithParts[]) {
  let user: User | undefined
  let assistant: Assistant | undefined
  let finished: Assistant | undefined
  for (const msg of msgs) {
    const info = msg.info
    if (info.role === "user" && (!user || info.id > user.id)) user = info
    if (info.role === "assistant" && (!assistant || info.id > assistant.id)) assistant = info
    if (info.role === "assistant" && info.finish && (!finished || info.id > finished.id)) finished = info
  }
  const tasks = msgs.flatMap((m) =>
    finished && m.info.id <= finished.id
      ? []
      : m.parts.filter((p): p is CompactionPart | SubtaskPart => p.type === "compaction" || p.type === "subtask"),
  )
  return { user, assistant, finished, tasks }
}
```

路径：`packages/opencode/src/session/message-v2.ts:1070-1093`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/message-v2.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/message-v2.ts:1070-1093</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1070</span><span class="source-line-text">// filterCompacted reorders messages for model consumption</span></span>
<span class="source-line"><span class="source-line-number">1071</span><span class="source-line-text">// ([compaction-user, summary, ...retained tail..., continue-user]), so array</span></span>
<span class="source-line"><span class="source-line-number">1072</span><span class="source-line-text">// position is not chronological. Derive each binding by max id (MessageID</span></span>
<span class="source-line"><span class="source-line-number">1073</span><span class="source-line-text">// is monotonic via MessageID.ascending) so a pre-compaction overflowing tail</span></span>
<span class="source-line"><span class="source-line-number">1074</span><span class="source-line-text">// assistant doesn't get mistaken for the most recent turn. tasks are</span></span>
<span class="source-line"><span class="source-line-number">1075</span><span class="source-line-text">// compaction/subtask parts attached to user messages newer than the latest</span></span>
<span class="source-line"><span class="source-line-number">1076</span><span class="source-line-text">// finished assistant — i.e. unprocessed work.</span></span>
<span class="source-line"><span class="source-line-number">1077</span><span class="source-line-text">export function latest(msgs: WithParts[]) {</span></span>
<span class="source-line"><span class="source-line-number">1078</span><span class="source-line-text">  let user: User | undefined</span></span>
<span class="source-line"><span class="source-line-number">1079</span><span class="source-line-text">  let assistant: Assistant | undefined</span></span>
<span class="source-line"><span class="source-line-number">1080</span><span class="source-line-text">  let finished: Assistant | undefined</span></span>
<span class="source-line"><span class="source-line-number">1081</span><span class="source-line-text">  for (const msg of msgs) {</span></span>
<span class="source-line"><span class="source-line-number">1082</span><span class="source-line-text">    const info = msg.info</span></span>
<span class="source-line"><span class="source-line-number">1083</span><span class="source-line-text">    if (info.role === &quot;user&quot; &amp;&amp; (!user || info.id &gt; user.id)) user = info</span></span>
<span class="source-line"><span class="source-line-number">1084</span><span class="source-line-text">    if (info.role === &quot;assistant&quot; &amp;&amp; (!assistant || info.id &gt; assistant.id)) assistant = info</span></span>
<span class="source-line"><span class="source-line-number">1085</span><span class="source-line-text">    if (info.role === &quot;assistant&quot; &amp;&amp; info.finish &amp;&amp; (!finished || info.id &gt; finished.id)) finished = info</span></span>
<span class="source-line"><span class="source-line-number">1086</span><span class="source-line-text">  }</span></span>
<span class="source-line"><span class="source-line-number">1087</span><span class="source-line-text">  const tasks = msgs.flatMap((m) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">1088</span><span class="source-line-text">    finished &amp;&amp; m.info.id &lt;= finished.id</span></span>
<span class="source-line"><span class="source-line-number">1089</span><span class="source-line-text">      ? []</span></span>
<span class="source-line"><span class="source-line-number">1090</span><span class="source-line-text">      : m.parts.filter((p): p is CompactionPart | SubtaskPart =&gt; p.type === &quot;compaction&quot; || p.type === &quot;subtask&quot;),</span></span>
<span class="source-line"><span class="source-line-number">1091</span><span class="source-line-text">  )</span></span>
<span class="source-line"><span class="source-line-number">1092</span><span class="source-line-text">  return { user, assistant, finished, tasks }</span></span>
<span class="source-line"><span class="source-line-number">1093</span><span class="source-line-text">}</span></span></code></pre>
</details>


然后 loop 解析模型和 agent：

```ts
const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)
const agent = yield* agents.get(lastUser.agent)
const maxSteps = agent.steps ?? Infinity
```

路径：`packages/opencode/src/session/prompt.ts:1287-1325`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1287-1325</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
<span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
<span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
<span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
<span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
<span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
<span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
<span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
<span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span>
<span class="source-line"><span class="source-line-number">1318</span><span class="source-line-text">            const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">1319</span><span class="source-line-text">            const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">1320</span><span class="source-line-text">            const error = new NamedError.Unknown({ message: `Agent not found: &quot;${lastUser.agent}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">1321</span><span class="source-line-text">            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">1322</span><span class="source-line-text">            throw error</span></span>
<span class="source-line"><span class="source-line-number">1323</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1324</span><span class="source-line-text">          const maxSteps = agent.steps ?? Infinity</span></span>
<span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span></code></pre>
</details>


### 6.4 LLM 调用

在调用 LLM 前，loop 会准备工具、system prompt、模型消息：

```ts
const tools = yield* SessionTools.resolve({
  agent,
  session,
  model,
  processor: handle,
  bypassAgentCheck,
  messages: msgs,
  promptOps,
})

const [skills, env, instructions, modelMsgs] = yield* Effect.all([
  sys.skills(agent),
  sys.environment(model),
  instruction.system().pipe(Effect.orDie),
  MessageV2.toModelMessagesEffect(msgs, model),
])
const system = [...env, ...instructions, ...(skills ? [skills] : [])]
```

路径：`packages/opencode/src/session/prompt.ts:1372-1428`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1372-1428</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
<span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
<span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
<span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
<span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
<span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
<span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
<span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
<span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
<span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
<span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
<span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
<span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
<span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
<span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
<span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
<span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
<span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
<span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
<span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
<span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
<span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
<span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
<span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
<span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
<span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
<span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
<span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
<span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
<span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span></code></pre>
</details>


真正调用发生在 `handle.process`：

```ts
const result = yield* handle.process({
  user: lastUser,
  agent,
  permission: session.permission,
  sessionID,
  parentSessionID: session.parentID,
  system,
  messages: [...modelMsgs, ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS }] : [])],
  tools,
  model,
  toolChoice: format.type === "json_schema" ? "required" : undefined,
})
```

路径：`packages/opencode/src/session/prompt.ts:1429-1440`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1429-1440</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
<span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
<span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
<span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
<span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
<span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
<span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
<span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span></code></pre>
</details>


`LLM.StreamInput` 的类型正好说明一次模型请求需要哪些东西：

```ts
export type StreamInput = {
  user: MessageV2.User
  sessionID: string
  model: Provider.Model
  agent: Agent.Info
  system: string[]
  messages: ModelMessage[]
  tools: Record<string, Tool>
  toolChoice?: "auto" | "required" | "none"
}
```

路径：`packages/opencode/src/session/llm.ts:39-52`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:39-52</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export type StreamInput = {</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  user: MessageV2.User</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  sessionID: string</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  parentSessionID?: string</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  model: Provider.Model</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  agent: Agent.Info</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  permission?: Permission.Ruleset</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  system: string[]</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  messages: ModelMessage[]</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  small?: boolean</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  retries?: number</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">}</span></span></code></pre>
</details>


### 6.5 tool call

工具不是直接从 `ToolRegistry` 传给模型，而是通过 `SessionTools.resolve` 转成 AI SDK tool：

```ts
const tools: Record<string, AITool> = {}

for (const item of yield* registry.tools({
  modelID: ModelID.make(input.model.api.id),
  providerID: input.model.providerID,
  agent: input.agent,
})) {
  const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))
  tools[item.id] = tool({
    description: item.description,
    inputSchema: jsonSchema(schema),
    execute(args, options) {
      return run.promise(
        Effect.gen(function* () {
          const ctx = context(args, options)
          const result = yield* item.execute(args, ctx)
          return output
        }),
      )
    },
  })
}
```

路径：`packages/opencode/src/session/tools.ts:24-116`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:24-116</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">export const resolve = Effect.fn(&quot;SessionTools.resolve&quot;)(function* (input: {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  agent: Agent.Info</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  model: Provider.Model</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">  session: Session.Info</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">  processor: Pick&lt;SessionProcessor.Handle, &quot;message&quot; | &quot;updateToolCall&quot; | &quot;completeToolCall&quot;&gt;</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  bypassAgentCheck: boolean</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  messages: MessageV2.WithParts[]</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  promptOps: TaskPromptOps</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">}) {</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  using _ = log.time(&quot;resolveTools&quot;)</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  const tools: Record&lt;string, AITool&gt; = {}</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  const run = yield* EffectBridge.make()</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  const plugin = yield* Plugin.Service</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  const permission = yield* Permission.Service</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  const registry = yield* ToolRegistry.Service</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  const mcp = yield* MCP.Service</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  const truncate = yield* Truncate.Service</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  const context = (args: Record&lt;string, unknown&gt;, options: ToolExecutionOptions): Tool.Context =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">    abort: options.abortSignal!,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">    messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    callID: options.toolCallId,</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps: input.promptOps },</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    agent: input.agent.name,</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">    messages: input.messages,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">    metadata: (val) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      input.processor.updateToolCall(options.toolCallId, (match) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        if (![&quot;running&quot;, &quot;pending&quot;].includes(match.state.status)) return match</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          ...match,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">          state: {</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            title: val.title,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            metadata: val.metadata,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            input: args,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    modelID: ModelID.make(input.model.api.id),</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    providerID: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">    agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">  })) {</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">    tools[item.id] = tool({</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      description: item.description,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      inputSchema: jsonSchema(schema),</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      execute(args, options) {</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">        return run.promise(</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            const ctx = context(args, options)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">              &quot;tool.execute.before&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">              { args },</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            const result = yield* item.execute(args, ctx)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            const output = {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              ...result,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              attachments: result.attachments?.map((attachment) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                ...attachment,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">              })),</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">              &quot;tool.execute.after&quot;,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">              output,</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            if (options.abortSignal?.aborted) {</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">              yield* input.processor.completeToolCall(options.toolCallId, output)</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">            return output</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">  }</span></span></code></pre>
</details>


模型发出 tool-call 后，AI SDK event 会被转成 OpenCode `LLMEvent.toolCall`：

```ts
case "tool-call":
  return Effect.sync(() => {
    state.toolNames[event.toolCallId] = event.toolName
    return [
      LLMEvent.toolCall({
        id: event.toolCallId,
        name: event.toolName,
        input: event.input,
      }),
    ]
  })
```

路径：`packages/opencode/src/session/llm/ai-sdk.ts:191-203`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm/ai-sdk.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm/ai-sdk.ts:191-203</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">    case &quot;tool-call&quot;:</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">      return Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">        state.toolNames[event.toolCallId] = event.toolName</span></span>
<span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        return [</span></span>
<span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          LLMEvent.toolCall({</span></span>
<span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">            id: event.toolCallId,</span></span>
<span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">            name: event.toolName,</span></span>
<span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">            input: event.input,</span></span>
<span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">            providerExecuted: &quot;providerExecuted&quot; in event ? event.providerExecuted : undefined,</span></span>
<span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">            providerMetadata: providerMetadata(event.providerMetadata),</span></span>
<span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">        ]</span></span>
<span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">      })</span></span></code></pre>
</details>


`SessionProcessor` 收到 tool-call 后创建或更新 `ToolPart`，状态从 pending 进入 running：

```ts
case "tool-call": {
  const toolCall = yield* ensureToolCall(value)
  const input = toolInput(value.input)
  yield* updateToolCall(value.id, (match) => ({
    ...match,
    tool: value.name,
    state:
      match.state.status === "running"
        ? { ...match.state, input }
        : {
            status: "running",
            input,
            time: { start: Date.now() },
          },
  }))
}
```

路径：`packages/opencode/src/session/processor.ts:376-421`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:376-421</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">          case &quot;tool-call&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">            if (ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">              throw new Error(`Tool call not allowed while generating summary: ${value.name}`)</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">            const toolCall = yield* ensureToolCall(value)</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">            const input = toolInput(value.input)</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">            if (!toolCall.call.inputEnded) {</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">                yield* events.publish(SessionEvent.Tool.Input.Ended, {</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text">                  callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">                  text: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Called, {</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">                callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">                tool: value.name,</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">                input,</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">                provider: {</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">                  executed: toolCall.part.metadata?.providerExecuted === true,</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">                  ...(value.providerMetadata ? { metadata: value.providerMetadata } : {}),</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">            yield* updateToolCall(value.id, (match) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text">              ...match,</span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">              tool: value.name,</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">              state:</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">                match.state.status === &quot;running&quot;</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">                  ? { ...match.state, input }</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">                  : {</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">                      status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">                      input,</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">                      time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">                    },</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">              metadata: match.metadata?.providerExecuted</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">                ? { ...value.providerMetadata, providerExecuted: true }</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">                : value.providerMetadata,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">            }))</span></span></code></pre>
</details>


### 6.6 tool result

工具执行后的结果也会作为 stream event 回来：

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
      }),
    ]
  })
```

路径：`packages/opencode/src/session/llm/ai-sdk.ts:205-218`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm/ai-sdk.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm/ai-sdk.ts:205-218</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">    case &quot;tool-result&quot;:</span></span>
<span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">      return Effect.sync(() =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        const name = state.toolNames[event.toolCallId] ?? &quot;unknown&quot;</span></span>
<span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">        delete state.toolNames[event.toolCallId]</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">        return [</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">          LLMEvent.toolResult({</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">            id: event.toolCallId,</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">            name,</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">            result: ToolResultValue.make(event.output),</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">            providerExecuted: &quot;providerExecuted&quot; in event ? event.providerExecuted : undefined,</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">            providerMetadata: providerMetadata(event.providerMetadata),</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">        ]</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">      })</span></span></code></pre>
</details>


Processor 把 tool result 标记为 completed：

```ts
const completeToolCall = Effect.fn("SessionProcessor.completeToolCall")(function* (toolCallID, output) {
  const match = yield* readToolCall(toolCallID)
  if (!match || match.part.state.status !== "running") return
  yield* session.updatePart({
    ...match.part,
    state: {
      status: "completed",
      input: match.part.state.input,
      output: output.output,
      metadata: output.metadata,
      title: output.title,
      time: { start: match.part.state.time.start, end: Date.now() },
      attachments: output.attachments,
    },
  })
  yield* settleToolCall(toolCallID)
})
```

路径：`packages/opencode/src/session/processor.ts:169-193`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:169-193</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">      const completeToolCall = Effect.fn(&quot;SessionProcessor.completeToolCall&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">        toolCallID: string,</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">        output: {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          title: string</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">          metadata: Record&lt;string, any&gt;</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">          output: string</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">          attachments?: MessageV2.FilePart[]</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">      ) {</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">        const match = yield* readToolCall(toolCallID)</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">        if (!match || match.part.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">        yield* session.updatePart({</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">          ...match.part,</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">          state: {</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">            status: &quot;completed&quot;,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">            input: match.part.state.input,</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">            output: output.output,</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">            metadata: output.metadata,</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">            title: output.title,</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">            time: { start: match.part.state.time.start, end: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">            attachments: output.attachments,</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        yield* settleToolCall(toolCallID)</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">      })</span></span></code></pre>
</details>


`ToolPart` 的状态模型也证明了工具结果会进入 session message part：

```ts
export const ToolState = Schema.Union([
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
]).annotate({ discriminator: "status" })

export const ToolPart = Schema.Struct({
  type: Schema.Literal("tool"),
  callID: Schema.String,
  tool: Schema.String,
  state: ToolState,
})
```

路径：`packages/opencode/src/session/message-v2.ts:248-320`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/message-v2.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/message-v2.ts:248-320</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">248</span><span class="source-line-text">export const ToolStatePending = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">249</span><span class="source-line-text">  status: Schema.Literal(&quot;pending&quot;),</span></span>
<span class="source-line"><span class="source-line-number">250</span><span class="source-line-text">  input: Schema.Record(Schema.String, Schema.Any),</span></span>
<span class="source-line"><span class="source-line-number">251</span><span class="source-line-text">  raw: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">252</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolStatePending&quot; })</span></span>
<span class="source-line"><span class="source-line-number">253</span><span class="source-line-text">export type ToolStatePending = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolStatePending&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">254</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">255</span><span class="source-line-text">export const ToolStateRunning = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">256</span><span class="source-line-text">  status: Schema.Literal(&quot;running&quot;),</span></span>
<span class="source-line"><span class="source-line-number">257</span><span class="source-line-text">  input: Schema.Record(Schema.String, Schema.Any),</span></span>
<span class="source-line"><span class="source-line-number">258</span><span class="source-line-text">  title: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">259</span><span class="source-line-text">  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),</span></span>
<span class="source-line"><span class="source-line-number">260</span><span class="source-line-text">  time: Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">261</span><span class="source-line-text">    start: NonNegativeInt,</span></span>
<span class="source-line"><span class="source-line-number">262</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">263</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolStateRunning&quot; })</span></span>
<span class="source-line"><span class="source-line-number">264</span><span class="source-line-text">export type ToolStateRunning = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolStateRunning&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">265</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">266</span><span class="source-line-text">export const ToolStateCompleted = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">267</span><span class="source-line-text">  status: Schema.Literal(&quot;completed&quot;),</span></span>
<span class="source-line"><span class="source-line-number">268</span><span class="source-line-text">  input: Schema.Record(Schema.String, Schema.Any),</span></span>
<span class="source-line"><span class="source-line-number">269</span><span class="source-line-text">  output: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">270</span><span class="source-line-text">  title: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">271</span><span class="source-line-text">  metadata: Schema.Record(Schema.String, Schema.Any),</span></span>
<span class="source-line"><span class="source-line-number">272</span><span class="source-line-text">  time: Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">273</span><span class="source-line-text">    start: NonNegativeInt,</span></span>
<span class="source-line"><span class="source-line-number">274</span><span class="source-line-text">    end: NonNegativeInt,</span></span>
<span class="source-line"><span class="source-line-number">275</span><span class="source-line-text">    compacted: Schema.optional(NonNegativeInt),</span></span>
<span class="source-line"><span class="source-line-number">276</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">277</span><span class="source-line-text">  attachments: Schema.optional(Schema.Array(FilePart)),</span></span>
<span class="source-line"><span class="source-line-number">278</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolStateCompleted&quot; })</span></span>
<span class="source-line"><span class="source-line-number">279</span><span class="source-line-text">export type ToolStateCompleted = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolStateCompleted&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">280</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">281</span><span class="source-line-text">function truncateToolOutput(text: string, maxChars?: number) {</span></span>
<span class="source-line"><span class="source-line-number">282</span><span class="source-line-text">  if (!maxChars || text.length &lt;= maxChars) return text</span></span>
<span class="source-line"><span class="source-line-number">283</span><span class="source-line-text">  const omitted = text.length - maxChars</span></span>
<span class="source-line"><span class="source-line-number">284</span><span class="source-line-text">  return `${text.slice(0, maxChars)}\n[Tool output truncated for compaction: omitted ${omitted} chars]`</span></span>
<span class="source-line"><span class="source-line-number">285</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">286</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">287</span><span class="source-line-text">export const ToolStateError = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">288</span><span class="source-line-text">  status: Schema.Literal(&quot;error&quot;),</span></span>
<span class="source-line"><span class="source-line-number">289</span><span class="source-line-text">  input: Schema.Record(Schema.String, Schema.Any),</span></span>
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">  error: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">  time: Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">293</span><span class="source-line-text">    start: NonNegativeInt,</span></span>
<span class="source-line"><span class="source-line-number">294</span><span class="source-line-text">    end: NonNegativeInt,</span></span>
<span class="source-line"><span class="source-line-number">295</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">296</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolStateError&quot; })</span></span>
<span class="source-line"><span class="source-line-number">297</span><span class="source-line-text">export type ToolStateError = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolStateError&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">298</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">export const ToolState = Schema.Union([</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">  ToolStatePending,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">  ToolStateRunning,</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">  ToolStateCompleted,</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">  ToolStateError,</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">]).annotate({</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">  discriminator: &quot;status&quot;,</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">  identifier: &quot;ToolState&quot;,</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError</span></span>
<span class="source-line"><span class="source-line-number">309</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">310</span><span class="source-line-text">export const ToolPart = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">311</span><span class="source-line-text">  ...partBase,</span></span>
<span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">  type: Schema.Literal(&quot;tool&quot;),</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">  callID: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">  tool: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">  state: ToolState,</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">}).annotate({ identifier: &quot;ToolPart&quot; })</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">export type ToolPart = Omit&lt;Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof ToolPart&gt;&gt;, &quot;state&quot;&gt; &amp; {</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">  state: ToolState</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">}</span></span></code></pre>
</details>


### 6.7 再次推理

`SessionProcessor.process` 结束后返回 `"continue"`、`"stop"` 或 `"compact"`：

```ts
if (ctx.needsCompaction) return "compact"
if (ctx.blocked || ctx.assistantMessage.error) return "stop"
return "continue"
```

路径：`packages/opencode/src/session/processor.ts:844-846`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:844-846</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">          if (ctx.needsCompaction) return &quot;compact&quot;</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">          if (ctx.blocked || ctx.assistantMessage.error) return &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">          return &quot;continue&quot;</span></span></code></pre>
</details>


`runLoop` 根据结果决定结束、compact，或者继续下一轮：

```ts
if (result === "stop") return "break" as const
if (result === "compact") {
  yield* compaction.create({
    sessionID,
    agent: lastUser.agent,
    model: lastUser.model,
    auto: true,
    overflow: !handle.message.finish,
  })
}
return "continue" as const
```

路径：`packages/opencode/src/session/prompt.ts:1461-1471`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1461-1471</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
<span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
<span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
<span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
<span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
<span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span></code></pre>
</details>


如果 `outcome` 是 continue，`while (true)` 进入下一轮，这时刚刚写入的 tool parts 已在 message history 中，下一次 `MessageV2.toModelMessagesEffect(msgs, model)` 会把新的历史转成模型上下文。  
来源：`packages/opencode/src/session/prompt.ts:1248-1477`、`packages/opencode/src/session/prompt.ts:1420-1425`。  

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1248-1477</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
<span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
<span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
<span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
<span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
<span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
<span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
<span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
<span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
<span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
<span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
<span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
<span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1277</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1278</span><span class="source-line-text">          step++</span></span>
<span class="source-line"><span class="source-line-number">1279</span><span class="source-line-text">          if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1280</span><span class="source-line-text">            yield* title({</span></span>
<span class="source-line"><span class="source-line-number">1281</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1282</span><span class="source-line-text">              modelID: lastUser.model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">1283</span><span class="source-line-text">              providerID: lastUser.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1284</span><span class="source-line-text">              history: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1285</span><span class="source-line-text">            }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1286</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
<span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
<span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
<span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
<span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
<span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
<span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
<span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
<span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span>
<span class="source-line"><span class="source-line-number">1318</span><span class="source-line-text">            const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">1319</span><span class="source-line-text">            const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">1320</span><span class="source-line-text">            const error = new NamedError.Unknown({ message: `Agent not found: &quot;${lastUser.agent}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">1321</span><span class="source-line-text">            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">1322</span><span class="source-line-text">            throw error</span></span>
<span class="source-line"><span class="source-line-number">1323</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1324</span><span class="source-line-text">          const maxSteps = agent.steps ?? Infinity</span></span>
<span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
<span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
<span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
<span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
<span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
<span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
<span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
<span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
<span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
<span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
<span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
<span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
<span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
<span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
<span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
<span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
<span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
<span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
<span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
<span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
<span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
<span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
<span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
<span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
<span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
<span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
<span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
<span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
<span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
<span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
<span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
<span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
<span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
<span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
<span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
<span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
<span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
<span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
<span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
<span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
<span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
<span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
<span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
<span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
<span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
<span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
<span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
<span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
<span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
<span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
<span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
<span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1441</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1442</span><span class="source-line-text">            if (structured !== undefined) {</span></span>
<span class="source-line"><span class="source-line-number">1443</span><span class="source-line-text">              handle.message.structured = structured</span></span>
<span class="source-line"><span class="source-line-number">1444</span><span class="source-line-text">              handle.message.finish = handle.message.finish ?? &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">1445</span><span class="source-line-text">              yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1446</span><span class="source-line-text">              return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1447</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1448</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1449</span><span class="source-line-text">            const finished = handle.message.finish &amp;&amp; ![&quot;tool-calls&quot;, &quot;unknown&quot;].includes(handle.message.finish)</span></span>
<span class="source-line"><span class="source-line-number">1450</span><span class="source-line-text">            if (finished &amp;&amp; !handle.message.error) {</span></span>
<span class="source-line"><span class="source-line-number">1451</span><span class="source-line-text">              if (format.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1452</span><span class="source-line-text">                handle.message.error = new MessageV2.StructuredOutputError({</span></span>
<span class="source-line"><span class="source-line-number">1453</span><span class="source-line-text">                  message: &quot;Model did not produce structured output&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1454</span><span class="source-line-text">                  retries: 0,</span></span>
<span class="source-line"><span class="source-line-number">1455</span><span class="source-line-text">                }).toObject()</span></span>
<span class="source-line"><span class="source-line-number">1456</span><span class="source-line-text">                yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1457</span><span class="source-line-text">                return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1458</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1459</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1460</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
<span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
<span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
<span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
<span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
<span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1472</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1473</span><span class="source-line-text">            Effect.ensuring(instruction.clear(handle.message.id)),</span></span>
<span class="source-line"><span class="source-line-number">1474</span><span class="source-line-text">            Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant),</span></span>
<span class="source-line"><span class="source-line-number">1475</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1476</span><span class="source-line-text">          if (outcome === &quot;break&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1477</span><span class="source-line-text">          continue</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1420-1425</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
<span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
<span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
<span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
<span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span></code></pre>
</details>

说明：这里“tool parts 会被下一轮模型上下文消费”的结论来自 `runLoop` 每轮重新读取 `MessageV2.filterCompactedEffect(sessionID)` 并调用 `MessageV2.toModelMessagesEffect(msgs, model)`；具体 tool part 到 provider message 的格式转换需要继续阅读 `MessageV2.toModelMessagesEffect`，本章不展开。

### 6.8 输出结果

如果模型输出普通文本，processor 会创建 text part、追加 delta、结束时更新 part：

```ts
case "text-start":
  ctx.currentText = {
    id: PartID.ascending(),
    messageID: ctx.assistantMessage.id,
    sessionID: ctx.assistantMessage.sessionID,
    type: "text",
    text: "",
    time: { start: Date.now() },
  }
  yield* session.updatePart(ctx.currentText)

case "text-delta":
  ctx.currentText.text += value.text
  yield* session.updatePartDelta({ field: "text", delta: value.text })

case "text-end":
  ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }
  yield* session.updatePart(ctx.currentText)
```

路径：`packages/opencode/src/session/processor.ts:618-685`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:618-685</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">618</span><span class="source-line-text">          case &quot;text-start&quot;:</span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">            if (!ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">                yield* events.publish(SessionEvent.Text.Started, {</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">            ctx.currentText = {</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">              messageID: ctx.assistantMessage.id,</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">              sessionID: ctx.assistantMessage.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">              type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">              text: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">              time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">              metadata: value.providerMetadata,</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">            yield* session.updatePart(ctx.currentText)</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">          case &quot;text-delta&quot;:</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">            if (!ctx.currentText) return</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">            ctx.currentText.text += value.text</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">            if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">            yield* session.updatePartDelta({</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">              sessionID: ctx.currentText.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">              messageID: ctx.currentText.messageID,</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">              partID: ctx.currentText.id,</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">              field: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">              delta: value.text,</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">652</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">          case &quot;text-end&quot;:</span></span>
<span class="source-line"><span class="source-line-number">654</span><span class="source-line-text">            if (!ctx.currentText) return</span></span>
<span class="source-line"><span class="source-line-number">655</span><span class="source-line-text">            // oxlint-disable-next-line no-self-assign -- reactivity trigger</span></span>
<span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">            ctx.currentText.text = ctx.currentText.text</span></span>
<span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">            ctx.currentText.text = (yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">658</span><span class="source-line-text">              &quot;experimental.text.complete&quot;,</span></span>
<span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">              {</span></span>
<span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">                messageID: ctx.assistantMessage.id,</span></span>
<span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">                partID: ctx.currentText.id,</span></span>
<span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">              { text: ctx.currentText.text },</span></span>
<span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">            )).text</span></span>
<span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">            if (!ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">668</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">                yield* events.publish(SessionEvent.Text.Ended, {</span></span>
<span class="source-line"><span class="source-line-number">670</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">                  text: ctx.currentText.text,</span></span>
<span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">            {</span></span>
<span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">              const end = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">678</span><span class="source-line-text">              ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }</span></span>
<span class="source-line"><span class="source-line-number">679</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">680</span><span class="source-line-text">            if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata</span></span>
<span class="source-line"><span class="source-line-number">681</span><span class="source-line-text">            yield* session.updatePart(ctx.currentText)</span></span>
<span class="source-line"><span class="source-line-number">682</span><span class="source-line-text">            ctx.currentText = undefined</span></span>
<span class="source-line"><span class="source-line-number">683</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">684</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">685</span><span class="source-line-text">          case &quot;finish&quot;:</span></span></code></pre>
</details>


## 7. 核心源码逐段讲解

### 7.1 `prompt`：入口不直接问模型

```ts
const message = yield* createUserMessage(input)
yield* sessions.touch(input.sessionID)
if (input.noReply === true) return message
return yield* loop({ sessionID: input.sessionID })
```

路径：`packages/opencode/src/session/prompt.ts:1211-1229`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1211-1229</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1211</span><span class="source-line-text">    const prompt: (input: PromptInput) =&gt; Effect.Effect&lt;MessageV2.WithParts, Image.Error&gt; = Effect.fn(</span></span>
<span class="source-line"><span class="source-line-number">1212</span><span class="source-line-text">      &quot;SessionPrompt.prompt&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1213</span><span class="source-line-text">    )(function* (input: PromptInput) {</span></span>
<span class="source-line"><span class="source-line-number">1214</span><span class="source-line-text">      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)</span></span>
<span class="source-line"><span class="source-line-number">1215</span><span class="source-line-text">      yield* revert.cleanup(session)</span></span>
<span class="source-line"><span class="source-line-number">1216</span><span class="source-line-text">      const message = yield* createUserMessage(input)</span></span>
<span class="source-line"><span class="source-line-number">1217</span><span class="source-line-text">      yield* sessions.touch(input.sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1218</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1219</span><span class="source-line-text">      const permissions: Permission.Ruleset = []</span></span>
<span class="source-line"><span class="source-line-number">1220</span><span class="source-line-text">      for (const [t, enabled] of Object.entries(input.tools ?? {})) {</span></span>
<span class="source-line"><span class="source-line-number">1221</span><span class="source-line-text">        permissions.push({ permission: t, action: enabled ? &quot;allow&quot; : &quot;deny&quot;, pattern: &quot;*&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1222</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1223</span><span class="source-line-text">      if (permissions.length &gt; 0) {</span></span>
<span class="source-line"><span class="source-line-number">1224</span><span class="source-line-text">        session.permission = permissions</span></span>
<span class="source-line"><span class="source-line-number">1225</span><span class="source-line-text">        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })</span></span>
<span class="source-line"><span class="source-line-number">1226</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1227</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1228</span><span class="source-line-text">      if (input.noReply === true) return message</span></span>
<span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span></code></pre>
</details>


它解决的问题：先把用户输入落到 session，保证后续 loop 只依赖统一的消息历史。

Java 理解：这是 Application Service 的 command handler。先 `save(UserMessage)`，再调用 `agentLoop.run(sessionId)`。

复述检查：为什么 OpenCode 不在 CLI handler 里直接调用 LLM？

### 7.2 `loop`：同一 session 不能随便并发跑

```ts
const loop: (input: LoopInput) => Effect.Effect<MessageV2.WithParts> = Effect.fn("SessionPrompt.loop")(function* (
  input: LoopInput,
) {
  return yield* state.ensureRunning(input.sessionID, lastAssistant(input.sessionID), runLoop(input.sessionID))
})
```

路径：`packages/opencode/src/session/prompt.ts:1485-1489`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1485-1489</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1485</span><span class="source-line-text">    const loop: (input: LoopInput) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt; = Effect.fn(&quot;SessionPrompt.loop&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">1486</span><span class="source-line-text">      input: LoopInput,</span></span>
<span class="source-line"><span class="source-line-number">1487</span><span class="source-line-text">    ) {</span></span>
<span class="source-line"><span class="source-line-number">1488</span><span class="source-line-text">      return yield* state.ensureRunning(input.sessionID, lastAssistant(input.sessionID), runLoop(input.sessionID))</span></span>
<span class="source-line"><span class="source-line-number">1489</span><span class="source-line-text">    })</span></span></code></pre>
</details>


它解决的问题：同一个 session 的 agent run 需要 busy/idle/cancel 管理，避免多个 loop 同时写同一组 messages。

`ensureRunning` 来自 `SessionRunState`：

```ts
readonly ensureRunning: (
  sessionID: SessionID,
  onInterrupt: Effect.Effect<MessageV2.WithParts>,
  work: Effect.Effect<MessageV2.WithParts>,
) => Effect.Effect<MessageV2.WithParts>
```

路径：`packages/opencode/src/session/run-state.ts:10-23`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/run-state.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/run-state.ts:10-23</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">10</span><span class="source-line-text">export interface Interface {</span></span>
<span class="source-line"><span class="source-line-number">11</span><span class="source-line-text">  readonly assertNotBusy: (sessionID: SessionID) =&gt; Effect.Effect&lt;void, Session.BusyError&gt;</span></span>
<span class="source-line"><span class="source-line-number">12</span><span class="source-line-text">  readonly cancel: (sessionID: SessionID) =&gt; Effect.Effect&lt;void&gt;</span></span>
<span class="source-line"><span class="source-line-number">13</span><span class="source-line-text">  readonly ensureRunning: (</span></span>
<span class="source-line"><span class="source-line-number">14</span><span class="source-line-text">    sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">15</span><span class="source-line-text">    onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">16</span><span class="source-line-text">    work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">17</span><span class="source-line-text">  ) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt;</span></span>
<span class="source-line"><span class="source-line-number">18</span><span class="source-line-text">  readonly startShell: (</span></span>
<span class="source-line"><span class="source-line-number">19</span><span class="source-line-text">    sessionID: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">20</span><span class="source-line-text">    onInterrupt: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">21</span><span class="source-line-text">    work: Effect.Effect&lt;MessageV2.WithParts&gt;,</span></span>
<span class="source-line"><span class="source-line-number">22</span><span class="source-line-text">    ready?: Latch.Latch,</span></span>
<span class="source-line"><span class="source-line-number">23</span><span class="source-line-text">  ) =&gt; Effect.Effect&lt;MessageV2.WithParts, Session.BusyError&gt;</span></span></code></pre>
</details>


Java 理解：类似给 `sessionId` 加一个 runner/lock，并注册 interrupt fallback。

### 7.3 `runLoop`：真正的状态机

```ts
while (true) {
  yield* status.set(sessionID, { type: "busy" })
  let msgs = yield* MessageV2.filterCompactedEffect(sessionID)
  const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)
  if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
  // ...
}
```

路径：`packages/opencode/src/session/prompt.ts:1248-1256`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1248-1256</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
<span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
<span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
<span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span></code></pre>
</details>


它解决的问题：每轮都从持久化消息状态重新恢复上下文，而不是把上下文藏在内存局部变量里。

Java 理解：这是典型状态机，`MessageV2.latest` 是状态选择器。

### 7.4 退出条件：不是所有 stop 都能停

```ts
const hasToolCalls =
  lastAssistantMsg?.parts.some((part) => part.type === "tool" && !part.metadata?.providerExecuted) ?? false

if (
  lastAssistant?.finish &&
  !["tool-calls"].includes(lastAssistant.finish) &&
  !hasToolCalls &&
  lastUser.id < lastAssistant.id
) {
  break
}
```

路径：`packages/opencode/src/session/prompt.ts:1258-1276`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1258-1276</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
<span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
<span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
<span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
<span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
<span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
<span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
<span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
<span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
<span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span></code></pre>
</details>


它解决的问题：有些 provider 可能返回 stop，但 assistant message 里仍有 tool calls。OpenCode 明确注释说这种情况下要继续 loop，让 tool results 能发回模型。  
来源：`packages/opencode/src/session/prompt.ts:1261-1264`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1261-1264</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
<span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
<span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
<span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span></code></pre>
</details>


Java 理解：退出条件不能只看一个状态字段，要看是否还有未反馈给模型的工具调用。

### 7.5 准备 assistant message 和 processor

```ts
const msg: MessageV2.Assistant = {
  id: MessageID.ascending(),
  parentID: lastUser.id,
  role: "assistant",
  agent: agent.name,
  modelID: model.id,
  providerID: model.providerID,
  time: { created: Date.now() },
  sessionID,
}
yield* sessions.updateMessage(msg)

const handle = yield* processor.create({
  assistantMessage: msg,
  sessionID,
  model,
})
```

路径：`packages/opencode/src/session/prompt.ts:1332-1365`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1332-1365</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
<span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
<span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
<span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
<span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
<span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
<span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
<span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
<span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span></code></pre>
</details>


它解决的问题：LLM stream 还没开始前，先创建 assistant message 容器。后续 text/tool/reasoning 都作为 parts 挂到这个 assistant message 下。

Java 理解：先创建一个 `AssistantMessage aggregate root`，processor 后续只更新这个 aggregate 的 children。

### 7.6 准备工具

```ts
const tools = yield* SessionTools.resolve({
  agent,
  session,
  model,
  processor: handle,
  bypassAgentCheck,
  messages: msgs,
  promptOps,
})
```

路径：`packages/opencode/src/session/prompt.ts:1372-1386`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1372-1386</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
<span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
<span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
<span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
<span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
<span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
<span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
<span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
<span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
<span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span></code></pre>
</details>


`SessionTools.resolve` 内部会创建 `Tool.Context`，其中 `ask` 会合并 agent permission 和 session permission：

```ts
ask: (req) =>
  permission
    .ask({
      ...req,
      sessionID: input.session.id,
      tool: { messageID: input.processor.message.id, callID: options.toolCallId },
      ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),
    })
```

路径：`packages/opencode/src/session/tools.ts:42-73`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:42-73</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  const context = (args: Record&lt;string, unknown&gt;, options: ToolExecutionOptions): Tool.Context =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">    abort: options.abortSignal!,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">    messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    callID: options.toolCallId,</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps: input.promptOps },</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    agent: input.agent.name,</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">    messages: input.messages,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">    metadata: (val) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      input.processor.updateToolCall(options.toolCallId, (match) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        if (![&quot;running&quot;, &quot;pending&quot;].includes(match.state.status)) return match</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          ...match,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">          state: {</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            title: val.title,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            metadata: val.metadata,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            input: args,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span></code></pre>
</details>


Java 理解：工具执行被一个上下文对象包住，里面有 session、message、permission、metadata callback，类似 Spring Interceptor + Strategy context。

### 7.7 调 LLM 并消费事件

```ts
const stream = llm.stream(streamInput)

yield* stream.pipe(
  Stream.tap((event) => handleEvent(event)),
  Stream.takeUntil(() => ctx.needsCompaction),
  Stream.runDrain,
)
```

路径：`packages/opencode/src/session/processor.ts:779-795`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:779-795</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">      const process = Effect.fn(&quot;SessionProcessor.process&quot;)(function* (streamInput: LLM.StreamInput) {</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">        slog.info(&quot;process&quot;)</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">        ctx.needsCompaction = false</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">        ctx.shouldBreak = (yield* config.get()).experimental?.continue_loop_on_deny !== true</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">        return yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">          yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">            ctx.currentText = undefined</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            ctx.reasoningMap = {}</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            yield* status.set(ctx.sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">            const stream = llm.stream(streamInput)</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">            yield* stream.pipe(</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">              Stream.tap((event) =&gt; handleEvent(event)),</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">              Stream.takeUntil(() =&gt; ctx.needsCompaction),</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">              Stream.runDrain,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            )</span></span></code></pre>
</details>


它解决的问题：LLM 输出不是一次性字符串，而是一串事件。processor 逐个消费事件，并更新 session 状态。

Java 理解：像 `Flux<LlmEvent>` 或 `Flow.Publisher<LlmEvent>`，每个 event 被 event handler 消费。

### 7.8 处理 tool-call 和 tool-result

tool-call：

```ts
case "tool-call": {
  const toolCall = yield* ensureToolCall(value)
  const input = toolInput(value.input)
  yield* updateToolCall(value.id, (match) => ({
    ...match,
    tool: value.name,
    state: { status: "running", input, time: { start: Date.now() } },
  }))
}
```

路径：`packages/opencode/src/session/processor.ts:376-421`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:376-421</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">          case &quot;tool-call&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">            if (ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">              throw new Error(`Tool call not allowed while generating summary: ${value.name}`)</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">            const toolCall = yield* ensureToolCall(value)</span></span>
<span class="source-line"><span class="source-line-number">381</span><span class="source-line-text">            const input = toolInput(value.input)</span></span>
<span class="source-line"><span class="source-line-number">382</span><span class="source-line-text">            if (!toolCall.call.inputEnded) {</span></span>
<span class="source-line"><span class="source-line-number">383</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">384</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">385</span><span class="source-line-text">                yield* events.publish(SessionEvent.Tool.Input.Ended, {</span></span>
<span class="source-line"><span class="source-line-number">386</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">387</span><span class="source-line-text">                  callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">388</span><span class="source-line-text">                  text: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">389</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">390</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">391</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">392</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">393</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">394</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">395</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Called, {</span></span>
<span class="source-line"><span class="source-line-number">396</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">397</span><span class="source-line-text">                callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">398</span><span class="source-line-text">                tool: value.name,</span></span>
<span class="source-line"><span class="source-line-number">399</span><span class="source-line-text">                input,</span></span>
<span class="source-line"><span class="source-line-number">400</span><span class="source-line-text">                provider: {</span></span>
<span class="source-line"><span class="source-line-number">401</span><span class="source-line-text">                  executed: toolCall.part.metadata?.providerExecuted === true,</span></span>
<span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">                  ...(value.providerMetadata ? { metadata: value.providerMetadata } : {}),</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">            yield* updateToolCall(value.id, (match) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text">              ...match,</span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">              tool: value.name,</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">              state:</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">                match.state.status === &quot;running&quot;</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">                  ? { ...match.state, input }</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">                  : {</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">                      status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">                      input,</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">                      time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">                    },</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">              metadata: match.metadata?.providerExecuted</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">                ? { ...value.providerMetadata, providerExecuted: true }</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">                : value.providerMetadata,</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">            }))</span></span></code></pre>
</details>


tool-result：

```ts
case "tool-result": {
  const rawOutput = toolResultOutput(value)
  const output = { ...rawOutput, attachments: attachments.length ? attachments : undefined }
  yield* completeToolCall(value.id, output)
  return
}
```

路径：`packages/opencode/src/session/processor.ts:451-500`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:451-500</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">          case &quot;tool-result&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">            const toolCall = yield* readToolCall(value.id)</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">            const rawOutput = toolResultOutput(value)</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">            const normalized = yield* Effect.forEach(rawOutput.attachments ?? [], (attachment) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              attachment.mime.startsWith(&quot;image/&quot;)</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">                ? image.normalize(attachment).pipe(</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">                    Effect.catchIf(</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">                      (error) =&gt; error instanceof Image.ResizerUnavailableError,</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">                      () =&gt; Effect.succeed(attachment),</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">                    Effect.exit,</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">                : Effect.succeed(Exit.succeed&lt;MessageV2.FilePart&gt;(attachment)),</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">            const omitted = normalized.filter(Exit.isFailure).length</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">            const attachments = normalized.filter(Exit.isSuccess).map((item) =&gt; item.value)</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">            const output = {</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">              ...rawOutput,</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">              output:</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text">                omitted === 0</span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">                  ? rawOutput.output</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">                  : `${rawOutput.output}\n\n[${omitted} image${omitted === 1 ? &quot;&quot; : &quot;s&quot;} omitted: could not be resized below the image size limit.]`,</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">              attachments: attachments.length ? attachments : undefined,</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">            if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              yield* events.publish(SessionEvent.Tool.Success, {</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text">                callID: value.id,</span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">                structured: output.metadata,</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text">                content: [</span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">                  {</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">                    text: output.output,</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">                  },</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">                  ...(output.attachments?.map((item: MessageV2.FilePart) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">                    type: &quot;file&quot; as const,</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">                    uri: item.url,</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">                    mime: item.mime,</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">                    name: item.filename,</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">                  })) ?? []),</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">                ],</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">                provider: {</span></span>
<span class="source-line"><span class="source-line-number">494</span><span class="source-line-text">                  executed: value.providerExecuted === true || toolCall?.part.metadata?.providerExecuted === true,</span></span>
<span class="source-line"><span class="source-line-number">495</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">496</span><span class="source-line-text">                timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">497</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">498</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">499</span><span class="source-line-text">            yield* completeToolCall(value.id, output)</span></span>
<span class="source-line"><span class="source-line-number">500</span><span class="source-line-text">            return</span></span></code></pre>
</details>


Java 理解：tool call 是任务进入 running；tool result 是任务完成并持久化 result。

### 7.9 继续、停止、压缩

```ts
if (ctx.needsCompaction) return "compact"
if (ctx.blocked || ctx.assistantMessage.error) return "stop"
return "continue"
```

路径：`packages/opencode/src/session/processor.ts:844-846`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:844-846</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">          if (ctx.needsCompaction) return &quot;compact&quot;</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">          if (ctx.blocked || ctx.assistantMessage.error) return &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">          return &quot;continue&quot;</span></span></code></pre>
</details>


```ts
if (result === "stop") return "break" as const
if (result === "compact") {
  yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })
}
return "continue" as const
```

路径：`packages/opencode/src/session/prompt.ts:1461-1471`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1461-1471</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
<span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
<span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
<span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
<span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
<span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span></code></pre>
</details>


Java 理解：processor 返回状态机事件，loop 根据事件跳转到 break/compact/next iteration。

## 8. 关键 TypeScript 语法复习

### 8.1 `Effect.gen(function* () { ... })`

例子：

```ts
const runLoop: (sessionID: SessionID) => Effect.Effect<MessageV2.WithParts> = Effect.fn("SessionPrompt.run")(
  function* (sessionID: SessionID) {
    const ctx = yield* InstanceState.context
    // ...
  },
)
```

路径：`packages/opencode/src/session/prompt.ts:1240-1243`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1240-1243</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1240</span><span class="source-line-text">    const runLoop: (sessionID: SessionID) =&gt; Effect.Effect&lt;MessageV2.WithParts&gt; = Effect.fn(&quot;SessionPrompt.run&quot;)(</span></span>
<span class="source-line"><span class="source-line-number">1241</span><span class="source-line-text">      function* (sessionID: SessionID) {</span></span>
<span class="source-line"><span class="source-line-number">1242</span><span class="source-line-text">        const ctx = yield* InstanceState.context</span></span>
<span class="source-line"><span class="source-line-number">1243</span><span class="source-line-text">        const slog = elog.with({ sessionID })</span></span></code></pre>
</details>


理解：这不是普通 generator 用来产出数组，而是 Effect 用 generator 语法把异步、依赖、错误通道写得像同步代码。Java 类比是 Reactor/CompletableFuture 链，但语法更接近同步 Service。

### 8.2 destructuring

```ts
const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)
```

路径：`packages/opencode/src/session/prompt.ts:1254`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1254</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span></code></pre>
</details>


理解：从返回对象里取字段，并重命名。Java 里通常会写 `latest.user()`、`latest.assistant()`。

### 8.3 literal union

```ts
export type Result = "compact" | "stop" | "continue"
```

路径：`packages/opencode/src/session/processor.ts:36`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:36</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">export type Result = &quot;compact&quot; | &quot;stop&quot; | &quot;continue&quot;</span></span></code></pre>
</details>


理解：比 Java enum 更轻量，运行时就是字符串，编译期限制只能是这三个值。

### 8.4 Record

```ts
const tools: Record<string, AITool> = {}
```

路径：`packages/opencode/src/session/tools.ts:34`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:34</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  const tools: Record&lt;string, AITool&gt; = {}</span></span></code></pre>
</details>


理解：类似 `Map<String, AITool>`，但这里用 JS object 表示工具名到工具对象的映射。

### 8.5 object spread

```ts
const output = {
  ...result,
  attachments: result.attachments?.map((attachment) => ({
    ...attachment,
    id: PartID.ascending(),
    sessionID: ctx.sessionID,
    messageID: input.processor.message.id,
  })),
}
```

路径：`packages/opencode/src/session/tools.ts:93-102`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:93-102</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            const result = yield* item.execute(args, ctx)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            const output = {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              ...result,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              attachments: result.attachments?.map((attachment) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                ...attachment,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">              })),</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span></code></pre>
</details>


理解：浅拷贝原对象并覆盖/补充字段，类似 Java builder copy。

### 8.6 discriminated union

```ts
export const ToolState = Schema.Union([
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
]).annotate({
  discriminator: "status",
})
```

路径：`packages/opencode/src/session/message-v2.ts:299-308`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/message-v2.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/message-v2.ts:299-308</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">299</span><span class="source-line-text">export const ToolState = Schema.Union([</span></span>
<span class="source-line"><span class="source-line-number">300</span><span class="source-line-text">  ToolStatePending,</span></span>
<span class="source-line"><span class="source-line-number">301</span><span class="source-line-text">  ToolStateRunning,</span></span>
<span class="source-line"><span class="source-line-number">302</span><span class="source-line-text">  ToolStateCompleted,</span></span>
<span class="source-line"><span class="source-line-number">303</span><span class="source-line-text">  ToolStateError,</span></span>
<span class="source-line"><span class="source-line-number">304</span><span class="source-line-text">]).annotate({</span></span>
<span class="source-line"><span class="source-line-number">305</span><span class="source-line-text">  discriminator: &quot;status&quot;,</span></span>
<span class="source-line"><span class="source-line-number">306</span><span class="source-line-text">  identifier: &quot;ToolState&quot;,</span></span>
<span class="source-line"><span class="source-line-number">307</span><span class="source-line-text">})</span></span>
<span class="source-line"><span class="source-line-number">308</span><span class="source-line-text">export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError</span></span></code></pre>
</details>


理解：`status` 是判别字段，类似 Java sealed interface + 多个 record 实现。

## 9. 涉及的设计模式和架构思想

1. State Machine  
   `runLoop` 的 `while (true)` 根据 `stop/continue/compact/subtask` 切换状态。来源：`packages/opencode/src/session/prompt.ts:1248-1477`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1248-1477</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1248</span><span class="source-line-text">        while (true) {</span></span>
<span class="source-line"><span class="source-line-number">1249</span><span class="source-line-text">          yield* status.set(sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">1250</span><span class="source-line-text">          yield* slog.info(&quot;loop&quot;, { step })</span></span>
<span class="source-line"><span class="source-line-number">1251</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span>
<span class="source-line"><span class="source-line-number">1255</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1256</span><span class="source-line-text">          if (!lastUser) throw new Error(&quot;No user message found in stream. This should never happen.&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1257</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1258</span><span class="source-line-text">          const lastAssistantMsg = msgs.findLast(</span></span>
<span class="source-line"><span class="source-line-number">1259</span><span class="source-line-text">            (msg) =&gt; msg.info.role === &quot;assistant&quot; &amp;&amp; msg.info.id === lastAssistant?.id,</span></span>
<span class="source-line"><span class="source-line-number">1260</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1261</span><span class="source-line-text">          // Some providers return &quot;stop&quot; even when the assistant message contains tool calls.</span></span>
<span class="source-line"><span class="source-line-number">1262</span><span class="source-line-text">          // Keep the loop running so tool results can be sent back to the model.</span></span>
<span class="source-line"><span class="source-line-number">1263</span><span class="source-line-text">          // Skip provider-executed tool parts — those were fully handled within the</span></span>
<span class="source-line"><span class="source-line-number">1264</span><span class="source-line-text">          // provider's stream (e.g. DWS Agent Platform) and don't need a re-loop.</span></span>
<span class="source-line"><span class="source-line-number">1265</span><span class="source-line-text">          const hasToolCalls =</span></span>
<span class="source-line"><span class="source-line-number">1266</span><span class="source-line-text">            lastAssistantMsg?.parts.some((part) =&gt; part.type === &quot;tool&quot; &amp;&amp; !part.metadata?.providerExecuted) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1267</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1268</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1269</span><span class="source-line-text">            lastAssistant?.finish &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1270</span><span class="source-line-text">            ![&quot;tool-calls&quot;].includes(lastAssistant.finish) &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1271</span><span class="source-line-text">            !hasToolCalls &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1272</span><span class="source-line-text">            lastUser.id &lt; lastAssistant.id</span></span>
<span class="source-line"><span class="source-line-number">1273</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1274</span><span class="source-line-text">            yield* slog.info(&quot;exiting loop&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1275</span><span class="source-line-text">            break</span></span>
<span class="source-line"><span class="source-line-number">1276</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1277</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1278</span><span class="source-line-text">          step++</span></span>
<span class="source-line"><span class="source-line-number">1279</span><span class="source-line-text">          if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1280</span><span class="source-line-text">            yield* title({</span></span>
<span class="source-line"><span class="source-line-number">1281</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1282</span><span class="source-line-text">              modelID: lastUser.model.modelID,</span></span>
<span class="source-line"><span class="source-line-number">1283</span><span class="source-line-text">              providerID: lastUser.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1284</span><span class="source-line-text">              history: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1285</span><span class="source-line-text">            }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1286</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1287</span><span class="source-line-text">          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1288</span><span class="source-line-text">          const task = tasks.pop()</span></span>
<span class="source-line"><span class="source-line-number">1289</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1290</span><span class="source-line-text">          if (task?.type === &quot;subtask&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1291</span><span class="source-line-text">            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })</span></span>
<span class="source-line"><span class="source-line-number">1292</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1293</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1294</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1295</span><span class="source-line-text">          if (task?.type === &quot;compaction&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1296</span><span class="source-line-text">            const result = yield* compaction.process({</span></span>
<span class="source-line"><span class="source-line-number">1297</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1298</span><span class="source-line-text">              parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1299</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1300</span><span class="source-line-text">              auto: task.auto,</span></span>
<span class="source-line"><span class="source-line-number">1301</span><span class="source-line-text">              overflow: task.overflow,</span></span>
<span class="source-line"><span class="source-line-number">1302</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1303</span><span class="source-line-text">            if (result === &quot;stop&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1304</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1305</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1306</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1307</span><span class="source-line-text">          if (</span></span>
<span class="source-line"><span class="source-line-number">1308</span><span class="source-line-text">            lastFinished &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1309</span><span class="source-line-text">            lastFinished.summary !== true &amp;&amp;</span></span>
<span class="source-line"><span class="source-line-number">1310</span><span class="source-line-text">            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))</span></span>
<span class="source-line"><span class="source-line-number">1311</span><span class="source-line-text">          ) {</span></span>
<span class="source-line"><span class="source-line-number">1312</span><span class="source-line-text">            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })</span></span>
<span class="source-line"><span class="source-line-number">1313</span><span class="source-line-text">            continue</span></span>
<span class="source-line"><span class="source-line-number">1314</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1315</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1316</span><span class="source-line-text">          const agent = yield* agents.get(lastUser.agent)</span></span>
<span class="source-line"><span class="source-line-number">1317</span><span class="source-line-text">          if (!agent) {</span></span>
<span class="source-line"><span class="source-line-number">1318</span><span class="source-line-text">            const available = (yield* agents.list()).filter((a) =&gt; !a.hidden).map((a) =&gt; a.name)</span></span>
<span class="source-line"><span class="source-line-number">1319</span><span class="source-line-text">            const hint = available.length ? ` Available agents: ${available.join(&quot;, &quot;)}` : &quot;&quot;</span></span>
<span class="source-line"><span class="source-line-number">1320</span><span class="source-line-text">            const error = new NamedError.Unknown({ message: `Agent not found: &quot;${lastUser.agent}&quot;.${hint}` })</span></span>
<span class="source-line"><span class="source-line-number">1321</span><span class="source-line-text">            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })</span></span>
<span class="source-line"><span class="source-line-number">1322</span><span class="source-line-text">            throw error</span></span>
<span class="source-line"><span class="source-line-number">1323</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1324</span><span class="source-line-text">          const maxSteps = agent.steps ?? Infinity</span></span>
<span class="source-line"><span class="source-line-number">1325</span><span class="source-line-text">          const isLastStep = step &gt;= maxSteps</span></span>
<span class="source-line"><span class="source-line-number">1326</span><span class="source-line-text">          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1327</span><span class="source-line-text">            Effect.provideService(RuntimeFlags.Service, flags),</span></span>
<span class="source-line"><span class="source-line-number">1328</span><span class="source-line-text">            Effect.provideService(AppFileSystem.Service, fsys),</span></span>
<span class="source-line"><span class="source-line-number">1329</span><span class="source-line-text">            Effect.provideService(Session.Service, sessions),</span></span>
<span class="source-line"><span class="source-line-number">1330</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1331</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1332</span><span class="source-line-text">          const msg: MessageV2.Assistant = {</span></span>
<span class="source-line"><span class="source-line-number">1333</span><span class="source-line-text">            id: MessageID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">1334</span><span class="source-line-text">            parentID: lastUser.id,</span></span>
<span class="source-line"><span class="source-line-number">1335</span><span class="source-line-text">            role: &quot;assistant&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1336</span><span class="source-line-text">            mode: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1337</span><span class="source-line-text">            agent: agent.name,</span></span>
<span class="source-line"><span class="source-line-number">1338</span><span class="source-line-text">            variant: lastUser.model.variant,</span></span>
<span class="source-line"><span class="source-line-number">1339</span><span class="source-line-text">            path: { cwd: ctx.directory, root: ctx.worktree },</span></span>
<span class="source-line"><span class="source-line-number">1340</span><span class="source-line-text">            cost: 0,</span></span>
<span class="source-line"><span class="source-line-number">1341</span><span class="source-line-text">            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },</span></span>
<span class="source-line"><span class="source-line-number">1342</span><span class="source-line-text">            modelID: model.id,</span></span>
<span class="source-line"><span class="source-line-number">1343</span><span class="source-line-text">            providerID: model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1344</span><span class="source-line-text">            time: { created: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">1345</span><span class="source-line-text">            sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1346</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1347</span><span class="source-line-text">          yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1348</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1349</span><span class="source-line-text">          const finalizeInterruptedAssistant = Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1350</span><span class="source-line-text">            if (msg.time.completed) return</span></span>
<span class="source-line"><span class="source-line-number">1351</span><span class="source-line-text">            msg.error ??= MessageV2.fromError(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;), {</span></span>
<span class="source-line"><span class="source-line-number">1352</span><span class="source-line-text">              providerID: msg.providerID,</span></span>
<span class="source-line"><span class="source-line-number">1353</span><span class="source-line-text">              aborted: true,</span></span>
<span class="source-line"><span class="source-line-number">1354</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1355</span><span class="source-line-text">            msg.time.completed = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">1356</span><span class="source-line-text">            yield* sessions.updateMessage(msg)</span></span>
<span class="source-line"><span class="source-line-number">1357</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1358</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1359</span><span class="source-line-text">          const handle = yield* processor</span></span>
<span class="source-line"><span class="source-line-number">1360</span><span class="source-line-text">            .create({</span></span>
<span class="source-line"><span class="source-line-number">1361</span><span class="source-line-text">              assistantMessage: msg,</span></span>
<span class="source-line"><span class="source-line-number">1362</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1363</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1364</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1365</span><span class="source-line-text">            .pipe(Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant))</span></span>
<span class="source-line"><span class="source-line-number">1366</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1367</span><span class="source-line-text">          const outcome: &quot;break&quot; | &quot;continue&quot; = yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">1368</span><span class="source-line-text">            const lastUserMsg = msgs.findLast((m) =&gt; m.info.role === &quot;user&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1369</span><span class="source-line-text">            const bypassAgentCheck = lastUserMsg?.parts.some((p) =&gt; p.type === &quot;agent&quot;) ?? false</span></span>
<span class="source-line"><span class="source-line-number">1370</span><span class="source-line-text">            const promptOps = yield* ops()</span></span>
<span class="source-line"><span class="source-line-number">1371</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1372</span><span class="source-line-text">            const tools = yield* SessionTools.resolve({</span></span>
<span class="source-line"><span class="source-line-number">1373</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1374</span><span class="source-line-text">              session,</span></span>
<span class="source-line"><span class="source-line-number">1375</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1376</span><span class="source-line-text">              processor: handle,</span></span>
<span class="source-line"><span class="source-line-number">1377</span><span class="source-line-text">              bypassAgentCheck,</span></span>
<span class="source-line"><span class="source-line-number">1378</span><span class="source-line-text">              messages: msgs,</span></span>
<span class="source-line"><span class="source-line-number">1379</span><span class="source-line-text">              promptOps,</span></span>
<span class="source-line"><span class="source-line-number">1380</span><span class="source-line-text">            }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1381</span><span class="source-line-text">              Effect.provideService(Plugin.Service, plugin),</span></span>
<span class="source-line"><span class="source-line-number">1382</span><span class="source-line-text">              Effect.provideService(Permission.Service, permission),</span></span>
<span class="source-line"><span class="source-line-number">1383</span><span class="source-line-text">              Effect.provideService(ToolRegistry.Service, registry),</span></span>
<span class="source-line"><span class="source-line-number">1384</span><span class="source-line-text">              Effect.provideService(MCP.Service, mcp),</span></span>
<span class="source-line"><span class="source-line-number">1385</span><span class="source-line-text">              Effect.provideService(Truncate.Service, truncate),</span></span>
<span class="source-line"><span class="source-line-number">1386</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1387</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1388</span><span class="source-line-text">            if (lastUser.format?.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1389</span><span class="source-line-text">              tools[&quot;StructuredOutput&quot;] = createStructuredOutputTool({</span></span>
<span class="source-line"><span class="source-line-number">1390</span><span class="source-line-text">                schema: lastUser.format.schema,</span></span>
<span class="source-line"><span class="source-line-number">1391</span><span class="source-line-text">                onSuccess(output) {</span></span>
<span class="source-line"><span class="source-line-number">1392</span><span class="source-line-text">                  structured = output</span></span>
<span class="source-line"><span class="source-line-number">1393</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">1394</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1395</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1396</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1397</span><span class="source-line-text">            if (step === 1)</span></span>
<span class="source-line"><span class="source-line-number">1398</span><span class="source-line-text">              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))</span></span>
<span class="source-line"><span class="source-line-number">1399</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1400</span><span class="source-line-text">            if (step &gt; 1 &amp;&amp; lastFinished) {</span></span>
<span class="source-line"><span class="source-line-number">1401</span><span class="source-line-text">              for (const m of msgs) {</span></span>
<span class="source-line"><span class="source-line-number">1402</span><span class="source-line-text">                if (m.info.role !== &quot;user&quot; || m.info.id &lt;= lastFinished.id) continue</span></span>
<span class="source-line"><span class="source-line-number">1403</span><span class="source-line-text">                for (const p of m.parts) {</span></span>
<span class="source-line"><span class="source-line-number">1404</span><span class="source-line-text">                  if (p.type !== &quot;text&quot; || p.ignored || p.synthetic) continue</span></span>
<span class="source-line"><span class="source-line-number">1405</span><span class="source-line-text">                  if (!p.text.trim()) continue</span></span>
<span class="source-line"><span class="source-line-number">1406</span><span class="source-line-text">                  p.text = [</span></span>
<span class="source-line"><span class="source-line-number">1407</span><span class="source-line-text">                    &quot;&lt;system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1408</span><span class="source-line-text">                    &quot;The user sent the following message:&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1409</span><span class="source-line-text">                    p.text,</span></span>
<span class="source-line"><span class="source-line-number">1410</span><span class="source-line-text">                    &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1411</span><span class="source-line-text">                    &quot;Please address this message and continue with your tasks.&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1412</span><span class="source-line-text">                    &quot;&lt;/system-reminder&gt;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1413</span><span class="source-line-text">                  ].join(&quot;\n&quot;)</span></span>
<span class="source-line"><span class="source-line-number">1414</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">1415</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1416</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1417</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1418</span><span class="source-line-text">            yield* plugin.trigger(&quot;experimental.chat.messages.transform&quot;, {}, { messages: msgs })</span></span>
<span class="source-line"><span class="source-line-number">1419</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1420</span><span class="source-line-text">            const [skills, env, instructions, modelMsgs] = yield* Effect.all([</span></span>
<span class="source-line"><span class="source-line-number">1421</span><span class="source-line-text">              sys.skills(agent),</span></span>
<span class="source-line"><span class="source-line-number">1422</span><span class="source-line-text">              sys.environment(model),</span></span>
<span class="source-line"><span class="source-line-number">1423</span><span class="source-line-text">              instruction.system().pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">1424</span><span class="source-line-text">              MessageV2.toModelMessagesEffect(msgs, model),</span></span>
<span class="source-line"><span class="source-line-number">1425</span><span class="source-line-text">            ])</span></span>
<span class="source-line"><span class="source-line-number">1426</span><span class="source-line-text">            const system = [...env, ...instructions, ...(skills ? [skills] : [])]</span></span>
<span class="source-line"><span class="source-line-number">1427</span><span class="source-line-text">            const format = lastUser.format ?? { type: &quot;text&quot; as const }</span></span>
<span class="source-line"><span class="source-line-number">1428</span><span class="source-line-text">            if (format.type === &quot;json_schema&quot;) system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)</span></span>
<span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
<span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
<span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
<span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
<span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
<span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
<span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
<span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
<span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
<span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">1441</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1442</span><span class="source-line-text">            if (structured !== undefined) {</span></span>
<span class="source-line"><span class="source-line-number">1443</span><span class="source-line-text">              handle.message.structured = structured</span></span>
<span class="source-line"><span class="source-line-number">1444</span><span class="source-line-text">              handle.message.finish = handle.message.finish ?? &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">1445</span><span class="source-line-text">              yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1446</span><span class="source-line-text">              return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1447</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1448</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1449</span><span class="source-line-text">            const finished = handle.message.finish &amp;&amp; ![&quot;tool-calls&quot;, &quot;unknown&quot;].includes(handle.message.finish)</span></span>
<span class="source-line"><span class="source-line-number">1450</span><span class="source-line-text">            if (finished &amp;&amp; !handle.message.error) {</span></span>
<span class="source-line"><span class="source-line-number">1451</span><span class="source-line-text">              if (format.type === &quot;json_schema&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1452</span><span class="source-line-text">                handle.message.error = new MessageV2.StructuredOutputError({</span></span>
<span class="source-line"><span class="source-line-number">1453</span><span class="source-line-text">                  message: &quot;Model did not produce structured output&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1454</span><span class="source-line-text">                  retries: 0,</span></span>
<span class="source-line"><span class="source-line-number">1455</span><span class="source-line-text">                }).toObject()</span></span>
<span class="source-line"><span class="source-line-number">1456</span><span class="source-line-text">                yield* sessions.updateMessage(handle.message)</span></span>
<span class="source-line"><span class="source-line-number">1457</span><span class="source-line-text">                return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1458</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">1459</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1460</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1461</span><span class="source-line-text">            if (result === &quot;stop&quot;) return &quot;break&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1462</span><span class="source-line-text">            if (result === &quot;compact&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1463</span><span class="source-line-text">              yield* compaction.create({</span></span>
<span class="source-line"><span class="source-line-number">1464</span><span class="source-line-text">                sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1465</span><span class="source-line-text">                agent: lastUser.agent,</span></span>
<span class="source-line"><span class="source-line-number">1466</span><span class="source-line-text">                model: lastUser.model,</span></span>
<span class="source-line"><span class="source-line-number">1467</span><span class="source-line-text">                auto: true,</span></span>
<span class="source-line"><span class="source-line-number">1468</span><span class="source-line-text">                overflow: !handle.message.finish,</span></span>
<span class="source-line"><span class="source-line-number">1469</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">1470</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1471</span><span class="source-line-text">            return &quot;continue&quot; as const</span></span>
<span class="source-line"><span class="source-line-number">1472</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">1473</span><span class="source-line-text">            Effect.ensuring(instruction.clear(handle.message.id)),</span></span>
<span class="source-line"><span class="source-line-number">1474</span><span class="source-line-text">            Effect.onInterrupt(() =&gt; finalizeInterruptedAssistant),</span></span>
<span class="source-line"><span class="source-line-number">1475</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">1476</span><span class="source-line-text">          if (outcome === &quot;break&quot;) break</span></span>
<span class="source-line"><span class="source-line-number">1477</span><span class="source-line-text">          continue</span></span></code></pre>
</details>


2. Application Service / Orchestrator  
   `SessionPrompt` 不做具体 tool 实现，但协调 session、agent、provider、processor、tools。来源：`packages/opencode/src/session/prompt.ts`。

3. Strategy / Registry  
   工具由 registry 解析，具体工具实现由 `item.execute` 执行。来源：`packages/opencode/src/session/tools.ts:75-116`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:75-116</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    modelID: ModelID.make(input.model.api.id),</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    providerID: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">    agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">  })) {</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">    tools[item.id] = tool({</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      description: item.description,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      inputSchema: jsonSchema(schema),</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      execute(args, options) {</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">        return run.promise(</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            const ctx = context(args, options)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">              &quot;tool.execute.before&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">              { args },</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            const result = yield* item.execute(args, ctx)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            const output = {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              ...result,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              attachments: result.attachments?.map((attachment) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                ...attachment,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">              })),</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">              &quot;tool.execute.after&quot;,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">              output,</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            if (options.abortSignal?.aborted) {</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">              yield* input.processor.completeToolCall(options.toolCallId, output)</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">            return output</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">  }</span></span></code></pre>
</details>


4. Gateway / Adapter  
   `LLM.stream` 隐藏 AI SDK/native runtime 差异。来源：`packages/opencode/src/session/llm.ts:471-493`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:471-493</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">    const stream: Interface[&quot;stream&quot;] = (input) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      Stream.scoped(</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        Stream.unwrap(</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            const ctrl = yield* Effect.acquireRelease(</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">              Effect.sync(() =&gt; new AbortController()),</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              (ctrl) =&gt; Effect.sync(() =&gt; ctrl.abort()),</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">            const result = yield* run({ ...input, abort: ctrl.signal })</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">            if (result.type === &quot;native&quot;) return result.stream</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">            const state = LLMAISDK.adapterState()</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            return Stream.fromAsyncIterable(result.result.fullStream, (e) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              e instanceof Error ? e : new Error(String(e)),</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">            ).pipe(</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              Stream.mapEffect((event) =&gt; LLMAISDK.toLLMEvents(state, event)),</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              Stream.flatMap((events) =&gt; Stream.fromIterable(events)),</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">        ),</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      )</span></span></code></pre>
</details>


5. Event Processor  
   `SessionProcessor` 消费 LLMEvent 并更新消息 parts。来源：`packages/opencode/src/session/processor.ts:779-847`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:779-847</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">779</span><span class="source-line-text">      const process = Effect.fn(&quot;SessionProcessor.process&quot;)(function* (streamInput: LLM.StreamInput) {</span></span>
<span class="source-line"><span class="source-line-number">780</span><span class="source-line-text">        slog.info(&quot;process&quot;)</span></span>
<span class="source-line"><span class="source-line-number">781</span><span class="source-line-text">        ctx.needsCompaction = false</span></span>
<span class="source-line"><span class="source-line-number">782</span><span class="source-line-text">        ctx.shouldBreak = (yield* config.get()).experimental?.continue_loop_on_deny !== true</span></span>
<span class="source-line"><span class="source-line-number">783</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">784</span><span class="source-line-text">        return yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">785</span><span class="source-line-text">          yield* Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">786</span><span class="source-line-text">            ctx.currentText = undefined</span></span>
<span class="source-line"><span class="source-line-number">787</span><span class="source-line-text">            ctx.reasoningMap = {}</span></span>
<span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">            yield* status.set(ctx.sessionID, { type: &quot;busy&quot; })</span></span>
<span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">            const stream = llm.stream(streamInput)</span></span>
<span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">            yield* stream.pipe(</span></span>
<span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">              Stream.tap((event) =&gt; handleEvent(event)),</span></span>
<span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">              Stream.takeUntil(() =&gt; ctx.needsCompaction),</span></span>
<span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">              Stream.runDrain,</span></span>
<span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">          }).pipe(</span></span>
<span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            Effect.onInterrupt(() =&gt;</span></span>
<span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">              Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">                aborted = true</span></span>
<span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">                if (!ctx.assistantMessage.error) {</span></span>
<span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">                  yield* halt(new DOMException(&quot;Aborted&quot;, &quot;AbortError&quot;))</span></span>
<span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">                }</span></span>
<span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">804</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">805</span><span class="source-line-text">            Effect.catchCauseIf(</span></span>
<span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">              (cause) =&gt; !Cause.hasInterruptsOnly(cause),</span></span>
<span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">              (cause) =&gt; Effect.fail(Cause.squash(cause)),</span></span>
<span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">            Effect.retry(</span></span>
<span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">              SessionRetry.policy({</span></span>
<span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">                provider: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">                parse,</span></span>
<span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">                set: (info) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">                  // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">                  const event = flags.experimentalEventSystem</span></span>
<span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">                    ? events.publish(SessionEvent.Retried, {</span></span>
<span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">                        sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">                        attempt: info.attempt,</span></span>
<span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">                        error: {</span></span>
<span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">                          message: info.message,</span></span>
<span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">                          isRetryable: true,</span></span>
<span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">                        },</span></span>
<span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">                        timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">                      })</span></span>
<span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">                    : Effect.void</span></span>
<span class="source-line"><span class="source-line-number">826</span><span class="source-line-text">                  return event.pipe(</span></span>
<span class="source-line"><span class="source-line-number">827</span><span class="source-line-text">                    Effect.andThen(</span></span>
<span class="source-line"><span class="source-line-number">828</span><span class="source-line-text">                      status.set(ctx.sessionID, {</span></span>
<span class="source-line"><span class="source-line-number">829</span><span class="source-line-text">                        type: &quot;retry&quot;,</span></span>
<span class="source-line"><span class="source-line-number">830</span><span class="source-line-text">                        attempt: info.attempt,</span></span>
<span class="source-line"><span class="source-line-number">831</span><span class="source-line-text">                        message: info.message,</span></span>
<span class="source-line"><span class="source-line-number">832</span><span class="source-line-text">                        action: info.action,</span></span>
<span class="source-line"><span class="source-line-number">833</span><span class="source-line-text">                        next: info.next,</span></span>
<span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">                      }),</span></span>
<span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">                    ),</span></span>
<span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">                  )</span></span>
<span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">            ),</span></span>
<span class="source-line"><span class="source-line-number">840</span><span class="source-line-text">            Effect.catch(halt),</span></span>
<span class="source-line"><span class="source-line-number">841</span><span class="source-line-text">            Effect.ensuring(cleanup()),</span></span>
<span class="source-line"><span class="source-line-number">842</span><span class="source-line-text">          )</span></span>
<span class="source-line"><span class="source-line-number">843</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">          if (ctx.needsCompaction) return &quot;compact&quot;</span></span>
<span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">          if (ctx.blocked || ctx.assistantMessage.error) return &quot;stop&quot;</span></span>
<span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">          return &quot;continue&quot;</span></span>
<span class="source-line"><span class="source-line-number">847</span><span class="source-line-text">        })</span></span></code></pre>
</details>


6. Policy / Interceptor  
   `SessionTools.resolve` 里的 `ctx.ask` 把权限检查插入工具执行上下文。来源：`packages/opencode/src/session/tools.ts:64-72`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:64-72</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span></code></pre>
</details>


## 10. 它如何和 Tool、Provider、Session、文件系统协作

### Session

Session 是 loop 的状态仓库。`prompt` 写入 user message；`runLoop` 每轮读取 messages；processor 写入 assistant text/tool parts。  
来源：`packages/opencode/src/session/prompt.ts:1116-1117`、`packages/opencode/src/session/prompt.ts:1252-1254`、`packages/opencode/src/session/processor.ts:618-685`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1116-1117</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1116</span><span class="source-line-text">      yield* sessions.updateMessage(info)</span></span>
<span class="source-line"><span class="source-line-number">1117</span><span class="source-line-text">      for (const part of parts) yield* sessions.updatePart(part)</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1252-1254</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1252</span><span class="source-line-text">          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)</span></span>
<span class="source-line"><span class="source-line-number">1253</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1254</span><span class="source-line-text">          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:618-685</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">618</span><span class="source-line-text">          case &quot;text-start&quot;:</span></span>
<span class="source-line"><span class="source-line-number">619</span><span class="source-line-text">            if (!ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">620</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">621</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">622</span><span class="source-line-text">                yield* events.publish(SessionEvent.Text.Started, {</span></span>
<span class="source-line"><span class="source-line-number">623</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">624</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">625</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">626</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">627</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">628</span><span class="source-line-text">            ctx.currentText = {</span></span>
<span class="source-line"><span class="source-line-number">629</span><span class="source-line-text">              id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">630</span><span class="source-line-text">              messageID: ctx.assistantMessage.id,</span></span>
<span class="source-line"><span class="source-line-number">631</span><span class="source-line-text">              sessionID: ctx.assistantMessage.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">632</span><span class="source-line-text">              type: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">633</span><span class="source-line-text">              text: &quot;&quot;,</span></span>
<span class="source-line"><span class="source-line-number">634</span><span class="source-line-text">              time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">635</span><span class="source-line-text">              metadata: value.providerMetadata,</span></span>
<span class="source-line"><span class="source-line-number">636</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">637</span><span class="source-line-text">            yield* session.updatePart(ctx.currentText)</span></span>
<span class="source-line"><span class="source-line-number">638</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">639</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">640</span><span class="source-line-text">          case &quot;text-delta&quot;:</span></span>
<span class="source-line"><span class="source-line-number">641</span><span class="source-line-text">            if (!ctx.currentText) return</span></span>
<span class="source-line"><span class="source-line-number">642</span><span class="source-line-text">            ctx.currentText.text += value.text</span></span>
<span class="source-line"><span class="source-line-number">643</span><span class="source-line-text">            if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata</span></span>
<span class="source-line"><span class="source-line-number">644</span><span class="source-line-text">            yield* session.updatePartDelta({</span></span>
<span class="source-line"><span class="source-line-number">645</span><span class="source-line-text">              sessionID: ctx.currentText.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">646</span><span class="source-line-text">              messageID: ctx.currentText.messageID,</span></span>
<span class="source-line"><span class="source-line-number">647</span><span class="source-line-text">              partID: ctx.currentText.id,</span></span>
<span class="source-line"><span class="source-line-number">648</span><span class="source-line-text">              field: &quot;text&quot;,</span></span>
<span class="source-line"><span class="source-line-number">649</span><span class="source-line-text">              delta: value.text,</span></span>
<span class="source-line"><span class="source-line-number">650</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">651</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">652</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">653</span><span class="source-line-text">          case &quot;text-end&quot;:</span></span>
<span class="source-line"><span class="source-line-number">654</span><span class="source-line-text">            if (!ctx.currentText) return</span></span>
<span class="source-line"><span class="source-line-number">655</span><span class="source-line-text">            // oxlint-disable-next-line no-self-assign -- reactivity trigger</span></span>
<span class="source-line"><span class="source-line-number">656</span><span class="source-line-text">            ctx.currentText.text = ctx.currentText.text</span></span>
<span class="source-line"><span class="source-line-number">657</span><span class="source-line-text">            ctx.currentText.text = (yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">658</span><span class="source-line-text">              &quot;experimental.text.complete&quot;,</span></span>
<span class="source-line"><span class="source-line-number">659</span><span class="source-line-text">              {</span></span>
<span class="source-line"><span class="source-line-number">660</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">661</span><span class="source-line-text">                messageID: ctx.assistantMessage.id,</span></span>
<span class="source-line"><span class="source-line-number">662</span><span class="source-line-text">                partID: ctx.currentText.id,</span></span>
<span class="source-line"><span class="source-line-number">663</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">664</span><span class="source-line-text">              { text: ctx.currentText.text },</span></span>
<span class="source-line"><span class="source-line-number">665</span><span class="source-line-text">            )).text</span></span>
<span class="source-line"><span class="source-line-number">666</span><span class="source-line-text">            if (!ctx.assistantMessage.summary) {</span></span>
<span class="source-line"><span class="source-line-number">667</span><span class="source-line-text">              // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">668</span><span class="source-line-text">              if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">669</span><span class="source-line-text">                yield* events.publish(SessionEvent.Text.Ended, {</span></span>
<span class="source-line"><span class="source-line-number">670</span><span class="source-line-text">                  sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">671</span><span class="source-line-text">                  text: ctx.currentText.text,</span></span>
<span class="source-line"><span class="source-line-number">672</span><span class="source-line-text">                  timestamp: DateTime.makeUnsafe(Date.now()),</span></span>
<span class="source-line"><span class="source-line-number">673</span><span class="source-line-text">                })</span></span>
<span class="source-line"><span class="source-line-number">674</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">675</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">676</span><span class="source-line-text">            {</span></span>
<span class="source-line"><span class="source-line-number">677</span><span class="source-line-text">              const end = Date.now()</span></span>
<span class="source-line"><span class="source-line-number">678</span><span class="source-line-text">              ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }</span></span>
<span class="source-line"><span class="source-line-number">679</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">680</span><span class="source-line-text">            if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata</span></span>
<span class="source-line"><span class="source-line-number">681</span><span class="source-line-text">            yield* session.updatePart(ctx.currentText)</span></span>
<span class="source-line"><span class="source-line-number">682</span><span class="source-line-text">            ctx.currentText = undefined</span></span>
<span class="source-line"><span class="source-line-number">683</span><span class="source-line-text">            return</span></span>
<span class="source-line"><span class="source-line-number">684</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">685</span><span class="source-line-text">          case &quot;finish&quot;:</span></span></code></pre>
</details>


### Tool

`SessionTools.resolve` 根据 agent/model/session 解析工具，并给每个工具提供 `ctx.metadata` 和 `ctx.ask`。工具执行结果通过 processor 的 `completeToolCall` 写回 tool part。  
来源：`packages/opencode/src/session/tools.ts:24-116`、`packages/opencode/src/session/processor.ts:169-193`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/tools.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/tools.ts:24-116</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">24</span><span class="source-line-text">export const resolve = Effect.fn(&quot;SessionTools.resolve&quot;)(function* (input: {</span></span>
<span class="source-line"><span class="source-line-number">25</span><span class="source-line-text">  agent: Agent.Info</span></span>
<span class="source-line"><span class="source-line-number">26</span><span class="source-line-text">  model: Provider.Model</span></span>
<span class="source-line"><span class="source-line-number">27</span><span class="source-line-text">  session: Session.Info</span></span>
<span class="source-line"><span class="source-line-number">28</span><span class="source-line-text">  processor: Pick&lt;SessionProcessor.Handle, &quot;message&quot; | &quot;updateToolCall&quot; | &quot;completeToolCall&quot;&gt;</span></span>
<span class="source-line"><span class="source-line-number">29</span><span class="source-line-text">  bypassAgentCheck: boolean</span></span>
<span class="source-line"><span class="source-line-number">30</span><span class="source-line-text">  messages: MessageV2.WithParts[]</span></span>
<span class="source-line"><span class="source-line-number">31</span><span class="source-line-text">  promptOps: TaskPromptOps</span></span>
<span class="source-line"><span class="source-line-number">32</span><span class="source-line-text">}) {</span></span>
<span class="source-line"><span class="source-line-number">33</span><span class="source-line-text">  using _ = log.time(&quot;resolveTools&quot;)</span></span>
<span class="source-line"><span class="source-line-number">34</span><span class="source-line-text">  const tools: Record&lt;string, AITool&gt; = {}</span></span>
<span class="source-line"><span class="source-line-number">35</span><span class="source-line-text">  const run = yield* EffectBridge.make()</span></span>
<span class="source-line"><span class="source-line-number">36</span><span class="source-line-text">  const plugin = yield* Plugin.Service</span></span>
<span class="source-line"><span class="source-line-number">37</span><span class="source-line-text">  const permission = yield* Permission.Service</span></span>
<span class="source-line"><span class="source-line-number">38</span><span class="source-line-text">  const registry = yield* ToolRegistry.Service</span></span>
<span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">  const mcp = yield* MCP.Service</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  const truncate = yield* Truncate.Service</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  const context = (args: Record&lt;string, unknown&gt;, options: ToolExecutionOptions): Tool.Context =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">    sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">    abort: options.abortSignal!,</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">    messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">    callID: options.toolCallId,</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">    extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck, promptOps: input.promptOps },</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">    agent: input.agent.name,</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">    messages: input.messages,</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">    metadata: (val) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">      input.processor.updateToolCall(options.toolCallId, (match) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">        if (![&quot;running&quot;, &quot;pending&quot;].includes(match.state.status)) return match</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text">        return {</span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">          ...match,</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">          state: {</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">            title: val.title,</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text">            metadata: val.metadata,</span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">            status: &quot;running&quot;,</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">            input: args,</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">            time: { start: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">61</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">62</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">63</span><span class="source-line-text">      }),</span></span>
<span class="source-line"><span class="source-line-number">64</span><span class="source-line-text">    ask: (req) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">65</span><span class="source-line-text">      permission</span></span>
<span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">        .ask({</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">          ...req,</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">          sessionID: input.session.id,</span></span>
<span class="source-line"><span class="source-line-number">69</span><span class="source-line-text">          tool: { messageID: input.processor.message.id, callID: options.toolCallId },</span></span>
<span class="source-line"><span class="source-line-number">70</span><span class="source-line-text">          ruleset: Permission.merge(input.agent.permission, input.session.permission ?? []),</span></span>
<span class="source-line"><span class="source-line-number">71</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">72</span><span class="source-line-text">        .pipe(Effect.orDie),</span></span>
<span class="source-line"><span class="source-line-number">73</span><span class="source-line-text">  })</span></span>
<span class="source-line"><span class="source-line-number">74</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">75</span><span class="source-line-text">  for (const item of yield* registry.tools({</span></span>
<span class="source-line"><span class="source-line-number">76</span><span class="source-line-text">    modelID: ModelID.make(input.model.api.id),</span></span>
<span class="source-line"><span class="source-line-number">77</span><span class="source-line-text">    providerID: input.model.providerID,</span></span>
<span class="source-line"><span class="source-line-number">78</span><span class="source-line-text">    agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">79</span><span class="source-line-text">  })) {</span></span>
<span class="source-line"><span class="source-line-number">80</span><span class="source-line-text">    const schema = ProviderTransform.schema(input.model, ToolJsonSchema.fromTool(item))</span></span>
<span class="source-line"><span class="source-line-number">81</span><span class="source-line-text">    tools[item.id] = tool({</span></span>
<span class="source-line"><span class="source-line-number">82</span><span class="source-line-text">      description: item.description,</span></span>
<span class="source-line"><span class="source-line-number">83</span><span class="source-line-text">      inputSchema: jsonSchema(schema),</span></span>
<span class="source-line"><span class="source-line-number">84</span><span class="source-line-text">      execute(args, options) {</span></span>
<span class="source-line"><span class="source-line-number">85</span><span class="source-line-text">        return run.promise(</span></span>
<span class="source-line"><span class="source-line-number">86</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">87</span><span class="source-line-text">            const ctx = context(args, options)</span></span>
<span class="source-line"><span class="source-line-number">88</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">89</span><span class="source-line-text">              &quot;tool.execute.before&quot;,</span></span>
<span class="source-line"><span class="source-line-number">90</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },</span></span>
<span class="source-line"><span class="source-line-number">91</span><span class="source-line-text">              { args },</span></span>
<span class="source-line"><span class="source-line-number">92</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">93</span><span class="source-line-text">            const result = yield* item.execute(args, ctx)</span></span>
<span class="source-line"><span class="source-line-number">94</span><span class="source-line-text">            const output = {</span></span>
<span class="source-line"><span class="source-line-number">95</span><span class="source-line-text">              ...result,</span></span>
<span class="source-line"><span class="source-line-number">96</span><span class="source-line-text">              attachments: result.attachments?.map((attachment) =&gt; ({</span></span>
<span class="source-line"><span class="source-line-number">97</span><span class="source-line-text">                ...attachment,</span></span>
<span class="source-line"><span class="source-line-number">98</span><span class="source-line-text">                id: PartID.ascending(),</span></span>
<span class="source-line"><span class="source-line-number">99</span><span class="source-line-text">                sessionID: ctx.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">100</span><span class="source-line-text">                messageID: input.processor.message.id,</span></span>
<span class="source-line"><span class="source-line-number">101</span><span class="source-line-text">              })),</span></span>
<span class="source-line"><span class="source-line-number">102</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">103</span><span class="source-line-text">            yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">104</span><span class="source-line-text">              &quot;tool.execute.after&quot;,</span></span>
<span class="source-line"><span class="source-line-number">105</span><span class="source-line-text">              { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },</span></span>
<span class="source-line"><span class="source-line-number">106</span><span class="source-line-text">              output,</span></span>
<span class="source-line"><span class="source-line-number">107</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">108</span><span class="source-line-text">            if (options.abortSignal?.aborted) {</span></span>
<span class="source-line"><span class="source-line-number">109</span><span class="source-line-text">              yield* input.processor.completeToolCall(options.toolCallId, output)</span></span>
<span class="source-line"><span class="source-line-number">110</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">111</span><span class="source-line-text">            return output</span></span>
<span class="source-line"><span class="source-line-number">112</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">113</span><span class="source-line-text">        )</span></span>
<span class="source-line"><span class="source-line-number">114</span><span class="source-line-text">      },</span></span>
<span class="source-line"><span class="source-line-number">115</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">116</span><span class="source-line-text">  }</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:169-193</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">169</span><span class="source-line-text">      const completeToolCall = Effect.fn(&quot;SessionProcessor.completeToolCall&quot;)(function* (</span></span>
<span class="source-line"><span class="source-line-number">170</span><span class="source-line-text">        toolCallID: string,</span></span>
<span class="source-line"><span class="source-line-number">171</span><span class="source-line-text">        output: {</span></span>
<span class="source-line"><span class="source-line-number">172</span><span class="source-line-text">          title: string</span></span>
<span class="source-line"><span class="source-line-number">173</span><span class="source-line-text">          metadata: Record&lt;string, any&gt;</span></span>
<span class="source-line"><span class="source-line-number">174</span><span class="source-line-text">          output: string</span></span>
<span class="source-line"><span class="source-line-number">175</span><span class="source-line-text">          attachments?: MessageV2.FilePart[]</span></span>
<span class="source-line"><span class="source-line-number">176</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">177</span><span class="source-line-text">      ) {</span></span>
<span class="source-line"><span class="source-line-number">178</span><span class="source-line-text">        const match = yield* readToolCall(toolCallID)</span></span>
<span class="source-line"><span class="source-line-number">179</span><span class="source-line-text">        if (!match || match.part.state.status !== &quot;running&quot;) return</span></span>
<span class="source-line"><span class="source-line-number">180</span><span class="source-line-text">        yield* session.updatePart({</span></span>
<span class="source-line"><span class="source-line-number">181</span><span class="source-line-text">          ...match.part,</span></span>
<span class="source-line"><span class="source-line-number">182</span><span class="source-line-text">          state: {</span></span>
<span class="source-line"><span class="source-line-number">183</span><span class="source-line-text">            status: &quot;completed&quot;,</span></span>
<span class="source-line"><span class="source-line-number">184</span><span class="source-line-text">            input: match.part.state.input,</span></span>
<span class="source-line"><span class="source-line-number">185</span><span class="source-line-text">            output: output.output,</span></span>
<span class="source-line"><span class="source-line-number">186</span><span class="source-line-text">            metadata: output.metadata,</span></span>
<span class="source-line"><span class="source-line-number">187</span><span class="source-line-text">            title: output.title,</span></span>
<span class="source-line"><span class="source-line-number">188</span><span class="source-line-text">            time: { start: match.part.state.time.start, end: Date.now() },</span></span>
<span class="source-line"><span class="source-line-number">189</span><span class="source-line-text">            attachments: output.attachments,</span></span>
<span class="source-line"><span class="source-line-number">190</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">        yield* settleToolCall(toolCallID)</span></span>
<span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">      })</span></span></code></pre>
</details>


### Provider / LLM

`LLM.StreamInput` 包含 model、agent、system、messages、tools；`LLM.stream` 使用 `streamText` 发送请求，并把 AI SDK fullStream 变成统一事件。  
来源：`packages/opencode/src/session/llm.ts:39-60`、`packages/opencode/src/session/llm.ts:402-493`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:39-60</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">39</span><span class="source-line-text">export type StreamInput = {</span></span>
<span class="source-line"><span class="source-line-number">40</span><span class="source-line-text">  user: MessageV2.User</span></span>
<span class="source-line"><span class="source-line-number">41</span><span class="source-line-text">  sessionID: string</span></span>
<span class="source-line"><span class="source-line-number">42</span><span class="source-line-text">  parentSessionID?: string</span></span>
<span class="source-line"><span class="source-line-number">43</span><span class="source-line-text">  model: Provider.Model</span></span>
<span class="source-line"><span class="source-line-number">44</span><span class="source-line-text">  agent: Agent.Info</span></span>
<span class="source-line"><span class="source-line-number">45</span><span class="source-line-text">  permission?: Permission.Ruleset</span></span>
<span class="source-line"><span class="source-line-number">46</span><span class="source-line-text">  system: string[]</span></span>
<span class="source-line"><span class="source-line-number">47</span><span class="source-line-text">  messages: ModelMessage[]</span></span>
<span class="source-line"><span class="source-line-number">48</span><span class="source-line-text">  small?: boolean</span></span>
<span class="source-line"><span class="source-line-number">49</span><span class="source-line-text">  tools: Record&lt;string, Tool&gt;</span></span>
<span class="source-line"><span class="source-line-number">50</span><span class="source-line-text">  retries?: number</span></span>
<span class="source-line"><span class="source-line-number">51</span><span class="source-line-text">  toolChoice?: &quot;auto&quot; | &quot;required&quot; | &quot;none&quot;</span></span>
<span class="source-line"><span class="source-line-number">52</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">53</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">54</span><span class="source-line-text">export type StreamRequest = StreamInput &amp; {</span></span>
<span class="source-line"><span class="source-line-number">55</span><span class="source-line-text">  abort: AbortSignal</span></span>
<span class="source-line"><span class="source-line-number">56</span><span class="source-line-text">}</span></span>
<span class="source-line"><span class="source-line-number">57</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">58</span><span class="source-line-text">export interface Interface {</span></span>
<span class="source-line"><span class="source-line-number">59</span><span class="source-line-text">  readonly stream: (input: StreamInput) =&gt; Stream.Stream&lt;LLMEvent, unknown&gt;</span></span>
<span class="source-line"><span class="source-line-number">60</span><span class="source-line-text">}</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/llm.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/llm.ts:402-493</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">402</span><span class="source-line-text">      return {</span></span>
<span class="source-line"><span class="source-line-number">403</span><span class="source-line-text">        type: &quot;ai-sdk&quot; as const,</span></span>
<span class="source-line"><span class="source-line-number">404</span><span class="source-line-text">        result: streamText({</span></span>
<span class="source-line"><span class="source-line-number">405</span><span class="source-line-text">          onError(error) {</span></span>
<span class="source-line"><span class="source-line-number">406</span><span class="source-line-text">            l.error(&quot;stream error&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">407</span><span class="source-line-text">              error,</span></span>
<span class="source-line"><span class="source-line-number">408</span><span class="source-line-text">            })</span></span>
<span class="source-line"><span class="source-line-number">409</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">410</span><span class="source-line-text">          async experimental_repairToolCall(failed) {</span></span>
<span class="source-line"><span class="source-line-number">411</span><span class="source-line-text">            const lower = failed.toolCall.toolName.toLowerCase()</span></span>
<span class="source-line"><span class="source-line-number">412</span><span class="source-line-text">            if (lower !== failed.toolCall.toolName &amp;&amp; sortedTools[lower]) {</span></span>
<span class="source-line"><span class="source-line-number">413</span><span class="source-line-text">              l.info(&quot;repairing tool call&quot;, {</span></span>
<span class="source-line"><span class="source-line-number">414</span><span class="source-line-text">                tool: failed.toolCall.toolName,</span></span>
<span class="source-line"><span class="source-line-number">415</span><span class="source-line-text">                repaired: lower,</span></span>
<span class="source-line"><span class="source-line-number">416</span><span class="source-line-text">              })</span></span>
<span class="source-line"><span class="source-line-number">417</span><span class="source-line-text">              return {</span></span>
<span class="source-line"><span class="source-line-number">418</span><span class="source-line-text">                ...failed.toolCall,</span></span>
<span class="source-line"><span class="source-line-number">419</span><span class="source-line-text">                toolName: lower,</span></span>
<span class="source-line"><span class="source-line-number">420</span><span class="source-line-text">              }</span></span>
<span class="source-line"><span class="source-line-number">421</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">422</span><span class="source-line-text">            return {</span></span>
<span class="source-line"><span class="source-line-number">423</span><span class="source-line-text">              ...failed.toolCall,</span></span>
<span class="source-line"><span class="source-line-number">424</span><span class="source-line-text">              input: JSON.stringify({</span></span>
<span class="source-line"><span class="source-line-number">425</span><span class="source-line-text">                tool: failed.toolCall.toolName,</span></span>
<span class="source-line"><span class="source-line-number">426</span><span class="source-line-text">                error: failed.error.message,</span></span>
<span class="source-line"><span class="source-line-number">427</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">428</span><span class="source-line-text">              toolName: &quot;invalid&quot;,</span></span>
<span class="source-line"><span class="source-line-number">429</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">430</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">431</span><span class="source-line-text">          temperature: params.temperature,</span></span>
<span class="source-line"><span class="source-line-number">432</span><span class="source-line-text">          topP: params.topP,</span></span>
<span class="source-line"><span class="source-line-number">433</span><span class="source-line-text">          topK: params.topK,</span></span>
<span class="source-line"><span class="source-line-number">434</span><span class="source-line-text">          providerOptions: ProviderTransform.providerOptions(input.model, params.options),</span></span>
<span class="source-line"><span class="source-line-number">435</span><span class="source-line-text">          activeTools: Object.keys(sortedTools).filter((x) =&gt; x !== &quot;invalid&quot;),</span></span>
<span class="source-line"><span class="source-line-number">436</span><span class="source-line-text">          tools: sortedTools,</span></span>
<span class="source-line"><span class="source-line-number">437</span><span class="source-line-text">          toolChoice: input.toolChoice,</span></span>
<span class="source-line"><span class="source-line-number">438</span><span class="source-line-text">          maxOutputTokens: params.maxOutputTokens,</span></span>
<span class="source-line"><span class="source-line-number">439</span><span class="source-line-text">          abortSignal: input.abort,</span></span>
<span class="source-line"><span class="source-line-number">440</span><span class="source-line-text">          headers: requestHeaders,</span></span>
<span class="source-line"><span class="source-line-number">441</span><span class="source-line-text">          maxRetries: input.retries ?? 0,</span></span>
<span class="source-line"><span class="source-line-number">442</span><span class="source-line-text">          messages,</span></span>
<span class="source-line"><span class="source-line-number">443</span><span class="source-line-text">          model: wrapLanguageModel({</span></span>
<span class="source-line"><span class="source-line-number">444</span><span class="source-line-text">            model: language,</span></span>
<span class="source-line"><span class="source-line-number">445</span><span class="source-line-text">            middleware: [</span></span>
<span class="source-line"><span class="source-line-number">446</span><span class="source-line-text">              {</span></span>
<span class="source-line"><span class="source-line-number">447</span><span class="source-line-text">                specificationVersion: &quot;v3&quot; as const,</span></span>
<span class="source-line"><span class="source-line-number">448</span><span class="source-line-text">                async transformParams(args) {</span></span>
<span class="source-line"><span class="source-line-number">449</span><span class="source-line-text">                  if (args.type === &quot;stream&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">450</span><span class="source-line-text">                    // @ts-expect-error</span></span>
<span class="source-line"><span class="source-line-number">451</span><span class="source-line-text">                    args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)</span></span>
<span class="source-line"><span class="source-line-number">452</span><span class="source-line-text">                  }</span></span>
<span class="source-line"><span class="source-line-number">453</span><span class="source-line-text">                  return args.params</span></span>
<span class="source-line"><span class="source-line-number">454</span><span class="source-line-text">                },</span></span>
<span class="source-line"><span class="source-line-number">455</span><span class="source-line-text">              },</span></span>
<span class="source-line"><span class="source-line-number">456</span><span class="source-line-text">            ],</span></span>
<span class="source-line"><span class="source-line-number">457</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">458</span><span class="source-line-text">          experimental_telemetry: {</span></span>
<span class="source-line"><span class="source-line-number">459</span><span class="source-line-text">            isEnabled: cfg.experimental?.openTelemetry,</span></span>
<span class="source-line"><span class="source-line-number">460</span><span class="source-line-text">            functionId: &quot;session.llm&quot;,</span></span>
<span class="source-line"><span class="source-line-number">461</span><span class="source-line-text">            tracer: telemetryTracer,</span></span>
<span class="source-line"><span class="source-line-number">462</span><span class="source-line-text">            metadata: {</span></span>
<span class="source-line"><span class="source-line-number">463</span><span class="source-line-text">              userId: cfg.username ?? &quot;unknown&quot;,</span></span>
<span class="source-line"><span class="source-line-number">464</span><span class="source-line-text">              sessionId: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">465</span><span class="source-line-text">            },</span></span>
<span class="source-line"><span class="source-line-number">466</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">467</span><span class="source-line-text">        }),</span></span>
<span class="source-line"><span class="source-line-number">468</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">469</span><span class="source-line-text">    })</span></span>
<span class="source-line"><span class="source-line-number">470</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">471</span><span class="source-line-text">    const stream: Interface[&quot;stream&quot;] = (input) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">472</span><span class="source-line-text">      Stream.scoped(</span></span>
<span class="source-line"><span class="source-line-number">473</span><span class="source-line-text">        Stream.unwrap(</span></span>
<span class="source-line"><span class="source-line-number">474</span><span class="source-line-text">          Effect.gen(function* () {</span></span>
<span class="source-line"><span class="source-line-number">475</span><span class="source-line-text">            const ctrl = yield* Effect.acquireRelease(</span></span>
<span class="source-line"><span class="source-line-number">476</span><span class="source-line-text">              Effect.sync(() =&gt; new AbortController()),</span></span>
<span class="source-line"><span class="source-line-number">477</span><span class="source-line-text">              (ctrl) =&gt; Effect.sync(() =&gt; ctrl.abort()),</span></span>
<span class="source-line"><span class="source-line-number">478</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">479</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">480</span><span class="source-line-text">            const result = yield* run({ ...input, abort: ctrl.signal })</span></span>
<span class="source-line"><span class="source-line-number">481</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">482</span><span class="source-line-text">            if (result.type === &quot;native&quot;) return result.stream</span></span>
<span class="source-line"><span class="source-line-number">483</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">484</span><span class="source-line-text">            const state = LLMAISDK.adapterState()</span></span>
<span class="source-line"><span class="source-line-number">485</span><span class="source-line-text">            return Stream.fromAsyncIterable(result.result.fullStream, (e) =&gt;</span></span>
<span class="source-line"><span class="source-line-number">486</span><span class="source-line-text">              e instanceof Error ? e : new Error(String(e)),</span></span>
<span class="source-line"><span class="source-line-number">487</span><span class="source-line-text">            ).pipe(</span></span>
<span class="source-line"><span class="source-line-number">488</span><span class="source-line-text">              Stream.mapEffect((event) =&gt; LLMAISDK.toLLMEvents(state, event)),</span></span>
<span class="source-line"><span class="source-line-number">489</span><span class="source-line-text">              Stream.flatMap((events) =&gt; Stream.fromIterable(events)),</span></span>
<span class="source-line"><span class="source-line-number">490</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">491</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">492</span><span class="source-line-text">        ),</span></span>
<span class="source-line"><span class="source-line-number">493</span><span class="source-line-text">      )</span></span></code></pre>
</details>


### 文件系统

Agent 核心循环本身不直接写文件。它通过 tools 间接调用文件系统，比如 edit/write/read/shell。样章只验证了 loop 到 tool 的通道；具体文件读写请继续读 `packages/opencode/src/tool/read.ts`、`edit.ts`、`write.ts`。  
不确定点：本章没有展开 `MessageV2.toModelMessagesEffect` 如何把文件/tool parts 转成 provider message，需要在后续 “Tool 调用系统” 或 “文件读写与代码修改” 章节补充。

## 11. 如果自己实现 mini agent，这一章对应什么代码

最小实现可以这样拆：

```ts
type ToolState = "pending" | "running" | "completed" | "error"

async function runLoop(sessionID: string) {
  while (true) {
    const messages = await sessionStore.loadMessages(sessionID)
    const latestUser = findLatestUser(messages)
    const tools = toolRegistry.resolve()
    const result = await llm.stream({ messages, tools })

    await processor.apply(sessionID, result)

    if (result.finish === "stop" && !hasUnresolvedToolCalls(sessionID)) break
    if (result.finish === "tool-calls") continue
  }
}
```

对照 OpenCode：

- `sessionStore.loadMessages` 对应 `MessageV2.filterCompactedEffect`。
- `findLatestUser` 对应 `MessageV2.latest`。
- `toolRegistry.resolve` 对应 `SessionTools.resolve`。
- `llm.stream` 对应 `LLM.stream`。
- `processor.apply` 对应 `SessionProcessor.process` / `handleEvent`。

先不要实现 LSP、compaction、subtask、plugin。先把 user -> llm -> tool -> result -> next loop 跑通。

## 12. 费曼复述区

### 12.1 请你用自己的话解释

用 3 句话解释：

1. `SessionPrompt.prompt` 做了什么？
2. `runLoop` 为什么要 while？
3. tool result 是如何让模型继续推理的？

### 12.2 如果解释不出来，说明卡在这里

常见卡点：

- 把 CLI handler 当成真正 agent runtime。
- 以为模型一次返回最终答案，不理解 tool call 会触发下一轮。
- 分不清 `SessionTools.resolve` 和具体 tool execute。
- 分不清 `LLM.stream` 和 `SessionProcessor.process`。

### 12.3 换一种说法再解释

OpenCode 的 agent loop 就像一个“带工具的消息驱动工作流”：

- session 保存事实。
- loop 选择下一步。
- LLM 产生行动建议。
- tool 执行动作。
- processor 把动作结果写回事实。
- loop 再读事实继续判断。

## 13. 练习题

### 入门题

1. 找到 `SessionPrompt.prompt`，写出它调用的三个关键动作。
2. 找到 `MessageV2.latest`，说明它为什么按 message id 判断最新消息。
3. 找到 `SessionProcessor.process`，说明它返回哪三种结果。

### 进阶题

1. 解释为什么 `lastAssistant.finish` 存在时，OpenCode 仍然可能继续 loop。
2. 解释 `SessionTools.resolve` 为什么需要 `processor`。
3. 解释 `ToolStatePending -> Running -> Completed/Error` 对 UI 有什么价值。

### 小实现题

用 TypeScript 写一个最小内存版 agent loop：

- messages 存在数组里。
- tool 只有 `echo`。
- 假 LLM 第一次返回 tool-call，第二次返回 text。
- loop 能执行 echo tool，并把结果喂给第二轮。

## 14. 源码追踪任务

1. 从 `packages/opencode/src/cli/cmd/run.ts:791-798` 追到 `SessionPrompt.prompt`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/cli/cmd/run.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/cli/cmd/run.ts:791-798</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">          const model = pick(args.model)</span></span>
  <span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          const result = await client.session.prompt({</span></span>
  <span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            agent,</span></span>
  <span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            model,</span></span>
  <span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">            variant: args.variant,</span></span>
  <span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">            parts: [...files, { type: &quot;text&quot;, text: message }],</span></span>
  <span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">          })</span></span></code></pre>
  </details>

2. 从 `packages/opencode/src/session/prompt.ts:1429-1440` 追到 `SessionProcessor.process`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1429-1440</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1429</span><span class="source-line-text">            const result = yield* handle.process({</span></span>
  <span class="source-line"><span class="source-line-number">1430</span><span class="source-line-text">              user: lastUser,</span></span>
  <span class="source-line"><span class="source-line-number">1431</span><span class="source-line-text">              agent,</span></span>
  <span class="source-line"><span class="source-line-number">1432</span><span class="source-line-text">              permission: session.permission,</span></span>
  <span class="source-line"><span class="source-line-number">1433</span><span class="source-line-text">              sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1434</span><span class="source-line-text">              parentSessionID: session.parentID,</span></span>
  <span class="source-line"><span class="source-line-number">1435</span><span class="source-line-text">              system,</span></span>
  <span class="source-line"><span class="source-line-number">1436</span><span class="source-line-text">              messages: [...modelMsgs, ...(isLastStep ? [{ role: &quot;assistant&quot; as const, content: MAX_STEPS }] : [])],</span></span>
  <span class="source-line"><span class="source-line-number">1437</span><span class="source-line-text">              tools,</span></span>
  <span class="source-line"><span class="source-line-number">1438</span><span class="source-line-text">              model,</span></span>
  <span class="source-line"><span class="source-line-number">1439</span><span class="source-line-text">              toolChoice: format.type === &quot;json_schema&quot; ? &quot;required&quot; : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">1440</span><span class="source-line-text">            })</span></span></code></pre>
  </details>

3. 从 `packages/opencode/src/session/processor.ts:789-795` 追到 `LLM.stream`。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/processor.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/processor.ts:789-795</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">            const stream = llm.stream(streamInput)</span></span>
  <span class="source-line"><span class="source-line-number">790</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">            yield* stream.pipe(</span></span>
  <span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">              Stream.tap((event) =&gt; handleEvent(event)),</span></span>
  <span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">              Stream.takeUntil(() =&gt; ctx.needsCompaction),</span></span>
  <span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">              Stream.runDrain,</span></span>
  <span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            )</span></span></code></pre>
  </details>

4. 从 `packages/opencode/src/session/llm/ai-sdk.ts:191-218` 追到 `SessionProcessor` 的 `tool-call` / `tool-result` case。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/llm/ai-sdk.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/llm/ai-sdk.ts:191-218</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">191</span><span class="source-line-text">    case &quot;tool-call&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">192</span><span class="source-line-text">      return Effect.sync(() =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">193</span><span class="source-line-text">        state.toolNames[event.toolCallId] = event.toolName</span></span>
  <span class="source-line"><span class="source-line-number">194</span><span class="source-line-text">        return [</span></span>
  <span class="source-line"><span class="source-line-number">195</span><span class="source-line-text">          LLMEvent.toolCall({</span></span>
  <span class="source-line"><span class="source-line-number">196</span><span class="source-line-text">            id: event.toolCallId,</span></span>
  <span class="source-line"><span class="source-line-number">197</span><span class="source-line-text">            name: event.toolName,</span></span>
  <span class="source-line"><span class="source-line-number">198</span><span class="source-line-text">            input: event.input,</span></span>
  <span class="source-line"><span class="source-line-number">199</span><span class="source-line-text">            providerExecuted: &quot;providerExecuted&quot; in event ? event.providerExecuted : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">200</span><span class="source-line-text">            providerMetadata: providerMetadata(event.providerMetadata),</span></span>
  <span class="source-line"><span class="source-line-number">201</span><span class="source-line-text">          }),</span></span>
  <span class="source-line"><span class="source-line-number">202</span><span class="source-line-text">        ]</span></span>
  <span class="source-line"><span class="source-line-number">203</span><span class="source-line-text">      })</span></span>
  <span class="source-line"><span class="source-line-number">204</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">205</span><span class="source-line-text">    case &quot;tool-result&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">206</span><span class="source-line-text">      return Effect.sync(() =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">207</span><span class="source-line-text">        const name = state.toolNames[event.toolCallId] ?? &quot;unknown&quot;</span></span>
  <span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">        delete state.toolNames[event.toolCallId]</span></span>
  <span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">        return [</span></span>
  <span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">          LLMEvent.toolResult({</span></span>
  <span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">            id: event.toolCallId,</span></span>
  <span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">            name,</span></span>
  <span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">            result: ToolResultValue.make(event.output),</span></span>
  <span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">            providerExecuted: &quot;providerExecuted&quot; in event ? event.providerExecuted : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">            providerMetadata: providerMetadata(event.providerMetadata),</span></span>
  <span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">          }),</span></span>
  <span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">        ]</span></span>
  <span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">      })</span></span></code></pre>
  </details>

5. 从 `SessionTools.resolve` 追一个具体工具，例如 `read` 或 `edit`。

## 15. 面试式自测

1. OpenCode 的 agent loop 和普通 chat completion 最大区别是什么？
2. 为什么 agent loop 需要持久化 message parts？
3. `SessionProcessor` 为什么不直接返回字符串？
4. OpenCode 如何处理模型返回了 tool call 的情况？
5. 什么情况下 loop 会返回 `compact`？
6. 为什么 tool 执行上下文里要有 `ask`？
7. 如果你要避免同一 session 并发跑两个 loop，你会怎么设计？
8. 如果模型不停调用同一个工具，OpenCode 有哪些防护迹象？提示：看 `doom_loop`。

## 16. 下一步阅读建议

建议下一章生成 “Tool 调用系统”。理由：Agent 核心循环里最难理解的下一跳就是 `SessionTools.resolve`，它连接模型 tool schema、具体工具执行、权限系统、plugin hook 和 tool result 回填。

下一步重点源码：

- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/tool/registry.ts`
- `packages/opencode/src/session/tools.ts`
- `packages/opencode/src/tool/read.ts`
- `packages/opencode/src/tool/edit.ts`


