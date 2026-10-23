/**
 * @file matrix.ts
 * @description 9-Part Information Distillation Matrix & Generic Memory Protocol
 *
 * Designed for klein-context-pruner. Provides:
 * 1. Decoupled Generic Memory Protocol (supports OpenViking, Mem0, Hindsight, etc.)
 * 2. 9-Part Information Distillation Rules for ACP summarization
 * 3. Memory Evaporation Engine (distills multi-KB memory bodies into bare URI pointers)
 */

export interface MemoryRecallSnippet {
  uri?: string
  source?: string
  abstract?: string
}

/**
 * Generic Memory Protocol detector.
 * Decoupled from OpenViking: matches any memory provider via source kind,
 * plugin name, or standard semantic memory framing tags.
 */
export function isGenericMemoryRecall(eventOrSource: string | {
  source?: { kind?: string; plugin?: string }
  content?: unknown
}): boolean {
  if (typeof eventOrSource === 'string') {
    const text = eventOrSource
    return (
      text.includes('<openviking-context') ||
      text.includes('<memory-context') ||
      text.includes('<memory uri=') ||
      text.includes('<recalled-memories') ||
      text.includes('viking://') ||
      text.includes('memory://')
    )
  }

  const source = eventOrSource.source as { kind?: string; plugin?: string } | undefined
  const kind = source?.kind ?? ''
  const plugin = source?.plugin ?? ''
  if (
    kind.includes('memory') ||
    kind.includes('recall') ||
    kind.includes('viking') ||
    kind.includes('hindsight') ||
    kind.includes('mem0') ||
    kind.includes('zep') ||
    plugin.includes('memory') ||
    plugin.includes('viking') ||
    plugin.includes('hindsight') ||
    plugin.includes('mem0')
  ) {
    return true
  }

  // Content inspection for memory framing tags
  const text = typeof eventOrSource.content === 'string'
    ? eventOrSource.content
    : JSON.stringify(eventOrSource.content ?? '')

  return (
    text.includes('<openviking-context') ||
    text.includes('<memory-context') ||
    text.includes('<memory uri=') ||
    text.includes('<recalled-memories') ||
    text.includes('viking://') ||
    text.includes('memory://')
  )
}

/**
 * Evaporate verbose memory bodies into compact URI pointers.
 * Reduces 500-2000 token memory blocks to ~30-50 tokens while retaining lookup keys.
 */
export function evaporateMemoryToUris(rawText: string): string {
  if (!isGenericMemoryRecall(rawText)) {
    return rawText
  }

  // If there's an outer container like <openviking-context>...</openviking-context>
  const containerRegex = /<(?:openviking-context|[a-z0-9_-]+-context)[\s\S]*?<\/(?:openviking-context|[a-z0-9_-]+-context)>/gi
  if (containerRegex.test(rawText)) {
    return rawText.replace(containerRegex, (block) => {
      const uris = Array.from(block.matchAll(/uri=["']([^"']+)["']/g)).map(m => m[1])
      const unique = Array.from(new Set(uris))
      return `[Memory References (${unique.length}): ${unique.join(', ')}]`
    })
  }

  // Handle individual <memory ...>...</memory> tags
  const memoryTagRegex = /<memory\s+[^>]*?uri=["']([^"']+)["'][^>]*>[\s\S]*?<\/memory>/gi
  if (memoryTagRegex.test(rawText)) {
    return rawText.replace(memoryTagRegex, (_match, uri) => {
      return `[Memory Reference: ${uri}]`
    })
  }

  const uriMatches = Array.from(rawText.matchAll(/uri=["']([^"']+)["']/g)).map(m => m[1])
  if (uriMatches.length > 0) {
    const unique = Array.from(new Set(uriMatches))
    return `[Memory References (${unique.length}): ${unique.join(', ')}]`
  }

  return rawText
}

/**
 * The 9-Part Information Distillation Matrix.
 * Authoritative rules for summarizing historical conversational content.
 */
export const INFORMATION_DISTILLATION_MATRIX = `
# 9-Part Information Distillation Matrix (信息留存与蒸馏矩阵)

1. 【用户指令与硬约束 (User Directives)】：100% 保真
   - 严禁擅自缩写或篡改用户的目标、范围约束、技术选型要求、交付标准。
   - 保留原句核心意图（标明 "User said: ..."）。

2. 【工具调用结果 (Tool Results)】：抽骨留髓（压缩比 ~95%）
   - 剔除：冗长原始日志、npm/pnpm 构建输出、重复的目录树、完整的已读文件内容。
   - 提取：绝对文件路径与行号、函数签名、关键报错堆栈、返回的核心数值或状态变更。

3. 【助手回复 (Assistant Output)】：保留决策与理由
   - 剔除：寒暄问候、中间探讨废话、思考过程的纠结、已失效的尝试假说。
   - 提取：最终架构决策（"chose X over Y because Z"）、关键代码片段、阶段交付物。

4. 【时间戳与状态快照 (Timestamps & Snapshots)】：粗粒度化
   - 剔除：秒级高频变动的时间标记。
   - 提取：仅在跨天或关键任务里程碑时保留日期锚点（YYYY-MM-DD）。

5. 【通用记忆插件召回 (Generic Memory Recalls)】：即用即焚，蒸发为 URI
   - 剔除：历史轮次注入的长篇记忆正文、实体详情、事件切片。
   - 提取：仅保留 URI 指针（如 [Memory References: viking://user/.../profile.md]）。

6. 【环境与沙箱快照 (Runtime & Sandbox)】：保留最新稳态
   - 剔除：历史步骤反复出现的运行时上下文、沙箱权限变更历史。
   - 提取：仅在影响当前会话能力时记录当前终态沙箱模式。

7. 【技能目录注入 (Skill Catalog)】：彻底丢弃
   - 剔除：动态注入的 <available_skills> 完整说明列表（当前轮已有最新注入）。

8. 【未决待办与阻碍 (Open TODOs & Blockers)】：显式高亮
   - 提取：尚未完成的 TODO 任务、待修复的 bug、待博士拍板的架构分歧点。

9. 【子 Agent 与后台任务 (Subagents & Jobs)】：仅留最终成果
   - 剔除：子 Agent 派发过程日志与中间状态。
   - 提取：子 Agent 最终交付物路径与核心结论。
`.trim()
