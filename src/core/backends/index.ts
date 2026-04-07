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
export { PlaySoundBackend } from './playsound-backend'
export { SpeakerBackend } from './speaker-backend'

import { execSync } from 'child_process'
import { AudioBackend, BackendOptions } from './base'
import { NaudiodonBackend } from './naudiodon-backend'
import { AfplayBackend } from './afplay-backend'
import { AplayBackend } from './aplay-backend'
import { PowerShellBackend } from './powershell-backend'
import { HowlerBackend } from './howler-backend'
import { PlaySoundBackend } from './playsound-backend'
import { SpeakerBackend } from './speaker-backend'
import { logger } from '../../utils/logger'
import { notificationService } from '../notification'

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
  PLAY_SOUND = 'play-sound',
  SPEAKER = 'speaker',
  AUTO = 'auto'
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

function isSpeakerAvailable(): boolean {
  try {
    require.resolve('speaker')
    return true
  } catch (err) {
    logger.debug({ err }, 'speaker not available')
    return false
  }
}

/**
 * 检测是否运行在 WSL (Windows Subsystem for Linux) 环境中
 */
function isWSL(): boolean {
  if (process.platform !== 'linux') return false
  try {
    const output = execSync('uname -r', { stdio: 'pipe', encoding: 'utf8' })
    return output.toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

export function createBackend(type: BackendType = BackendType.AUTO, options: BackendOptions = {}): AudioBackend {
  const platform = process.platform
   
  if (type !== BackendType.AUTO) {
    return createBackendByType(type, options)
  }
   
  // WSL 环境下 naudiodon 可能无法工作（无法访问 Windows 音频设备），跳过
  if (!isWSL() && isNaudiodonAvailable()) {
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
      notificationService.warning(
        'naudiodon 初始化失败',
        '将使用其他音频后端',
        5000
      )
    }
  }
   
  switch (platform) {
    case 'darwin':
      return new AfplayBackend(options)
    case 'linux': {
      const wsl = isWSL()
      if (wsl) {
        logger.debug('Running on WSL, skipping naudiodon (may not work with Windows audio)')
      }
      
      // Linux 环境检测顺序：naudiodon → aplay → play-sound → speaker → Howler
      // WSL 环境下 naudiodon 可能无法工作，直接尝试其他后端
      if (!wsl && isNaudiodonAvailable()) {
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
      
      // aplay 后端
      if (isCommandAvailable('aplay')) {
        const test = execCmd('aplay -l')
        if (test.success && !test.output.includes('no soundcards')) {
          return new AplayBackend(options)
        }
      }
      // 检测 play-sound (ffplay)
      if (isCommandAvailable('ffplay')) {
        return new PlaySoundBackend(options)
      }
      // 检测 speaker (需要 speaker npm 包)
      if (isSpeakerAvailable()) {
        return new SpeakerBackend(options)
      }
      // 彻底失败，使用 Howler 作为最后的回退
      logger.warn('All Linux audio backends failed, using HowlerBackend as fallback')
      return new HowlerBackend(options)
    }
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
    case BackendType.PLAY_SOUND:
      return new PlaySoundBackend(options)
    case BackendType.SPEAKER:
      return new SpeakerBackend(options)
    default:
      throw new Error(`Unknown backend type: ${type}`)
  }
}

export function supportsStreaming(type: BackendType): boolean {
  if (type === BackendType.AUTO) {
    return isNaudiodonAvailable()
  }
  return type === BackendType.NAUDIODON || type === BackendType.SPEAKER
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
