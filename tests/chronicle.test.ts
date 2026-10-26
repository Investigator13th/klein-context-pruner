import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  appendChronicleEntry,
  formatDate,
  formatTime,
} from "../src/chronicle.js";

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
