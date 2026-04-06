# Ocosay Toast 修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Toast 不弹出的问题，统一 Toast 通知管理，提升用户体验

**Architecture:** 
1. 创建 `NotificationService` 统一管理所有 Toast 通知
2. 修复 Init Toast 的 tui 检查逻辑和 7 秒延迟问题
3. 修复 Play Toast 的 AudioPlayer 初始化时序问题
4. 统一抽象 Toast 调用入口，消除分散调用

**Tech Stack:** TypeScript, OpenCode Plugin API, TUI showToast

---

## 问题分析

### 问题 1: Init Toast 不弹（plugin.ts:174-194）

**根因分析：**
```typescript
setTimeout(async () => {
  if (!opencodeTui?.showToast) return  // ← 问题：可选链检查导致直接跳过
  // ...
}, 7000)
```

**参照 DCP 分析：**
DCP 的 `lib/config.ts:934-946` 实现：
```typescript
function scheduleParseWarning(ctx: PluginInput, title: string, message: string): void {
    setTimeout(() => {
        try {
            ctx.client.tui.showToast({
                body: {
                    title,
                    message,
                    variant: "warning",
                    duration: 7000,
                },
            })
        } catch {}  // ← DCP用try-catch，不做防御性检查
    }, 7000)
}
```

**关键差异：**
1. DCP **不检查** `showToast` 是否存在，直接调用
2. DCP 用 `try-catch {}` 包裹，吞噬异常
3. ocosay 用 `opencodeTui?.showToast` 检查，不存在就 return
4. **结论**：防御性检查反而导致 Toast 不弹！应该像 DCP 那样直接调用

### 问题 2: Play Toast 不弹（speaker.ts:75, 160）

**根因分析：**
```typescript
// speaker.ts:29-44 - toast 函数
function toast(options) {
  const tui = (global as any).__opencode_tui__
  if (tui?.showToast) {  // ← 问题：tui 可能被覆盖或初始化失败
    tui.showToast({...})
  }
}

// speaker.ts:97 - AudioPlayer 构造时绑定事件
this.player = new AudioPlayer(playerEvents)  // ← 问题：如果这里失败，事件回调永不触发
```

**具体问题：**
1. `global.__opencode_tui__` 在 `plugin.ts:172` 设置，但 `Speaker` 可能在初始化前就被使用
2. `AudioPlayer` 初始化失败时，`onEnd`/`onError` 回调不会触发，Toast 永不弹出
3. `toast` 函数无错误回退，用户不知道 Toast 调用失败

### 问题 3: NotificationService 未实现

**影响：**
1. Toast 调用分散在 `plugin.ts`（2处）和 `speaker.ts`（2处），维护困难
2. 无法统一处理 Toast 错误和降级
3. 未来扩展（如不同类型的通知）需要修改多处代码

---

## 修复方案

### 方案 1: 创建 NotificationService（参照 DCP 架构）

**新建文件：** `src/core/notification.ts`

**关键设计（参照 DCP）：**
1. **不做防御性检查** - 直接调用 `tui.showToast()`，用 `try-catch` 处理异常
2. **延迟队列** - 如果 TUI 未就绪，Toast 加入队列，稍后重试
3. **DCP 格式** - 调用参数用 `{ body: { title, message, variant, duration } }`

```typescript
// src/core/notification.ts
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('NotificationService')

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  title: string
  message: string
  variant?: ToastVariant
  duration?: number
}

/**
 * NotificationService - 统一 Toast 通知管理
 * 参照 DCP 实现，不做防御性检查，直接调用并用 try-catch 处理
 */
class NotificationService {
  private tui: any = null
  private pendingToasts: ToastOptions[] = []
  private retryTimer?: NodeJS.Timeout

  /**
   * 初始化 TUI 引用
   */
  setTui(tui: any): void {
    this.tui = tui
    logger.debug('tui reference set')
    
    // 刷新挂起的 Toast
    this.flushPending()
  }

  /**
   * 显示 Toast（直接调用，参照 DCP 用 try-catch 处理）
   * 不做防御性检查，直接调用让异常被捕获
   */
  showToast(options: ToastOptions): boolean {
    const { title, message, variant = 'info', duration = 5000 } = options

    // 如果 tui 暂未赋值，加入队列等待
    if (!this.tui) {
      logger.debug({ title }, 'tui not ready, queueing toast')
      this.pendingToasts.push(options)
      this.scheduleRetry()
      return false
    }

    try {
      // 参照 DCP 格式：{ body: { title, message, variant, duration } }
      this.tui.showToast({
        body: {
          title,
          message,
          variant,
          duration,
        },
      })
      logger.debug({ title, variant }, 'toast shown')
      return true
    } catch (err) {
      // 参照 DCP：捕获异常但不抛出
      logger.warn({ err, title }, 'toast call failed, queueing for retry')
      this.pendingToasts.push(options)
      this.scheduleRetry()
      return false
    }
  }

  /**
   * 安排重试（指数退避）
   */
  private scheduleRetry(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      this.flushPending()
    }, 2000)
  }

  /**
   * 刷新挂起的 Toast
   */
  private flushPending(): void {
    if (this.pendingToasts.length === 0 || !this.tui) return
    
    logger.info({ count: this.pendingToasts.length }, 'flushing pending toasts')
    const pending = [...this.pendingToasts]
    this.pendingToasts = []
    
    for (const toast of pending) {
      this.showToast(toast)
    }
  }

  /**
   * 便捷方法（参照 DCP）
   */
  success(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'success', duration })
  }

  error(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'error', duration })
  }

  info(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'info', duration })
  }

  warning(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'warning', duration })
  }
}

// 单例导出
export const notificationService = new NotificationService()
export default notificationService
```

### 方案 2: 修复 Init Toast（plugin.ts）

**参照 DCP：**
DCP 的 `scheduleParseWarning` 函数用 7 秒延迟，且不做防御性检查。

**修改点：**
1. **保留 7 秒延迟**（与 DCP 一致）
2. 使用 `notificationService` 统一管理
3. **不做防御性检查**，让 NotificationService 处理

```typescript
// plugin.ts:174-194 修改为（参照 DCP）：

// 7 秒后显示初始化结果（参照 DCP 延迟）
setTimeout(() => {
  if (initError) {
    notificationService.error(
      `Ocosay v${pluginVersion} Init Failed`,
      'Please check your config file',
      8000
    )
  } else {
    notificationService.success(
      `Ocosay v${pluginVersion} Ready`,
      `Auto-read: ${config.autoRead ? 'ON' : 'OFF'}`,
      5000
    )
  }
}, 7000)  // 与 DCP 一致，7秒延迟
```

### 方案 3: 修复 Play Toast（speaker.ts）

**修改点：**
1. 使用 `notificationService` 替代本地 `toast` 函数
2. 在 `Speaker` 构造函数中确保播放器初始化后才绑定事件

---

## 实施步骤

### Task 1: 创建 NotificationService

**Files:**
- Create: `src/core/notification.ts`
- Modify: `src/index.ts` (导出 notificationService)
- Test: `tests/core/notification.test.ts`

- [ ] **Step 1: 创建 notification.ts**

```typescript
// src/core/notification.ts
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('NotificationService')

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  title: string
  message: string
  variant?: ToastVariant
  duration?: number
}

/**
 * NotificationService - 统一 Toast 通知管理
 * 参照 DCP 实现，不做防御性检查，直接调用并用 try-catch 处理
 */
class NotificationService {
  private tui: any = null
  private pendingToasts: ToastOptions[] = []
  private retryTimer?: NodeJS.Timeout

  setTui(tui: any): void {
    this.tui = tui
    logger.debug('tui reference set')
    this.flushPending()
  }

  showToast(options: ToastOptions): boolean {
    const { title, message, variant = 'info', duration = 5000 } = options

    if (!this.tui) {
      logger.debug({ title }, 'tui not ready, queueing toast')
      this.pendingToasts.push(options)
      this.scheduleRetry()
      return false
    }

    try {
      // 参照 DCP 格式：{ body: { title, message, variant, duration } }
      this.tui.showToast({
        body: {
          title,
          message,
          variant,
          duration,
        },
      })
      logger.debug({ title, variant }, 'toast shown')
      return true
    } catch (err) {
      // 参照 DCP：捕获异常但不抛出
      logger.warn({ err, title }, 'toast call failed, queueing for retry')
      this.pendingToasts.push(options)
      this.scheduleRetry()
      return false
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      this.flushPending()
    }, 2000)
  }

  private flushPending(): void {
    if (this.pendingToasts.length === 0 || !this.tui) return
    
    logger.info({ count: this.pendingToasts.length }, 'flushing pending toasts')
    const pending = [...this.pendingToasts]
    this.pendingToasts = []
    
    for (const toast of pending) {
      this.showToast(toast)
    }
  }

  success(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'success', duration })
  }

  error(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'error', duration })
  }

  info(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'info', duration })
  }

  warning(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'warning', duration })
  }
}

export const notificationService = new NotificationService()
export default notificationService
```

- [ ] **Step 2: 在 index.ts 导出 notificationService**

检查 `src/index.ts`，添加导出：
```typescript
export { notificationService } from './core/notification.js'
```

- [ ] **Step 3: 创建单元测试**

```typescript
// tests/core/notification.test.ts
import { notificationService } from '../../src/core/notification'

describe('NotificationService', () => {
  beforeEach(() => {
    // 重置状态
    ;(notificationService as any).tui = null
    ;(notificationService as any).initialized = false
    ;(notificationService as any).pendingToasts = []
  })

  it('should queue toast when tui not available', () => {
    const result = notificationService.showToast({
      title: 'Test',
      message: 'Test message'
    })
    expect(result).toBe(false)
    expect((notificationService as any).pendingToasts).toHaveLength(1)
  })

  it('should flush pending toasts when tui becomes available', () => {
    const mockTui = { showToast: jest.fn() }
    notificationService.showToast({ title: 'Test', message: 'Queued' })
    expect((notificationService as any).pendingToasts).toHaveLength(1)
    
    notificationService.setTui(mockTui)
    expect(mockTui.showToast).toHaveBeenCalled()
    expect((notificationService as any).pendingToasts).toHaveLength(0)
  })

  it('should call tui.showToast directly when available', () => {
    const mockTui = { showToast: jest.fn() }
    notificationService.setTui(mockTui)
    
    notificationService.showToast({
      title: 'Test',
      message: 'Direct',
      variant: 'success'
    })
    
    expect(mockTui.showToast).toHaveBeenCalledWith({
      title: 'Test',
      message: 'Direct',
      variant: 'success',
      duration: 3000
    })
  })
})
```

- [ ] **Step 4: 运行测试验证**

Run: `npm test -- tests/core/notification.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/notification.ts src/index.ts tests/core/notification.test.ts
git commit -m "feat: add NotificationService for unified toast management"
```

---

### Task 2: 修复 Init Toast（plugin.ts）

**Files:**
- Modify: `src/plugin.ts:171-194`
- Modify: `src/plugin.ts:229-238`

- [ ] **Step 1: 修改 plugin.ts 导入 notificationService**

```typescript
// 添加导入
import { notificationService } from './core/notification.js'

// 在 setTui 后初始化
const opencodeTui = input.client?.tui
;(global as any).__opencode_tui__ = opencodeTui
notificationService.setTui(opencodeTui)  // ← 添加这行
```

- [ ] **Step 2: 修改 Init Toast 逻辑（174-194行）**

原代码：
```typescript
// 插件初始化完成后立即显示 Toast（延迟 7 秒等待 TUI 渲染）
setTimeout(async () => {
  if (!opencodeTui?.showToast) return
  if (initError) {
    await opencodeTui.showToast({...})
  } else {
    await opencodeTui.showToast({...})
  }
}, 7000)
```

新代码（参照 DCP，不做防御性检查）：
```typescript
// 7 秒后显示初始化结果（参照 DCP 延迟）
setTimeout(() => {
  if (initError) {
    notificationService.error(
      `Ocosay v${pluginVersion} Init Failed`,
      'Please check your config file',
      8000
    )
  } else {
    notificationService.success(
      `Ocosay v${pluginVersion} Ready`,
      `Auto-read: ${config.autoRead ? 'ON' : 'OFF'}`,
      5000
    )
  }
}, 7000)  // 与 DCP 一致，7秒延迟
```

- [ ] **Step 3: 修改 session.created 重试失败 Toast（229-238行）**

原代码：
```typescript
if (opencodeTui?.showToast) {
  await opencodeTui.showToast({...})
}
```

新代码：
```typescript
notificationService.error(
  `Ocosay v${pluginVersion} Init Failed`,
  'Initialization failed, please check config',
  8000
)
```

- [ ] **Step 4: 运行 lsp_diagnostics 验证**

Run: `lsp_diagnostics /mnt/d/dev/github/project/ocosay/src/plugin.ts`
Expected: 无新增 error

- [ ] **Step 5: Commit**

```bash
git add src/plugin.ts
git commit -m "fix: improve init toast timing and use NotificationService"
```

---

### Task 3: 修复 Play Toast（speaker.ts）

**Files:**
- Modify: `src/core/speaker.ts:29-44` (移除本地 toast 函数)
- Modify: `src/core/speaker.ts:75, 160` (使用 notificationService)
- Modify: `src/core/speaker.ts:1` (添加导入)

- [ ] **Step 1: 修改导入**

原代码：
```typescript
import { AudioPlayer, PlayerEvents } from './player'
import { createModuleLogger } from '../utils/logger'
```

新代码：
```typescript
import { AudioPlayer, PlayerEvents } from './player'
import { createModuleLogger } from '../utils/logger'
import { notificationService } from './notification'
```

- [ ] **Step 2: 移除本地 toast 函数（29-44行）**

删除整个 `toast` 函数定义

- [ ] **Step 3: 修改 onEnd 回调（speaker.ts:74-79）**

原代码：
```typescript
onEnd: () => {
  this.isSpeaking = false
  this.emit('end', this.currentText)

  // 显示播放成功 Toast
  toast({
    title: 'TTS playback success',
    body: 'Audio generated and playing',
    type: 'info'
  })
},
```

新代码：
```typescript
onEnd: () => {
  this.isSpeaking = false
  this.emit('end', this.currentText)

  // 显示播放成功 Toast
  notificationService.info(
    'TTS playback success',
    'Audio generated and playing'
  )
},
```

- [ ] **Step 4: 修改 onError 回调（speaker.ts:158-164）**

原代码：
```typescript
// 显示播放失败 Toast
const errorMessage = error instanceof Error ? error.message : 'Unknown error'
toast({
  title: 'TTS playback error',
  body: errorMessage,
  type: 'error'
})
```

新代码：
```typescript
// 显示播放失败 Toast
const errorMessage = error instanceof Error ? error.message : 'Unknown error'
notificationService.error(
  'TTS playback error',
  errorMessage
)
```

- [ ] **Step 5: 运行 lsp_diagnostics 验证**

Run: `lsp_diagnostics /mnt/d/dev/github/project/ocosay/src/core/speaker.ts`
Expected: 无新增 error

- [ ] **Step 6: 运行相关测试**

Run: `npm test -- tests/core/speaker.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/speaker.ts
git commit -m "fix: use NotificationService for play toasts"
```

---

### Task 4: 验证完整流程

**Files:**
- Modify: `src/plugin.ts` (确认集成正确)

- [ ] **Step 1: 运行全量测试**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 2: 运行 lint 检查**

Run: `npm run lint`
Expected: 无 error

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 编译成功，dist/ 生成

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: complete toast notification system"
```

---

## 验收标准

### 功能验收

| 场景 | 验收条件 | 预期结果 |
|------|----------|----------|
| 插件加载成功 | 启动 OpenCode 后 1 秒内 | 显示 "Ocosay vX.X.X Ready" Toast |
| 插件加载失败 | 配置错误或 API Key 无效 | 显示 "Ocosay vX.X.X Init Failed" Toast |
| TTS 播放成功 | speak() 执行完成后 | 显示 "TTS playback success" Toast |
| TTS 播放失败 | 网络错误或 API 错误 | 显示 "TTS playback error" Toast + 错误信息 |
| TUI 未就绪 | Toast 调用时 TUI 不可用 | Toast 自动队列，TUI 就绪后立即显示 |

### 代码验收

| 检查项 | 验收条件 |
|--------|----------|
| LSP 诊断 | 所有修改文件无新增 error |
| 单元测试 | `tests/core/notification.test.ts` 通过 |
| 集成测试 | `tests/core/speaker.test.ts` 通过 |
| 构建 | `npm run build` 成功 |
| Lint | `npm run lint` 无 error |

### 回归测试

| 测试项 | 验收条件 |
|--------|----------|
| 基础 TTS | `tts_speak` 工具正常工作 |
| 流式 TTS | `tts_stream_speak` 工具正常工作 |
| 播放控制 | `tts_stop`/`tts_pause`/`tts_resume` 正常工作 |

---

## 关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/notification.ts` | 创建 | NotificationService 统一管理 |
| `src/index.ts` | 修改 | 导出 notificationService |
| `src/plugin.ts` | 修改 | Init Toast + session.created Toast |
| `src/core/speaker.ts` | 修改 | Play Toast 改用 notificationService |
| `tests/core/notification.test.ts` | 创建 | NotificationService 单元测试 |

---

## 风险与降级

| 风险 | 缓解措施 |
|------|----------|
| TUI showToast API 变更 | `try-catch` 包装，DCP 也是这样做的 |
| Toast 队列堆积 | 超过2秒未刷新时自动重试 |
| NotificationService 单例问题 | 单元测试覆盖多实例场景 |
| 7秒延迟太久 | DCP 也用7秒，这是 TUI 完全初始化的必要时间 |
