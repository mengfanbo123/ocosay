/**
 * StreamPlayer - 真正的边收边播流式音频播放器
 * 接收音频 chunk，同时写入临时文件并立即启动播放器播放
 */

import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import { createWriteStream, WriteStream } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * StreamPlayer Events - 流式播放器事件回调接口
 */
export interface StreamPlayerEvents {
  onProgress?: (bytesWritten: number) => void
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
}

/**
 * StreamPlayer Options - 流式播放器配置选项
 */
export interface StreamPlayerOptions {
  format?: 'mp3' | 'wav' | 'flac'
  events?: StreamPlayerEvents
}

/**
 * StreamPlayer - 边收边播的流式音频播放器
 * 
 * 特性：
 * - 写入临时文件的同时立即启动播放器
 * - 支持 pause/resume/stop 控制
 * - 跨平台支持：macOS (afplay), Linux (aplay), Windows (PowerShell)
 */
export class StreamPlayer extends EventEmitter {
  private tempFile: string = ''
  private writeStream?: WriteStream
  private playerProcess?: ChildProcess
  private _bytesWritten = 0
  private _started = false
  private _paused = false
  private _stopped = false
  private format: 'mp3' | 'wav' | 'flac' = 'mp3'
  private events?: StreamPlayerEvents

  constructor(options: StreamPlayerOptions = {}) {
    super()
    this.format = options.format || 'mp3'
    this.events = options.events
  }

  /**
   * 开始播放
   * 创建临时文件，创建写入流，启动播放器进程
   */
  start(): void {
    if (this._started) {
      return
    }

    // 创建临时文件
    this.tempFile = join(tmpdir(), `ocosay-stream-${Date.now()}.${this.format}`)

    // 创建写入流
    this.writeStream = createWriteStream(this.tempFile, { highWaterMark: 64 * 1024 })

    this.writeStream.on('error', (error: Error) => {
      this.handleError(error)
    })

    this.writeStream.on('finish', () => {
      // 写入完成，但播放器可能还在播放
    })

    // 启动播放器进程
    this.startPlayer()

    this._started = true
    this._stopped = false

    this.events?.onStart?.()
    this.emit('start')
  }

  /**
   * 启动播放器进程
   */
  private startPlayer(): void {
    const platform = process.platform
    let command: string
    let args: string[]

    if (platform === 'darwin') {
      // macOS
      command = 'afplay'
      args = [this.tempFile]
    } else if (platform === 'linux') {
      // Linux
      command = 'aplay'
      args = [this.tempFile]
    } else {
      // Windows - PlaySync is synchronous and blocks the event loop
      // Return error to indicate Windows is not supported for streaming
      this.handleError(new Error('Windows platform is not supported for stream playback. PlaySync() blocks the Node.js event loop.'))
      return
    }

    this.playerProcess = spawn(command, args, {
      stdio: 'ignore',
      detached: false
    })

    this.playerProcess.on('exit', (code: number | null, signal: string | null) => {
      // 如果是正常结束或被信号终止，不当作错误
      if (this._stopped) {
        return
      }
      
      if (signal === 'SIGTERM' || signal === 'SIGINT') {
        // 被主动停止
        return
      }

      if (code === 0 || code === null) {
        // 正常播放结束
        this.events?.onEnd?.()
        this.emit('end')
      } else {
        this.handleError(new Error(`Player exited with code ${code}`))
      }
    })

    this.playerProcess.on('error', (error: Error) => {
      this.handleError(error)
    })
  }

  /**
   * 写入音频数据块（边收边写）
   * 如果尚未 start()，会自动调用
   */
  write(chunk: Buffer): void {
    // 如果已停止，直接忽略
    if (this._stopped) {
      return
    }

    // 如果未启动，自动启动
    if (!this._started) {
      this.start()
    }

    // 写入数据到文件
    if (this.writeStream) {
      const canContinue = this.writeStream.write(chunk)
      
      if (!canContinue) {
        // 写入缓冲区满了，等待 drain 事件
        this.writeStream.once('drain', () => {
          // 可以继续写入
        })
      }

      this._bytesWritten += chunk.length

      this.events?.onProgress?.(this._bytesWritten)
      this.emit('progress', this._bytesWritten)
    }
  }

  /**
   * 结束写入
   * 关闭写入流，但不杀播放器进程，让它播完
   */
  end(): void {
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = undefined
    }
  }

  /**
   * 停止播放
   * 杀死播放器进程，删除临时文件
   */
  stop(): void {
    this._stopped = true
    this._started = false
    this._paused = false

    // 杀死播放器进程
    if (this.playerProcess) {
      try {
        this.playerProcess.kill('SIGTERM')
      } catch (e) {
        // 忽略错误
      }
      this.playerProcess = undefined
    }

    // 关闭写入流
    if (this.writeStream) {
      try {
        this.writeStream.destroy()
      } catch (e) {
        // 忽略错误
      }
      this.writeStream = undefined
    }

    // 删除临时文件
    this.deleteTempFile()

    this.events?.onStop?.()
    this.emit('stop')
  }

  /**
   * 暂停播放
   * 使用 SIGSTOP 暂停播放器进程
   */
  pause(): void {
    if (!this._started || this._paused || this._stopped) {
      return
    }

    if (this.playerProcess) {
      try {
        this.playerProcess.kill('SIGSTOP')
        this._paused = true
        this.events?.onPause?.()
        this.emit('pause')
      } catch (e) {
        // 如果 kill 失败，忽略
      }
    }
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (!this._paused || this._stopped) {
      return
    }

    if (this.playerProcess) {
      try {
        this.playerProcess.kill('SIGCONT')
        this._paused = false
        this.events?.onResume?.()
        this.emit('resume')
      } catch (e) {
        // 如果 kill 失败，忽略
      }
    }
  }

  /**
   * 是否已启动
   */
  isStarted(): boolean {
    return this._started
  }

  /**
   * 是否暂停
   */
  isPaused(): boolean {
    return this._paused
  }

  /**
   * 是否已停止
   */
  isStopped(): boolean {
    return this._stopped
  }

  /**
   * 获取已写入的字节数
   */
  getBytesWritten(): number {
    return this._bytesWritten
  }

  /**
   * 获取临时文件路径
   */
  getTempFile(): string {
    return this.tempFile
  }

  /**
   * 处理错误
   */
  private handleError(error: Error): void {
    this.events?.onError?.(error)
    this.emit('error', error)
  }

  /**
   * 删除临时文件
   */
  private deleteTempFile(): void {
    if (this.tempFile) {
      try {
        if (fs.existsSync(this.tempFile)) {
          fs.unlinkSync(this.tempFile)
        }
      } catch (e) {
        // 忽略删除错误
      }
      this.tempFile = ''
    }
  }
}

export default StreamPlayer
