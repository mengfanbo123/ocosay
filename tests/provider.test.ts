import { 
  registerProvider, 
  getProvider, 
  listProviders, 
  hasProvider,
  unregisterProvider,
  BaseTTSProvider 
} from '../src/providers/base'
import { TTSError, TTSErrorCode, TTSCapabilities } from '../src/core/types'

// 创建测试 Provider
class TestProvider extends BaseTTSProvider {
  name = 'test'
  capabilities: TTSCapabilities = { speak: true }
  
  protected async doSpeak(text: string, voice: string | undefined, model: any) {
    return {
      audioData: Buffer.from([]),
      format: 'mp3',
      isStream: model === 'stream'
    }
  }
}

describe('Provider Registry', () => {
  beforeEach(() => {
    // 清理
    unregisterProvider('test')
  })
  
  it('should register provider', () => {
    const provider = new TestProvider()
    registerProvider('test', provider)
    expect(hasProvider('test')).toBe(true)
  })
  
  it('should get registered provider', () => {
    const provider = new TestProvider()
    registerProvider('test', provider)
    const retrieved = getProvider('test')
    expect(retrieved).toBe(provider)
  })
  
  it('should throw when getting non-existent provider', () => {
    expect(() => getProvider('non-existent')).toThrow(TTSError)
  })
  
  it('should list all providers', () => {
    registerProvider('test', new TestProvider())
    const list = listProviders()
    expect(list).toContain('test')
  })
  
  it('should unregister provider', () => {
    registerProvider('test', new TestProvider())
    unregisterProvider('test')
    expect(hasProvider('test')).toBe(false)
  })
  
  it('should throw when registering duplicate provider', () => {
    registerProvider('test', new TestProvider())
    expect(() => registerProvider('test', new TestProvider())).toThrow()
  })
})

describe('BaseTTSProvider', () => {
  let provider: TestProvider
  
  beforeEach(() => {
    provider = new TestProvider()
  })
  
  it('should speak with options', async () => {
    const result = await provider.speak('Hello', { model: 'sync' })
    expect(result.format).toBe('mp3')
    expect(result.isStream).toBe(false)
  })
  
  it('should throw on empty text', async () => {
    await expect(provider.speak('')).rejects.toThrow(TTSError)
    await expect(provider.speak('   ')).rejects.toThrow(TTSError)
  })
  
  it('should stop without error', async () => {
    await expect(provider.stop()).resolves.toBeUndefined()
  })
})
