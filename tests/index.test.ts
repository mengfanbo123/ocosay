import { pluginInfo, toolNames, initialize, destroy, isStreamEnabled, getStreamReader } from '../src/index'
import { registerProvider, unregisterProvider, BaseTTSProvider } from '../src/providers/base'
import { TTSCapabilities } from '../src/core/types'

class MockProvider extends BaseTTSProvider {
  name = 'mock'
  capabilities: TTSCapabilities = { speak: true, stream: true }

  protected async doSpeak(text: string, voice: string | undefined, model: any) {
    return {
      audioData: Buffer.from([1, 2, 3]),
      format: 'mp3',
      isStream: model === 'stream',
      duration: 1.0
    }
  }
}

describe('index module exports', () => {
  describe('pluginInfo', () => {
    it('should export correct plugin info', () => {
      expect(pluginInfo.name).toBe('ocosay')
      expect(pluginInfo.version).toBe('1.0.0')
      expect(pluginInfo.description).toContain('TTS')
    })
  })

  describe('toolNames', () => {
    it('should export array of tool names', () => {
      expect(Array.isArray(toolNames)).toBe(true)
      expect(toolNames.length).toBeGreaterThan(0)
    })

    it('should include tts_speak', () => {
      expect(toolNames).toContain('tts_speak')
    })

    it('should include tts_stop', () => {
      expect(toolNames).toContain('tts_stop')
    })

    it('should include tts_stream_speak', () => {
      expect(toolNames).toContain('tts_stream_speak')
    })
  })
})

describe('TuiEventBus integration', () => {
  const originalGlobal = global as any
  let mockProvider: MockProvider

  beforeEach(() => {
    mockProvider = new MockProvider()
    registerProvider('mock', mockProvider)
  })

  afterEach(async () => {
    delete originalGlobal.__opencode_tuieventbus__
    await destroy()
    unregisterProvider('mock')
  })

  describe('P1-1: eventBus available', () => {
    it('should subscribe to message.part.delta and message.part.end events', async () => {
      const mockOn = jest.fn()
      const mockOff = jest.fn()
      const MockTuiEventBus = jest.fn().mockImplementation(() => ({
        on: mockOn,
        off: mockOff
      }))
      originalGlobal.__opencode_tuieventbus__ = MockTuiEventBus

      await initialize({
        autoRead: true,
        defaultProvider: 'mock'
      })

      expect(mockOn).toHaveBeenCalledWith('message.part.delta', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('message.part.end', expect.any(Function))
    })

    it('should handle delta events via streamReader', async () => {
      const mockOn = jest.fn()
      const mockOff = jest.fn()
      let deltaHandler: Function | undefined
      
      mockOn.mockImplementation((event: string, handler: Function) => {
        if (event === 'message.part.delta') {
          deltaHandler = handler
        }
      })
      
      const MockTuiEventBus = jest.fn().mockImplementation(() => ({
        on: mockOn,
        off: mockOff
      }))
      originalGlobal.__opencode_tuieventbus__ = MockTuiEventBus

      await initialize({
        autoRead: true,
        defaultProvider: 'mock'
      })

      const mockEvent = {
        sessionId: 'session-1',
        messageId: 'msg-1',
        partId: 'part-1',
        properties: { delta: 'Hello' }
      }
      
      expect(deltaHandler).toBeDefined()
      deltaHandler!(mockEvent)
    })
  })

  describe('P1-1: eventBus unavailable (graceful fallback)', () => {
    it('should not throw when eventBus is not available', async () => {
      delete originalGlobal.__opencode_tuieventbus__

      await expect(initialize({
        autoRead: true,
        defaultProvider: 'mock'
      })).resolves.not.toThrow()
    })

    it('should have stream components initialized even without eventBus', async () => {
      delete originalGlobal.__opencode_tuieventbus__

      await initialize({
        autoRead: true,
        defaultProvider: 'mock'
      })

      expect(isStreamEnabled()).toBe(true)
      expect(getStreamReader()).toBeDefined()
    })
  })
})

describe('initialize() idempotency', () => {
  let mockProvider: MockProvider

  beforeEach(() => {
    mockProvider = new MockProvider()
    registerProvider('mock', mockProvider)
  })

  afterEach(async () => {
    await destroy()
    unregisterProvider('mock')
  })

  describe('P1-2: repeated initialize() calls', () => {
    it('should be safe to call initialize() multiple times', async () => {
      await initialize({
        defaultProvider: 'mock'
      })

      await expect(initialize({
        defaultProvider: 'mock'
      })).resolves.not.toThrow()

      await expect(initialize({
        defaultProvider: 'mock'
      })).resolves.not.toThrow()
    })

    it('should not re-initialize components on repeated calls', async () => {
      await initialize({
        autoRead: true,
        defaultProvider: 'mock'
      })

      const firstStreamReader = getStreamReader()
      expect(firstStreamReader).toBeDefined()

      await initialize({
        defaultProvider: 'mock'
      })

      const secondStreamReader = getStreamReader()
      expect(secondStreamReader).toBe(firstStreamReader)
    })

    it('should return early if already initialized', async () => {
      const spyInitialize = jest.spyOn(mockProvider, 'initialize')

      await initialize({
        defaultProvider: 'mock'
      })

      spyInitialize.mockClear()

      await initialize({
        defaultProvider: 'mock'
      })

      expect(spyInitialize).not.toHaveBeenCalled()
    })
  })
})
