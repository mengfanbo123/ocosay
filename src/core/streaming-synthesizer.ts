/**
 * StreamingSynthesizer - 流式合成器
 * 
 * 功能：
 * - 接收 StreamReader 发来的文本（通过 synthesize 方法）
 * - 调用 TTSProvider 的流式合成接口
 * - 将返回的音频 chunk 传递给下游（StreamPlayer）
 * 
 * 数据流：
 * StreamReader.textReady → StreamingSynthesizer.synthesize() → StreamPlayer (边收边播)
 */

import { EventEmitter } from 'events'
import { TTSError, TTSErrorCode, StreamingSynthesizerOptions, AudioResult } from './types'
import { logger } from '../utils/logger'

export interface StreamingSynthesizerEvents {
  on(event: 'chunk', handler: (chunk: Buffer) => void): void
  on(event: 'error', handler: (error: TTSError) => void): void
  on(event: 'done', handler: () => void): void
}

export class StreamingSynthesizer extends EventEmitter {
  private audioChunks: Buffer[] = []
  
  constructor(private options: StreamingSynthesizerOptions) {
    super()
  }
  
  /**
   * 发送文本片段进行合成
   * 调用 provider.speak() 并处理返回的音频流
   */
  async synthesize(text: string): Promise<void> {
    if (!text || text.trim().length === 0) {
      return
    }
    
    try {
      const result = await this.options.provider.speak(text, {
        model: 'stream',
        voice: this.options.voice,
        speed: this.options.speed,
        volume: this.options.volume,
        pitch: this.options.pitch
      })
      
      await this.processAudioResult(result)
      
      this.emit('done')
    } catch (error) {
      logger.error({ error }, 'synthesize failed')
      const ttsError = error instanceof TTSError 
        ? error 
        : new TTSError(
            error instanceof Error ? error.message : 'Synthesis failed',
            'UNKNOWN' as TTSErrorCode,
            this.options.provider.name,
            error
          )
      this.emit('error', ttsError)
    }
  }
  
  /**
   * 处理 AudioResult，根据 audioData 类型进行相应处理
   */
  private async processAudioResult(result: AudioResult): Promise<void> {
    if (result.isStream && result.audioData instanceof ReadableStream) {
      // 流式数据：ReadableStream
      await this.processReadableStream(result.audioData)
    } else if (Buffer.isBuffer(result.audioData)) {
      // 非流式数据：Buffer
      this.emitChunk(result.audioData)
    }
  }
  
  /**
   * 处理 ReadableStream，逐chunk emit
   */
  private async processReadableStream(stream: ReadableStream): Promise<void> {
    const reader = stream.getReader()
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          break
        }
        
        if (value) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
          this.emitChunk(chunk)
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
  
  /**
   * emit chunk 并累积
   */
  private emitChunk(chunk: Buffer): void {
    this.audioChunks.push(chunk)
    this.emit('chunk', chunk)
  }
  
  /**
   * 重置状态
   * 清空累积的音频数据
   */
  reset(): void {
    this.audioChunks = []
  }
  
  /**
   * 获取累积的音频数据
   * 返回所有已接收的 chunk
   */
  getAudioChunks(): Buffer[] {
    return [...this.audioChunks]
  }
}
