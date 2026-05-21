---
title: "用户输入与会话"
description: "理解 CLI/API 输入如何变成 session、message 和 part，并被后续 agent loop 消费。"
sidebar:
  label: "02. 用户输入与会话"
  order: 2
---

<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">已完成</span></div>
  <div><strong>难度</strong>中等</div>
  <div><strong>预计阅读</strong>35 分钟</div>
  <div><strong>源文件</strong><a href="/markdown/02-session-message.md"><code>markdown/02-session-message.md</code></a></div>
</div>

## Agent 生成档案

- 章节 ID：`02-session-message`
- 章节摘要：理解 CLI/API 输入如何变成 session、message 和 part，并被后续 agent loop 消费。
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

<li><code>packages/opencode/src/server/routes/instance/httpapi/groups/session.ts</code></li>
<li><code>packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts</code></li>
<li><code>packages/opencode/src/session/prompt.ts</code></li>
<li><code>packages/opencode/src/session/session.ts</code></li>
<li><code>packages/opencode/src/session/message-v2.ts</code></li>

</ul>


> 对应模块：`study-output/02-opencode-function-outline.md` 的 “2.2 用户输入与会话”。  
> 主要源码：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts`、`handlers/session.ts`、`packages/opencode/src/session/prompt.ts`、`session.ts`、`message-v2.ts`。

## 0. 本章学习目标

你会学到：session API 的 payload 如何定义，HTTP handler 如何调用 `SessionPrompt`，`createUserMessage` 如何选择 agent/model 并解析 parts，`MessageV2` 如何建模 user/assistant/tool/text/file，用户输入如何被持久化为后续 agent loop 的上下文。

## 1. 一句话讲明白

用户输入与会话模块负责把外部请求变成稳定的内部事实：一个 session 下的 user message 和一组 message parts。来源：`packages/opencode/src/session/prompt.ts:689-731`、`packages/opencode/src/session/prompt.ts:1116-1230`。

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

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1116-1230</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1116</span><span class="source-line-text">      yield* sessions.updateMessage(info)</span></span>
<span class="source-line"><span class="source-line-number">1117</span><span class="source-line-text">      for (const part of parts) yield* sessions.updatePart(part)</span></span>
<span class="source-line"><span class="source-line-number">1118</span><span class="source-line-text">      const nextPrompt = parts.reduce(</span></span>
<span class="source-line"><span class="source-line-number">1119</span><span class="source-line-text">        (result, part) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">1120</span><span class="source-line-text">          if (part.type === &quot;text&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1121</span><span class="source-line-text">            if (part.synthetic) result.synthetic.push(part.text)</span></span>
<span class="source-line"><span class="source-line-number">1122</span><span class="source-line-text">            else result.text.push(part.text)</span></span>
<span class="source-line"><span class="source-line-number">1123</span><span class="source-line-text">            const reference = referencePromptMetadata(part.metadata?.reference)</span></span>
<span class="source-line"><span class="source-line-number">1124</span><span class="source-line-text">            if (reference) {</span></span>
<span class="source-line"><span class="source-line-number">1125</span><span class="source-line-text">              result.references.push(</span></span>
<span class="source-line"><span class="source-line-number">1126</span><span class="source-line-text">                new ReferenceAttachment({</span></span>
<span class="source-line"><span class="source-line-number">1127</span><span class="source-line-text">                  name: reference.name,</span></span>
<span class="source-line"><span class="source-line-number">1128</span><span class="source-line-text">                  kind: reference.kind,</span></span>
<span class="source-line"><span class="source-line-number">1129</span><span class="source-line-text">                  uri: reference.path ? pathToFileURL(reference.path).href : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1130</span><span class="source-line-text">                  repository: reference.repository,</span></span>
<span class="source-line"><span class="source-line-number">1131</span><span class="source-line-text">                  branch: reference.branch,</span></span>
<span class="source-line"><span class="source-line-number">1132</span><span class="source-line-text">                  target: reference.target,</span></span>
<span class="source-line"><span class="source-line-number">1133</span><span class="source-line-text">                  targetUri: reference.targetPath ? pathToFileURL(reference.targetPath).href : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1134</span><span class="source-line-text">                  problem: reference.problem,</span></span>
<span class="source-line"><span class="source-line-number">1135</span><span class="source-line-text">                  source: new Source({</span></span>
<span class="source-line"><span class="source-line-number">1136</span><span class="source-line-text">                    start: reference.source.start,</span></span>
<span class="source-line"><span class="source-line-number">1137</span><span class="source-line-text">                    end: reference.source.end,</span></span>
<span class="source-line"><span class="source-line-number">1138</span><span class="source-line-text">                    text: reference.source.value,</span></span>
<span class="source-line"><span class="source-line-number">1139</span><span class="source-line-text">                  }),</span></span>
<span class="source-line"><span class="source-line-number">1140</span><span class="source-line-text">                }),</span></span>
<span class="source-line"><span class="source-line-number">1141</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">1142</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1143</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1144</span><span class="source-line-text">          if (part.type === &quot;file&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1145</span><span class="source-line-text">            result.files.push(</span></span>
<span class="source-line"><span class="source-line-number">1146</span><span class="source-line-text">              new FileAttachment({</span></span>
<span class="source-line"><span class="source-line-number">1147</span><span class="source-line-text">                uri: part.url,</span></span>
<span class="source-line"><span class="source-line-number">1148</span><span class="source-line-text">                mime: part.mime,</span></span>
<span class="source-line"><span class="source-line-number">1149</span><span class="source-line-text">                name: part.filename,</span></span>
<span class="source-line"><span class="source-line-number">1150</span><span class="source-line-text">                source: part.source</span></span>
<span class="source-line"><span class="source-line-number">1151</span><span class="source-line-text">                  ? new Source({</span></span>
<span class="source-line"><span class="source-line-number">1152</span><span class="source-line-text">                      start: part.source.text.start,</span></span>
<span class="source-line"><span class="source-line-number">1153</span><span class="source-line-text">                      end: part.source.text.end,</span></span>
<span class="source-line"><span class="source-line-number">1154</span><span class="source-line-text">                      text: part.source.text.value,</span></span>
<span class="source-line"><span class="source-line-number">1155</span><span class="source-line-text">                    })</span></span>
<span class="source-line"><span class="source-line-number">1156</span><span class="source-line-text">                  : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1157</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">1158</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1159</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1160</span><span class="source-line-text">          if (part.type === &quot;agent&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1161</span><span class="source-line-text">            result.agents.push(</span></span>
<span class="source-line"><span class="source-line-number">1162</span><span class="source-line-text">              new AgentAttachment({</span></span>
<span class="source-line"><span class="source-line-number">1163</span><span class="source-line-text">                name: part.name,</span></span>
<span class="source-line"><span class="source-line-number">1164</span><span class="source-line-text">                source: part.source</span></span>
<span class="source-line"><span class="source-line-number">1165</span><span class="source-line-text">                  ? new Source({</span></span>
<span class="source-line"><span class="source-line-number">1166</span><span class="source-line-text">                      start: part.source.start,</span></span>
<span class="source-line"><span class="source-line-number">1167</span><span class="source-line-text">                      end: part.source.end,</span></span>
<span class="source-line"><span class="source-line-number">1168</span><span class="source-line-text">                      text: part.source.value,</span></span>
<span class="source-line"><span class="source-line-number">1169</span><span class="source-line-text">                    })</span></span>
<span class="source-line"><span class="source-line-number">1170</span><span class="source-line-text">                  : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1171</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">1172</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1173</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1174</span><span class="source-line-text">          return result</span></span>
<span class="source-line"><span class="source-line-number">1175</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">1176</span><span class="source-line-text">        {</span></span>
<span class="source-line"><span class="source-line-number">1177</span><span class="source-line-text">          text: [] as string[],</span></span>
<span class="source-line"><span class="source-line-number">1178</span><span class="source-line-text">          files: [] as FileAttachment[],</span></span>
<span class="source-line"><span class="source-line-number">1179</span><span class="source-line-text">          agents: [] as AgentAttachment[],</span></span>
<span class="source-line"><span class="source-line-number">1180</span><span class="source-line-text">          references: [] as ReferenceAttachment[],</span></span>
<span class="source-line"><span class="source-line-number">1181</span><span class="source-line-text">          synthetic: [] as string[],</span></span>
<span class="source-line"><span class="source-line-number">1182</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">1183</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">1184</span><span class="source-line-text">      // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">1185</span><span class="source-line-text">      if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">1186</span><span class="source-line-text">        yield* events.publish(SessionEvent.Prompted, {</span></span>
<span class="source-line"><span class="source-line-number">1187</span><span class="source-line-text">          sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1188</span><span class="source-line-text">          timestamp: DateTime.makeUnsafe(info.time.created),</span></span>
<span class="source-line"><span class="source-line-number">1189</span><span class="source-line-text">          prompt: {</span></span>
<span class="source-line"><span class="source-line-number">1190</span><span class="source-line-text">            text: nextPrompt.text.join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">1191</span><span class="source-line-text">            files: nextPrompt.files,</span></span>
<span class="source-line"><span class="source-line-number">1192</span><span class="source-line-text">            agents: nextPrompt.agents,</span></span>
<span class="source-line"><span class="source-line-number">1193</span><span class="source-line-text">            references: nextPrompt.references,</span></span>
<span class="source-line"><span class="source-line-number">1194</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">1195</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">1196</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1197</span><span class="source-line-text">      for (const text of nextPrompt.synthetic) {</span></span>
<span class="source-line"><span class="source-line-number">1198</span><span class="source-line-text">        // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">1199</span><span class="source-line-text">        if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">1200</span><span class="source-line-text">          yield* events.publish(SessionEvent.Synthetic, {</span></span>
<span class="source-line"><span class="source-line-number">1201</span><span class="source-line-text">            sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1202</span><span class="source-line-text">            timestamp: DateTime.makeUnsafe(info.time.created),</span></span>
<span class="source-line"><span class="source-line-number">1203</span><span class="source-line-text">            text,</span></span>
<span class="source-line"><span class="source-line-number">1204</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1205</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">1206</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1207</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1208</span><span class="source-line-text">      return { info, parts }</span></span>
<span class="source-line"><span class="source-line-number">1209</span><span class="source-line-text">    }, Effect.scoped)</span></span>
<span class="source-line"><span class="source-line-number">1210</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">1211</span><span class="source-line-text">    const prompt: (input: PromptInput) =&gt; Effect.Effect&lt;MessageV2.WithParts, Image.Error&gt; = Effect.fn(</span></span>
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
<span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span>
<span class="source-line"><span class="source-line-number">1230</span><span class="source-line-text">    })</span></span></code></pre>
</details>


## 2. 它在 OpenCode agent 中的位置

CLI/API 只提供输入，agent loop 只消费消息历史。中间的桥就是 session/message 层：它把文本、文件、agent mention、MCP resource、权限覆盖、模型选择等都整理成统一结构。来源：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66-68`、`packages/opencode/src/session/message-v2.ts:327-380`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/groups/session.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66-68</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">export const PromptPayload = Schema.Struct(Struct.omit(SessionPrompt.PromptInput.fields, [&quot;sessionID&quot;]))</span></span>
<span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">export const CommandPayload = Schema.Struct(Struct.omit(SessionPrompt.CommandInput.fields, [&quot;sessionID&quot;]))</span></span>
<span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">export const ShellPayload = Schema.Struct(Struct.omit(SessionPrompt.ShellInput.fields, [&quot;sessionID&quot;]))</span></span></code></pre>
</details>

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/message-v2.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/message-v2.ts:327-380</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">export const User = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">  ...messageBase,</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  role: Schema.Literal(&quot;user&quot;),</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">  time: Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">    created: NonNegativeInt,</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">  format: Schema.optional(Format),</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">  summary: Schema.optional(</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">    Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">      title: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">      body: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">      diffs: Schema.Array(Snapshot.FileDiff),</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">    }),</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">  ),</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">  agent: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">  model: Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">    providerID: ProviderID,</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text">    modelID: ModelID,</span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">    variant: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">  system: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">}).annotate({ identifier: &quot;UserMessage&quot; })</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">export type User = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof User&gt;&gt;</span></span>
<span class="source-line"><span class="source-line-number">351</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">export const Part = Schema.Union([</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">  TextPart,</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">  SubtaskPart,</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">  ReasoningPart,</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">  FilePart,</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">  ToolPart,</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">  StepStartPart,</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">  StepFinishPart,</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">  SnapshotPart,</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">  PatchPart,</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">  AgentPart,</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">  RetryPart,</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">  CompactionPart,</span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">]).annotate({ discriminator: &quot;type&quot;, identifier: &quot;Part&quot; })</span></span>
<span class="source-line"><span class="source-line-number">366</span><span class="source-line-text">export type Part =</span></span>
<span class="source-line"><span class="source-line-number">367</span><span class="source-line-text">  | TextPart</span></span>
<span class="source-line"><span class="source-line-number">368</span><span class="source-line-text">  | SubtaskPart</span></span>
<span class="source-line"><span class="source-line-number">369</span><span class="source-line-text">  | ReasoningPart</span></span>
<span class="source-line"><span class="source-line-number">370</span><span class="source-line-text">  | FilePart</span></span>
<span class="source-line"><span class="source-line-number">371</span><span class="source-line-text">  | ToolPart</span></span>
<span class="source-line"><span class="source-line-number">372</span><span class="source-line-text">  | StepStartPart</span></span>
<span class="source-line"><span class="source-line-number">373</span><span class="source-line-text">  | StepFinishPart</span></span>
<span class="source-line"><span class="source-line-number">374</span><span class="source-line-text">  | SnapshotPart</span></span>
<span class="source-line"><span class="source-line-number">375</span><span class="source-line-text">  | PatchPart</span></span>
<span class="source-line"><span class="source-line-number">376</span><span class="source-line-text">  | AgentPart</span></span>
<span class="source-line"><span class="source-line-number">377</span><span class="source-line-text">  | RetryPart</span></span>
<span class="source-line"><span class="source-line-number">378</span><span class="source-line-text">  | CompactionPart</span></span>
<span class="source-line"><span class="source-line-number">379</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">380</span><span class="source-line-text">const AssistantErrorSchema = Schema.Union([</span></span></code></pre>
</details>


## 3. 生活类比

把 session 看成一份项目档案，message 是档案里的每次沟通记录，part 是沟通记录里的附件、正文、工具结果或系统补充。agent 每轮工作前都先读档案，而不是只听最后一句话。

## 4. Java 开发者类比

- `Session.Info` 类似会话 aggregate。
- `MessageV2.User` / `Assistant` 类似消息实体。
- `Part` 是 message 的子实体集合，像 `List<MessagePart>`。
- `SessionPrompt.prompt` 是 Application Service。
- `groups/session.ts` 是 Controller 的 request/response schema。

## 5. 最小源码路径

1. `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66-68`：用 `Struct.omit` 从 `SessionPrompt` 输入类型派生 API payload。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/groups/session.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66-68</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">export const PromptPayload = Schema.Struct(Struct.omit(SessionPrompt.PromptInput.fields, [&quot;sessionID&quot;]))</span></span>
  <span class="source-line"><span class="source-line-number">67</span><span class="source-line-text">export const CommandPayload = Schema.Struct(Struct.omit(SessionPrompt.CommandInput.fields, [&quot;sessionID&quot;]))</span></span>
  <span class="source-line"><span class="source-line-number">68</span><span class="source-line-text">export const ShellPayload = Schema.Struct(Struct.omit(SessionPrompt.ShellInput.fields, [&quot;sessionID&quot;]))</span></span></code></pre>
  </details>

2. `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-324`：定义 `session.prompt` endpoint。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/groups/session.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-324</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">        HttpApiEndpoint.post(&quot;prompt&quot;, SessionPaths.prompt, {</span></span>
  <span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">          params: { sessionID: SessionID },</span></span>
  <span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">          query: WorkspaceRoutingQuery,</span></span>
  <span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">          payload: PromptPayload,</span></span>
  <span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">          success: described(MessageV2.WithParts, &quot;Created message&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">          error: [HttpApiError.BadRequest, ApiNotFoundError],</span></span>
  <span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        }).annotateMerge(</span></span>
  <span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          OpenApi.annotations({</span></span>
  <span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">            identifier: &quot;session.prompt&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">            summary: &quot;Send message&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">            description: &quot;Create and send a new message to a session, streaming the AI response.&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">          }),</span></span>
  <span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">        ),</span></span></code></pre>
  </details>

3. `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-290`：handler 调用 `promptSvc.prompt`。

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

4. `packages/opencode/src/session/prompt.ts:689-731`：创建 user message info。

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

5. `packages/opencode/src/session/prompt.ts:788-1085`：解析 file/resource/agent parts。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:788-1085</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">788</span><span class="source-line-text">      const resolvePart: (part: PromptInput[&quot;parts&quot;][number]) =&gt; Effect.Effect&lt;Draft&lt;MessageV2.Part&gt;[]&gt; = Effect.fn(</span></span>
  <span class="source-line"><span class="source-line-number">789</span><span class="source-line-text">        &quot;SessionPrompt.resolveUserPart&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">790</span><span class="source-line-text">      )(function* (part) {</span></span>
  <span class="source-line"><span class="source-line-number">791</span><span class="source-line-text">        if (part.type === &quot;file&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">792</span><span class="source-line-text">          if (part.source?.type === &quot;resource&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">793</span><span class="source-line-text">            const { clientName, uri } = part.source</span></span>
  <span class="source-line"><span class="source-line-number">794</span><span class="source-line-text">            log.info(&quot;mcp resource&quot;, { clientName, uri, mime: part.mime })</span></span>
  <span class="source-line"><span class="source-line-number">795</span><span class="source-line-text">            const pieces: Draft&lt;MessageV2.Part&gt;[] = [</span></span>
  <span class="source-line"><span class="source-line-number">796</span><span class="source-line-text">              {</span></span>
  <span class="source-line"><span class="source-line-number">797</span><span class="source-line-text">                messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">798</span><span class="source-line-text">                sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">799</span><span class="source-line-text">                type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">800</span><span class="source-line-text">                synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">801</span><span class="source-line-text">                text: `Reading MCP resource: ${part.filename} (${uri})`,</span></span>
  <span class="source-line"><span class="source-line-number">802</span><span class="source-line-text">              },</span></span>
  <span class="source-line"><span class="source-line-number">803</span><span class="source-line-text">            ]</span></span>
  <span class="source-line"><span class="source-line-number">804</span><span class="source-line-text">            const exit = yield* mcp.readResource(clientName, uri).pipe(Effect.exit)</span></span>
  <span class="source-line"><span class="source-line-number">805</span><span class="source-line-text">            if (Exit.isSuccess(exit)) {</span></span>
  <span class="source-line"><span class="source-line-number">806</span><span class="source-line-text">              const content = exit.value</span></span>
  <span class="source-line"><span class="source-line-number">807</span><span class="source-line-text">              if (!content) throw new Error(`Resource not found: ${clientName}/${uri}`)</span></span>
  <span class="source-line"><span class="source-line-number">808</span><span class="source-line-text">              const items = Array.isArray(content.contents) ? content.contents : [content.contents]</span></span>
  <span class="source-line"><span class="source-line-number">809</span><span class="source-line-text">              for (const c of items) {</span></span>
  <span class="source-line"><span class="source-line-number">810</span><span class="source-line-text">                if (&quot;text&quot; in c &amp;&amp; c.text) {</span></span>
  <span class="source-line"><span class="source-line-number">811</span><span class="source-line-text">                  pieces.push({</span></span>
  <span class="source-line"><span class="source-line-number">812</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">813</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">814</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">815</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">816</span><span class="source-line-text">                    text: c.text,</span></span>
  <span class="source-line"><span class="source-line-number">817</span><span class="source-line-text">                  })</span></span>
  <span class="source-line"><span class="source-line-number">818</span><span class="source-line-text">                } else if (&quot;blob&quot; in c &amp;&amp; c.blob) {</span></span>
  <span class="source-line"><span class="source-line-number">819</span><span class="source-line-text">                  const mime = &quot;mimeType&quot; in c ? c.mimeType : part.mime</span></span>
  <span class="source-line"><span class="source-line-number">820</span><span class="source-line-text">                  pieces.push({</span></span>
  <span class="source-line"><span class="source-line-number">821</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">822</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">823</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">824</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">825</span><span class="source-line-text">                    text: `[Binary content: ${mime}]`,</span></span>
  <span class="source-line"><span class="source-line-number">826</span><span class="source-line-text">                  })</span></span>
  <span class="source-line"><span class="source-line-number">827</span><span class="source-line-text">                }</span></span>
  <span class="source-line"><span class="source-line-number">828</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">829</span><span class="source-line-text">              pieces.push({ ...part, messageID: info.id, sessionID: input.sessionID })</span></span>
  <span class="source-line"><span class="source-line-number">830</span><span class="source-line-text">            } else {</span></span>
  <span class="source-line"><span class="source-line-number">831</span><span class="source-line-text">              const error = Cause.squash(exit.cause)</span></span>
  <span class="source-line"><span class="source-line-number">832</span><span class="source-line-text">              log.error(&quot;failed to read MCP resource&quot;, { error, clientName, uri })</span></span>
  <span class="source-line"><span class="source-line-number">833</span><span class="source-line-text">              const message = error instanceof Error ? error.message : String(error)</span></span>
  <span class="source-line"><span class="source-line-number">834</span><span class="source-line-text">              pieces.push({</span></span>
  <span class="source-line"><span class="source-line-number">835</span><span class="source-line-text">                messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">836</span><span class="source-line-text">                sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">837</span><span class="source-line-text">                type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">838</span><span class="source-line-text">                synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">839</span><span class="source-line-text">                text: `Failed to read MCP resource ${part.filename}: ${message}`,</span></span>
  <span class="source-line"><span class="source-line-number">840</span><span class="source-line-text">              })</span></span>
  <span class="source-line"><span class="source-line-number">841</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">842</span><span class="source-line-text">            return pieces</span></span>
  <span class="source-line"><span class="source-line-number">843</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">844</span><span class="source-line-text">          const url = new URL(part.url)</span></span>
  <span class="source-line"><span class="source-line-number">845</span><span class="source-line-text">          switch (url.protocol) {</span></span>
  <span class="source-line"><span class="source-line-number">846</span><span class="source-line-text">            case &quot;data:&quot;:</span></span>
  <span class="source-line"><span class="source-line-number">847</span><span class="source-line-text">              if (part.mime === &quot;text/plain&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">848</span><span class="source-line-text">                return [</span></span>
  <span class="source-line"><span class="source-line-number">849</span><span class="source-line-text">                  {</span></span>
  <span class="source-line"><span class="source-line-number">850</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">851</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">852</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">853</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">854</span><span class="source-line-text">                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,</span></span>
  <span class="source-line"><span class="source-line-number">855</span><span class="source-line-text">                  },</span></span>
  <span class="source-line"><span class="source-line-number">856</span><span class="source-line-text">                  {</span></span>
  <span class="source-line"><span class="source-line-number">857</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">858</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">859</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">860</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">861</span><span class="source-line-text">                    text: decodeDataUrl(part.url),</span></span>
  <span class="source-line"><span class="source-line-number">862</span><span class="source-line-text">                  },</span></span>
  <span class="source-line"><span class="source-line-number">863</span><span class="source-line-text">                  { ...part, messageID: info.id, sessionID: input.sessionID },</span></span>
  <span class="source-line"><span class="source-line-number">864</span><span class="source-line-text">                ]</span></span>
  <span class="source-line"><span class="source-line-number">865</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">866</span><span class="source-line-text">              break</span></span>
  <span class="source-line"><span class="source-line-number">867</span><span class="source-line-text">            case &quot;file:&quot;: {</span></span>
  <span class="source-line"><span class="source-line-number">868</span><span class="source-line-text">              log.info(&quot;file&quot;, { mime: part.mime })</span></span>
  <span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">              const filepath = fileURLToPath(part.url)</span></span>
  <span class="source-line"><span class="source-line-number">870</span><span class="source-line-text">              const referenceContext = yield* referenceContextFromFilePart(part, filepath)</span></span>
  <span class="source-line"><span class="source-line-number">871</span><span class="source-line-text">              const mime = (yield* fsys.isDir(filepath)) ? &quot;application/x-directory&quot; : part.mime</span></span>
  <span class="source-line"><span class="source-line-number">872</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">873</span><span class="source-line-text">              const { read } = yield* registry.named()</span></span>
  <span class="source-line"><span class="source-line-number">874</span><span class="source-line-text">              const execRead = (args: Parameters&lt;typeof read.execute&gt;[0], extra?: Tool.Context[&quot;extra&quot;]) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">875</span><span class="source-line-text">                const controller = new AbortController()</span></span>
  <span class="source-line"><span class="source-line-number">876</span><span class="source-line-text">                return read</span></span>
  <span class="source-line"><span class="source-line-number">877</span><span class="source-line-text">                  .execute(args, {</span></span>
  <span class="source-line"><span class="source-line-number">878</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">879</span><span class="source-line-text">                    abort: controller.signal,</span></span>
  <span class="source-line"><span class="source-line-number">880</span><span class="source-line-text">                    agent: input.agent!,</span></span>
  <span class="source-line"><span class="source-line-number">881</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">882</span><span class="source-line-text">                    extra: { bypassCwdCheck: true, ...extra },</span></span>
  <span class="source-line"><span class="source-line-number">883</span><span class="source-line-text">                    messages: [],</span></span>
  <span class="source-line"><span class="source-line-number">884</span><span class="source-line-text">                    metadata: () =&gt; Effect.void,</span></span>
  <span class="source-line"><span class="source-line-number">885</span><span class="source-line-text">                    ask: () =&gt; Effect.void,</span></span>
  <span class="source-line"><span class="source-line-number">886</span><span class="source-line-text">                  })</span></span>
  <span class="source-line"><span class="source-line-number">887</span><span class="source-line-text">                  .pipe(Effect.onInterrupt(() =&gt; Effect.sync(() =&gt; controller.abort())))</span></span>
  <span class="source-line"><span class="source-line-number">888</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">889</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">890</span><span class="source-line-text">              if (mime === &quot;text/plain&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">891</span><span class="source-line-text">                let offset: number | undefined</span></span>
  <span class="source-line"><span class="source-line-number">892</span><span class="source-line-text">                let limit: number | undefined</span></span>
  <span class="source-line"><span class="source-line-number">893</span><span class="source-line-text">                const range = { start: url.searchParams.get(&quot;start&quot;), end: url.searchParams.get(&quot;end&quot;) }</span></span>
  <span class="source-line"><span class="source-line-number">894</span><span class="source-line-text">                if (range.start != null) {</span></span>
  <span class="source-line"><span class="source-line-number">895</span><span class="source-line-text">                  const filePathURI = part.url.split(&quot;?&quot;)[0]</span></span>
  <span class="source-line"><span class="source-line-number">896</span><span class="source-line-text">                  let start = parseInt(range.start)</span></span>
  <span class="source-line"><span class="source-line-number">897</span><span class="source-line-text">                  let end = range.end ? parseInt(range.end) : undefined</span></span>
  <span class="source-line"><span class="source-line-number">898</span><span class="source-line-text">                  if (start === end) {</span></span>
  <span class="source-line"><span class="source-line-number">899</span><span class="source-line-text">                    const symbols = yield* lsp.documentSymbol(filePathURI).pipe(Effect.catch(() =&gt; Effect.succeed([])))</span></span>
  <span class="source-line"><span class="source-line-number">900</span><span class="source-line-text">                    for (const symbol of symbols) {</span></span>
  <span class="source-line"><span class="source-line-number">901</span><span class="source-line-text">                      let r: LSP.Range | undefined</span></span>
  <span class="source-line"><span class="source-line-number">902</span><span class="source-line-text">                      if (&quot;range&quot; in symbol) r = symbol.range</span></span>
  <span class="source-line"><span class="source-line-number">903</span><span class="source-line-text">                      else if (&quot;location&quot; in symbol) r = symbol.location.range</span></span>
  <span class="source-line"><span class="source-line-number">904</span><span class="source-line-text">                      if (r?.start?.line &amp;&amp; r?.start?.line === start) {</span></span>
  <span class="source-line"><span class="source-line-number">905</span><span class="source-line-text">                        start = r.start.line</span></span>
  <span class="source-line"><span class="source-line-number">906</span><span class="source-line-text">                        end = r?.end?.line ?? start</span></span>
  <span class="source-line"><span class="source-line-number">907</span><span class="source-line-text">                        break</span></span>
  <span class="source-line"><span class="source-line-number">908</span><span class="source-line-text">                      }</span></span>
  <span class="source-line"><span class="source-line-number">909</span><span class="source-line-text">                    }</span></span>
  <span class="source-line"><span class="source-line-number">910</span><span class="source-line-text">                  }</span></span>
  <span class="source-line"><span class="source-line-number">911</span><span class="source-line-text">                  offset = Math.max(start, 1)</span></span>
  <span class="source-line"><span class="source-line-number">912</span><span class="source-line-text">                  if (end) limit = end - (offset - 1)</span></span>
  <span class="source-line"><span class="source-line-number">913</span><span class="source-line-text">                }</span></span>
  <span class="source-line"><span class="source-line-number">914</span><span class="source-line-text">                const args = { filePath: filepath, offset, limit }</span></span>
  <span class="source-line"><span class="source-line-number">915</span><span class="source-line-text">                const pieces: Draft&lt;MessageV2.Part&gt;[] = [</span></span>
  <span class="source-line"><span class="source-line-number">916</span><span class="source-line-text">                  ...(referenceContext</span></span>
  <span class="source-line"><span class="source-line-number">917</span><span class="source-line-text">                    ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }]</span></span>
  <span class="source-line"><span class="source-line-number">918</span><span class="source-line-text">                    : []),</span></span>
  <span class="source-line"><span class="source-line-number">919</span><span class="source-line-text">                  {</span></span>
  <span class="source-line"><span class="source-line-number">920</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">921</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">922</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">923</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">924</span><span class="source-line-text">                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,</span></span>
  <span class="source-line"><span class="source-line-number">925</span><span class="source-line-text">                  },</span></span>
  <span class="source-line"><span class="source-line-number">926</span><span class="source-line-text">                ]</span></span>
  <span class="source-line"><span class="source-line-number">927</span><span class="source-line-text">                const exit = yield* provider.getModel(info.model.providerID, info.model.modelID).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">928</span><span class="source-line-text">                  Effect.flatMap((mdl) =&gt; execRead(args, { model: mdl })),</span></span>
  <span class="source-line"><span class="source-line-number">929</span><span class="source-line-text">                  Effect.exit,</span></span>
  <span class="source-line"><span class="source-line-number">930</span><span class="source-line-text">                )</span></span>
  <span class="source-line"><span class="source-line-number">931</span><span class="source-line-text">                if (Exit.isSuccess(exit)) {</span></span>
  <span class="source-line"><span class="source-line-number">932</span><span class="source-line-text">                  const result = exit.value</span></span>
  <span class="source-line"><span class="source-line-number">933</span><span class="source-line-text">                  pieces.push({</span></span>
  <span class="source-line"><span class="source-line-number">934</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">935</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">936</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">937</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">938</span><span class="source-line-text">                    text: result.output,</span></span>
  <span class="source-line"><span class="source-line-number">939</span><span class="source-line-text">                  })</span></span>
  <span class="source-line"><span class="source-line-number">940</span><span class="source-line-text">                  if (result.attachments?.length) {</span></span>
  <span class="source-line"><span class="source-line-number">941</span><span class="source-line-text">                    pieces.push(</span></span>
  <span class="source-line"><span class="source-line-number">942</span><span class="source-line-text">                      ...result.attachments.map((a) =&gt; ({</span></span>
  <span class="source-line"><span class="source-line-number">943</span><span class="source-line-text">                        ...a,</span></span>
  <span class="source-line"><span class="source-line-number">944</span><span class="source-line-text">                        synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">945</span><span class="source-line-text">                        filename: a.filename ?? part.filename,</span></span>
  <span class="source-line"><span class="source-line-number">946</span><span class="source-line-text">                        messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">947</span><span class="source-line-text">                        sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">948</span><span class="source-line-text">                      })),</span></span>
  <span class="source-line"><span class="source-line-number">949</span><span class="source-line-text">                    )</span></span>
  <span class="source-line"><span class="source-line-number">950</span><span class="source-line-text">                  } else {</span></span>
  <span class="source-line"><span class="source-line-number">951</span><span class="source-line-text">                    pieces.push({ ...part, mime, messageID: info.id, sessionID: input.sessionID })</span></span>
  <span class="source-line"><span class="source-line-number">952</span><span class="source-line-text">                  }</span></span>
  <span class="source-line"><span class="source-line-number">953</span><span class="source-line-text">                } else {</span></span>
  <span class="source-line"><span class="source-line-number">954</span><span class="source-line-text">                  const error = Cause.squash(exit.cause)</span></span>
  <span class="source-line"><span class="source-line-number">955</span><span class="source-line-text">                  log.error(&quot;failed to read file&quot;, { error })</span></span>
  <span class="source-line"><span class="source-line-number">956</span><span class="source-line-text">                  const message = error instanceof Error ? error.message : String(error)</span></span>
  <span class="source-line"><span class="source-line-number">957</span><span class="source-line-text">                  yield* bus.publish(Session.Event.Error, {</span></span>
  <span class="source-line"><span class="source-line-number">958</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">959</span><span class="source-line-text">                    error: new NamedError.Unknown({ message }).toObject(),</span></span>
  <span class="source-line"><span class="source-line-number">960</span><span class="source-line-text">                  })</span></span>
  <span class="source-line"><span class="source-line-number">961</span><span class="source-line-text">                  pieces.push({</span></span>
  <span class="source-line"><span class="source-line-number">962</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">963</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">964</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">965</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">966</span><span class="source-line-text">                    text: `Read tool failed to read ${filepath} with the following error: ${message}`,</span></span>
  <span class="source-line"><span class="source-line-number">967</span><span class="source-line-text">                  })</span></span>
  <span class="source-line"><span class="source-line-number">968</span><span class="source-line-text">                }</span></span>
  <span class="source-line"><span class="source-line-number">969</span><span class="source-line-text">                return pieces</span></span>
  <span class="source-line"><span class="source-line-number">970</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">971</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">972</span><span class="source-line-text">              if (mime === &quot;application/x-directory&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">973</span><span class="source-line-text">                const args = { filePath: filepath }</span></span>
  <span class="source-line"><span class="source-line-number">974</span><span class="source-line-text">                const exit = yield* execRead(args).pipe(Effect.exit)</span></span>
  <span class="source-line"><span class="source-line-number">975</span><span class="source-line-text">                if (Exit.isFailure(exit)) {</span></span>
  <span class="source-line"><span class="source-line-number">976</span><span class="source-line-text">                  const error = Cause.squash(exit.cause)</span></span>
  <span class="source-line"><span class="source-line-number">977</span><span class="source-line-text">                  log.error(&quot;failed to read directory&quot;, { error })</span></span>
  <span class="source-line"><span class="source-line-number">978</span><span class="source-line-text">                  const message = error instanceof Error ? error.message : String(error)</span></span>
  <span class="source-line"><span class="source-line-number">979</span><span class="source-line-text">                  yield* bus.publish(Session.Event.Error, {</span></span>
  <span class="source-line"><span class="source-line-number">980</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">981</span><span class="source-line-text">                    error: new NamedError.Unknown({ message }).toObject(),</span></span>
  <span class="source-line"><span class="source-line-number">982</span><span class="source-line-text">                  })</span></span>
  <span class="source-line"><span class="source-line-number">983</span><span class="source-line-text">                  return [</span></span>
  <span class="source-line"><span class="source-line-number">984</span><span class="source-line-text">                    ...(referenceContext</span></span>
  <span class="source-line"><span class="source-line-number">985</span><span class="source-line-text">                      ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }]</span></span>
  <span class="source-line"><span class="source-line-number">986</span><span class="source-line-text">                      : []),</span></span>
  <span class="source-line"><span class="source-line-number">987</span><span class="source-line-text">                    {</span></span>
  <span class="source-line"><span class="source-line-number">988</span><span class="source-line-text">                      messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">989</span><span class="source-line-text">                      sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">990</span><span class="source-line-text">                      type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">991</span><span class="source-line-text">                      synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">992</span><span class="source-line-text">                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,</span></span>
  <span class="source-line"><span class="source-line-number">993</span><span class="source-line-text">                    },</span></span>
  <span class="source-line"><span class="source-line-number">994</span><span class="source-line-text">                  ]</span></span>
  <span class="source-line"><span class="source-line-number">995</span><span class="source-line-text">                }</span></span>
  <span class="source-line"><span class="source-line-number">996</span><span class="source-line-text">                return [</span></span>
  <span class="source-line"><span class="source-line-number">997</span><span class="source-line-text">                  ...(referenceContext</span></span>
  <span class="source-line"><span class="source-line-number">998</span><span class="source-line-text">                    ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }]</span></span>
  <span class="source-line"><span class="source-line-number">999</span><span class="source-line-text">                    : []),</span></span>
  <span class="source-line"><span class="source-line-number">1000</span><span class="source-line-text">                  {</span></span>
  <span class="source-line"><span class="source-line-number">1001</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">1002</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1003</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1004</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">1005</span><span class="source-line-text">                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,</span></span>
  <span class="source-line"><span class="source-line-number">1006</span><span class="source-line-text">                  },</span></span>
  <span class="source-line"><span class="source-line-number">1007</span><span class="source-line-text">                  {</span></span>
  <span class="source-line"><span class="source-line-number">1008</span><span class="source-line-text">                    messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">1009</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1010</span><span class="source-line-text">                    type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1011</span><span class="source-line-text">                    synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">1012</span><span class="source-line-text">                    text: exit.value.output,</span></span>
  <span class="source-line"><span class="source-line-number">1013</span><span class="source-line-text">                  },</span></span>
  <span class="source-line"><span class="source-line-number">1014</span><span class="source-line-text">                  { ...part, mime, messageID: info.id, sessionID: input.sessionID },</span></span>
  <span class="source-line"><span class="source-line-number">1015</span><span class="source-line-text">                ]</span></span>
  <span class="source-line"><span class="source-line-number">1016</span><span class="source-line-text">              }</span></span>
  <span class="source-line"><span class="source-line-number">1017</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1018</span><span class="source-line-text">              return [</span></span>
  <span class="source-line"><span class="source-line-number">1019</span><span class="source-line-text">                ...(referenceContext ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }] : []),</span></span>
  <span class="source-line"><span class="source-line-number">1020</span><span class="source-line-text">                {</span></span>
  <span class="source-line"><span class="source-line-number">1021</span><span class="source-line-text">                  messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">1022</span><span class="source-line-text">                  sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1023</span><span class="source-line-text">                  type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1024</span><span class="source-line-text">                  synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">1025</span><span class="source-line-text">                  text: `Called the Read tool with the following input: {&quot;filePath&quot;:&quot;${filepath}&quot;}`,</span></span>
  <span class="source-line"><span class="source-line-number">1026</span><span class="source-line-text">                },</span></span>
  <span class="source-line"><span class="source-line-number">1027</span><span class="source-line-text">                {</span></span>
  <span class="source-line"><span class="source-line-number">1028</span><span class="source-line-text">                  id: part.id,</span></span>
  <span class="source-line"><span class="source-line-number">1029</span><span class="source-line-text">                  messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">1030</span><span class="source-line-text">                  sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1031</span><span class="source-line-text">                  type: &quot;file&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1032</span><span class="source-line-text">                  url:</span></span>
  <span class="source-line"><span class="source-line-number">1033</span><span class="source-line-text">                    `data:${mime};base64,` +</span></span>
  <span class="source-line"><span class="source-line-number">1034</span><span class="source-line-text">                    Buffer.from(yield* fsys.readFile(filepath).pipe(Effect.catch(Effect.die))).toString(&quot;base64&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">1035</span><span class="source-line-text">                  mime,</span></span>
  <span class="source-line"><span class="source-line-number">1036</span><span class="source-line-text">                  filename: part.filename!,</span></span>
  <span class="source-line"><span class="source-line-number">1037</span><span class="source-line-text">                  source: part.source,</span></span>
  <span class="source-line"><span class="source-line-number">1038</span><span class="source-line-text">                },</span></span>
  <span class="source-line"><span class="source-line-number">1039</span><span class="source-line-text">              ]</span></span>
  <span class="source-line"><span class="source-line-number">1040</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1041</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1042</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">1043</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1044</span><span class="source-line-text">        if (part.type === &quot;agent&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1045</span><span class="source-line-text">          const perm = Permission.evaluate(&quot;task&quot;, part.name, ag.permission)</span></span>
  <span class="source-line"><span class="source-line-number">1046</span><span class="source-line-text">          const hint = perm.action === &quot;deny&quot; ? &quot; . Invoked by user; guaranteed to exist.&quot; : &quot;&quot;</span></span>
  <span class="source-line"><span class="source-line-number">1047</span><span class="source-line-text">          return [</span></span>
  <span class="source-line"><span class="source-line-number">1048</span><span class="source-line-text">            { ...part, messageID: info.id, sessionID: input.sessionID },</span></span>
  <span class="source-line"><span class="source-line-number">1049</span><span class="source-line-text">            {</span></span>
  <span class="source-line"><span class="source-line-number">1050</span><span class="source-line-text">              messageID: info.id,</span></span>
  <span class="source-line"><span class="source-line-number">1051</span><span class="source-line-text">              sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1052</span><span class="source-line-text">              type: &quot;text&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1053</span><span class="source-line-text">              synthetic: true,</span></span>
  <span class="source-line"><span class="source-line-number">1054</span><span class="source-line-text">              text:</span></span>
  <span class="source-line"><span class="source-line-number">1055</span><span class="source-line-text">                &quot; Use the above message and context to generate a prompt and call the task tool with subagent: &quot; +</span></span>
  <span class="source-line"><span class="source-line-number">1056</span><span class="source-line-text">                part.name +</span></span>
  <span class="source-line"><span class="source-line-number">1057</span><span class="source-line-text">                hint,</span></span>
  <span class="source-line"><span class="source-line-number">1058</span><span class="source-line-text">            },</span></span>
  <span class="source-line"><span class="source-line-number">1059</span><span class="source-line-text">          ]</span></span>
  <span class="source-line"><span class="source-line-number">1060</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">1061</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1062</span><span class="source-line-text">        return [{ ...part, messageID: info.id, sessionID: input.sessionID }]</span></span>
  <span class="source-line"><span class="source-line-number">1063</span><span class="source-line-text">      })</span></span>
  <span class="source-line"><span class="source-line-number">1064</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1065</span><span class="source-line-text">      const resolvedParts = yield* Effect.forEach(input.parts, resolvePart, { concurrency: &quot;unbounded&quot; }).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1066</span><span class="source-line-text">        Effect.map((x) =&gt; x.flat().map(assign)),</span></span>
  <span class="source-line"><span class="source-line-number">1067</span><span class="source-line-text">      )</span></span>
  <span class="source-line"><span class="source-line-number">1068</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1069</span><span class="source-line-text">      yield* plugin.trigger(</span></span>
  <span class="source-line"><span class="source-line-number">1070</span><span class="source-line-text">        &quot;chat.message&quot;,</span></span>
  <span class="source-line"><span class="source-line-number">1071</span><span class="source-line-text">        {</span></span>
  <span class="source-line"><span class="source-line-number">1072</span><span class="source-line-text">          sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1073</span><span class="source-line-text">          agent: input.agent,</span></span>
  <span class="source-line"><span class="source-line-number">1074</span><span class="source-line-text">          model: input.model,</span></span>
  <span class="source-line"><span class="source-line-number">1075</span><span class="source-line-text">          messageID: input.messageID,</span></span>
  <span class="source-line"><span class="source-line-number">1076</span><span class="source-line-text">          variant: input.variant,</span></span>
  <span class="source-line"><span class="source-line-number">1077</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">1078</span><span class="source-line-text">        { message: info, parts: resolvedParts },</span></span>
  <span class="source-line"><span class="source-line-number">1079</span><span class="source-line-text">      )</span></span>
  <span class="source-line"><span class="source-line-number">1080</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1081</span><span class="source-line-text">      const parts = yield* Effect.forEach(resolvedParts, (part) =&gt;</span></span>
  <span class="source-line"><span class="source-line-number">1082</span><span class="source-line-text">        part.type === &quot;file&quot; &amp;&amp; part.mime.startsWith(&quot;image/&quot;)</span></span>
  <span class="source-line"><span class="source-line-number">1083</span><span class="source-line-text">          ? image.normalize(part).pipe(</span></span>
  <span class="source-line"><span class="source-line-number">1084</span><span class="source-line-text">              Effect.catchIf(</span></span>
  <span class="source-line"><span class="source-line-number">1085</span><span class="source-line-text">                (error) =&gt; error instanceof Image.ResizerUnavailableError,</span></span></code></pre>
  </details>

6. `packages/opencode/src/session/prompt.ts:1116-1208`：写入 message/parts 并发布 prompt event。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1116-1208</code></span>
    </summary>
    <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1116</span><span class="source-line-text">      yield* sessions.updateMessage(info)</span></span>
  <span class="source-line"><span class="source-line-number">1117</span><span class="source-line-text">      for (const part of parts) yield* sessions.updatePart(part)</span></span>
  <span class="source-line"><span class="source-line-number">1118</span><span class="source-line-text">      const nextPrompt = parts.reduce(</span></span>
  <span class="source-line"><span class="source-line-number">1119</span><span class="source-line-text">        (result, part) =&gt; {</span></span>
  <span class="source-line"><span class="source-line-number">1120</span><span class="source-line-text">          if (part.type === &quot;text&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1121</span><span class="source-line-text">            if (part.synthetic) result.synthetic.push(part.text)</span></span>
  <span class="source-line"><span class="source-line-number">1122</span><span class="source-line-text">            else result.text.push(part.text)</span></span>
  <span class="source-line"><span class="source-line-number">1123</span><span class="source-line-text">            const reference = referencePromptMetadata(part.metadata?.reference)</span></span>
  <span class="source-line"><span class="source-line-number">1124</span><span class="source-line-text">            if (reference) {</span></span>
  <span class="source-line"><span class="source-line-number">1125</span><span class="source-line-text">              result.references.push(</span></span>
  <span class="source-line"><span class="source-line-number">1126</span><span class="source-line-text">                new ReferenceAttachment({</span></span>
  <span class="source-line"><span class="source-line-number">1127</span><span class="source-line-text">                  name: reference.name,</span></span>
  <span class="source-line"><span class="source-line-number">1128</span><span class="source-line-text">                  kind: reference.kind,</span></span>
  <span class="source-line"><span class="source-line-number">1129</span><span class="source-line-text">                  uri: reference.path ? pathToFileURL(reference.path).href : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">1130</span><span class="source-line-text">                  repository: reference.repository,</span></span>
  <span class="source-line"><span class="source-line-number">1131</span><span class="source-line-text">                  branch: reference.branch,</span></span>
  <span class="source-line"><span class="source-line-number">1132</span><span class="source-line-text">                  target: reference.target,</span></span>
  <span class="source-line"><span class="source-line-number">1133</span><span class="source-line-text">                  targetUri: reference.targetPath ? pathToFileURL(reference.targetPath).href : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">1134</span><span class="source-line-text">                  problem: reference.problem,</span></span>
  <span class="source-line"><span class="source-line-number">1135</span><span class="source-line-text">                  source: new Source({</span></span>
  <span class="source-line"><span class="source-line-number">1136</span><span class="source-line-text">                    start: reference.source.start,</span></span>
  <span class="source-line"><span class="source-line-number">1137</span><span class="source-line-text">                    end: reference.source.end,</span></span>
  <span class="source-line"><span class="source-line-number">1138</span><span class="source-line-text">                    text: reference.source.value,</span></span>
  <span class="source-line"><span class="source-line-number">1139</span><span class="source-line-text">                  }),</span></span>
  <span class="source-line"><span class="source-line-number">1140</span><span class="source-line-text">                }),</span></span>
  <span class="source-line"><span class="source-line-number">1141</span><span class="source-line-text">              )</span></span>
  <span class="source-line"><span class="source-line-number">1142</span><span class="source-line-text">            }</span></span>
  <span class="source-line"><span class="source-line-number">1143</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1144</span><span class="source-line-text">          if (part.type === &quot;file&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1145</span><span class="source-line-text">            result.files.push(</span></span>
  <span class="source-line"><span class="source-line-number">1146</span><span class="source-line-text">              new FileAttachment({</span></span>
  <span class="source-line"><span class="source-line-number">1147</span><span class="source-line-text">                uri: part.url,</span></span>
  <span class="source-line"><span class="source-line-number">1148</span><span class="source-line-text">                mime: part.mime,</span></span>
  <span class="source-line"><span class="source-line-number">1149</span><span class="source-line-text">                name: part.filename,</span></span>
  <span class="source-line"><span class="source-line-number">1150</span><span class="source-line-text">                source: part.source</span></span>
  <span class="source-line"><span class="source-line-number">1151</span><span class="source-line-text">                  ? new Source({</span></span>
  <span class="source-line"><span class="source-line-number">1152</span><span class="source-line-text">                      start: part.source.text.start,</span></span>
  <span class="source-line"><span class="source-line-number">1153</span><span class="source-line-text">                      end: part.source.text.end,</span></span>
  <span class="source-line"><span class="source-line-number">1154</span><span class="source-line-text">                      text: part.source.text.value,</span></span>
  <span class="source-line"><span class="source-line-number">1155</span><span class="source-line-text">                    })</span></span>
  <span class="source-line"><span class="source-line-number">1156</span><span class="source-line-text">                  : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">1157</span><span class="source-line-text">              }),</span></span>
  <span class="source-line"><span class="source-line-number">1158</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">1159</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1160</span><span class="source-line-text">          if (part.type === &quot;agent&quot;) {</span></span>
  <span class="source-line"><span class="source-line-number">1161</span><span class="source-line-text">            result.agents.push(</span></span>
  <span class="source-line"><span class="source-line-number">1162</span><span class="source-line-text">              new AgentAttachment({</span></span>
  <span class="source-line"><span class="source-line-number">1163</span><span class="source-line-text">                name: part.name,</span></span>
  <span class="source-line"><span class="source-line-number">1164</span><span class="source-line-text">                source: part.source</span></span>
  <span class="source-line"><span class="source-line-number">1165</span><span class="source-line-text">                  ? new Source({</span></span>
  <span class="source-line"><span class="source-line-number">1166</span><span class="source-line-text">                      start: part.source.start,</span></span>
  <span class="source-line"><span class="source-line-number">1167</span><span class="source-line-text">                      end: part.source.end,</span></span>
  <span class="source-line"><span class="source-line-number">1168</span><span class="source-line-text">                      text: part.source.value,</span></span>
  <span class="source-line"><span class="source-line-number">1169</span><span class="source-line-text">                    })</span></span>
  <span class="source-line"><span class="source-line-number">1170</span><span class="source-line-text">                  : undefined,</span></span>
  <span class="source-line"><span class="source-line-number">1171</span><span class="source-line-text">              }),</span></span>
  <span class="source-line"><span class="source-line-number">1172</span><span class="source-line-text">            )</span></span>
  <span class="source-line"><span class="source-line-number">1173</span><span class="source-line-text">          }</span></span>
  <span class="source-line"><span class="source-line-number">1174</span><span class="source-line-text">          return result</span></span>
  <span class="source-line"><span class="source-line-number">1175</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">1176</span><span class="source-line-text">        {</span></span>
  <span class="source-line"><span class="source-line-number">1177</span><span class="source-line-text">          text: [] as string[],</span></span>
  <span class="source-line"><span class="source-line-number">1178</span><span class="source-line-text">          files: [] as FileAttachment[],</span></span>
  <span class="source-line"><span class="source-line-number">1179</span><span class="source-line-text">          agents: [] as AgentAttachment[],</span></span>
  <span class="source-line"><span class="source-line-number">1180</span><span class="source-line-text">          references: [] as ReferenceAttachment[],</span></span>
  <span class="source-line"><span class="source-line-number">1181</span><span class="source-line-text">          synthetic: [] as string[],</span></span>
  <span class="source-line"><span class="source-line-number">1182</span><span class="source-line-text">        },</span></span>
  <span class="source-line"><span class="source-line-number">1183</span><span class="source-line-text">      )</span></span>
  <span class="source-line"><span class="source-line-number">1184</span><span class="source-line-text">      // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
  <span class="source-line"><span class="source-line-number">1185</span><span class="source-line-text">      if (flags.experimentalEventSystem) {</span></span>
  <span class="source-line"><span class="source-line-number">1186</span><span class="source-line-text">        yield* events.publish(SessionEvent.Prompted, {</span></span>
  <span class="source-line"><span class="source-line-number">1187</span><span class="source-line-text">          sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1188</span><span class="source-line-text">          timestamp: DateTime.makeUnsafe(info.time.created),</span></span>
  <span class="source-line"><span class="source-line-number">1189</span><span class="source-line-text">          prompt: {</span></span>
  <span class="source-line"><span class="source-line-number">1190</span><span class="source-line-text">            text: nextPrompt.text.join(&quot;\n&quot;),</span></span>
  <span class="source-line"><span class="source-line-number">1191</span><span class="source-line-text">            files: nextPrompt.files,</span></span>
  <span class="source-line"><span class="source-line-number">1192</span><span class="source-line-text">            agents: nextPrompt.agents,</span></span>
  <span class="source-line"><span class="source-line-number">1193</span><span class="source-line-text">            references: nextPrompt.references,</span></span>
  <span class="source-line"><span class="source-line-number">1194</span><span class="source-line-text">          },</span></span>
  <span class="source-line"><span class="source-line-number">1195</span><span class="source-line-text">        })</span></span>
  <span class="source-line"><span class="source-line-number">1196</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">1197</span><span class="source-line-text">      for (const text of nextPrompt.synthetic) {</span></span>
  <span class="source-line"><span class="source-line-number">1198</span><span class="source-line-text">        // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
  <span class="source-line"><span class="source-line-number">1199</span><span class="source-line-text">        if (flags.experimentalEventSystem) {</span></span>
  <span class="source-line"><span class="source-line-number">1200</span><span class="source-line-text">          yield* events.publish(SessionEvent.Synthetic, {</span></span>
  <span class="source-line"><span class="source-line-number">1201</span><span class="source-line-text">            sessionID: input.sessionID,</span></span>
  <span class="source-line"><span class="source-line-number">1202</span><span class="source-line-text">            timestamp: DateTime.makeUnsafe(info.time.created),</span></span>
  <span class="source-line"><span class="source-line-number">1203</span><span class="source-line-text">            text,</span></span>
  <span class="source-line"><span class="source-line-number">1204</span><span class="source-line-text">          })</span></span>
  <span class="source-line"><span class="source-line-number">1205</span><span class="source-line-text">        }</span></span>
  <span class="source-line"><span class="source-line-number">1206</span><span class="source-line-text">      }</span></span>
  <span class="source-line"><span class="source-line-number">1207</span><span class="source-line-text"></span></span>
  <span class="source-line"><span class="source-line-number">1208</span><span class="source-line-text">      return { info, parts }</span></span></code></pre>
  </details>

7. `packages/opencode/src/session/prompt.ts:1211-1230`：设置 session 权限并启动 loop。

  <details class="source-ref source-ref--inline">
    <summary>
      <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
      <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1211-1230</code></span>
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
  <span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span>
  <span class="source-line"><span class="source-line-number">1230</span><span class="source-line-text">    })</span></span></code></pre>
  </details>


## 6. 用户输入到 agent 行动的整体链路

```text
client.session.prompt(payload)
  -> SessionApi PromptPayload
  -> sessionHandlers.prompt
  -> SessionPrompt.prompt
  -> createUserMessage
  -> resolvePart for each input part
  -> sessions.updateMessage/updatePart
  -> optional SessionEvent.Prompted
  -> loop(sessionID)
```

API payload 不是复制粘贴 DTO，而是从 `SessionPrompt.PromptInput` 去掉 `sessionID` 派生：

```ts
export const PromptPayload = Schema.Struct(Struct.omit(SessionPrompt.PromptInput.fields, ["sessionID"]))
```

路径：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/groups/session.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:66</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">66</span><span class="source-line-text">export const PromptPayload = Schema.Struct(Struct.omit(SessionPrompt.PromptInput.fields, [&quot;sessionID&quot;]))</span></span></code></pre>
</details>


这保证 API payload 和内部 prompt input 不容易漂移。

## 7. 核心源码逐段讲解

### 7.1 session API 声明

```ts
HttpApiEndpoint.post("prompt", SessionPaths.prompt, {
  params: { sessionID: SessionID },
  query: WorkspaceRoutingQuery,
  payload: PromptPayload,
  success: described(MessageV2.WithParts, "Created message"),
})
```

路径：`packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-324`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/groups/session.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:312-324</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">312</span><span class="source-line-text">        HttpApiEndpoint.post(&quot;prompt&quot;, SessionPaths.prompt, {</span></span>
<span class="source-line"><span class="source-line-number">313</span><span class="source-line-text">          params: { sessionID: SessionID },</span></span>
<span class="source-line"><span class="source-line-number">314</span><span class="source-line-text">          query: WorkspaceRoutingQuery,</span></span>
<span class="source-line"><span class="source-line-number">315</span><span class="source-line-text">          payload: PromptPayload,</span></span>
<span class="source-line"><span class="source-line-number">316</span><span class="source-line-text">          success: described(MessageV2.WithParts, &quot;Created message&quot;),</span></span>
<span class="source-line"><span class="source-line-number">317</span><span class="source-line-text">          error: [HttpApiError.BadRequest, ApiNotFoundError],</span></span>
<span class="source-line"><span class="source-line-number">318</span><span class="source-line-text">        }).annotateMerge(</span></span>
<span class="source-line"><span class="source-line-number">319</span><span class="source-line-text">          OpenApi.annotations({</span></span>
<span class="source-line"><span class="source-line-number">320</span><span class="source-line-text">            identifier: &quot;session.prompt&quot;,</span></span>
<span class="source-line"><span class="source-line-number">321</span><span class="source-line-text">            summary: &quot;Send message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">322</span><span class="source-line-text">            description: &quot;Create and send a new message to a session, streaming the AI response.&quot;,</span></span>
<span class="source-line"><span class="source-line-number">323</span><span class="source-line-text">          }),</span></span>
<span class="source-line"><span class="source-line-number">324</span><span class="source-line-text">        ),</span></span></code></pre>
</details>


Java 理解：这像 Spring Controller 方法签名 + OpenAPI 注解，只是 OpenCode 用 Effect HTTP API 和 Schema 描述。

### 7.2 handler 做边界转换

```ts
const prompt = Effect.fn("SessionHttpApi.prompt")(function* (ctx) {
  yield* requireSession(ctx.params.sessionID)
  const message = yield* promptSvc
    .prompt({
      ...ctx.payload,
      sessionID: ctx.params.sessionID,
    })
    .pipe(Effect.mapError(() => new HttpApiError.BadRequest({})))
  return HttpServerResponse.stream(Stream.make(JSON.stringify(message)).pipe(Stream.encodeText))
})
```

路径：`packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-292`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:279-292</code></span>
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
<span class="source-line"><span class="source-line-number">290</span><span class="source-line-text">      return HttpServerResponse.stream(Stream.make(JSON.stringify(message)).pipe(Stream.encodeText), {</span></span>
<span class="source-line"><span class="source-line-number">291</span><span class="source-line-text">        contentType: &quot;application/json&quot;,</span></span>
<span class="source-line"><span class="source-line-number">292</span><span class="source-line-text">      })</span></span></code></pre>
</details>


handler 不自己解析 agent，也不自己调模型，只负责补上 path param 里的 `sessionID` 并调用 service。

### 7.3 Session schema

```ts
export const Info = Schema.Struct({
  id: SessionID,
  slug: Schema.String,
  projectID: ProjectID,
  directory: Schema.String,
  title: Schema.String,
  agent: optionalOmitUndefined(Schema.String),
  model: optionalOmitUndefined(Model),
  permission: optionalOmitUndefined(Permission.Ruleset),
})
```

路径：`packages/opencode/src/session/session.ts:208-228`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/session.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/session.ts:208-228</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">208</span><span class="source-line-text">export const Info = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">209</span><span class="source-line-text">  id: SessionID,</span></span>
<span class="source-line"><span class="source-line-number">210</span><span class="source-line-text">  slug: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">211</span><span class="source-line-text">  projectID: ProjectID,</span></span>
<span class="source-line"><span class="source-line-number">212</span><span class="source-line-text">  workspaceID: optionalOmitUndefined(WorkspaceID),</span></span>
<span class="source-line"><span class="source-line-number">213</span><span class="source-line-text">  directory: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">214</span><span class="source-line-text">  path: optionalOmitUndefined(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">215</span><span class="source-line-text">  parentID: optionalOmitUndefined(SessionID),</span></span>
<span class="source-line"><span class="source-line-number">216</span><span class="source-line-text">  summary: optionalOmitUndefined(Summary),</span></span>
<span class="source-line"><span class="source-line-number">217</span><span class="source-line-text">  cost: optionalOmitUndefined(Schema.Finite),</span></span>
<span class="source-line"><span class="source-line-number">218</span><span class="source-line-text">  tokens: optionalOmitUndefined(Tokens),</span></span>
<span class="source-line"><span class="source-line-number">219</span><span class="source-line-text">  share: optionalOmitUndefined(Share),</span></span>
<span class="source-line"><span class="source-line-number">220</span><span class="source-line-text">  title: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">221</span><span class="source-line-text">  agent: optionalOmitUndefined(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">222</span><span class="source-line-text">  model: optionalOmitUndefined(Model),</span></span>
<span class="source-line"><span class="source-line-number">223</span><span class="source-line-text">  version: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">224</span><span class="source-line-text">  time: Time,</span></span>
<span class="source-line"><span class="source-line-number">225</span><span class="source-line-text">  permission: optionalOmitUndefined(Permission.Ruleset),</span></span>
<span class="source-line"><span class="source-line-number">226</span><span class="source-line-text">  revert: optionalOmitUndefined(Revert),</span></span>
<span class="source-line"><span class="source-line-number">227</span><span class="source-line-text">}).annotate({ identifier: &quot;Session&quot; })</span></span>
<span class="source-line"><span class="source-line-number">228</span><span class="source-line-text">export type Info = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof Info&gt;&gt;</span></span></code></pre>
</details>


Session 保存的是会话级状态：目录、标题、当前 agent/model、权限等。

### 7.4 User message schema

```ts
export const User = Schema.Struct({
  role: Schema.Literal("user"),
  time: Schema.Struct({ created: NonNegativeInt }),
  agent: Schema.String,
  model: Schema.Struct({
    providerID: ProviderID,
    modelID: ModelID,
    variant: Schema.optional(Schema.String),
  }),
  system: Schema.optional(Schema.String),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
})
```

路径：`packages/opencode/src/session/message-v2.ts:327-350`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/message-v2.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/message-v2.ts:327-350</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">327</span><span class="source-line-text">export const User = Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">328</span><span class="source-line-text">  ...messageBase,</span></span>
<span class="source-line"><span class="source-line-number">329</span><span class="source-line-text">  role: Schema.Literal(&quot;user&quot;),</span></span>
<span class="source-line"><span class="source-line-number">330</span><span class="source-line-text">  time: Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">331</span><span class="source-line-text">    created: NonNegativeInt,</span></span>
<span class="source-line"><span class="source-line-number">332</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">333</span><span class="source-line-text">  format: Schema.optional(Format),</span></span>
<span class="source-line"><span class="source-line-number">334</span><span class="source-line-text">  summary: Schema.optional(</span></span>
<span class="source-line"><span class="source-line-number">335</span><span class="source-line-text">    Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">336</span><span class="source-line-text">      title: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">337</span><span class="source-line-text">      body: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">338</span><span class="source-line-text">      diffs: Schema.Array(Snapshot.FileDiff),</span></span>
<span class="source-line"><span class="source-line-number">339</span><span class="source-line-text">    }),</span></span>
<span class="source-line"><span class="source-line-number">340</span><span class="source-line-text">  ),</span></span>
<span class="source-line"><span class="source-line-number">341</span><span class="source-line-text">  agent: Schema.String,</span></span>
<span class="source-line"><span class="source-line-number">342</span><span class="source-line-text">  model: Schema.Struct({</span></span>
<span class="source-line"><span class="source-line-number">343</span><span class="source-line-text">    providerID: ProviderID,</span></span>
<span class="source-line"><span class="source-line-number">344</span><span class="source-line-text">    modelID: ModelID,</span></span>
<span class="source-line"><span class="source-line-number">345</span><span class="source-line-text">    variant: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">346</span><span class="source-line-text">  }),</span></span>
<span class="source-line"><span class="source-line-number">347</span><span class="source-line-text">  system: Schema.optional(Schema.String),</span></span>
<span class="source-line"><span class="source-line-number">348</span><span class="source-line-text">  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),</span></span>
<span class="source-line"><span class="source-line-number">349</span><span class="source-line-text">}).annotate({ identifier: &quot;UserMessage&quot; })</span></span>
<span class="source-line"><span class="source-line-number">350</span><span class="source-line-text">export type User = Types.DeepMutable&lt;Schema.Schema.Type&lt;typeof User&gt;&gt;</span></span></code></pre>
</details>


注意 user message 不只是 text，它还携带 agent、model、tools override、format/system 等控制信息。

### 7.5 Part union

```ts
export const Part = Schema.Union([
  TextPart,
  SubtaskPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  RetryPart,
  CompactionPart,
]).annotate({ discriminator: "type", identifier: "Part" })
```

路径：`packages/opencode/src/session/message-v2.ts:352-365`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/message-v2.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/message-v2.ts:352-365</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">352</span><span class="source-line-text">export const Part = Schema.Union([</span></span>
<span class="source-line"><span class="source-line-number">353</span><span class="source-line-text">  TextPart,</span></span>
<span class="source-line"><span class="source-line-number">354</span><span class="source-line-text">  SubtaskPart,</span></span>
<span class="source-line"><span class="source-line-number">355</span><span class="source-line-text">  ReasoningPart,</span></span>
<span class="source-line"><span class="source-line-number">356</span><span class="source-line-text">  FilePart,</span></span>
<span class="source-line"><span class="source-line-number">357</span><span class="source-line-text">  ToolPart,</span></span>
<span class="source-line"><span class="source-line-number">358</span><span class="source-line-text">  StepStartPart,</span></span>
<span class="source-line"><span class="source-line-number">359</span><span class="source-line-text">  StepFinishPart,</span></span>
<span class="source-line"><span class="source-line-number">360</span><span class="source-line-text">  SnapshotPart,</span></span>
<span class="source-line"><span class="source-line-number">361</span><span class="source-line-text">  PatchPart,</span></span>
<span class="source-line"><span class="source-line-number">362</span><span class="source-line-text">  AgentPart,</span></span>
<span class="source-line"><span class="source-line-number">363</span><span class="source-line-text">  RetryPart,</span></span>
<span class="source-line"><span class="source-line-number">364</span><span class="source-line-text">  CompactionPart,</span></span>
<span class="source-line"><span class="source-line-number">365</span><span class="source-line-text">]).annotate({ discriminator: &quot;type&quot;, identifier: &quot;Part&quot; })</span></span></code></pre>
</details>


这就是 OpenCode 能统一表示文本、附件、工具、推理、快照、压缩任务的关键。

### 7.6 创建 user message

```ts
const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))

const info: MessageV2.User = {
  id: input.messageID ?? MessageID.ascending(),
  role: "user",
  sessionID: input.sessionID,
  tools: input.tools,
  agent: ag.name,
  model: { providerID: model.providerID, modelID: model.modelID, variant },
  system: input.system,
  format: input.format,
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


Java 理解：这是一个 command handler 把 request DTO 转成 domain entity。

### 7.7 解析文件 part

文件 part 的解析分多种来源：MCP resource、data URL、file URL、目录、图片等。关键路径之一是 file URL 文本文件会调用 read 工具：

```ts
const { read } = yield* registry.named()
const execRead = (args, extra) => {
  const controller = new AbortController()
  return read.execute(args, {
    sessionID: input.sessionID,
    abort: controller.signal,
    agent: input.agent!,
    messageID: info.id,
    extra: { bypassCwdCheck: true, ...extra },
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  })
}
```

路径：`packages/opencode/src/session/prompt.ts:867-888`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:867-888</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">867</span><span class="source-line-text">            case &quot;file:&quot;: {</span></span>
<span class="source-line"><span class="source-line-number">868</span><span class="source-line-text">              log.info(&quot;file&quot;, { mime: part.mime })</span></span>
<span class="source-line"><span class="source-line-number">869</span><span class="source-line-text">              const filepath = fileURLToPath(part.url)</span></span>
<span class="source-line"><span class="source-line-number">870</span><span class="source-line-text">              const referenceContext = yield* referenceContextFromFilePart(part, filepath)</span></span>
<span class="source-line"><span class="source-line-number">871</span><span class="source-line-text">              const mime = (yield* fsys.isDir(filepath)) ? &quot;application/x-directory&quot; : part.mime</span></span>
<span class="source-line"><span class="source-line-number">872</span><span class="source-line-text"></span></span>
<span class="source-line"><span class="source-line-number">873</span><span class="source-line-text">              const { read } = yield* registry.named()</span></span>
<span class="source-line"><span class="source-line-number">874</span><span class="source-line-text">              const execRead = (args: Parameters&lt;typeof read.execute&gt;[0], extra?: Tool.Context[&quot;extra&quot;]) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">875</span><span class="source-line-text">                const controller = new AbortController()</span></span>
<span class="source-line"><span class="source-line-number">876</span><span class="source-line-text">                return read</span></span>
<span class="source-line"><span class="source-line-number">877</span><span class="source-line-text">                  .execute(args, {</span></span>
<span class="source-line"><span class="source-line-number">878</span><span class="source-line-text">                    sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">879</span><span class="source-line-text">                    abort: controller.signal,</span></span>
<span class="source-line"><span class="source-line-number">880</span><span class="source-line-text">                    agent: input.agent!,</span></span>
<span class="source-line"><span class="source-line-number">881</span><span class="source-line-text">                    messageID: info.id,</span></span>
<span class="source-line"><span class="source-line-number">882</span><span class="source-line-text">                    extra: { bypassCwdCheck: true, ...extra },</span></span>
<span class="source-line"><span class="source-line-number">883</span><span class="source-line-text">                    messages: [],</span></span>
<span class="source-line"><span class="source-line-number">884</span><span class="source-line-text">                    metadata: () =&gt; Effect.void,</span></span>
<span class="source-line"><span class="source-line-number">885</span><span class="source-line-text">                    ask: () =&gt; Effect.void,</span></span>
<span class="source-line"><span class="source-line-number">886</span><span class="source-line-text">                  })</span></span>
<span class="source-line"><span class="source-line-number">887</span><span class="source-line-text">                  .pipe(Effect.onInterrupt(() =&gt; Effect.sync(() =&gt; controller.abort())))</span></span>
<span class="source-line"><span class="source-line-number">888</span><span class="source-line-text">              }</span></span></code></pre>
</details>


这说明用户通过 CLI `--file` 附加文件时，OpenCode 会在创建 user message 阶段把文件内容读进 synthetic text context。具体文件权限这里被 bypass，因为这是用户主动附加文件。这个判断来自 `extra: { bypassCwdCheck: true }` 和 `ask: () => Effect.void`，来源同上。

### 7.8 plugin hook 可改消息

```ts
yield* plugin.trigger(
  "chat.message",
  {
    sessionID: input.sessionID,
    agent: input.agent,
    model: input.model,
    messageID: input.messageID,
    variant: input.variant,
  },
  { message: info, parts: resolvedParts },
)
```

路径：`packages/opencode/src/session/prompt.ts:1069-1079`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1069-1079</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1069</span><span class="source-line-text">      yield* plugin.trigger(</span></span>
<span class="source-line"><span class="source-line-number">1070</span><span class="source-line-text">        &quot;chat.message&quot;,</span></span>
<span class="source-line"><span class="source-line-number">1071</span><span class="source-line-text">        {</span></span>
<span class="source-line"><span class="source-line-number">1072</span><span class="source-line-text">          sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1073</span><span class="source-line-text">          agent: input.agent,</span></span>
<span class="source-line"><span class="source-line-number">1074</span><span class="source-line-text">          model: input.model,</span></span>
<span class="source-line"><span class="source-line-number">1075</span><span class="source-line-text">          messageID: input.messageID,</span></span>
<span class="source-line"><span class="source-line-number">1076</span><span class="source-line-text">          variant: input.variant,</span></span>
<span class="source-line"><span class="source-line-number">1077</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">1078</span><span class="source-line-text">        { message: info, parts: resolvedParts },</span></span>
<span class="source-line"><span class="source-line-number">1079</span><span class="source-line-text">      )</span></span></code></pre>
</details>


这表示消息入库前有扩展点。Java 类比：类似 `ApplicationEvent` 或拦截器可以修改 request context。

### 7.9 写入 message 和 parts

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


这一步之后，agent loop 可以只依赖 session store，而不关心输入来自 CLI、API 还是 TUI。

### 7.10 发布 Prompted/Synthetic 事件

`nextPrompt` 会把 text/file/agent/reference/synthetic 分组，并在 experimental event system 打开时发布事件。来源：`packages/opencode/src/session/prompt.ts:1118-1206`。

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1118-1206</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1118</span><span class="source-line-text">      const nextPrompt = parts.reduce(</span></span>
<span class="source-line"><span class="source-line-number">1119</span><span class="source-line-text">        (result, part) =&gt; {</span></span>
<span class="source-line"><span class="source-line-number">1120</span><span class="source-line-text">          if (part.type === &quot;text&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1121</span><span class="source-line-text">            if (part.synthetic) result.synthetic.push(part.text)</span></span>
<span class="source-line"><span class="source-line-number">1122</span><span class="source-line-text">            else result.text.push(part.text)</span></span>
<span class="source-line"><span class="source-line-number">1123</span><span class="source-line-text">            const reference = referencePromptMetadata(part.metadata?.reference)</span></span>
<span class="source-line"><span class="source-line-number">1124</span><span class="source-line-text">            if (reference) {</span></span>
<span class="source-line"><span class="source-line-number">1125</span><span class="source-line-text">              result.references.push(</span></span>
<span class="source-line"><span class="source-line-number">1126</span><span class="source-line-text">                new ReferenceAttachment({</span></span>
<span class="source-line"><span class="source-line-number">1127</span><span class="source-line-text">                  name: reference.name,</span></span>
<span class="source-line"><span class="source-line-number">1128</span><span class="source-line-text">                  kind: reference.kind,</span></span>
<span class="source-line"><span class="source-line-number">1129</span><span class="source-line-text">                  uri: reference.path ? pathToFileURL(reference.path).href : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1130</span><span class="source-line-text">                  repository: reference.repository,</span></span>
<span class="source-line"><span class="source-line-number">1131</span><span class="source-line-text">                  branch: reference.branch,</span></span>
<span class="source-line"><span class="source-line-number">1132</span><span class="source-line-text">                  target: reference.target,</span></span>
<span class="source-line"><span class="source-line-number">1133</span><span class="source-line-text">                  targetUri: reference.targetPath ? pathToFileURL(reference.targetPath).href : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1134</span><span class="source-line-text">                  problem: reference.problem,</span></span>
<span class="source-line"><span class="source-line-number">1135</span><span class="source-line-text">                  source: new Source({</span></span>
<span class="source-line"><span class="source-line-number">1136</span><span class="source-line-text">                    start: reference.source.start,</span></span>
<span class="source-line"><span class="source-line-number">1137</span><span class="source-line-text">                    end: reference.source.end,</span></span>
<span class="source-line"><span class="source-line-number">1138</span><span class="source-line-text">                    text: reference.source.value,</span></span>
<span class="source-line"><span class="source-line-number">1139</span><span class="source-line-text">                  }),</span></span>
<span class="source-line"><span class="source-line-number">1140</span><span class="source-line-text">                }),</span></span>
<span class="source-line"><span class="source-line-number">1141</span><span class="source-line-text">              )</span></span>
<span class="source-line"><span class="source-line-number">1142</span><span class="source-line-text">            }</span></span>
<span class="source-line"><span class="source-line-number">1143</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1144</span><span class="source-line-text">          if (part.type === &quot;file&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1145</span><span class="source-line-text">            result.files.push(</span></span>
<span class="source-line"><span class="source-line-number">1146</span><span class="source-line-text">              new FileAttachment({</span></span>
<span class="source-line"><span class="source-line-number">1147</span><span class="source-line-text">                uri: part.url,</span></span>
<span class="source-line"><span class="source-line-number">1148</span><span class="source-line-text">                mime: part.mime,</span></span>
<span class="source-line"><span class="source-line-number">1149</span><span class="source-line-text">                name: part.filename,</span></span>
<span class="source-line"><span class="source-line-number">1150</span><span class="source-line-text">                source: part.source</span></span>
<span class="source-line"><span class="source-line-number">1151</span><span class="source-line-text">                  ? new Source({</span></span>
<span class="source-line"><span class="source-line-number">1152</span><span class="source-line-text">                      start: part.source.text.start,</span></span>
<span class="source-line"><span class="source-line-number">1153</span><span class="source-line-text">                      end: part.source.text.end,</span></span>
<span class="source-line"><span class="source-line-number">1154</span><span class="source-line-text">                      text: part.source.text.value,</span></span>
<span class="source-line"><span class="source-line-number">1155</span><span class="source-line-text">                    })</span></span>
<span class="source-line"><span class="source-line-number">1156</span><span class="source-line-text">                  : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1157</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">1158</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1159</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1160</span><span class="source-line-text">          if (part.type === &quot;agent&quot;) {</span></span>
<span class="source-line"><span class="source-line-number">1161</span><span class="source-line-text">            result.agents.push(</span></span>
<span class="source-line"><span class="source-line-number">1162</span><span class="source-line-text">              new AgentAttachment({</span></span>
<span class="source-line"><span class="source-line-number">1163</span><span class="source-line-text">                name: part.name,</span></span>
<span class="source-line"><span class="source-line-number">1164</span><span class="source-line-text">                source: part.source</span></span>
<span class="source-line"><span class="source-line-number">1165</span><span class="source-line-text">                  ? new Source({</span></span>
<span class="source-line"><span class="source-line-number">1166</span><span class="source-line-text">                      start: part.source.start,</span></span>
<span class="source-line"><span class="source-line-number">1167</span><span class="source-line-text">                      end: part.source.end,</span></span>
<span class="source-line"><span class="source-line-number">1168</span><span class="source-line-text">                      text: part.source.value,</span></span>
<span class="source-line"><span class="source-line-number">1169</span><span class="source-line-text">                    })</span></span>
<span class="source-line"><span class="source-line-number">1170</span><span class="source-line-text">                  : undefined,</span></span>
<span class="source-line"><span class="source-line-number">1171</span><span class="source-line-text">              }),</span></span>
<span class="source-line"><span class="source-line-number">1172</span><span class="source-line-text">            )</span></span>
<span class="source-line"><span class="source-line-number">1173</span><span class="source-line-text">          }</span></span>
<span class="source-line"><span class="source-line-number">1174</span><span class="source-line-text">          return result</span></span>
<span class="source-line"><span class="source-line-number">1175</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">1176</span><span class="source-line-text">        {</span></span>
<span class="source-line"><span class="source-line-number">1177</span><span class="source-line-text">          text: [] as string[],</span></span>
<span class="source-line"><span class="source-line-number">1178</span><span class="source-line-text">          files: [] as FileAttachment[],</span></span>
<span class="source-line"><span class="source-line-number">1179</span><span class="source-line-text">          agents: [] as AgentAttachment[],</span></span>
<span class="source-line"><span class="source-line-number">1180</span><span class="source-line-text">          references: [] as ReferenceAttachment[],</span></span>
<span class="source-line"><span class="source-line-number">1181</span><span class="source-line-text">          synthetic: [] as string[],</span></span>
<span class="source-line"><span class="source-line-number">1182</span><span class="source-line-text">        },</span></span>
<span class="source-line"><span class="source-line-number">1183</span><span class="source-line-text">      )</span></span>
<span class="source-line"><span class="source-line-number">1184</span><span class="source-line-text">      // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">1185</span><span class="source-line-text">      if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">1186</span><span class="source-line-text">        yield* events.publish(SessionEvent.Prompted, {</span></span>
<span class="source-line"><span class="source-line-number">1187</span><span class="source-line-text">          sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1188</span><span class="source-line-text">          timestamp: DateTime.makeUnsafe(info.time.created),</span></span>
<span class="source-line"><span class="source-line-number">1189</span><span class="source-line-text">          prompt: {</span></span>
<span class="source-line"><span class="source-line-number">1190</span><span class="source-line-text">            text: nextPrompt.text.join(&quot;\n&quot;),</span></span>
<span class="source-line"><span class="source-line-number">1191</span><span class="source-line-text">            files: nextPrompt.files,</span></span>
<span class="source-line"><span class="source-line-number">1192</span><span class="source-line-text">            agents: nextPrompt.agents,</span></span>
<span class="source-line"><span class="source-line-number">1193</span><span class="source-line-text">            references: nextPrompt.references,</span></span>
<span class="source-line"><span class="source-line-number">1194</span><span class="source-line-text">          },</span></span>
<span class="source-line"><span class="source-line-number">1195</span><span class="source-line-text">        })</span></span>
<span class="source-line"><span class="source-line-number">1196</span><span class="source-line-text">      }</span></span>
<span class="source-line"><span class="source-line-number">1197</span><span class="source-line-text">      for (const text of nextPrompt.synthetic) {</span></span>
<span class="source-line"><span class="source-line-number">1198</span><span class="source-line-text">        // TODO(v2): Temporary dual-write while migrating session messages to v2 events.</span></span>
<span class="source-line"><span class="source-line-number">1199</span><span class="source-line-text">        if (flags.experimentalEventSystem) {</span></span>
<span class="source-line"><span class="source-line-number">1200</span><span class="source-line-text">          yield* events.publish(SessionEvent.Synthetic, {</span></span>
<span class="source-line"><span class="source-line-number">1201</span><span class="source-line-text">            sessionID: input.sessionID,</span></span>
<span class="source-line"><span class="source-line-number">1202</span><span class="source-line-text">            timestamp: DateTime.makeUnsafe(info.time.created),</span></span>
<span class="source-line"><span class="source-line-number">1203</span><span class="source-line-text">            text,</span></span>
<span class="source-line"><span class="source-line-number">1204</span><span class="source-line-text">          })</span></span>
<span class="source-line"><span class="source-line-number">1205</span><span class="source-line-text">        }</span></span>
<span class="source-line"><span class="source-line-number">1206</span><span class="source-line-text">      }</span></span></code></pre>
</details>


### 7.11 prompt 启动 loop

```ts
if (input.noReply === true) return message
return yield* loop({ sessionID: input.sessionID })
```

路径：`packages/opencode/src/session/prompt.ts:1228-1229`

<details class="source-ref source-ref--inline">
  <summary>
    <span class="source-ref-title">packages/opencode/src/session/prompt.ts</span>
    <span class="source-ref-path"><code>packages/opencode/src/session/prompt.ts:1228-1229</code></span>
  </summary>
  <pre class="source-code" tabindex="0"><code><span class="source-line"><span class="source-line-number">1228</span><span class="source-line-text">      if (input.noReply === true) return message</span></span>
<span class="source-line"><span class="source-line-number">1229</span><span class="source-line-text">      return yield* loop({ sessionID: input.sessionID })</span></span></code></pre>
</details>


用户输入与会话模块的终点，就是把新事实交给 agent 核心循环。

## 8. 关键 TypeScript 语法复习

- `Schema.Struct(Struct.omit(...))`：从内部 schema 派生 API payload。来源：`groups/session.ts:66-68`。
- object spread：`{ ...ctx.payload, sessionID: ctx.params.sessionID }`。来源：`handlers/session.ts:284-288`。
- optional field：`variant: Schema.optional(Schema.String)`。来源：`message-v2.ts:342-346`。
- discriminated union：`Part` 以 `type` 为 discriminator。来源：`message-v2.ts:352-365`。
- generic/context service：`export class Service extends Context.Service<Service, Interface>()(...)`。来源：`prompt.ts:94`。
- `Effect.forEach(..., { concurrency: "unbounded" })`：并发解析 parts。来源：`prompt.ts:1065-1067`。
- non-null assertion：`agent: input.agent!`，源码在 file part read context 中使用。来源：`prompt.ts:878-882`。

## 9. 涉及的设计模式和架构思想

- DTO 派生：API payload 从 service input schema 派生，减少类型漂移。
- Aggregate：session 是聚合根，message/part 是子状态。
- Event Sourcing 味道：message parts 和 events 共同驱动 UI/agent 继续工作。
- Interceptor/Hook：`plugin.trigger("chat.message")`。
- Adapter：HTTP handler 只把 API ctx 适配为 service input。

## 10. 它如何和 Tool、Provider、Session、文件系统协作

- Tool：file part 解析时会直接调用 `registry.named().read`。来源：`prompt.ts:873-888`。
- Provider：创建 user message 时根据 input/agent/current session 选择 model。来源：`prompt.ts:700-715`。
- Session：`sessions.updateMessage` 和 `sessions.updatePart` 持久化输入事实。来源：`prompt.ts:1116-1117`。
- 文件系统：file URL 会通过 `fileURLToPath`、`fsys.isDir`、`fsys.readFile` 等读取。来源：`prompt.ts:867-1039`。

## 11. 如果自己实现 mini agent，这一章对应什么代码

```ts
type UserMessage = {
  id: string
  role: "user"
  sessionID: string
  agent: string
  model: { providerID: string; modelID: string }
}

type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; url: string; filename: string; mime: string }

async function prompt(input: PromptInput) {
  const session = await sessions.get(input.sessionID)
  const user = createUserMessage(input, session)
  const parts = await resolveParts(input.parts)
  await sessions.saveMessage(user)
  await sessions.saveParts(user.id, parts)
  return input.noReply ? { info: user, parts } : runLoop(input.sessionID)
}
```

先把 message/part 建模清楚，再写 agent loop。

## 12. 费曼复述区

请回答：

1. 为什么 user message 里要保存 agent/model？
2. part union 解决了什么问题？
3. 为什么 file attachment 会在创建 user message 时被 read tool 读取？

如果卡住，换句话说：session/message 层是在把“外部输入”变成“agent 可以反复读取的内部事实”。

## 13. 练习题

### 入门题

1. 找到 `PromptPayload` 的定义，解释为什么要 omit `sessionID`。
2. 找到 `User` schema，列出 user message 的核心字段。
3. 找到 `Part` union，数一数有几种 part。

### 进阶题

1. 解释 `createUserMessage` 如何决定使用哪个 model。
2. 解释 `plugin.trigger("chat.message")` 的扩展价值。
3. 解释 synthetic text 和普通 user text 的区别。

### 小实现题

写一个 `resolveParts(parts)`：支持 text 和 file 两种 part，file part 读取本地文件并生成 synthetic text。

## 14. 源码追踪任务

1. 从 `groups/session.ts:312-324` 追到 `handlers/session.ts:279-290`。
2. 从 `handlers/session.ts:284-288` 追到 `SessionPrompt.prompt`。
3. 从 `createUserMessage` 的 model 选择追到 `currentModel`。
4. 从 `part.type === "file"` 追到 `read.execute`。
5. 从 `sessions.updatePart` 追到消息如何被 event/API 读取。

## 15. 面试式自测

1. 为什么 agent 项目要把 message 和 part 分开？
2. 为什么 prompt API 的 success 类型是 `MessageV2.WithParts`？
3. 如果用户上传目录，源码怎么处理？
4. 如果插件想修改用户消息，扩展点在哪里？
5. session permission 和 prompt input tools 有什么关系？

## 16. 下一步阅读建议

下一步读 “Agent 核心循环” 或 “Tool 调用系统”。如果你已经读完样章 `03-agent-core-loop`，建议直接进入 `05-tool-calling`，因为会话层保存的 parts 会在工具调用中继续变成 agent 的行动记录。


