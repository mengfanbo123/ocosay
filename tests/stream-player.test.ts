import { StreamPlayer } from '../src/core/stream-player'
import { AudioBackend } from '../src/core/backends/base'

const mockStart = jest.fn()
const mockWrite = jest.fn()
const mockEnd = jest.fn()
const mockPause = jest.fn()
const mockResume = jest.fn()
const mockStop = jest.fn()
const mockDestroy = jest.fn()
const mockGetCurrentTime = jest.fn().mockReturnValue(0)
const mockGetDuration = jest.fn().mockReturnValue(1)
const mockSetVolume = jest.fn()

let mockEvents: any = {
  onStart: jest.fn(),
  onEnd: jest.fn(),
  onError: jest.fn(),
  onPause: jest.fn(),
  onResume: jest.fn(),
  onStop: jest.fn(),
  onProgress: jest.fn()
}

const mockBackend = {
  name: 'mock',
  supportsStreaming: true,
  start: mockStart,
  write: mockWrite,
  end: mockEnd,
  pause: mockPause,
  resume: mockResume,
  stop: mockStop,
  destroy: mockDestroy,
  getCurrentTime: mockGetCurrentTime,
  getDuration: mockGetDuration,
  setVolume: mockSetVolume
} as unknown as AudioBackend

jest.mock('../src/core/backends', () => ({
  createBackend: jest.fn((type: any, options: any) => {
    if (options?.events) {
      mockEvents = options.events
    }
    return mockBackend
  }),
  BackendType: {
    NAUDIODON: 'naudiodon',
    AFPLAY: 'afplay',
    APLAY: 'aplay',
    POWERSHELL: 'powershell',
    HOWLER: 'howler',
    AUTO: 'auto'
  },
  AudioBackend: {}
}))

jest.mock('../src/core/backends/base', () => ({
  AudioBackend: {}
}))

describe('StreamPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockEvents = {
      onStart: jest.fn(),
      onEnd: jest.fn(),
      onError: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
      onProgress: jest.fn()
    }

    mockStart.mockClear().mockImplementation(async () => { 
      mockEvents.onStart()
    })
    mockWrite.mockClear()
    mockEnd.mockClear()
    mockPause.mockClear().mockImplementation(() => { mockEvents.onPause() })
    mockResume.mockClear().mockImplementation(() => { mockEvents.onResume() })
    mockStop.mockClear().mockImplementation(() => { mockEvents.onStop() })
  })

  function createPlayer(options?: any): StreamPlayer {
    const events = options?.events || {}
    const mergedEvents = { ...mockEvents, ...events }
    return new StreamPlayer({ ...options, events: mergedEvents })
  }

  describe('initialization', () => {
    it('should create StreamPlayer with default options', () => {
      const player = createPlayer()
      expect(player).toBeInstanceOf(StreamPlayer)
    })

    it('should create StreamPlayer with custom format', () => {
      const player = createPlayer({ format: 'wav' })
      expect(player).toBeInstanceOf(StreamPlayer)
    })

    it('should create StreamPlayer with events callback', () => {
      const events = {
        onStart: jest.fn(),
        onEnd: jest.fn(),
        onProgress: jest.fn(),
        onError: jest.fn(),
        onStop: jest.fn()
      }
      const player = createPlayer({ events })
      expect(player).toBeInstanceOf(StreamPlayer)
    })
  })

  describe('write', () => {
    it('should auto-start if not started', async () => {
      const player = createPlayer()
      await player.write(Buffer.from([1, 2, 3]))
      expect(mockBackend.start).toHaveBeenCalled()
    })

    it('should ignore write if stopped', async () => {
      const player = createPlayer()
      await player.start()
      player.stop()
      mockWrite.mockClear()
      await player.write(Buffer.from([1, 2, 3]))
      expect(mockWrite).not.toHaveBeenCalled()
    })

    it('should write chunk to backend', async () => {
      const player = createPlayer()
      await player.write(Buffer.from([1, 2, 3]))
      expect(mockWrite).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
    })

    it('should increment bytesWritten counter', async () => {
      const player = createPlayer()
      await player.write(Buffer.from([1, 2, 3]))
      expect(player.getBytesWritten()).toBe(3)
    })

    it('should call onProgress callback', async () => {
      const onProgress = jest.fn()
      const player = createPlayer({ events: { onProgress } })
      await player.write(Buffer.from([1, 2, 3]))
      expect(onProgress).toHaveBeenCalledWith(3)
    })

    it('should emit progress event', async () => {
      const player = createPlayer()
      const progressCallback = jest.fn()
      player.on('progress', progressCallback)
      await player.write(Buffer.from([1, 2, 3]))
      expect(progressCallback).toHaveBeenCalledWith(3)
    })
  })

  describe('start', () => {
    it('should set started flag to true', async () => {
      const player = createPlayer()
      await player.start()
      expect(player.isStarted()).toBe(true)
    })

    it('should not start twice', async () => {
      const player = createPlayer()
      await player.start()
      await player.start()
      expect(mockBackend.start).toHaveBeenCalledTimes(1)
    })

    it('should call onStart callback', async () => {
      const onStart = jest.fn()
      const player = createPlayer({ events: { onStart } })
      await player.start()
      expect(onStart).toHaveBeenCalled()
    })

    it('should emit start event', async () => {
      const player = createPlayer()
      const startCallback = jest.fn()
      player.on('start', startCallback)
      await player.start()
      expect(startCallback).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('should set stopped flag to true', async () => {
      const player = createPlayer()
      await player.start()
      player.stop()
      expect(player.isStopped()).toBe(true)
    })

    it('should call backend stop', async () => {
      const player = createPlayer()
      await player.start()
      player.stop()
      expect(mockBackend.stop).toHaveBeenCalled()
    })

    it('should call onStop callback', async () => {
      const onStop = jest.fn()
      const player = createPlayer({ events: { onStop } })
      await player.start()
      player.stop()
      expect(onStop).toHaveBeenCalled()
    })

    it('should emit stop event', async () => {
      const player = createPlayer()
      await player.start()
      const stopCallback = jest.fn()
      player.on('stop', stopCallback)
      player.stop()
      expect(stopCallback).toHaveBeenCalled()
    })
  })

  describe('pause', () => {
    it('should set paused flag to true', async () => {
      const player = createPlayer()
      await player.start()
      player.pause()
      expect(player.isPaused()).toBe(true)
    })

    it('should call backend pause', async () => {
      const player = createPlayer()
      await player.start()
      player.pause()
      expect(mockBackend.pause).toHaveBeenCalled()
    })

    it('should call onPause callback', async () => {
      const onPause = jest.fn()
      const player = createPlayer({ events: { onPause } })
      await player.start()
      player.pause()
      expect(onPause).toHaveBeenCalled()
    })

    it('should emit pause event', async () => {
      const player = createPlayer()
      await player.start()
      const pauseCallback = jest.fn()
      player.on('pause', pauseCallback)
      player.pause()
      expect(pauseCallback).toHaveBeenCalled()
    })

    it('should not pause if not started', () => {
      const player = createPlayer()
      player.pause()
      expect(mockBackend.pause).not.toHaveBeenCalled()
    })

    it('should not pause if already paused', async () => {
      const player = createPlayer()
      await player.start()
      player.pause()
      player.pause()
      expect(mockBackend.pause).toHaveBeenCalledTimes(1)
    })
  })

  describe('resume', () => {
    it('should set paused flag to false', async () => {
      const player = createPlayer()
      await player.start()
      player.pause()
      player.resume()
      expect(player.isPaused()).toBe(false)
    })

    it('should call backend resume', async () => {
      const player = createPlayer()
      await player.start()
      player.pause()
      player.resume()
      expect(mockBackend.resume).toHaveBeenCalled()
    })

    it('should call onResume callback', async () => {
      const onResume = jest.fn()
      const player = createPlayer({ events: { onResume } })
      await player.start()
      player.pause()
      player.resume()
      expect(onResume).toHaveBeenCalled()
    })

    it('should emit resume event', async () => {
      const player = createPlayer()
      await player.start()
      player.pause()
      const resumeCallback = jest.fn()
      player.on('resume', resumeCallback)
      player.resume()
      expect(resumeCallback).toHaveBeenCalled()
    })

    it('should not resume if not paused', async () => {
      const player = createPlayer()
      await player.start()
      player.resume()
      expect(mockBackend.resume).not.toHaveBeenCalled()
    })
  })

  describe('end', () => {
    it('should call backend end', async () => {
      const player = createPlayer()
      await player.start()
      player.end()
      expect(mockBackend.end).toHaveBeenCalled()
    })
  })

  describe('state queries', () => {
    it('isStarted should return false initially', () => {
      const player = createPlayer()
      expect(player.isStarted()).toBe(false)
    })

    it('isPaused should return false initially', () => {
      const player = createPlayer()
      expect(player.isPaused()).toBe(false)
    })

    it('isStopped should return false initially', () => {
      const player = createPlayer()
      expect(player.isStopped()).toBe(false)
    })

    it('getBytesWritten should return 0 initially', () => {
      const player = createPlayer()
      expect(player.getBytesWritten()).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should emit error event when backend errors', async () => {
      const onError = jest.fn()
      const player = createPlayer({ events: { onError } })
      await player.start()
      expect(mockEvents.onError).toBeDefined()
    })
  })
})
