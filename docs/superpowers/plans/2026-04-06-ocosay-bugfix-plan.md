# ocosay Bug 修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 ocosay TTS 插件的 4 个关键 bug：toast 不工作、text7.split 错误、流式播放阻塞主线程、缺少日志功能

**Architecture:** 
- Toast 修复：统一使用 `input.client?.tui?.showToast`，移除对全局变量 `__opencode_tui_showToast__` 的依赖
- text7.split 错误修复：在 `tts.ts` 的 `extractTextArg` 中添加类型检查，确保只处理字符串类型的 text 参数
- 流式播放修复：`StreamReader.handleDelta()` 添加类型验证，确保 delta 是字符串
- 日志功能：添加 `pino` 日志库，将日志写入 `~/.ocosay/ocosay.log`

**Tech Stack:** TypeScript, pino (日志), Node.js fs/path

---

## 文件结构

```
src/
├── plugin.ts          # 修改: toast 调用方式
├── index.ts           # 修改: 移除全局 toast 导出，添加日志初始化
├── tools/tts.ts       # 修改: extractTextArg 添加类型检查
├── core/
│   ├── stream-reader.ts   # 修改: handleDelta 添加 delta 类型验证
│   └── speaker.ts         # 修改: toast 调用方式统一
├── providers/minimax.ts   # 无修改 (split 调用已安全)
└── config.ts          # 修改: 添加日志配置路径

新增:
├── src/utils/logger.ts    # 日志工具模块
```

---

## Task 1: 添加 pino 日志库

**Files:**
- Modify: `package.json` - 添加 pino 依赖
- Create: `src/utils/logger.ts` - 日志工具模块

- [ ] **Step 1: 添加 pino 依赖**

```bash
npm install pino pino-pretty
```

- [ ] **Step 2: 创建日志工具模块**

```typescript
// src/utils/logger.ts
import pino from 'pino'
import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'

const logDir = join(homedir(), '.ocosay')
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true })
}

export const logger = pino({
  level: 'debug',
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: { colorize: true },
        level: 'debug',
      },
      {
        target: 'pino/file',
        options: { destination: join(logDir, 'ocosay.log'), mkdir: true },
        level: 'info',
      },
    ],
  },
})
```

- [ ] **Step 3: 在 index.ts 中初始化日志**

```typescript
// src/index.ts 开头
import { logger } from './utils/logger.js'

export async function initialize(config: PluginConfig) {
  logger.info('Ocosay initializing...')
  // ... 现有代码
}
```

- [ ] **Step 4: 提交**

```bash
git add package.json src/utils/logger.ts
git commit -m "feat: add pino logger with ~/.ocosay/log file"
```

---

## Task 2: 修复 StreamReader.handleDelta() 类型验证

**Files:**
- Modify: `src/core/stream-reader.ts:42-57`

- [ ] **Step 1: 添加 delta 类型验证**

```typescript
// src/core/stream-reader.ts handleDelta 方法
handleDelta(sessionID: string, messageID: string, partID: string, delta: unknown): void {
  // 类型验证：确保 delta 是字符串
  if (typeof delta !== 'string') {
    logger.warn({ delta }, 'handleDelta received non-string delta, converting to string')
    delta = String(delta)
  }
  
  // ... 现有代码
}
```

- [ ] **Step 2: 添加 logger import**

```typescript
import { logger } from '../utils/logger.js'
```

- [ ] **Step 3: 运行测试验证**

```bash
npm test -- --testPathPattern="stream-reader"
```

- [ ] **Step 4: 提交**

```bash
git add src/core/stream-reader.ts
git commit -m "fix: add type validation in handleDelta to prevent text7.split error"
```

---

## Task 3: 修复 tts.ts extractTextArg 类型检查

**Files:**
- Modify: `src/tools/tts.ts` - extractTextArg 函数

- [ ] **Step 1: 检查当前 extractTextArg 实现**

读取 `src/tools/tts.ts` 中 extractTextArg 函数 (约第 10-30 行)

- [ ] **Step 2: 添加全面的类型检查**

```typescript
// src/tools/tts.ts extractTextArg 函数
function extractTextArg(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') {
    return undefined
  }
  
  const argObj = args as Record<string, unknown>
  
  // 尝试获取 text 属性
  const text = argObj.text
  if (typeof text === 'string' && text.trim().length > 0) {
    return text.trim()
  }
  
  // 尝试获取 text7 属性 (OpenCode 框架可能传递)
  const text7 = argObj.text7
  if (typeof text7 === 'string' && text7.trim().length > 0) {
    logger.warn('Received text7 instead of text from OpenCode framework')
    return text7.trim()
  }
  
  // 遍历所有 text 开头的属性，找到第一个有效字符串
  for (const key of Object.keys(argObj)) {
    if (key.startsWith('text') && key !== 'text') {
      const val = argObj[key]
      if (typeof val === 'string' && val.trim().length > 0) {
        logger.debug(`Using ${key} as text source`)
        return val.trim()
      }
    }
  }
  
  return undefined
}
```

- [ ] **Step 3: 添加 logger import**

```typescript
import { logger } from '../utils/logger.js'
```

- [ ] **Step 4: 运行测试验证**

```bash
npm test -- --testPathPattern="tts-tools"
```

- [ ] **Step 5: 提交**

```bash
git add src/tools/tts.ts
git commit -m "fix: add comprehensive type check in extractTextArg for text7 and other text variants"
```

---

## Task 4: 统一 Toast 实现（移除全局变量依赖）

**Files:**
- Modify: `src/plugin.ts` - 统一使用 `input.client?.tui?.showToast`
- Modify: `src/core/speaker.ts` - 使用 plugin.ts 传入的 client
- Modify: `src/index.ts` - 移除全局 `__opencode_tui_showToast__` 导出

- [ ] **Step 1: 修改 plugin.ts - 统一 toast 获取**

读取 `src/plugin.ts` 找到所有 toast 获取位置 (约第 182, 242, 258 行)

将所有:
```typescript
const showToastFn = input.client?.tui?.showToast
```

改为统一函数:
```typescript
function getToastFn() {
  return input.client?.tui?.showToast?.bind(input.client.tui)
}
```

- [ ] **Step 2: 创建统一的 toast helper**

```typescript
// src/plugin.ts 顶部
const showToast = async (options: { body: { title: string; message: string; variant: 'success' | 'error' | 'info'; duration?: number } }) => {
  const fn = input.client?.tui?.showToast
  if (fn) {
    try {
      await fn(options)
    } catch (e) {
      logger.error({ error: e }, 'showToast failed')
    }
  } else {
    logger.warn('showToast not available - OpenCode client not initialized')
  }
}
```

- [ ] **Step 3: 修改 speaker.ts - 使用 plugin 传入的 toast**

读取 `src/core/speaker.ts` (约第 49-162 行)

将所有:
```typescript
const showToastFn = (global as any).__opencode_tui_showToast__
if (showToastFn) {
  showToastFn({ ... })
}
```

改为:
```typescript
import { getPluginClient } from '../plugin.js'

const client = getPluginClient()
if (client?.tui?.showToast) {
  client.tui.showToast({ ... })
}
```

- [ ] **Step 4: 修改 index.ts - 移除全局 toast 导出**

删除 index.ts 中的:
```typescript
export function showToast(options: ...) {
  const showToastFn = (global as any).__opencode_tui_showToast__
  // ...
}
```

- [ ] **Step 5: 运行构建验证**

```bash
npm run build
```

- [ ] **Step 6: 提交**

```bash
git add src/plugin.ts src/core/speaker.ts src/index.ts
git commit -m "fix: unify toast implementation to use input.client.tui.showToast"
```

---

## Task 5: 确保流式播放不阻塞主线程

**Files:**
- Modify: `src/core/stream-player.ts` - 确保非阻塞
- Modify: `src/core/streaming-synthesizer.ts` - 检查并修复阻塞调用

- [ ] **Step 1: 检查 stream-player.ts 的流式处理**

读取 `src/core/stream-player.ts` 找到 play/stream 相关方法

- [ ] **Step 2: 确保使用异步处理**

当前代码问题检查点:
1. `player.play()` 是否 await 了后端调用
2. 是否在单独的 tick 中处理音频块
3. EventEmitter 是否使用了 setImmediate/process.nextTick

```typescript
// stream-player.ts 中的播放调用应该使用:
setImmediate(() => {
  this.backend.start(audioFile)
})
```

- [ ] **Step 3: 检查 streaming-synthesizer.ts**

读取 `src/core/streaming-synthesizer.ts` 确保流式响应处理不阻塞

- [ ] **Step 4: 运行测试验证流式播放**

```bash
npm test -- --testPathPattern="stream"
```

- [ ] **Step 5: 提交**

```bash
git add src/core/stream-player.ts src/core/streaming-synthesizer.ts
git commit -m "perf: ensure streaming playback does not block main thread"
```

---

## Task 6: 验证所有修复

- [ ] **Step 1: 运行完整测试套件**

```bash
npm test
```

- [ ] **Step 2: 运行 linter**

```bash
npm run lint
```

- [ ] **Step 3: 运行构建**

```bash
npm run build
```

- [ ] **Step 4: 检查日志文件是否创建**

```bash
ls -la ~/.ocosay/
cat ~/.ocosay/ocosay.log
```

---

## Task 7: 提交代码并创建 PR

- [ ] **Step 1: 创建修复分支**

```bash
git checkout -b fix/stream-text-toast-bugs
```

- [ ] **Step 2: 提交所有更改**

```bash
git add -A
git commit -m "fix: resolve toast, text7.split, streaming playback and add logging

- Add pino logger writing to ~/.ocosay/ocosay.log
- Fix StreamReader.handleDelta() type validation
- Fix extractTextArg() to handle text7 and other text variants  
- Unify toast implementation to use input.client.tui.showToast
- Ensure streaming playback does not block main thread"
```

- [ ] **Step 3: 推送并创建 PR**

```bash
git push -u origin fix/stream-text-toast-bugs
gh pr create --title "fix: resolve toast, text7.split, streaming and logging" --body "## Summary
- Fix toast not working by unifying to input.client.tui.showToast
- Fix text7.split error by adding type validation in handleDelta and extractTextArg
- Ensure streaming playback does not block main thread
- Add pino logger writing to ~/.ocosay/ocosay.log"
```
