jest.mock('@opencode-ai/plugin', () => {
  const createChainable = () => {
    const chain: any = {
      describe: (desc: string) => {
        chain._description = desc
        return chain
      },
      optional: () => createChainable()
    }
    return chain
  }

  const schema = {
    string: () => createChainable(),
    number: () => createChainable(),
    enum: (values: string[]) => createChainable()
  }

  const tool = (input: any) => input
  tool.schema = schema

  return { tool, Plugin: jest.fn() }
})

jest.mock('../src/index', () => ({
  handleToolCall: jest.fn(),
  initialize: jest.fn(),
  destroy: jest.fn()
}))

import { handleToolCall } from '../src/index'
import pluginExport from '../src/plugin'
const OcosayPlugin = pluginExport.server

describe('plugin.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('初始化流程', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('initialize 成功后 session.created 时显示 success toast', async () => {
      const mockShowToast = jest.fn()
      const mockInput = {
        client: {
          tui: {
            showToast: mockShowToast
          }
        }
      } as any

      ;(require('../src/index').initialize as jest.Mock).mockResolvedValue(undefined)

      const result = await OcosayPlugin(mockInput, {})
      
      // 触发 session.created 事件
      await result.event?.({ event: { type: 'session.created', properties: { info: {} } } as any })

      // 执行延迟的 setTimeout
      jest.runAllTimers()

      expect(mockShowToast).toHaveBeenCalledWith({
        body: {
          variant: 'success',
          title: expect.stringContaining('Plugin Loaded'),
          message: expect.stringContaining('Auto-read')
        }
      })
    })

    it('initialize 失败后 session.created 时显示 error toast', async () => {
      const mockShowToast = jest.fn()
      const mockInput = {
        client: {
          tui: {
            showToast: mockShowToast
          }
        }
      } as any

      ;(require('../src/index').initialize as jest.Mock).mockRejectedValue(new Error('Config invalid'))

      const result = await OcosayPlugin(mockInput, {})
      
      // 触发 session.created 事件
      await result.event?.({ event: { type: 'session.created', properties: { info: {} } } as any })

      // 执行延迟的 setTimeout
      jest.runAllTimers()

      expect(mockShowToast).toHaveBeenCalledWith({
        body: {
          variant: 'error',
          title: expect.stringContaining('Initialization Failed'),
          message: 'Initialization failed, please check config'
        }
      })
    })

    it('showToast 在 session.created 事件时调用（时序验证）', async () => {
      const callOrder: string[] = []
      const mockShowToast = jest.fn().mockImplementation(() => callOrder.push('showToast'))
      const mockInput = {
        client: {
          tui: {
            showToast: mockShowToast
          }
        }
      } as any

      const initializeMock = require('../src/index').initialize as jest.Mock
      // 完全重置mock，然后设置返回resolved Promise的实现
      initializeMock.mockReset()
      initializeMock.mockImplementation(() => {
        callOrder.push('initialize')
        return Promise.resolve(undefined)
      })

      const result = await OcosayPlugin(mockInput, {})
      
      // 触发 session.created 事件
      await result.event?.({ event: { type: 'session.created', properties: { info: {} } } as any })

      // 执行延迟的 setTimeout
      jest.runAllTimers()

      // showToast 被调用两次：
      // 1. OcosayPlugin 初始化时的 setTimeout（插件加载成功）
      // 2. session.created 事件中的 setTimeout（插件加载成功）
      expect(callOrder).toEqual(['initialize', 'initialize', 'showToast', 'showToast'])
    })

    it('showToast 不可用时不报错', async () => {
      const mockInput = {
        client: {}
      } as any

      ;(require('../src/index').initialize as jest.Mock).mockResolvedValue(undefined)

      await expect(OcosayPlugin(mockInput, {})).resolves.toBeDefined()
    })
  })

  describe('工具定义验证', () => {
    let plugin: any

    beforeEach(async () => {
      plugin = await OcosayPlugin({} as any, {})
    })

    it('tts_speak: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_speak
      expect(tool.description).toBe('将文本转换为语音并播放（使用配置文件中的默认音色和模型）')
      expect(tool.args).toBeDefined()
      expect(typeof tool.args).toBe('object')
    })

    it('tts_stop: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_stop
      expect(tool.description).toBe('停止当前 TTS 播放')
      expect(tool.args).toBeDefined()
    })

    it('tts_pause: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_pause
      expect(tool.description).toBe('暂停当前 TTS 播放')
      expect(tool.args).toBeDefined()
    })

    it('tts_resume: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_resume
      expect(tool.description).toBe('恢复暂停的 TTS 播放')
      expect(tool.args).toBeDefined()
    })

    it('tts_list_voices: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_list_voices
      expect(tool.description).toBe('列出可用的音色')
      expect(tool.args).toBeDefined()
    })

    it('tts_list_providers: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_list_providers
      expect(tool.description).toBe('列出所有已注册的 TTS 提供商')
      expect(tool.args).toBeDefined()
    })

    it('tts_status: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_status
      expect(tool.description).toBe('获取当前 TTS 播放状态')
      expect(tool.args).toBeDefined()
    })

    it('tts_stream_speak: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_stream_speak
      expect(tool.description).toBe('启动流式朗读（豆包模式），订阅AI回复并边生成边朗读（使用配置文件中的默认音色）')
      expect(tool.args).toBeDefined()
    })

    it('tts_stream_stop: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_stream_stop
      expect(tool.description).toBe('停止当前流式朗读')
      expect(tool.args).toBeDefined()
    })

    it('tts_stream_status: name, description, input_schema 正确', () => {
      const tool = plugin.tool.tts_stream_status
      expect(tool.description).toBe('获取当前流式朗读状态')
      expect(tool.args).toBeDefined()
    })
  })

  describe('execute 函数验证', () => {
    let plugin: any

    beforeEach(async () => {
      plugin = await OcosayPlugin({} as any, {})
    })

    it('tts_speak: 调用 handleToolCall("tts_speak", args)', async () => {
      const tool = plugin.tool.tts_speak
      const args = { text: 'hello', provider: 'minimax' }
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, message: 'Speech completed' })

      await tool.execute(args)

      expect(handleToolCall).toHaveBeenCalledWith('tts_speak', args)
    })

    it('tts_stop: 调用 handleToolCall("tts_stop")', async () => {
      const tool = plugin.tool.tts_stop
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, message: 'Stopped' })

      await tool.execute()

      expect(handleToolCall).toHaveBeenCalledWith('tts_stop')
    })

    it('tts_pause: 调用 handleToolCall("tts_pause")', async () => {
      const tool = plugin.tool.tts_pause
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, message: 'Paused' })

      await tool.execute()

      expect(handleToolCall).toHaveBeenCalledWith('tts_pause')
    })

    it('tts_resume: 调用 handleToolCall("tts_resume")', async () => {
      const tool = plugin.tool.tts_resume
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, message: 'Resumed' })

      await tool.execute()

      expect(handleToolCall).toHaveBeenCalledWith('tts_resume')
    })

    it('tts_list_voices: 调用 handleToolCall("tts_list_voices", args)', async () => {
      const tool = plugin.tool.tts_list_voices
      const args = { provider: 'minimax' }
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, voices: [] })

      await tool.execute(args)

      expect(handleToolCall).toHaveBeenCalledWith('tts_list_voices', args)
    })

    it('tts_list_providers: 调用 handleToolCall("tts_list_providers")', async () => {
      const tool = plugin.tool.tts_list_providers
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, providers: [] })

      await tool.execute()

      expect(handleToolCall).toHaveBeenCalledWith('tts_list_providers')
    })

    it('tts_status: 调用 handleToolCall("tts_status")', async () => {
      const tool = plugin.tool.tts_status
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, isPlaying: false })

      await tool.execute()

      expect(handleToolCall).toHaveBeenCalledWith('tts_status')
    })

    it('tts_stream_speak: 调用 handleToolCall("tts_stream_speak", args)', async () => {
      const tool = plugin.tool.tts_stream_speak
      const args = { text: 'hello', voice: 'voice1', model: 'stream' }
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, message: 'Stream started' })

      await tool.execute(args)

      expect(handleToolCall).toHaveBeenCalledWith('tts_stream_speak', args)
    })

    it('tts_stream_stop: 调用 handleToolCall("tts_stream_stop")', async () => {
      const tool = plugin.tool.tts_stream_stop
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, message: 'Stream stopped' })

      await tool.execute()

      expect(handleToolCall).toHaveBeenCalledWith('tts_stream_stop')
    })

    it('tts_stream_status: 调用 handleToolCall("tts_stream_status")', async () => {
      const tool = plugin.tool.tts_stream_status
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: true, isActive: false })

      await tool.execute()

      expect(handleToolCall).toHaveBeenCalledWith('tts_stream_status')
    })
  })

  describe('错误处理', () => {
    let plugin: any

    beforeEach(async () => {
      plugin = await OcosayPlugin({} as any, {})
    })

    it('tts_speak: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_speak
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'TTS failed' })

      await expect(tool.execute({ text: 'hello' })).rejects.toThrow('TTS failed')
    })

    it('tts_stop: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_stop
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'Stop failed' })

      await expect(tool.execute()).rejects.toThrow('Stop failed')
    })

    it('tts_pause: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_pause
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'Pause failed' })

      await expect(tool.execute()).rejects.toThrow('Pause failed')
    })

    it('tts_resume: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_resume
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'Resume failed' })

      await expect(tool.execute()).rejects.toThrow('Resume failed')
    })

    it('tts_list_voices: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_list_voices
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'List voices failed' })

      await expect(tool.execute({})).rejects.toThrow('List voices failed')
    })

    it('tts_list_providers: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_list_providers
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'List providers failed' })

      await expect(tool.execute()).rejects.toThrow('List providers failed')
    })

    it('tts_status: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_status
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'Status failed' })

      await expect(tool.execute()).rejects.toThrow('Status failed')
    })

    it('tts_stream_speak: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_stream_speak
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'Stream speak failed' })

      await expect(tool.execute({})).rejects.toThrow('Stream speak failed')
    })

    it('tts_stream_stop: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_stream_stop
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'Stream stop failed' })

      await expect(tool.execute()).rejects.toThrow('Stream stop failed')
    })

    it('tts_stream_status: handleToolCall 返回 success: false 时抛出 Error', async () => {
      const tool = plugin.tool.tts_stream_status
      ;(handleToolCall as jest.Mock).mockResolvedValue({ success: false, error: 'Stream status failed' })

      await expect(tool.execute()).rejects.toThrow('Stream status failed')
    })
  })

  describe('ttsStreamStatusTool 特殊返回逻辑', () => {
    let plugin: any

    beforeEach(async () => {
      plugin = await OcosayPlugin({} as any, {})
    })

    it('当 result 是 string 时直接返回', async () => {
      const tool = plugin.tool.tts_stream_status
      ;(handleToolCall as jest.Mock).mockResolvedValue('stream_status_string')

      const result = await tool.execute()
      expect(result).toBe('stream_status_string')
    })

    it('当 result 是 object 时返回 JSON.stringify', async () => {
      const tool = plugin.tool.tts_stream_status
      const objResult = { isActive: true, bytesWritten: 100 }
      ;(handleToolCall as jest.Mock).mockResolvedValue(objResult)

      const result = await tool.execute()
      expect(result).toBe(JSON.stringify(objResult))
    })
  })
})
