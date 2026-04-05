/**
 * OpenCode TTS 工具定义
 * 用于 OpenCode Plugin 注册
 */

import { speak, stop, pause, resume, listVoices, getDefaultSpeaker } from '../core/speaker'
import { TTSError, TTSErrorCode } from '../core/types'
import { 
  isStreamEnabled, 
  isAutoReadEnabled,
  getStreamStatus, 
  getStreamReader, 
  getStreamingSynthesizer,
  getStreamPlayer 
} from '../index'

/**
 * OpenCode TTS 工具定义
 * 用于 OpenCode Plugin 注册
 */
export const ttsTools = [
  {
    name: 'tts_speak',
    description: '将文本转换为语音并播放',
    input: {
      type: 'object',
      properties: {
        text: { 
          type: 'string', 
          description: '要转换的文本内容' 
        },
        provider: { 
          type: 'string', 
          description: 'TTS 提供商名称',
          default: 'minimax'
        },
        voice: { 
          type: 'string', 
          description: '音色 ID' 
        },
        model: { 
          type: 'string', 
          enum: ['sync', 'async', 'stream'],
          description: '合成模式',
          default: 'stream'
        },
        speed: { 
          type: 'number', 
          description: '语速 0.5-2.0' 
        },
        volume: { 
          type: 'number', 
          description: '音量 0-100' 
        },
        pitch: { 
          type: 'number', 
          description: '音调 0.5-2.0' 
        }
      },
      required: ['text']
    }
  },
  {
    name: 'tts_stop',
    description: '停止当前 TTS 播放'
  },
  {
    name: 'tts_pause',
    description: '暂停当前 TTS 播放'
  },
  {
    name: 'tts_resume',
    description: '恢复暂停的 TTS 播放'
  },
  {
    name: 'tts_list_voices',
    description: '列出可用的音色',
    input: {
      type: 'object',
      properties: {
        provider: { 
          type: 'string', 
          description: 'TTS 提供商名称',
          default: 'minimax'
        }
      }
    }
  },
  {
    name: 'tts_list_providers',
    description: '列出所有已注册的 TTS 提供商'
  },
  {
    name: 'tts_status',
    description: '获取当前 TTS 播放状态',
    output: {
      type: 'object',
      properties: {
        isPlaying: { type: 'boolean' },
        isPaused: { type: 'boolean' }
      }
    }
  },
  {
    name: 'tts_stream_speak',
    description: '启动流式朗读（豆包模式），订阅AI回复并边生成边朗读',
    input: {
      type: 'object',
      properties: {
        text: { 
          type: 'string', 
          description: '初始文本（可选）' 
        },
        voice: { 
          type: 'string', 
          description: '音色ID' 
        },
        model: { 
          type: 'string', 
          enum: ['sync', 'async', 'stream'], 
          default: 'stream' 
        }
      }
    }
  },
  {
    name: 'tts_stream_stop',
    description: '停止当前流式朗读'
  },
  {
    name: 'tts_stream_status',
    description: '获取当前流式朗读状态',
    output: {
      type: 'object',
      properties: {
        isActive: { type: 'boolean' },
        bytesWritten: { type: 'number' },
        state: { type: 'string' }
      }
    }
  }
]

/**
 * 工具执行处理器
 */
export async function handleToolCall(
  toolName: string, 
  args?: Record<string, any>
): Promise<any> {
  try {
    switch (toolName) {
      case 'tts_speak':
        await speak(args?.text, {
          provider: args?.provider,
          voice: args?.voice,
          model: args?.model,
          speed: args?.speed,
          volume: args?.volume,
          pitch: args?.pitch
        })
        return { success: true, message: 'Speech completed' }
      
      case 'tts_stop':
        await stop()
        return { success: true, message: 'Stopped' }
      
      case 'tts_pause':
        pause()
        return { success: true, message: 'Paused' }
      
      case 'tts_resume':
        resume()
        return { success: true, message: 'Resumed' }
      
      case 'tts_list_voices':
        const voices = await listVoices(args?.provider as string | undefined)
        return { success: true, voices }
      
      case 'tts_list_providers':
        const speaker = getDefaultSpeaker()
        const providers = speaker.getProviders()
        return { success: true, providers }
      
      case 'tts_status':
        const s = getDefaultSpeaker()
        return {
          success: true,
          isPlaying: s.isPlaying(),
          isPaused: s.isPausedState()
        }
      
      case 'tts_stream_speak':
        if (!isAutoReadEnabled()) {
          throw new TTSError(
            'Stream mode is not enabled. autoRead must be enabled in configuration to use tts_stream_speak.',
            TTSErrorCode.UNKNOWN,
            'tts_stream'
          )
        }
        if (!isStreamEnabled()) {
          throw new TTSError(
            'Stream components not initialized. Please initialize with autoRead enabled.',
            TTSErrorCode.UNKNOWN,
            'tts_stream'
          )
        }
        const streamReader = getStreamReader()
        const synthesizer = getStreamingSynthesizer()
        if (streamReader && synthesizer) {
          streamReader.start()
          // 确保 args.text 是字符串类型才调用 synthesize
          if (args?.text !== undefined && typeof args.text === 'string') {
            console.log('[tts_stream_speak] synthesizing text:', args.text.substring(0, 50) + '...')
            synthesizer.synthesize(args.text)
          } else if (args?.text !== undefined) {
            console.log('[tts_stream_speak] args.text is not a string, type:', typeof args.text, 'value:', args.text)
          }
          return { success: true, message: 'Stream speak started' }
        }
        throw new TTSError(
          'Stream components not available',
          TTSErrorCode.UNKNOWN,
          'tts_stream'
        )
      
      case 'tts_stream_stop':
        if (!isStreamEnabled()) {
          throw new TTSError(
            'Stream mode is not enabled. Please enable autoRead in configuration.',
            TTSErrorCode.UNKNOWN,
            'tts_stream'
          )
        }
        const player = getStreamPlayer()
        if (player) {
          player.stop()
          return { success: true, message: 'Stream stopped' }
        }
        throw new TTSError(
          'Stream player not available',
          TTSErrorCode.UNKNOWN,
          'tts_stream'
        )
      
      case 'tts_stream_status':
        if (!isStreamEnabled()) {
          return {
            success: true,
            isActive: false,
            bytesWritten: 0,
            state: 'not_initialized'
          }
        }
        return {
          success: true,
          ...getStreamStatus()
        }
      
      default:
        throw new TTSError(
          `Unknown tool: ${toolName}`,
          TTSErrorCode.UNKNOWN,
          'tools'
        )
    }
  } catch (error) {
    if (error instanceof TTSError) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        provider: error.provider
      }
    }
    return {
      success: false,
      error: String(error)
    }
  }
}
