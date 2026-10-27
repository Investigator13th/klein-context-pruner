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
 * 获取冷区 Chronicle 存储目录。
 *
 * 解析优先级：显式配置 > 环境变量 > 一致性回退。
 *
 * 记忆真源必须跨会话、跨工作区恒定，所以这里绝不能把 `process.cwd()` 作为
 * 首选。cwd 会随会话切换主工作区而改变：一旦把某个子目录设为主工作区，
 * Chronicle 就会新建一份同名目录，与真正的冷区各写各的，晚间 Dreaming 读到
 * 的是旧副本，记忆自此分裂。
 *
 * 回退策略是「向上搜索」而非「就地取用」：从 cwd 逐级上溯，第一个包含
 * `memory/` 的目录即为真源根。这样从 Klein 根、从 Klein/home，或从任何
 * Klein 子目录启动，都会一致地落到同一个 `Klein/memory/wiki/chronicle`。
 */
export function resolveChronicleDir(customDir?: string): string {
  if (customDir) return customDir;
  if (process.env.KLEIN_CHRONICLE_DIR) return process.env.KLEIN_CHRONICLE_DIR;
  const memoryRoot = findMemoryRoot(process.cwd());
  return path.join(memoryRoot, "memory", "wiki", "chronicle");
}

/**
 * 从起始目录向上寻找最近的、包含 `memory/` 子目录的**父目录**（即记忆真源根，
 * 例如 `Klein`，而非 `Klein/memory`）。
 * 找不到时返回起始目录本身（保持旧行为，不抛错）。
 */
export function findMemoryRoot(startDir: string): string {
  let current = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(current, "memory"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
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
