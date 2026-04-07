/**
 * Speaker - TTS 统一调用入口
 * 提供简洁的 API 和便捷函数
 */

import { EventEmitter } from 'events'
import { 
  TTSProvider, 
  TTSError,
  TTSErrorCode,
  SpeakOptions,
  Voice,
  TTSEvent,
  SynthesisModel
} from './types'
import { getProvider, listProviders, hasProvider } from '../providers/base'
import { AudioPlayer, PlayerEvents } from './player'
import { createModuleLogger } from '../utils/logger'
import { notificationService } from './notification'

const logger = createModuleLogger('Speaker')

export interface SpeakerOptions {
  defaultProvider?: string
  defaultModel?: SynthesisModel
  defaultVoice?: string
  onEvent?: (event: TTSEvent, data?: any) => void
}

/**
 * Speaker - TTS 统一调用入口类
 * 封装 Provider 和 Player，提供简洁的 speak/pause/resume/stop API
 */
export class Speaker extends EventEmitter {
  private currentProvider?: TTSProvider
  private player?: AudioPlayer
  private currentText?: string
  private isSpeaking = false
  private isPaused = false
  
  constructor(private options: SpeakerOptions = {}) {
    super()
    
    // 初始化播放器
    const playerEvents: PlayerEvents = {
      onStart: () => this.emit('start', this.currentText),
      onEnd: () => {
        this.isSpeaking = false
        this.emit('end', this.currentText)

        notificationService.info(
          'TTS playback success',
          'Audio generated and playing'
        )
      },
      onError: (error) => this.emit('error', error),
      onPause: () => {
        this.isPaused = true
        this.emit('pause')
      },
      onResume: () => {
        this.isPaused = false
        this.emit('resume')
      },
      onStop: () => {
        this.isSpeaking = false
        this.isPaused = false
        this.emit('stop')
      }
    }
    
    this.player = new AudioPlayer(playerEvents)
  }
  
  /**
   * 说话 - 核心方法
   * @param text 要说的文本
   * @param options 可选参数
   */
  async speak(
    text: string, 
    options: SpeakOptions & { provider?: string } = {}
  ): Promise<void> {
    // 参数校验
    if (!text || text.trim().length === 0) {
      throw new TTSError(
        'Text cannot be empty',
        TTSErrorCode.INVALID_PARAMS,
        'speaker'
      )
    }
    
    // 停止当前播放
    if (this.isSpeaking) {
      await this.stop()
    }
    
    this.isSpeaking = true
    this.currentText = text
    
    try {
      // 获取 provider
      const providerName = options.provider || this.options.defaultProvider || 'minimax'
      if (!hasProvider(providerName)) {
        throw new TTSError(
          `Provider "${providerName}" not found`,
          TTSErrorCode.UNKNOWN,
          'speaker'
        )
      }
      
      this.currentProvider = getProvider(providerName)
      
      // 调用 provider 生成音频
      const result = await this.currentProvider.speak(text, {
        model: options.model || this.options.defaultModel || 'stream',
        voice: options.voice || this.options.defaultVoice,
        speed: options.speed,
        volume: options.volume,
        pitch: options.pitch,
        sourceVoice: options.sourceVoice
      })
      
      // 播放音频
      if (this.player) {
        await this.player.play(result.audioData, result.format)
        logger.info({ textLength: text.length, model: options.model }, 'TTS playback completed')
      }
      
    } catch (error) {
      this.isSpeaking = false
      logger.error({ error }, 'speak failed')

      // 显示播放失败 Toast
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      notificationService.error(
        'TTS playback error',
        errorMessage
      )

      if (error instanceof TTSError) {
        this.emit('error', error)
        throw error
      }
      const ttsError = new TTSError(
        'Speak failed',
        TTSErrorCode.UNKNOWN,
        'speaker',
        error
      )
      this.emit('error', ttsError)
      throw ttsError
    }
  }
  
  /**
   * 暂停播放
   */
  pause(): void {
    if (this.player && this.isSpeaking && !this.isPaused) {
      this.player.pause()
    }
  }
  
  /**
   * 恢复播放
   */
  resume(): void {
    if (this.player && this.isPaused) {
      this.player.resume()
    }
  }
  
  /**
   * 停止播放
   */
  async stop(): Promise<void> {
    this.isSpeaking = false
    this.isPaused = false
    
    if (this.player) {
      await this.player.stop()
    }
  }
  
  /**
   * 销毁 Speaker，释放资源
   */
  async destroy(): Promise<void> {
    this.isSpeaking = false
    this.isPaused = false
    
    if (this.player) {
      await this.player.stop()
      this.player = undefined
    }
    
    this.currentProvider = undefined
    this.currentText = undefined
  }
  
  /**
   * 列出可用音色
   */
  async listVoices(providerName?: string): Promise<Voice[]> {
    const name = providerName || this.options.defaultProvider || 'minimax'
    const provider = getProvider(name)
    return provider.listVoices()
  }
  
  /**
   * 获取 Provider 能力
   */
  getCapabilities(providerName?: string) {
    const name = providerName || this.options.defaultProvider || 'minimax'
    const provider = getProvider(name)
    return provider.getCapabilities()
  }
  
  /**
   * 获取所有已注册的 Provider
   */
  getProviders(): string[] {
    return listProviders()
  }
  
  /**
   * 是否正在播放
   */
  isPlaying(): boolean {
    return this.isSpeaking && !this.isPaused
  }
  
  /**
   * 是否暂停
   */
  isPausedState(): boolean {
    return this.isPaused
  }
}

// ============================================================================
// 便捷函数 - 默认 Speaker 实例
// ============================================================================

let defaultSpeaker: Speaker | undefined

/**
 * 获取默认 Speaker 实例（单例）
 */
export function getDefaultSpeaker(): Speaker {
  if (!defaultSpeaker) {
    defaultSpeaker = new Speaker()
  }
  return defaultSpeaker
}

/**
 * 说话（便捷函数）
 */
export async function speak(
  text: string, 
  options?: SpeakOptions & { provider?: string }
): Promise<void> {
  const speaker = getDefaultSpeaker()
  return speaker.speak(text, options)
}

/**
 * 停止（便捷函数）
 */
export async function stop(): Promise<void> {
  const speaker = getDefaultSpeaker()
  return speaker.stop()
}

/**
 * 暂停（便捷函数）
 */
export function pause(): void {
  const speaker = getDefaultSpeaker()
  speaker.pause()
}

/**
 * 恢复（便捷函数）
 */
export function resume(): void {
  const speaker = getDefaultSpeaker()
  speaker.resume()
}

/**
 * 列出音色（便捷函数）
 */
export async function listVoices(providerName?: string): Promise<Voice[]> {
  const speaker = getDefaultSpeaker()
  return speaker.listVoices(providerName)
}

export default Speaker
