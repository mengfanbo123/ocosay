import { Speaker, getDefaultSpeaker, speak as coreSpeak, stop as coreStop, pause as corePause, resume as coreResume, listVoices as coreListVoices } from '../core/speaker'
import { Voice, SpeakOptions } from '../core/types'
import { logger } from '../utils/logger'

export interface speakerServiceOptions {
  defaultProvider?: string
  defaultModel?: 'sync' | 'async' | 'stream'
  defaultVoice?: string
}

export class SpeakerService {
  private speaker: Speaker

  constructor(_options: speakerServiceOptions = {}) {
    this.speaker = getDefaultSpeaker()
  }

  async speak(text: string, options?: SpeakOptions & { provider?: string }): Promise<void> {
    const timestamp = this.getTimestamp()
    logger.info(`[Ocosay][${timestamp}][INFO][Speaker] 对应事件{播放开始} - 文本长度: ${text.length}`)
    return this.speaker.speak(text, options)
  }

  pause(): void {
    this.speaker.pause()
  }

  resume(): void {
    this.speaker.resume()
  }

  async stop(): Promise<void> {
    return this.speaker.stop()
  }

  async listVoices(providerName?: string): Promise<Voice[]> {
    return this.speaker.listVoices(providerName)
  }

  getCapabilities(providerName?: string) {
    return this.speaker.getCapabilities(providerName)
  }

  getProviders(): string[] {
    return this.speaker.getProviders()
  }

  isPlaying(): boolean {
    return this.speaker.isPlaying()
  }

  isPausedState(): boolean {
    return this.speaker.isPausedState()
  }

  async destroy(): Promise<void> {
    return this.speaker.destroy()
  }

  private getTimestamp(): string {
    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  }
}

let defaultSpeakerService: SpeakerService | undefined

export function getDefaultSpeakerService(): SpeakerService {
  if (!defaultSpeakerService) {
    defaultSpeakerService = new SpeakerService()
  }
  return defaultSpeakerService
}

export async function speak(text: string, options?: SpeakOptions & { provider?: string }): Promise<void> {
  if (options) {
    return coreSpeak(text, options)
  }
  return coreSpeak(text)
}

export async function stop(): Promise<void> {
  return coreStop()
}

export function pause(): void {
  corePause()
}

export function resume(): void {
  coreResume()
}

export async function listVoices(providerName?: string): Promise<Voice[]> {
  return coreListVoices(providerName)
}

export default SpeakerService
