# ocosay - OpenCode TTS 播放插件

> 🎙️ 让 AI 开口说话 — 支持豆包模式边接收边朗读的 TTS 插件

[![npm version](https://img.shields.io/npm/v/@mingxy/ocosay.svg)](https://www.npmjs.com/package/@mingxy/ocosay)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Why This Exists

在 AI 助手对话场景中，文字回复往往显得生硬。**ocosay** 让 AI 能够"开口说话"，通过流式 TTS 技术实现边接收边朗读的豆包模式，极大提升对话交互体验。

**解决的问题：**
- 长文本等待焦虑 — 流式播放，首包延迟低
- 缺乏情感反馈 — 多种音色选择，支持语速/音调调节
- 交互体验单一 — 从"看"升级到"听"

## Features

- 🎙️ **多 TTS 模型支持** - MiniMax 作为第一个实现，可扩展其他提供商
- 🔊 **多种合成模式** - 同步、异步、流式三种模式可选
- 🎭 **音色克隆** - 支持音色快速复刻
- 🎛️ **播放控制** - 暂停、恢复、停止
- 📋 **音色列表** - 查询可用音色
- 🔌 **OpenCode Plugin** - 无缝集成 OpenCode
- 📡 **豆包模式** - autoRead + TuiEventBus，边接收边朗读

## Platform Support

| 平台 | 支持状态 | 说明 |
|------|----------|------|
| macOS | ✅ 完全支持 | howler.js 跨平台音频后端 |
| Linux | ✅ 完全支持 | howler.js 跨平台音频后端 |
| Windows | ✅ 完全支持 | howler.js 跨平台音频后端 |

### 音频后端

ocosay 使用统一的 `AudioBackend` 架构：

| 后端 | 类型 | 说明 |
|------|------|------|
| **howler** | 跨平台 | 基于 howler.js，纯 JavaScript 实现，npm 直接安装无需编译 |
| naudiodon | 流式 | native 模块，支持真正的流式播放（需 npm install） |
| afplay | macOS | 系统命令 afplay |
| aplay | Linux | 系统命令 aplay |
| powershell | Windows | PowerShell PlaySync |

> **注意**: 流式播放（豆包模式）需要 naudiodon 后端支持。请执行 `npm install naudiodon` 安装。

## 安装方式

### 方式一：ocx 安装（推荐）

```bash
ocx install @mingxy/ocosay
```

### 方式二：手动配置

```bash
npm install @mingxy/ocosay
```

在 OpenCode 配置文件中添加插件：

```jsonc
{
  "plugin": [
    "@mingxy/ocosay"
  ]
}
```

> **首次安装**：重启 OpenCode 后，插件会自动在 `~/.config/opencode/ocosay.jsonc` 生成默认配置文件。
> 请编辑该文件，填写您的 `apiKey` 和 `baseURL`。

## 快速开始

### 1. 添加插件

在 `~/.config/opencode/opencode.jsonc` 中添加：

```jsonc
{
  "plugin": [
    "@mingxy/ocosay"
  ]
}
```

### 2. 重启 OpenCode

插件会自动下载并初始化。

### 3. 填写配置

首次启动后，插件会自动生成 `~/.config/opencode/ocosay.jsonc` 配置文件。

编辑该文件，填写必填项：

```jsonc
{
  "providers": {
    "minimax": {
      "apiKey": "您的API_KEY",           // ⚠️ 必填
      "baseURL": "https://api.minimaxi.com"  // ⚠️ 必填
    }
  }
}
```

### 4. 重启 OpenCode 使配置生效

## 快速开始

### 初始化

```typescript
import { initialize } from 'ocosay'

await initialize({
  providers: {
    minimax: {
      apiKey: 'your-api-key',
      voiceId: 'male-qn-qingse',
      model: 'stream'
    }
  }
})
```

### 基本使用

```typescript
import { speak, stop, pause, resume } from 'ocosay'

// 说话
await speak('你好，世界！')

// 暂停
pause()

// 恢复
resume()

// 停止
await stop()
```

### 指定音色和模式

```typescript
await speak('你好，世界！', {
  provider: 'minimax',
  voice: 'female-shaonv',
  model: 'sync',
  speed: 1.0,
  volume: 80
})
```

## 豆包模式

豆包模式是 ocosay 的核心特性 — 开启后，AI 助手的回复会**边接收边朗读**，实现类似豆包 App 的流畅播报体验。

### 核心组件

| 组件 | 说明 |
|------|------|
| `StreamReader` | 文本缓冲器，收集并缓冲流式文本 |
| `StreamingSynthesizer` | 流式合成器，边接收边合成音频 |
| `StreamPlayer` | 流式播放器，边收边播 |
| `TuiEventBus` | 事件总线，监听 OpenCode 事件流 |

> **注意**：`autoRead` 是 `initialize()` 的配置选项（`autoRead: true`），而非独立组件。

### 启用豆包模式

豆包模式通过 `initialize()` 的 `autoRead: true` 配置选项启用：

```typescript
import { initialize } from 'ocosay'

// 启用豆包模式
await initialize({
  providers: {
    minimax: {
      apiKey: 'your-api-key',
      voiceId: 'male-qn-qingse'
    }
  },
  autoRead: true  // 开启边接收边朗读
})
```

### 数据流与事件

豆包模式的数据流如下：

```
TuiEventBus (message.part.delta) 
    → StreamReader (缓冲文本) 
    → StreamingSynthesizer (流式合成) 
    → StreamPlayer (边收边播)
    → TuiEventBus (message.part.end)
```

| 事件 | 说明 |
|------|------|
| `message.part.delta` | AI回复文本增量事件，携带 `delta` 字段 |
| `message.part.end` | AI回复片段结束事件 |

### TuiEventBus 事件监听

TuiEventBus 负责监听 OpenCode 的事件流，实现边接收边朗读：

```typescript
import { TuiEventBus } from 'ocosay'

const bus = new TuiEventBus()

// 监听文本增量事件
bus.on('message.part.delta', (event) => {
  // event.properties.delta 包含新增的文本
  console.log('收到文本:', event.properties.delta)
})

// 监听回复片段结束
bus.on('message.part.end', () => {
  console.log('回复片段结束')
})
```

## 工具列表

ocosay 提供 10 个工具用于 OpenCode 集成：

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `tts_speak` | 将文本转换为语音并播放 | `text` (必填), `provider`, `voice`, `model`, `speed`, `volume`, `pitch` |
| `tts_stop` | 停止当前 TTS 播放 | - |
| `tts_pause` | 暂停当前 TTS 播放 | - |
| `tts_resume` | 恢复暂停的 TTS 播放 | - |
| `tts_list_voices` | 列出可用的音色 | `provider` |
| `tts_list_providers` | 列出所有已注册的 TTS 提供商 | - |
| `tts_status` | 获取当前 TTS 播放状态 | - |
| `tts_stream_speak` | 启动流式朗读（豆包模式） | `text`, `voice`, `model` |
| `tts_stream_stop` | 停止当前流式朗读 | - |
| `tts_stream_status` | 获取当前流式朗读状态 | - |

### tts_speak

将文本转换为语音并播放。

```typescript
// 工具调用
await tts_speak({
  text: '这是要播放的文本内容',
  provider: 'minimax',
  voice: 'male-qn-qingse',
  speed: 1.0
})
```

### tts_stop

停止当前 TTS 播放。

```typescript
// 工具调用
await tts_stop()
```

### tts_pause

暂停当前 TTS 播放。

```typescript
// 工具调用
await tts_pause()
```

### tts_resume

恢复暂停的 TTS 播放。

```typescript
// 工具调用
await tts_resume()
```

### tts_list_voices

列出可用的音色。

```typescript
// 工具调用
const result = await tts_list_voices({ provider: 'minimax' })
// 返回: { success: true, voices: [...] }
```

### tts_list_providers

列出所有已注册的 TTS 提供商。

```typescript
// 工具调用
const result = await tts_list_providers()
// 返回: { success: true, providers: ['minimax'] }
```

### tts_status

获取当前 TTS 播放状态。

```typescript
// 工具调用
const status = await tts_status()
// 返回: { success: true, isPlaying: boolean, isPaused: boolean }
```

### tts_stream_speak

启动流式朗读（豆包模式），订阅AI回复并边生成边朗读。

```typescript
// 工具调用
await tts_stream_speak({
  text: '初始文本（可选）',
  voice: 'female-shaonv',
  model: 'stream'
})
```

### tts_stream_stop

停止当前流式朗读。

```typescript
// 工具调用
await tts_stream_stop()
```

### tts_stream_status

获取当前流式朗读状态。

```typescript
// 工具调用
const status = await tts_stream_status()
// 返回: { success: true, isActive: boolean, bytesWritten: number, state: string }
```

## API 参考

### initialize(config?)

初始化 ocosay 插件。**必须首先调用此方法。**

| 参数 | 类型 | 说明 |
|------|------|------|
| config.defaultProvider | string | 默认 TTS 提供商，默认 minimax |
| config.defaultModel | 'sync' \| 'async' \| 'stream' | 默认合成模式，默认 stream |
| config.defaultVoice | string | 默认音色 ID |
| config.providers.minimax | MiniMaxConfig | MiniMax 提供商配置 |
| config.autoRead | boolean | 启用豆包模式（边接收边朗读） |
| config.streamBufferSize | number | 流式缓冲大小，默认 30 |
| config.streamBufferTimeout | number | 流式缓冲超时(ms)，默认 2000 |

```typescript
import { initialize } from 'ocosay'

await initialize({
  providers: {
    minimax: {
      apiKey: 'your-api-key',
      voiceId: 'male-qn-qingse',
      model: 'stream'
    }
  },
  autoRead: true  // 启用豆包模式
})
```

### destroy()

释放所有资源，清理插件状态。应在插件卸载或会话结束时调用。

```typescript
import { destroy } from 'ocosay'

await destroy()
```

### TuiEventBus

事件总线类，用于监听 OpenCode 事件流。

| 方法 | 说明 |
|------|------|
| `on(event, handler)` | 注册事件监听器 |
| `off(event, handler)` | 注销事件监听器 |

**可用事件：**

| 事件名 | 说明 | 事件属性 |
|--------|------|----------|
| `message.part.delta` | AI回复文本增量 | `sessionId`, `messageId`, `partId`, `properties.delta` |
| `message.part.end` | AI回复片段结束 | - |

### speak(text, options?)

将文本转换为语音并播放。

| 参数 | 类型 | 说明 |
|------|------|------|
| text | string | 要转换的文本 |
| options.provider | string | TTS 提供商，默认 minimax |
| options.voice | string | 音色 ID |
| options.model | 'sync' \| 'async' \| 'stream' | 合成模式，默认 stream |
| options.speed | number | 语速 0.5-2.0 |
| options.volume | number | 音量 0-100 |
| options.pitch | number | 音调 0.5-2.0 |

### stop()

停止当前播放。

### pause()

暂停当前播放。

### resume()

恢复暂停的播放。

### listVoices(provider?)

列出可用的音色。

```typescript
const voices = await listVoices('minimax')
console.log(voices)
// [{ id: 'male-qn-qingse', name: '青年清澈', ... }]
```

### isAutoReadEnabled()

检查豆包模式是否已启用。

```typescript
import { isAutoReadEnabled } from 'ocosay'

const enabled = isAutoReadEnabled()  // 返回: boolean
```

### isStreamEnabled()

检查流式组件是否已初始化。

```typescript
import { isStreamEnabled } from 'ocosay'

const enabled = isStreamEnabled()  // 返回: boolean
```

### getStreamStatus()

获取流式播放状态。

```typescript
import { getStreamStatus } from 'ocosay'

const status = getStreamStatus()
// 返回: { isActive: boolean, bytesWritten: number, state: string }
```

## MiniMax 音色列表

| ID | 名称 | 语言 | 性别 |
|----|------|------|------|
| male-qn-qingse | 青年清澈 | zh-CN | male |
| male-qn-qingse_2 | 青年清澈v2 | zh-CN | male |
| female-shaonv | 少女 | zh-CN | female |
| male-baiming | 成熟男声 | zh-CN | male |
| female-tianmei | 甜美女声 | zh-CN | female |

## 合成模式

| 模式 | 说明 | 适用场景 |
|------|----------|----------|
| stream | 流式合成，边生成边播放 | 长文本，首包延迟低 |
| sync | 同步合成，等待完整音频 | 短文本，一体化返回 |
| async | 异步合成，轮询获取结果 | 长文本，需要任务队列 |

## 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                              OpenCode                                  │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                         Plugin (ocosay)                          │ │
│  │  ┌───────────────────────────────────────────────────────────┐  │ │
│  │  │                          Speaker                           │  │ │
│  │  │  ┌───────────────────────┐  ┌───────────────────────────┐ │  │ │
│  │  │  │    StreamReader       │  │  StreamingSynthesizer    │ │  │ │
│  │  │  │    (文本缓冲)          │  │  (流式合成)               │ │  │ │
│  │  │  └───────────────────────┘  └───────────────────────────┘ │  │ │
│  │  │  ┌─────────────────────────────────────────────────────┐  │  │ │
│  │  │  │              StreamPlayer (边收边播)                  │  │  │ │
│  │  │  └─────────────────────────────────────────────────────┘  │  │ │
│  │  │                           │                               │  │ │
│  │  │  ┌─────────────────────────────────────────────────────┐  │  │ │
│  │  │  │                    TuiEventBus                       │  │  │ │
│  │  │  │              (监听 OpenCode 事件流)                   │  │  │ │
│  │  │  └─────────────────────────────────────────────────────┘  │  │ │
│  │  └───────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              │                                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                     TTS Providers (可扩展)                       │ │
│  │  ┌──────────────────┐  ┌────────────────────────────────────┐  │ │
│  │  │     MiniMax     │  │            (Future)                │  │ │
│  │  └──────────────────┘  └────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## 错误处理

```typescript
import { speak } from 'ocosay'
import { TTSError, TTSErrorCode } from 'ocosay'

try {
  await speak('你好')
} catch (error) {
  if (error instanceof TTSError) {
    console.error(`[${error.code}] ${error.message}`)
    console.error(`Provider: ${error.provider}`)
  }
}
```

### 错误码

| 错误码 | 说明 |
|--------|------|
| NETWORK | 网络错误 |
| AUTH | 认证失败 |
| QUOTA | 配额超限 |
| INVALID_VOICE | 无效音色 |
| INVALID_PARAMS | 无效参数 |
| PLAYER_ERROR | 播放错误 |
| UNKNOWN | 未知错误 |

## Troubleshooting / FAQ

### Q: 首包延迟太长怎么办？

**A:** 切换到 `stream` 模式，并选择较短的音色如 `female-shaonv`。

### Q: 播放出现卡顿？

**A:** 检查网络状况，或降低语速 `speed: 0.8`。

### Q: 如何切换不同音色？

**A:** 使用 `listVoices()` 查看可用音色，通过 `speak(text, { voice: 'voice-id' })` 指定。

### Q: 豆包模式不工作？

**A:** 确认 TuiEventBus 已正确初始化，并检查 `autoRead` 开关状态。

### Q: 报错 AUTH?

**A:** 检查 API Key 是否正确配置，或密钥是否过期。

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 监听模式
npm run watch
```

## Changelog

### v1.0.13 (2026-04-06)
**New Features:**
- ✨ Toast通知：插件加载成功/失败显示Toast (success/error)
- ✨ Toast通知：语音播放成功/失败显示Toast (success/error)
- 🔄 初始化重试机制：session创建时自动重试初始化
- 🌐 所有Toast内容改为英文
- 🔒 错误信息脱敏，不暴露内部细节

**Bug Fix:**
- 🐛 修复showToast调用方式（添加延迟+防御性检查）

### v1.0.10 (2026-04-05)
**Bug Fix:**
- 🐛 修复 showToast 时序问题（初始化成功后才显示 toast）
- 🐛 添加初始化失败时 error toast 提示

### v1.0.8 (2026-04-05)
**New Features:**
- ✨ 新增 OpenCode 启动成功弹窗，显示插件版本号和 autoRead 模式状态

### v1.0.4 (2026-04-05)
**Bug Fix & Improvements:**
- 🐛 修复 npm 包包含源码和测试文件问题（添加 .npmignore）
- 🎵 默认 voiceId 改为 `female-chengshu`（成熟女性音色）
- 🔧 默认 baseURL: `https://api.minimaxi.com`

### v1.0.5 (2026-04-05)
**Bug Fix:**
- 🐛 修复 OpenCode 加载失败 `Plugin export is not a function`
  - 根因：`export default { server }` 让 module.default 是对象不是函数
  - 修复：使用 named export `export const server = OcosayPlugin; export default server`

### v1.0.3 (2026-04-05)
**Bug Fix:**
- 🐛 修复 OpenCode 加载失败 `Plugin export is not a function`
  - 根因：TypeScript ESM 导入缺少 .js 扩展名
  - 修复：使用 esbuild 打包 plugin.ts

### v1.0.2 (2026-04-05)
**Bug Fix:**
- 🐛 修复 OpenCode 加载失败 `Plugin export is not a function`
  - 根因：OpenCode 插件加载器期望 `{ server: Plugin }` 格式导出
  - 修复：`export default { server: OcosayPlugin }`
- 🎵 默认 TTS 模型改为 `speech-2.8-hd`

### v1.0.1 (2026-04-05)
- 📚 多平台 AudioBackend 架构（6 种后端）
- 🔌 OpenCode 插件标准集成
- 📋 完整测试覆盖（304 测试）

### v1.0.0 (2026-04-05)
- 🎙️ 初始版本
- 🔊 多 TTS 模型支持
- 🎭 多种音色选择
- 🎛️ 播放控制（暂停、恢复、停止）
- 📡 豆包模式（边接收边朗读）

## Contributing

欢迎提交 Issue 和 PR！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing`)
5. 提交 Pull Request

## License

MIT
