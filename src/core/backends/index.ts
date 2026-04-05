/**
 * Audio Backends - 多平台音频后端统一导出
 */

// 接口和类型
export { AudioBackend, AudioBackendEvents, BackendOptions } from './base'

// 各平台后端实现
export { NaudiodonBackend } from './naudiodon-backend'
export { AfplayBackend } from './afplay-backend'
export { AplayBackend } from './aplay-backend'
export { PowerShellBackend } from './powershell-backend'
export { HowlerBackend } from './howler-backend'

import { AudioBackend, BackendOptions } from './base'
import { NaudiodonBackend } from './naudiodon-backend'
import { AfplayBackend } from './afplay-backend'
import { AplayBackend } from './aplay-backend'
import { PowerShellBackend } from './powershell-backend'

/**
 * 后端类型枚举
 */
export enum BackendType {
  NAUDIODON = 'naudiodon',
  AFPLAY = 'afplay',
  APLAY = 'aplay',
  POWERSHELL = 'powershell',
  AUTO = 'auto'
}

let naudiodonCache: any = null

async function tryLoadNaudiodon(): Promise<any> {
  if (naudiodonCache !== null) {
    return naudiodonCache
  }
  try {
    naudiodonCache = await import('naudiodon')
    return naudiodonCache
  } catch (e) {
    naudiodonCache = false
    return null
  }
}

function isNaudiodonAvailable(): boolean {
  try {
    require.resolve('naudiodon')
    return true
  } catch (e) {
    return false
  }
}

export function isWsl(): boolean {
  if (process.platform !== 'linux') return false
  try {
    return require('fs').readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

/**
 * 创建音频后端
 * @param type 后端类型，默认 AUTO（自动选择）
 * @param options 后端配置选项
 * @returns 音频后端实例
 */
export function createBackend(type: BackendType = BackendType.AUTO, options: BackendOptions = {}): AudioBackend {
  const platform = process.platform
  
  if (type !== BackendType.AUTO) {
    return createBackendByType(type, options)
  }
  
  if (isNaudiodonAvailable()) {
    try {
      const naudiodon = require('naudiodon')
      if (naudiodon) {
        return new NaudiodonBackend(options)
      }
    } catch (e) {}
  }
  
  switch (platform) {
    case 'darwin':
      return new AfplayBackend(options)
    case 'linux':
      if (isWsl()) {
        return new PowerShellBackend(options)
      }
      return new AplayBackend(options)
    case 'win32':
      return new PowerShellBackend(options)
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

function createBackendByType(type: BackendType, options: BackendOptions): AudioBackend {
  switch (type) {
    case BackendType.NAUDIODON:
      return new NaudiodonBackend(options)
    case BackendType.AFPLAY:
      return new AfplayBackend(options)
    case BackendType.APLAY:
      return new AplayBackend(options)
    case BackendType.POWERSHELL:
      return new PowerShellBackend(options)
    default:
      throw new Error(`Unknown backend type: ${type}`)
  }
}

export function supportsStreaming(type: BackendType): boolean {
  if (type === BackendType.AUTO) {
    return isNaudiodonAvailable()
  }
  return type === BackendType.NAUDIODON
}

export function getDefaultBackendType(): BackendType {
  const platform = process.platform
  
  if (supportsStreaming(BackendType.AUTO)) {
    return BackendType.NAUDIODON
  }
  
  switch (platform) {
    case 'darwin':
      return BackendType.AFPLAY
    case 'linux':
      return BackendType.APLAY
    case 'win32':
      return BackendType.POWERSHELL
    default:
      return BackendType.NAUDIODON
  }
}
