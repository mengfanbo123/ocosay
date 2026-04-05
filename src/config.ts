/**
 * Configuration Management
 * 配置管理模块
 */

import { GlobalConfig, ProviderConfig, OcosayConfig } from './core/types'
import { TTSError, TTSErrorCode } from './core/types'
import fs from 'fs'
import path from 'path'

const DEFAULT_CONFIG: OcosayConfig = {
  enabled: true,
  autoPlay: false,
  autoRead: false,             // 豆包模式开关
  streamMode: true,            // 流式朗读模式
  streamBufferSize: 30,        // 缓冲字符数
  streamBufferTimeout: 2000,   // 缓冲区超时(ms)
  provider: 'minimax',
  ttsModel: 'speech-02-turbo',
  baseURL: 'https://api.minimax.io',
  speed: 1.0,
  volume: 80,
  pitch: 1.0
}

class ConfigManager {
  private config: OcosayConfig
  private configPath: string
  private providers: Record<string, ProviderConfig> = {}

  constructor(configPath?: string) {
    this.configPath = configPath || './config.json'
    const loaded = this.loadConfig()
    this.config = loaded
    this.providers = (loaded as Record<string, unknown>).providers as Record<string, ProviderConfig> || {}
  }

  private loadConfig(): OcosayConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(content)
        this.providers = parsed.providers || {}
        const { providers, ...config } = parsed
        return { ...DEFAULT_CONFIG, ...config }
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults')
    }
    return { ...DEFAULT_CONFIG }
  }

  saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const configWithProviders = { ...this.config, providers: this.providers }
      fs.writeFileSync(this.configPath, JSON.stringify(configWithProviders, null, 2))
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  getGlobal(): OcosayConfig {
    return this.config
  }

  getProviderConfig(providerName: string): ProviderConfig | undefined {
    return this.providers[providerName]
  }

  setProviderConfig(providerName: string, config: ProviderConfig): void {
    this.providers[providerName] = { enabled: true, ...config }
    this.saveConfig()
  }

  getDefaultProvider(): string {
    return this.config.provider || 'minimax'
  }

  setDefaultProvider(provider: string): void {
    this.config.provider = provider
    this.saveConfig()
  }

  validateApiKey(provider: string, apiKey: string): void {
    if (!apiKey) {
      throw new TTSError(
        `API key is required for provider "${provider}"`,
        TTSErrorCode.AUTH,
        provider
      )
    }
  }

  validateStreamConfig(): void {
    if ((this.config.streamBufferSize ?? 30) < 5) {
      throw new TTSError(
        'streamBufferSize must be at least 5',
        TTSErrorCode.INVALID_PARAMS,
        'config'
      )
    }
    if ((this.config.streamBufferTimeout ?? 2000) < 500) {
      throw new TTSError(
        'streamBufferTimeout must be at least 500ms',
        TTSErrorCode.INVALID_PARAMS,
        'config'
      )
    }
  }
}

// 单例导出
export const configManager = new ConfigManager()

export { ConfigManager, DEFAULT_CONFIG }
export type { OcosayConfig, GlobalConfig, ProviderConfig }
export default configManager
