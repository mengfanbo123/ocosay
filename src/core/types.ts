/**
 * TTS Core Types
 * 核心类型定义
 */

export enum TTSErrorCode {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  QUOTA = 'QUOTA',
  INVALID_VOICE = 'INVALID_VOICE',
  INVALID_PARAMS = 'INVALID_PARAMS',
  PLAYER_ERROR = 'PLAYER_ERROR',
  UNKNOWN = 'UNKNOWN'
}

export class TTSError extends Error {
  constructor(
    message: string,
    code: TTSErrorCode,
    provider: string,
    details?: unknown
  ) {
    super(message)
    this.name = 'TTSError'
    this.code = code
    this.provider = provider
    this.details = details
  }
  
  code: TTSErrorCode
  provider: string
  details?: unknown
}

export interface Voice {
  id: string
  name: string
  language?: string
  gender?: 'male' | 'female' | 'neutral'
  previewUrl?: string
}

export interface TTSCapabilities {
  speak: true
  voiceClone?: boolean
  stream?: boolean
  voiceList?: boolean
  sync?: boolean
  async?: boolean
}

export type SynthesisModel = 'sync' | 'async' | 'stream'

export interface SpeakOptions {
  voice?: string
  model?: SynthesisModel
  speed?: number
  volume?: number
  pitch?: number
  sourceVoice?: string
}

export interface AudioResult {
  audioData: Buffer | ReadableStream
  sampleRate?: number
  channels?: number
  duration?: number
  format: string
  isStream: boolean
}

export type TTSEvent = 
  | 'start'
  | 'end'
  | 'error'
  | 'progress'
  | 'pause'
  | 'resume'
  | 'stop'

export interface SpeakerEvents {
  on(event: 'start', handler: (text: string) => void): void
  on(event: 'end', handler: (text: string) => void): void
  on(event: 'error', handler: (error: TTSError) => void): void
  on(event: 'progress', handler: (progress: { current: number; total: number }) => void): void
  on(event: 'pause', handler: () => void): void
  on(event: 'resume', handler: () => void): void
  on(event: 'stop', handler: () => void): void
  off(event: TTSEvent, handler: Function): void
}

export interface TTSProvider {
  name: string
  capabilities: TTSCapabilities
  
  initialize(): Promise<void>
  destroy(): Promise<void>
  
  speak(text: string, options?: SpeakOptions): Promise<AudioResult>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  listVoices(): Promise<Voice[]>
  
  getCapabilities(): TTSCapabilities
}

// ============================================================================
// 配置相关类型
// ============================================================================

export interface GlobalConfig {
  defaultProvider: string
  defaultModel?: SynthesisModel
  defaultVoice?: string
}

export interface ProviderConfig {
  enabled?: boolean
  apiKey?: string
  [key: string]: unknown
}

export interface OcosayConfig {
  enabled?: boolean
  autoPlay?: boolean
  autoRead?: boolean
  streamMode?: boolean
  streamBufferSize?: number
  streamBufferTimeout?: number
  provider?: string
  ttsModel?: string
  baseURL?: string
  speed?: number
  volume?: number
  pitch?: number
}

// ============================================================================
// 流式朗读相关类型
// ============================================================================

export enum StreamState {
  IDLE = 'idle',
  BUFFERING = 'buffering',
  STREAMING = 'streaming',
  ENDED = 'ended'
}

export interface OcosayStreamConfig {
  enabled: boolean
  autoPlay: boolean
  autoRead: boolean
  streamMode: boolean
  streamBufferSize: number
  streamBufferTimeout: number
  provider: string
  voiceId?: string
  ttsModel?: string
  baseURL?: string
  speed?: number
  volume?: number
  pitch?: number
  apiKey?: string
}

export interface StreamReaderEvents {
  onTextReady: (text: string) => void
  onStreamStart: () => void
  onStreamEnd: () => void
  onStreamError: (error: TTSError) => void
}

export interface StreamingSynthesizerOptions {
  provider: TTSProvider
  voice?: string
  speed?: number
  volume?: number
  pitch?: number
}

export interface StreamPlayerOptions {
  format?: 'mp3' | 'wav' | 'flac'
  onProgress?: (bytesReceived: number) => void
}
