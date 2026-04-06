/**
 * PowerShell Backend - Windows 平台音频播放后端
 * 使用 PowerShell 的 [System.Media.SoundPlayer] 异步 API
 */

import { spawn, ChildProcess } from 'child_process'
import { AudioBackend, AudioBackendEvents, BackendOptions } from './base'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'

import { isWsl } from './index'

// 白名单：Windows 路径格式（禁止 - 防止命令注入）
const SAFE_PATH_REGEX = /^[\w\:\\_.]+$/i

// WSL 路径转换为 Windows 路径
function wslPathToWindows(wslPath: string): string {
  // 处理 WSL 特有路径格式 (/tmp, /var/tmp) -> \\wsl$\路径格式
  // 这样 Windows 应用可以访问 WSL 文件系统
  if (wslPath.startsWith('/tmp/')) {
    return '\\\\wsl$\\Ubuntu\\tmp\\' + wslPath.slice(5).replace(/\//g, '\\')
  }
  if (wslPath.startsWith('/var/tmp/')) {
    return '\\\\wsl$\\Ubuntu\\var\\tmp\\' + wslPath.slice(9).replace(/\//g, '\\')
  }
  // 处理标准的 /mnt/x/ 格式
  return wslPath
    .replace(/^\/mnt\/([a-z])\//, '$1:/')
    .replace(/\//g, '\\')
}

// 定义不支持操作的错误类
class UnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedError'
  }
}

/**
 * PowerShellBackend - Windows 原生音频播放后端
 * 使用 PowerShell 异步方式避免阻塞事件循环
 * 不支持真正的流式播放
 */
export class PowerShellBackend implements AudioBackend {
  readonly name = 'powershell'
  readonly supportsStreaming = false
  
  private process?: ChildProcess
  private tempFile?: string
  private events?: AudioBackendEvents
  private _started = false
  private _paused = false
  private _stopped = false
  // P0-4: 缓冲所有chunk，等end()时一次性写入文件
  private chunks: Buffer[] = []
  private hasEnded = false
  
  constructor(options: BackendOptions = {}) {
    this.events = options.events
  }
  
  start(filePath: string): void {
    if (this._started) return

    if (isWsl()) {
      filePath = wslPathToWindows(filePath)
    }

    if (!SAFE_PATH_REGEX.test(filePath)) {
      throw new Error(`Invalid file path: ${filePath}`)
    }
    
    this.tempFile = filePath
    this._started = true
    this._stopped = false
    
    this.events?.onStart?.()
    
    // 安全方案：将路径写入临时脚本文件，避免命令行注入
    const escapedPath = filePath.replace(/'/g, "''")
    const psScript = `$sound = New-Object System.Media.SoundPlayer('${escapedPath}'); $sound.PlayAsync()`
    const scriptFile = join(tmpdir(), `ocosay-${Date.now()}.ps1`)
    writeFileSync(scriptFile, psScript, { encoding: 'utf8' })
    
    this.process = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile], {
      stdio: 'ignore',
      detached: false
    })
    
    // 清理脚本文件
    this.process.on('exit', () => {
      try {
        if (existsSync(scriptFile)) {
          unlinkSync(scriptFile)
        }
      } catch (e) {
        // 忽略清理错误
      }
    })
    
    this.process.on('exit', (code) => {
      if (this._stopped) return
      
      if (code === 0 || code === null) {
        this._started = false
        this.events?.onEnd?.()
      } else {
        this.handleError(new Error(`PowerShell playback exited with code ${code}`))
      }
    })
    
    this.process.on('error', (error) => {
      this.handleError(error)
    })
  }
  
  write(chunk: Buffer): void {
    if (this._stopped) return
    // P0-4: 缓冲所有chunk，等end()时一次性写入
    this.chunks.push(chunk)
  }
  
  end(): void {
    if (this._stopped || this.hasEnded) return
    this.hasEnded = true
    
    if (this.chunks.length === 0) return
    
    // P0-4: 所有chunk缓冲完毕后，一次性写入文件并播放
    this.tempFile = join(tmpdir(), `ocosay-${Date.now()}.wav`)
    writeFileSync(this.tempFile, Buffer.concat(this.chunks))
    this.chunks = []
    this.start(this.tempFile)
  }
  
  pause(): void {
    if (!this._started || this._paused || this._stopped) return
    // PowerShell SoundPlayer.PlayAsync() 不支持暂停，抛错明确告知
    throw new UnsupportedError('pause is not supported by PowerShell SoundPlayer')
  }
  
  resume(): void {
    if (!this._paused || this._stopped) return
    // PowerShell SoundPlayer.PlayAsync() 不支持恢复，抛错明确告知
    throw new UnsupportedError('resume is not supported by PowerShell SoundPlayer')
  }
  
  stop(): void {
    this._stopped = true
    this._started = false
    this._paused = false
    
    if (this.process) {
      try {
        this.process.kill('SIGTERM')
      } catch (e) {
        // 忽略错误
      }
      this.process = undefined
    }
    
    this.cleanup()
    this.chunks = []
    this.hasEnded = false
    
    this.events?.onStop?.()
  }
  
  setVolume(_volume: number): void {
    // PowerShell SoundPlayer 不支持音量控制
  }
  
  destroy(): void {
    this.stop()
  }
  
  private cleanup(): void {
    if (this.tempFile && this.tempFile.startsWith(tmpdir())) {
      try {
        if (existsSync(this.tempFile)) {
          unlinkSync(this.tempFile)
        }
      } catch (e) {
        // 忽略清理错误
      }
      this.tempFile = undefined
    }
  }
  
  private handleError(error: Error): void {
    this.events?.onError?.(error)
  }
}
