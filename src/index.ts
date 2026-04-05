import { ttsTools, handleToolCall } from './tools/tts'
import { registerProvider, getProvider, listProviders } from './providers/base'
import { MiniMaxProvider, MiniMaxConfig } from './providers/minimax'
import { Speaker, SpeakerOptions } from './core/speaker'
import { TTSError, TTSErrorCode } from './core/types'
import { StreamReader } from './core/stream-reader'
import { StreamingSynthesizer } from './core/streaming-synthesizer'
import { StreamPlayer } from './core/stream-player'
import { AudioPlayer, PlayerEvents } from './core/player'

export const pluginInfo = {
  name: 'ocosay',
  version: '1.0.0',
  description: 'OpenCode TTS 播放插件 - 支持 MiniMax TTS',
  author: '',
  license: 'MIT'
}

/**
 * TuiEventBus Mock/Fallback 实现
 * 实际使用时替换为真实的 opencode-ai/sdk 导入
 */
interface TuiEventBus {
  on(event: string, handler: (event: any) => void): void
  off(event: string, handler: (event: any) => void): void
}

function tryGetTuiEventBus(): TuiEventBus | null {
  try {
    // 尝试从 opencode-ai/sdk 导入
    // 注意：实际导入路径需要根据 opencode 插件系统确定
    const TuiEventBus = (global as any).__opencode_tuieventbus__
    if (TuiEventBus) {
      return new TuiEventBus()
    }
    return null
  } catch {
    return null
  }
}

let speaker: Speaker | undefined
let streamReader: StreamReader | undefined
let streamingSynthesizer: StreamingSynthesizer | undefined
let streamPlayer: StreamPlayer | undefined
let eventBus: TuiEventBus | undefined
let initialized = false
let autoReadEnabled = false

// 保存 eventBus 监听器引用，用于卸载
let messagePartDeltaHandler: ((event: any) => void) | undefined
let messagePartEndHandler: ((event: any) => void) | undefined

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
  
  eventBus = tryGetTuiEventBus() ?? undefined
  if (eventBus) {
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

/**
 * 检查流式组件是否已初始化（autoRead模式）
 */
export function isStreamEnabled(): boolean {
  return streamReader !== undefined && streamingSynthesizer !== undefined && streamPlayer !== undefined
}

/**
 * 检查 autoRead 模式是否启用
 */
export function isAutoReadEnabled(): boolean {
  return autoReadEnabled
}

/**
 * 获取流式组件状态
 */
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

/**
 * 获取流式朗读器
 */
export function getStreamReader(): StreamReader | undefined {
  return streamReader
}

/**
 * 获取流式合成器
 */
export function getStreamingSynthesizer(): StreamingSynthesizer | undefined {
  return streamingSynthesizer
}

/**
 * 获取流式播放器
 */
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
  
  if (eventBus) {
    if (messagePartDeltaHandler) {
      eventBus.off('message.part.delta', messagePartDeltaHandler)
      messagePartDeltaHandler = undefined
    }
    if (messagePartEndHandler) {
      eventBus.off('message.part.end', messagePartEndHandler)
      messagePartEndHandler = undefined
    }
    eventBus = undefined
  }
  
  if (speaker) {
    await speaker.destroy()
    speaker = undefined
  }
  
  for (const providerName of listProviders()) {
    try {
      getProvider(providerName)?.destroy()
    } catch (e) {
      // ignore errors when destroying providers
    }
  }
  
  initialized = false
  autoReadEnabled = false
}

export default {
  name: pluginInfo.name,
  version: pluginInfo.version,
  initialize,
  tools: ttsTools,
  handleToolCall,
  getSpeaker,
  destroy,
  session: {
    idle: async () => {
      await destroy()
    }
  }
}

export const toolNames = ttsTools.map(tool => tool.name)
