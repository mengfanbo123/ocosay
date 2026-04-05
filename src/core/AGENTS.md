# src/core/

## OVERVIEW
核心音频处理模块，包含Speaker、Player、流式组件和多平台后端。

## STRUCTURE
```
core/
├── speaker.ts              # 扬声器管理，封装播放控制
├── player.ts              # 基础播放器接口
├── stream-player.ts       # 流式播放器(边收边播)
├── stream-reader.ts       # 文本缓冲器，收集流式文本
├── streaming-synthesizer.ts # 流式合成器
├── types.ts              # TTSError, TTSErrorCode等
└── backends/             # 6种平台音频后端
    ├── base.ts           # AudioBackend基类
    ├── aplay-backend.ts  # Linux aplay
    ├── afplay-backend.ts # macOS afplay
    ├── powershell-backend.ts # Windows PowerShell
    └── naudiodon-backend.ts  # naudiodon库
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 播放控制 | `speaker.ts` | Speaker类，play/pause/resume/stop |
| 流式播放 | `stream-player.ts` | StreamPlayer，边收边播实现 |
| 文本缓冲 | `stream-reader.ts` | StreamReader，handleDelta/handleEnd |
| 流式合成 | `streaming-synthesizer.ts` | StreamingSynthesizer，synthesize() |
| 错误类型 | `types.ts` | TTSError, TTSErrorCode枚举 |
| 后端选择 | `backends/index.ts` | 平台检测与后端选择 |

## CONVENTIONS
- AudioBackend子类必须实现: `play()`, `pause()`, `resume()`, `stop()`, `setVolume()`
- 流式组件使用EventEmitter模式
- TuiEventBus通过`(global as any).__opencode_tuieventbus__`访问

## ANTI-PATTERNS
- 禁止用户路径直接传命令执行，必须用SAFE_PATH_REGEX验证
- PowerShell后端禁止字符串拼接命令，必须写临时脚本

## PLATFORM BACKENDS
| 后端 | 文件 | 平台 | 特性 |
|------|------|------|------|
| aplay | aplay-backend.ts | Linux | 命令行，不支持音量 |
| afplay | afplay-backend.ts | macOS | 命令行，不支持音量 |
| powershell | powershell-backend.ts | Windows | 不支持暂停/恢复 |
| naudiodon | naudiodon-backend.ts | 跨平台 | native库，可选 |

## NOTES
- Windows不原生支持暂停/恢复，powershell-backend.ts使用停止+重新播放模拟
- 流式缓冲默认30字符/2000ms超时
