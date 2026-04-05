import { handleToolCall } from './tools/tts'
import { registerProvider, getProvider, listProviders } from './providers/base'
import { MiniMaxProvider, MiniMaxConfig } from './providers/minimax'
import { Speaker, SpeakerOptions } from './core/speaker'
import { TTSError, TTSErrorCode } from './core/types'
import { StreamReader } from './core/stream-reader'
import { StreamingSynthesizer } from './core/streaming-synthesizer'
import { StreamPlayer } from './core/stream-player'

export const pluginInfo = {
  name: 'ocosay',
  version: '1.0.0',
  description: 'OpenCode TTS 播放插件 - 支持 MiniMax TTS',
  author: '',
  license: 'MIT'
}

let speaker: Speaker | undefined
let streamReader: StreamReader | undefined
let streamingSynthesizer: StreamingSynthesizer | undefined
let streamPlayer: StreamPlayer | undefined
let initialized = false
let autoReadEnabled = false

export interface InitializeOptions {
  defaultProvider?: string
  defaultModel?: 'sync' | 'async' | 'stream'
  defaultVoice?: string
  providers?: {
    minimax?: MiniMaxConfig
  }
  autoRead?: boolean
  streamBufferSize?: number
  streamBufferTimeout?: number
}

export async function initialize(config?: InitializeOptions): Promise<void> {
  if (initialized) {
    return
  }

  if (config?.providers?.minimax) {
    if (!config.providers.minimax.apiKey) {
      throw new Error('[ocosay] API Key is required. Please set minimax.apiKey in ~/.config/opencode/ocosay.jsonc')
    }
    const minimaxProvider = new MiniMaxProvider(config.providers.minimax)
    registerProvider('minimax', minimaxProvider)
    await minimaxProvider.initialize()
  }
  
  const speakerOptions: SpeakerOptions = {
    defaultProvider: config?.defaultProvider || 'minimax',
    defaultModel: config?.defaultModel || 'stream',
    defaultVoice: config?.defaultVoice
  }
  
  speaker = new Speaker(speakerOptions)
  
  if (config?.autoRead) {
    autoReadEnabled = true
    initializeStreamComponents(config)
  }
  
  initialized = true
}

function initializeStreamComponents(config: InitializeOptions): void {
  const provider = getProvider(config?.defaultProvider || 'minimax')
  
  streamReader = new StreamReader(
    config?.streamBufferSize || 30,
    config?.streamBufferTimeout || 2000
  )
  
  streamingSynthesizer = new StreamingSynthesizer({
    provider,
    voice: config?.defaultVoice,
    speed: 1.0,
    volume: 1.0,
    pitch: 1.0
  })
  
  const playerEvents = {
    onStart: () => {},
    onEnd: () => {},
    onProgress: (bytesWritten: number) => {},
    onError: (error: Error) => console.error('Stream player error:', error),
    onStop: () => {}
  }
  streamPlayer = new StreamPlayer({ events: playerEvents })

  const synthesisQueue: string[] = []
  let isSynthesizing = false

  async function processQueue(): Promise<void> {
    while (synthesisQueue.length > 0) {
      const text = synthesisQueue.shift()!
      isSynthesizing = true
      try {
        await streamingSynthesizer?.synthesize(text)
      } catch (error) {
        console.error('Synthesize error:', error)
      }
    }
    isSynthesizing = false
  }
  
  streamReader.on('textReady', (text: string) => {
    synthesisQueue.push(text)
    if (!isSynthesizing) {
      processQueue()
    }
  })
  
  streamingSynthesizer.on('chunk', (chunk: Buffer) => {
    if (streamPlayer) {
      streamPlayer.write(chunk)
    }
  })
  
  streamingSynthesizer.on('done', () => {
    if (streamPlayer) {
      streamPlayer.end()
    }
  })

  const TuiEventBus = (global as any).__opencode_tuieventbus__
  if (TuiEventBus) {
    const eventBus = new TuiEventBus()
    let messagePartDeltaHandler: ((event: any) => void) | undefined
    let messagePartEndHandler: (() => void) | undefined
    
    messagePartDeltaHandler = (event: any) => {
      if (event?.properties) {
        streamReader?.handleDelta(
          event.sessionId || '',
          event.messageId || '',
          event.partId || '',
          event.properties.delta || ''
        )
      }
    }
    messagePartEndHandler = () => {
      streamReader?.handleEnd()
    }
    eventBus.on('message.part.delta', messagePartDeltaHandler)
    eventBus.on('message.part.end', messagePartEndHandler)
  }
}

export function getSpeaker(): Speaker {
  if (!speaker) {
    throw new TTSError(
      'Plugin not initialized. Call initialize() first.',
      TTSErrorCode.UNKNOWN,
      'ocosay'
    )
  }
  return speaker
}

export function isStreamEnabled(): boolean {
  return streamReader !== undefined && streamingSynthesizer !== undefined && streamPlayer !== undefined
}

export function isAutoReadEnabled(): boolean {
  return autoReadEnabled
}

export function getStreamStatus(): { isActive: boolean; bytesWritten: number; state: string } {
  if (!streamReader) {
    return { isActive: false, bytesWritten: 0, state: 'not_initialized' }
  }
  return {
    isActive: streamReader.isActive(),
    bytesWritten: streamPlayer?.getBytesWritten() ?? 0,
    state: streamReader.getState()
  }
}

export function getStreamReader(): StreamReader | undefined {
  return streamReader
}

export function getStreamingSynthesizer(): StreamingSynthesizer | undefined {
  return streamingSynthesizer
}

export function getStreamPlayer(): StreamPlayer | undefined {
  return streamPlayer
}

export async function destroy(): Promise<void> {
  if (streamReader) {
    streamReader.reset()
    streamReader = undefined
  }
  
  if (streamingSynthesizer) {
    streamingSynthesizer.reset()
    streamingSynthesizer = undefined
  }
  
  if (streamPlayer) {
    await streamPlayer.stop()
    streamPlayer = undefined
  }
  
  if (speaker) {
    await speaker.destroy()
    speaker = undefined
  }
  
  for (const providerName of listProviders()) {
    try {
      getProvider(providerName)?.destroy()
    } catch (e) {}
  }
  
  initialized = false
  autoReadEnabled = false
}

// 导出 showToast 函数到全局，供 Speaker.play() 使用
export function showToast(options: { body: { title: string; message: string; variant: 'success' | 'error' | 'info' } }): void {
  const showToastFn = (global as any).__opencode_tui_showToast__
  if (showToastFn) {
    try {
      showToastFn(options)
    } catch (err) {
      console.warn('[Ocosay] showToast failed:', err)
    }
  }
}

// 将 showToast 挂载到全局，供其他模块使用
;(global as any).__opencode_tui_showToast__ = showToast

export { handleToolCall }
export const toolNames = [
  'tts_speak',
  'tts_stop',
  'tts_pause',
  'tts_resume',
  'tts_list_voices',
  'tts_list_providers',
  'tts_status',
  'tts_stream_speak',
  'tts_stream_stop',
  'tts_stream_status'
]
