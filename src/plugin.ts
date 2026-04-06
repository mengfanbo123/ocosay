import { tool } from '@opencode-ai/plugin'
import type { Plugin, PluginInput, PluginOptions } from '@opencode-ai/plugin'
import { handleToolCall } from './index.js'
import { initialize } from './index.js'
import { loadOrCreateConfig } from './config.js'
import { createModuleLogger } from './utils/logger.js'
import { notificationService } from './core/notification.js'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { createRequire } from 'module'

const logger = createModuleLogger('Plugin')
const require = createRequire(import.meta.url)

function getSkipFilePath(): string {
  return join(homedir(), '.config', 'opencode', '.naudiodon_skip')
}

function shouldSkipNaudiodon(): boolean {
  return existsSync(getSkipFilePath())
}

function markNaudiodonSkipped(): void {
  try {
    const dir = join(homedir(), '.config', 'opencode')
    if (!existsSync(dir)) {
      execSync('mkdir -p', { cwd: dir })
    }
    writeFileSync(getSkipFilePath(), Date.now().toString(), 'utf-8')
  } catch {
    // ignore
  }
}

async function ensureNaudiodonCompiled(): Promise<void> {
  if (shouldSkipNaudiodon()) {
    logger.info('naudiodon skipped previously')
    return
  }

  try {
    require('naudiodon')
    logger.info('naudiodon already compiled')
    return
  } catch {
    logger.info('naudiodon not compiled, will attempt to compile')
    notificationService.info('正在编译 naudiodon...', 'Ocosay 音频后端', 5000)
  }

  try {
    const naudiodonPath = dirname(require.resolve('naudiodon'))
    logger.info({ naudiodonPath }, 'found naudiodon, rebuilding')
    execSync('npm rebuild naudiodon', {
      cwd: naudiodonPath,
      stdio: 'inherit'
    })
    logger.info('naudiodon compiled successfully')
        notificationService.success('naudiodon 编译成功', '音频后端已就绪', 5000)
  } catch (err) {
    logger.warn({ err }, 'naudiodon rebuild failed, checking for PortAudio')
    notificationService.warning('naudiodon 编译失败', '正在尝试安装 PortAudio...', 5000)
    const installed = await installPortAudio()
    if (installed.success) {
      try {
        const naudiodonPath = dirname(require.resolve('naudiodon'))
        notificationService.info('正在重新编译 naudiodon...', 'Ocosay', 5000)
        execSync('npm rebuild naudiodon', {
          cwd: naudiodonPath,
          stdio: 'inherit'
        })
        logger.info('naudiodon compiled successfully after PortAudio install')
    notificationService.success('naudiodon 编译成功', '音频后端已就绪', 5000)
      } catch (retryErr) {
        logger.error({ err: retryErr }, 'naudiodon compile failed even after PortAudio install')
        notificationService.error('naudiodon 编译失败', '自动安装失败，请尝试手动安装', 8000)
        markNaudiodonSkipped()
      }
    } else {
      logger.error('PortAudio install failed')
      notificationService.error('PortAudio 安装失败', '自动安装失败，请尝试手动安装', 8000)
      markNaudiodonSkipped()
    }
  }
}

function execCmd(cmd: string): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf8' })
    return { success: true, output }
  } catch (err: any) {
    return { success: false, output: err.message || '' }
  }
}

function isWsl(): boolean {
  if (process.platform !== 'linux') return false
  try {
    return require('fs').readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  } catch {
    return false
  }
}

function checkAlsa(): boolean {
  const result = execCmd('which aplay')
  if (!result.success) return false
  const test = execCmd('aplay -l')
  return test.success && !test.output.includes('no soundcards')
}

async function installPortAudio(): Promise<{ success: boolean; message: string }> {
  const platform = process.platform
  const wsl = isWsl()
  logger.info({ platform, wsl }, 'installing PortAudio')

  const runInstall = async (cmd: string, desc: string): Promise<boolean> => {
    logger.info(`Running: ${cmd}`)
    notificationService.info(desc, '正在安装...', 5000)

    try {
      execSync(cmd, { stdio: 'inherit' })
      return true
    } catch (err: any) {
      const msg = err.message || ''
      // 检测 sudo 密码失败
      if (msg.includes('sudo') || msg.includes('password') || msg.includes('Password')) {
        notificationService.error(
          '需要 sudo 权限',
          '请手动运行: sudo apt-get update && sudo apt-get install -y alsa-utils',
          8000
        )
        logger.error({ err }, 'sudo password required')
        return false
      }
      // 已安装
      if (msg.includes('already') || msg.includes('is already')) {
        logger.info('already installed')
        return true
      }
      notificationService.error(desc + ' 失败', msg.substring(0, 100), 8000)
      logger.error({ err }, `install failed: ${desc}`)
      return false
    }
  }

  // Linux / WSL
  if (platform === 'linux' || wsl) {
    // 1. 先检测 alsa-utils 是否已有音频设备
    notificationService.info('检测音频设备...', '音频后端', 5000)
    if (checkAlsa()) {
      logger.info('alsa-utils already available and working')
      notificationService.success('alsa-utils 就绪', '音频后端已可用', 5000)
      return { success: true, message: 'alsa' }
    }

    // 2. 尝试安装 alsa-utils
    notificationService.info('安装 alsa-utils...', '音频后端', 5000)
    const alsaInstalled = await runInstall(
      'sudo apt-get update && sudo apt-get install -y alsa-utils',
      '安装 alsa-utils'
    )
    if (alsaInstalled) {
      // 检测是否真的安装成功
      if (checkAlsa()) {
        notificationService.success('alsa-utils 安装成功', '音频后端已就绪', 5000)
        return { success: true, message: 'alsa' }
      } else {
        notificationService.warning('alsa-utils 安装后检测失败', '继续尝试其他方案', 5000)
      }
    }

    // 3. alsa-utils 不可用，再尝试安装 libportaudio-dev
    notificationService.info('安装 libportaudio-dev...', '音频后端', 5000)
    const portaudioInstalled = await runInstall(
      'sudo apt-get update && sudo apt-get install -y libportaudio-dev',
      '安装 libportaudio-dev'
    )
    if (portaudioInstalled) {
      notificationService.success('libportaudio-dev 安装成功', '音频后端已就绪', 5000)
      return { success: true, message: 'portaudio' }
    }

    notificationService.warning('PortAudio 安装失败', '音频可能无法正常工作', 5000)
    markNaudiodonSkipped()
    return { success: false, message: 'linux install failed' }
  }

  // macOS
  if (platform === 'darwin') {
    const installed = await runInstall('brew install portaudio', '安装 PortAudio (macOS)')
    if (installed) {
      return { success: true, message: 'portaudio' }
    }
    markNaudiodonSkipped()
    return { success: false, message: 'macos install failed' }
  }

  // Windows - choco
  if (platform === 'win32') {
    const installed = await runInstall('choco install portaudio -y', '安装 PortAudio (Windows)')
    if (installed) {
      return { success: true, message: 'portaudio' }
    }
    markNaudiodonSkipped()
    return { success: false, message: 'windows install failed' }
  }

  markNaudiodonSkipped()
  return { success: false, message: 'unsupported platform' }
}

function checkNpmNaudiodon(): boolean {
  try {
    const naudiodonPath = dirname(require.resolve('naudiodon'))
    const pkgFile = join(naudiodonPath, 'package.json')
    if (existsSync(pkgFile)) {
      return true
    }
  } catch {
    return false
  }
  return false
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 顶层 ID 导出（OpenCode Plugin 标准）
const id = "ocosay"
let pluginVersion = '0.0.0'
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))
  pluginVersion = pkg.version || '0.0.0'
} catch {
  // 版本号读取失败不影响插件加载
}

const ttsSpeakTool = tool({
  description: '将文本转换为语音并播放（使用配置文件中的默认音色和模型）',
  args: {
    text: tool.schema.string().describe('要转换的文本内容')
  },
  execute: async (args) => {
    const result = await handleToolCall('tts_speak', args)
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStopTool = tool({
  description: '停止当前 TTS 播放',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_stop')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsPauseTool = tool({
  description: '暂停当前 TTS 播放',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_pause')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsResumeTool = tool({
  description: '恢复暂停的 TTS 播放',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_resume')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsListVoicesTool = tool({
  description: '列出可用的音色（使用配置文件中的默认提供商）',
  args: {},
  execute: async (args) => {
    const result = await handleToolCall('tts_list_voices', args)
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsListProvidersTool = tool({
  description: '列出所有已注册的 TTS 提供商',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_list_providers')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStatusTool = tool({
  description: '获取当前 TTS 播放状态',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_status')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStreamSpeakTool = tool({
  description: '启动流式朗读（豆包模式），订阅AI回复并边生成边朗读（使用配置文件中的默认音色）',
  args: {
    text: tool.schema.string().optional().describe('初始文本（可选）')
  },
  execute: async (args) => {
    const result = await handleToolCall('tts_stream_speak', args)
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStreamStopTool = tool({
  description: '停止当前流式朗读',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_stream_stop')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return result
  }
})

const ttsStreamStatusTool = tool({
  description: '获取当前流式朗读状态',
  args: {},
  execute: async () => {
    const result = await handleToolCall('tts_stream_status')
    if (result.success === false) {
      throw new Error(result.error || 'Unknown error')
    }
    return typeof result === 'string' ? result : JSON.stringify(result)
  }
})

let initError: Error | null = null

const server: Plugin = (async (input: PluginInput, _options?: PluginOptions) => {
  const opencodeTui = input.client?.tui
  ;(global as any).__opencode_tui__ = opencodeTui
  notificationService.setTui(opencodeTui)

  const config = loadOrCreateConfig()

  try {
    await initialize({
      autoRead: config.autoRead,
      providers: {
        minimax: {
          apiKey: config.providers.minimax.apiKey,
          baseURL: config.providers.minimax.baseURL || undefined,
          voiceId: config.providers.minimax.voiceId || undefined
        }
      }
    })
  } catch (err) {
    initError = err instanceof Error ? err : new Error(String(err))
    logger.error({ error: initError }, 'initialization failed')
  }

  await ensureNaudiodonCompiled()

  setTimeout(() => {
    if (initError) {
      notificationService.error(
        `Ocosay v${pluginVersion} Init Failed`,
        'Please check your config file',
        8000
      )
    } else {
      notificationService.success(
        `Ocosay v${pluginVersion} Ready`,
        `Auto-read: ${config.autoRead ? 'ON' : 'OFF'}`,
        5000
      )
    }
  }, 1500)

  return {
    tool: {
      tts_speak: ttsSpeakTool,
      tts_stop: ttsStopTool,
      tts_pause: ttsPauseTool,
      tts_resume: ttsResumeTool,
      tts_list_voices: ttsListVoicesTool,
      tts_list_providers: ttsListProvidersTool,
      tts_status: ttsStatusTool,
      tts_stream_speak: ttsStreamSpeakTool,
      tts_stream_stop: ttsStreamStopTool,
      tts_stream_status: ttsStreamStatusTool
    },
    event: async ({ event }) => {
      if (event.type !== 'session.created') return
      if (event.properties?.info?.parentID) return

      // 初始化重试机制
      if (initError) {
        const retryConfig = loadOrCreateConfig()
        if (retryConfig.providers.minimax.apiKey) {
          try {
            await initialize({
              autoRead: retryConfig.autoRead,
              providers: {
                minimax: {
                  apiKey: retryConfig.providers.minimax.apiKey,
                  baseURL: retryConfig.providers.minimax.baseURL || undefined,
                  voiceId: retryConfig.providers.minimax.voiceId || undefined
                }
              }
            })
            initError = null
          } catch (err) {
            notificationService.error(
              `Ocosay v${pluginVersion} Init Failed`,
              'Initialization failed, please check config',
              8000
            )
          }
        }
      }
    },
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {}
      opencodeConfig.command['tts'] = {
        template: '',
        description: 'TTS playback control'
      }
    }
  }
}) satisfies Plugin

// OpenCode Plugin 标准导出格式
export { id, server }
export default { id, server }
