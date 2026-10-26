import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isGenericMemoryRecall,
  evaporateMemoryToUris,
  INFORMATION_DISTILLATION_MATRIX,
} from '../src/matrix.ts'

test('Generic Memory Recall Matcher identifies various memory providers', () => {
  // 1. OpenViking provider
  assert.equal(
    isGenericMemoryRecall({
      source: { kind: 'plugin:openviking-memory' },
      content: 'some context',
    }),
    true,
    'should match plugin:openviking-memory',
  )

  // 2. Mem0 provider
  assert.equal(
    isGenericMemoryRecall({
      source: { kind: 'plugin:mem0-memory' },
      content: 'some context',
    }),
    true,
    'should match plugin:mem0-memory',
  )

  // 3. Hindsight provider
  assert.equal(
    isGenericMemoryRecall({
      source: { kind: 'plugin:hindsight' },
      content: 'some context',
    }),
    true,
    'should match plugin:hindsight',
  )

  // 4. XML tagged content
  assert.equal(
    isGenericMemoryRecall({
      content: '<openviking-context><memory uri="viking://user/profile.md">profile</memory></openviking-context>',
    }),
    true,
    'should match XML openviking-context',
  )

  // 4.1 klein-memory XML tagged content
  assert.equal(
    isGenericMemoryRecall({
      content: '<klein-memory-context query="架构"><memory-block id="viking://user/profile.md">profile</memory-block></klein-memory-context>',
    }),
    true,
    'should match XML klein-memory-context',
  )

  // 5. Plain user message (must NOT match)
  assert.equal(
    isGenericMemoryRecall({
      source: { kind: 'user' },
      content: '克莱茵，帮我查一下日程',
    }),
    false,
    'should NOT match regular user message',
  )

  // 6. Tool result (must NOT match)
  assert.equal(
    isGenericMemoryRecall({
      source: { kind: 'tool-result' },
      content: 'Listing directory contents...',
    }),
    false,
    'should NOT match tool result',
  )
})

test('evaporateMemoryToUris condenses memory blocks to lightweight URI pointers', () => {
  const verboseMemoryBlock = `
Before text
<openviking-context>
<memory uri="viking://user/huangfei/memories/preferences/博士/作息偏好.md" type="preferences" score="0.85">
博士习惯晚睡，一般在凌晨 1 点左右休息，早晨 8:00 左右起床。
日常饮食清淡，不喜油腻。
</memory>
<memory uri="viking://user/huangfei/memories/entities/软件项目/deepseek_harness.md" type="entities" score="0.72">
DSH 是当前的核心宿主系统。
</memory>
</openviking-context>
After text
`
  const evaporated = evaporateMemoryToUris(verboseMemoryBlock)

  // Checks
  assert.ok(!evaporated.includes('博士习惯晚睡'), 'should strip bulky memory body')
  assert.ok(evaporated.includes('viking://user/huangfei/memories/preferences/博士/作息偏好.md'), 'should preserve first URI')
  assert.ok(evaporated.includes('viking://user/huangfei/memories/entities/软件项目/deepseek_harness.md'), 'should preserve second URI')
  assert.ok(evaporated.includes('Before text'), 'should preserve surrounding text before')
  assert.ok(evaporated.includes('After text'), 'should preserve surrounding text after')
  assert.ok(evaporated.includes('Memory References'), 'should indicate memory reference')
})

test('evaporateMemoryToUris leaves plain text completely intact', () => {
  const plainText = '这是一个普通的用户输入或工具输出，没有任何记忆 XML 标签。'
  assert.equal(evaporateMemoryToUris(plainText), plainText)
})

test('9-part Information Distillation Matrix contains all required cognitive dimensions', () => {
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('1. 【用户指令与硬约束 (User Directives)】'), 'contains dimension 1')
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('2. 【工具调用结果 (Tool Results)】'), 'contains dimension 2')
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('3. 【助手回复 (Assistant Output)】'), 'contains dimension 3')
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('4. 【时间戳与状态快照 (Timestamps & Snapshots)】'), 'contains dimension 4')
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('5. 【通用记忆插件召回 (Generic Memory Recalls)】'), 'contains dimension 5')
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('6. 【环境与沙箱快照 (Runtime & Sandbox)】'), 'contains dimension 6')
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('7. 【技能目录注入 (Skill Catalog)】'), 'contains dimension 7')
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('8. 【未决待办与阻碍 (Open TODOs & Blockers)】'), 'contains dimension 8')
  assert.ok(INFORMATION_DISTILLATION_MATRIX.includes('9. 【子 Agent 与后台任务 (Subagents & Jobs)】'), 'contains dimension 9')
})

test('evaporateMemoryToUris drops unconsumed memory noise completely (0 chars) during footprint audit', () => {
  const noiseBlock = `
<klein-memory-context query="做饭 菜单">
  <memory-block id="viking://user/huangfei/memories/preferences/食谱/辣子鸡.md" score="0.88">
    做辣子鸡需要准备干辣椒、鸡腿肉、花椒、生姜和大蒜。
  </memory-block>
</klein-memory-context>
`
  // 上下文区间实际在讨论代码重构与 Git 提交，完全没有提及辣子鸡或做饭
  const contextWindowText = '用户问：帮我看一下这个 Git 提交和 TypeScript 编译报错。助手回复：报错原因在于类型未定义。'

  const result = evaporateMemoryToUris(noiseBlock, contextWindowText)
  assert.equal(result, '', 'Unconsumed memory recall must be completely dropped to 0 characters')
})

test('evaporateMemoryToUris keeps consumed memories and handles deduplication', () => {
  const memoryBlock = `
<klein-memory-context query="作息 与 宿主">
  <memory-block id="viking://user/huangfei/memories/preferences/作息偏好.md" score="0.92">
    博士习惯晚睡早起。
  </memory-block>
  <memory-block id="viking://user/huangfei/memories/entities/deepseek_harness.md" score="0.85">
    DSH 是核心宿主系统。
  </memory-block>
</klein-memory-context>
`
  // 上下文中助手回答了关于作息的建议，但没有提到 deepseek_harness
  const contextWindowText = '助手回复：根据您的作息偏好，建议今晚在 0 点前入睡。'

  const result = evaporateMemoryToUris(memoryBlock, contextWindowText)
  // 仅保留作息偏好.md，deepseek_harness.md 因为未消费被剔除
  assert.ok(result.includes('作息偏好.md'), 'Consumed memory must be preserved')
  assert.ok(!result.includes('deepseek_harness.md'), 'Unconsumed memory must be evicted')
  assert.ok(!result.includes('博士习惯晚睡早起'), 'Verbose body must be stripped')
  assert.equal(result, '[Memory Reference: viking://user/huangfei/memories/preferences/作息偏好.md]')
})

