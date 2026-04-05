declare module 'naudiodon' {
  interface NaudiodonAudioOutput {
    start(): void
    write(chunk: Buffer): void
    end(): void
    quit(): void
    on(event: string, callback: (error: Error) => void): void
  }

  interface Naudiodon {
    new (options: {
      sampleRate?: number
      channels?: number
      bitDepth?: number
    }): NaudiodonAudioOutput
  }

  export = Naudiodon
}
