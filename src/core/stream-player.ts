/**
 * StreamPlayer - 真正的边收边播流式音频播放器
 * 使用 AudioBackend 实现真正的流式播放（不写临时文件）
 */

import { EventEmitter } from 'events'
import { createBackend, AudioBackend, BackendType } from './backends'

/**
 * StreamPlayer Events - 流式播放器事件回调接口
 */
export interface StreamPlayerEvents {
  onProgress?: (bytesWritten: number) => void
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
}

/**
 * StreamPlayer Options - 流式播放器配置选项
 */
export interface StreamPlayerOptions {
  format?: 'mp3' | 'wav' | 'flac'
  events?: StreamPlayerEvents
  backendType?: BackendType
}

/**
 * StreamPlayer - 边收边播的流式音频播放器
 * 
 * 特性：
 * - 使用 AudioBackend 实现真正的边收边播
 * - 不写临时文件，直接流式播放
 * - 支持 pause/resume/stop 控制
 */
export class StreamPlayer extends EventEmitter {
  private backend: AudioBackend | null = null
  private _bytesWritten = 0
  private _started = false
  private _paused = false
  private _stopped = false
  private _starting = false
  private format: 'mp3' | 'wav' | 'flac' = 'mp3'
  private events?: StreamPlayerEvents

  constructor(options: StreamPlayerOptions = {}) {
    super()
    this.format = options.format || 'mp3'
    this.events = options.events
    
    // 创建音频后端，默认使用 AUTO 自动选择合适的后端
    const backendType = options.backendType || BackendType.AUTO
    this.backend = createBackend(backendType, {
      format: this.format,
      events: {
        onStart: () => {
          this.events?.onStart?.()
          this.emit('start')
        },
        onEnd: () => {
          this.events?.onEnd?.()
          this.emit('end')
        },
        onError: (error: Error) => {
          this.handleError(error)
        },
        onPause: () => {
          this._paused = true
          this.events?.onPause?.()
          this.emit('pause')
        },
        onResume: () => {
          this._paused = false
          this.events?.onResume?.()
          this.emit('resume')
        },
        onStop: () => {
          this.events?.onStop?.()
          this.emit('stop')
        },
        onProgress: (bytes: number) => {
          this.events?.onProgress?.(bytes)
          this.emit('progress', bytes)
        }
      }
    })
  }

  /**
   * 开始播放
   * 初始化后端，准备接收音频数据
   */
  async start(): Promise<void> {
    if (this._started) {
      return
    }

    if (!this.backend) {
      this.handleError(new Error('Audio backend not initialized'))
      return
    }

    // 初始化后端（playsound-backend 是异步的，需 await）
    await Promise.resolve(this.backend.start(''))
    
    this._started = true
    this._stopped = false
    this._paused = false
    this._bytesWritten = 0
  }

  /**
   * 写入音频数据块（边收边播）
   * 如果尚未 start()，会自动调用
   */
  async write(chunk: Buffer): Promise<void> {
    // 如果已停止，直接忽略
    if (this._stopped) {
      return
    }

    // 如果未启动，防止竞态条件并自动启动
    if (!this._started) {
      // 防止并发启动
      while (this._starting) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      this._starting = true
      try {
        await this.start()
      } finally {
        this._starting = false
      }
    }

    // 写入数据到后端
    if (this.backend) {
      // backend.write() 可能返回 Promise 或 void，用 Promise.resolve 处理
      await Promise.resolve(this.backend.write(chunk))
      this._bytesWritten += chunk.length
      this.events?.onProgress?.(this._bytesWritten)
      this.emit('progress', this._bytesWritten)
    }
  }

  /**
   * 结束写入
   * 通知后端写入完成，但保持播放直到结束
   */
  end(): void {
    if (this.backend) {
      this.backend.end()
    }
  }

  /**
   * 停止播放
   * 立即停止播放并释放资源
   */
  stop(): void {
    this._stopped = true
    this._started = false
    this._paused = false

    // 停止后端
    if (this.backend) {
      this.backend.stop()
    }

    this._bytesWritten = 0

    this.events?.onStop?.()
    this.emit('stop')
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (!this._started || this._paused || this._stopped) {
      return
    }

    if (this.backend) {
      this.backend.pause()
    }
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (!this._paused || this._stopped) {
      return
    }

    if (this.backend) {
      this.backend.resume()
    }
  }

  /**
   * 是否已启动
   */
  isStarted(): boolean {
    return this._started
  }

  /**
   * 是否暂停
   */
  isPaused(): boolean {
    return this._paused
  }

  /**
   * 是否已停止
   */
  isStopped(): boolean {
    return this._stopped
  }

  /**
   * 获取已写入的字节数
   */
  getBytesWritten(): number {
    return this._bytesWritten
  }

  /**
   * 处理错误
   */
  private handleError(error: Error): void {
    this.events?.onError?.(error)
    this.emit('error', error)
  }
}

export default StreamPlayer
