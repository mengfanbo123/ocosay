import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { stripComments, generateDefaultConfig, mergeWithDefaults, loadOrCreateConfig } from '../src/config'
import { DEFAULT_CONFIG } from '../src/types/config'
import type { OcosayConfig } from '../src/types/config'

jest.mock('fs')
jest.mock('path')
jest.mock('os')

describe('config.ts', () => {
  const mockHomedir = '/home/testuser'
  const mockConfigPath = path.join(mockHomedir, '.config', 'opencode', 'ocosay.jsonc')

  beforeEach(() => {
    jest.clearAllMocks()
    ;(path.join as jest.Mock).mockReturnValue(mockConfigPath)
    ;(path.dirname as jest.Mock).mockReturnValue(path.dirname(mockConfigPath))
    ;(os.homedir as jest.Mock).mockReturnValue(mockHomedir)
  })

  describe('stripComments', () => {
    it('should strip single-line comments //', () => {
      const input = '{"enabled": true // comment'
      const result = stripComments(input)
      expect(result).toBe('{"enabled": true ')
    })

    it('should strip multi-line comments /* */', () => {
      const input = '{"enabled": true /* comment */}'
      const result = stripComments(input)
      expect(result).toBe('{"enabled": true }')
    })

    it('should strip multiple comments', () => {
      const input = `
        {
          // single line comment
          "enabled": true,
          /* multi
             line
             comment */
          "speed": 1.0
        }
      `
      const result = stripComments(input)
      expect(result).not.toContain('//')
      expect(result).not.toContain('/*')
      expect(result).not.toContain('*/')
      expect(result).toContain('"enabled": true')
      expect(result).toContain('"speed": 1.0')
    })

    it('should preserve JSON content', () => {
      const input = '{"enabled": true, "speed": 1.0}'
      const result = stripComments(input)
      expect(JSON.parse(result)).toEqual({ enabled: true, speed: 1.0 })
    })

    it('should preserve quoted strings containing // and /* */', () => {
      const input = '{"url": "https://example.com/api?foo=1&bar=2"}'
      const result = stripComments(input)
      expect(JSON.parse(result)).toEqual({ url: 'https://example.com/api?foo=1&bar=2' })
    })

    it('should preserve single-quoted strings', () => {
      const input = "{'key': 'value with // comment'}"
      const result = stripComments(input)
      expect(result).toContain('value with // comment')
    })

    it('should preserve template literals', () => {
      const input = '`string with // comment`'
      const result = stripComments(input)
      expect(result).toBe('`string with // comment`')
    })

    it('should handle comment at end of content', () => {
      const input = '{"key": "value"} // trailing'
      const result = stripComments(input)
      expect(result).toBe('{"key": "value"} ')
    })

    it('should handle empty string', () => {
      const result = stripComments('')
      expect(result).toBe('')
    })
  })

  describe('generateDefaultConfig', () => {
    it('should return complete OcosayConfig object', () => {
      const config = generateDefaultConfig()
      expect(config).toHaveProperty('enabled')
      expect(config).toHaveProperty('autoPlay')
      expect(config).toHaveProperty('autoRead')
      expect(config).toHaveProperty('streamMode')
      expect(config).toHaveProperty('streamBufferSize')
      expect(config).toHaveProperty('streamBufferTimeout')
      expect(config).toHaveProperty('speed')
      expect(config).toHaveProperty('volume')
      expect(config).toHaveProperty('pitch')
      expect(config).toHaveProperty('providers')
      expect(config).toHaveProperty('providers.minimax')
    })

    it('should have apiKey as empty string and baseURL with default value', () => {
      const config = generateDefaultConfig()
      expect(config.providers.minimax.apiKey).toBe('')
      expect(config.providers.minimax.baseURL).toBe('https://api.minimaxi.com')
      expect(config.providers.minimax.voiceId).toBe('female-chengshu')
    })

    it('should have correct default values from DEFAULT_CONFIG', () => {
      const config = generateDefaultConfig()
      expect(config.enabled).toBe(DEFAULT_CONFIG.enabled)
      expect(config.autoPlay).toBe(DEFAULT_CONFIG.autoPlay)
      expect(config.autoRead).toBe(DEFAULT_CONFIG.autoRead)
      expect(config.streamMode).toBe(DEFAULT_CONFIG.streamMode)
      expect(config.streamBufferSize).toBe(DEFAULT_CONFIG.streamBufferSize)
      expect(config.streamBufferTimeout).toBe(DEFAULT_CONFIG.streamBufferTimeout)
      expect(config.speed).toBe(DEFAULT_CONFIG.speed)
      expect(config.volume).toBe(DEFAULT_CONFIG.volume)
      expect(config.pitch).toBe(DEFAULT_CONFIG.pitch)
    })

    it('should have correct minimax provider defaults', () => {
      const config = generateDefaultConfig()
      expect(config.providers.minimax.model).toBe('stream')
      expect(config.providers.minimax.ttsModel).toBe('speech-2.8-hd')
      expect(config.providers.minimax.audioFormat).toBe('mp3')
    })
  })

  describe('mergeWithDefaults', () => {
    it('should override defaults with user config', () => {
      const userConfig = { enabled: false, speed: 2.0 }
      const result = mergeWithDefaults(userConfig, DEFAULT_CONFIG)
      expect(result.enabled).toBe(false)
      expect(result.speed).toBe(2.0)
    })

    it('should use defaults for unspecified fields', () => {
      const userConfig: Partial<OcosayConfig> = { enabled: false }
      const result = mergeWithDefaults(userConfig, DEFAULT_CONFIG)
      expect(result.enabled).toBe(false)
      expect(result.autoPlay).toBe(DEFAULT_CONFIG.autoPlay)
      expect(result.autoRead).toBe(DEFAULT_CONFIG.autoRead)
      expect(result.streamMode).toBe(DEFAULT_CONFIG.streamMode)
      expect(result.speed).toBe(DEFAULT_CONFIG.speed)
      expect(result.volume).toBe(DEFAULT_CONFIG.volume)
      expect(result.pitch).toBe(DEFAULT_CONFIG.pitch)
    })

    it('should return defaults when no user config provided', () => {
      const result = mergeWithDefaults({}, DEFAULT_CONFIG)
      expect(result.enabled).toBe(DEFAULT_CONFIG.enabled)
      expect(result.autoPlay).toBe(DEFAULT_CONFIG.autoPlay)
      expect(result.autoRead).toBe(DEFAULT_CONFIG.autoRead)
      expect(result.streamBufferSize).toBe(DEFAULT_CONFIG.streamBufferSize)
      expect(result.streamBufferTimeout).toBe(DEFAULT_CONFIG.streamBufferTimeout)
      expect(result.speed).toBe(DEFAULT_CONFIG.speed)
      expect(result.volume).toBe(DEFAULT_CONFIG.volume)
      expect(result.pitch).toBe(DEFAULT_CONFIG.pitch)
    })

    it('should preserve all default fields', () => {
      const result = mergeWithDefaults({}, DEFAULT_CONFIG)
      expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort())
    })
  })

  describe('loadOrCreateConfig', () => {
    beforeEach(() => {
      // Reset module to clear any cached state
      jest.resetModules()
      jest.clearAllMocks()
      ;(path.join as jest.Mock).mockReturnValue(mockConfigPath)
      ;(path.dirname as jest.Mock).mockReturnValue(path.dirname(mockConfigPath))
      ;(os.homedir as jest.Mock).mockReturnValue(mockHomedir)
    })

    it('should create default config when config file does not exist', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      ;(fs.mkdirSync as jest.Mock).mockReturnValue(undefined)
      ;(fs.writeFileSync as jest.Mock).mockReturnValue(undefined)
      ;(fs.chmodSync as jest.Mock).mockReturnValue(undefined)

      const config = loadOrCreateConfig()

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(mockConfigPath), { recursive: true })
      expect(fs.writeFileSync).toHaveBeenCalled()
      expect(fs.chmodSync).toHaveBeenCalledWith(mockConfigPath, 0o600)
      expect(config.providers.minimax.apiKey).toBe('')
      expect(config.providers.minimax.baseURL).toBe('https://api.minimaxi.com')
    })

    it('should create directory if it does not exist', () => {
      ;(fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === path.dirname(mockConfigPath)) return false
        if (p === mockConfigPath) return false
        return false
      })
      ;(fs.mkdirSync as jest.Mock).mockReturnValue(undefined)
      ;(fs.writeFileSync as jest.Mock).mockReturnValue(undefined)
      ;(fs.chmodSync as jest.Mock).mockReturnValue(undefined)

      loadOrCreateConfig()

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(mockConfigPath), { recursive: true })
    })

    it('should read and merge existing config file', () => {
      const existingConfig = {
        enabled: false,
        speed: 1.5,
        providers: {
          minimax: {
            apiKey: 'test-key',
            baseURL: 'https://api.minimax.io'
          }
        }
      }

      ;(fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        return p === mockConfigPath || p === path.dirname(mockConfigPath)
      })
      ;(fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(existingConfig))

      const config = loadOrCreateConfig()

      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8')
      expect(config.enabled).toBe(false)
      expect(config.speed).toBe(1.5)
      expect(config.providers.minimax.apiKey).toBe('test-key')
      expect(config.providers.minimax.baseURL).toBe('https://api.minimax.io')
    })

    it('should merge user config with defaults', () => {
      const userConfig = {
        enabled: false
        // other fields missing
      }

      ;(fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        return p === mockConfigPath || p === path.dirname(mockConfigPath)
      })
      ;(fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(userConfig))

      const config = loadOrCreateConfig()

      expect(config.enabled).toBe(false)
      expect(config.autoPlay).toBe(DEFAULT_CONFIG.autoPlay)
      expect(config.speed).toBe(DEFAULT_CONFIG.speed)
    })

    it('should handle config file with comments', () => {
      const jsoncContent = `{
        // This is a comment
        "enabled": false,
        /* Another comment */
        "speed": 1.8
      }`

      ;(fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        return p === mockConfigPath || p === path.dirname(mockConfigPath)
      })
      ;(fs.readFileSync as jest.Mock).mockReturnValue(jsoncContent)

      const config = loadOrCreateConfig()

      expect(config.enabled).toBe(false)
      expect(config.speed).toBe(1.8)
    })

    it('should use default config on parse error', () => {
      ;(fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        return p === mockConfigPath || p === path.dirname(mockConfigPath)
      })
      ;(fs.readFileSync as jest.Mock).mockReturnValue('invalid json {')

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      const config = loadOrCreateConfig()

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(config.providers.minimax.apiKey).toBe('')
      expect(config.providers.minimax.baseURL).toBe('https://api.minimaxi.com')

      consoleErrorSpy.mockRestore()
    })

    it('should handle minimax provider partial config', () => {
      const userConfig = {
        providers: {
          minimax: {
            apiKey: 'my-key'
            // baseURL, voiceId, model, ttsModel, audioFormat missing
          }
        }
      }

      ;(fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        return p === mockConfigPath || p === path.dirname(mockConfigPath)
      })
      ;(fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(userConfig))

      const config = loadOrCreateConfig()

      expect(config.providers.minimax.apiKey).toBe('my-key')
      expect(config.providers.minimax.baseURL).toBe('')
      expect(config.providers.minimax.model).toBe('stream')
      expect(config.providers.minimax.ttsModel).toBe('speech-2.8-hd')
      expect(config.providers.minimax.audioFormat).toBe('mp3')
    })

    it('should set correct file permissions on new config', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)
      ;(fs.mkdirSync as jest.Mock).mockReturnValue(undefined)
      ;(fs.writeFileSync as jest.Mock).mockReturnValue(undefined)
      ;(fs.chmodSync as jest.Mock).mockReturnValue(undefined)

      loadOrCreateConfig()

      expect(fs.chmodSync).toHaveBeenCalledWith(mockConfigPath, 0o600)
    })
  })
})
