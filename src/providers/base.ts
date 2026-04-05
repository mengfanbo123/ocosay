/**
 * TTS Provider Base Class and Registry
 * Provider 基类和注册机制
 */

import { TTSProvider, TTSError, TTSErrorCode, Voice, TTSCapabilities, SpeakOptions, AudioResult } from '../core/types'

// Provider 注册表
const providers = new Map<string, TTSProvider>()

/**
 * 注册 TTS Provider
 */
export function registerProvider(name: string, provider: TTSProvider): void {
  if (providers.has(name)) {
    throw new TTSError(
      `Provider "${name}" is already registered`,
      TTSErrorCode.UNKNOWN,
      'system'
    )
  }
  providers.set(name, provider)
}

/**
 * 获取 TTS Provider
 */
export function getProvider(name: string): TTSProvider {
  const provider = providers.get(name)
  if (!provider) {
    throw new TTSError(
      `TTS Provider "${name}" not found`,
      TTSErrorCode.UNKNOWN,
      'system'
    )
  }
  return provider
}

/**
 * 获取所有已注册的 Provider 名称
 */
export function listProviders(): string[] {
  return Array.from(providers.keys())
}

/**
 * 检查 Provider 是否已注册
 */
export function hasProvider(name: string): boolean {
  return providers.has(name)
}

/**
 * 注销 Provider
 */
export function unregisterProvider(name: string): boolean {
  return providers.delete(name)
}

/**
 * Provider 抽象基类，提供通用实现
 */
export abstract class BaseTTSProvider implements TTSProvider {
  abstract name: string
  abstract capabilities: TTSCapabilities
  
  protected apiKey?: string
  protected defaultVoice?: string
  protected defaultModel: 'sync' | 'async' | 'stream' = 'stream'
  
  async initialize(): Promise<void> {
    // 子类可override
  }
  
  async destroy(): Promise<void> {
    // 子类可override
  }
  
  /**
   * 通用 speak 实现，处理通用逻辑
   */
  async speak(text: string, options?: SpeakOptions): Promise<AudioResult> {
    if (!text || text.trim().length === 0) {
      throw new TTSError(
        'Text cannot be empty',
        TTSErrorCode.INVALID_PARAMS,
        this.name
      )
    }
    
    const voice = options?.voice || this.defaultVoice
    const model = options?.model || this.defaultModel
    
    return this.doSpeak(text, voice, model, options)
  }
  
  /**
   * 子类实现的实际 speak 逻辑
   */
  protected abstract doSpeak(
    text: string, 
    voice: string | undefined, 
    model: 'sync' | 'async' | 'stream',
    options?: SpeakOptions
  ): Promise<AudioResult>
  
  pause(): Promise<void> {
    throw new TTSError(
      'Pause is not supported by this provider',
      TTSErrorCode.UNKNOWN,
      this.name
    )
  }
  
  resume(): Promise<void> {
    throw new TTSError(
      'Resume is not supported by this provider',
      TTSErrorCode.UNKNOWN,
      this.name
    )
  }
  
  stop(): Promise<void> {
    // 默认空实现
    return Promise.resolve()
  }
  
  async listVoices(): Promise<Voice[]> {
    // 默认返回空数组，子类可override
    return []
  }
  
  getCapabilities(): TTSCapabilities {
    return this.capabilities
  }
  
  /**
   * 验证 API Key
   */
  protected validateApiKey(): void {
    if (!this.apiKey) {
      throw new TTSError(
        `API key is required for provider "${this.name}"`,
        TTSErrorCode.AUTH,
        this.name
      )
    }
  }
}
