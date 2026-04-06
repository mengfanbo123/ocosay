/**
 * Type declarations for optional dependencies
 * 这些是可选依赖，仅在安装后可用
 */

declare module 'play-sound' {
  interface PlaySoundOptions {
    players?: string[]
    player?: string
  }
  
  interface PlaySound {
    play(file: string, callback?: (err: Error | null) => void): any
  }
  
  function playSound(): PlaySound
  export default playSound
}

declare module 'speaker' {
  interface SpeakerOptions {
    channels?: number
    sampleRate?: number
    bitDepth?: number
    signed?: boolean
    float?: boolean
    samplesPerFrame?: number
  }
  
  class Speaker {
    constructor(options?: SpeakerOptions)
    write(buffer: Buffer): boolean
    close(): void
    on(event: 'close' | 'error', callback: (err?: Error) => void): void
  }
  
  export = Speaker
}
