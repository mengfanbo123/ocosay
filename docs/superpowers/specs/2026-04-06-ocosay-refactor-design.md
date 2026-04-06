# Ocosay 重构设计方案

**日期**: 2026-04-06
**版本**: v1.0
**状态**: 已批准

---

## 1. 背景与目标

### 1.1 当前问题

| # | 问题 | 现状 |
|---|------|------|
| 1 | Toast不弹出 | `plugin.ts`中toast正常，但`speaker.ts`中toast无法获取`tui`实例 |
| 2 | Logger无异常记录 | 很多catch块只有throw没有logger.error |
| 3 | Logger格式不对 | 缺少`[Ocosay][时间戳][级别][模块]`结构 |
| 4 | mp3无法播放 | 流式接口chunk解析逻辑有问题 |
| 5 | text7.split报错 | OpenCode传参方式变化 |

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

## 5. MP3问题修复

### 5.1 问题分析

MiniMax API返回格式：
- 同步模式：`output_format: 'hex'` 返回hex字符串
- 流式模式：SSE格式，每行 `data: {...}` 包含hex音频数据

### 5.2 修复策略

1. **统一hex解码**：在`StreamingSynthesizer`中对每个chunk进行hex解码
2. **验证逻辑**：
   - 检测chunk是否以`data:`开头 → SSE格式解析
   - 否则直接作为hex解码
3. **调试写入**：在`/tmp/ocosay-debug.mp3`写入验证

### 5.3 代码修改

```typescript
// StreamingSynthesizer.processAudioResult()
private processAudioResult(result: AudioResult): void {
  if (result.isStream && result.audioData instanceof ReadableStream) {
    this.processReadableStream(result.audioData)
  } else if (Buffer.isBuffer(result.audioData)) {
    this.emitChunk(result.audioData)
  }
}

// 新增: hex解码辅助方法
private decodeHexChunk(chunk: Buffer): Buffer {
  const str = chunk.toString('utf8').trim()
  // 如果是SSE格式，解析data:后的内容
  if (str.startsWith('data:')) {
    const json = str.slice(5).trim()
    const data = JSON.parse(json)
    if (data.data?.audio) {
      return Buffer.from(data.data.audio, 'hex')
    }
  }
  // 否则假设是纯hex
  return Buffer.from(str, 'hex')
}
```

---

## 6. 文件结构

```
src/
├── plugin.ts                 # 插件入口
├── index.ts                  # 库主入口，initialize/destroy
├── config.ts                 # 配置管理
├── utils/
│   ├── logger.ts             # Logger服务（重构）
│   └── notification.ts       # Notification服务（新增）
├── services/
│   ├── speaker.ts            # Speaker服务（非流式）
│   ├── streaming.ts          # Streaming服务（流式）
│   └── index.ts              # 服务导出
├── providers/
│   ├── base.ts               # Provider基类
│   └── minimax.ts            # MiniMax实现
├── core/                     # 保留原有结构
│   ├── player.ts
│   ├── stream-player.ts
│   ├── stream-reader.ts
│   ├── streaming-synthesizer.ts
│   ├── types.ts
│   └── backends/
│       ├── index.ts
│       ├── base.ts
│       ├── howler-backend.ts
│       └── ...
└── tools/
    └── tts.ts                # 工具调用
```

---

## 7. 实现计划

### Phase 1: Logger重构
- [ ] 重写`utils/logger.ts`，标准格式输出
- [ ] 全场景添加logger.error catch块
- [ ] 验证日志格式

### Phase 2: NotificationService
- [ ] 创建`services/notification.ts`
- [ ] 替换所有toast调用
- [ ] 验证Toast弹出

### Phase 3: SpeakerService
- [ ] 创建`services/speaker.ts`
- [ ] 集成NotificationService
- [ ] 验证非流式播放+Toast

### Phase 4: StreamingService
- [ ] 创建`services/streaming.ts`
- [ ] 修复MP3 hex解码
- [ ] 验证流式播放+Toast

### Phase 5: 集成测试
- [ ] 整体流程测试
- [ ] autoRead开关测试
- [ ] 错误场景测试

---

## 8. 验收标准

1. **Logger**: 格式正确，所有异常被记录
2. **Toast**: 插件加载成功/失败toast，非流式播放toast，流式播放toast
3. **播放**: 非流式mp3可播放，流式mp3可播放
4. **autoRead**: 开启时优先流式朗读，关闭时使用非流式
5. **无regression**: 原有功能不受影响

---

## 9. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Toast获取不到tui实例 | NotificationService使用全局单例，延迟初始化 |
| 流式API返回格式不确定 | 增加hex解码前的格式检测和日志 |
| 破坏原有功能 | 保留原有core/目录，新服务独立实现 |
