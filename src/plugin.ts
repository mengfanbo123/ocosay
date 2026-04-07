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
import { exec, execSync } from 'child_process'
import { createRequire } from 'module'

// 异步 exec 封装，真正的非阻塞
function execAsync(cmd: string, cwd?: string): Promise<{ stdout: string; stderr: string; error?: Error }> {
  return new Promise((resolve) => {
    exec(cmd, { cwd, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', error: error || undefined })
    })
  })
}

// 导入三模块
import { detectMissingDependencies } from './core/dependency-detector.js'
import { mapHeadersToPackages, detectPlatform } from './core/dependency-mapper.js'
import { installSystemPackages } from './core/dependency-installer.js'

const logger = createModuleLogger('Plugin')
const require = createRequire(import.meta.url)

const opencodeBinPath = execSync('which opencode').toString().trim()
const opencodeRoot = dirname(dirname(opencodeBinPath))
const opencodeNodeModules = join(opencodeRoot, 'node_modules')
const pluginRequire = createRequire(join(opencodeNodeModules, 'package.json'))

function getSkipFilePath(): string {
  return join(homedir(), '.config', 'opencode', '.naudiodon_skip')
}

function shouldSkipNaudiodon(): boolean {
  return existsSync(getSkipFilePath())
}

async function markNaudiodonSkipped(): Promise<void> {
  try {
    const dir = join(homedir(), '.config', 'opencode')
    if (!existsSync(dir)) {
      await execAsync('mkdir -p', dir)
    }
    writeFileSync(getSkipFilePath(), Date.now().toString(), 'utf-8')
  } catch {
    // ignore
  }
}

async function verifyNaudiodonLoad(): Promise<boolean> {
  try {
    require('naudiodon')
    logger.info('naudiodon loaded successfully')
    return true
  } catch (err) {
    logger.warn({ err }, 'naudiodon load failed after rebuild')
    return false
  }
}

async function rebuildNaudiodonDependency(dep: string): Promise<boolean> {
  const naudiodonPath = dirname(require.resolve('naudiodon'))
  notificationService.info(`正在编译 ${dep}...`, 'Ocosay 依赖', 4000)
  const result = await execAsync(`npm rebuild ${dep}`, naudiodonPath)
  if (result.error) {
    logger.warn({ err: result.error }, `${dep} rebuild failed`)
    return false
  }
  logger.info(`${dep} rebuilt successfully`)
  return true
}

async function fixNaudiodonDependencies(maxRetries = 5): Promise<boolean> {
  const naudiodonPath = dirname(require.resolve('naudiodon'))

  // naudiodon 的关键编译依赖
  const criticalDeps = ['segfault-handler', 'bindings', 'node-pre-gyp']

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 先验证当前状态
    if (await verifyNaudiodonLoad()) {
      return true
    }

    logger.info({ attempt }, 'naudiodon not loadable, trying dependency rebuild')
    notificationService.info(`正在检查依赖 (${attempt + 1}/${maxRetries})...`, 'Ocosay', 3000)

    // 尝试重建关键依赖
    let anySuccess = false
    for (const dep of criticalDeps) {
      try {
        // 检查依赖是否存在
        require.resolve(dep, { paths: [naudiodonPath] })
        // 存在则尝试重建
        if (await rebuildNaudiodonDependency(dep)) {
          anySuccess = true
        }
      } catch {
        // 依赖不存在，尝试安装
        notificationService.info(`正在安装 ${dep}...`, 'Ocosay', 4000)
        const installResult = await execAsync(`npm install ${dep}`, naudiodonPath)
        if (installResult.error) {
          logger.warn({ err: installResult.error }, `${dep} install failed`)
        } else {
          logger.info(`${dep} installed successfully`)
          anySuccess = true
        }
      }
    }

    // 重建 naudiodon 本身
    if (!anySuccess || !(await verifyNaudiodonLoad())) {
      notificationService.info('正在重新编译 naudiodon...', 'Ocosay', 4000)
      const rebuildResult = await execAsync('npm rebuild naudiodon', naudiodonPath)
      if (rebuildResult.error) {
        logger.warn({ err: rebuildResult.error }, 'naudiodon rebuild failed')
      } else {
        logger.info('naudiodon rebuilt')
        anySuccess = true
      }
    }

    // 再次验证
    if (await verifyNaudiodonLoad()) {
      return true
    }

    // 如果这轮有任何成功，休息一下再试
    if (anySuccess) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  return await verifyNaudiodonLoad()
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
    const rebuildResult = await execAsync('npm rebuild naudiodon', naudiodonPath)
    if (rebuildResult.error) {
      logger.warn({ err: rebuildResult.error }, 'naudiodon rebuild failed, checking for PortAudio')
      notificationService.warning('naudiodon 编译失败', '正在尝试安装 PortAudio...', 5000)
      const installed = await installPortAudio()
      if (installed.success) {
        const retryPath = dirname(require.resolve('naudiodon'))
        notificationService.info('正在重新编译 naudiodon...', 'Ocosay', 5000)
        const retryResult = await execAsync('npm rebuild naudiodon', retryPath)
        if (retryResult.error) {
          logger.error({ err: retryResult.error }, 'naudiodon compile failed even after PortAudio install')
          notificationService.error('naudiodon 编译失败', '自动安装失败，请尝试手动安装', 8000)
          markNaudiodonSkipped()
        } else {
          logger.info('naudiodon compiled successfully after PortAudio install')

          // 验证
          const loadSuccess = await verifyNaudiodonLoad()
          if (loadSuccess) {
            notificationService.success('naudiodon 编译成功', '音频后端已就绪', 5000)
          } else {
            notificationService.warning('naudiodon 加载失败', '正在检查依赖...', 5000)
            const fixed = await fixNaudiodonDependencies()
            if (fixed) {
              notificationService.success('naudiodon 依赖修复成功', '音频后端已就绪', 5000)
            } else {
              markNaudiodonSkipped()
            }
          }
        }
      } else {
        logger.error('PortAudio install failed')
        notificationService.error('PortAudio 安装失败', '自动安装失败，请尝试手动安装', 8000)
        markNaudiodonSkipped()
      }
    } else {
      logger.info('naudiodon compiled, verifying...')

      // 验证模块能否加载
      const loadSuccess = await verifyNaudiodonLoad()
      if (loadSuccess) {
        notificationService.success('naudiodon 编译成功', '音频后端已就绪', 5000)
      } else {
        // 加载失败，说明依赖有问题，循环修复
        notificationService.warning('naudiodon 加载失败', '正在检查依赖...', 5000)
        const fixed = await fixNaudiodonDependencies()
        if (fixed) {
          notificationService.success('naudiodon 依赖修复成功', '音频后端已就绪', 5000)
        } else {
          markNaudiodonSkipped()
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'naudiodon rebuild failed, checking for PortAudio')
    notificationService.warning('naudiodon 编译失败', '正在尝试安装 PortAudio...', 5000)
    const installed = await installPortAudio()
    if (installed.success) {
      const retryPath = dirname(require.resolve('naudiodon'))
      notificationService.info('正在重新编译 naudiodon...', 'Ocosay', 5000)
      const retryResult = await execAsync('npm rebuild naudiodon', retryPath)
      if (retryResult.error) {
        logger.error({ err: retryResult.error }, 'naudiodon compile failed even after PortAudio install')
        notificationService.error('naudiodon 编译失败', '自动安装失败，请尝试手动安装', 8000)
        markNaudiodonSkipped()
      } else {
        logger.info('naudiodon compiled successfully after PortAudio install')

        // 验证
        const loadSuccess = await verifyNaudiodonLoad()
        if (loadSuccess) {
          notificationService.success('naudiodon 编译成功', '音频后端已就绪', 5000)
        } else {
          notificationService.warning('naudiodon 加载失败', '正在检查依赖...', 5000)
          const fixed = await fixNaudiodonDependencies()
          if (fixed) {
            notificationService.success('naudiodon 依赖修复成功', '音频后端已就绪', 5000)
          } else {
            markNaudiodonSkipped()
          }
        }
      }
    } else {
      logger.error('PortAudio install failed')
      notificationService.error('PortAudio 安装失败', '自动安装失败，请尝试手动安装', 8000)
      markNaudiodonSkipped()
    }
  }
}

function isModuleInstalled(moduleName: string): boolean {
  try {
    pluginRequire.resolve(moduleName)
    return true
  } catch {
    return false
  }
}

async function verifyModuleLoad(dep: string): Promise<boolean> {
  try {
    pluginRequire(dep)
    logger.info(`${dep} loaded successfully`)
    return true
  } catch (err) {
    logger.warn({ err }, `${dep} load failed`)
    return false
  }
}

interface TryCompileResult {
  success: boolean
  stderr: string
}

async function tryCompileSpeaker(): Promise<TryCompileResult> {
  const dep = 'speaker'
  const result: TryCompileResult = { success: false, stderr: '' }

  if (isModuleInstalled(dep)) {
    if (await verifyModuleLoad(dep)) {
      result.success = true
      return result
    }
  }

  if (!isModuleInstalled(dep)) {
    const installResult = await execAsync('npm install speaker', opencodeNodeModules)
    if (installResult.error) {
      // 安装失败继续尝试编译
      logger.warn({ err: installResult.error }, 'speaker install failed')
    }
  }

  const rebuildResult = await execAsync('npm rebuild speaker', opencodeNodeModules)
  result.stderr = (rebuildResult.stdout || '') + '\n' + (rebuildResult.stderr || '')
  if (rebuildResult.error) {
    result.stderr += '\n' + (rebuildResult.error.message || '')
  }
  if (await verifyModuleLoad(dep)) {
    result.success = true
  }

  return result
}

async function ensureSpeakerCompiledAsync(): Promise<void> {
  const compileResult = await tryCompileSpeaker()

  if (compileResult.success) {
    logger.info('speaker compiled successfully')
    return
  }

  const detectResult = detectMissingDependencies(compileResult.stderr)
  if (detectResult.missingHeaders.length === 0) {
    logger.info('speaker compile failed with unknown error')
    return
  }

  logger.info({ missingHeaders: detectResult.missingHeaders }, 'detected missing headers')

  const platformInfo = detectPlatform()
  const packages = mapHeadersToPackages(detectResult.missingHeaders, platformInfo.platform)
  if (packages.length === 0) {
    logger.info('no known packages for missing headers')
    return
  }

  logger.info({ packages }, 'mapped headers to packages, installing')
  await installSystemPackages(packages, notificationService)

  const retryResult = await tryCompileSpeaker()
  if (retryResult.success) {
    logger.info('speaker compiled successfully after installing dependencies')
  } else {
    logger.warn('speaker compile still failed after dependency installation')
  }
}

async function ensureSpeakerInstalledAsync(): Promise<void> {
  await ensurePlaySoundInstalled()
}

async function initAsync(): Promise<void> {
  setTimeout(async () => {
    await ensureSpeakerCompiledAsync()
    await ensureSpeakerInstalledAsync()
  }, 100)
}

async function ensureSpeakerCompiled(maxRetries = 5): Promise<void> {
  const dep = 'speaker'

  if (isModuleInstalled(dep)) {
    logger.info('speaker already installed')
    if (await verifyModuleLoad(dep)) {
      return
    }
    logger.info('speaker installed but not loadable, rebuilding')
    notificationService.info('正在编译 speaker...', 'Ocosay 音频后端', 5000)
    const rebuildResult = await execAsync('npm rebuild speaker', opencodeNodeModules)
    if (rebuildResult.error) {
      logger.warn({ err: rebuildResult.error }, 'speaker rebuild failed')
    } else {
      logger.info('speaker rebuilt')
    }
    if (await verifyModuleLoad(dep)) {
      notificationService.success('speaker 编译成功', '音频后端已就绪', 5000)
      return
    }
  } else {
    logger.info('speaker not found, installing')
    notificationService.info('正在安装 speaker...', 'Ocosay 音频后端', 5000)
    const installResult = await execAsync('npm install speaker', opencodeNodeModules)
    if (installResult.error) {
      logger.warn({ err: installResult.error }, 'speaker install failed')
    } else {
      logger.info('speaker installed')
    }
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (await verifyModuleLoad(dep)) {
      notificationService.success('speaker 编译成功', '音频后端已就绪', 5000)
      return
    }

    logger.info({ attempt, dep }, 'speaker not loadable, trying rebuild')
    notificationService.info(`正在重新编译 speaker (${attempt + 1}/${maxRetries})...`, 'Ocosay', 3000)

    const rebuildResult = await execAsync('npm rebuild speaker', opencodeNodeModules)
    if (rebuildResult.error) {
      logger.warn({ err: rebuildResult.error }, 'speaker rebuild failed')
    } else {
      logger.info('speaker rebuilt')
    }

    if (await verifyModuleLoad(dep)) {
      notificationService.success('speaker 编译成功', '音频后端已就绪', 5000)
      return
    }

    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  logger.error({ dep }, 'speaker could not be compiled')
  notificationService.error('speaker 编译失败', '请手动运行: npm install speaker && npm rebuild speaker', 8000)
}

async function ensurePlaySoundInstalled(): Promise<void> {
  const dep = 'play-sound'

  if (isModuleInstalled(dep)) {
    logger.info('play-sound already installed')
    if (await verifyModuleLoad(dep)) {
      return
    }
  }

  logger.info('play-sound not found, installing')
  notificationService.info('正在安装 play-sound...', 'Ocosay 音频后端', 5000)

  const installResult = await execAsync('npm install play-sound', opencodeNodeModules)
  if (installResult.error) {
    logger.warn({ err: installResult.error }, 'play-sound install failed')
    notificationService.warning(
      'play-sound 安装失败',
      '请手动运行: npm install play-sound',
      8000
    )
    return
  }
  logger.info('play-sound installed')

  if (await verifyModuleLoad(dep)) {
    notificationService.success('play-sound 安装成功', '音频后端已就绪', 5000)
  } else {
    notificationService.warning(
      'play-sound 安装失败',
      '请手动运行: npm install play-sound',
      8000
    )
  }
}

async function ensureOptionalDepsInstalled(): Promise<void> {
  // 异步版本，不阻塞启动
  ensureSpeakerCompiledAsync().catch((err) => {
    logger.warn({ err }, 'ensureSpeakerCompiledAsync failed')
  })
  await ensurePlaySoundInstalled()
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

function checkFFplay(): boolean {
  return execCmd('which ffplay').success
}

async function checkAudioEnvironmentForBackend(): Promise<void> {
  const platform = process.platform

  if (platform === 'linux') {
    // 检测各种音频后端的可用性
    const hasAlsa = checkAlsa()
    const hasFFplay = checkFFplay()

    if (!hasAlsa && !hasFFplay) {
      notificationService.warning(
        '未检测到音频设备',
        '请安装 ffmpeg 或配置 PulseAudio',
        8000
      )
    } else if (hasFFplay && !hasAlsa) {
      notificationService.info(
        'ffplay 可用',
        '将使用 ffplay 进行无声卡播放',
        5000
      )
    }
  }
}

async function installPortAudio(): Promise<{ success: boolean; message: string }> {
  const platform = process.platform
  const wsl = isWsl()
  logger.info({ platform, wsl }, 'installing PortAudio')

  const runInstall = async (cmd: string, desc: string): Promise<boolean> => {
    logger.info(`Running: ${cmd}`)
    notificationService.info(desc, '正在安装...', 5000)

    const result = await execAsync(cmd)
    if (result.error) {
      const msg = result.error.message || ''
      // 检测 sudo 密码失败
      if (msg.includes('sudo') || msg.includes('password') || msg.includes('Password')) {
        notificationService.error(
          '需要 sudo 权限',
          '# 请在WSL终端执行一次\nsudo visudo\n# 添加行：your user name ALL=(ALL) NOPASSWD: ALL',
          10000
        )
        logger.error({ err: result.error }, '需要 sudo 权限 请在WSL终端执行一次sudo visudo # 添加行：your user name ALL=(ALL) NOPASSWD: ALL')
        return false
      }
      // 已安装
      if (msg.includes('already') || msg.includes('is already')) {
        logger.info('already installed')
        return true
      }
      notificationService.error(desc + ' 失败', msg.substring(0, 100), 8000)
      logger.error({ err: result.error }, `install failed: ${desc}`)
      return false
    }
    return true
  }

  // Linux / WSL
  if (platform === 'linux' || wsl) {
    // 0. 检测 ffmpeg (支持无声卡播放，play-sound 后端依赖)
    notificationService.info('检测 ffmpeg...', '音频后端', 5000)
    const ffmpegCheck = execCmd('which ffplay')
    if (ffmpegCheck.success) {
      logger.info('ffmpeg already available')
      notificationService.success('ffmpeg 就绪', 'ffplay 可用于无声卡播放', 5000)
      // ffmpeg 可用，继续检测音频设备
    } else {
      // 尝试安装 ffmpeg
      notificationService.info('安装 ffmpeg...', '音频后端', 5000)
      const ffmpegInstalled = await runInstall(
        'sudo apt-get update && sudo apt-get install -y ffmpeg',
        '安装 ffmpeg'
      )
      if (ffmpegInstalled) {
        notificationService.success('ffmpeg 安装成功', 'ffplay 可用于无声卡播放', 5000)
      } else {
        notificationService.warning('ffmpeg 安装失败', 'play-sound 后端可能无法工作', 5000)
      }
    }

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

  initAsync()

  await ensureNaudiodonCompiled()
  await ensureOptionalDepsInstalled()

  // 检测音频环境，每步都加 toast
  await checkAudioEnvironmentForBackend()

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
