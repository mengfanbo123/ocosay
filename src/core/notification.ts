// src/core/notification.ts
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('NotificationService')

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  title: string
  message: string
  variant?: ToastVariant
  duration?: number
}

/**
 * NotificationService - 统一 Toast 通知管理
 * 参照 DCP 实现，不做防御性检查，直接调用并用 try-catch 处理
 */
class NotificationService {
  private tui: any = null
  private pendingToasts: ToastOptions[] = []
  private retryTimer?: NodeJS.Timeout

  setTui(tui: any): void {
    this.tui = tui
    logger.debug('tui reference set')
    this.flushPending()
  }

  showToast(options: ToastOptions): boolean {
    const { title, message, variant = 'info', duration = 5000 } = options

    if (!this.tui) {
      logger.debug({ title }, 'tui not ready, queueing toast')
      this.pendingToasts.push(options)
      this.scheduleRetry()
      return false
    }

    try {
      // 参照 DCP 格式：{ body: { title, message, variant, duration } }
      this.tui.showToast({
        body: {
          title,
          message,
          variant,
          duration,
        },
      })
      logger.debug({ title, variant }, 'toast shown')
      return true
    } catch (err) {
      // 参照 DCP：捕获异常但不抛出
      logger.warn({ err, title }, 'toast call failed, queueing for retry')
      this.pendingToasts.push(options)
      this.scheduleRetry()
      return false
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      this.flushPending()
    }, 2000)
  }

  private flushPending(): void {
    if (this.pendingToasts.length === 0 || !this.tui) return
    
    logger.info({ count: this.pendingToasts.length }, 'flushing pending toasts')
    const pending = [...this.pendingToasts]
    this.pendingToasts = []  // 乐观清空
    
    for (const toast of pending) {
      try {
        this.showToast(toast)
      } catch (err) {
        // 保护性重新加入队列
        this.pendingToasts.push(toast)
        logger.warn({ err }, 'showToast threw unexpected error, re-queued')
      }
    }
  }

  success(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'success', duration })
  }

  error(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'error', duration })
  }

  info(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'info', duration })
  }

  warning(title: string, message: string, duration?: number): boolean {
    return this.showToast({ title, message, variant: 'warning', duration })
  }
}

export const notificationService = new NotificationService()
export default notificationService
