import { StreamingSynthesizer } from '../src/core/streaming-synthesizer'
import { TTSProvider, TTSError, TTSErrorCode, AudioResult, SpeakOptions, TTSCapabilities } from '../src/core/types'

class MockTTSProvider implements TTSProvider {
  name = 'mock-stream'
  capabilities: TTSCapabilities = { speak: true, stream: true }

  async initialize(): Promise<void> {}
  async destroy(): Promise<void> {}
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async stop(): Promise<void> {}
  async listVoices() { return [] }
  getCapabilities(): TTSCapabilities { return this.capabilities }

  async speak(text: string, options?: SpeakOptions): Promise<AudioResult> {
    if (text === 'error') {
      throw new TTSError('Synthesize error', TTSErrorCode.UNKNOWN, this.name)
    }
    return {
      audioData: Buffer.from([1, 2, 3]),
      format: 'mp3',
      isStream: false,
      duration: 1.0
    }
  }
}

class MockStreamingProvider implements TTSProvider {
  name = 'mock-streaming'
  capabilities: TTSCapabilities = { speak: true, stream: true }

  async initialize(): Promise<void> {}
  async destroy(): Promise<void> {}
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async stop(): Promise<void> {}
  async listVoices() { return [] }
  getCapabilities(): TTSCapabilities { return this.capabilities }

  async speak(text: string, options?: SpeakOptions): Promise<AudioResult> {
    if (text === 'error') {
      throw new TTSError('Synthesize error', TTSErrorCode.UNKNOWN, this.name)
    }
    const chunks = ['chunk1', 'chunk2', 'chunk3']
    const stream = new ReadableStream({
      pull(controller) {
        for (const chunk of chunks) {
          controller.enqueue(Buffer.from(chunk))
        }
        controller.close()
      }
    })
    return {
      audioData: stream,
      format: 'mp3',
      isStream: true,
      duration: 1.0
    }
  }
}

describe('StreamingSynthesizer', () => {
  let synthesizer: StreamingSynthesizer
  let mockProvider: MockTTSProvider
  let mockStreamingProvider: MockStreamingProvider

  beforeEach(() => {
    mockProvider = new MockTTSProvider()
    mockStreamingProvider = new MockStreamingProvider()
  })

  afterEach(() => {
    synthesizer?.reset()
  })

  describe('initialization', () => {
    it('should create synthesizer with options', () => {
      synthesizer = new StreamingSynthesizer({
        provider: mockProvider,
        voice: 'test-voice',
        speed: 1.0,
        volume: 1.0,
        pitch: 1.0
      })
      expect(synthesizer).toBeInstanceOf(StreamingSynthesizer)
    })

    it('should create synthesizer with minimal options', () => {
      synthesizer = new StreamingSynthesizer({
        provider: mockProvider
      })
      expect(synthesizer).toBeInstanceOf(StreamingSynthesizer)
    })
  })

  describe('synthesize', () => {
    it('should call provider.speak with correct options', async () => {
      synthesizer = new StreamingSynthesizer({
        provider: mockProvider,
        voice: 'test-voice',
        speed: 1.5,
        volume: 0.8,
        pitch: 1.2
      })
      const speakSpy = jest.spyOn(mockProvider, 'speak')
      await synthesizer.synthesize('test text')
      expect(speakSpy).toHaveBeenCalledWith('test text', expect.objectContaining({
        model: 'stream',
        voice: 'test-voice',
        speed: 1.5,
        volume: 0.8,
        pitch: 1.2
      }))
    })

    it('should return early for empty text', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockProvider })
      const speakSpy = jest.spyOn(mockProvider, 'speak')
      await synthesizer.synthesize('')
      expect(speakSpy).not.toHaveBeenCalled()
    })

    it('should return early for whitespace-only text', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockProvider })
      const speakSpy = jest.spyOn(mockProvider, 'speak')
      await synthesizer.synthesize('   ')
      expect(speakSpy).not.toHaveBeenCalled()
    })

    it('should emit done event on success', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockProvider })
      const doneCallback = jest.fn()
      synthesizer.on('done', doneCallback)
      await synthesizer.synthesize('test text')
      expect(doneCallback).toHaveBeenCalledTimes(1)
    })

    it('should emit error event on provider error', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockProvider })
      const errorCallback = jest.fn()
      synthesizer.on('error', errorCallback)
      await synthesizer.synthesize('error')
      expect(errorCallback).toHaveBeenCalledTimes(1)
    })

    it('should accumulate audio chunks', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockProvider })
      const chunkCallback = jest.fn()
      synthesizer.on('chunk', chunkCallback)
      await synthesizer.synthesize('test text')
      expect(chunkCallback).toHaveBeenCalled()
      expect(synthesizer.getAudioChunks().length).toBeGreaterThan(0)
    })
  })

  describe('processAudioResult with Buffer', () => {
    it('should emit chunk for Buffer audioData', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockProvider })
      const chunkCallback = jest.fn()
      synthesizer.on('chunk', chunkCallback)
      await synthesizer.synthesize('test text')
      expect(chunkCallback).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
    })
  })

  describe('processAudioResult with ReadableStream', () => {
    it('should emit multiple chunks for stream audioData', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockStreamingProvider })
      const chunks: Buffer[] = []
      synthesizer.on('chunk', (chunk: Buffer) => chunks.push(chunk))
      await synthesizer.synthesize('test text')
      expect(chunks.length).toBe(3)
      expect(chunks[0].toString()).toBe('chunk1')
      expect(chunks[1].toString()).toBe('chunk2')
      expect(chunks[2].toString()).toBe('chunk3')
    })
  })

  describe('reset', () => {
    it('should clear accumulated audio chunks', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockProvider })
      await synthesizer.synthesize('test text')
      expect(synthesizer.getAudioChunks().length).toBeGreaterThan(0)
      synthesizer.reset()
      expect(synthesizer.getAudioChunks()).toEqual([])
    })
  })

  describe('getAudioChunks', () => {
    it('should return copy of chunks array', async () => {
      synthesizer = new StreamingSynthesizer({ provider: mockProvider })
      await synthesizer.synthesize('test text')
      const chunks1 = synthesizer.getAudioChunks()
      const chunks2 = synthesizer.getAudioChunks()
      expect(chunks1).toEqual(chunks2)
      chunks1.push(Buffer.from([99]))
      expect(chunks2.length).toBe(synthesizer.getAudioChunks().length)
    })
  })

  describe('error handling', () => {
    it('should wrap non-TTSError in TTSError', async () => {
      class ErrorProvider implements TTSProvider {
        name = 'error-provider'
        capabilities: TTSCapabilities = { speak: true }
        async initialize() {}
        async destroy() {}
        async speak(): Promise<AudioResult> { throw new Error('Raw error') }
        async pause() {}
        async resume() {}
        async stop() {}
        async listVoices() { return [] }
        getCapabilities(): TTSCapabilities { return this.capabilities }
      }
      synthesizer = new StreamingSynthesizer({ provider: new ErrorProvider() })
      const errorCallback = jest.fn()
      synthesizer.on('error', errorCallback)
      await synthesizer.synthesize('test')
      expect(errorCallback).toHaveBeenCalledWith(expect.objectContaining({
        name: 'TTSError'
      }))
    })
  })
})
