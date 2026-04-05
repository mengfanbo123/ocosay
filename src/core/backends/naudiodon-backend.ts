/**
 * Naudiodon Backend - 基于 PortAudio 的跨平台音频播放后端
 * 支持真正的流式播放（边收边播）
 */

import { AudioBackend, AudioBackendEvents, BackendOptions } from './base'

class UnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedError'
  }
}

interface NaudiodonAudioOutput {
  start(): void
  write(chunk: Buffer): void
  end(): void
  quit(): void
  on(event: string, callback: (error: Error) => void): void
}

interface Naudiodon {
  new (options: {
    sampleRate?: number
    channels?: number
    bitDepth?: number
  }): NaudiodonAudioOutput
}

declare global {
  interface NodeModule {
    require(id: 'naudiodon'): Naudiodon
  }
}

export class NaudiodonBackend implements AudioBackend {
  readonly name = 'naudiodon'
  readonly supportsStreaming = true
  
  private audioOutput?: NaudiodonAudioOutput
  private events?: AudioBackendEvents
  private _started = false
  private _paused = false
  private _stopped = false
  private sampleRate: number
  private channels: number
  private volume = 1.0
  private bytesWritten = 0
  
  constructor(options: BackendOptions = {}) {
    this.sampleRate = options.sampleRate || 16000
    this.channels = options.channels || 1
    this.events = options.events
    this.volume = options.volume ?? 1.0
  }
  
  start(_filePath: string): void {
    if (this._started) return
    
    try {
      const naudiodon = require('naudiodon') as Naudiodon
      const AudioOutput = naudiodon as unknown as { new(options: { sampleRate: number; channels: number; bitDepth: number }): NaudiodonAudioOutput }
      
      this.audioOutput = new AudioOutput({
        sampleRate: this.sampleRate,
        channels: this.channels,
        bitDepth: 16
      })
      
      this.audioOutput.on('error', (error: Error) => {
        this.handleError(error)
      })
      
      this.audioOutput.start()
      this._started = true
      this._stopped = false
      
      this.events?.onStart?.()
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('naudiodon is not installed. Run: npm install naudiodon')
      }
      throw error
    }
  }
  
  write(chunk: Buffer): void {
    if (!this._started || this._stopped) return
    
    if (this.audioOutput) {
      const adjustedChunk = this.adjustVolume(chunk)
      this.audioOutput.write(adjustedChunk)
      this.bytesWritten += chunk.length
      this.events?.onProgress?.(this.bytesWritten)
    }
  }
  
  end(): void {
    if (this.audioOutput) {
      this.audioOutput.end()
    }
  }
  
  pause(): void {
    if (!this._started || this._paused || this._stopped) return
    throw new UnsupportedError('naudiodon backend does not support pause')
  }
  
  resume(): void {
    if (!this._paused || this._stopped) return
    this._paused = false
    this.events?.onResume?.()
  }
  
  stop(): void {
    this._stopped = true
    this._started = false
    this._paused = false
    
    if (this.audioOutput) {
      try {
        this.audioOutput.quit()
      } catch (e) {
        // 忽略退出错误
      }
      this.audioOutput = undefined
    }
    
    this.bytesWritten = 0
    this.events?.onStop?.()
  }
  
  getCurrentTime(): number {
    return this.bytesWritten / (this.sampleRate * this.channels * 2)
  }
  
  getDuration?(): number | undefined {
    return undefined
  }
  
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
  }
  
  destroy(): void {
    this.stop()
  }
  
  private adjustVolume(chunk: Buffer): Buffer {
    if (this.volume === 1.0) return chunk
    
    const adjusted = Buffer.alloc(chunk.length)
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = chunk.readInt16LE(i) * this.volume
      adjusted.writeInt16LE(Math.round(sample), i)
    }
    return adjusted
  }
  
  private handleError(error: Error): void {
    this.events?.onError?.(error)
  }
}
