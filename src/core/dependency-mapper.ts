/**
 * dependency-mapper.ts - 解析层模块
 * 建立头文件 → 系统包名 的映射，支持多平台
 */

import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export interface HeaderMapping {
  header: string
  package: string
  packageMac?: string
  packageWin?: string
}

export interface PlatformInfo {
  platform: 'linux' | 'darwin' | 'win32'
  isWsl: boolean
  packageManager: 'apt-get' | 'brew' | 'choco'
  installCommand: string
}

export interface PlatformInfo {
  platform: 'linux' | 'darwin' | 'win32'
  isWsl: boolean
  packageManager: 'apt-get' | 'brew' | 'choco'
  installCommand: string  // 完整的安装命令前缀
}

// ============================================================
// 映射表
// ============================================================

export const HEADER_TO_PACKAGE: HeaderMapping[] = [
  // ALSA - Linux音频库
  {
    header: 'alsa/asoundlib.h',
    package: 'libasound2-dev',
  },
  // PortAudio - 跨平台音频I/O库
  {
    header: 'portaudio.h',
    package: 'libportaudio-dev',
    packageMac: 'portaudio',
    packageWin: 'portaudio',
  },
  // FFmpeg相关
  {
    header: 'libavcodec/avcodec.h',
    package: 'libavcodec-dev',
    packageMac: 'ffmpeg',
    packageWin: 'ffmpeg',
  },
  {
    header: 'libavformat/avformat.h',
    package: 'libavformat-dev',
    packageMac: 'ffmpeg',
    packageWin: 'ffmpeg',
  },
  {
    header: 'libavutil/avutil.h',
    package: 'libavutil-dev',
    packageMac: 'ffmpeg',
    packageWin: 'ffmpeg',
  },
  {
    header: 'libswresample/swresample.h',
    package: 'libswresample-dev',
    packageMac: 'ffmpeg',
    packageWin: 'ffmpeg',
  },
  // OpenAL - 3D音频API
  {
    header: 'AL/al.h',
    package: 'libopenal-dev',
    packageMac: 'openal',
    packageWin: 'openal',
  },
  // SDL - 多媒体库
  {
    header: 'SDL2/SDL.h',
    package: 'libsdl2-dev',
    packageMac: 'sdl2',
    packageWin: 'sdl2',
  },
  // PulseAudio - Linux音频服务
  {
    header: 'pulse/pulseaudio.h',
    package: 'libpulse-dev',
  },
  // CoreAudio - macOS音频框架 (无头文件，纯框架)
  {
    header: 'CoreAudio/CoreAudio.h',
    package: '臺',  // macOS系统框架，无需安装包
    packageMac: '',
  },
  // Windows特定
  {
    header: 'windows.h',
    package: '',  // Linux上不存在
    packageWin: '', // Windows SDK自带
  },
]

// ============================================================
// 平台检测
// ============================================================

/**
 * 检测当前平台信息
 */
export function detectPlatform(): PlatformInfo {
  const platform = process.platform as 'linux' | 'darwin' | 'win32'
  const isWsl = detectWsl()

  let packageManager: PlatformInfo['packageManager']
  let installCommand: string

  if (platform === 'linux' || isWsl) {
    packageManager = 'apt-get'
    installCommand = 'sudo apt-get install -y'
  } else if (platform === 'darwin') {
    packageManager = 'brew'
    installCommand = 'brew install'
  } else {
    packageManager = 'choco'
    installCommand = 'choco install -y'
  }

  return {
    platform,
    isWsl,
    packageManager,
    installCommand,
  }
}

/**
 * 检测是否运行在 WSL 环境中
 */
function detectWsl(): boolean {
  if (process.platform !== 'linux') return false
  try {
    return require('fs').readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

// ============================================================
// 映射函数
// ============================================================

/**
 * 根据平台获取包名
 */
function getPackageForPlatform(mapping: HeaderMapping, platform: string, isWsl: boolean): string | null {
  // Windows
  if (platform === 'win32') {
    // Windows下WSL环境使用Linux包管理器
    if (isWsl) {
      return mapping.package || null
    }
    return mapping.packageWin || mapping.package || null
  }

  // macOS
  if (platform === 'darwin') {
    // macOS系统框架头文件无需安装包
    if (mapping.packageMac === '') return null
    return mapping.packageMac || mapping.package || null
  }

  // Linux (包括WSL)
  // Linux系统框架头文件无需安装包
  if (mapping.package === '') return null
  return mapping.package || null
}

/**
 * 将头文件映射为对应平台的系统包名
 * @param header 头文件路径，如 "alsa/asoundlib.h"
 * @param platform 平台标识，如 "linux", "darwin", "win32"
 * @returns 包名数组，如果无法映射则返回空数组
 */
export function mapHeaderToPackages(header: string, platform: string): string[] {
  // 精确匹配
  const exactMatch = HEADER_TO_PACKAGE.find(
    m => m.header.toLowerCase() === header.toLowerCase()
  )

  if (exactMatch) {
    const pkg = getPackageForPlatform(exactMatch, platform, detectWsl())
    if (pkg && pkg.length > 0 && pkg !== '臺') {  // '臺' 是macOS CoreAudio的占位符，表示无需安装
      return [pkg]
    }
    return []
  }

  // 模糊匹配（仅匹配头文件 basename）
  const headerBasename = header.split('/').pop()?.toLowerCase() || ''
  const fuzzyMatch = HEADER_TO_PACKAGE.find(m => {
    const mappingBasename = m.header.split('/').pop()?.toLowerCase() || ''
    return mappingBasename === headerBasename
  })

  if (fuzzyMatch) {
    const pkg = getPackageForPlatform(fuzzyMatch, platform, detectWsl())
    if (pkg && pkg.length > 0 && pkg !== '臺') {
      return [pkg]
    }
    return []
  }

  return []
}

/**
 * 批量将头文件映射为对应平台的系统包名
 * @param headers 头文件路径数组
 * @param platform 平台标识
 * @returns 去重后的包名数组
 */
export function mapHeadersToPackages(headers: string[], platform: string): string[] {
  const packageSet = new Set<string>()

  for (const header of headers) {
    const packages = mapHeaderToPackages(header, platform)
    for (const pkg of packages) {
      if (pkg.length > 0) {
        packageSet.add(pkg)
      }
    }
  }

  return Array.from(packageSet)
}

/**
 * 生成安装命令
 * @param packages 包名数组
 * @param platformInfo 平台信息
 * @returns 完整的安装命令
 */
export function generateInstallCommand(
  packages: string[],
  platformInfo?: PlatformInfo
): string {
  const info = platformInfo || detectPlatform()

  if (packages.length === 0) {
    return ''
  }

  if (info.platform === 'linux' || info.isWsl) {
    return `sudo apt-get update && sudo apt-get install -y ${packages.join(' ')}`
  } else if (info.platform === 'darwin') {
    return `brew install ${packages.join(' ')}`
  } else {
    return `choco install -y ${packages.join(' ')}`
  }
}

// ============================================================
// 调试/诊断
// ============================================================

export interface MappingDebugInfo {
  header: string
  mappedPackages: string[]
  platform: PlatformInfo
  rawMapping?: HeaderMapping
}

/**
 * 调试用：获取头文件的完整映射信息
 */
export function debugHeaderMapping(header: string): MappingDebugInfo {
  const platform = detectPlatform()

  const exactMatch = HEADER_TO_PACKAGE.find(
    m => m.header.toLowerCase() === header.toLowerCase()
  )

  const headerBasename = header.split('/').pop()?.toLowerCase() || ''
  const fuzzyMatch = !exactMatch
    ? HEADER_TO_PACKAGE.find(m => {
        const mappingBasename = m.header.split('/').pop()?.toLowerCase() || ''
        return mappingBasename === headerBasename
      })
    : undefined

  const rawMapping = exactMatch || fuzzyMatch
  const pkg = rawMapping
    ? getPackageForPlatform(rawMapping, platform.platform, platform.isWsl)
    : null

  const packages: string[] = (pkg && pkg.length > 0 && pkg !== '臺') ? [pkg] : []

  return {
    header,
    mappedPackages: packages,
    platform,
    rawMapping,
  }
}
