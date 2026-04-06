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

import { execSync } from 'child_process'
import { AudioBackend, BackendOptions } from './base'
import { NaudiodonBackend } from './naudiodon-backend'
import { AfplayBackend } from './afplay-backend'
import { AplayBackend } from './aplay-backend'
import { PowerShellBackend } from './powershell-backend'
import { HowlerBackend } from './howler-backend'
import { logger } from '../../utils/logger'

function execCmd(cmd: string): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf8' })
    return { success: true, output }
  } catch (err: any) {
    return { success: false, output: err.message || '' }
  }
}

function isCommandAvailable(cmd: string): boolean {
  return execCmd(`which ${cmd}`).success
}

/**
 * 后端类型枚举
 */
export enum BackendType {
  NAUDIODON = 'naudiodon',
  AFPLAY = 'afplay',
  APLAY = 'aplay',
  POWERSHELL = 'powershell',
  HOWLER = 'howler',
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
  } catch (err) {
    logger.warn({ err }, 'failed to load naudiodon module')
    naudiodonCache = false
    return null
  }
}

function isNaudiodonAvailable(): boolean {
  try {
    require.resolve('naudiodon')
    return true
  } catch (err) {
    logger.debug({ err }, 'naudiodon not available')
    return false
  }
}

export function createBackend(type: BackendType = BackendType.AUTO, options: BackendOptions = {}): AudioBackend {
  const platform = process.platform
   
  if (type !== BackendType.AUTO) {
    return createBackendByType(type, options)
  }
   
  if (isNaudiodonAvailable()) {
    try {
      const naudiodon = require('naudiodon')
      if (naudiodon) {
        const devices = naudiodon.getDevices()
        if (devices && devices.length > 0) {
          return new NaudiodonBackend(options)
        }
        logger.debug('naudiodon has no audio devices, skipping')
      }
    } catch (err) {
      logger.error({ err }, 'failed to initialize naudiodon backend')
    }
  }
   
  switch (platform) {
    case 'darwin':
      return new AfplayBackend(options)
    case 'linux':
      if (isCommandAvailable('aplay')) {
        const test = execCmd('aplay -l')
        if (test.success && !test.output.includes('no soundcards')) {
          return new AplayBackend(options)
        }
      }
      return new HowlerBackend(options)
    case 'win32':
      return new PowerShellBackend(options)
    default:
      return new HowlerBackend(options)
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
    case BackendType.HOWLER:
      return new HowlerBackend(options)
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
