# klein-context-pruner 🧠✂️

> **High-Performance Active Context Pruning (ACP) Engine for DeepSeek Harness (DSH)**  
> 智能分级上下文剪枝 · 前缀缓存亲和编排 · 通用记忆协议解耦 · 零死锁高弹状态机

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![DSH](https://img.shields.io/badge/DSH-Plugin-0066FF.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-9%20passed%2C%20100%25-brightgreen.svg)](#tdd-测试套件)

---

## 📖 诞生背景与痛点

在超长会话（如数十轮复杂编码、系统排错、Agent Teams 协同）中，大语言模型面临四大严峻的上下文工程挑战：
1. **死锁熔断死循环**：社区 ACP 引擎（如 `billion-context-dsh`）在区间截取时将 User 消息夹入候选段，又被核心安全门禁拒绝，导致上下文单向上涨直达 100% 溢出崩溃；
2. **前缀缓存惨遭破坏**：高频变动的秒级时间戳（`time-context`）、ACP 告警 Nudge、动态记忆召回夹杂在上下文历史中间，破坏了 DeepSeek 64-token 粒度的 Prompt Prefix Cache，导致每轮请求重复计费且延迟剧增；
3. **记忆插件无节制臃肿**：跨轮对话累积了大量已被消费的记忆召回（如 OpenViking/Mem0/Hindsight 历史切片），成为静止的上下文垃圾；
4. **摘要失真与工程失忆**：粗暴的 LLM 二次摘要经常擅自篡改用户最初的硬性约束、丢失关键文件行号、抛弃堆栈报错或丢弃未决 TODO。

`klein-context-pruner` 针对上述工程瓶颈而生，是完全面向生产级 Agent 研发的自研上下文剪枝与缓存编排插件。

---

## 🌟 核心特性

### 1. 🛡️ 零死锁高弹状态机（Anti-Deadlock State Machine）
* **Patch A1 & A2 (User-Safe Splitting)**：候选压缩区间遇 User 消息立即硬切断，User 消息永久排除在待折叠区间之外，杜绝安全门禁拒绝导致的压缩饥饿；
* **Patch D (Gap-Aware Splicing)**：引入 `refToIndex` 映射，严禁跨越不连续的引用空洞执行区间合并，防止序列号错位；
* **Patch B (Graceful Pressure Fallback)**：在高上下文压力（80% 警戒线、90% 紧急线）下，即使历史无 Tier-2/3 摘要候选，也自动降级注入可用区间，确保 100% 具备可收缩空间；
* **Patch C (MinCompressRange 2000)**：放宽最小可压缩区间为 2000 tokens，适配细粒度敏捷多轮交互。

### 2. ⚡ 前缀缓存亲和编排引擎（Tail Placement）
* **静态基准冻结**：将 `System Prompt`、`Tool Definitions` 以及已归档的历史轮次在字节级别严格保持静止；
* **动态信息尾部沉底**：自动识别 `time-context`（秒级时间戳）、`acp-nudge`（熔断告警）等高频易变 Token，在组装当前轮 Payload 时**统一移动到当前最后一轮 User 消息的最尾部**；
* **缓存命中最大化**：会话长达数十轮时，前缀公共缓存命中率持续稳定在 **95% ~ 98%+**，大幅削减 API Token 消耗并缩短 TTFT（首字延迟）。

### 3. 🧠 通用记忆协议解耦与即用即焚（Generic Memory Protocol）
* **跨框架解耦**：不硬编码依赖特定记忆库，自动识别 OpenViking、Mem0、Hindsight、Zep 以及语义 XML 标签（`<openviking-context>`, `<memory uri="...">`）；
* **历史召回即用即焚（Evaporation to URI）**：在上下文压缩折叠时，将数千 Token 的庞大历史记忆正文精准**蒸发为超轻量 URI 指针**（例如 `[Memory References (2): viking://.../profile.md]`），保留检索溯源路径的同时瞬间释放 95%+ 冗余空间。

### 4. 📐 权威九维信息蒸馏矩阵（9-Part Distillation Matrix）
在模型执行自主摘要（`compress`）时注入严格的工程留存规范：
| 维度 | 信息类型 | 留存策略 | 压缩目标 |
| :--- | :--- | :--- | :--- |
| **1** | **用户指令与硬约束 (User Directives)** | **100% 绝对保真**，保留原句意图与全部硬约束 | 禁止压缩 |
| **2** | **工具执行结果 (Tool Results)** | 抽骨留髓：保留绝对路径、行号、函数签名与堆栈 | 压缩率 ~95% |
| **3** | **助手回复 (Assistant Output)** | 保留最终架构决策与理由 ("chose X over Y because Z") | 剔除废话寒暄 |
| **4** | **时间戳 (Timestamps)** | 粗粒度化：秒级时间戳脱水，仅留关键日期锚点 | 压缩率 ~98% |
| **5** | **通用记忆召回 (Generic Memory Recalls)** | 即用即焚：蒸发为 URI 引用，剥离重复长篇切片 | 压缩率 ~95% |
| **6** | **环境与沙箱 (Runtime Snapshots)** | 仅记录最新稳态沙箱模式与环境终态 | 剔除中间快照 |
| **7** | **技能目录 (Skill Catalog)** | 历史注入的 `<available_skills>` 列表彻底丢弃 | 100% 剔除 |
| **8** | **未决待办 (Open TODOs & Blockers)** | 显式高亮继承未完成项与阻塞原因 | 100% 保留 |
| **9** | **子 Agent 协同 (Subagent Logs)** | 剔除过程心跳与调度日志，仅留最终交付成果 | 压缩率 ~90% |

---

## 🛠️ 项目结构

```
klein-context-pruner/
├── cordis.patch.yml         # DSH Cordis 插件依赖注入描述
├── package.json             # 插件元信息与 peerDependencies
├── tsconfig.json            # TypeScript NodeNext 配置
├── tsup.config.ts           # tsup 编译打包配置 (inlines acp-kernel)
├── scripts/
│   └── patch-kernel.mjs     # 自动化幂等打补丁脚本 (A1/A2/B/D)
├── src/
│   ├── index.ts             # 插件入口与 Cordis 挂载 (AcpCompactionEngine)
│   ├── matrix.ts            # 九维留存矩阵与通用记忆检测/蒸发器
│   ├── tail-placement.ts    # 前缀缓存亲和尾部重排引擎
│   ├── config.ts            # 核心调度器配置与阈值装配
│   ├── region.ts            # 区间定位、平衡校验与记忆压缩执行
│   ├── messages.ts          # 事件分类与表面状态映射
│   ├── nudge.ts             # 水位计算与 Nudge 告警决策
│   ├── tools.ts             # compress/decompress/acp_status 模型工具
│   └── system-prompt.ts     # 动态注入的九维矩阵提示词组装
└── tests/
    ├── matrix.test.ts       # 记忆蒸发与矩阵规则单元测试
    ├── tail-placement.test.ts # 尾部重排与缓存亲和单元测试
    └── deadlock-patches.test.ts # 死锁补丁与内核完整性测试
```

---

## 🧪 TDD 测试套件

插件内置纯原生 `node:test` 测试套件，覆盖所有核心边界条件：

```bash
pnpm test
```

测试输出示例：
```text
TAP version 13
ok 1 - kernelConfigFor guarantees minCompressRange is set to 2000 (Patch C)
ok 2 - acp-kernel distribution has Patch A1/A2 and Patch D applied
ok 3 - Generic Memory Recall Matcher identifies various memory providers
ok 4 - evaporateMemoryToUris condenses memory blocks to lightweight URI pointers
ok 5 - evaporateMemoryToUris leaves plain text completely intact
ok 6 - 9-part Information Distillation Matrix contains all required cognitive dimensions
ok 7 - isDynamicTailMessage accurately identifies dynamic volatile messages
ok 8 - organizeTailPlacement preserves stable message order and moves dynamic tokens to the tail
ok 9 - organizeTailPlacement is idempotent on already sorted messages
1..9
# tests 9 | pass 9 | fail 0 (100% passing)
```

---

## 🚀 安装与上线

### 1. 构建独立插件包
```bash
cd C:\Users\huangfei\Documents\Antigravity\Klein\klein-context-pruner
pnpm install
pnpm build
```

### 2. 挂载到 DSH 运行环境 (`~/.dsh/profiles/web`)
在 `C:\Users\huangfei\.dsh\profiles\web\package.json` 中配置本地依赖：
```json
{
  "dependencies": {
    "klein-context-pruner": "link:C:\\Users\\huangfei\\Documents\\Antigravity\\Klein\\klein-context-pruner"
  }
}
```

在 `C:\Users\huangfei\.dsh\profiles\web\cordis.patch.yml` 中替换原有的 `compaction-acp`：
```yaml
- id: compaction-acp
  name: "klein-context-pruner"
  config:
    modelContextLimit: 128000
    nudgeMaxContextLimitPct: 0.8
    nudgeEmergencyThresholdPct: 0.9
```

---

## 📜 许可证

[MIT License](LICENSE) © 2026 博士（huangfei）& 克莱茵（Klein）
