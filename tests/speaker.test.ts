import { Speaker, getDefaultSpeaker, speak, stop, pause, resume, listVoices } from '../src/core/speaker'
import { TTSError, TTSErrorCode, TTSCapabilities, Voice } from '../src/core/types'
import { registerProvider, unregisterProvider, BaseTTSProvider } from '../src/providers/base'
import { AudioPlayer } from '../src/core/player'

jest.mock('../src/core/player')

const MockAudioPlayer = AudioPlayer as jest.MockedClass<typeof AudioPlayer>

class MockProvider extends BaseTTSProvider {
  name = 'mock'
  capabilities: TTSCapabilities = { speak: true, stream: true }
  
  protected async doSpeak(text: string, voice: string | undefined, model: any) {
    if (text === 'error') {
      throw new TTSError('Provider error', TTSErrorCode.UNKNOWN, this.name)
    }
    return {
      audioData: Buffer.from([1, 2, 3]),
      format: 'mp3',
      isStream: model === 'stream',
      duration: 1.0
    }
  }

  async listVoices(): Promise<Voice[]> {
    return [
      { id: 'voice1', name: 'Voice 1', language: 'zh-CN' },
      { id: 'voice2', name: 'Voice 2', language: 'en-US', gender: 'male' as const }
    ]
  }
}

describe('Speaker', () => {
  let speaker: Speaker
  let mockPlayer: any
  let capturedEvents: any

  beforeEach(() => {
    jest.clearAllMocks()
    registerProvider('mock', new MockProvider())
    
    capturedEvents = {}
    mockPlayer = {
      play: jest.fn().mockImplementation(() => {
        capturedEvents.onStart?.()
        return Promise.resolve()
      }),
      pause: jest.fn().mockImplementation(() => { capturedEvents.onPause?.() }),
      resume: jest.fn().mockImplementation(() => { capturedEvents.onResume?.() }),
      stop: jest.fn().mockImplementation(() => {
        capturedEvents.onStop?.()
        return Promise.resolve()
      })
    }
    MockAudioPlayer.mockImplementation((events?: any) => {
      Object.assign(capturedEvents, events)
      return mockPlayer
    })
    
    speaker = new Speaker({ defaultProvider: 'mock', defaultModel: 'stream' })
  })

  afterEach(() => {
    unregisterProvider('mock')
  })

  describe('initialization', () => {
    it('should create speaker with options', () => {
      const s = new Speaker({ defaultProvider: 'mock', defaultModel: 'sync' })
      expect(s.getProviders()).toContain('mock')
    })

    it('should create speaker with all options', () => {
      const s = new Speaker({
        defaultProvider: 'mock',
        defaultModel: 'stream',
        defaultVoice: 'voice1',
        onEvent: jest.fn()
      })
      expect(s.getProviders()).toContain('mock')
    })
  })

  describe('speak', () => {
    it('should throw on empty text', async () => {
      await expect(speaker.speak('')).rejects.toThrow(TTSError)
    })

    it('should throw on whitespace-only text', async () => {
      await expect(speaker.speak('   ')).rejects.toThrow(TTSError)
    })

    it('should stop current playback before new speak', async () => {
      await speaker.speak('First')
      await speaker.speak('Second')
      expect(mockPlayer.stop).toHaveBeenCalled()
    })

    it('should play audio data', async () => {
      await speaker.speak('Hello')
      expect(mockPlayer.play).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), 'mp3')
    })

    it('should throw on provider error', async () => {
      await expect(speaker.speak('error')).rejects.toThrow()
    })

    it('should throw when provider not found', async () => {
      await expect(speaker.speak('Hello', { provider: 'non-existent' })).rejects.toThrow()
    })
  })

  describe('control methods', () => {
    it('should pause without error', () => {
      expect(() => speaker.pause()).not.toThrow()
    })

    it('should resume without error', () => {
      expect(() => speaker.resume()).not.toThrow()
    })

    it('should stop without error', async () => {
      await expect(speaker.stop()).resolves.toBeUndefined()
    })
  })

  describe('listVoices', () => {
    it('should return voices from provider', async () => {
      const voices = await speaker.listVoices('mock')
      expect(Array.isArray(voices)).toBe(true)
      expect(voices.length).toBe(2)
    })

    it('should use default provider when none specified', async () => {
      const voices = await speaker.listVoices()
      expect(Array.isArray(voices)).toBe(true)
    })
  })

  describe('getCapabilities', () => {
    it('should return provider capabilities', () => {
      const caps = speaker.getCapabilities('mock')
      expect(caps.speak).toBe(true)
    })

    it('should use default provider when none specified', () => {
      const caps = speaker.getCapabilities()
      expect(caps.speak).toBe(true)
    })
  })

  describe('getProviders', () => {
    it('should return list of registered providers', () => {
      const providers = speaker.getProviders()
      expect(providers).toContain('mock')
    })
  })

  describe('isPlaying', () => {
    it('should return false initially', () => {
      expect(speaker.isPlaying()).toBe(false)
    })

    it('should return true while speaking', async () => {
      const speakPromise = speaker.speak('Hello')
      expect(speaker.isPlaying()).toBe(true)
      await speakPromise
    })

    it('should return false after stop', async () => {
      await speaker.speak('Hello')
      await speaker.stop()
      expect(speaker.isPlaying()).toBe(false)
    })
  })

  describe('isPausedState', () => {
    it('should return false initially', () => {
      expect(speaker.isPausedState()).toBe(false)
    })
  })

  describe('destroy', () => {
    it('should stop player on destroy', async () => {
      await speaker.destroy()
      expect(mockPlayer.stop).toHaveBeenCalled()
    })

    it('should set isSpeaking to false', async () => {
      await speaker.speak('Hello')
      await speaker.destroy()
      expect(speaker.isPlaying()).toBe(false)
    })

    it('should be callable multiple times', async () => {
      await speaker.destroy()
      await expect(speaker.destroy()).resolves.not.toThrow()
    })
  })

  describe('events', () => {
    it('should emit start event', async () => {
      const startCallback = jest.fn()
      speaker.on('start', startCallback)
      await speaker.speak('Hello')
      expect(startCallback).toHaveBeenCalled()
    })

    it('should emit stop event on stop', async () => {
      const stopCallback = jest.fn()
      speaker.on('stop', stopCallback)
      await speaker.stop()
      expect(stopCallback).toHaveBeenCalled()
    })
  })
})

describe('getDefaultSpeaker', () => {
  beforeEach(() => {
    registerProvider('mock', new MockProvider())
  })

  afterEach(() => {
    unregisterProvider('mock')
  })

  it('should return a Speaker instance', () => {
    const speaker = getDefaultSpeaker()
    expect(speaker).toBeInstanceOf(Speaker)
  })
})
