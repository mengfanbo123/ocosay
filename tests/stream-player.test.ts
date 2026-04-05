import { StreamPlayer } from '../src/core/stream-player'
import { spawn } from 'child_process'
import { createWriteStream } from 'fs'

jest.mock('child_process')
jest.mock('fs')

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>
const mockCreateWriteStream = createWriteStream as jest.MockedFunction<typeof createWriteStream>

describe('StreamPlayer', () => {
  let mockWriteStream: any
  let mockPlayerProcess: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockWriteStream = {
      write: jest.fn().mockReturnValue(true),
      end: jest.fn(),
      destroy: jest.fn(),
      on: jest.fn(),
      once: jest.fn()
    }
    
    mockPlayerProcess = {
      kill: jest.fn(),
      on: jest.fn(),
      stdin: { end: jest.fn() }
    }

    mockCreateWriteStream.mockReturnValue(mockWriteStream as any)
    mockSpawn.mockImplementation(() => mockPlayerProcess as any)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  function createPlayer(options?: any): StreamPlayer {
    return new StreamPlayer(options)
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
    it('should auto-start if not started', () => {
      const player = createPlayer()
      player.write(Buffer.from([1, 2, 3]))
      expect(player.isStarted()).toBe(true)
    })

    it('should ignore write if stopped', () => {
      const player = createPlayer()
      player.start()
      player.stop()
      player.write(Buffer.from([1, 2, 3]))
      expect(player.getBytesWritten()).toBe(0)
    })

    it('should write chunk to stream', () => {
      const player = createPlayer()
      player.write(Buffer.from([1, 2, 3]))
      expect(mockWriteStream.write).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
    })

    it('should increment bytesWritten counter', () => {
      const player = createPlayer()
      player.write(Buffer.from([1, 2, 3]))
      expect(player.getBytesWritten()).toBe(3)
    })

    it('should call onProgress callback', () => {
      const onProgress = jest.fn()
      const player = createPlayer({ events: { onProgress } })
      player.write(Buffer.from([1, 2, 3]))
      expect(onProgress).toHaveBeenCalledWith(3)
    })

    it('should emit progress event', () => {
      const player = createPlayer()
      const progressCallback = jest.fn()
      player.on('progress', progressCallback)
      player.write(Buffer.from([1, 2, 3]))
      expect(progressCallback).toHaveBeenCalledWith(3)
    })
  })

  describe('start', () => {
    it('should set started flag to true', () => {
      const player = createPlayer()
      player.start()
      expect(player.isStarted()).toBe(true)
    })

    it('should not start twice', () => {
      const player = createPlayer()
      player.start()
      player.start()
      expect(mockCreateWriteStream).toHaveBeenCalledTimes(1)
    })

    it('should call onStart callback', () => {
      const onStart = jest.fn()
      const player = createPlayer({ events: { onStart } })
      player.start()
      expect(onStart).toHaveBeenCalled()
    })

    it('should emit start event', () => {
      const player = createPlayer()
      const startCallback = jest.fn()
      player.on('start', startCallback)
      player.start()
      expect(startCallback).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('should set stopped flag to true', () => {
      const player = createPlayer()
      player.start()
      player.stop()
      expect(player.isStopped()).toBe(true)
    })

    it('should kill player process', () => {
      const player = createPlayer()
      player.start()
      player.stop()
      expect(mockPlayerProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should call onStop callback', () => {
      const onStop = jest.fn()
      const player = createPlayer({ events: { onStop } })
      player.start()
      player.stop()
      expect(onStop).toHaveBeenCalled()
    })

    it('should emit stop event', () => {
      const player = createPlayer()
      player.start()
      const stopCallback = jest.fn()
      player.on('stop', stopCallback)
      player.stop()
      expect(stopCallback).toHaveBeenCalled()
    })
  })

  describe('pause', () => {
    it('should set paused flag to true', () => {
      const player = createPlayer()
      player.start()
      player.pause()
      expect(player.isPaused()).toBe(true)
    })

    it('should send SIGSTOP to player process', () => {
      const player = createPlayer()
      player.start()
      player.pause()
      expect(mockPlayerProcess.kill).toHaveBeenCalledWith('SIGSTOP')
    })

    it('should call onPause callback', () => {
      const onPause = jest.fn()
      const player = createPlayer({ events: { onPause } })
      player.start()
      player.pause()
      expect(onPause).toHaveBeenCalled()
    })

    it('should emit pause event', () => {
      const player = createPlayer()
      player.start()
      const pauseCallback = jest.fn()
      player.on('pause', pauseCallback)
      player.pause()
      expect(pauseCallback).toHaveBeenCalled()
    })

    it('should not pause if not started', () => {
      const player = createPlayer()
      player.pause()
      expect(mockPlayerProcess.kill).not.toHaveBeenCalled()
    })

    it('should not pause if already paused', () => {
      const player = createPlayer()
      player.start()
      player.pause()
      player.pause()
      expect(mockPlayerProcess.kill).toHaveBeenCalledTimes(1)
    })
  })

  describe('resume', () => {
    it('should set paused flag to false', () => {
      const player = createPlayer()
      player.start()
      player.pause()
      player.resume()
      expect(player.isPaused()).toBe(false)
    })

    it('should send SIGCONT to player process', () => {
      const player = createPlayer()
      player.start()
      player.pause()
      player.resume()
      expect(mockPlayerProcess.kill).toHaveBeenCalledWith('SIGCONT')
    })

    it('should call onResume callback', () => {
      const onResume = jest.fn()
      const player = createPlayer({ events: { onResume } })
      player.start()
      player.pause()
      player.resume()
      expect(onResume).toHaveBeenCalled()
    })

    it('should emit resume event', () => {
      const player = createPlayer()
      player.start()
      player.pause()
      const resumeCallback = jest.fn()
      player.on('resume', resumeCallback)
      player.resume()
      expect(resumeCallback).toHaveBeenCalled()
    })

    it('should not resume if not paused', () => {
      const player = createPlayer()
      player.start()
      player.resume()
      expect(mockPlayerProcess.kill).not.toHaveBeenCalledWith('SIGCONT')
    })
  })

  describe('end', () => {
    it('should end write stream without stopping player', () => {
      const player = createPlayer()
      player.start()
      player.end()
      expect(mockWriteStream.end).toHaveBeenCalled()
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
    it('should have error handler registered', () => {
      const player = createPlayer()
      player.start()
      expect(mockWriteStream.on).toHaveBeenCalledWith('error', expect.any(Function))
    })
  })
})
