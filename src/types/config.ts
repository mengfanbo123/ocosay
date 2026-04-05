/**
 * Ocosay Configuration Types
 * 配置文件类型定义
 */

export interface OcosayConfig {
  enabled: boolean
  autoPlay: boolean
  autoRead: boolean
  streamMode: boolean
  streamBufferSize: number
  streamBufferTimeout: number
  speed: number
  volume: number
  pitch: number
  providers: {
    minimax: {
      apiKey: string
      baseURL: string
      voiceId: string
      model: 'sync' | 'async' | 'stream'
      ttsModel: string
      audioFormat: 'mp3' | 'wav' | 'flac'
    }
  }
}

export const DEFAULT_CONFIG: Omit<OcosayConfig, 'providers'> = {
  enabled: true,
  autoPlay: false,
  autoRead: false,
  streamMode: true,
  streamBufferSize: 30,
  streamBufferTimeout: 2000,
  speed: 1.0,
  volume: 80,
  pitch: 1.0
}
