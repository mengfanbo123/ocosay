# src/core/backends/

## OVERVIEW
6种平台音频后端实现，负责实际音频播放。

## FILES
| 文件 | 平台 | 关键实现 |
|------|------|----------|
| `base.ts` | - | AudioBackend抽象基类 |
| `index.ts` | - | 后端选择逻辑 |
| `aplay-backend.ts` | Linux | 调用aplay命令 |
| `afplay-backend.ts` | macOS | 调用afplay命令 |
| `powershell-backend.ts` | Windows | PowerShell脚本执行 |
| `naudiodon-backend.ts` | 跨平台 | naudiodon native库 |

## AudioBackend接口
```typescript
interface AudioBackend {
  play(filePath: string): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  setVolume?(volume: number): Promise<void>  // 可选
}
```

## 安全要求
- **所有路径必须验证**: `SAFE_PATH_REGEX`白名单正则
- **禁止字符串拼接命令**: PowerShell必须写临时脚本
- **Windows路径正则**: `/^[\w\:\\_.]+$/i`
- **Unix路径正则**: `/^[\w\/\.]+$/`

## 平台限制
| 后端 | 暂停/恢复 | 音量控制 | 命令注入风险 |
|------|----------|----------|--------------|
| aplay | ❌ | ❌ | ⚠️ 需路径验证 |
| afplay | ❌ | ❌ | ⚠️ 需路径验证 |
| powershell | ❌ (模拟) | ❌ | ⚠️ 需脚本封装 |
| naudiodon | ✅ | ✅ | ✅ 无 |

## 选择逻辑 (index.ts)
1. 检测`process.platform`
2. Windows → powershell-backend
3. Darwin arm64 → naudiodon-backend (如果可用)
4. Darwin x64 → afplay-backend
5. Linux → 检查naudiodon → aplay

## NOTES
- naudiodon是可选依赖，需npm install naudiodon
- 后端实例通过Speaker内部管理，不直接暴露
