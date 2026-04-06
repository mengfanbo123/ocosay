import { notificationService } from '../../src/core/notification'

describe('NotificationService', () => {
  beforeEach(() => {
    ;(notificationService as any).tui = null
    ;(notificationService as any).pendingToasts = []
    ;(notificationService as any).retryTimer = undefined
  })

  it('should queue toast when tui not available', () => {
    const result = notificationService.showToast({
      title: 'Test',
      message: 'Test message'
    })
    expect(result).toBe(false)
    expect((notificationService as any).pendingToasts).toHaveLength(1)
  })

  it('should flush pending toasts when tui becomes available', () => {
    const mockTui = { showToast: jest.fn() }
    notificationService.showToast({ title: 'Test', message: 'Queued' })
    expect((notificationService as any).pendingToasts).toHaveLength(1)
    
    notificationService.setTui(mockTui)
    expect(mockTui.showToast).toHaveBeenCalled()
    expect((notificationService as any).pendingToasts).toHaveLength(0)
  })

  it('should call tui.showToast directly when available', () => {
    const mockTui = { showToast: jest.fn() }
    notificationService.setTui(mockTui)
    
    notificationService.showToast({
      title: 'Test',
      message: 'Direct',
      variant: 'success'
    })
    
    expect(mockTui.showToast).toHaveBeenCalledWith({
      body: {
        title: 'Test',
        message: 'Direct',
        variant: 'success',
        duration: 5000
      }
    })
  })
})
