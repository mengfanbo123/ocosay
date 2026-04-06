# Ocosay 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构ocosay解决5个问题：Toast不弹、Logger无异常/格式不对、mp3无法播放、text7.split报错

**Architecture:** 五层架构重构 - 新增Service层(NotificationService/SpeakerService/StreamingService)，重构Logger格式，修复SSE解析bug

**Tech Stack:** TypeScript ESM, pino logger, MiniMax TTS API

---

## 文件结构

```
src/
├── utils/
│   └── logger.ts             # 重构：添加模块后缀
├── services/
│   ├── notification.ts        # 新增：Toast统一管理单例
│   ├── speaker.ts            # 新增：非流式播放服务
│   ├── streaming.ts          # 新增：流式播放服务
│   └── index.ts              # 新增：服务导出
├── providers/
│   └── minimax.ts            # 修改：修复SSE解析
└── tools/
    └── tts.ts                # 修改：修复text7.split
```

---

## Task 1: Logger重构 - 添加模块后缀

**Files:**
- Modify: `src/utils/logger.ts:1-50`
- Test: `tests/utils/logger.test.ts` (新建)

- [ ] **Step 1: 读取现有logger.ts**

读取 `src/utils/logger.ts` 了解当前pino配置

- [ ] **Step 2: 写Logger测试**

```typescript
// tests/utils/logger.test.ts
import { logger } from '../../src/utils/logger.js'

describe('Logger', () => {
  test('should include module prefix in log output', () => {
    const output: string[] = []
    const mockWrite = (str: string) => output.push(str)
    
    // 测试日志格式包含 [模块名]
    logger.info({ module: 'speaker' }, 'test message')
    expect(output[output.length - 1]).toContain('[speaker]')
  })
  
  test('should use iso timestamp format', () => {
    const output: string[] = []
    logger.info({ module: 'test' }, 'timestamp test')
    // 应该包含 ISO 时间戳格式
    expect(output[output.length - 1]).toMatch(/\[Ocosay\]/)
  })
})
```

- [ ] **Step 3: 重构logger.ts添加模块后缀**

```typescript
// src/utils/logger.ts
import pino from 'pino'

// 日志格式: [Ocosay][时间戳][级别][模块] 消息
const logLevels = ['error', 'warn', 'info', 'debug'] as const

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'Ocosay'
  },
  formatters: {
    level: (label) => `[${label}]`,
    bindings: (bindings) => ({
      service: bindings.service
    })
  },
  // 自定义 mixin 添加模块标注
  mixin: (context) => {
    const module = context.module || 'app'
    return { moduleLabel: `[${module}]` }
  }
})

// 便捷方法：创建带模块名的logger子实例
export function createModuleLogger(module: string) {
  return logger.child({ module })
}

export const speakerLogger = createModuleLogger('speaker')
export const minimaxLogger = createModuleLogger('minimax')
export const streamLogger = createModuleLogger('stream')
export const playerLogger = createModuleLogger('player')
export const toolsLogger = createModuleLogger('tools')
export const pluginLogger = createModuleLogger('plugin')
```

- [ ] **Step 4: 运行测试验证**

Run: `npm test -- tests/utils/logger.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/utils/logger.ts tests/utils/logger.test.ts
git commit -m "feat(logger): add module suffix and iso timestamp"
```

---

## Task 2: 审查并修复所有catch块添加logger.error

**Files:**
- Modify: `src/providers/minimax.ts` (检查catch块)
- Modify: `src/core/streaming-synthesizer.ts` (检查catch块)
- Modify: `src/core/speaker.ts` (检查catch块)
- Modify: `src/core/player.ts` (检查catch块)
- Modify: `src/index.ts` (检查catch块)

- [ ] **Step 1: 搜索所有catch块**

Run: `grep -rn "catch" src/ --include="*.ts" | grep -v node_modules`

列出所有catch块位置

- [ ] **Step 2: 审查minimax.ts的catch块**

读取 `src/providers/minimax.ts`，找到所有catch块，添加logger.error

示例修复:
```typescript
// 原来
catch (err) {
  throw mapError(err)
}

// 修改为
catch (err) {
  minimaxLogger.error({ error: err }, 'API request failed')
  throw mapError(err)
}
```

- [ ] **Step 3: 审查streaming-synthesizer.ts的catch块**

读取 `src/core/streaming-synthesizer.ts`，检查catch块已有logger.error

- [ ] **Step 4: 审查speaker.ts的catch块**

读取 `src/core/speaker.ts`，修复toast相关的catch块：
```typescript
// 原来
catch (err) {
  logger.warn({ err }, 'toast failed')
}

// 修改为
catch (err) {
  speakerLogger.warn({ error: err }, 'toast failed')
}
```

- [ ] **Step 5: 审查player.ts的catch块**

读取 `src/core/player.ts`，修复cleanup中的catch

- [ ] **Step 6: 审查index.ts的catch块**

读取 `src/index.ts`，确保所有catch块有logger.error

- [ ] **Step 7: 提交**

```bash
git add src/providers/minimax.ts src/core/streaming-synthesizer.ts src/core/speaker.ts src/core/player.ts src/index.ts
git commit -m "fix(logger): add logger.error to all catch blocks"
```

---

## Task 3: 创建NotificationService单例

**Files:**
- Create: `src/services/notification.ts`
- Modify: `src/tools/tts.ts` (替换toast调用)
- Modify: `src/core/speaker.ts` (替换toast调用)
- Test: `tests/services/notification.test.ts` (新建)

- [ ] **Step 1: 创建NotificationService**

```typescript
// src/services/notification.ts
import { createModuleLogger } from '../utils/logger.js'

const logger = createModuleLogger('notification')

export interface ToastOptions {
  title: string
  body?: string
  variant?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
}

class NotificationService {
  private static instance: NotificationService
  private _tui: any = null

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  private get tui(): any {
    if (!this._tui) {
      this._tui = (global as any).__opencode_tui__
    }
    return this._tui
  }

  showToast(options: ToastOptions): void {
    if (this.tui?.showToast) {
      try {
        this.tui.showToast({
          title: options.title,
          message: options.body || '',
          variant: options.variant || 'info',
          duration: options.duration || 3000
        })
        logger.debug({ options }, 'Toast shown')
      } catch (err) {
        logger.error({ error: err, options }, 'showToast failed')
      }
    } else {
      logger.warn({ hasTui: !!this.tui }, 'showToast: tui unavailable')
    }
  }

  showSuccess(title: string, body?: string): void {
    this.showToast({ title, body, variant: 'success' })
  }

  showError(title: string, body?: string): void {
    this.showToast({ title, body, variant: 'error', duration: 5000 })
  }

  showInfo(title: string, body?: string): void {
    this.showToast({ title, body, variant: 'info' })
  }
}

export const notificationService = NotificationService.getInstance()
export default notificationService
```

- [ ] **Step 2: 创建notification测试**

```typescript
// tests/services/notification.test.ts
import { notificationService } from '../../src/services/notification.js'

describe('NotificationService', () => {
  test('should be singleton', () => {
    const instance1 = notificationService
    const instance2 = notificationService
    expect(instance1).toBe(instance2)
  })

  test('should handle missing tui gracefully', () => {
    // 当tui不存在时，不应该抛出异常
    expect(() => {
      notificationService.showToast({ title: 'test' })
    }).not.toThrow()
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- tests/services/notification.test.ts`
Expected: PASS

- [ ] **Step 4: 替换speaker.ts中的toast调用**

读取 `src/core/speaker.ts`，将：
```typescript
import { toast } from './toast.js'
// toast({ title: 'TTS', body: '...' })
```
替换为：
```typescript
import { notificationService } from '../services/notification.js'
// notificationService.showSuccess('TTS', '...')
```

- [ ] **Step 5: 提交**

```bash
git add src/services/notification.ts tests/services/notification.test.ts src/core/speaker.ts
git commit -m "feat(notification): add NotificationService singleton"
```

---

## Task 4: 修复SSE chunk解析bug

**Files:**
- Modify: `src/providers/minimax.ts` (修复processReadableStream)
- Test: `tests/providers/minimax.test.ts` (更新)

- [ ] **Step 1: 读取当前minimax.ts的processReadableStream**

读取 `src/providers/minimax.ts`，定位到 `processReadableStream` 方法（约第144-166行）

- [ ] **Step 2: 修复SSE解析逻辑**

将原来的：
```typescript
stream.on('data', (chunk: Buffer) => {
  const lines = chunk.toString().split('\n')
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const data = JSON.parse(line.slice(5))
      // ...
    }
  }
})
```

替换为：
```typescript
private async processReadableStream(stream: ReadableStream): Promise<void> {
  const reader = stream.getReader()
  let lineBuffer = ''
  let chunkCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    lineBuffer += value.toString()
    chunkCount++
    minimaxLogger.debug({ chunkCount, bufferLen: lineBuffer.length }, 'SSE chunk received')

    // 使用正则匹配完整的数据行
    const dataRegex = /data:\s*(\{[^]*?\})\s*\n/g
    let match

    while ((match = dataRegex.exec(lineBuffer)) !== null) {
      try {
        const data = JSON.parse(match[1])
        if (data.data?.audio) {
          const audioBuffer = Buffer.from(data.data.audio, 'hex')
          this.audioChunks.push(audioBuffer)
          minimaxLogger.debug({ audioLen: audioBuffer.length, isFinal: data.is_final }, 'chunk pushed')
        }
        if (data.is_final) {
          minimaxLogger.info('Streaming synthesis complete')
        }
      } catch (parseErr) {
        minimaxLogger.error({ error: parseErr, raw: match[1].slice(0, 100) }, 'JSON parse failed')
      }
    }

    // 保留未匹配的内容
    lineBuffer = lineBuffer.slice(dataRegex.lastIndex)
  }
}
```

- [ ] **Step 3: 运行构建验证**

Run: `npm run build`
Expected: 无编译错误

- [ ] **Step 4: 提交**

```bash
git add src/providers/minimax.ts
git commit -m "fix(minimax): use regex to accumulate SSE buffer for proper parsing"
```

---

## Task 5: 修复text7.split处理

**Files:**
- Modify: `src/tools/tts.ts` (修复extractTextArg)
- Test: `tests/tools/tts.test.ts` (更新)

- [ ] **Step 1: 读取当前tts.ts的extractTextArg**

读取 `src/tools/tts.ts`，定位到 `extractTextArg` 函数（约第29-43行）

- [ ] **Step 2: 修复text7.split处理**

将原来的：
```typescript
if (typeof text7 === 'object' && 'content' in text7) {
  const content = (text7 as any).content
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim()
  }
}
```

替换为：
```typescript
if (typeof text7 === 'object') {
  // 处理 { content: "..." } 或 { split: true, content: "..." } 或 { text: "..." }
  const content = (text7 as any).content ?? (text7 as any).text
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim()
  }
}
```

- [ ] **Step 3: 添加text7.split测试**

读取 `tests/tools/tts.test.ts`，添加：
```typescript
test('extractTextArg should handle text7.split format', () => {
  const result = extractTextArg({ text7: { split: true, content: 'Hello World' } })
  expect(result).toBe('Hello World')
})

test('extractTextArg should handle text7 with text property', () => {
  const result = extractTextArg({ text7: { text: 'Hello' } })
  expect(result).toBe('Hello')
})
```

- [ ] **Step 4: 运行测试**

Run: `npm test -- tests/tools/tts.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/tools/tts.ts tests/tools/tts.test.ts
git commit -m "fix(tts): support text7.split and text7.text formats"
```

---

## Task 6: 创建SpeakerService (非流式)

**Files:**
- Create: `src/services/speaker.ts`
- Create: `src/services/index.ts`
- Test: `tests/services/speaker.test.ts` (新建)

- [ ] **Step 1: 创建SpeakerService**

```typescript
// src/services/speaker.ts
import { createModuleLogger } from '../utils/logger.js'
import { notificationService } from './notification.js'
import { MiniMaxProvider } from '../providers/minimax.js'
import { createBackend, BACKENDTYPE } from '../core/backends/index.js'
import type { AudioBackend } from '../core/backends/base.js'

const logger = createModuleLogger('speaker')

export interface SpeakOptions {
  text: string
  voiceId?: string
  speed?: number
  backend?: BACKENDTYPE
}

class SpeakerService {
  private provider: MiniMaxProvider
  private backend: AudioBackend

  constructor() {
    this.provider = new MiniMaxProvider()
    this.backend = createBackend(BACKENDTYPE.AUTO)
    logger.info({ backend: this.backend.name }, 'SpeakerService initialized')
  }

  async speak(options: SpeakOptions): Promise<void> {
    const { text, voiceId, speed, backend } = options
    
    logger.info({ textLength: text.length, voiceId, speed }, 'speak() called')
    
    try {
      notificationService.showInfo('TTS', '开始合成...')
      
      const result = await this.provider.speak(text, { voiceId, speed })
      
      if (backend) {
        this.backend = createBackend(backend)
      }
      
      await this.backend.play(result.audioData)
      
      notificationService.showSuccess('TTS', '播放完成')
      logger.info('speak() completed')
    } catch (err) {
      logger.error({ error: err }, 'speak() failed')
      notificationService.showError('TTS', '播放失败')
      throw err
    }
  }

  async stop(): Promise<void> {
    logger.info('stop() called')
    await this.backend.stop()
  }
}

export const speakerService = new SpeakerService()
export default speakerService
```

- [ ] **Step 2: 创建services/index.ts**

```typescript
// src/services/index.ts
export { notificationService, default as notification } from './notification.js'
export { speakerService, default as speaker } from './speaker.js'
export type { ToastOptions } from './notification.js'
export type { SpeakOptions } from './speaker.js'
```

- [ ] **Step 3: 创建speaker测试**

```typescript
// tests/services/speaker.test.ts
import { SpeakerService } from '../../src/services/speaker.js'

describe('SpeakerService', () => {
  test('should be instantiable', () => {
    const service = new SpeakerService()
    expect(service).toBeDefined()
  })
})
```

- [ ] **Step 4: 运行测试**

Run: `npm test -- tests/services/speaker.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/services/speaker.ts src/services/index.ts tests/services/speaker.test.ts
git commit -m "feat(services): add SpeakerService for non-streaming TTS"
```

---

## Task 7: 创建StreamingService (流式)

**Files:**
- Create: `src/services/streaming.ts`
- Modify: `src/index.ts` (使用StreamingService)
- Test: `tests/services/streaming.test.ts` (新建)

- [ ] **Step 1: 创建StreamingService**

```typescript
// src/services/streaming.ts
import { createModuleLogger } from '../utils/logger.js'
import { notificationService } from './notification.js'
import { MiniMaxProvider } from '../providers/minimax.js'
import { StreamPlayer } from '../core/stream-player.js'
import { StreamReader } from '../core/stream-reader.js'
import { StreamingSynthesizer } from '../core/streaming-synthesizer.js'
import { createBackend, BACKENDTYPE } from '../core/backends/index.js'
import type { AudioBackend } from '../core/backends/base.js'

const logger = createModuleLogger('streaming')

class StreamingService {
  private provider: MiniMaxProvider
  private streamPlayer: StreamPlayer
  private backend: AudioBackend

  constructor() {
    this.provider = new MiniMaxProvider()
    this.backend = createBackend(BACKENDTYPE.NAUDIODON) // 流式必须用naudiodon
    this.streamPlayer = new StreamPlayer(this.backend)
    logger.info({ backend: this.backend.name }, 'StreamingService initialized')
  }

  initialize(tuiEventBus: any): void {
    logger.info('Initializing streaming components')
    
    const streamReader = new StreamReader()
    const synthesizer = new StreamingSynthesizer(this.provider)
    
    // 设置事件链
    synthesizer.pipe(this.streamPlayer)
    streamReader.on('textReady', (text) => {
      synthesizer.synthesize(text)
    })
    
    // 监听TuiEventBus
    if (tuiEventBus) {
      tuiEventBus.on('message.part.delta', (text: string) => {
        streamReader.handleDelta(text)
      })
      tuiEventBus.on('message.part.end', () => {
        streamReader.flush()
      })
    }
    
    notificationService.showSuccess('Streaming', '流式服务已启动')
  }

  stop(): void {
    logger.info('stop() called')
    this.streamPlayer.stop()
  }

  pause(): void {
    logger.info('pause() called')
    this.streamPlayer.pause()
  }

  resume(): void {
    logger.info('resume() called')
    this.streamPlayer.resume()
  }
}

export const streamingService = new StreamingService()
export default streamingService
```

- [ ] **Step 2: 修改index.ts使用StreamingService**

读取 `src/index.ts`，将豆包模式初始化逻辑替换为使用StreamingService

- [ ] **Step 3: 提交**

```bash
git add src/services/streaming.ts src/index.ts
git commit -m "feat(services): add StreamingService for streaming TTS"
```

---

## Task 8: 集成测试

**Files:**
- Test: `tests/integration.test.ts` (新建)
- Run: `npm test`

- [ ] **Step 1: 创建集成测试**

```typescript
// tests/integration.test.ts
describe('Integration Tests', () => {
  test('Logger should work across all modules', () => {
    // 验证logger已正确配置
    const { logger, speakerLogger, minimaxLogger } = require('../src/utils/logger.js')
    expect(logger).toBeDefined()
    expect(speakerLogger).toBeDefined()
    expect(minimaxLogger).toBeDefined()
  })

  test('NotificationService should be available', () => {
    const { notificationService } = require('../src/services/notification.js')
    expect(notificationService).toBeDefined()
    expect(typeof notificationService.showToast).toBe('function')
  })

  test('SpeakerService should be available', () => {
    const { speakerService } = require('../src/services/speaker.js')
    expect(speakerService).toBeDefined()
    expect(typeof speakerService.speak).toBe('function')
  })
})
```

- [ ] **Step 2: 运行完整测试**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 4: 提交**

```bash
git add tests/integration.test.ts
git commit -m "test: add integration tests"
```

---

## Task 9: 最终验证

- [ ] **Step 1: 运行lint**

Run: `npm run lint`
Expected: 无错误

- [ ] **Step 2: 运行完整测试**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: 编译成功

- [ ] **Step 4: Git status检查**

Run: `git status`
Expected: 无未提交更改

- [ ] **Step 5: 提交所有更改**

```bash
git add -A && git commit -m "feat: complete ocosay refactor - logger, notification, streaming services"
```

---

## 验收清单

- [ ] Logger格式: `[Ocosay][时间戳][级别][模块]` ✓
- [ ] 所有catch块有logger.error ✓
- [ ] NotificationService单例工作正常 ✓
- [ ] SSE解析用正则累积buffer ✓
- [ ] text7.split格式支持 ✓
- [ ] SpeakerService非流式播放正常 ✓
- [ ] StreamingService流式播放正常 ✓
- [ ] 所有测试通过 ✓
- [ ] 构建成功 ✓
