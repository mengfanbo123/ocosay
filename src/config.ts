import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// OcosayConfig 类型定义
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

// 默认配置
const DEFAULT_CONFIG: Omit<OcosayConfig, 'providers'> = {
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

const CONFIG_PATH = path.join(os.homedir(), '.config', 'opencode', 'ocosay.jsonc')

export function generateDefaultConfig(): OcosayConfig {
  return {
    ...DEFAULT_CONFIG,
    providers: {
      minimax: {
        apiKey: '',
        baseURL: '',
        voiceId: '',
        model: 'stream',
        ttsModel: 'speech-2.8-hd',
        audioFormat: 'mp3'
      }
    }
  }
}

export function stripComments(jsonc: string): string {
  let result = ''
  let inString = false
  let stringChar = ''
  let i = 0

  while (i < jsonc.length) {
    const char = jsonc[i]

    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true
      stringChar = char
      result += char
      i++
      continue
    }

    if (inString && char === stringChar && jsonc[i - 1] !== '\\') {
      inString = false
      result += char
      i++
      continue
    }

    if (inString) {
      result += char
      i++
      continue
    }

    if (char === '/' && jsonc[i + 1] === '/') {
      while (i < jsonc.length && jsonc[i] !== '\n') {
        i++
      }
      continue
    }

    if (char === '/' && jsonc[i + 1] === '*') {
      i += 2
      while (i < jsonc.length - 1 && !(jsonc[i] === '*' && jsonc[i + 1] === '/')) {
        i++
      }
      i += 2
      continue
    }

    result += char
    i++
  }

  return result
}

export function mergeWithDefaults(
  loaded: Partial<OcosayConfig>,
  defaults: Omit<OcosayConfig, 'providers'>
): Omit<OcosayConfig, 'providers'> {
  return {
    enabled: loaded.enabled ?? defaults.enabled,
    autoPlay: loaded.autoPlay ?? defaults.autoPlay,
    autoRead: loaded.autoRead ?? defaults.autoRead,
    streamMode: loaded.streamMode ?? defaults.streamMode,
    streamBufferSize: loaded.streamBufferSize ?? defaults.streamBufferSize,
    streamBufferTimeout: loaded.streamBufferTimeout ?? defaults.streamBufferTimeout,
    speed: loaded.speed ?? defaults.speed,
    volume: loaded.volume ?? defaults.volume,
    pitch: loaded.pitch ?? defaults.pitch
  }
}

export function loadOrCreateConfig(): OcosayConfig {
  const configDir = path.dirname(CONFIG_PATH)

  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true })
    } catch (err) {
      throw new Error(`[ocosay] 无法创建配置目录 ${configDir}: ${err}`)
    }
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    console.info('[ocosay] 配置文件不存在，正在创建默认配置...')
    const defaultConfig = generateDefaultConfig()
    const configContent = JSON.stringify(defaultConfig, null, 2)
    try {
      fs.writeFileSync(CONFIG_PATH, configContent, 'utf-8')
      try {
        fs.chmodSync(CONFIG_PATH, 0o600)
      } catch (err) {
        console.warn(`[ocosay] 无法设置配置文件权限: ${err}`)
      }
    } catch (err) {
      throw new Error(`[ocosay] 无法写入配置文件 ${CONFIG_PATH}: ${err}`)
    }
    console.info(`[ocosay] 配置文件已创建: ${CONFIG_PATH}`)
    console.info('[ocosay] 请编辑配置文件填入 API Key 和 Base URL')
    return defaultConfig
  }

  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const stripped = stripComments(content)
    const loaded = JSON.parse(stripped) as Partial<OcosayConfig>

    const merged = mergeWithDefaults(loaded, DEFAULT_CONFIG)

    return {
      ...merged,
      providers: {
        minimax: {
          apiKey: loaded.providers?.minimax?.apiKey ?? '',
          baseURL: loaded.providers?.minimax?.baseURL ?? '',
          voiceId: loaded.providers?.minimax?.voiceId ?? '',
          model: loaded.providers?.minimax?.model ?? 'stream',
          ttsModel: loaded.providers?.minimax?.ttsModel ?? 'speech-2.8-hd',
          audioFormat: loaded.providers?.minimax?.audioFormat ?? 'mp3'
        }
      }
    }
  } catch (error) {
    console.error('[ocosay] 配置文件读取失败，使用默认配置:', error)
    return generateDefaultConfig()
  }
}
