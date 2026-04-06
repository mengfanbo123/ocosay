/**
 * StreamReader - 流式文本缓冲与句子边界检测
 * 
 * 功能：
 * - 订阅 TuiEventBus 的 message.part.delta 事件
 * - 缓冲区满或遇到句子结束符时触发 textReady 事件
 * - 支持超时强制发送
 */

import { EventEmitter } from 'events'
import { StreamState, TTSError, TTSErrorCode } from './types'
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('StreamReader')

export class StreamReader extends EventEmitter {
  private state: StreamState = StreamState.IDLE
  private buffer: string = ''
  private sessionID?: string
  private messageID?: string
  private partID?: string
  private timeoutHandle?: NodeJS.Timeout
  
  constructor(
    private bufferSize: number = 30,
    private bufferTimeout: number = 2000
  ) {
    super()
  }

  /**
   * 启动流式监听
   * 将状态从 IDLE 切换到 BUFFERING，开始监听事件
   */
  start(): void {
    if (this.state === StreamState.IDLE) {
      this.state = StreamState.BUFFERING
      this.emit('streamStart')
    }
  }
  
  handleDelta(sessionID: string, messageID: string, partID: string, delta: unknown): void {
    if (typeof delta !== 'string') {
      logger.warn({ delta }, 'handleDelta received non-string delta, skipping')
      return
    }

    if (this.state === StreamState.IDLE) {
      this.state = StreamState.BUFFERING
      this.sessionID = sessionID
      this.messageID = messageID
      this.partID = partID
      this.emit('streamStart')
      logger.debug({ sessionID, messageID, partID }, 'Stream started')
    }
    
    this.buffer += delta
    this.resetTimeout()
    logger.debug({ deltaLength: delta.length, bufferLength: this.buffer.length }, 'Delta received')
    
    if (this.shouldFlush()) {
      this.flushBuffer()
    }
  }
  
  /**
   * 处理流结束
   */
  handleEnd(): void {
    if (this.state === StreamState.ENDED) {
      return
    }
    if (this.buffer.length > 0) {
      this.flushBuffer()
    }
    this.state = StreamState.ENDED
    this.clearTimeout()
    this.emit('streamEnd')
  }
  
  /**
   * 处理错误
   */
  handleError(error: TTSError): void {
    this.clearTimeout()
    this.state = StreamState.IDLE
    this.buffer = ''
    this.emit('streamError', error)
  }
  
  /**
   * 重置缓冲器
   */
  reset(): void {
    this.state = StreamState.IDLE
    this.buffer = ''
    this.sessionID = undefined
    this.messageID = undefined
    this.partID = undefined
    this.clearTimeout()
  }
  
  /**
   * 判断是否应该刷新缓冲区
   * 条件：
   * 1. 包含句子结束符（任何长度）
   * 2. 缓冲区长度 >= bufferSize
   */
  private shouldFlush(): boolean {
    // 句子结束标记：。！？.!?……（中文句号、感叹号、问号、省略号）
    const sentenceEnd = /[。！？.!?]|……/
    if (sentenceEnd.test(this.buffer)) {
      return true
    }
    // 缓冲区达到阈值
    if (this.buffer.length >= this.bufferSize) {
      return true
    }
    return false
  }
  
  /**
   * 刷新缓冲区，发送textReady事件
   */
  private flushBuffer(): void {
    const text = this.buffer.trim()
    if (text.length > 0) {
      this.emit('textReady', text)
    }
    this.buffer = ''
    this.resetTimeout()
  }
  
  /**
   * 重置超时计时器
   */
  private resetTimeout(): void {
    this.clearTimeout()
    this.timeoutHandle = setTimeout(() => {
      if (this.buffer.length > 0) {
        this.flushBuffer()
      }
    }, this.bufferTimeout)
  }
  
  /**
   * 清除超时计时器
   */
  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = undefined
    }
  }
  
  /**
   * 获取当前状态
   */
  getState(): StreamState {
    return this.state
  }
  
  /**
   * 检查流是否处于活跃状态
   */
  isActive(): boolean {
    return this.state === StreamState.BUFFERING
  }
  
  /**
   * 获取当前缓冲区内容
   */
  getBuffer(): string {
    return this.buffer
  }
  
  /**
   * 获取当前会话ID
   */
  getSessionID(): string | undefined {
    return this.sessionID
  }
  
  /**
   * 获取当前消息ID
   */
  getMessageID(): string | undefined {
    return this.messageID
  }
  
  /**
   * 获取当前分块ID
   */
  getPartID(): string | undefined {
    return this.partID
  }
}
