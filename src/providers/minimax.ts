/**
 * MiniMax TTS Provider
 * 支持 T2A v2 (同步/流式HTTP)、T2A Async v2 (异步HTTP轮询)
 * 端点可配置: baseURL (默认 https://api.minimaxi.com)
 */

import { BaseTTSProvider } from './base'
import {
  TTSError,
  TTSErrorCode,
  AudioResult,
  Voice,
  SpeakOptions
} from '../core/types'
import axios, { AxiosInstance } from 'axios'
import { WebSocket } from 'ws'

export interface MiniMaxConfig {
  apiKey: string
  baseURL?: string
  voiceId?: string
  model?: 'sync' | 'async' | 'stream'
  ttsModel?: string
  audioFormat?: 'mp3' | 'wav' | 'flac'
  speed?: number
  volume?: number
  pitch?: number
  groupId?: string
}

/**
 * MiniMax TTS Provider
 * 官网: https://www.minimax.io/
 * API文档: https://www.minimaxi.com/document/T2A
 */
export class MiniMaxProvider extends BaseTTSProvider {
  name = 'minimax'
  capabilities = {
    speak: true,
    stream: true,
    sync: true,
    async: true,
    voiceList: true,
    voiceClone: true
  } as const

  private config: MiniMaxConfig
  private httpClient: AxiosInstance
  private wsConnection?: WebSocket
  private audioFormat: 'mp3' | 'wav' | 'flac' = 'mp3'

  constructor(config: MiniMaxConfig) {
    super()
    this.config = config
    this.apiKey = config.apiKey
    this.defaultVoice = config.voiceId
    this.defaultModel = config.model || 'stream'
    this.audioFormat = config.audioFormat || 'mp3'

    this.httpClient = axios.create({
      baseURL: this.config.baseURL || 'https://api.minimaxi.com',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    })
  }

  async initialize(): Promise<void> {
    this.validateApiKey()
  }

  async destroy(): Promise<void> {
    if (this.wsConnection) {
      this.wsConnection.close()
      this.wsConnection = undefined
    }
  }

  protected async doSpeak(
    text: string,
    voice: string | undefined,
    model: 'sync' | 'async' | 'stream',
    options?: SpeakOptions
  ): Promise<AudioResult> {
    this.validateApiKey()

    switch (model) {
      case 'stream':
        return this.streamingSpeak(text, voice, options)
      case 'sync':
        return this.syncSpeak(text, voice, options)
      case 'async':
        return this.asyncSpeak(text, voice, options)
      default:
        return this.streamingSpeak(text, voice, options)
    }
  }

  /**
   * 流式合成 (HTTP) - T2A v2 with stream: true
   */
  private async streamingSpeak(
    text: string,
    voice: string | undefined,
    options?: SpeakOptions
  ): Promise<AudioResult> {
    try {
      const voiceId = voice || this.defaultVoice || 'male-qn-qingse'
      const speed = options?.speed || this.config.speed || 1.0
      const vol = options?.volume !== undefined ? options.volume / 10 : (this.config.volume !== undefined ? this.config.volume / 10 : 1.0)
      const pitch = options?.pitch !== undefined ? Math.round((options.pitch - 1) * 12) : (this.config.pitch !== undefined ? Math.round((this.config.pitch - 1) * 12) : 0)

      const response = await this.httpClient.post('/v1/t2a_v2', {
        model: this.config.ttsModel || 'speech-2.8-hd',
        text,
        stream: true,
        voice_setting: {
          voice_id: voiceId,
          speed: speed,
          vol: vol,
          pitch: pitch
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: this.audioFormat,
          channel: 1
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      })

      const stream = response.data
      const audioChunks: Buffer[] = []
      let lineBuffer = ''

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          lineBuffer += chunk.toString()
          
          while (true) {
            const lineEnd = lineBuffer.indexOf('\n')
            if (lineEnd === -1) break
            const line = lineBuffer.slice(0, lineEnd).trim()
            lineBuffer = lineBuffer.slice(lineEnd + 1)
            
            if (!line || !line.startsWith('data:')) continue
            
            const jsonStr = line.slice(5).trim()
            if (!jsonStr) continue
            
            try {
              const data = JSON.parse(jsonStr)
              if (data.audio) {
                audioChunks.push(Buffer.from(data.audio, 'hex'))
              }
              if (data.is_final === true) {
                const fullAudio = Buffer.concat(audioChunks)
                resolve({
                  audioData: fullAudio,
                  format: this.audioFormat,
                  isStream: true,
                  duration: this.estimateDuration(fullAudio.length)
                })
              }
            } catch (e) {
              // ignore
            }
          }
        })

        stream.on('error', (err: any) => {
          reject(new TTSError(
            'Stream error',
            TTSErrorCode.NETWORK,
            this.name,
            err
          ))
        })

        stream.on('end', () => {
          if (lineBuffer.trim() && lineBuffer.startsWith('data:')) {
            const jsonStr = lineBuffer.slice(5).trim()
            if (jsonStr) {
              try {
                const data = JSON.parse(jsonStr)
                if (data.audio) {
                  audioChunks.push(Buffer.from(data.audio, 'hex'))
                }
              } catch (e) {
                // ignore
              }
            }
          }
          
          if (audioChunks.length > 0) {
            const fullAudio = Buffer.concat(audioChunks)
            resolve({
              audioData: fullAudio,
              format: this.audioFormat,
              isStream: true,
              duration: this.estimateDuration(fullAudio.length)
            })
          }
        })
      })
    } catch (error: any) {
      if (error instanceof TTSError) throw error
      throw this.mapError(error)
    }
  }

  /**
   * 同步合成 (HTTP) - T2A v2
   * API: POST https://api.minimax.io/v1/t2a_v2
   */
  private async syncSpeak(
    text: string,
    voice: string | undefined,
    options?: SpeakOptions
  ): Promise<AudioResult> {
    try {
      const voiceId = voice || this.defaultVoice || 'male-qn-qingse'
      const speed = options?.speed || this.config.speed || 1.0
      const vol = options?.volume !== undefined ? options.volume / 10 : (this.config.volume !== undefined ? this.config.volume / 10 : 1.0)
      const pitch = options?.pitch !== undefined ? Math.round((options.pitch - 1) * 12) : (this.config.pitch !== undefined ? Math.round((this.config.pitch - 1) * 12) : 0)

      const response = await this.httpClient.post('/v1/t2a_v2', {
        model: this.config.ttsModel || 'speech-2.8-hd',
        text,
        stream: false,
        output_format: 'hex',
        voice_setting: {
          voice_id: voiceId,
          speed: speed,
          vol: vol,
          pitch: pitch
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: this.audioFormat,
          channel: 1
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.data.base_resp?.status_code !== 0) {
        throw new TTSError(
          response.data.base_resp?.status_msg || 'API request failed',
          TTSErrorCode.UNKNOWN,
          this.name,
          response.data.base_resp
        )
      }

      const audioHex = response.data.data?.audio
      if (!audioHex) {
        throw new TTSError(
          'No audio data in response',
          TTSErrorCode.UNKNOWN,
          this.name
        )
      }

      const audioBuffer = Buffer.from(audioHex, 'hex')

      return {
        audioData: audioBuffer,
        format: this.audioFormat,
        isStream: false,
        duration: response.data.extra_info?.audio_length 
          ? response.data.extra_info.audio_length / 1000 
          : this.estimateDuration(audioBuffer.length)
      }
    } catch (error: any) {
      if (error instanceof TTSError) throw error
      throw this.mapError(error)
    }
  }

  /**
   * 异步合成 (轮询) - T2A Async v2
   */
  private async asyncSpeak(
    text: string,
    voice: string | undefined,
    options?: SpeakOptions
  ): Promise<AudioResult> {
    try {
      const voiceId = voice || this.defaultVoice || 'male-qn-qingse'
      const speed = options?.speed || this.config.speed || 1.0
      const vol = options?.volume !== undefined ? options.volume / 10 : (this.config.volume !== undefined ? this.config.volume / 10 : 1.0)
      const pitch = options?.pitch !== undefined ? Math.round((options.pitch - 1) * 12) : (this.config.pitch !== undefined ? Math.round((this.config.pitch - 1) * 12) : 0)

      const createResponse = await this.httpClient.post('/v1/t2a_async_v2', {
        model: this.config.ttsModel || 'speech-2.8-hd',
        text,
        voice_setting: {
          voice_id: voiceId,
          speed: speed,
          vol: vol,
          pitch: pitch
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: this.audioFormat,
          channel: 1
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      const taskId = createResponse.data.task_id
      if (!taskId) {
        throw new TTSError(
          'No task_id in async response',
          TTSErrorCode.UNKNOWN,
          this.name,
          createResponse.data
        )
      }

      let attempts = 0
      const maxAttempts = 60

      while (attempts < maxAttempts) {
        await this.delay(2000)

        const statusResponse = await this.httpClient.get(
          `/v1/query/t2a_async_query_v2?task_id=${taskId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`
            }
          }
        )

        if (statusResponse.data.status === 'success') {
          const fileId = statusResponse.data.file_id
          if (!fileId) {
            throw new TTSError(
              'No file_id in async response',
              TTSErrorCode.UNKNOWN,
              this.name,
              statusResponse.data
            )
          }

          const downloadResponse = await this.httpClient.get(
            `/v1/files/retrieve_content?file_id=${fileId}`,
            { 
              headers: {
                'Authorization': `Bearer ${this.apiKey}`
              },
              responseType: 'arraybuffer'
            }
          )

          return {
            audioData: Buffer.from(downloadResponse.data),
            format: this.audioFormat,
            isStream: false,
            duration: 0
          }
        }

        if (statusResponse.data.status === 'failed') {
          throw new TTSError(
            'Async TTS task failed',
            TTSErrorCode.UNKNOWN,
            this.name,
            statusResponse.data
          )
        }

        attempts++
      }

      throw new TTSError(
        'Async TTS task timeout',
        TTSErrorCode.NETWORK,
        this.name
      )
    } catch (error: any) {
      if (error instanceof TTSError) throw error
      throw this.mapError(error)
    }
  }

  /**
   * 音色克隆 - 使用参考音频克隆声音
   */
  async voiceClone(audioUrl: string, text: string, voice?: string): Promise<AudioResult> {
    this.validateApiKey()

    try {
      const response = await this.httpClient.post('/v1/t2a_v2/voice_clone', {
        audio_url: audioUrl,
        text,
        voice_id: voice || 'custom_clone'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      })

      return {
        audioData: Buffer.from(response.data),
        format: this.audioFormat,
        isStream: false,
        duration: this.estimateDuration(response.data.length)
      }
    } catch (error: any) {
      throw this.mapError(error)
    }
  }

  /**
   * 获取音色列表
   */
  async listVoices(): Promise<Voice[]> {
    this.validateApiKey()

    try {
      const response = await this.httpClient.get('/v1/t2a/voices', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      })

      return response.data.voices.map((v: any) => ({
        id: v.voice_id,
        name: v.name,
        language: v.language,
        gender: v.gender
      }))
    } catch (error: any) {
      // 如果API调用失败，返回预定义音色列表
      return MINIMAX_VOICES
    }
  }

  /**
   * 错误映射
   */
  private mapError(error: any): TTSError {
    if (error.response) {
      const status = error.response.status
      const code =
        status === 401 ? TTSErrorCode.AUTH :
        status === 429 ? TTSErrorCode.QUOTA :
        status >= 500 ? TTSErrorCode.NETWORK :
        TTSErrorCode.UNKNOWN

      return new TTSError(
        error.response.data?.message || 'API request failed',
        code,
        this.name,
        error.response.data
      )
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new TTSError(
        'Network error: Unable to connect to MiniMax API',
        TTSErrorCode.NETWORK,
        this.name,
        error.message
      )
    }

    return new TTSError(
      error.message || 'Unknown error',
      TTSErrorCode.UNKNOWN,
      this.name,
      error
    )
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 估算音频时长
   * 基于 32kbps MP3 估算
   */
  private estimateDuration(bytes: number): number {
    return (bytes * 8) / (32000 * 60)
  }
}

/**
 * MiniMax 预定义音色列表
 * 官方音色ID参考
 */
export const MINIMAX_VOICES: Voice[] = [
  { id: 'male-qn-qingse', name: '青年清澈', language: 'zh-CN', gender: 'male' },
  { id: 'male-qn-qingse_2', name: '青年清澈v2', language: 'zh-CN', gender: 'male' },
  { id: 'female-shaonv', name: '少女', language: 'zh-CN', gender: 'female' },
  { id: 'male-baiming', name: '成熟男声', language: 'zh-CN', gender: 'male' },
  { id: 'female-tianmei', name: '甜美女声', language: 'zh-CN', gender: 'female' },
  { id: 'male-zhongnan', name: '中年男声', language: 'zh-CN', gender: 'male' },
  { id: 'female-yujie', name: '御姐音', language: 'zh-CN', gender: 'female' },
  { id: 'male-qn-xiaoao', name: '青年豪爽', language: 'zh-CN', gender: 'male' },
  { id: 'female-shandian', name: '甜心小娘', language: 'zh-CN', gender: 'female' },
  { id: 'male-qn-buke', name: '青年低沉', language: 'zh-CN', gender: 'male' },
  { id: 'male-qn-wenlv', name: '文绿青年', language: 'zh-CN', gender: 'male' },
  { id: 'female-tianmei-2', name: '甜美女声v2', language: 'zh-CN', gender: 'female' },
  { id: 'female-yujie-2', name: '御姐音v2', language: 'zh-CN', gender: 'female' },
  { id: 'male-shaonian', name: '少年音', language: 'zh-CN', gender: 'male' },
  { id: 'female-yunv', name: '温柔女声', language: 'zh-CN', gender: 'female' },
  { id: 'male-qn-jingdian', name: '经典男声', language: 'zh-CN', gender: 'male' },
  { id: 'male-qn-kuang野', name: '狂野青年', language: 'zh-CN', gender: 'male' },
  { id: 'female-yujie-old', name: '优雅低沉', language: 'zh-CN', gender: 'female' },
  { id: 'female-tianmei-old', name: '甜美女孩', language: 'zh-CN', gender: 'female' },
  { id: 'male-qn-taohua', name: '桃花青年', language: 'zh-CN', gender: 'male' }
]
