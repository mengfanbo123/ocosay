import { StreamReader } from '../src/core/stream-reader'
import { StreamState } from '../src/core/types'

describe('StreamReader', () => {
  let streamReader: StreamReader

  beforeEach(() => {
    streamReader = new StreamReader(30, 2000)
  })

  afterEach(() => {
    streamReader.reset()
  })

  describe('initialization', () => {
    it('should create StreamReader with default options', () => {
      const reader = new StreamReader()
      expect(reader).toBeInstanceOf(StreamReader)
      reader.reset()
    })

    it('should create StreamReader with custom buffer size and timeout', () => {
      const reader = new StreamReader(50, 3000)
      expect(reader).toBeInstanceOf(StreamReader)
      reader.reset()
    })
  })

  describe('handleDelta', () => {
    it('should transition from IDLE to BUFFERING on first delta', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好')
      expect(streamReader.getState()).toBe(StreamState.BUFFERING)
    })

    it('should accumulate delta in buffer', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好')
      expect(streamReader.getBuffer()).toBe('你好')
    })

    it('should update session ID and message ID', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好')
      expect(streamReader.getSessionID()).toBe('session1')
      expect(streamReader.getMessageID()).toBe('msg1')
      expect(streamReader.getPartID()).toBe('part1')
    })

    it('should emit streamStart event on first delta', () => {
      const startCallback = jest.fn()
      streamReader.on('streamStart', startCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好')
      expect(startCallback).toHaveBeenCalledTimes(1)
    })

    it('should accumulate multiple deltas', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好')
      streamReader.handleDelta('session1', 'msg1', 'part1', '世界')
      expect(streamReader.getBuffer()).toBe('你好世界')
    })
  })

  describe('handleEnd', () => {
    it('should emit streamEnd event', () => {
      const endCallback = jest.fn()
      streamReader.on('streamEnd', endCallback)
      streamReader.handleEnd()
      expect(endCallback).toHaveBeenCalledTimes(1)
    })

    it('should flush remaining buffer before ending', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', '测试文本')
      streamReader.handleEnd()
      expect(textReadyCallback).toHaveBeenCalledWith('测试文本')
    })

    it('should not emit textReady for empty buffer', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleEnd()
      expect(textReadyCallback).not.toHaveBeenCalled()
    })

    it('should transition to ENDED state', () => {
      streamReader.handleEnd()
      expect(streamReader.getState()).toBe(StreamState.ENDED)
    })

    it('should handle multiple handleEnd calls gracefully', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', '测试')
      streamReader.handleEnd()
      streamReader.handleEnd() // Second call should be ignored
      expect(textReadyCallback).toHaveBeenCalledTimes(1)
    })
  })

  describe('sentence boundary detection (shouldFlush)', () => {
    it('should flush on Chinese period 。', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好。')
      expect(textReadyCallback).toHaveBeenCalledWith('你好。')
    })

    it('should flush on Chinese exclamation ！', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好！')
      expect(textReadyCallback).toHaveBeenCalledWith('你好！')
    })

    it('should flush on Chinese question ？', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好？')
      expect(textReadyCallback).toHaveBeenCalledWith('你好？')
    })

    it('should flush on English period .', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', 'Hello.')
      expect(textReadyCallback).toHaveBeenCalledWith('Hello.')
    })

    it('should flush on English exclamation !', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', 'Hello!')
      expect(textReadyCallback).toHaveBeenCalledWith('Hello!')
    })

    it('should flush on English question ?', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', 'Hello?')
      expect(textReadyCallback).toHaveBeenCalledWith('Hello?')
    })

    it('should flush on Chinese ellipsis ……', () => {
      const textReadyCallback = jest.fn()
      streamReader.on('textReady', textReadyCallback)
      streamReader.handleDelta('session1', 'msg1', 'part1', '你好……')
      expect(textReadyCallback).toHaveBeenCalledWith('你好……')
    })

    it('should flush when buffer reaches bufferSize', () => {
      const smallBufferReader = new StreamReader(3, 2000)
      const textReadyCallback = jest.fn()
      smallBufferReader.on('textReady', textReadyCallback)
      smallBufferReader.handleDelta('session1', 'msg1', 'part1', '你好世')
      expect(textReadyCallback).toHaveBeenCalled()
      smallBufferReader.reset()
    })
  })

  describe('timeout mechanism', () => {
    it('should flush buffer after timeout', async () => {
      const shortTimeoutReader = new StreamReader(100, 50)
      const textReadyCallback = jest.fn()
      shortTimeoutReader.on('textReady', textReadyCallback)
      shortTimeoutReader.handleDelta('session1', 'msg1', 'part1', '测试')
      expect(textReadyCallback).not.toHaveBeenCalled()
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(textReadyCallback).toHaveBeenCalledWith('测试')
      shortTimeoutReader.reset()
    })

    it('should reset timeout on new delta', async () => {
      const shortTimeoutReader = new StreamReader(100, 100)
      const textReadyCallback = jest.fn()
      shortTimeoutReader.on('textReady', textReadyCallback)
      shortTimeoutReader.handleDelta('session1', 'msg1', 'part1', '第一')
      await new Promise(resolve => setTimeout(resolve, 50))
      shortTimeoutReader.handleDelta('session1', 'msg1', 'part1', '第二')
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(textReadyCallback).not.toHaveBeenCalled()
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(textReadyCallback).toHaveBeenCalledWith('第一第二')
      shortTimeoutReader.reset()
    })
  })

  describe('reset', () => {
    it('should clear buffer', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '测试')
      streamReader.reset()
      expect(streamReader.getBuffer()).toBe('')
    })

    it('should transition to IDLE state', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '测试')
      streamReader.reset()
      expect(streamReader.getState()).toBe(StreamState.IDLE)
    })

    it('should clear session/message/part IDs', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '测试')
      streamReader.reset()
      expect(streamReader.getSessionID()).toBeUndefined()
      expect(streamReader.getMessageID()).toBeUndefined()
      expect(streamReader.getPartID()).toBeUndefined()
    })
  })

  describe('isActive', () => {
    it('should return true when BUFFERING', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '测试')
      expect(streamReader.isActive()).toBe(true)
    })

    it('should return false when IDLE', () => {
      expect(streamReader.isActive()).toBe(false)
    })

    it('should return false when ENDED', () => {
      streamReader.handleEnd()
      expect(streamReader.isActive()).toBe(false)
    })
  })

  describe('start', () => {
    it('should transition from IDLE to BUFFERING', () => {
      streamReader.start()
      expect(streamReader.getState()).toBe(StreamState.BUFFERING)
    })

    it('should emit streamStart event', () => {
      const startCallback = jest.fn()
      streamReader.on('streamStart', startCallback)
      streamReader.start()
      expect(startCallback).toHaveBeenCalledTimes(1)
    })

    it('should not emit streamStart if already BUFFERING', () => {
      const startCallback = jest.fn()
      streamReader.on('streamStart', startCallback)
      streamReader.start()
      streamReader.start()
      expect(startCallback).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleError', () => {
    it('should emit streamError event', () => {
      const errorCallback = jest.fn()
      streamReader.on('streamError', errorCallback)
      const { TTSError, TTSErrorCode } = require('../src/core/types')
      streamReader.handleError(new TTSError('Test error', TTSErrorCode.UNKNOWN, 'test'))
      expect(errorCallback).toHaveBeenCalled()
    })

    it('should reset to IDLE state', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '测试')
      const { TTSError, TTSErrorCode } = require('../src/core/types')
      streamReader.handleError(new TTSError('Test error', TTSErrorCode.UNKNOWN, 'test'))
      expect(streamReader.getState()).toBe(StreamState.IDLE)
    })

    it('should clear buffer', () => {
      streamReader.handleDelta('session1', 'msg1', 'part1', '测试')
      const { TTSError, TTSErrorCode } = require('../src/core/types')
      streamReader.handleError(new TTSError('Test error', TTSErrorCode.UNKNOWN, 'test'))
      expect(streamReader.getBuffer()).toBe('')
    })
  })
})
