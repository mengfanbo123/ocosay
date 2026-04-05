import { Speaker } from '../src/core/speaker'
import { TTSCapabilities } from '../src/core/types'
import { registerProvider, unregisterProvider, BaseTTSProvider } from '../src/providers/base'
import { initialize, destroy, isAutoReadEnabled, getStreamReader } from '../src/index'

class MockProvider extends BaseTTSProvider {
  name = 'mock'
  capabilities: TTSCapabilities = { speak: true, stream: true }
  private shouldThrow = false
  private destroyCalled = false

  protected async doSpeak(text: string, voice: string | undefined, model: any) {
    if (this.shouldThrow) {
      throw new Error('Mock synthesize error')
    }
    return {
      audioData: Buffer.from([1, 2, 3]),
      format: 'mp3',
      isStream: model === 'stream',
      duration: 1.0
    }
  }

  async destroy(): Promise<void> {
    this.destroyCalled = true
  }

  setShouldThrow(throwError: boolean): void {
    this.shouldThrow = throwError
  }

  wasDestroyCalled(): boolean {
    return this.destroyCalled
  }

  reset(): void {
    this.shouldThrow = false
    this.destroyCalled = false
  }
}

describe('P1 Fixes', () => {
  let mockProvider: MockProvider

  beforeEach(() => {
    mockProvider = new MockProvider()
    registerProvider('mock', mockProvider)
  })

  afterEach(async () => {
    try {
      await destroy()
    } catch (e) {
      // ignore destroy errors in cleanup
    }
    unregisterProvider('mock')
    mockProvider.reset()
  })

  describe('P1-3: Speaker.destroy() 方法', () => {
    it('should cleanup player when destroy() is called', async () => {
      const speaker = new Speaker({ defaultProvider: 'mock' })
      
      await speaker.destroy()
      
      expect((speaker as any).player).toBeUndefined()
    })

    it('should reset isSpeaking and isPaused when destroy() is called', async () => {
      const speaker = new Speaker({ defaultProvider: 'mock' })
      
      expect(speaker.isPlaying()).toBe(false)
      expect(speaker.isPausedState()).toBe(false)
      
      await speaker.destroy()
      
      expect(speaker.isPlaying()).toBe(false)
      expect(speaker.isPausedState()).toBe(false)
    })

    it('should cleanup currentProvider and currentText', async () => {
      const speaker = new Speaker({ defaultProvider: 'mock' })
      
      await speaker.destroy()
      
      expect((speaker as any).currentProvider).toBeUndefined()
      expect((speaker as any).currentText).toBeUndefined()
    })
  })

  describe('P1-4: destroy() 调用 provider.destroy()', () => {
    it('should call provider.destroy() when global destroy() is called', async () => {
      await initialize({
        defaultProvider: 'mock',
        autoRead: false
      })

      expect(mockProvider.wasDestroyCalled()).toBe(false)

      await destroy()

      expect(mockProvider.wasDestroyCalled()).toBe(true)
    })
  })

  describe('P1-1: destroy() 重置 autoReadEnabled', () => {
    it('should reset autoReadEnabled to false after destroy()', async () => {
      expect(isAutoReadEnabled()).toBe(false)

      await initialize({
        defaultProvider: 'mock',
        autoRead: true
      })

      expect(isAutoReadEnabled()).toBe(true)

      await destroy()

      expect(isAutoReadEnabled()).toBe(false)
    })

    it('should correctly check autoReadEnabled state', async () => {
      await initialize({
        defaultProvider: 'mock',
        autoRead: false
      })
      expect(isAutoReadEnabled()).toBe(false)
      await destroy()

      await initialize({
        defaultProvider: 'mock',
        autoRead: true
      })
      expect(isAutoReadEnabled()).toBe(true)
      await destroy()
      expect(isAutoReadEnabled()).toBe(false)
    })
  })

  describe('P1-2: processQueue() 错误处理', () => {
    it('should not throw when provider synthesize throws', async () => {
      await initialize({
        defaultProvider: 'mock',
        autoRead: true
      })

      const streamReader = getStreamReader()
      expect(streamReader).toBeDefined()

      mockProvider.setShouldThrow(true)
      
      streamReader!.handleDelta('session1', 'msg1', 'part1', 'Error sentence')
      streamReader!.handleEnd()

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(() => streamReader!.handleDelta('session2', 'msg2', 'part2', 'Normal sentence')).not.toThrow()
    })
  })
})
