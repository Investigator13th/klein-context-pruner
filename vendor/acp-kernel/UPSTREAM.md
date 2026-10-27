# acp-kernel 自研分支（vendored）登记表

本目录是 **acp-kernel 的分叉快照**，自 2026-10-27 起等价于"自研版本"。上游仅作为未来被动参照，不自动跟进。

## 一、基线信息

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/ranxianglei/acp-kernel |
| 上游版本 | `0.0.63` |
| 上游作者 | ranxianglei（MIT） |
| 快照日期 | 2026-10-27 |
| 快照形态 | **编译产物（dist）快照**，非 src 反解 |
| 快照来源 | `node_modules/acp-kernel`（已被 `scripts/patch-kernel.mjs` 打过全部补丁的版本） |
| `dist/index.js` SHA-256 | `DC59201B3627A2F4F182E25DA985C0E86038C6BD4421217C58210A9FDE683082` |
| 文件总数 / 体积 | 151 文件 / 约 1.07 MB（含 sourcemap） |
| 分发根 | `.`（仅 `dist/index.js` 被 `src/` 引用，见第四节） |

**为什么选 dist 快照而非反解 src**：自研改动只有 5 处定点替换，逐字记录于本文件并保留在 git 历史里的旧 `patch-kernel.mjs` 中，比反解 156 KB 的 minified 产物更可靠；代价是本目录不可直接阅读修改，需要"改上游再快照"的工作流（见第六节）。

## 二、自研改动清单（Patch A1 / A2 / A3 / D / B / F）

以下 5 处补丁由旧脚本 `scripts/patch-kernel.mjs` 在 `pnpm install` 的 `prepare` 与 `pnpm build` 的 `prebuild` 阶段对 `node_modules` 内的内核 dist 做字符串替换。自本快照起，这些改写已经固化为仓库内容，脚本与钩子已废弃。

### A1 — 在用户消息处分段

- 目的：压缩区间不得跨用户消息边界，否则用户原话会被折进摘要、破坏"保留用户意图"的硬约束。
- 位置：`dist/index.js` 内 `compressible` 分段循环。
- 改动：
  - 旧：`if (cur && (info.isUser && cur.count >= 3 || info.gapBefore)) {`
  - 新：`if (cur && (info.isUser || info.gapBefore)) {`
- 效果：用户消息不再需要满 3 条才切段，遇到即切。

### A2 — 用户消息不进可压缩区间

- 目的：与 A1 配套，把用户消息从 compressible 集合里彻底排除。
- 位置：同一循环体，紧随 A1 的分段块之后。
- 改动：新增一行
  - `if (info.isUser) continue;`
- 效果：即便分段后，用户消息也不会成为任何区间的起点。

### A3 — 在内核层保护最近 N 轮用户消息

- 目的：适配器层已有保护，内核层缺失会在边界条件下漏保护（旧逻辑只保护最近 1 条用户消息）。
- 位置：`preserveN > 0` 分支的用户消息保护循环。
- 改动：
  - 旧：倒序遍历，命中第一条非合成用户消息即 `break`（只保护最后 1 条）。
  - 新：引入 `let userTurnCount = 0; const maxUserTurns = config.preserveUserTurns ?? 3;`，命中后 `result.add(ref); userTurnCount++;`，达到 `maxUserTurns` 才 `break`。
- 效果：默认保护最近 3 轮，`config.preserveUserTurns` 可调。

### D — 禁止跨 ref 间隙合并区间

- 目的：`mergeRangesToThreshold` 会把中间夹着不可压缩内容的两个区间合并成一个，形成"隐形越界"。原逻辑只按字符预算合并，不检查 ref 连续性。
- 位置：`mergeRangesToThreshold` 的批次累积循环。
- 改动：在 `batch.push(r)` 之前插入间隙检测——
  - 当 `batch` 非空且 `refToIndex(r.startRef) > refToIndex(batch[batch.length - 1].endRef) + 1` 时，
  - 先 `result.push(mergeBatch(batch))` 冲掉当前批次，再清空 `batch = []` 与 `batchChars = 0`。
- 效果：连续性断裂处强制另起批次。

### B — 压力兜底注入

- 目的：压力档位下若 `bestPending < minPressureBenefit`，原逻辑静默不注入 nudge，导致超限也不提醒（死锁诱因之一）。
- 位置：`decideNudge` 的压力注入判定。
- 改动：给 `if (best !== null && bestPending >= minPressureBenefit) { ... }` 补 `else` 分支——
  - 取 `const fallbackRanges = rec?.recommendedRanges ?? [];`
  - 若非空：`injectedTier = 1;`，`injectedReason = \`${label} T1 fallback: ${fallbackRanges.length} ranges available, usage ${Math.round(usage * 100)}%\`;`
- 效果：只要有可压区间就在超限时给出 T1 兜底提示。

### F — 软触发判据：从「增长量」改为「剩余余量」

- 目的：上游软触发的判据是"距上次参考点增长了多少 token"（`growthSinceReference >= growthFloor`，`growthFloor = max(20000, 0.45 × nudgeGrowthTokens)`，`nudgeGrowthTokens` 被 cap 在 50000，故恒定 20000–22500）。这个判据隐含"上下文越长越该压"的假设，但它无法区分两种增长：**突发大粘贴**（真该压）与**长会话缓慢积累**（还有一半余量，不该压）。结果是在软触发与硬线之间只剩很窄的窗口，且压缩后回写参考点的时机被 −22500 的回落阈值卡住（`dist/index.js:2379`），压缩不重置参照点会形成自我强化。
- 位置：`dist/index.js` 的 `resolveHeadroomTokens`（新增函数）、`defaultConfig` 的 `nudge` 默认块、`decideNudge` 的软触发判定与未触发原因文案。
- 改动：
  1. 新增 `resolveHeadroomTokens(modelContextLimit, nudge)`：
     `Math.min(headroomCap, Math.max(headroomFloor, Math.round(limit × headroomRatio)))`，窗口未知时回落 `headroomFloor`。
  2. `defaultConfig` 的 `nudge` 块新增三个字段：`headroomRatio: 0.25`、`headroomFloor: 2e4`、`headroomCap: 2.5e5`；同时把 `maxContextLimitPct` 由 `0.75` 改为 `0.85`。
  3. 软触发判定替换：
     - 旧：`const growthReady = firstSightMassReady || growthSinceReference >= growthFloor`
     - 新：`const headroomTokens = resolveHeadroomTokens(limit, config.nudge); const headroomReady = limit > 0 && tokenCount >= limit - headroomTokens; const growthReady = firstSightMassReady || headroomReady`
  4. 未触发原因文案由 `growth ${growthSinceReference} < floor ${growthFloor}` 改为 `headroom ${limit - tokenCount} > reserve ${headroomTokens}`。
- 效果（`modelContextLimit = 131072`）：余量 32768，软触发 98304（75%），硬线 111411（85%），紧急 124518（95%），软硬间隔 13107。窗口越大间隔越宽（262144 → 软 75%/硬 85%，间隔 26214）。`headroomCap` 取 2.5e5 而非 5e4，是因为 5e4 在 1M 窗口下会让 `1 − ratio` 跌破硬线，软触发反而排在硬触发之后。
- 保留不动：`growthSinceReference` 仍参与 `computeContextBreakdown` 与 nudge 文案的 `+{growth}K since last nudge` 显示，只是退出判定；`lastPerMessageNudgeTokens` 的回落检测（`:2379`）、`lastShownByTier` 的 T2/T3 冷却（`:2795`/`:2802`）、`maxContextLimitPct` 超限强制触发线（现已是有意义的 0.85）全部照旧生效。

## 三、上游行为登记（未修改，仅知会）

- 现象：`acp_status` 的 drilldown 输出末尾会带一行
  `Tip: buildStatusReport({scope:"uncompressed", view:"messages", tool:"xxx"}) for per-message listing`
- 来源：内核 `renderUncompressedRanges()`（在 `dist/index.js` 内），属开发者调试信息却暴露给模型。
- 现状：**保留不动**。在自研侧过滤会破坏 `src/tools.ts:1014-1017` 的"kernel owns the report text, the engine owns the wiring"契约；要消除应直接改本快照内的该函数，等有明确收益再动。

## 四、自研侧实际消费的内核导出

`src/` 只走包根 `.` 入口，未使用 `acp-kernel/wire`、`/panel`、`/persist` 任一子路径。实际用到的具名导出：

| 符号 | 引用位置 |
|---|---|
| `defaultConfig` | `src/config.ts`、`src/commands.ts` |
| `createCore`、`setDocCacheCap`、`CompressionCore`(type) | `src/index.ts` |
| `CoreMessage`(type) | `src/messages.ts` |
| `COMPRESS_PHILOSOPHY`、`HOW_TO_COMPRESS_RULES`、`TIER2_DISTILL_RULES`、`TIER3_CONDENSE_RULES` | `src/prompts.ts` |
| `defaultCountTokens` | `src/region.ts` |
| `createInitialState`、`CompressionBlock`(type)、`CompressionState`(type) | `src/state.ts` |
| `buildStatusReport`、`defaultCountTokens`、`searchBlocks`、`CompressionCore`/`MessageRole`/`SearchDoc`(type) | `src/tools.ts` |
| `Config`(type) | `src/config.ts`、`src/index.ts`（`Partial<import('acp-kernel').Config>`） |

`src/nudge.ts` 另有一批具名导入（nudge 文案与判定相关），未逐一列明。

## 五、构建与打包事实

- `tsup.config.js` 设 `noExternal: ['acp-kernel']` → 内核在**编译期被内联**进 `dist/index.js`，不是运行时依赖。
- 因此 `dist/index.js` 是自包含产物，`acp_status` 里的内核行为全部来自 `dist`，与 `node_modules` 无关。
- 依赖声明：`devDependencies."acp-kernel": "file:vendor/acp-kernel"`（原为精确版本 `0.0.63`）。
- `vendor/acp-kernel` **已被 `files` 白名单排除**，不会随 npm 发布（发布物里内核是内联的），`file:` 依赖只是本地解析便利。

## 六、未来跟进上游的手册

当前策略：**冻结 0.0.63 + 五处补丁，只在确认上游有高价值更新时被动迭代。**

若要升级：

1. 在临时目录 `npm pack acp-kernel@<新版本>` 或 `pnpm add -D acp-kernel@<新版本>` 拿到未打补丁的新 dist；
2. 与本节第二部分的 5 处改动逐条比对——上游 AI 已修复其中任一补丁时，**删掉对应补丁**而不是叠加；
3. 对新 dist 手工重放仍需保留的补丁（旧字符串匹配锚点可能因压缩形态变化而失配，必须逐处核对命中）；
4. 覆盖 `vendor/acp-kernel/dist/`，同步更新本文件第一节的版本号与 SHA-256，重跑 `pnpm test`（当前基线 25/25 green）；
5. 若改动内核对外签名（如 `buildStatusReport` 参数），需同步评估 `src/tools.ts:1018` 的调用点。

## 七、许可证

上游 MIT，`LICENSE` 随快照保留在原位。本目录的修改部分同样以 MIT 释出。
