# ocosay Bug修复与功能增强工作计划

## TL;DR

> **快速摘要**: 修复 ocosay TTS 插件的 Toast 不工作、text7.split 错误、流式播放阻塞等问题，并增强日志功能。
>
> **核心修复**: P0问题（Toast延迟、全局变量竞态、错误处理）+ P1问题（流式按需初始化、背压处理）+ 日志系统
>
> **交付物**: 
> - Toast 可靠显示（7秒延迟+重试）
> - 流式播放按需初始化（不配置autoRead也能用）
> - 统一日志模块（~/.ocosay/logs/）
> - 完整测试覆盖
>
> **预计工作量**: Medium
> **并行执行**: YES（3 waves）

---

## Context

### 问题背景
ocosay v1.0.22 已发布，当前存在以下问题：
1. toast 弹窗不好使 - 打开 opencode cli 后，插件成功加载后没有 toast 提示
2. 语音播报报错：`text7.split is not a function`
3. 功能要求未满足

### 调研结果汇总

#### 小猪需求分析
- **text7.split 错误**: 不在 ocosay 代码库中，来自 OpenCode 框架层
- **Toast 不工作**: TUI 未初始化或 showToast 函数获取时机问题
- **流式播放阻塞**: autoRead 必须配置为 true 才初始化流式组件

#### 卧龙技术调研
- DCP Toast 实现: `ctx.client.tui.showToast()` + **7秒延迟**确保TUI就绪
- ocosay Toast 问题: 延迟只有**1秒**，可能不够
- text7.split: 代码库中**未找到**相关代码

#### 凤雏架构评审
1. Toast架构: 采用 7秒延迟 + 3次重试模式
2. 流式播放: 实现按需初始化，autoRead不再是硬性要求
3. 错误处理: 添加全局错误边界
4. 日志功能: 创建统一Logger类

#### 萍萍代码评审
**P0阻塞问题（必须修复）**:
- P0-1: Toast延迟时间过短（1秒 vs DCP的7秒）
- P0-2: 全局Toast函数重复赋值存在竞态
- P0-3: Speaker.play()中Toast调用缺少错误处理

**P1重要问题（应该修复）**:
- P1-1: 流式播放队列处理存在潜在阻塞
- P1-2: StreamPlayer背压处理缺失
- P1-3: 缺少日志系统

---

## Work Objectives

### Core Objective
修复 ocosay 插件的 P0 阻塞问题，增强流式播放和日志功能

### Concrete Deliverables
- [x] Toast 可靠显示（7秒延迟+重试机制）
- [x] 流式播放按需初始化（不配置autoRead也能用）
- [x] 统一日志模块（~/.ocosay/logs/）
- [x] 完整测试覆盖

### Must Have
- Toast 插件加载成功/失败提示
- 播放成功/失败 Toast 提示
- 不配置 autoRead 也能使用流式播放
- 日志文件输出到 ~/.ocosay/logs/

### Must NOT Have (Guardrails)
- 不要修改 baseURL（必须是 api.minimaxi.com）
- 不要修改 Provider 架构
- 不要移除现有的测试用例

### OpenCode Plugin 标准约束 ⚠️
**ocosay 必须严格遵循 OpenCode CLI Plugin 标准架构**

根据卧龙对 @opencode-ai/plugin SDK 和 DCP 的调研，发现以下标准要求：

#### 1. 导出格式标准
| 项目 | 标准要求 | 当前状态 |
|------|----------|----------|
| id导出 | `export default { id, server }` | ❌ 缺失id |
| server类型 | `const server: Plugin = ... satisfies Plugin` | ❌ 无satisfies |
| 顶层id | `const id = "ocosay"` | ❌ 缺失 |

**当前问题** (plugin.ts:302-303):
```typescript
export const server = OcosayPlugin
export default OcosayPlugin  // 应该是 { id, server }
```

**修复方案**:
```typescript
const id = "ocosay"
const server: Plugin = (async (input, options) => {
    // ... existing logic
}) satisfies Plugin

export default { id, server }
```

#### 2. 全局状态标准
| 项目 | 标准要求 | 当前状态 |
|------|----------|----------|
| 全局污染 | 禁止使用 global 对象存储TUI API | ❌ 使用了 global |
| API获取 | 通过 ctx 参数传递 | ❌ 通过 global |

**当前问题**:
- plugin.ts:180-183 使用 `(global as any).__opencode_tui_showToast__`
- index.ts:127 使用 `(__global as any).__opencode_tuieventbus__`

**修复方案**: 通过函数参数传递 TUI API，而非全局变量

#### 3. config hook 标准
| 项目 | 标准要求 | 当前状态 |
|------|----------|----------|
| config hook | 正确实现，可修改opencodeConfig | ❌ 空实现 |

**修复方案**:
```typescript
config: async (opencodeConfig) => {
    // 添加 ocosay 命令
    opencodeConfig.command ??= {}
    opencodeConfig.command["tts"] = { template: "", description: "TTS playback control" }
}
```

#### 4. event hook 标准
| 项目 | 标准要求 | 当前状态 |
|------|----------|----------|
| 职责分离 | event只做事件路由 | ❌ 做了太多事 |

**修复方案**: 分离职责，event hook 只做路由，具体逻辑放到独立函数

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: YES (Tests-after)
- **Framework**: Jest
- **Agent-Executed QA**: Playwright for UI verification

### QA Policy
- 所有修复必须通过现有测试
- 新功能必须添加对应测试用例
- Agent-Executed QA Scenarios 必须包含在每个TODO中

### OpenCode Plugin 标准验收检查 ⚠️

**所有任务必须通过以下 Plugin 标准验收检查：**

#### 导出格式检查
```bash
# 检查1: 必须有 id 导出
grep -n 'const id = "ocosay"' src/plugin.ts

# 检查2: 必须使用 satisfies Plugin
grep -n 'satisfies Plugin' src/plugin.ts

# 检查3: export default 必须是 { id, server }
grep -n 'export default' src/plugin.ts
```

#### 全局状态检查
```bash
# 检查: 禁止使用 global 存储 TUI API
grep -n 'global.*__opencode_tui' src/plugin.ts  # 应该返回空
grep -n 'global.*__opencode_tui' src/index.ts  # 应该返回空
```

#### config hook 检查
```bash
# 检查: config hook 必须有实现
grep -A5 'config:' src/plugin.ts  # 不能是空实现
```

#### event hook 检查
```bash
# 检查: event hook 应该职责分离
grep -A10 'event:' src/plugin.ts  # 应该只是路由
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 独立任务):
├── Task 1: 修复 Toast 延迟问题 (P0-1) - plugin.ts
├── Task 2: 修复全局变量竞态问题 (P0-2) - plugin.ts
├── Task 2b: 符合 OpenCode Plugin 标准 (新增) - plugin.ts
├── Task 3: 添加 Toast 错误日志 (P0-3) - speaker.ts
└── Task 4: 创建统一日志模块 - logger.ts

Wave 2 (Core Features - 依赖 Wave 1):
├── Task 5: 实现流式播放按需初始化 - index.ts, tts.ts ⚠️
├── Task 5b: 修复 text7.split 错误 (铁律) - 全面排查 - tts.ts ⚠️
├── Task 6: 添加流式播放背压处理 - stream-player.ts
├── Task 7: 添加日志文件输出功能 - logger.ts
└── Task 8: 更新配置文件支持日志配置 - config.ts

Wave 3 (Integration + Tests):
├── Task 9: 集成测试 - 验证 Toast 功能
├── Task 10: 集成测试 - 验证流式播放
├── Task 11: 集成测试 - 验证日志功能
└── Task 12: 更新 README.md

Wave FINAL (Reviews):
├── Task F1: 萍萍代码评审
├── Task F2: 凤雏架构评审
└── Task F3: 臭佬验收
```

### Dependency Matrix

| Task | Dependencies | Blocks |
|------|--------------|--------|
| 1 | - | 5 |
| 2 | - | 5 |
| 2b | - | 5 |
| 3 | - | 5 |
| 4 | - | 7, 8 |
| 5 | 1, 2, 2b, 3 | 5b, 9, 10 |
| 5b | 5 | 9, 10 |
| 6 | 5 | 10 |
| 7 | 4 | 11 |
| 8 | 4 | - |
| 9 | 5, 5b | F1, F2, F3 |
| 10 | 5, 5b, 6 | F1, F2, F3 |
| 11 | 7, 8 | F1, F2, F3 |
| 12 | 9, 10, 11 | F1, F2, F3 |

---

## TODOs

- [x] 1. 修复 Toast 延迟问题 (P0-1)

  **What to do**:
  - 修改 `src/plugin.ts` 中的 Toast 延迟从 1000ms 改为 7000ms
  - 位置: 第186行、第209行、第266行、第294行
  - 参考 DCP 实现使用 7 秒延迟确保 TUI 完全就绪
  - 代码示例:
    ```typescript
    // 改为 7000ms
    setTimeout(async () => {
      if (!opencodeShowToast) return
      try {
        await opencodeShowToast({...})
      } catch (err) {
        console.warn('[Ocosay] Toast failed:', err)
      }
    }, 7000)  // 7秒延迟确保TUI就绪
    ```

  **Must NOT do**:
  - 不要修改 Toast 的参数结构
  - 不要修改其他无关代码

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的延迟时间修改
  - **Skills**: []
    - 无需特殊技能

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - `src/plugin.ts:186,209,266,294` - Toast 延迟调用位置
  - `~/github/opencode-dynamic-context-pruning/lib/ui/notification.ts` - DCP Toast 实现参考

  **Acceptance Criteria**:
  - [ ] `grep -n "setTimeout.*1000.*Toast" src/plugin.ts` 返回空
  - [ ] `grep -n "setTimeout.*7000.*Toast" src/plugin.ts` 返回 4 个结果
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: Toast 延迟修复验证
    Tool: Bash
    Preconditions: ocosay 插件已构建
    Steps:
      1. grep -n "setTimeout" src/plugin.ts 查找所有延迟调用
      2. 验证所有 Toast 相关延迟都是 7000ms
    Expected Result: 找到 4 处 7000ms 延迟，无 1000ms 延迟
    Failure Indicators: 还有 1000ms 延迟存在
    Evidence: .sisyphus/evidence/task-1-toast-delay.{ext}
  ```

  **Commit**: YES
  - Message: `fix(toast): 延长Toast延迟到7秒确保TUI就绪`
  - Files: `src/plugin.ts`

---

- [x] 2. 修复全局变量竞态问题 (P0-2)

  **What to do**:
  - 修改 `src/plugin.ts` 统一全局 Toast 函数赋值
  - 移除重复的 `(global as any).__opencode_tui_showToast__` 赋值
  - 使用函数封装避免竞态

  **Must NOT do**:
  - 不要移除全局变量（其他地方依赖）
  - 不要修改赋值时机

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的代码重构，移除重复代码
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - `src/plugin.ts:179-183,261-264` - 重复赋值位置

  **Acceptance Criteria**:
  - [ ] 全局 Toast 函数只赋值一次
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: 全局变量赋值验证
    Tool: Bash
    Preconditions: 代码已修改
    Steps:
      1. grep -n "__opencode_tui_showToast__" src/plugin.ts
      2. 验证赋值语句只有一处
    Expected Result: 只有一处赋值语句
    Failure Indicators: 多处赋值语句
    Evidence: .sisyphus/evidence/task-2-global-var.{ext}
  ```

  **Commit**: YES
  - Message: `refactor(toast): 统一全局Toast函数赋值`
  - Files: `src/plugin.ts`

---

- [x] 2b. 符合 OpenCode Plugin 标准 (新增)

  **What to do**:
  - 修改 `src/plugin.ts` 符合 OpenCode Plugin 标准
  - 添加顶层 `id` 导出
  - 使用 `satisfies Plugin` 类型保证
  - 修改 export default 格式为 `{ id, server }`
  - 移除全局状态污染，使用 ctx 参数传递 TUI API
  - 完善 config hook 实现

  **Must NOT do**:
  - 不要破坏现有功能
  - 不要移除 server 导出
  - 不要修改 Plugin 接口签名

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及架构重构，需要仔细处理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - `src/plugin.ts` - 需要修改的文件
  - `~/github/opencode-dynamic-context-pruning/index.ts` - DCP 标准实现参考
  - `node_modules/@opencode-ai/plugin/dist/index.d.ts` - Plugin 类型定义

  **Acceptance Criteria**:
  - [ ] `grep -n 'const id = "ocosay"' src/plugin.ts` 返回非空
  - [ ] `grep -n 'satisfies Plugin' src/plugin.ts` 返回非空
  - [ ] `grep -n '__opencode_tui' src/plugin.ts` 返回空（无全局污染）
  - [ ] `grep -n '__opencode_tui' src/index.ts` 返回空（无全局污染）
  - [ ] config hook 有实际实现（非空）
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: OpenCode Plugin 标准验收
    Tool: Bash
    Preconditions: 代码已修改
    Steps:
      1. 验证 id 导出存在
      2. 验证 satisfies Plugin 使用
      3. 验证无全局状态污染
      4. 验证 config hook 实现
    Expected Result: 所有检查通过
    Failure Indicators: 任何检查失败
    Evidence: .sisyphus/evidence/task-2b-plugin-standard.{ext}
  ```

  **Commit**: YES
  - Message: `refactor(plugin): 符合OpenCode Plugin标准架构`
  - Files: `src/plugin.ts`, `src/index.ts`

---

- [x] 3. 添加 Toast 错误日志 (P0-3)

  **What to do**:
  - 修改 `src/speaker.ts` 中 Toast 调用的错误处理
  - 在 catch 块中添加 console.warn 日志
  - 确保 Toast 失败时错误可见

  **Must NOT do**:
  - 不要移除 try-catch
  - 不要在 catch 中重新抛出异常

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 简单的日志添加
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - `src/speaker.ts:49-63,111-125,159-173` - Toast 调用位置

  **Acceptance Criteria**:
  - [ ] 所有 Toast 调用都有 catch 块
  - [ ] catch 块中有 console.warn 日志
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: Toast 错误日志验证
    Tool: Bash
    Preconditions: 代码已修改
    Steps:
      1. grep -n "catch" src/speaker.ts
      2. 验证 catch 块包含 console.warn
    Expected Result: 所有 catch 块都有 console.warn
    Evidence: .sisyphus/evidence/task-3-toast-log.{ext}
  ```

  **Commit**: YES
  - Message: `fix(speaker): 添加Toast调用错误日志`
  - Files: `src/speaker.ts`

---

- [x] 4. 创建统一日志模块

  **What to do**:
  - 创建 `src/core/logger.ts` 统一日志类
  - 支持日志级别: DEBUG, INFO, WARN, ERROR
  - 支持控制台输出和文件输出
  - 参考 DCP 的日志实现

  **Must NOT do**:
  - 不要破坏现有 console.* 调用（可逐步迁移）
  - 不要添加过多依赖

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要设计模式，代码量适中
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:
  - `~/github/opencode-dynamic-context-pruning/lib/utils/logger.ts` - DCP 日志实现参考
  - `src/core/types.ts` - 类型定义参考

  **Acceptance Criteria**:
  - [ ] Logger 类创建成功
  - [ ] 支持 log/INFO/WARN/ERROR 方法
  - [ ] 支持文件输出配置
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: Logger 模块单元测试
    Tool: Bash
    Preconditions: logger.ts 已创建
    Steps:
      1. npm run build
      2. 创建测试文件验证 Logger 功能
      3. npm test
    Expected Result: 构建成功，测试通过
    Evidence: .sisyphus/evidence/task-4-logger.{ext}
  ```

  **Commit**: YES
  - Message: `feat(logging): 添加统一Logger模块`
  - Files: `src/core/logger.ts`

---

- [ ] 5. 实现流式播放按需初始化

  **What to do**:
  - 修改 `src/index.ts` 实现流式组件按需初始化
  - 用户调用 tts_stream_speak 时，如果未初始化则自动初始化
  - 移除 autoRead 必须为 true 的硬性要求
  - **必须保证流式播放好用，不能报错**

  **Must NOT do**:
  - 不要破坏现有的 autoRead 初始化流程
  - 不要移除 Provider 初始化
  - **绝对不能报错**，tts_stream_speak 必须能正常工作

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及初始化逻辑修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Wave 1)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `src/index.ts:59-62` - autoRead 初始化逻辑
  - `src/tools/tts.ts:207-214` - tts_stream_speak 检查

  **Acceptance Criteria**:
  - [ ] 不配置 autoRead 也能调用 tts_stream_speak
  - [ ] 首次调用 tts_stream_speak 时自动初始化流式组件
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: 流式播放按需初始化验证
    Tool: Bash
    Preconditions: 代码已修改
    Steps:
      1. 模拟不配置 autoRead 的场景
      2. 调用 tts_stream_speak
      3. 验证流式组件被正确初始化
    Expected Result: 流式播放正常工作
    Failure Indicators: 报错 "Stream components not initialized"
    Evidence: .sisyphus/evidence/task-5-stream-init.{ext}
  ```

  **Commit**: YES
  - Message: `feat(streaming: 实现流式播放按需初始化`
  - Files: `src/index.ts`, `src/tools/tts.ts`

---

- [ ] 5b. 修复 text7.split 错误 (铁律 ⚠️)

  **What to do**:
  - **铁律**：不管错误来自哪一层，必须保证功能好用！
  - 全面排查所有可能触发 text7.split 错误的地方
  - 添加防御性检查，防止 split 调用失败
  - 在所有 .split() 调用前添加类型检查
  - 添加全局错误边界，防止错误扩散
  - **必须测试：调用任意 tool 都不能报错**

  **Must NOT do**:
  - 不要忽略错误
  - 不要假设 text7.split 只在某处发生
  - **不能报任何错误**

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 需要深度排查所有可能的问题点
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Wave 1)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 1, 2, 2b, 3

  **References**:
  - `src/tools/tts.ts` - 所有工具调用入口
  - `src/minimax.ts` - Provider 实现
  - `src/core/stream-reader.ts` - 流式读取

  **Acceptance Criteria**:
  - [ ] 调用 tts_speak 不报错
  - [ ] 调用 tts_stop 不报错
  - [ ] 调用 tts_pause 不报错
  - [ ] 调用 tts_resume 不报错
  - [ ] 调用 tts_list_voices 不报错
  - [ ] 调用 tts_list_providers 不报错
  - [ ] 调用 tts_status 不报错
  - [ ] 调用 tts_stream_speak 不报错
  - [ ] 调用 tts_stream_stop 不报错
  - [ ] 调用 tts_stream_status 不报错
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: text7.split 错误修复验证
    Tool: Bash
    Preconditions: 代码已修改
    Steps:
      1. grep -rn "\.split(" src/ --include="*.ts" 查找所有 split 调用
      2. 验证每个 split 调用前都有类型检查
      3. 验证没有未捕获的异常可能
    Expected Result: 所有 split 调用都是安全的
    Failure Indicators: 还有任何 split 可能失败
    Evidence: .sisyphus/evidence/task-5b-text7-fix.{ext}
  ```

  **Commit**: YES
  - Message: `fix(text7): 修复text7.split错误，铁律保证功能好用`
  - Files: `src/tools/tts.ts`, `src/providers/minimax.ts`, `src/core/stream-reader.ts`

---

- [ ] 6. 添加流式播放背压处理

  **What to do**:
  - 修改 `src/core/stream-player.ts` 添加背压处理
  - 在 write() 方法中检查后端是否 ready
  - 防止快速生产者导致内存溢出

  **Must NOT do**:
  - 不要破坏现有的播放逻辑
  - 不要添加过多复杂性

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及流控逻辑修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Wave 1)
  - **Blocks**: Task 10
  - **Blocked By**: Task 5

  **References**:
  - `src/core/stream-player.ts:118-136` - write() 方法

  **Acceptance Criteria**:
  - [ ] write() 方法添加背压检查
  - [ ] 后端忙时等待
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: 背压处理验证
    Tool: Bash
    Preconditions: 代码已修改
    Steps:
      1. npm run build
      2. npm test
    Expected Result: 构建成功，测试通过
    Evidence: .sisyphus/evidence/task-6-backpressure.{ext}
  ```

  **Commit**: YES
  - Message: `fix(stream-player): 添加背压处理防止内存溢出`
  - Files: `src/core/stream-player.ts`

---

- [ ] 7. 添加日志文件输出功能

  **What to do**:
  - 修改 `src/core/logger.ts` 添加文件输出功能
  - 支持日志轮转（按日期）
  - **必须添加自动清理机制**：日志保留7天，超期自动删除
  - 输出到 ~/.ocosay/logs/ 目录

  **Must NOT do**:
  - 不要阻塞主线程（使用异步写入）
  - 不要在日志写入失败时抛出异常
  - **不要让日志无限增长**

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 涉及文件IO和异步处理
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Wave 1)
  - **Blocks**: Task 11
  - **Blocked By**: Task 4

  **References**:
  - `src/core/logger.ts` - 新创建的 Logger 类
  - Node.js fs 模块文档

  **Acceptance Criteria**:
  - [ ] 日志输出到 ~/.ocosay/logs/ocosay-{date}.log
  - [ ] 异步写入不阻塞主线程
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: 日志文件输出验证
    Tool: Bash
    Preconditions: Logger 已实现文件输出
    Steps:
      1. 初始化 Logger 并配置文件输出
      2. 调用 Logger.info/error 等方法
      3. 验证文件已创建且内容正确
    Expected Result: 日志文件存在且内容正确
    Evidence: .sisyphus/evidence/task-7-log-file.{ext}
  ```

  **Commit**: YES
  - Message: `feat(logging): 添加日志文件输出功能`
  - Files: `src/core/logger.ts`

---

- [ ] 8. 更新配置文件支持日志配置

  **What to do**:
  - 修改 `src/config.ts` 添加日志配置支持
  - 支持 log.level 和 log.file 配置项
  - 更新 ocosay.jsonc 配置文件示例

  **Must NOT do**:
  - 不要破坏现有配置解析逻辑
  - 不要添加过多配置项

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 配置解析简单修改
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Wave 1)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:
  - `src/config.ts` - 配置管理
  - `~/.config/opencode/ocosay.jsonc` - 配置文件

  **Acceptance Criteria**:
  - [ ] 配置支持 log.level
  - [ ] 配置支持 log.file
  - [ ] `npm test` 全部通过

  **QA Scenarios**:

  ```
  Scenario: 日志配置验证
    Tool: Bash
    Preconditions: 配置已更新
    Steps:
      1. npm run build
      2. npm test
    Expected Result: 构建成功，测试通过
    Evidence: .sisyphus/evidence/task-8-log-config.{ext}
  ```

  **Commit**: YES
  - Message: `feat(config): 添加日志配置支持`
  - Files: `src/config.ts`, `README.md`

---

- [ ] 9. 集成测试 - Toast 功能

  **What to do**:
  - 创建 `tests/toast.test.ts` 测试 Toast 功能
  - 测试 7 秒延迟是否正确
  - 测试错误处理是否正确

  **Must NOT do**:
  - 不要测试真实的 OpenCode TUI（使用 mock）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要测试设计
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks F1, F2, F3
  - **Blocked By**: Task 5

  **References**:
  - `tests/*.test.ts` - 现有测试文件参考

  **Acceptance Criteria**:
  - [ ] Toast 测试用例创建
  - [ ] 测试覆盖延迟和错误处理
  - [ ] `npm test` 全部通过

  **Commit**: YES
  - Message: `test(toast): 添加Toast功能测试`
  - Files: `tests/toast.test.ts`

---

- [ ] 10. 集成测试 - 流式播放

  **What to do**:
  - 创建 `tests/streaming.test.ts` 测试流式播放
  - 测试按需初始化
  - 测试非阻塞播放

  **Must NOT do**:
  - 不要测试真实的 TTS API（使用 mock）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要测试设计
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks F1, F2, F3
  - **Blocked By**: Tasks 5, 6

  **References**:
  - `tests/*.test.ts` - 现有测试文件参考

  **Acceptance Criteria**:
  - [ ] 流式播放测试用例创建
  - [ ] 测试覆盖按需初始化
  - [ ] `npm test` 全部通过

  **Commit**: YES
  - Message: `test(streaming): 添加流式播放测试`
  - Files: `tests/streaming.test.ts`

---

- [ ] 11. 集成测试 - 日志功能

  **What to do**:
  - 创建 `tests/logger.test.ts` 测试日志功能
  - 测试日志级别
  - 测试文件输出

  **Must NOT do**:
  - 不要测试真实文件系统（使用 mock）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 需要测试设计
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks F1, F2, F3
  - **Blocked By**: Tasks 7, 8

  **References**:
  - `tests/*.test.ts` - 现有测试文件参考

  **Acceptance Criteria**:
  - [ ] Logger 测试用例创建
  - [ ] 测试覆盖级别和文件输出
  - [ ] `npm test` 全部通过

  **Commit**: YES
  - Message: `test(logger): 添加日志功能测试`
  - Files: `tests/logger.test.ts`

---

- [ ] 12. 更新 README.md

  **What to do**:
  - 更新 README.md 文档
  - 添加日志配置说明
  - 更新版本号

  **Must NOT do**:
  - 不要添加过时信息
  - 不要删除重要文档

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: 文档更新
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks F1, F2, F3
  - **Blocked By**: Tasks 9, 10, 11

  **References**:
  - `README.md` - 现有文档

  **Acceptance Criteria**:
  - [ ] README.md 更新完成
  - [ ] 包含日志配置说明
  - [ ] 版本号更新

  **Commit**: YES
  - Message: `docs: 更新README添加日志配置说明`
  - Files: `README.md`

---

## Final Verification Wave

- [ ] F1. **萍萍代码评审** — `momus`
  验证所有 P0 问题已修复，所有测试通过

- [ ] F2. **凤雏架构评审** — `oracle`
  验证架构设计合理，无潜在问题

- [ ] F3. **臭佬验收** — `human`
  老爷最终验收，确认所有功能正常

---

## Commit Strategy

- Wave 1: `fix(toast): 修复Toast P0问题`
- Wave 2: `feat(streaming): 流式播放按需初始化`
- Wave 3: `feat(logging): 添加日志功能`
- Final: `release: v1.0.23`

---

## Success Criteria

### 验证命令
```bash
npm run build  # 构建成功
npm test       # 所有测试通过
```

### Final Checklist
- [ ] Toast 7秒延迟已实现
- [ ] 全局变量竞态已修复
- [ ] Toast 错误日志已添加
- [ ] 流式播放按需初始化已实现
- [ ] 背压处理已添加
- [ ] Logger 模块已创建
- [ ] 日志文件输出已实现
- [ ] 配置文件支持日志配置
- [ ] 所有测试通过
- [ ] README.md 已更新
