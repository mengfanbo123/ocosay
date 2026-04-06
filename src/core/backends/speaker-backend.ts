/**
 * Speaker Backend - Linux/macOS 音频播放后端
 * 使用 speaker npm 包直接输出 PCM 到 ALSA/PulseAudio
 * 支持流式播放，但需要完整的音频头信息
 */

import Speaker from 'speaker'
import { AudioBackend, AudioBackendEvents, BackendOptions } from './base'

// speaker 包没有类型定义，使用 any
type SpeakerInstance = any

/**
 * SpeakerBackend - 使用 speaker 包的后端
 * speaker 直接将 PCM 数据输出到系统音频设备
 * 支持流式播放，但需要正确的音频格式参数
 */
export class SpeakerBackend implements AudioBackend {
  readonly name = 'speaker'
  readonly supportsStreaming = true
  
  private speaker?: SpeakerInstance
  private events?: AudioBackendEvents
  private _started = false
  private _paused = false
  private _stopped = false
  private _format = {
    channels: 1,
    sampleRate: 16000,
    bitDepth: 16,
    signed: true,
    float: false
  }
  
  constructor(options: BackendOptions = {}) {
    this.events = options.events
    
    if (options.sampleRate) {
      this._format.sampleRate = options.sampleRate
    }
    if (options.channels) {
      this._format.channels = options.channels
    }
    if (options.format === 'wav') {
      this._format.bitDepth = 16
    }
  }
  
  start(_filePath: string): void {
    if (this._started) return
    
    this._started = true
    this._stopped = false
    this._paused = false
    
    this.events?.onStart?.()
  }
  
  write(chunk: Buffer): void {
    if (this._stopped || this._paused) return
    
    if (!this._started) {
      this.start('')
    }
    
    try {
      if (!this.speaker) {
        this.createSpeaker()
      }
      
      if (this.speaker) {
        // 检查是否是 WAV 文件头
        if (this.isWavHeader(chunk)) {
          // 跳过 WAV 头，只播放数据
          const audioData = this.stripWavHeader(chunk)
          if (audioData.length > 0) {
            this.speaker.write(audioData)
          }
        } else {
          this.speaker.write(chunk)
        }
      }
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)))
    }
  }
  
  private isWavHeader(chunk: Buffer): boolean {
    // 检查 RIFF 头
    if (chunk.length >= 44) {
      const riff = chunk.toString('ascii', 0, 4)
      const wave = chunk.toString('ascii', 8, 12)
      return riff === 'RIFF' && wave === 'WAVE'
    }
    return false
  }
  
  private stripWavHeader(chunk: Buffer): Buffer {
    // 跳过 44 字节的 WAV 头
    return chunk.slice(44)
  }
  
  private createSpeaker(): void {
    try {
      const format = {
        channels: this._format.channels,
        sampleRate: this._format.sampleRate,
        bitDepth: this._format.bitDepth,
        signed: this._format.signed,
        float: this._format.float
      }
      
      this.speaker = new Speaker(format) as unknown as SpeakerInstance
      
      this.speaker.on('close', () => {
        if (!this._stopped) {
          this._started = false
          this.events?.onEnd?.()
        }
      })
      
      this.speaker.on('error', (err: Error) => {
        this.handleError(err)
      })
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)))
    }
  }
  
  end(): void {
    if (this._stopped) return
    
    if (this.speaker) {
      try {
        this.speaker.close()
      } catch (e) {
        // 忽略关闭错误
      }
      this.speaker = undefined
    }
    
    this._started = false
    this._stopped = true
    this.events?.onEnd?.()
  }
  
  pause(): void {
    if (this._started && !this._paused) {
      this._paused = true
      this.events?.onPause?.()
    }
  }
  
  resume(): void {
    // speaker 不支持暂停恢复
    if (this._paused) {
      this._paused = false
      this.events?.onResume?.()
    }
  }
  
  stop(): void {
    this._stopped = true
    this._started = false
    this._paused = false
    
    if (this.speaker) {
      try {
        this.speaker.close()
      } catch (e) {
        // 忽略关闭错误
      }
      this.speaker = undefined
    }
    
    this.events?.onStop?.()
  }
  
  destroy(): void {
    this.stop()
  }
  
  private handleError(error: Error): void {
    this.events?.onError?.(error)
  }
}
