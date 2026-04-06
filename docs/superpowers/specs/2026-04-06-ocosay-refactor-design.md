# Ocosay 重构设计方案

**日期**: 2026-04-06
**版本**: v2.0
**状态**: 待老爷批准
**基于**: 卧龙(MiniMax API)、嗅嗅(流式机制)、凤雏(架构评审)调研结果

---

## 1. 背景与目标

### 1.1 当前问题（已调研确认根因）

| # | 问题 | 根因 | 严重度 |
|---|------|------|--------|
| 1 | Toast不弹出 | `speaker.ts`和`plugin.ts`各自获取`tui`，时序不稳定 | P0 |
| 2 | Logger无异常记录 | catch块只有throw没有logger.error | P1 |
| 3 | Logger格式不对 | pino默认格式缺少`[模块]`后缀 | P1 |
| 4 | mp3无法播放 | SSE chunk解析用`split('\n')`有跨边界bug | P0 |
| 5 | text7.split报错 | `extractTextArg`未处理`{ split: true, content }`格式 | P2 |

### 1.2 重构目标

1. **Logger全场景覆盖** - 所有catch块必须记录异常
2. **Toast统一管理** - 所有播放场景正确弹出Toast
3. **重构TTS模块** - 清晰的分层架构
4. **修复mp3播放** - 验证API返回格式，统一解析逻辑
5. **支持流式优先** - autoRead开启时优先使用流式朗读

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        OpenCode                              │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                    Plugin Layer                        │ │
│  │   plugin.ts (工具注册 + 初始化 + Toast通知)              │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                    Tools Layer                         │ │
│  │   tools/tts.ts (handleToolCall 统一入口)                │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                   Service Layer                        │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ Speaker     │  │ Streaming     │  │ Notification │ │ │
│  │  │ Service     │  │ Service       │  │ Service      │ │ │
│  │  │ (非流式)   │  │ (豆包模式)    │  │ (Toast统一)  │ │ │
│  │  └─────────────┘  └──────────────┘  └──────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  Provider Layer                        │ │
│  │   providers/minimax.ts (TTS Provider 可扩展)            │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  Backend Layer                          │ │
│  │   core/backends/*.ts (naudiodon/howler/aplay/afplay/ps) │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 模块职责

### 3.1 Plugin Layer (`plugin.ts`)

- 插件入口点，导出 `{ id, server }`
- 注册10个TTS工具
- 初始化时设置 `__opencode_tui__` 全局变量
- 插件加载后显示Toast通知

### 3.2 Tools Layer (`tools/tts.ts`)

- `handleToolCall(toolName, args)` 统一入口
- `extractTextArg(args)` 健壮的参数提取（兼容text/text7）
- 分发到对应Service

### 3.3 Service Layer

| Service | 职责 | 文件 |
|---------|------|------|
| `SpeakerService` | 非流式TTS播放，单次speak | `services/speaker.ts` |
| `StreamingService` | 流式TTS播放（豆包模式） | `services/streaming.ts` |
| `NotificationService` | Toast通知统一管理 | `services/notification.ts` |

### 3.4 Logger Service (`utils/logger.ts`)

**日志格式**:
```
[Ocosay][2026-04-06T12:00:00.000Z][info][speaker] speak() called with text length: 100
[Ocosay][2026-04-06T12:00:00.001][error][minimax] API request failed: Network error
[Ocosay][2026-04-06T12:00:00.002][warning][stream] Buffer overflow, flushing...
```

**级别**: `error`, `warning`, `info`, `debug`

**模块标注**: speaker, minimax, stream, player, tools, plugin

**全场景覆盖**:
- 所有catch块必须 `logger.error({ error }, '描述')`
- 所有异步操作入口 `logger.info`
- 状态变化 `logger.debug`

### 3.5 Notification Service

```typescript
class NotificationService {
  private static instance: NotificationService
  private tui: any

  static getInstance(): NotificationService
  showToast(options: ToastOptions): void
  private initTUI(): void  // 从 global.__opencode_tui__ 获取
}
```

---

## 4. 关键流程

### 4.1 非流式播放流程 (tts_speak)

```
用户调用 tts_speak(text)
         ↓
tools/tts.ts handleToolCall()
         ↓
SpeakerService.speak(text)
         ↓ logger.info
MiniMaxProvider.speak(text) → API调用
         ↓ logger.debug
AudioBackend.play() → 播放
         ↓ logger.info
NotificationService.showToast({ success })
```

### 4.2 流式播放流程 (豆包模式)

```
TuiEventBus.message.part.delta
         ↓ logger.debug
StreamReader.handleDelta() → 缓冲文本
         ↓ textReady事件
StreamingSynthesizer.synthesize() → 流式API
         ↓ logger.info
StreamPlayer.write(chunk) → 边收边播
         ↓ logger.debug
AudioBackend 播放
         ↓
TuiEventBus.message.part.end → 流结束
         ↓ logger.info
NotificationService.showToast({ info })
```

### 4.3 Toast显示流程

```
任意播放操作
         ↓
NotificationService.showToast({ title, body, variant })
         ↓
获取 global.__opencode_tui__
         ↓
tui.showToast({ title, message, variant, duration })
         ↓ catch
logger.warn({ err }, 'showToast failed')
```

---

## 5. 流式播放数据流（已验证）

### 5.1 完整数据流图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TuiEventBus (global.__opencode_tuieventbus__)    │
│              message.part.delta → message.part.end                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         StreamReader                                 │
│  • 接收 delta 事件 → 累积 buffer                                     │
│  • 缓冲区满(30字符) 或 遇到句号(。！？) 或 超时(2000ms) → 触发 textReady│
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    StreamingSynthesizer                              │
│  • 接收 textReady 事件 → 调用 provider.streamingSpeak()              │
│  • 处理 ReadableStream → 逐 chunk emit → StreamPlayer              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         StreamPlayer                                │
│  • write(chunk) → 写入 backend                                      │
│  • start()/end()/stop()/pause()/resume() 控制                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        AudioBackend                                  │
│  ⚠️ naudiodon (真流式) | howler (伪流式❌每次write都stop/unload/reload)│
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 MiniMax API流式返回格式（卧龙查阅）

**API**: `POST https://api.minimax.io/v1/t2a_v2` with `stream: true`

**返回格式**: SSE (Server-Sent Events)
```
data: {"event":"audio_stream","data":{"audio":"1a2b3c4d5e6f...","status":1},"is_final":false}
data: {"event":"audio_stream","data":{"audio":"7f8e9a0b...","status":1},"is_final":false}
data: {"event":"audio_stream","data":{"audio":"...","status":2},"is_final":true}
```

**关键点**:
- 音频数据在 `data.data.audio` 字段（hex编码字符串）
- `is_final: true` 表示流结束
- 流式模式**仅支持mp3格式**
- 需要 `Buffer.from(audioHex, 'hex')` 解码

---

## 6. MP3问题修复

### 6.1 问题根因

**问题位置**: `providers/minimax.ts` 第144-166行

**问题代码**:
```typescript
stream.on('data', (chunk: Buffer) => {
  const lines = chunk.toString().split('\n')  // ❌ 跨边界问题
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const data = JSON.parse(line.slice(5))
      // ...
    }
  }
})
```

**问题**: 当一个chunk包含多个SSE事件，或SSE事件被切割到两个chunk时，`split('\n')`无法正确解析。

### 6.2 修复方案：正则累积buffer解析

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
    logger.debug({ chunkCount, bufferLen: lineBuffer.length }, 'SSE chunk received')

    // 使用正则匹配完整的数据行
    const dataRegex = /data:\s*(\{[^]*?\})\s*\n/g
    let match

    while ((match = dataRegex.exec(lineBuffer)) !== null) {
      try {
        const data = JSON.parse(match[1])
        if (data.data?.audio) {
          const audioBuffer = Buffer.from(data.data.audio, 'hex')
          this.emitChunk(audioBuffer)
          logger.debug({ audioLen: audioBuffer.length, isFinal: data.is_final }, 'chunk emitted')
        }
        if (data.is_final) {
          logger.info('Streaming synthesis complete')
          this.emitEnd()
        }
      } catch (parseErr) {
        logger.error({ error: parseErr, raw: match[1].slice(0, 100) }, 'JSON parse failed')
      }
    }

    // 保留未匹配的内容
    lineBuffer = lineBuffer.slice(dataRegex.lastIndex)
  }
}
```

### 6.3 text7.split处理（P2）

**问题位置**: `tools/tts.ts` 第29-43行

**当前只处理**:
```typescript
// 方式1: text7 直接是字符串
{ text7: "Hello" }
// 方式2: text7 是对象
{ text7: { content: "Hello" } }
```

**未处理**:
```typescript
// 方式3: text7 是对象 with split
{ text7: { split: true, content: "Hello" } }
```

**修复**:
```typescript
function extractTextArg(argObj: any): string | null {
  // text7.split 格式: { split: true, content: "..." }
  if (argObj.text7 != null) {
    if (typeof argObj.text7 === 'string') {
      return argObj.text7.trim()
    }
    if (typeof argObj.text7 === 'object') {
      // 处理 { content: "..." } 或 { split: true, content: "..." }
      const content = argObj.text7.content ?? argObj.text7.text
      if (typeof content === 'string' && content.trim().length > 0) {
        return content.trim()
      }
    }
  }
  // ... text 处理逻辑
}
```

---

## 7. 文件结构

```
src/
├── plugin.ts                 # 插件入口
├── index.ts                  # 库主入口，initialize/destroy
├── config.ts                 # 配置管理
├── utils/
│   └── logger.ts             # Logger服务（重构：添加模块后缀）
├── services/
│   ├── speaker.ts            # Speaker服务（非流式）
│   ├── streaming.ts          # Streaming服务（流式）
│   ├── notification.ts       # Notification服务（新增单例）
│   └── index.ts              # 服务导出
├── providers/
│   ├── base.ts               # Provider基类
│   └── minimax.ts            # MiniMax实现（修复SSE解析）
├── core/                     # 保留原有结构（引用）
│   ├── player.ts
│   ├── stream-player.ts
│   ├── stream-reader.ts
│   ├── streaming-synthesizer.ts
│   ├── types.ts
│   └── backends/
│       ├── index.ts
│       ├── base.ts
│       ├── howler-backend.ts
│       └── naudiodon-backend.ts
└── tools/
    └── tts.ts                # 工具调用（修复text7.split）
```

---

## 8. 实现计划

### Phase 1: Logger重构
- [ ] 重写`utils/logger.ts`，添加`[模块]`后缀
- [ ] 全场景添加logger.error catch块
- [ ] 验证日志格式

### Phase 2: NotificationService
- [ ] 创建`services/notification.ts`单例
- [ ] 替换所有toast调用
- [ ] 验证Toast弹出

### Phase 3: SpeakerService
- [ ] 创建`services/speaker.ts`
- [ ] 集成NotificationService
- [ ] 验证非流式播放+Toast

### Phase 4: StreamingService
- [ ] 创建`services/streaming.ts`
- [ ] 修复SSE chunk解析（正则替代split）
- [ ] 修复text7.split处理
- [ ] 验证流式播放+Toast

### Phase 5: 集成测试
- [ ] 整体流程测试
- [ ] autoRead开关测试
- [ ] 错误场景测试

---

## 9. 验收标准

1. **Logger**: 格式`[Ocosay][时间戳][级别][模块]`，所有异常被记录
2. **Toast**: 插件加载成功/失败toast，非流式播放toast，流式播放toast
3. **播放**: 非流式mp3可播放，流式mp3可播放（修复SSE解析后）
4. **autoRead**: 开启时优先流式朗读，关闭时使用非流式
5. **无regression**: 原有功能不受影响

---

## 10. 凤雏评审总结

| 优先级 | 问题 | 修复方案 | 预估工时 |
|--------|------|----------|----------|
| P0 | SSE chunk解析bug | 用正则累积buffer解析 | 1h |
| P0 | Toast时序问题 | NotificationService单例延迟获取 | 0.5h |
| P1 | Logger格式 | 调整pino配置添加模块后缀 | 0.5h |
| P1 | 异常记录遗漏 | 审查所有catch块 | 1h |
| P2 | text7.split | 扩展extractTextArg逻辑 | 0.5h |

**架构可行性**: ✅ 五层架构合理，流式播放机制正确（不依赖mp3文件，是内存流）

---

## 11. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Toast获取不到tui实例 | NotificationService延迟获取，每次showToast时检查 |
| 流式API返回格式不确定 | 增加格式检测和日志，SSE解析加try-catch |
| howler伪流式问题 | 豆包模式默认使用naudiodon后端 |
| 破坏原有功能 | 保留原有core/目录，新服务独立实现 |
