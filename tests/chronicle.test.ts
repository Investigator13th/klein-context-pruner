import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  appendChronicleEntry,
  findMemoryRoot,
  formatDate,
  formatTime,
  resolveChronicleDir,
} from "../src/chronicle.js";

/**
 * 记忆真源必须跨会话、跨工作区恒定。以下三个用例锁定这条契约：
 * cwd 一旦变化，Chronicle 绝不能分裂成两份各写各的。
 */
test("findMemoryRoot walks UP from a nested cwd instead of taking cwd literally", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memroot-"));
  try {
    fs.mkdirSync(path.join(root, "memory", "wiki", "chronicle"), { recursive: true });
    const nested = path.join(root, "home", "deep", "nested");
    fs.mkdirSync(nested, { recursive: true });

    // 从深层子目录上溯，必须回到带 memory/ 的那一层
    assert.equal(findMemoryRoot(nested), root);
    // 起点自己就是真源根时原地返回
    assert.equal(findMemoryRoot(root), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("findMemoryRoot falls back to the start dir when no memory/ exists above", () => {
  const lonely = fs.mkdtempSync(path.join(os.tmpdir(), "nomem-"));
  try {
    assert.equal(findMemoryRoot(lonely), path.resolve(lonely));
  } finally {
    fs.rmSync(lonely, { recursive: true, force: true });
  }
});

test("resolveChronicleDir lands on the SAME directory from the root and from a nested subdir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chronicle-unify-"));
  const savedEnv = process.env.KLEIN_CHRONICLE_DIR;
  const savedCwd = process.cwd();
  try {
    delete process.env.KLEIN_CHRONICLE_DIR;
    fs.mkdirSync(path.join(root, "memory", "wiki", "chronicle"), { recursive: true });
    const subdir = path.join(root, "home");
    fs.mkdirSync(subdir, { recursive: true });

    process.chdir(root);
    const fromRoot = resolveChronicleDir();
    process.chdir(subdir);
    const fromSubdir = resolveChronicleDir();

    assert.equal(fromRoot, fromSubdir, "切换工作区后 Chronicle 目录必须保持一致，否则记忆分裂");
    assert.equal(path.resolve(fromRoot), path.join(root, "memory", "wiki", "chronicle"));
  } finally {
    process.chdir(savedCwd);
    if (savedEnv === undefined) delete process.env.KLEIN_CHRONICLE_DIR;
    else process.env.KLEIN_CHRONICLE_DIR = savedEnv;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolveChronicleDir gives precedence to explicit config over env and cwd", () => {
  const savedEnv = process.env.KLEIN_CHRONICLE_DIR;
  try {
    process.env.KLEIN_CHRONICLE_DIR = path.join(os.tmpdir(), "env-should-lose");
    assert.equal(resolveChronicleDir("C:\\explicit\\chronicle"), "C:\\explicit\\chronicle");
  } finally {
    if (savedEnv === undefined) delete process.env.KLEIN_CHRONICLE_DIR;
    else process.env.KLEIN_CHRONICLE_DIR = savedEnv;
  }
});

test("formatDate and formatTime format date correctly", () => {
  const d = new Date(2026, 9, 26, 14, 5, 9); // Month is 0-indexed (9 = Oct)
  assert.equal(formatDate(d), "2026-10-26");
  assert.equal(formatTime(d), "14:05:09");
});

test("appendChronicleEntry creates a new daily file with frontmatter and initial entry", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chronicle-test-"));
  try {
    const fixedDate = new Date(2026, 9, 26, 10, 30, 0);
    const result = appendChronicleEntry(
      {
        topic: "测试排错与死锁修复",
        summary: "修复了 Patch A1 死锁，确认测试全绿通过。",
        startSeq: 10,
        endSeq: 25,
        blockId: "block-abc123456",
        verifiedReadings: ["t0-fastpath 8/8"],
      },
      {
        chronicleDir: tempDir,
        now: fixedDate,
      }
    );

    assert.equal(result.success, true);
    assert.ok(result.filePath);
    assert.equal(path.basename(result.filePath), "2026-10-26.md");

    const content = fs.readFileSync(result.filePath, "utf-8");
    assert.match(content, /tags:\s*\[chronicle,\s*daily-digest,\s*acp-pruner\]/);
    assert.match(content, /# 运行日常纪要 \(2026-10-26\)/);
    assert.match(content, /## \[10:30:00\] 测试排错与死锁修复 \(seq 10\.\.25\) \[Block block-ab\]/);
    assert.match(content, /> \*\*已验证读数\*\*：t0-fastpath 8\/8/);
    assert.match(content, /修复了 Patch A1 死锁，确认测试全绿通过。/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("appendChronicleEntry appends subsequent entries on the same day and updates updated_at", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chronicle-test-"));
  try {
    const time1 = new Date(2026, 9, 26, 10, 0, 0);
    const time2 = new Date(2026, 9, 26, 12, 15, 30);

    appendChronicleEntry(
      {
        topic: "第一轮压缩",
        summary: "处理了第 1 阶段需求。",
        startSeq: 1,
        endSeq: 5,
      },
      { chronicleDir: tempDir, now: time1 }
    );

    const result2 = appendChronicleEntry(
      {
        topic: "第二轮压缩",
        summary: "处理了第 2 阶段需求。",
        startSeq: 6,
        endSeq: 15,
      },
      { chronicleDir: tempDir, now: time2 }
    );

    assert.equal(result2.success, true);
    const content = fs.readFileSync(result2.filePath!, "utf-8");

    // 验证更新了 updated_at
    assert.match(content, /updated_at:\s*"2026-10-26 12:15:30"/);
    // 包含两轮的内容
    assert.match(content, /## \[10:00:00\] 第一轮压缩/);
    assert.match(content, /## \[12:15:30\] 第二轮压缩/);
    assert.match(content, /处理了第 1 阶段需求。/);
    assert.match(content, /处理了第 2 阶段需求。/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("appendChronicleEntry handles filesystem errors gracefully without throwing", () => {
  // 传一个非法的文件名作为目录（在 Windows 下某些字符非法，或使用不存在只读父级）
  const result = appendChronicleEntry(
    { summary: "测试容错" },
    { chronicleDir: "\0invalid-null-byte-path" }
  );

  assert.equal(result.success, false);
  assert.ok(result.error);
});
