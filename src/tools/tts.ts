/**
 * OpenCode TTS 工具定义
 * 用于 OpenCode Plugin 注册
 */

import { speak, stop, pause, resume, listVoices, getDefaultSpeakerService } from '../services/speaker-service'
import { stream, getDefaultStreamingService } from '../services/streaming-service'
import { TTSError, TTSErrorCode } from '../core/types'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('TTS')
import { 
  isStreamEnabled, 
  isAutoReadEnabled,
  getStreamStatus
} from '../index'

function extractTextArg(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') {
    return undefined
  }
  const argObj = args as Record<string, unknown>

  const text = argObj.text
  if (typeof text === 'string' && text.trim().length > 0) {
    return text.trim()
  }

  const text7 = argObj.text7
  if (text7 != null) {
    if (typeof text7 === 'string' && text7.trim().length > 0) {
      logger.warn('received text7 instead of text from OpenCode framework')
      return text7.trim()
    }
    if (typeof text7 === 'object') {
      // Handle { split: true, content: "..." } format
      if ('split' in text7 && 'content' in text7) {
        const content = (text7 as any).content
        if (typeof content === 'string' && content.trim().length > 0) {
          logger.info('text7 split format detected')
          return content.trim()
        }
      }
      // Handle simple { content: "..." } format
      if ('content' in text7) {
        const content = (text7 as any).content
        if (typeof content === 'string' && content.trim().length > 0) {
          logger.info('text7 content format detected')
          return content.trim()
        }
      }
    }
    logger.warn({ type: typeof text7 }, 'text7 is not a valid string or object with content')
    return undefined
  }

  for (const key of Object.keys(argObj)) {
    if (key.startsWith('text') && key !== 'text' && key !== 'text7') {
      const val = argObj[key]
      if (typeof val === 'string' && val.trim().length > 0) {
        return val.trim()
      }
    }
  }

  if (text !== undefined) {
    logger.warn({ type: typeof text }, 'text arg is not a valid string')
  }
  return undefined
}

export const ttsTools = [
  {
    name: 'tts_speak',
    description: '将文本转换为语音并播放（使用配置文件中的默认音色和模型）',
    input: {
      type: 'object',
      properties: {
        text: { 
          type: 'string', 
          description: '要转换的文本内容' 
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
    description: '列出可用的音色（使用配置文件中的默认提供商）'
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
    description: '启动流式朗读（豆包模式），订阅AI回复并边生成边朗读（使用配置文件中的默认音色）',
    input: {
      type: 'object',
      properties: {
        text: { 
          type: 'string', 
          description: '初始文本（可选）' 
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
      case 'tts_speak': {
        const text = extractTextArg(args)
        if (!text) {
          return { success: false, error: 'No valid text found in args' }
        }
        await speak(text)
        return { success: true, message: 'Speech completed' }
      }
      
      case 'tts_stop':
        await stop()
        return { success: true, message: 'Stopped' }
      
      case 'tts_pause':
        pause()
        return { success: true, message: 'Paused' }
      
      case 'tts_resume':
        resume()
        return { success: true, message: 'Resumed' }
      
      case 'tts_list_voices': {
        const voices = await listVoices(args?.provider as string | undefined)
        return { success: true, voices }
      }
      
      case 'tts_list_providers': {
        const speaker = getDefaultSpeakerService()
        const providers = speaker.getProviders()
        return { success: true, providers }
      }
      
      case 'tts_status': {
        const s = getDefaultSpeakerService()
        return {
          success: true,
          isPlaying: s.isPlaying(),
          isPaused: s.isPausedState()
        }
      }
      
      case 'tts_stream_speak': {
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
        const streamingService = getDefaultStreamingService()
        if (streamingService) {
          const textArg = extractTextArg(args)
          if (textArg && typeof textArg === 'string' && textArg.trim().length > 0) {
            logger.info({ text: textArg.substring(0, 50) + '...' }, 'synthesizing text')
            stream(textArg).catch((error) => {
              logger.error({ error }, 'stream failed')
            })
          }
          return { success: true, message: 'Stream speak started' }
        }
        throw new TTSError(
          'Stream components not available',
          TTSErrorCode.UNKNOWN,
          'tts_stream'
        )
      }
      
      case 'tts_stream_stop': {
        if (!isStreamEnabled()) {
          throw new TTSError(
            'Stream mode is not enabled. Please enable autoRead in configuration.',
            TTSErrorCode.UNKNOWN,
            'tts_stream'
          )
        }
        const streamingService = getDefaultStreamingService()
        if (streamingService) {
          streamingService.stop()
          return { success: true, message: 'Stream stopped' }
        }
        throw new TTSError(
          'Stream service not available',
          TTSErrorCode.UNKNOWN,
          'tts_stream'
        )
      }
      
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
