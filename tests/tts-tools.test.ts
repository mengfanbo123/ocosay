import { handleToolCall, ttsTools } from '../src/tools/tts'
import * as speaker from '../src/core/speaker'
import * as index from '../src/index'
import { TTSError, TTSErrorCode } from '../src/core/types'

jest.mock('../src/core/speaker')
jest.mock('../src/index')

const mockSpeaker = {
  speak: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  listVoices: jest.fn(),
  getProviders: jest.fn().mockReturnValue(['minimax']),
  isPlaying: jest.fn().mockReturnValue(true),
  isPausedState: jest.fn().mockReturnValue(false),
  destroy: jest.fn()
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(speaker.getDefaultSpeaker as jest.Mock).mockReturnValue(mockSpeaker)
  ;(speaker.speak as jest.Mock).mockResolvedValue(undefined)
  ;(speaker.stop as jest.Mock).mockResolvedValue(undefined)
  ;(speaker.pause as jest.Mock).mockImplementation(() => {})
  ;(speaker.resume as jest.Mock).mockImplementation(() => {})
  ;(speaker.listVoices as jest.Mock).mockResolvedValue([
    { id: 'voice1', name: 'Voice 1', language: 'zh-CN' }
  ])
})

describe('ttsTools', () => {
  describe('tool definitions', () => {
    it('should have 10 tools defined', () => {
      expect(ttsTools).toHaveLength(10)
    })

    it('should include tts_speak tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_speak')
      expect(tool).toBeDefined()
      expect(tool!.input!.required).toContain('text')
    })

    it('should include tts_stop tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_stop')
      expect(tool).toBeDefined()
    })

    it('should include tts_pause tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_pause')
      expect(tool).toBeDefined()
    })

    it('should include tts_resume tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_resume')
      expect(tool).toBeDefined()
    })

    it('should include tts_list_voices tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_list_voices')
      expect(tool).toBeDefined()
    })

    it('should include tts_list_providers tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_list_providers')
      expect(tool).toBeDefined()
    })

    it('should include tts_status tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_status')
      expect(tool).toBeDefined()
    })

    it('should include tts_stream_speak tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_stream_speak')
      expect(tool).toBeDefined()
    })

    it('should include tts_stream_stop tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_stream_stop')
      expect(tool).toBeDefined()
    })

    it('should include tts_stream_status tool', () => {
      const tool = ttsTools.find(t => t.name === 'tts_stream_status')
      expect(tool).toBeDefined()
    })
  })

  describe('handleToolCall', () => {
    describe('tts_speak', () => {
      it('should call speak with correct arguments', async () => {
        const result = await handleToolCall('tts_speak', {
          text: 'Hello world',
          provider: 'minimax',
          voice: 'voice1',
          model: 'stream',
          speed: 1.0,
          volume: 80,
          pitch: 1.0
        })
        expect(speaker.speak).toHaveBeenCalledWith('Hello world', expect.objectContaining({
          provider: 'minimax',
          voice: 'voice1',
          model: 'stream',
          speed: 1.0,
          volume: 80,
          pitch: 1.0
        }))
        expect(result).toEqual({ success: true, message: 'Speech completed' })
      })

      it('should return error on TTSError', async () => {
        ;(speaker.speak as jest.Mock).mockRejectedValue(
          new TTSError('Test error', TTSErrorCode.AUTH, 'minimax')
        )
        const result = await handleToolCall('tts_speak', { text: 'Hello' })
        expect(result.success).toBe(false)
        expect(result.error).toBe('Test error')
        expect(result.code).toBe(TTSErrorCode.AUTH)
      })

      it('should return error on generic error', async () => {
        ;(speaker.speak as jest.Mock).mockRejectedValue(new Error('Generic error'))
        const result = await handleToolCall('tts_speak', { text: 'Hello' })
        expect(result.success).toBe(false)
        expect(result.error).toContain('Generic error')
      })
    })

    describe('tts_stop', () => {
      it('should call stop and return success', async () => {
        const result = await handleToolCall('tts_stop')
        expect(speaker.stop).toHaveBeenCalled()
        expect(result).toEqual({ success: true, message: 'Stopped' })
      })
    })

    describe('tts_pause', () => {
      it('should call pause and return success', async () => {
        const result = await handleToolCall('tts_pause')
        expect(speaker.pause).toHaveBeenCalled()
        expect(result).toEqual({ success: true, message: 'Paused' })
      })
    })

    describe('tts_resume', () => {
      it('should call resume and return success', async () => {
        const result = await handleToolCall('tts_resume')
        expect(speaker.resume).toHaveBeenCalled()
        expect(result).toEqual({ success: true, message: 'Resumed' })
      })
    })

    describe('tts_list_voices', () => {
      it('should return voices list', async () => {
        const result = await handleToolCall('tts_list_voices', { provider: 'minimax' })
        expect(result.success).toBe(true)
        expect(result.voices).toEqual([
          { id: 'voice1', name: 'Voice 1', language: 'zh-CN' }
        ])
      })
    })

    describe('tts_list_providers', () => {
      it('should return providers list', async () => {
        const result = await handleToolCall('tts_list_providers')
        expect(result.success).toBe(true)
        expect(result.providers).toEqual(['minimax'])
      })
    })

    describe('tts_status', () => {
      it('should return playing status', async () => {
        const result = await handleToolCall('tts_status')
        expect(result.success).toBe(true)
        expect(result.isPlaying).toBe(true)
        expect(result.isPaused).toBe(false)
      })

      it('should return paused status', async () => {
        mockSpeaker.isPausedState.mockReturnValue(true)
        const result = await handleToolCall('tts_status')
        expect(result.success).toBe(true)
        expect(result.isPlaying).toBe(true)
        expect(result.isPaused).toBe(true)
      })
    })

    describe('tts_stream_speak', () => {
      it('should throw when autoRead not enabled', async () => {
        ;(index.isAutoReadEnabled as jest.Mock).mockReturnValue(false)
        const result = await handleToolCall('tts_stream_speak', { text: 'Hello' })
        expect(result.success).toBe(false)
        expect(result.error).toContain('autoRead must be enabled')
      })

      it('should throw when stream not initialized', async () => {
        ;(index.isAutoReadEnabled as jest.Mock).mockReturnValue(true)
        ;(index.isStreamEnabled as jest.Mock).mockReturnValue(false)
        const result = await handleToolCall('tts_stream_speak', { text: 'Hello' })
        expect(result.success).toBe(false)
        expect(result.error).toContain('Stream components not initialized')
      })

      it('should start stream speak when enabled', async () => {
        ;(index.isAutoReadEnabled as jest.Mock).mockReturnValue(true)
        ;(index.isStreamEnabled as jest.Mock).mockReturnValue(true)
        ;(index.getStreamReader as jest.Mock).mockReturnValue({ start: jest.fn() })
        ;(index.getStreamingSynthesizer as jest.Mock).mockReturnValue({ synthesize: jest.fn() })
        
        const result = await handleToolCall('tts_stream_speak', { text: 'Hello' })
        expect(result.success).toBe(true)
        expect(result.message).toBe('Stream speak started')
      })
    })

    describe('tts_stream_stop', () => {
      it('should throw when stream not enabled', async () => {
        ;(index.isStreamEnabled as jest.Mock).mockReturnValue(false)
        const result = await handleToolCall('tts_stream_stop')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Stream mode is not enabled')
      })

      it('should stop stream player', async () => {
        ;(index.isStreamEnabled as jest.Mock).mockReturnValue(true)
        ;(index.getStreamPlayer as jest.Mock).mockReturnValue({ stop: jest.fn() })
        
        const result = await handleToolCall('tts_stream_stop')
        expect(result.success).toBe(true)
        expect(result.message).toBe('Stream stopped')
      })
    })

    describe('tts_stream_status', () => {
      it('should return not_initialized when stream not enabled', async () => {
        ;(index.isStreamEnabled as jest.Mock).mockReturnValue(false)
        const result = await handleToolCall('tts_stream_status')
        expect(result.success).toBe(true)
        expect(result.isActive).toBe(false)
        expect(result.state).toBe('not_initialized')
      })

      it('should return stream status when enabled', async () => {
        ;(index.isStreamEnabled as jest.Mock).mockReturnValue(true)
        ;(index.getStreamStatus as jest.Mock).mockReturnValue({
          isActive: true,
          bytesWritten: 1024,
          state: 'buffering'
        })
        
        const result = await handleToolCall('tts_stream_status')
        expect(result.success).toBe(true)
        expect(result.isActive).toBe(true)
        expect(result.bytesWritten).toBe(1024)
        expect(result.state).toBe('buffering')
      })
    })

    describe('unknown tool', () => {
      it('should throw error for unknown tool', async () => {
        const result = await handleToolCall('unknown_tool')
        expect(result.success).toBe(false)
        expect(result.error).toContain('Unknown tool')
      })
    })
  })
})
