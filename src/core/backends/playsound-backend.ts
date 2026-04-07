/**
 * PlaySound Backend - 跨平台音频播放后端
 * 使用 play-sound npm 包调用系统工具（ffplay/aplay/mpg123）
 * 支持 Linux/macOS/Windows，可无声卡播放（ffplay）
 */

import { execFile, ChildProcess } from 'child_process'
import { AudioBackend, AudioBackendEvents, BackendOptions } from './base'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// 白名单：只允许特定路径格式（禁止 - 防止命令注入）
const SAFE_PATH_REGEX = /^[\w\/\.]+$/

/**
 * PlaySoundBackend - 使用 play-sound 包的后端
 * play-sound 会自动选择最佳播放器：
 * - Linux: ffplay > aplay > mpg123
 * - macOS: afplay > aplay > mpg123
 * - Windows: Powershell > vlc > afplay
 * ffplay 支持无声卡播放（-nodisp -autoexit）
 */
export class PlaySoundBackend implements AudioBackend {
  readonly name = 'play-sound'
  readonly supportsStreaming = false
  
  private player?: ChildProcess
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
  
  async start(filePath: string): Promise<void> {
    if (this._started) return
    
    if (!SAFE_PATH_REGEX.test(filePath)) {
      throw new Error(`Invalid file path: ${filePath}`)
    }
    
    this.tempFile = filePath
    this._started = true
    this._stopped = false
    
    this.events?.onStart?.()
    
    // 等待 play-sound 播放完成
    await this.playWithPlaySound(filePath)
  }
  
  private playWithPlaySound(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 异步导入 play-sound
      import('play-sound').then((playModule) => {
        const play = playModule.default
        
        // 对于 ffplay，使用无声模式
        if (process.platform === 'linux') {
          // ffplay 无声卡播放参数
          execFileAsync('ffplay', [
            '-nodisp',      // 不显示窗口
            '-autoexit',    // 播放完自动退出
            '-loglevel', 'error', // 减少日志输出
            filePath
          ]).then(() => {
            if (this._stopped) {
              resolve()
              return
            }
            this._started = false
            this.events?.onEnd?.()
            resolve()
          }).catch((error) => {
            if (this._stopped) {
              resolve()
              return
            }
            this._started = false
            this.handleError(error)
            reject(error)
          })
        } else {
          // 使用 play-sound 的 Promise API
          // play-sound 的类型定义不完善，需要用 any 访问 .play() 方法
          const playerSound = play as any
          const p = playerSound.play(filePath)
          
          if (p && p.then) {
            // 返回 Promise 的情况
            p.then(() => {
              if (this._stopped) {
                resolve()
                return
              }
              this._started = false
              this.events?.onEnd?.()
              resolve()
            }).catch((err: Error) => {
              if (this._stopped) {
                resolve()
                return
              }
              this._started = false
              this.handleError(err)
              reject(err)
            })
          } else if (p && p.kill) {
            // 返回 ChildProcess 的情况
            this.player = p
            p.on('error', (error: Error) => {
              this.handleError(error)
              reject(error)
            })
            p.on('close', () => {
              if (this._stopped) {
                resolve()
                return
              }
              this._started = false
              this.events?.onEnd?.()
              resolve()
            })
          } else {
            // 无法识别的返回类型，直接 resolve
            resolve()
          }
        }
      }).catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err))
        error.message = `play-sound load failed: ${error.message}`
        this.handleError(error)
        reject(error)
      })
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
    
    if (this.player) {
      try {
        this.player.kill('SIGSTOP')
        this._paused = true
        this.events?.onPause?.()
      } catch (e) {
        // SIGSTOP 可能失败
      }
    }
  }
  
  resume(): void {
    if (!this._paused || this._stopped) return
    
    if (this.player) {
      try {
        this.player.kill('SIGCONT')
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
    
    if (this.player) {
      try {
        this.player.kill('SIGTERM')
      } catch (e) {
        // 忽略错误
      }
      this.player = undefined
    }
    
    this.cleanup()
    this.chunks = []
    this.hasEnded = false
    
    this.events?.onStop?.()
  }
  
  setVolume(_volume: number): void {
    // play-sound/ffplay 不支持命令行设置音量
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
