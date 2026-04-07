/**
 * dependency-installer.ts - 安装层模块
 * 根据平台调用合适的包管理器安装系统依赖
 */

import { execSync } from 'child_process'
import { createModuleLogger } from '../utils/logger.js'
import { detectPlatform } from './dependency-mapper.js'
import { execCapture } from './dependency-detector.js'
import { notificationService } from './notification.js'

const logger = createModuleLogger('DependencyInstaller')

export interface InstallResult {
  success: boolean
  installedPackages: string[]
  failedPackages: string[]
  error?: string
}

function getInstallCommandPrefix(): string {
  const { platform, isWsl } = detectPlatform()
  if (platform === 'linux' || isWsl) {
    return 'sudo apt-get install -y'
  } else if (platform === 'darwin') {
    return 'brew install'
  }
  return 'choco install -y'
}

function getCheckCommand(packageName: string): string {
  const { platform, isWsl } = detectPlatform()
  if (platform === 'linux' || isWsl) {
    return `dpkg -s ${packageName} 2>/dev/null | grep -q "Status: install ok installed"`
  } else if (platform === 'darwin') {
    return `brew list ${packageName} &>/dev/null`
  }
  return `choco list --local-only ${packageName} &>/dev/null`
}

function silentLog(level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>): void {
  switch (level) {
    case 'info':
      logger.info(extra || {}, message)
      break
    case 'warn':
      logger.warn(extra || {}, message)
      break
    case 'error':
      logger.error(extra || {}, message)
      break
  }
}

function canSudoWithoutPassword(): boolean {
  try {
    execSync('sudo -n true 2>&1', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export async function installSystemPackages(
  packages: string[],
  notifSvc?: typeof notificationService
): Promise<InstallResult> {
  const result: InstallResult = {
    success: false,
    installedPackages: [],
    failedPackages: [],
  }

  const validPackages = packages.filter(p => p && p.length > 0 && p !== '臺')
  if (validPackages.length === 0) {
    silentLog('info', '没有需要安装的包')
    return { ...result, success: true }
  }

  silentLog('info', `开始安装系统依赖: ${validPackages.join(', ')}`, { packages: validPackages })
  notifSvc?.info('正在安装系统依赖...', 'Ocosay', 3000)

  const installCommand = getInstallCommandPrefix()
  const fullCommand = `${installCommand} ${validPackages.join(' ')}`
  silentLog('info', `执行安装命令: ${fullCommand}`)

  // 安装前检测 sudo 免密权限
  if (!canSudoWithoutPassword()) {
    const msg = '需要 sudo 权限，请确保已配置 NOPASSWD'
    result.error = msg
    notifSvc?.error('需要 sudo 权限', '请在终端执行: sudo visudo 添加 NOPASSWD 配置，配置好后请重启 OpenCode', 10000)
    silentLog('error', msg)
    return result
  }

  try {
    const { platform, isWsl } = detectPlatform()
    if (platform === 'linux' || isWsl) {
      notifSvc?.info('正在更新包列表...', 'Ocosay', 3000)
      silentLog('info', '更新 apt 包列表')
      
      try {
        execSync('sudo apt-get update', {
          timeout: 120000,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        silentLog('info', 'apt-get update 完成')
      } catch (updateErr) {
        silentLog('warn', 'apt-get update 失败，继续尝试安装', { error: String(updateErr) })
      }
    }

    notifSvc?.info(`正在安装 ${validPackages.length} 个包...`, 'Ocosay', 5000)
    
    const output = execSync(fullCommand, {
      timeout: 300000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    silentLog('info', `安装输出: ${output.substring(0, 500)}`)

    const verifiedPackages: string[] = []
    const failedPackages: string[] = []

    for (const pkg of validPackages) {
      const isInstalled = await verifyInstallation([pkg])
      if (isInstalled) {
        verifiedPackages.push(pkg)
        silentLog('info', `包 ${pkg} 安装验证成功`)
      } else {
        failedPackages.push(pkg)
        silentLog('warn', `包 ${pkg} 安装验证失败`)
      }
    }

    result.installedPackages = verifiedPackages
    result.failedPackages = failedPackages
    result.success = failedPackages.length === 0

    if (result.success) {
      notifSvc?.success('系统依赖安装成功', verifiedPackages.join(', '), 5000)
      silentLog('info', `所有包安装成功: ${verifiedPackages.join(', ')}`)
    } else {
      const errorMsg = failedPackages.length > 0 
        ? `以下包安装失败: ${failedPackages.join(', ')}`
        : '部分包安装失败'
      result.error = errorMsg
      notifSvc?.warning('部分依赖安装失败', errorMsg, 8000)
      silentLog('warn', errorMsg)
    }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    silentLog('error', `安装命令执行失败: ${errorMessage}`, { error: errorMessage })
    
    if (errorMessage.includes('sudo') || errorMessage.toLowerCase().includes('password')) {
      result.error = '需要 sudo 权限，请确保已配置 NOPASSWD'
      notifSvc?.error('需要 sudo 权限', '请在终端执行: sudo visudo', 10000)
    } else if (errorMessage.includes('already') || errorMessage.includes('is already')) {
      result.success = true
      result.installedPackages = validPackages
      notifSvc?.success('依赖已存在', '无需重新安装', 3000)
    } else {
      result.error = errorMessage
      notifSvc?.error('依赖安装失败', errorMessage.substring(0, 200), 8000)
    }
  }

  return result
}

export async function verifyInstallation(packages: string[]): Promise<boolean> {
  if (packages.length === 0) {
    return true
  }

  const validPackages = packages.filter(p => p && p.length > 0 && p !== '臺')
  if (validPackages.length === 0) {
    return true
  }

  silentLog('info', `验证包安装状态: ${validPackages.join(', ')}`)

  try {
    for (const pkg of validPackages) {
      const checkCmd = getCheckCommand(pkg)
      const { success } = execCapture(checkCmd)
      
      if (!success) {
        silentLog('warn', `包 ${pkg} 验证失败`)
        return false
      }
    }
    
    silentLog('info', `所有包验证通过: ${validPackages.join(', ')}`)
    return true
  } catch (err) {
    silentLog('error', `验证过程异常: ${String(err)}`)
    return false
  }
}

export async function installPackage(
  packageName: string,
  notifSvc?: typeof notificationService
): Promise<InstallResult> {
  return installSystemPackages([packageName], notifSvc)
}
