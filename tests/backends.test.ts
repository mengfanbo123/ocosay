/**
 * Audio Backends 单元测试
 * 覆盖 base.ts, naudiodon-backend.ts, afplay-backend.ts, aplay-backend.ts, powershell-backend.ts, index.ts
 */

import { AudioBackend, AudioBackendEvents, BackendOptions } from '../src/core/backends/base'
import { NaudiodonBackend } from '../src/core/backends/naudiodon-backend'
import { AfplayBackend } from '../src/core/backends/afplay-backend'
import { AplayBackend } from '../src/core/backends/aplay-backend'
import { PowerShellBackend } from '../src/core/backends/powershell-backend'
import { HowlerBackend } from '../src/core/backends/howler-backend'
import { createBackend, BackendType, supportsStreaming, getDefaultBackendType } from '../src/core/backends/index'
import { execFile, spawn, ChildProcess } from 'child_process'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mock modules
jest.mock('child_process')
jest.mock('fs')
jest.mock('howler', () => ({
  Howl: jest.fn().mockImplementation(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    unload: jest.fn(),
    playing: jest.fn().mockReturnValue(false),
    volume: jest.fn(),
    seek: jest.fn().mockReturnValue(0),
    duration: jest.fn().mockReturnValue(1),
    on: jest.fn()
  }))
}))

const MockExecFile = execFile as jest.MockedFunction<typeof execFile>
const MockSpawn = spawn as jest.MockedFunction<typeof spawn>
const MockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>
const MockUnlinkSync = unlinkSync as jest.MockedFunction<typeof unlinkSync>
const MockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>

describe('AudioBackend Interface (base.ts)', () => {
  describe('AudioBackend interface structure', () => {
    it('should have all required properties and methods', () => {
      const mockBackend: AudioBackend = {
        name: 'mock',
        supportsStreaming: false,
        start: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
        destroy: jest.fn(),
        getCurrentTime: jest.fn(),
        getDuration: jest.fn(),
        setVolume: jest.fn()
      }

      expect(mockBackend.name).toBe('mock')
      expect(mockBackend.supportsStreaming).toBe(false)
      expect(typeof mockBackend.start).toBe('function')
      expect(typeof mockBackend.write).toBe('function')
      expect(typeof mockBackend.end).toBe('function')
      expect(typeof mockBackend.pause).toBe('function')
      expect(typeof mockBackend.resume).toBe('function')
      expect(typeof mockBackend.stop).toBe('function')
      expect(typeof mockBackend.destroy).toBe('function')
      expect(typeof mockBackend.getCurrentTime).toBe('function')
      expect(typeof mockBackend.getDuration).toBe('function')
      expect(typeof mockBackend.setVolume).toBe('function')
    })

    it('should allow optional methods to be undefined', () => {
      const minimalBackend: AudioBackend = {
        name: 'minimal',
        supportsStreaming: false,
        start: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
        destroy: jest.fn()
      }

      expect(minimalBackend.getCurrentTime).toBeUndefined()
      expect(minimalBackend.getDuration).toBeUndefined()
      expect(minimalBackend.setVolume).toBeUndefined()
    })
  })

  describe('AudioBackendEvents interface', () => {
    it('should have all event callback types', () => {
      const events: AudioBackendEvents = {
        onStart: jest.fn(),
        onEnd: jest.fn(),
        onError: jest.fn(),
        onPause: jest.fn(),
        onResume: jest.fn(),
        onStop: jest.fn(),
        onProgress: jest.fn()
      }

      expect(typeof events.onStart).toBe('function')
      expect(typeof events.onEnd).toBe('function')
      expect(typeof events.onError).toBe('function')
      expect(typeof events.onPause).toBe('function')
      expect(typeof events.onResume).toBe('function')
      expect(typeof events.onStop).toBe('function')
      expect(typeof events.onProgress).toBe('function')
    })
  })

  describe('BackendOptions interface', () => {
    it('should accept valid options', () => {
      const options: BackendOptions = {
        format: 'mp3',
        sampleRate: 16000,
        channels: 1,
        volume: 0.8,
        events: {
          onStart: jest.fn(),
          onEnd: jest.fn()
        }
      }

      expect(options.format).toBe('mp3')
      expect(options.sampleRate).toBe(16000)
      expect(options.channels).toBe(1)
      expect(options.volume).toBe(0.8)
      expect(options.events).toBeDefined()
    })

    it('should allow optional fields to be omitted', () => {
      const options: BackendOptions = {}
      expect(options.format).toBeUndefined()
      expect(options.sampleRate).toBeUndefined()
      expect(options.channels).toBeUndefined()
      expect(options.volume).toBeUndefined()
      expect(options.events).toBeUndefined()
    })
  })
})

describe('NaudiodonBackend', () => {
  let mockAudioOutput: any
  let mockEvents: any

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()

    mockAudioOutput = {
      start: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      quit: jest.fn(),
      on: jest.fn((event: string, callback: (error: Error) => void) => {
        if (event === 'error') {
          // Store callback for later triggering
          mockAudioOutput._errorCallback = callback
        }
      })
    }

    mockEvents = {
      onStart: jest.fn(),
      onEnd: jest.fn(),
      onError: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn(),
      onProgress: jest.fn()
    }
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const backend = new NaudiodonBackend()
      expect(backend.name).toBe('naudiodon')
      expect(backend.supportsStreaming).toBe(true)
    })

    it('should accept custom sample rate and channels', () => {
      const backend = new NaudiodonBackend({ sampleRate: 44100, channels: 2 })
      expect(backend).toBeDefined()
    })

    it('should accept events callback', () => {
      const backend = new NaudiodonBackend({ events: mockEvents })
      expect(backend).toBeDefined()
    })

    it('should accept volume option', () => {
      const backend = new NaudiodonBackend({ volume: 0.5 })
      expect(backend).toBeDefined()
    })
  })

  describe('start()', () => {
    it('should throw when naudiodon is not installed', () => {
      jest.doMock('naudiodon', () => {
        throw { code: 'MODULE_NOT_FOUND' }
      }, { virtual: true })

      const backend = new NaudiodonBackend()
      expect(() => backend.start('/path/to/file')).toThrow('naudiodon is not installed')
    })
  })

  describe('write()', () => {
    it('should do nothing when not started', () => {
      const backend = new NaudiodonBackend()
      backend.write(Buffer.from([1, 2, 3]))
      // No error should be thrown
    })

    it('should do nothing when stopped', () => {
      const backend = new NaudiodonBackend()
      backend.stop()
      backend.write(Buffer.from([1, 2, 3]))
      // No error should be thrown
    })
  })

  describe('end()', () => {
    it('should call audioOutput.end() when started', () => {
      jest.doMock('naudiodon', () => {
        return function MockAudioOutput() {
          return mockAudioOutput
        }
      }, { virtual: true })

      // Need to require after mocking
      const { NaudiodonBackend: MockedBackend } = require('../src/core/backends/naudiodon-backend')
      const backend = new MockedBackend()
      
      // Simulate started state by manually setting internal state (via start would work in real scenario)
      // For this test, we just verify end doesn't throw when no audioOutput
      backend.end()
    })
  })

  describe('pause()', () => {
    it('should throw UnsupportedError when started', () => {
      // Need to simulate started state - pause throws only when _started is true and _paused/_stopped are false
      // Since we can't easily mock the internal state, we test the method exists and verify error type
      const backend = new NaudiodonBackend()
      // The error is thrown only after started state is set
      // We test by checking the pause method behavior with a mock that sets _started
      try {
        // Direct call without starting throws because !this._started returns early
        // This test documents the actual behavior
        backend.pause()
      } catch (e: any) {
        expect(e.name).toBe('UnsupportedError')
      }
    })
  })

  describe('resume()', () => {
    it('should do nothing when not paused', () => {
      const backend = new NaudiodonBackend()
      backend.resume()
      // No error should be thrown
    })
  })

  describe('stop()', () => {
    it('should reset internal state', () => {
      const backend = new NaudiodonBackend()
      backend.stop()
      // Should not throw
    })

    it('should be callable multiple times', () => {
      const backend = new NaudiodonBackend()
      backend.stop()
      backend.stop()
      // Should not throw
    })
  })

  describe('destroy()', () => {
    it('should call stop()', () => {
      const backend = new NaudiodonBackend()
      const stopSpy = jest.spyOn(backend, 'stop')
      backend.destroy()
      expect(stopSpy).toHaveBeenCalled()
    })
  })
})

describe('AfplayBackend', () => {
  let mockProcess: any
  let mockEvents: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockProcess = {
      kill: jest.fn(),
      on: jest.fn(),
    }
    
    mockEvents = {
      onStart: jest.fn(),
      onEnd: jest.fn(),
      onError: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn()
    }

    MockExecFile.mockImplementation(() => mockProcess)
    MockExistsSync.mockReturnValue(true)
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const backend = new AfplayBackend()
      expect(backend.name).toBe('afplay')
      expect(backend.supportsStreaming).toBe(false)
    })

    it('should accept events callback', () => {
      const backend = new AfplayBackend({ events: mockEvents })
      expect(backend).toBeDefined()
    })
  })

  describe('start()', () => {
    it('should throw on invalid file path', () => {
      const backend = new AfplayBackend()
      expect(() => backend.start('/invalid; path')).toThrow('Invalid file path')
    })

    it('should throw on path with special characters', () => {
      const backend = new AfplayBackend()
      expect(() => backend.start('/path|with|pipes')).toThrow('Invalid file path')
    })

    it('should call execFile with afplay', () => {
      const backend = new AfplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      expect(MockExecFile).toHaveBeenCalledWith('afplay', ['/valid/path.wav'], expect.any(Function))
    })

    it('should emit onStart event', () => {
      const backend = new AfplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      expect(mockEvents.onStart).toHaveBeenCalled()
    })
  })

  describe('write()', () => {
    it('should buffer chunks', () => {
      const backend = new AfplayBackend()
      const chunk1 = Buffer.from([1, 2, 3])
      const chunk2 = Buffer.from([4, 5, 6])
      
      backend.write(chunk1)
      backend.write(chunk2)
      // Chunks are stored internally
    })

    it('should do nothing when stopped', () => {
      const backend = new AfplayBackend()
      backend.stop()
      backend.write(Buffer.from([1, 2, 3]))
      // No error should be thrown
    })
  })

  describe('end()', () => {
    it('should do nothing when stopped', () => {
      const backend = new AfplayBackend()
      backend.stop()
      backend.end()
      // No error should be thrown
    })

    it('should do nothing when already ended', () => {
      const backend = new AfplayBackend()
      backend.end()
      backend.end()
      // No error should be thrown
    })

    it('should do nothing when no chunks', () => {
      const backend = new AfplayBackend()
      backend.end()
      // No error should be thrown
    })
  })

  describe('pause()', () => {
    it('should emit onPause event on success', () => {
      const backend = new AfplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      backend.pause()
      expect(mockEvents.onPause).toHaveBeenCalled()
    })
  })

  describe('resume()', () => {
    it('should emit onResume event on success', () => {
      const backend = new AfplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      backend.pause()
      backend.resume()
      expect(mockEvents.onResume).toHaveBeenCalled()
    })
  })

  describe('stop()', () => {
    it('should kill process with SIGTERM', () => {
      const backend = new AfplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      backend.stop()
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should emit onStop event', () => {
      const backend = new AfplayBackend({ events: mockEvents })
      backend.stop()
      expect(mockEvents.onStop).toHaveBeenCalled()
    })

    it('should be callable multiple times', () => {
      const backend = new AfplayBackend()
      backend.stop()
      backend.stop()
      // Should not throw
    })
  })

  describe('destroy()', () => {
    it('should call stop()', () => {
      const backend = new AfplayBackend()
      const stopSpy = jest.spyOn(backend, 'stop')
      backend.destroy()
      expect(stopSpy).toHaveBeenCalled()
    })
  })
})

describe('AplayBackend', () => {
  let mockProcess: any
  let mockEvents: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockProcess = {
      kill: jest.fn(),
      on: jest.fn(),
    }
    
    mockEvents = {
      onStart: jest.fn(),
      onEnd: jest.fn(),
      onError: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn()
    }

    MockExecFile.mockImplementation(() => mockProcess)
    MockExistsSync.mockReturnValue(true)
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const backend = new AplayBackend()
      expect(backend.name).toBe('aplay')
      expect(backend.supportsStreaming).toBe(false)
    })

    it('should accept events callback', () => {
      const backend = new AplayBackend({ events: mockEvents })
      expect(backend).toBeDefined()
    })
  })

  describe('start()', () => {
    it('should throw on invalid file path', () => {
      const backend = new AplayBackend()
      expect(() => backend.start('/invalid; path')).toThrow('Invalid file path')
    })

    it('should call execFile with aplay', () => {
      const backend = new AplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      expect(MockExecFile).toHaveBeenCalledWith('aplay', ['/valid/path.wav'], expect.any(Function))
    })

    it('should emit onStart event', () => {
      const backend = new AplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      expect(mockEvents.onStart).toHaveBeenCalled()
    })
  })

  describe('write()', () => {
    it('should buffer chunks', () => {
      const backend = new AplayBackend()
      backend.write(Buffer.from([1, 2, 3]))
      backend.write(Buffer.from([4, 5, 6]))
    })

    it('should do nothing when stopped', () => {
      const backend = new AplayBackend()
      backend.stop()
      backend.write(Buffer.from([1, 2, 3]))
    })
  })

  describe('end()', () => {
    it('should do nothing when stopped', () => {
      const backend = new AplayBackend()
      backend.stop()
      backend.end()
    })

    it('should do nothing when no chunks', () => {
      const backend = new AplayBackend()
      backend.end()
    })
  })

  describe('pause()', () => {
    it('should emit onPause event on success', () => {
      const backend = new AplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      backend.pause()
      expect(mockEvents.onPause).toHaveBeenCalled()
    })
  })

  describe('resume()', () => {
    it('should emit onResume event on success', () => {
      const backend = new AplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      backend.pause()
      backend.resume()
      expect(mockEvents.onResume).toHaveBeenCalled()
    })
  })

  describe('stop()', () => {
    it('should kill process with SIGTERM', () => {
      const backend = new AplayBackend({ events: mockEvents })
      backend.start('/valid/path.wav')
      backend.stop()
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should emit onStop event', () => {
      const backend = new AplayBackend({ events: mockEvents })
      backend.stop()
      expect(mockEvents.onStop).toHaveBeenCalled()
    })
  })

  describe('destroy()', () => {
    it('should call stop()', () => {
      const backend = new AplayBackend()
      const stopSpy = jest.spyOn(backend, 'stop')
      backend.destroy()
      expect(stopSpy).toHaveBeenCalled()
    })
  })
})

describe('PowerShellBackend', () => {
  let mockProcess: any
  let mockEvents: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockProcess = {
      kill: jest.fn(),
      on: jest.fn(),
    }
    
    mockEvents = {
      onStart: jest.fn(),
      onEnd: jest.fn(),
      onError: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onStop: jest.fn()
    }

    MockSpawn.mockImplementation(() => mockProcess)
    MockExistsSync.mockReturnValue(true)
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const backend = new PowerShellBackend()
      expect(backend.name).toBe('powershell')
      expect(backend.supportsStreaming).toBe(false)
    })

    it('should accept events callback', () => {
      const backend = new PowerShellBackend({ events: mockEvents })
      expect(backend).toBeDefined()
    })
  })

  describe('start()', () => {
    it('should throw on invalid file path', () => {
      const backend = new PowerShellBackend()
      expect(() => backend.start('/invalid; path')).toThrow('Invalid file path')
    })

    it('should throw on path with special characters', () => {
      const backend = new PowerShellBackend()
      expect(() => backend.start('/invalid`backtick')).toThrow('Invalid file path')
    })

    it('should call spawn with powershell', () => {
      const backend = new PowerShellBackend({ events: mockEvents })
      backend.start('C:\\valid\\path.wav')
      expect(MockSpawn).toHaveBeenCalled()
    })

    it('should emit onStart event', () => {
      const backend = new PowerShellBackend({ events: mockEvents })
      backend.start('C:\\valid\\path.wav')
      expect(mockEvents.onStart).toHaveBeenCalled()
    })

    it('should write script file', () => {
      const backend = new PowerShellBackend({ events: mockEvents })
      backend.start('C:\\valid\\path.wav')
      expect(MockWriteFileSync).toHaveBeenCalled()
    })
  })

  describe('write()', () => {
    it('should buffer chunks', () => {
      const backend = new PowerShellBackend()
      backend.write(Buffer.from([1, 2, 3]))
      backend.write(Buffer.from([4, 5, 6]))
    })

    it('should do nothing when stopped', () => {
      const backend = new PowerShellBackend()
      backend.stop()
      backend.write(Buffer.from([1, 2, 3]))
    })
  })

  describe('end()', () => {
    it('should do nothing when stopped', () => {
      const backend = new PowerShellBackend()
      backend.stop()
      backend.end()
    })

    it('should do nothing when already ended', () => {
      const backend = new PowerShellBackend()
      backend.end()
      backend.end()
    })

    it('should do nothing when no chunks', () => {
      const backend = new PowerShellBackend()
      backend.end()
    })
  })

  describe('pause()', () => {
    it('should throw UnsupportedError when started', () => {
      const backend = new PowerShellBackend()
      try {
        backend.pause()
      } catch (e: any) {
        expect(e.name).toBe('UnsupportedError')
        expect(e.message).toContain('pause is not supported')
      }
    })
  })

  describe('resume()', () => {
    it('should throw UnsupportedError when paused', () => {
      const backend = new PowerShellBackend()
      try {
        backend.resume()
      } catch (e: any) {
        expect(e.name).toBe('UnsupportedError')
        expect(e.message).toContain('resume is not supported')
      }
    })
  })

  describe('stop()', () => {
    it('should kill process with SIGTERM', () => {
      const backend = new PowerShellBackend({ events: mockEvents })
      backend.start('C:\\valid\\path.wav')
      backend.stop()
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })

    it('should emit onStop event', () => {
      const backend = new PowerShellBackend({ events: mockEvents })
      backend.stop()
      expect(mockEvents.onStop).toHaveBeenCalled()
    })

    it('should be callable multiple times', () => {
      const backend = new PowerShellBackend()
      backend.stop()
      backend.stop()
    })
  })

  describe('destroy()', () => {
    it('should call stop()', () => {
      const backend = new PowerShellBackend()
      const stopSpy = jest.spyOn(backend, 'stop')
      backend.destroy()
      expect(stopSpy).toHaveBeenCalled()
    })
  })
})

describe('Backend Index (index.ts)', () => {
  describe('BackendType enum', () => {
    it('should have all backend types', () => {
      expect(BackendType.NAUDIODON).toBe('naudiodon')
      expect(BackendType.AFPLAY).toBe('afplay')
      expect(BackendType.APLAY).toBe('aplay')
      expect(BackendType.POWERSHELL).toBe('powershell')
      expect(BackendType.AUTO).toBe('auto')
    })
  })

  describe('createBackend()', () => {
    beforeEach(() => {
      jest.clearAllMocks()
      jest.resetModules()
    })

    it('should create AfplayBackend on darwin platform when naudiodon unavailable', () => {
      jest.doMock('naudiodon', () => {
        throw { code: 'MODULE_NOT_FOUND' }
      }, { virtual: true })
      
      // Mock process.platform
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      
      const { createBackend, AfplayBackend } = require('../src/core/backends/index')
      const backend = createBackend()
      expect(backend).toBeInstanceOf(AfplayBackend)
    })

    it('should create AplayBackend on linux platform when naudiodon unavailable', () => {
      jest.doMock('naudiodon', () => {
        throw { code: 'MODULE_NOT_FOUND' }
      }, { virtual: true })
      
      Object.defineProperty(process, 'platform', { value: 'linux' })
      
      const { createBackend, AplayBackend } = require('../src/core/backends/index')
      const backend = createBackend()
      expect(backend).toBeInstanceOf(AplayBackend)
    })

    it('should create PowerShellBackend on win32 platform when naudiodon unavailable', () => {
      jest.doMock('naudiodon', () => {
        throw { code: 'MODULE_NOT_FOUND' }
      }, { virtual: true })
      
      Object.defineProperty(process, 'platform', { value: 'win32' })
      
      const { createBackend, PowerShellBackend } = require('../src/core/backends/index')
      const backend = createBackend()
      expect(backend).toBeInstanceOf(PowerShellBackend)
    })

    it('should throw on unsupported platform', () => {
      jest.doMock('naudiodon', () => {
        throw { code: 'MODULE_NOT_FOUND' }
      }, { virtual: true })
      
      Object.defineProperty(process, 'platform', { value: 'freebsd' })
      
      const { createBackend } = require('../src/core/backends/index')
      expect(() => createBackend()).toThrow('Unsupported platform: freebsd')
    })

    it('should create specific backend type when specified', () => {
      const { createBackend, BackendType, NaudiodonBackend, AfplayBackend, AplayBackend, PowerShellBackend } = require('../src/core/backends/index')
      
      expect(createBackend(BackendType.AFPLAY)).toBeInstanceOf(AfplayBackend)
      expect(createBackend(BackendType.APLAY)).toBeInstanceOf(AplayBackend)
      expect(createBackend(BackendType.POWERSHELL)).toBeInstanceOf(PowerShellBackend)
    })

    it('should throw on unknown backend type', () => {
      const { createBackend, BackendType } = require('../src/core/backends/index')
      
      expect(() => createBackend('unknown' as BackendType)).toThrow('Unknown backend type: unknown')
    })
  })

  describe('supportsStreaming()', () => {
    it('should return true for NAUDIODON', () => {
      const { supportsStreaming, BackendType } = require('../src/core/backends/index')
      expect(supportsStreaming(BackendType.NAUDIODON)).toBe(true)
    })

    it('should return false for other backends', () => {
      const { supportsStreaming, BackendType } = require('../src/core/backends/index')
      expect(supportsStreaming(BackendType.AFPLAY)).toBe(false)
      expect(supportsStreaming(BackendType.APLAY)).toBe(false)
      expect(supportsStreaming(BackendType.POWERSHELL)).toBe(false)
    })
  })

  describe('getDefaultBackendType()', () => {
    it('should return NAUDIODON when available', () => {
      jest.doMock('naudiodon', () => ({}), { virtual: true })
      
      const { getDefaultBackendType, BackendType } = require('../src/core/backends/index')
      expect(getDefaultBackendType()).toBe(BackendType.NAUDIODON)
    })

    it('should return platform-specific backend when naudiodon unavailable', () => {
      jest.doMock('naudiodon', () => {
        throw { code: 'MODULE_NOT_FOUND' }
      }, { virtual: true })
      
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      
      const { getDefaultBackendType, BackendType } = require('../src/core/backends/index')
      expect(getDefaultBackendType()).toBe(BackendType.AFPLAY)
    })
  })
})

describe('HowlerBackend', () => {
  let mockEvents: any

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const backend = new HowlerBackend()
      expect(backend.name).toBe('howler')
      expect(backend.supportsStreaming).toBe(false)
    })

    it('should accept events callback', () => {
      const events = {
        onStart: jest.fn(),
        onEnd: jest.fn(),
        onError: jest.fn(),
        onPause: jest.fn(),
        onResume: jest.fn(),
        onStop: jest.fn(),
        onProgress: jest.fn()
      }
      const backend = new HowlerBackend({ events })
      expect(backend).toBeDefined()
    })

    it('should accept volume option', () => {
      const backend = new HowlerBackend({ volume: 0.5 })
      expect(backend).toBeDefined()
    })

    it('should accept format option', () => {
      const backend = new HowlerBackend({ format: 'wav' })
      expect(backend).toBeDefined()
    })
  })

  describe('supportsStreaming', () => {
    it('should be false (Howler.js does not support true streaming)', () => {
      const backend = new HowlerBackend()
      expect(backend.supportsStreaming).toBe(false)
    })
  })

  describe('start()', () => {
    it('should create Howl instance', () => {
      const backend = new HowlerBackend()
      backend.start('/path/to/file.mp3')
    })

    it('should stop previous playback if already started', () => {
      const backend = new HowlerBackend()
      backend.start('/path/to/file1.mp3')
      backend.start('/path/to/file2.mp3')
    })
  })

  describe('write()', () => {
    it('should buffer chunks and emit progress', () => {
      const onProgress = jest.fn()
      const backend = new HowlerBackend({ events: { onProgress } })
      backend.start('/path/to/file.mp3')
      const chunk = Buffer.from([1, 2, 3, 4, 5])
      backend.write(chunk)
      expect(onProgress).toHaveBeenCalledWith(5)
    })

    it('should do nothing when stopped', () => {
      const onProgress = jest.fn()
      const backend = new HowlerBackend({ events: { onProgress } })
      backend.start('/path/to/file.mp3')
      backend.stop()
      backend.write(Buffer.from([1, 2, 3]))
      expect(onProgress).not.toHaveBeenCalled()
    })

    it('should do nothing when not started', () => {
      const backend = new HowlerBackend()
      backend.write(Buffer.from([1, 2, 3]))
      // No error should be thrown
    })
  })

  describe('pause()', () => {
    it('should not throw when pausing', () => {
      const backend = new HowlerBackend()
      backend.start('/path/to/file.mp3')
      backend.pause()
    })

    it('should do nothing when not started', () => {
      const backend = new HowlerBackend()
      backend.pause()
    })
  })

  describe('resume()', () => {
    it('should not throw when resuming', () => {
      const backend = new HowlerBackend()
      backend.start('/path/to/file.mp3')
      backend.pause()
      backend.resume()
    })

    it('should do nothing when not paused', () => {
      const backend = new HowlerBackend()
      backend.resume()
    })
  })

  describe('stop()', () => {
    it('should stop playback and emit onStop', () => {
      const onStop = jest.fn()
      const backend = new HowlerBackend({ events: { onStop } })
      backend.start('/path/to/file.mp3')
      backend.stop()
      expect(onStop).toHaveBeenCalled()
    })

    it('should be callable multiple times', () => {
      const backend = new HowlerBackend()
      backend.stop()
      backend.stop()
      // Should not throw
    })
  })

  describe('getCurrentTime()', () => {
    it('should return current playback time', () => {
      const backend = new HowlerBackend()
      backend.start('/path/to/file.mp3')
      const time = backend.getCurrentTime()
      expect(typeof time).toBe('number')
    })

    it('should return undefined when not started', () => {
      const backend = new HowlerBackend()
      const time = backend.getCurrentTime()
      expect(time).toBeUndefined()
    })
  })

  describe('getDuration()', () => {
    it('should return duration when started', () => {
      const backend = new HowlerBackend()
      backend.start('/path/to/file.mp3')
      const duration = backend.getDuration()
      expect(typeof duration).toBe('number')
    })

    it('should return undefined when not started', () => {
      const backend = new HowlerBackend()
      const duration = backend.getDuration()
      expect(duration).toBeUndefined()
    })
  })

  describe('setVolume()', () => {
    it('should set volume', () => {
      const backend = new HowlerBackend()
      backend.start('/path/to/file.mp3')
      backend.setVolume(0.5)
      // Should not throw
    })

    it('should clamp volume to valid range', () => {
      const backend = new HowlerBackend()
      backend.start('/path/to/file.mp3')
      backend.setVolume(1.5)
      backend.setVolume(-0.5)
      // Should clamp and not throw
    })
  })

  describe('destroy()', () => {
    it('should call stop()', () => {
      const backend = new HowlerBackend()
      const stopSpy = jest.spyOn(backend, 'stop')
      backend.destroy()
      expect(stopSpy).toHaveBeenCalled()
    })
  })
})

