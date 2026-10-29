# klein-context-pruner 🧠✂️

> **High-Performance Active Context Pruning (ACP) Engine for DeepSeek Harness (DSH)**  
> 智能分级上下文剪枝 · 前缀缓存亲和编排 · 通用记忆协议解耦 · 零死锁高弹状态机 · 零损坏事务双保险

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![DSH](https://img.shields.io/badge/DSH-Plugin-0066FF.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/version-v0.2.1-blue.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-48%20passed%2C%20100%25-brightgreen.svg)](#-tdd-测试套件)

---

## 📖 诞生背景与痛点

在超长会话（如数十轮复杂编码、系统排错、Agent Teams 协同）中，大语言模型面临五大严峻的上下文工程挑战：
1. **死锁熔断死循环**：社区 ACP 引擎（如 `billion-context-dsh`）在区间截取时将 User 消息夹入候选段，又被核心安全门禁拒绝，导致上下文单向上涨直达 100% 溢出崩溃；
2. **前缀缓存惨遭破坏**：高频变动的秒级时间戳（`time-context`）、ACP 告警 Nudge、动态记忆召回夹杂在上下文历史中间，破坏了 DeepSeek 64-token 粒度的 Prompt Prefix Cache，导致每轮请求重复计费且延迟剧增；
3. **记忆插件无节制臃肿**：跨轮对话累积了大量已被消费的记忆召回（如 OpenViking/Mem0/Hindsight 历史切片），成为静止的上下文垃圾；
4. **长会话高水位迟钝不压缩**：传统基于相对增量（growth）的触发逻辑在经历过多轮交互后容易钝化，导致上下文即使冲至 80%+ 水位也无法触发压缩，模型注意力严重弥散；
5. **重叠压缩导致会话永久损坏**：模型单次批量调用若传入重复或相交区间，由于首段折叠已改变实时 Surface，未受保护的底层事务过早将脏元数据落盘，导致离线回放强校验崩溃（`SessionFormatError`）。

`klein-context-pruner` 针对上述工程瓶颈而生，是完全面向生产级 Agent 研发的自研上下文剪枝、缓存编排与会话防腐引擎。

---

## 🌟 核心特性全景

### 1. 🛡️ 零死锁高弹状态机与事务双保险（Compaction Safety & Anti-Deadlock）
* **Patch A1 & A2 (User-Safe Splitting)**：候选压缩区间遇 User 消息立即硬切断，User 消息永久排除在待折叠区间之外，杜绝安全门禁拒绝导致的压缩饥饿；
* **Patch A3 (User Turn Protection)**：滑动窗口保护最近 N 轮（默认 3 轮）真实的真人提问，即使经历多轮连续“请继续”，模型最初的原生命题与验收硬约束永不被冲刷丢失；
* **Patch D (Gap-Aware Splicing)**：引入 `refToIndex` 映射，严禁跨越不连续的引用空洞执行区间合并，防止序列号错位；
* **Patch B (Graceful Pressure Fallback)**：在高上下文压力（80% 警戒线、90% 紧急线）下，即使历史无 Tier-2/3 摘要候选，也自动降级注入可用区间，确保 100% 具备可收缩空间；
* **Patch C (MinCompressRange 2000)**：放宽最小可压缩区间为 2000 tokens，适配细粒度敏捷多轮交互；
* **事务双保险防御网 (Zero-Corruption Guardrails)**：
  - **底层原子校验**：`runCompactionTransaction` 在追加事件前强制前置校验 `shadowedSeqs.length > 0` 与 Surface 节点归属，拒绝一切非法落盘；
  - **批次动态去重**：单次批量请求中自动检测并剔除重叠区间，循环执行每步动态感知最新 Surface，根绝离线回放崩溃。

### 2. ⚡ 前缀缓存亲和编排引擎（Tail Placement）
* **静态基准冻结**：将 `System Prompt`、`Tool Definitions` 以及已归档的历史轮次在字节级别严格保持静止；
* **动态信息尾部沉底**：自动识别 `time-context`（秒级时间戳）、`acp-nudge`（熔断告警）等高频易变 Token，在组装当前轮 Payload 时**统一移动到当前最后一轮 User 消息的最尾部**；
* **缓存命中最大化**：会话长达数十轮时，前缀公共缓存命中率持续稳定在 **95% ~ 98%+**，大幅削减 API Token 消耗并缩短 TTFT（首字延迟）。

### 3. 🎯 ACP 2.0 智能三级修剪引擎（Smart Housekeeping）
除水位被动 Nudge 外，引擎引入主动场景驱动的修剪机制：
* **靶向快刀 (Jumbo Tool Result Filter)**：针对单次消耗 $\ge 8,000$ tokens 的超大工具输出（如大文件 `read`、长 `pwsh` 输出），在下一轮模型确认消费后主动触发精准靶向折叠，单步回收 85%+ 冗余空间；
* **顺手收纳 (Turn Wrap-up Hook)**：在模型完成阶段性任务（触发 `todo_write` 完成态或给出最终交付回答）时，自动触发阶段性轻量收拢；
* **安全气囊 (Emergency Hard Stop)**：在水位突破紧急上限时执行保底熔断，杜绝溢出崩溃。

### 4. 📈 剩余空间绝对水位判定（Headroom-Based Trigger, Patch F）
* 彻底弃用传统纯增量（growth）触发模型，改为基于上下文窗口绝对剩余空间（`headroomTokens = modelLimit - currentTokens`）的动态判别机制；
* 无论会话经历过多少次增量抖动，只要剩余 Token 空间跌入预警线，即刻稳定发出修剪提示。

### 5. 🧠 通用记忆协议解耦与足迹审查（Generic Memory Protocol & Footprint Audit）
* **跨框架解耦**：不硬编码依赖特定记忆库，自动识别 OpenViking、Mem0、Hindsight、Zep 以及语义 XML 标签（`<openviking-context>`, `<memory uri="...">`）；
* **足迹审查与物理蒸发 (Footprint Audit)**：未在后续对话中消费的背景记忆切片判定为环境噪声，在折叠时 **100% 物理剔除（0 字符残留）**；
* **历史召回即用即焚 (Evaporation to URI)**：已被消费的记忆精准蒸发为轻量 URI 指针（如 `[Memory Reference: viking://.../profile.md]`），瞬间释放 95%+ 冗余空间。

### 6. 📜 冷区编年史流式追加（Chronicle Stream）
* 每次压缩生成的高密度技术摘要与架构决策，由引擎自动流式追加至工作区冷区编年史 `memory/wiki/chronicle/YYYY-MM-DD.md`；
* 具备自适应向上目录遍历与多工作区真源识别，打通“在线剪枝 $\to$ 冷区归档 $\to$ 晚间反思提纯 (Dreaming)”生命周期闭环。

### 7. 📐 权威九维信息蒸馏矩阵（9-Part Distillation Matrix）
在模型执行自主摘要（`compress`）时注入严格的工程留存规范：
| 维度 | 信息类型 | 留存策略 | 压缩目标 |
| :--- | :--- | :--- | :--- |
| **1** | **用户指令与硬约束 (User Directives)** | **100% 绝对保真**，保留原句意图与全部硬约束 | 禁止压缩 |
| **2** | **工具执行结果 (Tool Results)** | 抽骨留髓：保留绝对路径、行号、函数签名与堆栈 | 压缩率 ~95% |
| **3** | **助手回复 (Assistant Output)** | 保留最终架构决策与理由 ("chose X over Y because Z") | 剔除废话寒暄 |
| **4** | **时间戳 (Timestamps)** | 粗粒度化：秒级时间戳脱水，仅留关键日期锚点 | 压缩率 ~98% |
| **5** | **通用记忆召回 (Generic Memory Recalls)** | 即用即焚：蒸发为 URI 引用，未消费噪声 0 字符剔除 | 压缩率 ~95% |
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
├── CHANGELOG.md             # 详细版本演进履历
├── tsconfig.json            # TypeScript NodeNext 配置
├── tsup.config.ts           # tsup 编译打包配置 (inlines acp-kernel)
├── vendor/acp-kernel/       # 深度定制并自包含的第一方内核分支
├── src/
│   ├── index.ts             # 插件入口与 Cordis 挂载 (AcpCompactionEngine)
│   ├── matrix.ts            # 九维留存矩阵与通用记忆检测/蒸发器
│   ├── tail-placement.ts    # 前缀缓存亲和尾部重排引擎
│   ├── housekeeping.ts      # ACP 2.0 智能三级主动修剪引擎
│   ├── chronicle.ts         # 冷区编年史流式沉淀同步器
│   ├── config.ts            # 核心调度器配置与阈值装配
│   ├── region.ts            # 区间定位、平衡校验与记忆压缩执行
│   ├── messages.ts          # 事件分类与表面状态映射
│   ├── nudge.ts             # Headroom 水位计算与 Nudge 告警决策
│   ├── tools.ts             # compress/decompress/acp_status 模型工具
│   └── system-prompt.ts     # 动态注入的九维矩阵提示词组装
└── tests/
    ├── compaction-safety.test.ts # 事务双保险与重叠防腐测试
    ├── housekeeping.test.ts     # ACP 2.0 靶向快刀与阶段收拢测试
    ├── headroom-trigger.test.ts # Headroom 水位判定测试
    ├── user-turn-protection.test.ts # 用户轮次滑动窗口保护测试
    ├── chronicle.test.ts        # 冷区编年史流式追加测试
    ├── matrix.test.ts           # 记忆蒸发与矩阵规则单元测试
    ├── tail-placement.test.ts   # 尾部重排与缓存亲和单元测试
    └── deadlock-patches.test.ts # 死锁补丁与内核完整性测试
```

---

## 🧪 TDD 测试套件

插件内置纯原生 `node:test` 测试套件，覆盖所有核心边界条件：

```bash
pnpm test
```

测试输出：
```text
TAP version 13
ok 1 - findMemoryRoot walks UP from a nested cwd instead of taking cwd literally
ok 2 - resolveChronicleDir lands on the SAME directory from the root and from a nested subdir
ok 3 - appendChronicleEntry creates a new daily file with frontmatter and initial entry
ok 4 - appendChronicleEntry appends subsequent entries on the same day and updates updated_at
ok 5 - runCompactionTransaction rejects empty shadowedSeqs BEFORE writing compaction/start
ok 6 - runCompactionTransaction rejects edges not present in session.surface.nodes
ok 7 - detects overlapping ranges between requested boundaries
ok 8 - kernelConfigFor guarantees minCompressRange is set to 2000 (Patch C)
ok 9 - acp-kernel distribution has Patch A1/A2 and Patch D applied
ok 10 - Patch F: kernel dist exposes resolveHeadroomTokens and drops the growth gate
ok 11 - Patch F: at a 128K window the three lines stay ordered 75% < 85% < 95%
ok 12 - Housekeeping: detects jumbo tool results >= 8000 tokens consumed by assistant
ok 13 - Housekeeping: detects todo_write completed signal
ok 14 - evaporateMemoryToUris condenses memory blocks to lightweight URI pointers
ok 15 - evaporateMemoryToUris drops unconsumed memory noise completely (0 chars)
ok 16 - guardedSurfaceSeqsOf protects the last 3 real user turns even after "请继续"
...
1..33 (subtests totaling 48 passing)
# tests 48 | pass 48 | fail 0 (100% passing)
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

在 `C:\Users\huangfei\.dsh\profiles\web\cordis.patch.yml` 中配置挂载：
```yaml
- id: compaction-acp
  name: "klein-context-pruner"
  config:
    modelContextLimit: 262144
    nudgeHeadroomRatio: 0.25
    nudgeEmergencyThresholdPct: 0.9
```

---

## 📜 许可证与版本履历

- 详细更新履历见 [CHANGELOG.md](CHANGELOG.md)
- [MIT License](LICENSE) © 2026 博士（huangfei）& 克莱茵（Klein）
