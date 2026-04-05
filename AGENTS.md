# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-06
**Commit:** fba8855
**Branch:** main

## OVERVIEW
ocosay - OpenCode TTS播放插件，支持豆包模式边接收边朗读。TypeScript ESM项目，依赖@opencode-ai/plugin、axios、ws、zod。

## STRUCTURE
```
ocosay/
├── src/
│   ├── plugin.ts       # OpenCode插件入口 (esbuild打包为dist/plugin.js)
│   ├── index.ts        # 库主入口，initialize/destroy
│   ├── config.ts       # 配置管理 (loadOrCreateConfig)
│   ├── core/           # 核心音频处理
│   │   ├── speaker.ts
│   │   ├── player.ts
│   │   ├── stream-player.ts
│   │   ├── stream-reader.ts
│   │   ├── streaming-synthesizer.ts
│   │   ├── types.ts
│   │   └── backends/   # 6种平台音频后端
│   ├── providers/       # TTS提供商
│   │   └── minimax.ts
│   └── tools/
│       └── tts.ts      # 10个TTS工具
├── tests/              # 12个Jest测试文件
├── dist/               # 构建输出
└── package.json
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| 插件入口/工具注册 | `src/plugin.ts` | 10个TTS工具定义 |
| 初始化/销毁 | `src/index.ts` | initialize(), destroy() |
| 配置管理 | `src/config.ts` | 读写ocosay.jsonc |
| 音频播放核心 | `src/core/speaker.ts` | Speaker类 |
| 流式播放 | `src/core/stream-player.ts` | 边收边播 |
| 多平台后端 | `src/core/backends/*.ts` | 6种后端选择 |
| TTS API调用 | `src/providers/minimax.ts` | MiniMax TTS |
| 工具实现 | `src/tools/tts.ts` | handleToolCall |
| 测试 | `tests/*.test.ts` | 12个测试文件 |

## CONVENTIONS
- TypeScript strict mode + ES2022
- 模块解析: `bundler` (非node16)
- ESM格式: `export const server = X; export default server`
- 插件导出: `{ server: Plugin }` 格式
- 构建: `tsc && esbuild src/plugin.ts`

## ANTI-PATTERNS (THIS PROJECT)
- **禁止用户路径直接执行**: 路径必须用白名单正则验证 (aplay-backend.ts, powershell-backend.ts)
- **禁止naudiodon作为直接依赖**: 必须在optionalDependencies
- **禁止修改baseURL**: 必须是api.minimaxi.com
- **禁止重复定义工具函数**: 统一导出
- **禁止ESM导入缺少.js扩展名**

## UNIQUE STYLES
- 豆包模式: StreamReader + StreamingSynthesizer + StreamPlayer流水线
- TuiEventBus监听OpenCode事件流实现边接收边朗读
- Provider可扩展架构 (当前仅MiniMax)
- 多平台AudioBackend自动选择

## COMMANDS
```bash
npm run build      # tsc + esbuild
npm run watch      # tsc --watch
npm test           # jest
npm run lint       # eslint src --ext .ts
```

## NOTES
- `naudiodon`是可选依赖，native模块，Linux/macOS可能需要单独安装
- Windows推荐WSL环境
- 流式模式首包延迟低，适合长文本
- 配置通过`~/.config/opencode/ocosay.jsonc`管理
