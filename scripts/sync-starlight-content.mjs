import { mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'src/content/docs');
const chapterDocsDir = path.join(docsDir, 'chapters');
const publicDir = path.join(root, 'public');

const chapters = JSON.parse(await readFile(path.join(root, 'data/chapters.json'), 'utf8'));
const progress = JSON.parse(await readFile(path.join(root, 'data/progress.json'), 'utf8'));

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
      body = `${chapterMeta(chapter)}\n\n${stripFirstHeading(markdown)}\n`;
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
