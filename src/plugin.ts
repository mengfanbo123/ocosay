import { tool } from '@opencode-ai/plugin'
import type { Plugin, PluginInput, PluginOptions } from '@opencode-ai/plugin'
import { handleToolCall } from './index.js'
import { initialize } from './index.js'
import { loadOrCreateConfig } from './config.js'
import { createModuleLogger } from './utils/logger.js'
import { notificationService } from './core/notification.js'

const logger = createModuleLogger('Plugin')
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { execSync } from 'child_process'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

async function ensureNaudiodonCompiled(): Promise<void> {
  try {
    require('naudiodon')
    logger.info('naudiodon already compiled')
    return
  } catch {
    logger.info('naudiodon not compiled, attempting to compile...')
  }

  try {
    const naudiodonPath = dirname(require.resolve('naudiodon'))
    logger.info({ naudiodonPath }, 'found naudiodon at')

    notificationService.info('正在编译 naudiodon...', 'Ocosay 音频后端')
    execSync('npm rebuild naudiodon', {
      cwd: naudiodonPath,
      stdio: 'inherit'
    })
    logger.info('naudiodon compiled successfully')
    notificationService.success('naudiodon 编译成功', '音频后端已就绪')
  } catch (err) {
    logger.warn({ err }, 'naudiodon rebuild failed, checking for PortAudio...')
    notificationService.warning('naudiodon 编译失败', '正在尝试安装 PortAudio...')
    const installed = installPortAudio()
    if (installed) {
      try {
        const naudiodonPath = dirname(require.resolve('naudiodon'))
        notificationService.info('正在重新编译 naudiodon...', 'Ocosay')
        execSync('npm rebuild naudiodon', {
          cwd: naudiodonPath,
          stdio: 'inherit'
        })
        logger.info('naudiodon compiled successfully after PortAudio install')
        notificationService.success('naudiodon 编译成功', '音频后端已就绪')
      } catch (retryErr) {
        logger.error({ err: retryErr }, 'failed to compile naudiodon even after PortAudio install')
        notificationService.error('naudiodon 编译失败', '请手动运行: npm rebuild naudiodon')
      }
    } else {
      notificationService.error('PortAudio 安装失败', '请手动安装后重试')
    }
  }
}

function installPortAudio(): boolean {
  const platform = process.platform
  logger.info({ platform }, 'installing PortAudio for platform')
  notificationService.info('正在安装 PortAudio...', `平台: ${platform}`)

  try {
    if (platform === 'linux') {
      execSync('sudo apt-get update && sudo apt-get install -y libportaudio-dev portaudio', { stdio: 'inherit' })
    } else if (platform === 'darwin') {
      execSync('brew install portaudio', { stdio: 'inherit' })
    } else if (platform === 'win32') {
      execSync('choco install portaudio -y', { stdio: 'inherit' })
    } else {
      logger.warn('unsupported platform for automatic PortAudio install')
      return false
    }
    return true
  } catch (err) {
    logger.error({ err }, 'failed to install PortAudio automatically')
    return false
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 顶层 ID 导出（OpenCode Plugin 标准）
const id = "ocosay"
let pluginVersion = '0.0.0'
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))
  pluginVersion = pkg.version || '0.0.0'
} catch {
  // 版本号读取失败不影响插件加载
}

const ttsSpeakTool = tool({
  description: '将文本转换为语音并播放（使用配置文件中的默认音色和模型）',
  args: {
    text: tool.schema.string().describe('要转换的文本内容')
  },
  execute: async (args) => {
    const result = await handleToolCall('tts_speak', args)
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStopTool = tool({
  description: '停止当前 TTS 播放',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_stop')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsPauseTool = tool({
  description: '暂停当前 TTS 播放',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_pause')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsResumeTool = tool({
  description: '恢复暂停的 TTS 播放',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_resume')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsListVoicesTool = tool({
  description: '列出可用的音色（使用配置文件中的默认提供商）',
  args: {},
  execute: async (args) => {
    const result = await handleToolCall('tts_list_voices', args)
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsListProvidersTool = tool({
  description: '列出所有已注册的 TTS 提供商',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_list_providers')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStatusTool = tool({
  description: '获取当前 TTS 播放状态',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_status')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStreamSpeakTool = tool({
  description: '启动流式朗读（豆包模式），订阅AI回复并边生成边朗读（使用配置文件中的默认音色）',
  args: {
    text: tool.schema.string().optional().describe('初始文本（可选）')
  },
  execute: async (args) => {
    const result = await handleToolCall('tts_stream_speak', args)
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStreamStopTool = tool({
  description: '停止当前流式朗读',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_stream_stop')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStreamStatusTool = tool({
  description: '获取当前流式朗读状态',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_stream_status')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return typeof result === 'string' ? result : JSON.stringify(result)
  }
})

let initError: Error | null = null

const server: Plugin = (async (input: PluginInput, _options?: PluginOptions) => {
  const opencodeTui = input.client?.tui
  ;(global as any).__opencode_tui__ = opencodeTui
  notificationService.setTui(opencodeTui)

  await ensureNaudiodonCompiled()
  const config = loadOrCreateConfig()

  try {
    await initialize({
      autoRead: config.autoRead,
      providers: {
        minimax: {
          apiKey: config.providers.minimax.apiKey,
          baseURL: config.providers.minimax.baseURL || undefined,
          voiceId: config.providers.minimax.voiceId || undefined
        }
      }
    })
  } catch (err) {
    initError = err instanceof Error ? err : new Error(String(err))
    logger.error({ error: initError }, 'initialization failed')
  }

  setTimeout(() => {
    if (initError) {
      notificationService.error(
        `Ocosay v${pluginVersion} Init Failed`,
        'Please check your config file',
        8000
      )
    } else {
      notificationService.success(
        `Ocosay v${pluginVersion} Ready`,
        `Auto-read: ${config.autoRead ? 'ON' : 'OFF'}`,
        5000
      )
    }
  }, 1500)

  return {
    tool: {
      tts_speak: ttsSpeakTool,
      tts_stop: ttsStopTool,
      tts_pause: ttsPauseTool,
      tts_resume: ttsResumeTool,
      tts_list_voices: ttsListVoicesTool,
      tts_list_providers: ttsListProvidersTool,
      tts_status: ttsStatusTool,
      tts_stream_speak: ttsStreamSpeakTool,
      tts_stream_stop: ttsStreamStopTool,
      tts_stream_status: ttsStreamStatusTool
    },
    event: async ({ event }) => {
      if (event.type !== 'session.created') return
      if (event.properties?.info?.parentID) return

      // 初始化重试机制
      if (initError) {
        const retryConfig = loadOrCreateConfig()
        if (retryConfig.providers.minimax.apiKey) {
          try {
            await initialize({
              autoRead: retryConfig.autoRead,
              providers: {
                minimax: {
                  apiKey: retryConfig.providers.minimax.apiKey,
                  baseURL: retryConfig.providers.minimax.baseURL || undefined,
                  voiceId: retryConfig.providers.minimax.voiceId || undefined
                }
              }
            })
            initError = null
          } catch (err) {
            notificationService.error(
              `Ocosay v${pluginVersion} Init Failed`,
              'Initialization failed, please check config',
              8000
            )
          }
        }
      }
    },
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {}
      opencodeConfig.command['tts'] = {
        template: '',
        description: 'TTS playback control'
      }
    }
  }
}) satisfies Plugin

// OpenCode Plugin 标准导出格式
export { id, server }
export default { id, server }
