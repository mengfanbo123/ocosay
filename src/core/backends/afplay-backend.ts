/**
 * Afplay Backend - macOS 平台音频播放后端
 * 使用系统内置的 afplay 命令
 */

import { execFile, ChildProcess } from 'child_process'
import { AudioBackend, AudioBackendEvents, BackendOptions } from './base'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'

// 白名单：只允许特定路径格式（禁止 - 防止命令注入）
const SAFE_PATH_REGEX = /^[\w\/\.]+$/

/**
 * AfplayBackend - macOS 原生音频播放后端
 * 不支持真正的流式播放，需要先将数据写入临时文件
 */
export class AfplayBackend implements AudioBackend {
  readonly name = 'afplay'
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
    
    if (!SAFE_PATH_REGEX.test(filePath)) {
      throw new Error(`Invalid file path: ${filePath}`)
    }
    
    this.tempFile = filePath
    this._started = true
    this._stopped = false
    
    this.events?.onStart?.()
    
    // 启动播放进程
    this.process = execFile('afplay', [filePath], (error) => {
      if (this._stopped) return
      
      if (error) {
        this.handleError(error)
        return
      }
      
      // 播放正常结束
      this._started = false
      this.events?.onEnd?.()
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
    
    if (this.process) {
      try {
        this.process.kill('SIGSTOP')
        this._paused = true
        this.events?.onPause?.()
      } catch (e) {
        // SIGSTOP 可能失败
      }
    }
  }
  
  resume(): void {
    if (!this._paused || this._stopped) return
    
    if (this.process) {
      try {
        this.process.kill('SIGCONT')
        this._paused = false
        this.events?.onResume?.()
      } catch (e) {
        // SIGCONT 可能失败
      }
    }
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
    
    // 清理临时文件
    this.cleanup()
    this.chunks = []
    this.hasEnded = false
    
    this.events?.onStop?.()
  }
  
  setVolume(_volume: number): void {
    // afplay 不支持命令行设置音量
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
