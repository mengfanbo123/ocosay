/**
 * Howler.js Backend - 基于 howler.js 的跨平台音频播放后端
 * 支持流式播放（边收边播）
 */

import { Howl } from 'howler'
import { AudioBackend, AudioBackendEvents, BackendOptions } from './base'

export class HowlerBackend implements AudioBackend {
  readonly name = 'howler'
  readonly supportsStreaming = true  // 支持流式播放

  private howl: Howl | null = null
  private events?: AudioBackendEvents
  private _started = false
  private _paused = false
  private _stopped = false
  private volume = 1.0
  private bytesWritten = 0
  private blobUrl: string | null = null
  private format: 'mp3' | 'wav' | 'flac'

  constructor(options: BackendOptions = {}) {
    this.events = options.events
    this.volume = options.volume ?? 1.0
    this.format = options.format || 'mp3'
  }

  start(_filePath: string): void {
    if (this._started) {
      this.stop()
    }

    this._started = true
    this._stopped = false
    this._paused = false
    this.bytesWritten = 0

    // 创建空的 Howl 对象，稍后通过流式数据填充
    this.howl = new Howl({
      src: [''],  // 初始为空
      html5: true,  // 启用 HTML5 Audio 模式支持流式
      volume: this.volume,
      format: [this.format],
      onplay: () => {
        this.events?.onStart?.()
      },
      onpause: () => {
        if (!this._stopped) {
          this.events?.onPause?.()
        }
      },
      onstop: () => {
        if (!this._stopped) {
          this.events?.onStop?.()
        }
      },
      onend: () => {
        this.events?.onEnd?.()
      },
      onloaderror: (_id, error) => {
        this.handleError(new Error(`Howler load error: ${error}`))
      },
      onplayerror: (_id, error) => {
        this.handleError(new Error(`Howler play error: ${error}`))
      }
    })
  }

  write(chunk: Buffer): void {
    if (!this._started || this._stopped) return

    if (!this.howl) return

    this.bytesWritten += chunk.length
    this.events?.onProgress?.(this.bytesWritten)

    // Howler 不支持直接 Buffer 流式写入
    // 对于流式播放，我们创建 Blob URL 并重新加载
    const blob = new Blob([chunk], { type: `audio/${this.format}` })
    
    // 清理旧的 blob URL
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl)
    }
    this.blobUrl = URL.createObjectURL(blob)

    // 停止当前播放并重新加载
    const wasPlaying = this.howl.playing()
    this.howl.stop()
    this.howl.unload()

    // 创建新的 Howl 实例
    this.howl = new Howl({
      src: [this.blobUrl],
      html5: true,
      volume: this.volume,
      format: [this.format],
      onplay: () => {
        if (!wasPlaying) {
          this.events?.onStart?.()
        }
      },
      onpause: () => {
        if (!this._stopped) {
          this.events?.onPause?.()
        }
      },
      onstop: () => {
        if (!this._stopped) {
          this.events?.onStop?.()
        }
      },
      onend: () => {
        this.events?.onEnd?.()
      },
      onloaderror: (_id, error) => {
        this.handleError(new Error(`Howler load error: ${error}`))
      },
      onplayerror: (_id, error) => {
        this.handleError(new Error(`Howler play error: ${error}`))
      }
    })

    // 如果之前在播放或者需要自动播放
    if (wasPlaying || this._started) {
      this.howl.play()
    }
  }

  end(): void {
    // 流式写入结束，不停止播放，让其播完
  }

  pause(): void {
    if (!this._started || this._paused || this._stopped) return

    if (this.howl && this.howl.playing()) {
      this.howl.pause()
      this._paused = true
      this.events?.onPause?.()
    }
  }

  resume(): void {
    if (!this._paused || this._stopped) return

    if (this.howl) {
      this.howl.play()
      this._paused = false
      this.events?.onResume?.()
    }
  }

  stop(): void {
    this._stopped = true
    this._started = false
    this._paused = false

    if (this.howl) {
      try {
        this.howl.stop()
        this.howl.unload()
      } catch (e) {
        // 忽略停止错误
      }
      this.howl = null
    }

    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl)
      this.blobUrl = null
    }

    this.bytesWritten = 0
    this.events?.onStop?.()
  }

  getCurrentTime(): number | undefined {
    if (this.howl) {
      return this.howl.seek() as number
    }
    return undefined
  }

  getDuration(): number | undefined {
    if (this.howl) {
      return this.howl.duration()
    }
    return undefined
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.howl) {
      this.howl.volume(this.volume)
    }
  }

  destroy(): void {
    this.stop()
  }

  private handleError(error: Error): void {
    this.events?.onError?.(error)
  }
}
