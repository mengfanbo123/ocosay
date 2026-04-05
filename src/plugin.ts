import { tool } from '@opencode-ai/plugin'
import type { Plugin, PluginInput, PluginOptions } from '@opencode-ai/plugin'
import { handleToolCall } from './index'
import { initialize, destroy } from './index'
import { loadOrCreateConfig } from './config'
import { readFileSync } from 'fs'
import { join } from 'path'

const pluginName = 'ocosay'
let pluginVersion = '0.0.0'
try {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'))
  pluginVersion = pkg.version || '0.0.0'
} catch {
  // 版本号读取失败不影响插件加载
}

const ttsSpeakTool = tool({
  description: '将文本转换为语音并播放',
  args: {
    text: tool.schema.string().describe('要转换的文本内容'),
    provider: tool.schema.string().optional().describe('TTS 提供商名称'),
    voice: tool.schema.string().optional().describe('音色 ID'),
    model: tool.schema.enum(['sync', 'async', 'stream']).optional().describe('合成模式'),
    speed: tool.schema.number().optional().describe('语速 0.5-2.0'),
    volume: tool.schema.number().optional().describe('音量 0-100'),
    pitch: tool.schema.number().optional().describe('音调 0.5-2.0')
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
  description: '列出可用的音色',
  args: {
    provider: tool.schema.string().optional().describe('TTS 提供商名称')
  },
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
  description: '启动流式朗读（豆包模式），订阅AI回复并边生成边朗读',
  args: {
    text: tool.schema.string().optional().describe('初始文本（可选）'),
    voice: tool.schema.string().optional().describe('音色ID'),
    model: tool.schema.enum(['sync', 'async', 'stream']).optional().describe('合成模式')
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

const OcosayPlugin: Plugin = async (input: PluginInput, _options?: PluginOptions) => {
  console.info(`${pluginName}: initializing...`)

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
    console.error('[Ocosay] initialization failed:', initError)
  }

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
            // 仍然失败，保持 initError 并显示 Toast
            const retryToastFn = input.client?.tui?.showToast
            if (retryToastFn) {
              try {
                retryToastFn({
                  body: {
                    title: `Ocosay v${pluginVersion} Initialization Failed`,
                    message: 'Initialization failed, please check config',
                    variant: 'error'
                  }
                })
              } catch (toastErr: any) {
                console.warn('[Ocosay] showToast failed:', toastErr)
              }
            }
          }
        }
      }

      // 延迟 1 秒等待 TUI 初始化
      setTimeout(() => {
        const showToastFn = input.client?.tui?.showToast
        if (!showToastFn) {
          console.warn('[Ocosay] showToast not available')
          return
        }
        if (initError) {
          try {
            showToastFn({
              body: {
                title: `Ocosay v${pluginVersion} Initialization Failed`,
                message: 'Initialization failed, please check config',
                variant: 'error'
              }
            })
          } catch (err: any) {
            console.warn('[Ocosay] showToast failed:', err)
          }
        } else {
          try {
            showToastFn({
              body: {
                title: `Ocosay v${pluginVersion} Plugin Loaded`,
                message: `Auto-read: ${config.autoRead ? 'ON' : 'OFF'}`,
                variant: 'success'
              }
            })
          } catch (err: any) {
            console.warn('[Ocosay] showToast failed:', err)
          }
        }
      }, 1000)
    },
    config: async () => {
      return
    }
  }
}

export const server = OcosayPlugin
export default OcosayPlugin
