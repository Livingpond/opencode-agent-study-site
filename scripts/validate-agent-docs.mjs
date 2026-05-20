import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const chapters = JSON.parse(await readFile(path.join(root, 'data/chapters.json'), 'utf8'));
const progress = JSON.parse(await readFile(path.join(root, 'data/progress.json'), 'utf8'));

const errors = [];
const ids = new Set();

function fail(message) {
  errors.push(message);
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

for (const chapter of chapters) {
  if (!chapter.id || !/^\d{2}-[a-z0-9-]+$/.test(chapter.id)) {
    fail(`Invalid chapter id: ${chapter.id}`);
  }
  if (ids.has(chapter.id)) {
    fail(`Duplicate chapter id: ${chapter.id}`);
  }
  ids.add(chapter.id);

  for (const field of ['title', 'difficulty', 'status', 'summary', 'markdown']) {
    if (!chapter[field]) {
      fail(`${chapter.id} is missing ${field}`);
    }
  }

  if (!Number.isInteger(chapter.estimatedMinutes) || chapter.estimatedMinutes <= 0) {
    fail(`${chapter.id} estimatedMinutes must be a positive integer`);
  }

  if (!Array.isArray(chapter.sourceFiles) || chapter.sourceFiles.length === 0) {
    fail(`${chapter.id} must list sourceFiles`);
  }

  const markdownPath = path.join(root, chapter.markdown);
  const markdownExists = await exists(markdownPath);
  if (chapter.status === 'complete') {
    if (!markdownExists) {
      fail(`${chapter.id} is complete but ${chapter.markdown} is missing`);
      continue;
    }
    const markdown = await readFile(markdownPath, 'utf8');
    if (!markdown.startsWith('# ')) {
      fail(`${chapter.markdown} must start with an H1`);
    }
    for (const required of ['## 0. 本章学习目标', '## 1. 一句话讲明白']) {
      if (!markdown.includes(required)) {
        fail(`${chapter.markdown} is missing required section: ${required}`);
      }
    }
  } else if (markdownExists) {
    fail(`${chapter.id} is ${chapter.status} but ${chapter.markdown} already exists`);
  }
}

for (const completedId of progress.completedChapters) {
  const chapter = chapters.find((item) => item.id === completedId);
  if (!chapter) {
    fail(`progress.completedChapters references unknown chapter: ${completedId}`);
  } else if (chapter.status !== 'complete') {
    fail(`progress.completedChapters references non-complete chapter: ${completedId}`);
  }
}

for (const remainingId of progress.remainingChapters) {
  const chapter = chapters.find((item) => item.id === remainingId);
  if (!chapter) {
    fail(`progress.remainingChapters references unknown chapter: ${remainingId}`);
  } else if (chapter.status === 'complete') {
    fail(`progress.remainingChapters references complete chapter: ${remainingId}`);
  }
}

if (process.env.CHECK_SOURCE_FILES === '1') {
  const sourceRoot = process.env.OPENCODE_SOURCE_ROOT
    ? path.resolve(process.env.OPENCODE_SOURCE_ROOT)
    : path.resolve(root, '../../../opencode');
  if (await exists(sourceRoot)) {
    for (const chapter of chapters) {
      for (const source of chapter.sourceFiles ?? []) {
        const sourcePath = path.join(sourceRoot, source.replace(/\/$/, ''));
        if (!(await exists(sourcePath))) {
          fail(`${chapter.id} source path is missing in ${sourceRoot}: ${source}`);
        }
      }
    }
  } else {
    fail(`Source root not found: ${sourceRoot}`);
  }
}

if (errors.length) {
  console.error('Agent docs validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${chapters.length} chapter records`);
