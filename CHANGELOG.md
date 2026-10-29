# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.1] - 2026-10-29

### 🛡️ Fixed (事务防腐与零损坏崩溃修复)
- **底层压缩事务原子防卫 (`src/region.ts`)**: 在 `runCompactionTransaction` 追加事件前注入硬性门禁，强制校验 `input.shadowedSeqs.length > 0` 且起始与结束节点必须包含在当前 `session.surface.nodes` 中；杜绝任何非合法区间产生的脏事务落盘。
- **单批次区间重叠与互斥排斥 (`src/tools.ts`)**: 模型在单次 `compress` 批量请求中如果传入覆盖相同或重叠区间的项，前置自动检测并跳过重复段，避免前序折叠将后序边缘剔除出 Surface 导致的回放崩溃。
- **动态 Surface 状态探测 (`src/tools.ts`)**: 在多段折叠执行循环中，每步均以最新的实时 `session.surface.nodes` 重新探测边界合法性，彻底解决 `SessionFormatError: compaction/summary shadowedSeqs do not name an exact current surface span` 引起的会话永久锁死问题。
- **离线会话安全修复套件**: 配套提供帧级 Zstandard 会话日志精准修复工具，支持将历史损坏会话中的孤儿 compaction 事务安全转为 `{ type: 'repair/noop', ignorable: true }`，100% 通过 DSH 官方 `sessionFormatCatalog` strict restore 严格校验。

### 🧪 Tests
- 新增 `tests/compaction-safety.test.ts`，覆盖空折叠序列拒收、非 Surface 边缘拒收与批次内区间交集判定，全套测试增至 48 项且 100% PASS。

---

## [0.2.0] - 2026-10-28

### 🌟 Added (ACP 2.0 智能修剪引擎与认知增强)
- **三级智能修剪引擎 (ACP 2.0 Smart Housekeeping, `src/housekeeping.ts`)**:
  - **靶向快刀 (Jumbo Tool Result Filter)**: 针对单次消耗 $\ge 8,000$ tokens 的超大工具输出（如大文件 `read`、长 `pwsh` 输出），在下一轮模型确认消费后主动触发精准靶向折叠，单步回收 85%+ 冗余空间。
  - **顺手收纳 (Turn Wrap-up Hook)**: 在模型完成阶段性任务（触发 `todo_write` 完成态或给出最终交付回答）时，自动触发阶段性轻量收拢。
  - **安全气囊 (Emergency Hard Stop)**: 在水位突破紧急上限时执行保底熔断，杜绝溢出崩溃。
- **剩余空间绝对水位触发算法 (Headroom-Based Trigger, Patch F, `src/nudge.ts`)**:
  - 弃用传统的纯增量（growth）触发，改为基于剩余可用 Token 空间（`headroomTokens = modelLimit - currentTokens`）的绝对水位判定；
  - 彻底解决长程会话中因增量累计不足导致的“高水位不压缩、模型注意力严重发散”的迟钝问题。
- **真实用户提问滑动窗口硬保护 (User Turn Protection, Patch A3, `src/region.ts`)**:
  - 自动识别并硬性保护最近 N 轮（默认 3 轮）真实的真人提问；
  - 即使后续有多轮短交互（如“请继续”、“继续下一步”），模型最初的原生命题与验收硬约束永不被折叠冲刷。
- **记忆足迹审查与未消费噪声物理蒸发 (Footprint Audit, `src/matrix.ts`)**:
  - 审计历史上下文中的通用记忆召回：凡在后续对话与工具调用中未被实际引用或讨论的背景切片，判定为环境噪声，压缩时 **100% 物理剔除（0 字符残留）**；
  - 真正被消费的记忆保留极简 URI 指针（如 `[Memory Reference: viking://...]`）并跨轮去重。
- **冷区编年史流式归档 (Chronicle Stream, `src/chronicle.ts`)**:
  - 模型在主会话中自主压缩的高密度技术摘要与决策，流式同步追加到工作区冷区编年史 `memory/wiki/chronicle/YYYY-MM-DD.md`，供长期知识召回与晚间 Dreaming 异步提纯。
- **角色解耦 (Role Decoupling, `src/messages.ts`)**:
  - 严格区分真实人类交互（`role: user`）与系统注入/记忆召回（`role: system`），解除记忆召回对不可压缩区间的寄生捆绑。

### 🔧 Changed
- **第一方分支化解耦 (`vendor/acp-kernel`)**: 将深度定制的 `acp-kernel 0.0.63` 直接分支内嵌至 `vendor/acp-kernel`，移除对不可靠外部 patch 脚本的依赖，全面保障构建与运行环境的确定性。
- **多层级工作区记忆根目录回溯**: 编年史机制支持向上遍历探测 `memory/` 真源，支持多工作区与子目录自适应。

---

## [0.1.0] - 2026-10-25

### 🚀 Initial Release
- **零死锁高弹状态机 (Anti-Deadlock State Machine)**:
  - 固化 Patch A1/A2（User 消息安全切断），User 消息绝不卷入待折叠区间；
  - 固化 Patch D（断洞感知与 `refToIndex` 映射），杜绝跨越不连续引用的错误拼接；
  - 固化 Patch B（高压优雅降级注入）与 Patch C（`minCompressRange: 2000`）。
- **前缀缓存亲和尾部重排引擎 (Tail Placement Engine)**:
  - 静态 Prompt 与历史轮次严格保持字节级静止；
  - 秒级时间戳（`time-context`）与 Nudge 告警动态 Token 统一重排移动至末尾，DeepSeek 64-token 前缀公共缓存命中率持续稳定在 **95% ~ 98%+**。
- **通用记忆协议解耦与即用即焚 (Generic Memory Protocol)**:
  - 跨框架自适应识别 OpenViking、Mem0、Hindsight、Zep 等记忆召回切片；
  - 压缩时自动将大段正文蒸发为轻量 URI 锚点指针。
- **九维信息留存与蒸馏矩阵 (9-Part Distillation Matrix)**:
  - 系统化规范用户指令、工具调用、架构决策、时间戳、记忆召回、沙箱终态、技能目录、未决待办与子 Agent 的留存与压缩准则。
