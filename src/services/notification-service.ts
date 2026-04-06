import { logger } from '../utils/logger.js'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

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

  showToast(message: string, type: ToastType = 'info'): void {
    const title = this.getTitleForType(type)
    
    if (tui?.showToast) {
      try {
        tui.showToast({
          title,
          message,
          variant: type,
          duration: type === 'error' ? 8000 : 5000
        })
        return
      } catch (err) {
        logger.warn({ err }, 'tui.showToast failed')
      }
    }
    
    this.fallbackLog(type, title, message)
  }

  success(message: string): void { this.showToast(message, 'success') }
  error(message: string): void { this.showToast(message, 'error') }
  warning(message: string): void { this.showToast(message, 'warning') }
  info(message: string): void { this.showToast(message, 'info') }

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

export function showToast(message: string, type: ToastType = 'info'): void {
  NotificationService.getInstance().showToast(message, type)
}

export function initializeNotificationService(tuiInstance: any): void {
  NotificationService.getInstance().initialize(tuiInstance)
}
