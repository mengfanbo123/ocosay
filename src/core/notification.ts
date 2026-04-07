// src/core/notification.ts
import { createModuleLogger } from '../utils/logger'

const logger = createModuleLogger('NotificationService')

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  title?: string
  message: string
  variant?: ToastVariant
  duration?: number
}

const SISYPHUS_SPINNER = ['·', '•', '●', '○', '◌', '◦', ' ']

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
    const title = options.title || this.getTitleForVariant(options.variant || 'info')
    const { message, variant = 'info', duration = 5000 } = options

    if (!this.tui) {
      logger.debug({ title }, 'tui not ready, queueing toast')
      this.pendingToasts.push({ ...options, title })
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
      this.pendingToasts.push({ ...options, title })
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

  success(message: string, duration?: number): boolean
  success(title: string, message: string, duration?: number): boolean
  success(titleOrMessage: string, messageOrDuration?: string | number, duration?: number): boolean {
    if (typeof messageOrDuration === 'string') {
      // 3参数: success(title, message, duration)
      return this.showToast({ title: titleOrMessage, message: messageOrDuration, variant: 'success', duration })
    }
    // 2参数: success(message, duration) 或 success(message)
    return this.showToast({ message: titleOrMessage, variant: 'success', duration: messageOrDuration })
  }

  error(message: string, duration?: number): boolean
  error(title: string, message: string, duration?: number): boolean
  error(titleOrMessage: string, messageOrDuration?: string | number, duration?: number): boolean {
    if (typeof messageOrDuration === 'string') {
      return this.showToast({ title: titleOrMessage, message: messageOrDuration, variant: 'error', duration })
    }
    return this.showToast({ message: titleOrMessage, variant: 'error', duration: messageOrDuration || 8000 })
  }

  info(message: string, duration?: number): boolean
  info(title: string, message: string, duration?: number): boolean
  info(titleOrMessage: string, messageOrDuration?: string | number, duration?: number): boolean {
    if (typeof messageOrDuration === 'string') {
      return this.showToast({ title: titleOrMessage, message: messageOrDuration, variant: 'info', duration })
    }
    return this.showToast({ message: titleOrMessage, variant: 'info', duration: messageOrDuration })
  }

  warning(message: string, duration?: number): boolean
  warning(title: string, message: string, duration?: number): boolean
  warning(titleOrMessage: string, messageOrDuration?: string | number, duration?: number): boolean {
    if (typeof messageOrDuration === 'string') {
      return this.showToast({ title: titleOrMessage, message: messageOrDuration, variant: 'warning', duration })
    }
    return this.showToast({ message: titleOrMessage, variant: 'warning', duration: messageOrDuration })
  }

  async showSpinnerToast(
    title: string,
    message: string,
    duration: number = 2000
  ): Promise<void> {
    const frameInterval = 100
    const totalFrames = Math.ceil(duration / frameInterval)

    for (let i = 0; i < totalFrames; i++) {
      const spinner = SISYPHUS_SPINNER[i % SISYPHUS_SPINNER.length]
      const toastDuration = Math.min(frameInterval + 50, duration - i * frameInterval)

      if (toastDuration <= 0) break

      if (this.tui?.showToast) {
        try {
          await this.tui.showToast({
            body: {
              title: `${spinner} ${title}`,
              message,
              variant: 'info' as ToastVariant,
              duration: toastDuration
            },
          })
        } catch (err) {
          logger.warn({ err }, 'showSpinnerToast failed')
        }
      }

      if (i < totalFrames - 1) {
        await new Promise((resolve) => setTimeout(resolve, frameInterval))
      }
    }
  }

  private getTitleForVariant(variant: ToastVariant): string {
    const titles: Record<ToastVariant, string> = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Info'
    }
    return titles[variant]
  }
}

export const notificationService = new NotificationService()
export default notificationService
