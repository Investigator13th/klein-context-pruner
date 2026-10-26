import fs from "node:fs";
import path from "node:path";

export interface ChronicleEntry {
  topic?: string;
  summary: string;
  startSeq?: number;
  endSeq?: number;
  blockId?: string;
  verifiedReadings?: string[];
  timestamp?: Date;
}

export interface ChronicleOptions {
  chronicleDir?: string;
  now?: Date;
}

/**
 * 格式化时间为 YYYY-MM-DD
 */
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 格式化时间为 HH:mm:ss
 */
export function formatTime(d: Date): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * 获取默认冷区 Chronicle 存储目录
 * 优先环境变量或当前工作区下的 memory/wiki/chronicle
 */
export function resolveChronicleDir(customDir?: string): string {
  if (customDir) return customDir;
  if (process.env.KLEIN_CHRONICLE_DIR) return process.env.KLEIN_CHRONICLE_DIR;
  return path.resolve(process.cwd(), "memory", "wiki", "chronicle");
}

/**
 * 将一次成功剪枝的 Summary 结构化流式追加到冷区日纪要文件
 * 零 LLM 调用消耗，静默安全，物理容错
 */
export function appendChronicleEntry(
  entry: ChronicleEntry,
  options: ChronicleOptions = {}
): { success: boolean; filePath?: string; error?: string } {
  try {
    const now = options.now || entry.timestamp || new Date();
    const dateStr = formatDate(now);
    const timeStr = formatTime(now);
    const targetDir = resolveChronicleDir(options.chronicleDir);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, `${dateStr}.md`);
    const isNewFile = !fs.existsSync(filePath);

    const titleTopic = entry.topic?.trim() || "上下文增量压缩";
    const rangeSpan =
      entry.startSeq !== undefined && entry.endSeq !== undefined
        ? ` (seq ${entry.startSeq}..${entry.endSeq})`
        : "";
    const blockRef = entry.blockId ? ` [Block ${entry.blockId.slice(0, 8)}]` : "";

    let sectionContent = `\n## [${timeStr}] ${titleTopic}${rangeSpan}${blockRef}\n\n`;

    if (entry.verifiedReadings && entry.verifiedReadings.length > 0) {
      sectionContent += `> **已验证读数**：${entry.verifiedReadings.join("; ")}\n\n`;
    }

    sectionContent += `${entry.summary.trim()}\n`;

    if (isNewFile) {
      const initialHeader = `---
created_at: "${dateStr} ${timeStr}"
updated_at: "${dateStr} ${timeStr}"
valid_until: "permanent"
importance: 6
status: "active"
source_tier: "L1_working"
tags: [chronicle, daily-digest, acp-pruner]
---

# 运行日常纪要 (${dateStr})

> 本文件由 klein-context-pruner 自动按日流式追加，汇总主会话各阶段被压缩的高密度技术摘要与决策，供冷区细节召回与晚间 Dreaming 提纯使用。

---
`;
      fs.writeFileSync(filePath, initialHeader + sectionContent, "utf-8");
    } else {
      // 若文件已存在，更新 frontmatter 的 updated_at 并追加内容
      let existingContent = fs.readFileSync(filePath, "utf-8");
      if (existingContent.includes("updated_at:")) {
        existingContent = existingContent.replace(
          /updated_at:\s*"[^"]*"/,
          `updated_at: "${dateStr} ${timeStr}"`
        );
        fs.writeFileSync(filePath, existingContent, "utf-8");
      }
      fs.appendFileSync(filePath, `\n---\n${sectionContent}`, "utf-8");
    }

    return { success: true, filePath };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    // 静默降级，不阻断主流程
    console.error(`[klein-context-pruner] Failed to append chronicle entry: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}
