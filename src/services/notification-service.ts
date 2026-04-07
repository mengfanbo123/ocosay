import { logger } from '../utils/logger.js'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ShowToastOptions {
  title?: string
  message: string
  variant?: ToastType
  duration?: number
}

const SISYPHUS_SPINNER = ['·', '•', '●', '○', '◌', '◦', ' ']

let instance: NotificationService | undefined
let tui: any = null
let initialized = false

export class NotificationService {
  private constructor() {}

  static getInstance(): NotificationService {
    if (!instance) {
      instance = new NotificationService()
    }
    return instance
  }

  initialize(tuiInstance: any): void {
    if (initialized) return
    tui = tuiInstance
    initialized = true
    logger.debug('NotificationService initialized')
  }

  isReady(): boolean {
    return initialized && tui !== null
  }

  showToast(options: ShowToastOptions): void
  showToast(message: string, type?: ToastType): void
  showToast(options: ShowToastOptions | string, type?: ToastType): void {
    let title: string
    let message: string
    let variant: ToastType
    let duration: number | undefined

    if (typeof options === 'string') {
      message = options
      variant = type || 'info'
      title = this.getTitleForType(variant)
      duration = variant === 'error' ? 8000 : 5000
    } else {
      message = options.message
      variant = options.variant || 'info'
      title = options.title || this.getTitleForType(variant)
      duration = options.duration || (variant === 'error' ? 8000 : 5000)
    }

    if (tui?.showToast) {
      try {
        tui.showToast({
          title,
          message,
          variant,
          duration
        })
        return
      } catch (err) {
        logger.warn({ err }, 'tui.showToast failed')
      }
    }

    this.fallbackLog(variant, title, message)
  }

  success(message: string, duration?: number): void {
    this.showToast({ message, variant: 'success', duration })
  }
  error(message: string, duration?: number): void {
    this.showToast({ message, variant: 'error', duration: duration || 8000 })
  }
  warning(message: string, duration?: number): void {
    this.showToast({ message, variant: 'warning', duration })
  }
  info(message: string, duration?: number): void {
    this.showToast({ message, variant: 'info', duration })
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

      if (tui?.showToast) {
        try {
          await tui.showToast({
            title: `${spinner} ${title}`,
            message,
            variant: 'info' as ToastType,
            duration: toastDuration
          })
        } catch (err) {
          logger.warn({ err }, 'tui.showSpinnerToast failed')
        }
      }

      if (i < totalFrames - 1) {
        await new Promise((resolve) => setTimeout(resolve, frameInterval))
      }
    }
  }

  private getTitleForType(type: ToastType): string {
    const titles: Record<ToastType, string> = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Info'
    }
    return titles[type]
  }

  private fallbackLog(type: ToastType, title: string, message: string): void {
    const timestamp = new Date().toISOString()
    switch (type) {
      case 'error':
        logger.error({ title, message, timestamp }, 'Toast (fallback)')
        break
      case 'warning':
        logger.warn({ title, message, timestamp }, 'Toast (fallback)')
        break
      default:
        logger.info({ title, message, timestamp }, 'Toast (fallback)')
    }
  }
}

export function showToast(options: ShowToastOptions): void
export function showToast(message: string, type?: ToastType): void
export function showToast(options: ShowToastOptions | string, type?: ToastType): void {
  NotificationService.getInstance().showToast(options as any, type)
}

export function initializeNotificationService(tuiInstance: any): void {
  NotificationService.getInstance().initialize(tuiInstance)
}
