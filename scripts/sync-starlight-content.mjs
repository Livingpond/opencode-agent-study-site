import { mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { createHighlighter } from 'shiki';

const root = process.cwd();
const docsDir = path.join(root, 'src/content/docs');
const chapterDocsDir = path.join(docsDir, 'chapters');
const publicDir = path.join(root, 'public');
const sourceRoot = process.env.OPENCODE_SOURCE_ROOT
  ? path.resolve(process.env.OPENCODE_SOURCE_ROOT)
  : path.resolve(root, '../../../opencode');

const chapters = JSON.parse(await readFile(path.join(root, 'data/chapters.json'), 'utf8'));
const progress = JSON.parse(await readFile(path.join(root, 'data/progress.json'), 'utf8'));
const sourceFileCache = new Map();
const sourceThemes = { dark: 'night-owl', light: 'github-light' };
const sourceHighlighter = createHighlighter({
  themes: Object.values(sourceThemes),
  langs: [
    'bash',
    'css',
    'html',
    'javascript',
    'java',
    'json',
    'jsonc',
    'jsx',
    'markdown',
    'plaintext',
    'shellscript',
    'toml',
    'tsx',
    'typescript',
    'yaml',
  ],
});

const fenceLanguageAliases = new Map([
  ['bash', 'bash'],
  ['sh', 'bash'],
  ['shell', 'bash'],
  ['css', 'css'],
  ['html', 'html'],
  ['java', 'java'],
  ['js', 'javascript'],
  ['javascript', 'javascript'],
  ['json', 'json'],
  ['jsonc', 'jsonc'],
  ['jsx', 'jsx'],
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['toml', 'toml'],
  ['ts', 'typescript'],
  ['typescript', 'typescript'],
  ['tsx', 'tsx'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
]);

function quote(value) {
  return JSON.stringify(String(value));
}

function chapterNumber(id) {
  const match = id.match(/^(\d+)/);
  return match ? Number(match[1]) : 999;
}

function stripFirstHeading(markdown) {
  return markdown.replace(/^# .+\n+/, '').trimStart();
}

function list(values) {
  return values.map((value) => `<li><code>${escapeHtml(value)}</code></li>`).join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseAttributes(value) {
  return Object.fromEntries([...value.matchAll(/([a-zA-Z][\w-]*)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function parseLineRange(value) {
  const match = String(value ?? '').match(/^(\d+)(?:-(\d+))?$/);
  if (!match) throw new Error(`Invalid source-ref lines value: ${value}`);
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start < 1 || end < start) throw new Error(`Invalid source-ref line range: ${value}`);
  return { start, end };
}

function parseSourceLabel(value) {
  const match = String(value).match(/^([^`\n]+?):(\d+(?:-\d+)?)$/);
  if (!match) return;
  const sourcePath = match[1].trim();
  if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) return;
  if (sourcePath.includes(' ')) return;
  const fullPathPrefixes = ['packages/', 'sdks/', 'github/', 'script/', 'infra/', 'nix/'];
  const rootFiles = ['AGENTS.md', 'package.json', 'bunfig.toml', 'sst.config.ts', 'turbo.json'];
  if (!fullPathPrefixes.some((prefix) => sourcePath.startsWith(prefix)) && !rootFiles.includes(sourcePath)) return;
  return {
    path: sourcePath,
    lines: match[2],
  };
}

async function readSourceLines(sourcePath) {
  if (!sourceFileCache.has(sourcePath)) {
    const filePath = path.join(sourceRoot, sourcePath);
    const content = await readFile(filePath, 'utf8');
    sourceFileCache.set(sourcePath, content.split(/\r?\n/));
  }
  return sourceFileCache.get(sourcePath);
}

function languageForSourcePath(sourcePath) {
  const basename = path.basename(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  if (basename === 'package.json') return 'json';
  if (ext === '.ts') return 'typescript';
  if (ext === '.tsx') return 'tsx';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.jsx') return 'jsx';
  if (ext === '.json' || ext === '.jsonc') return 'jsonc';
  if (ext === '.md' || ext === '.mdx') return 'markdown';
  if (ext === '.css') return 'css';
  if (ext === '.html') return 'html';
  if (ext === '.yml' || ext === '.yaml') return 'yaml';
  if (ext === '.toml') return 'toml';
  if (ext === '.sh' || ext === '.bash' || ext === '.zsh') return 'bash';
  return 'plaintext';
}

function languageForFence(info) {
  const name = String(info ?? '').trim().split(/\s+/)[0].toLowerCase();
  return fenceLanguageAliases.get(name) ?? 'plaintext';
}

function shouldRenderFence(info) {
  return languageForFence(info) !== 'plaintext';
}

function tokenStyle(token) {
  if (/^\s+$/.test(token.content)) return '';
  const dark = token.variants?.dark;
  const light = token.variants?.light;
  const styles = [];
  if (dark?.color) styles.push(`--source-token-dark:${dark.color}`);
  if (light?.color) styles.push(`--source-token-light:${light.color}`);
  const fontStyle = dark?.fontStyle ?? light?.fontStyle ?? 0;
  if (fontStyle & 1) styles.push('--source-token-font-style:italic');
  if (fontStyle & 2) styles.push('--source-token-font-weight:700');
  if (fontStyle & 4) styles.push('--source-token-decoration:underline');
  return styles.length ? ` class="source-token" style="${styles.join(';')}"` : '';
}

function tokenHtml(token) {
  const content = escapeHtml(token.content);
  const style = tokenStyle(token);
  return style ? `<span${style}>${content}</span>` : content;
}

function jsonLineComment(trimmed) {
  if (/^"scripts"\s*:/.test(trimmed)) return '项目脚本入口。';
  if (/^"dependencies"\s*:/.test(trimmed)) return '运行时依赖。';
  if (/^"devDependencies"\s*:/.test(trimmed)) return '开发期依赖。';
  if (/^"exports"\s*:/.test(trimmed)) return '包对外暴露入口。';
  if (/^"workspaces"\s*:/.test(trimmed)) return '声明工作区范围。';
  if (/^"type"\s*:/.test(trimmed)) return '控制模块格式。';
  if (/^"(build|dev|test|typecheck|lint|start)"\s*:/.test(trimmed)) return '常用工程命令。';
  return '';
}

function tomlLineComment(trimmed) {
  if (/^\[/.test(trimmed)) return '配置分组。';
  if (/^(test|install|run|registry|telemetry)\b/.test(trimmed)) return '配置具体行为。';
  return '';
}

function markdownLineComment(trimmed) {
  if (/^#{1,6}\s+/.test(trimmed)) return '文档标题层级。';
  if (/^[-*]\s+/.test(trimmed)) return '列表里的一个要点。';
  if (/^\|/.test(trimmed)) return '表格行。';
  return '';
}

function codeLineComment(line, context) {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (/^(\/\/|\/\*|\*\/|\*)/.test(trimmed)) return '';
  if (/^[}\])]+[,;]?$/.test(trimmed)) return '';

  if (context.language === 'json' || context.language === 'jsonc') return jsonLineComment(trimmed);
  if (context.language === 'toml') return tomlLineComment(trimmed);
  if (context.language === 'markdown') return markdownLineComment(trimmed);

  const sourcePath = context.sourcePath ?? '';
  if (sourcePath.includes('/cli/cmd/run.ts') && /args\.interactive/.test(trimmed)) return '区分交互与非交互。';
  if (sourcePath.includes('/cli/cmd/run.ts') && /runInteractiveMode|execute\(/.test(trimmed)) return '进入 CLI 主执行路径。';
  if (sourcePath.includes('/tool/shell.ts') && /ctx\.ask|Permission/.test(trimmed)) return '执行前先走权限。';
  if (sourcePath.includes('/tool/edit.ts') && /patch|apply|write/i.test(trimmed)) return '准备修改文件内容。';
  if (sourcePath.includes('/session/prompt.ts') && /while\s*\(true\)|runLoop/.test(trimmed)) return 'agent 核心循环。';
  if (sourcePath.includes('/session/processor.ts') && /parts|message|patch/.test(trimmed)) return '把流事件写回消息。';

  const rules = [
    [/^import\s+/, '引入需要的模块。'],
    [/await\s+import\(/, '按需加载模块。'],
    [/yargs\(/, '创建 CLI 参数解析器。'],
    [/\.command\(/, '注册 CLI 子命令。'],
    [/\.option\(/, '声明一个 CLI 选项。'],
    [/\.middleware\(/, '执行前先处理中间件。'],
    [/\.parse\(/, '开始解析命令参数。'],
    [/createOpencodeClient|createClient\(/, '创建 SDK 客户端。'],
    [/Server\.Default|\.app\.fetch/, '复用后端请求入口。'],
    [/session\.prompt|SessionPrompt\.prompt/, '把输入交给会话主流程。'],
    [/session\.command/, '执行内置 session 命令。'],
    [/session\.abort|AbortController|AbortSignal/, '用于中断运行任务。'],
    [/event\.subscribe|subscribe\(/, '订阅运行时事件。'],
    [/Bus\.(publish|subscribe)|\.publish\(/, '广播状态变化。'],
    [/Permission\.ask|ctx\.ask|permission\.ask/, '进入权限审批。'],
    [/Permission\.reply|permission\.reply/, '回写审批结果。'],
    [/Tool\.(define|init)|tool\(.*\)/, '声明可调用工具。'],
    [/execute\s*:\s*async|async\s+execute|execute\(/, '工具真正执行入口。'],
    [/schema\s*:|Schema\.|z\./, '定义并校验数据形状。'],
    [/LLM\.stream|streamText|generateText/, '向模型发起请求。'],
    [/SessionProcessor|processor\.process/, '处理模型流事件。'],
    [/MessageV2|ToolPart|TextPart|Part\./, '会话消息片段结构。'],
    [/ConfigProvider|config\./, '读取运行配置。'],
    [/Provider|provider|modelID|model\s*:/, '选择模型或 provider。'],
    [/Plugin|hook|trigger/, '调用插件扩展点。'],
    [/fs\.|readFile|writeFile|FileSystem|Glob/, '读写本地文件。'],
    [/shell|command|Bash|cmd\s*:/, '处理命令执行。'],
    [/LSP|diagnostic|Diagnostics/, '处理语言服务诊断。'],
    [/Effect\.gen|Effect\./, 'Effect 异步工作流。'],
    [/yield\*/, '等待 Effect 结果。'],
    [/Promise\.all/, '并行等待多个任务。'],
    [/for\s+await/, '消费异步流。'],
    [/while\s*\(true\)/, '持续循环到退出条件。'],
    [/^try\s*{?$/, '开始保护性执行。'],
    [/^catch\b/, '集中处理异常。'],
    [/^throw\b/, '失败时抛出错误。'],
    [/^return\b/, '返回给上一层。'],
    [/^if\b/, '按条件进入分支。'],
    [/^for\b/, '遍历集合。'],
    [/^async\s+function|^function\b/, '定义一段可复用逻辑。'],
    [/^(export\s+)?(type|interface)\s+/, '定义数据结构约束。'],
    [/^(export\s+)?class\s+/, '定义一个类。'],
    [/^export\s+/, '对外暴露模块成员。'],
  ];

  for (const [pattern, comment] of rules) {
    if (pattern.test(trimmed)) return comment;
  }

  if (context.language === 'java') {
    if (/^public\b|^private\b|^protected\b/.test(trimmed)) return 'Java 方法或字段定义。';
    if (/^new\b/.test(trimmed)) return '创建对象实例。';
  }

  return '';
}

async function highlightedCodeHtml(lines, { language, sourcePath, startLine = 1 }) {
  const highlighter = await sourceHighlighter;
  const tokenLines = highlighter.codeToTokensWithThemes(lines.join('\n'), {
    lang: language,
    themes: sourceThemes,
  });
  const comments = lines.map((line) => codeLineComment(line, { language, sourcePath }));
  const hasComments = comments.some(Boolean);
  const html = lines
    .map((line, index) => {
      const number = startLine + index;
      const highlighted = tokenLines[index]?.length ? tokenLines[index].map(tokenHtml).join('') : escapeHtml(line);
      const codeLine = `<span class="source-line"><span class="source-line-number">${number}</span><span class="source-line-text">${highlighted}</span></span>`;
      if (!comments[index]) return codeLine;
      return `${codeLine}<span class="source-line source-line--comment"><span class="source-line-number"></span><span class="source-line-comment">${escapeHtml(comments[index])}</span></span>`;
    })
    .join('');
  return { html, hasComments };
}

async function sourceCodeHtml(sourcePath, sourceLines) {
  const { start, end } = parseLineRange(sourceLines);
  const lines = await readSourceLines(sourcePath);
  if (end > lines.length) {
    throw new Error(`source-ref ${sourcePath}:${sourceLines} exceeds file length ${lines.length}`);
  }

  const snippet = lines.slice(start - 1, end);
  return highlightedCodeHtml(snippet, {
    language: languageForSourcePath(sourcePath),
    sourcePath,
    startLine: start,
  });
}

async function renderSourceRef(attrs, variant = 'card') {
  if (!attrs.path) throw new Error('source-ref is missing path="..."');
  if (!attrs.lines) throw new Error(`source-ref for ${attrs.path} is missing lines="..."`);

  const title = attrs.title || attrs.path;
  const label = `${attrs.path}:${attrs.lines}`;
  const note = attrs.note ? `<p class="source-ref-note">${escapeHtml(attrs.note)}</p>\n` : '';
  const code = await sourceCodeHtml(attrs.path, attrs.lines);
  const classes = variant === 'inline' ? 'source-ref source-ref--inline' : 'source-ref';
  const codeClasses = code.hasComments ? 'source-code source-code--annotated' : 'source-code';

  return `<details class="${classes}">
  <summary>
    <span class="source-ref-title">${escapeHtml(title)}</span>
    <span class="source-ref-path"><code>${escapeHtml(label)}</code></span>
  </summary>
  ${note}<pre class="${codeClasses}" tabindex="0"><code>${code.html}</code></pre>
</details>`;
}

function indentBlock(value, indent) {
  return value
    .split('\n')
    .map((line) => (line ? `${indent}${line}` : line))
    .join('\n');
}

async function expandSourceRefs(markdown) {
  const pattern = /<!--\s*source-ref\s+([\s\S]*?)\s*-->/g;
  let result = '';
  let lastIndex = 0;
  for (const match of markdown.matchAll(pattern)) {
    result += markdown.slice(lastIndex, match.index);
    result += await renderSourceRef(parseAttributes(match[1]));
    lastIndex = match.index + match[0].length;
  }
  result += markdown.slice(lastIndex);
  return result;
}

async function expandInlineSourceRefs(markdown) {
  const warnings = [];
  const lines = markdown.split('\n');
  let inFence = false;
  let inSourceRefHtml = false;
  const expanded = [];

  for (const line of lines) {
    if (line.startsWith('<details class="source-ref')) inSourceRefHtml = true;

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      expanded.push(line);
      continue;
    }

    if (inFence || inSourceRefHtml || line.includes('<!-- source-ref')) {
      expanded.push(line);
      if (line.trim() === '</details>') inSourceRefHtml = false;
      continue;
    }

    const sourceBlocks = [];
    for (const match of line.matchAll(/`([^`\n]+?)`/g)) {
      const ref = parseSourceLabel(match[1]);
      if (!ref) continue;

      try {
        sourceBlocks.push(await renderSourceRef(ref, 'inline'));
      } catch (error) {
        warnings.push(`${ref.path}:${ref.lines} (${error.message})`);
      }
    }

    if (!sourceBlocks.length) {
      expanded.push(line);
    } else {
      const listMatch = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
      const continuationIndent = listMatch ? `${listMatch[1]}  ` : '';
      expanded.push(line);
      expanded.push('');
      for (const block of sourceBlocks) {
        expanded.push(continuationIndent ? indentBlock(block, continuationIndent) : block);
        expanded.push('');
      }
    }
  }

  if (warnings.length) {
    console.warn(`Skipped ${warnings.length} inline source refs that could not be expanded:`);
    for (const warning of warnings.slice(0, 20)) console.warn(`- ${warning}`);
    if (warnings.length > 20) console.warn(`- ... ${warnings.length - 20} more`);
  }

  return expanded.join('\n');
}

function inferFenceSourcePath(lines, startIndex) {
  const nearby = lines.slice(startIndex, startIndex + 4).join('\n');
  for (const match of nearby.matchAll(/`([^`\n]+?)`/g)) {
    const ref = parseSourceLabel(match[1]);
    if (ref) return ref.path;
  }
  return '';
}

async function renderFencedCodeBlocks(markdown) {
  const lines = markdown.split('\n');
  const rendered = [];

  for (let index = 0; index < lines.length; index += 1) {
    const open = lines[index].match(/^(```|~~~)(.*)$/);
    if (!open) {
      rendered.push(lines[index]);
      continue;
    }

    const fence = open[1];
    const info = open[2].trim();
    let closeIndex = index + 1;
    while (closeIndex < lines.length && !lines[closeIndex].startsWith(fence)) {
      closeIndex += 1;
    }

    if (closeIndex >= lines.length || !shouldRenderFence(info)) {
      rendered.push(...lines.slice(index, Math.min(closeIndex + 1, lines.length)));
      index = closeIndex;
      continue;
    }

    const codeLines = lines.slice(index + 1, closeIndex);
    const sourcePath = inferFenceSourcePath(lines, closeIndex + 1);
    const code = await highlightedCodeHtml(codeLines, {
      language: languageForFence(info),
      sourcePath,
      startLine: 1,
    });
    const codeClasses = code.hasComments
      ? 'source-code source-code--standalone source-code--annotated'
      : 'source-code source-code--standalone';

    rendered.push(`<pre class="${codeClasses}" tabindex="0"><code>${code.html}</code></pre>`);
    index = closeIndex;
  }

  return rendered.join('\n');
}

async function expandSourceEvidence(markdown) {
  const withCards = await expandSourceRefs(markdown);
  const withInlineRefs = await expandInlineSourceRefs(withCards);
  return renderFencedCodeBlocks(withInlineRefs);
}

function oldHtmlRedirects() {
  return chapters
    .map((chapter) => `/chapters/${chapter.id}.html /chapters/${chapter.id}/ 301`)
    .join('\n');
}

function pageFrontmatter({ title, description, order, label }) {
  return `---\ntitle: ${quote(title)}\ndescription: ${quote(description)}\nsidebar:\n  label: ${quote(label ?? title)}\n  order: ${order}\n---\n\n`;
}

function chapterMeta(chapter) {
  const status = chapter.status === 'complete' ? '已完成' : '待补';
  const sourceFiles = chapter.sourceFiles?.length ? list(chapter.sourceFiles) : '- 待补';
  const markdownLink =
    chapter.status === 'complete'
      ? `<a href="/markdown/${chapter.id}.md"><code>markdown/${chapter.id}.md</code></a>`
      : `<code>markdown/${chapter.id}.md</code> 尚未生成`;

  return `<div class="chapter-meta">
  <div><strong>状态</strong><span class="status-badge">${status}</span></div>
  <div><strong>难度</strong>${chapter.difficulty}</div>
  <div><strong>预计阅读</strong>${chapter.estimatedMinutes} 分钟</div>
  <div><strong>源文件</strong>${markdownLink}</div>
</div>

## Agent 生成档案

- 章节 ID：\`${chapter.id}\`
- 章节摘要：${chapter.summary}
- 章节元数据：[/data/chapters.json](/data/chapters.json)
- 源码映射：[/data/source-map.json](/data/source-map.json)

## 主要源码路径

<ul class="source-list">

${sourceFiles}

</ul>
`;
}

function pendingBody(chapter) {
  return `${chapterMeta(chapter)}

## 待生成任务

这一章目前只有章节规划，还没有正文。下一个 agent 应先阅读“主要源码路径”，再按 [Agent 写作规范](/agent/writing-rules/) 生成 \`markdown/${chapter.id}.md\`，最后运行 \`pnpm run build\` 验证。

## 建议写作切入点

1. 配置文件加载顺序：全局、项目、环境变量、远程配置与内联覆盖。
2. 配置如何影响 provider、agent、permission、plugin 与 tool。
3. 用 Java 开发者熟悉的配置中心、Spring Boot property binding、profile 覆盖关系做类比。
`;
}

async function writeHomePage() {
  const complete = chapters.filter((chapter) => chapter.status === 'complete');
  const pending = chapters.filter((chapter) => chapter.status !== 'complete');
  const chapterRows = chapters
    .map((chapter) => {
      const status = chapter.status === 'complete' ? '已完成' : '待补';
      return `| ${String(chapterNumber(chapter.id)).padStart(2, '0')} | [${chapter.title}](/chapters/${chapter.id}/) | ${chapter.difficulty} | ${chapter.estimatedMinutes} 分钟 | ${status} |`;
    })
    .join('\n');

  const body = `${pageFrontmatter({
    title: 'OpenCode Agent 源码学习',
    description: '由 Codex agent 生成并维护的 OpenCode 源码学习站。',
    order: 1,
    label: '学习首页',
  })}<div class="agent-flow">
  <img src="/images/agent-doc-flow.svg" alt="Agent 文档生成流程：Markdown 和数据经过同步脚本生成 Starlight 静态站点" />
</div>

这是一个由 Codex agent 写作和维护的源码学习站点。内容源不是 CMS，也不是手写 HTML，而是稳定的 agent 输入文件：\`markdown/\` 写章节正文，\`data/\` 写结构化元数据，构建时同步到 Starlight 并编译成纯静态 HTML。

## 当前进度

- 规划章节：${progress.totalPlannedChapters}
- 已完成章节：${complete.length}
- 待补章节：${pending.map((chapter) => chapter.title).join('、') || '无'}
- 最近质量检查：\`${progress.lastQualityCheck}\`

## 章节矩阵

| # | 章节 | 难度 | 预计阅读 | 状态 |
| --- | --- | --- | --- | --- |
${chapterRows}

## 推荐学习路线

### 入门路线

01 CLI / 启动入口 -> 02 用户输入与会话 -> 13 测试与工程化 -> 14 mini agent

### Agent 核心路线

02 用户输入与会话 -> 03 Agent 核心循环 -> 04 模型 Provider / LLM 调用 -> 09 权限、审批、安全边界

### Tool calling 路线

03 Agent 核心循环 -> 05 Tool 调用系统 -> 06 文件读写与代码修改 -> 07 Shell / 命令执行 -> 08 LSP / 诊断

## Agent 入口

以后新增或改写章节时，优先阅读 [Agent 写作规范](/agent/writing-rules/)；需要理解为什么选这个框架时，阅读 [框架选择](/agent/framework-decision/)。
`;

  await writeFile(path.join(docsDir, 'index.md'), body);
}

async function writeChapterPages() {
  await rm(chapterDocsDir, { recursive: true, force: true });
  await mkdir(chapterDocsDir, { recursive: true });

  for (const chapter of chapters) {
    const order = chapterNumber(chapter.id);
    const frontmatter = pageFrontmatter({
      title: chapter.title,
      description: chapter.summary,
      order,
      label: `${String(order).padStart(2, '0')}. ${chapter.title}`,
    });

    let body;
    if (chapter.status === 'complete') {
      const markdownPath = path.join(root, chapter.markdown);
      const markdown = await readFile(markdownPath, 'utf8');
      const expandedMarkdown = await expandSourceEvidence(stripFirstHeading(markdown));
      body = `${chapterMeta(chapter)}\n\n${expandedMarkdown}\n`;
    } else {
      body = `${pendingBody(chapter)}\n`;
    }

    await writeFile(path.join(chapterDocsDir, `${chapter.id}.md`), frontmatter + body);
  }
}

async function copyPublicData() {
  await mkdir(publicDir, { recursive: true });
  await rm(path.join(publicDir, 'data'), { recursive: true, force: true });
  await rm(path.join(publicDir, 'markdown'), { recursive: true, force: true });
  await cp(path.join(root, 'data'), path.join(publicDir, 'data'), { recursive: true });
  await cp(path.join(root, 'markdown'), path.join(publicDir, 'markdown'), { recursive: true });

  const redirects = `# Preserve old hand-written HTML chapter URLs.
${oldHtmlRedirects()}
/index.html / 301
`;
  await writeFile(path.join(publicDir, '_redirects'), redirects);
}

await mkdir(docsDir, { recursive: true });
await writeHomePage();
await writeChapterPages();
await copyPublicData();

console.log(`Synced ${chapters.length} chapters into ${path.relative(root, chapterDocsDir)}`);
