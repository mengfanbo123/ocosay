# ocosay - OpenCode TTS 播放插件

OpenCode 的 TTS（文本转语音）播放插件，支持多种 TTS 模型和合成模式。

## 特性

- 🎙️ **多 TTS 模型支持** - MiniMax 作为第一个实现，可扩展其他提供商
- 🔊 **多种合成模式** - 同步、异步、流式三种模式可选
- 🎭 **音色克隆** - 支持音色快速复刻
- 🎛️ **播放控制** - 暂停、恢复、停止
- 📋 **音色列表** - 查询可用音色
- 🔌 **OpenCode Plugin** - 无缝集成 OpenCode

## 安装

```bash
npm install
```

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

## API 参考

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
|------|------|----------|
| stream | 流式合成，边生成边播放 | 长文本，首包延迟低 |
| sync | 同步合成，等待完整音频 | 短文本，一体化返回 |
| async | 异步合成，轮询获取结果 | 长文本，需要任务队列 |

## 架构设计

```
┌─────────────────────────────────────┐
│           OpenCode                   │
│  ┌─────────────────────────────────┐│
│  │        Plugin (ocosay)          ││
│  │  ┌─────────────────────────────┐││
│  │  │      Speaker               │││
│  │  │  ┌───────────────────────┐ │││
│  │  │  │    Player             │ │││
│  │  │  └───────────────────────┘ │││
│  │  └─────────────────────────────┘││
│  └─────────────────────────────────┘│
│              │                      │
│  ┌─────────────────────────────────┐│
│  │    TTS Providers (可扩展)       ││
│  │  ┌───────────┐ ┌─────────────┐ ││
│  │  │  MiniMax  │ │  (Future)    │ ││
│  │  └───────────┘ └─────────────┘ ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
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

## 许可证

MIT
