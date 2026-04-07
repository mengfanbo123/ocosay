/**
 * StreamingService - 流式TTS服务（Service层）
 * 
 * 功能：
 * - 调用Provider层获取流式TTS
 * - 调用Backend层播放音频
 * - 支持边接收边播放（豆包模式）
 * 
 * 数据流：
 * stream(text) → MiniMaxProvider.speak(stream) → StreamPlayer (边收边播)
 */

import { EventEmitter } from 'events'
import { getProvider } from '../providers/base'
import { TTSError, TTSErrorCode, AudioResult } from '../core/types'
import { StreamPlayer, StreamPlayerOptions } from '../core/stream-player'
import { BackendType } from '../core/backends'
import { logger } from '../utils/logger'

export interface StreamingServiceOptions {
  provider?: string
  voice?: string
  speed?: number
  volume?: number
  pitch?: number
  backendType?: BackendType
}

export interface StreamingServiceStatus {
  isActive: boolean
  bytesWritten: number
  state: string
}

export class StreamingService extends EventEmitter {
  private player: StreamPlayer | null = null
  private providerName: string
  private voice?: string
  private speed?: number
  private volume?: number
  private pitch?: number
  private backendType: BackendType
  private _isActive = false
  private _bytesWritten = 0

  constructor(options: StreamingServiceOptions = {}) {
    super()
    this.providerName = options.provider || 'minimax'
    this.voice = options.voice
    this.speed = options.speed
    this.volume = options.volume
    this.pitch = options.pitch
    this.backendType = options.backendType || BackendType.NAUDIODON
  }

  /**
   * 获取时间戳
   */
  private getTimestamp(): string {
    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  }

  /**
   * 初始化播放器
   */
  private initPlayer(): StreamPlayer {
    if (this.player) {
      this.player.stop()
      this.player = null
    }

    const playerOptions: StreamPlayerOptions = {
      format: 'mp3',
      backendType: this.backendType,
      events: {
        onStart: () => {
          const timestamp = this.getTimestamp()
          logger.info(`[Ocosay][${timestamp}][INFO][Streaming] 对应事件{流式播放开始}`)
          this.emit('start')
        },
        onEnd: () => {
          const timestamp = this.getTimestamp()
          logger.info(`[Ocosay][${timestamp}][INFO][Streaming] 对应事件{流式播放结束}`)
          this._isActive = false
          this.emit('end')
        },
        onError: (error: Error) => {
          const timestamp = this.getTimestamp()
          logger.error(`[Ocosay][${timestamp}][ERROR][Streaming] 对应事件{流式播放错误} - ${error.message}`)
          this._isActive = false
          this.emit('error', error)
        },
        onProgress: (bytes: number) => {
          this._bytesWritten = bytes
          this.emit('progress', bytes)
        },
        onPause: () => {
          const timestamp = this.getTimestamp()
          logger.info(`[Ocosay][${timestamp}][INFO][Streaming] 对应事件{流式播放暂停}`)
          this.emit('pause')
        },
        onResume: () => {
          const timestamp = this.getTimestamp()
          logger.info(`[Ocosay][${timestamp}][INFO][Streaming] 对应事件{流式播放恢复}`)
          this.emit('resume')
        },
        onStop: () => {
          const timestamp = this.getTimestamp()
          logger.info(`[Ocosay][${timestamp}][INFO][Streaming] 对应事件{流式播放停止}`)
          this._isActive = false
          this._bytesWritten = 0
          this.emit('stop')
        }
      }
    }

    this.player = new StreamPlayer(playerOptions)
    return this.player
  }

  /**
   * 流式播放文本
   * 边接收边播放（豆包模式）
   */
  async stream(text: string): Promise<void> {
    if (!text || text.trim().length === 0) {
      const timestamp = this.getTimestamp()
      logger.warn(`[Ocosay][${timestamp}][WARNING][Streaming] 对应事件{空文本跳过}`)
      return
    }

    const timestamp = this.getTimestamp()
    logger.info(`[Ocosay][${timestamp}][INFO][Streaming] 对应事件{流式播放开始} - 文本长度: ${text.length}`)

    try {
      // 获取 Provider
      const provider = getProvider(this.providerName)
      if (!provider) {
        throw new TTSError(
          `Provider ${this.providerName} not found`,
          TTSErrorCode.UNKNOWN,
          this.providerName
        )
      }

      // 初始化播放器
      const player = this.initPlayer()
      await player.start()
      this._isActive = true
      this._bytesWritten = 0

      // 调用 Provider 的流式合成
      const result = await provider.speak(text, {
        voice: this.voice,
        model: 'stream',
        speed: this.speed,
        volume: this.volume,
        pitch: this.pitch
      })

      // 处理音频结果
      await this.processAudioResult(result, player)

    } catch (error) {
      const ts = this.getTimestamp()
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error(`[Ocosay][${ts}][ERROR][Streaming] 对应事件{流式播放错误} - ${errorMsg}`)
      this._isActive = false
      throw error
    }
  }

  /**
   * 处理音频结果
   */
  private async processAudioResult(result: AudioResult, player: StreamPlayer): Promise<void> {
    if (result.isStream && result.audioData instanceof ReadableStream) {
      // 流式数据：边收边播
      await this.streamAudioChunks(result.audioData, player)
    } else if (Buffer.isBuffer(result.audioData)) {
      // 非流式数据：直接写入
      await player.write(result.audioData)
      player.end()
    }
  }

  /**
   * 流式处理音频chunk
   */
  private async streamAudioChunks(stream: ReadableStream, player: StreamPlayer): Promise<void> {
    const reader = stream.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        if (value) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
          await player.write(chunk)
        }
      }
    } finally {
      reader.releaseLock()
      player.end()
    }
  }

  /**
   * 停止流式播放
   */
  stop(): void {
    if (this.player) {
      this.player.stop()
    }
    this._isActive = false
    this._bytesWritten = 0
  }

  /**
   * 暂停流式播放
   */
  pause(): void {
    if (this.player) {
      this.player.pause()
    }
  }

  /**
   * 恢复流式播放
   */
  resume(): void {
    if (this.player) {
      this.player.resume()
    }
  }

  /**
   * 获取流式播放状态
   */
  getStatus(): StreamingServiceStatus {
    return {
      isActive: this._isActive,
      bytesWritten: this._bytesWritten,
      state: this.player?.isStopped() ? 'stopped' : 
             this.player?.isPaused() ? 'paused' : 
             this._isActive ? 'playing' : 'idle'
    }
  }

  /**
   * 是否处于活跃状态
   */
  isActive(): boolean {
    return this._isActive
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    if (this.player) {
      this.player.stop()
      this.player = null
    }
    this._isActive = false
    this._bytesWritten = 0
  }
}

// 单例实例
let defaultStreamingService: StreamingService | undefined

/**
 * 获取默认流式服务实例
 */
export function getDefaultStreamingService(): StreamingService {
  if (!defaultStreamingService) {
    defaultStreamingService = new StreamingService()
  }
  return defaultStreamingService
}

/**
 * 导出 stream 方法
 */
export async function stream(text: string, options?: StreamingServiceOptions): Promise<void> {
  const service = options ? new StreamingService(options) : getDefaultStreamingService()
  return service.stream(text)
}

/**
 * 导出 stop 方法
 */
export function streamStop(): void {
  const service = getDefaultStreamingService()
  service.stop()
}

/**
 * 导出 pause 方法
 */
export function streamPause(): void {
  const service = getDefaultStreamingService()
  service.pause()
}

/**
 * 导出 resume 方法
 */
export function streamResume(): void {
  const service = getDefaultStreamingService()
  service.resume()
}

/**
 * 导出 getStreamStatus 方法
 */
export function getStreamStatus(): StreamingServiceStatus {
  const service = getDefaultStreamingService()
  return service.getStatus()
}

export default StreamingService
