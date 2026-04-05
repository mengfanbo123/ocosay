/**
 * Audio Player Module
 * 音频播放引擎 - 支持 pause/resume/stop 和流式播放
 */

import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import { createWriteStream } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { TTSError, TTSErrorCode } from './types'

/**
 * Player Events - 播放事件回调接口
 */
export interface PlayerEvents {
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
  onProgress?: (progress: { current: number; total: number }) => void
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
}

/**
 * Player 接口 - 音频播放器标准接口
 */
export interface Player {
  play(audioData: Buffer | ReadableStream, format: string): Promise<void>
  pause(): void
  resume(): void
  stop(): void
  isPlaying(): boolean
  isPaused(): boolean
}

/**
 * AudioPlayer - 基于系统播放器的音频播放实现
 * 支持 macOS (afplay), Linux (aplay), Windows (PowerShell)
 */
export class AudioPlayer extends EventEmitter implements Player {
  private _playing = false
  private _paused = false
  private currentProcess?: ChildProcess
  private currentFile?: string

  constructor(protected events?: PlayerEvents) {
    super()
  }

  /**
   * 播放音频
   * @param audioData 音频数据 (Buffer 或 ReadableStream)
   * @param format 音频格式 (mp3, wav, etc.)
   */
  async play(audioData: Buffer | ReadableStream, format: string): Promise<void> {
    // 如果正在播放，先停止
    if (this._playing) {
      await this.stop()
    }

    this._playing = true
    this._paused = false

    try {
      // 将音频数据写入临时文件
      const tempFile = join(tmpdir(), `ocosay-${Date.now()}.${format}`)
      this.currentFile = tempFile

      if (Buffer.isBuffer(audioData)) {
        fs.writeFileSync(tempFile, audioData)
      } else {
        const writeStream = createWriteStream(tempFile)
        const reader = audioData.getReader()
        
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value instanceof Uint8Array) {
              writeStream.write(Buffer.from(value))
            }
          }
          writeStream.end()
        } finally {
          reader.releaseLock()
        }
        
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve)
          writeStream.on('error', reject)
        })
      }

      // 触发开始事件
      this.events?.onStart?.()
      this.emit('start')

      // 根据格式选择播放器
      await this.playFile(tempFile, format)

      // 播放完成
      this._playing = false
      this.events?.onEnd?.()
      this.emit('end')

      // 清理临时文件
      this.cleanup()

    } catch (error: any) {
      this._playing = false
      const ttsError = new TTSError(
        error.message || 'Playback failed',
        TTSErrorCode.PLAYER_ERROR,
        'player'
      )
      this.events?.onError?.(ttsError)
      this.emit('error', ttsError)
      throw ttsError
    }
  }

  /**
   * 播放音频文件
   * 优先使用 afplay (macOS), aplay (Linux), 否则用 PowerShell (Windows)
   */
  private playFile(filePath: string, format: string): Promise<void> {
    const platform = process.platform

    return new Promise((resolve, reject) => {
      let command: string
      let args: string[]

      if (platform === 'darwin') {
        // macOS
        command = 'afplay'
        args = [filePath]
      } else if (platform === 'linux') {
        // Linux
        command = 'aplay'
        args = [filePath]
      } else {
        // Windows 或其他
        command = 'powershell'
        args = ['-c', `(New-Object System.Media.SoundPlayer('${filePath.replace(/\\/g, '\\\\')}')).PlaySync()`]
      }

      this.currentProcess = spawn(command, args, {
        stdio: 'ignore',
        detached: false
      })

      this.currentProcess.on('exit', (code: number | null, signal: string | null) => {
        // 如果是被信号终止（如 SIGTERM），不当作错误
        if (signal === 'SIGTERM' || signal === 'SIGINT') {
          resolve()
        } else if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Player exited with code ${code}`))
        }
      })

      this.currentProcess.on('error', (error: Error) => {
        reject(error)
      })
    })
  }

  /**
   * 暂停播放
   * 注意: 目前通过 SIGSTOP 实现，真正的 pause 需要支持暂停的音频库
   */
  pause(): void {
    if (!this._playing || this._paused) return

    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGSTOP')
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
    if (!this._playing || !this._paused) return

    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGCONT')
        this._paused = false
        this.events?.onResume?.()
        this.emit('resume')
      } catch (e) {
        // 如果 kill 失败，忽略
      }
    }
  }

  /**
   * 停止播放
   */
  async stop(): Promise<void> {
    this._playing = false
    this._paused = false

    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGTERM')
      } catch (e) {
        // 忽略错误
      }
      this.currentProcess = undefined
    }

    this.cleanup()

    this.events?.onStop?.()
    this.emit('stop')
  }

  /**
   * 是否正在播放
   */
  isPlaying(): boolean {
    return this._playing
  }

  /**
   * 是否暂停
   */
  isPaused(): boolean {
    return this._paused
  }

  /**
   * 清理临时文件
   */
  private cleanup(): void {
    if (this.currentFile) {
      try {
        if (fs.existsSync(this.currentFile)) {
          fs.unlinkSync(this.currentFile)
        }
      } catch (e) {
        // 忽略清理错误
      }
      this.currentFile = undefined
    }
  }
}

/**
 * StreamingPlayer - 流式播放器，支持边下载边播放
 * 注意: 当前实现是下载完毕后再播放，onProgress 事件用于报告下载进度
 */
export class StreamingPlayer extends AudioPlayer {
  private chunks: Buffer[] = []
  private downloadedSize = 0

  constructor(events?: PlayerEvents) {
    super(events)
  }

  /**
   * 流式下载并播放
   * @param stream 可读流
   * @param format 音频格式
   * @param expectedSize 预期大小（可选），用于进度报告
   */
  async streamAndPlay(
    stream: ReadableStream,
    format: string,
    expectedSize?: number
  ): Promise<void> {
    const reader = stream.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (value instanceof Buffer) {
          this.chunks.push(value)
          this.downloadedSize += value.length

          // 触发下载进度
          if (expectedSize) {
            this.emit('progress', {
              current: this.downloadedSize,
              total: expectedSize
            })
            this.events?.onProgress?.({
              current: this.downloadedSize,
              total: expectedSize
            })
          }
        }
      }

      // 合并所有 chunk 并播放
      const fullAudio = Buffer.concat(this.chunks)
      await this.play(fullAudio, format)

    } finally {
      reader.releaseLock()
      this.chunks = []
      this.downloadedSize = 0
    }
  }
}

export default AudioPlayer
