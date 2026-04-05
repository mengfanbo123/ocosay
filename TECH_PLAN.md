# ocosay - OpenCode TTS 播放插件技术方案

## 项目概述

**ocosay** 是 OpenCode 的 TTS（文本转语音）播放插件，支持：
- 文本转语音自动播放
- 暂停/停止/恢复控制
- 多 TTS 模型可扩展架构
- 同步/异步/流式 多种合成模式

## 架构设计

### 核心原则
- **可扩展架构**：抽象 TTS Provider 接口，MiniMax 作为第一个实现，未来可扩展其他提供商
- **Provider 隔离**：每个 TTS 模型独立 Provider 实现，核心逻辑与模型无关
- **合成模式可配置**：通过 `model` 参数指定 `sync` | `async` | `stream`

### 目录结构

```
ocosay/
├── src/
│   ├── providers/
│   │   ├── base.ts           # TTS Provider 接口定义
│   │   ├── minimax.ts         # MiniMax TTS Provider
│   │   └── index.ts          # Provider 导出
│   ├── core/
│   │   ├── player.ts         # 音频播放引擎
│   │   ├── speaker.ts        # 统一调用入口
│   │   └── types.ts          # 公共类型定义
│   ├── tools/
│   │   └── tts.ts            # OpenCode 自定义工具
│   ├── index.ts              # Plugin 入口
│   └── config.ts             # 配置管理
├── package.json
├── tsconfig.json
└── README.md
```

---

## 核心接口设计

### 错误类型

```typescript
// 错误类型定义
enum TTSErrorCode {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  QUOTA = 'QUOTA',
  INVALID_VOICE = 'INVALID_VOICE',
  INVALID_PARAMS = 'INVALID_PARAMS',
  PLAYER_ERROR = 'PLAYER_ERROR',
  UNKNOWN = 'UNKNOWN'
}

class TTSError extends Error {
  constructor(
    message: string,
    code: TTSErrorCode,
    provider: string,
    details?: unknown
  ) {
    super(message)
    this.name = 'TTSError'
    this.code = code
    this.provider = provider
    this.details = details
  }
  
  code: TTSErrorCode
  provider: string
  details?: unknown
}
```

### 音色定义

```typescript
interface Voice {
  id: string
  name: string
  language?: string  // 'zh-CN' | 'en-US' 等
  gender?: 'male' | 'female' | 'neutral'
  previewUrl?: string  // 音色预览 URL
}
```

### 能力定义

```typescript
interface TTSCapabilities {
  // 基础能力（必有）
  speak: true
  
  // 高级能力
  voiceClone?: boolean   // 音色克隆支持
  stream?: boolean       // 流式合成支持
  voiceList?: boolean    // 音色列表支持
  
  // 合成模式支持
  sync?: boolean         // 同步合成支持
  async?: boolean        // 异步合成支持
}
```

### 合成配置

```typescript
// 合成模式枚举
type SynthesisModel = 'sync' | 'async' | 'stream'

// Speak 配置参数
interface SpeakOptions {
  voice?: string                    // 音色 ID
  model?: SynthesisModel           // 合成模式，默认 stream
  speed?: number                   // 语速 0.5-2.0
  volume?: number                  // 音量 0-100
  pitch?: number                   // 音调 0.5-2.0
  
  // 音色克隆参数（可选）
  sourceVoice?: string             // 克隆源音色 URL
}

interface AudioResult {
  audioData: Buffer | ReadableStream
  sampleRate?: number
  channels?: number
  duration?: number
  format: string  // 'mp3' | 'wav' | 'flac'
  isStream: boolean
}
```

### TTSProvider 接口

```typescript
interface TTSProvider {
  name: string
  capabilities: TTSCapabilities
  
  // 生命周期
  initialize(): Promise<void>
  destroy(): Promise<void>
  
  // 核心能力
  speak(text: string, options?: SpeakOptions): Promise<AudioResult>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  listVoices(): Promise<Voice[]>
  
  // 查询能力
  getCapabilities(): TTSCapabilities
}
```

### Provider 注册机制

```typescript
// 静态注册
const providers = new Map<string, TTSProvider>()

export function registerProvider(name: string, provider: TTSProvider): void {
  providers.set(name, provider)
}

export function getProvider(name: string): TTSProvider {
  const provider = providers.get(name)
  if (!provider) {
    throw new TTSError(
      `TTS Provider "${name}" not found`,
      TTSErrorCode.UNKNOWN,
      'system'
    )
  }
  return provider
}

export function listProviders(): string[] {
  return Array.from(providers.keys())
}

export function hasProvider(name: string): boolean {
  return providers.has(name)
}
```

---

## 事件系统

```typescript
// 事件类型
type TTSEvent = 
  | 'start'      // 开始播放
  | 'end'        // 播放结束
  | 'error'      // 错误发生
  | 'progress'  // 播放进度（流式场景）
  | 'pause'      // 暂停
  | 'resume'     // 恢复
  | 'stop'       // 停止

// 事件处理器
interface SpeakerEvents {
  on(event: 'start', handler: (text: string) => void): void
  on(event: 'end', handler: (text: string) => void): void
  on(event: 'error', handler: (error: TTSError) => void): void
  on(event: 'progress', handler: (progress: { current: number; total: number }) => void): void
  on(event: 'pause', handler: () => void): void
  on(event: 'resume', handler: () => void): void
  on(event: 'stop', handler: () => void): void
  
  off(event: TTSEvent, handler: Function): void
}
```

---

## OpenCode Plugin 集成

```typescript
// src/index.ts
export default {
  name: 'ocosay',
  version: '1.0.0',
  
  tools: [
    {
      name: 'tts_speak',
      description: '将文本转换为语音并播放',
      input: {
        text: { type: 'string', required: true },
        provider: { type: 'string', default: 'minimax' },
        voice: { type: 'string', optional: true },
        model: { type: 'string', enum: ['sync', 'async', 'stream'], default: 'stream' },
        speed: { type: 'number', optional: true },
        volume: { type: 'number', optional: true },
        pitch: { type: 'number', optional: true }
      }
    },
    {
      name: 'tts_stop',
      description: '停止当前播放'
    },
    {
      name: 'tts_pause',
      description: '暂停当前播放'
    },
    {
      name: 'tts_resume',
      description: '恢复暂停的播放'
    },
    {
      name: 'tts_list_voices',
      description: '列出可用音色',
      input: {
        provider: { type: 'string', default: 'minimax' }
      }
    },
    {
      name: 'tts_list_providers',
      description: '列出所有已注册的 TTS 提供商'
    }
  ],
  
  session: {
    idle: () => { /* 清理资源 - 调用所有 Provider.destroy() */ }
  }
}
```

---

## MiniMax Provider 实现

### API 能力映射

| MiniMax API | 映射到 ocosay | 说明 |
|-------------|--------------|------|
| T2A v2.5 (WebSocket) | `model: 'stream'` | 流式播放 |
| T2A v3 (同步) | `model: 'sync'` | 同步返回 |
| T2A v2 (异步) | `model: 'async'` | 异步轮询 |
| 音色列表 | `listVoices()` | |
| 音色克隆 | `voiceClone()` (via sourceVoice) | 通过 sourceVoice 参数指定克隆源 |

### 配置项

```typescript
interface MiniMaxConfig {
  apiKey: string
  appId?: string
  voiceId?: string           // 默认音色
  model?: SynthesisModel     // 默认合成模式
  audioFormat?: 'mp3' | 'wav' | 'flac'
  speed?: number            // 0.5 - 2.0
  volume?: number           // 0 - 100
  pitch?: number            // 0.5 - 2.0
}

function validateConfig(config: MiniMaxConfig): void {
  if (!config.apiKey) {
    throw new TTSError('API key is required', TTSErrorCode.AUTH, 'minimax')
  }
  if (config.speed !== undefined && (config.speed < 0.5 || config.speed > 2.0)) {
    throw new TTSError('Speed must be between 0.5 and 2.0', TTSErrorCode.INVALID_PARAMS, 'minimax')
  }
  if (config.volume !== undefined && (config.volume < 0 || config.volume > 100)) {
    throw new TTSError('Volume must be between 0 and 100', TTSErrorCode.INVALID_PARAMS, 'minimax')
  }
}
```

---

## 评审修复记录

| 日期 | 修复内容 | 评审来源 |
|------|---------|---------|
| 2026-04-04 | speak() 添加 SpeakOptions 配置参数 | 萍萍 |
| 2026-04-04 | pause()/stop()/resume() 改为返回 Promise | 凤雏 |
| 2026-04-04 | 添加 TTSError 类型定义 | 凤雏 |
| 2026-04-04 | 同步/异步/流式 改为 model 参数可配置 | 老爷确认 |
| 2026-04-04 | 添加 Speaker 事件系统 | 小猪 |
| 2026-04-04 | 添加 listProviders() 方法 | 萍萍 |
| 2026-04-04 | 添加 Provider 生命周期 initialize()/destroy() | 凤雏 |

---

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js
- **音频播放**: node-simplespeaker / node-player / play-sound
- **HTTP 客户端**: axios
- **WebSocket**: ws (for MiniMax 流式)
- **构建**: npm

## 下一步计划

1. 创建项目结构
2. 实现 types.ts - 核心类型定义
3. 实现 base.ts - Provider 接口
4. 实现 config.ts - 配置管理
5. 实现 MiniMax Provider
6. 实现 player.ts - 音频播放引擎
7. 实现 speaker.ts - 统一调用入口
8. 实现 tools/tts.ts - OpenCode 工具
9. 实现 index.ts - Plugin 入口
10. 单元测试
11. 文档编写
