import pino from 'pino'
import { Transform, Writable } from 'stream'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const logDir = join(homedir(), '.ocosay')
const logFile = join(logDir, 'ocosay.log')

if (!existsSync(logDir)) {
  try {
    mkdirSync(logDir, { recursive: true })
  } catch {
    // ignore
  }
}

const level = process.env.NODE_ENV !== 'production' ? 'debug' : (process.env.OCOSAY_LOG_LEVEL || 'info')

const formatLog = (log: pino.LogDescriptor): string => {
  const time = log.time ? new Date(log.time as string).toISOString().replace('T', ' ').replace('Z', '') : ''
  const levelStr = log.level === 30 ? 'INFO' : log.level === 40 ? 'WARNING' : log.level === 50 ? 'ERROR' : 'DEBUG'
  const module = (log as Record<string, unknown>).module as string || 'App'
  const msg = log.msg || ''
  return `[Ocosay][${time}][${levelStr}][${module}] 对应事件{${msg}}\n`
}

const createFormatStream = (): Transform => new Transform({
  transform(chunk, _encoding, callback) {
    try {
      const log = JSON.parse(chunk.toString())
      this.push(formatLog(log))
    } catch {
      this.push(chunk)
    }
    callback()
  }
})

let fileStream: Transform | null = null
try {
  const fileDest = pino.destination({ dest: logFile, mkdir: true }) as unknown as Writable
  fileStream = createFormatStream()
  fileStream.pipe(fileDest)
} catch {
  // fallback: 如果文件流创建失败，使用 stdout
  const stdoutStream = createFormatStream()
  stdoutStream.pipe(process.stdout)
  fileStream = stdoutStream as unknown as Transform
}

export const logger = pino(
  {
    level,
    base: { service: 'ocosay' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  },
  pino.multistream([
    { stream: fileStream as unknown as Writable }
  ] as pino.StreamEntry[])
)

/**
 * 创建带模块后缀的logger
 * @param module 模块名称，如 'Config', 'Speaker', 'Plugin'
 * @returns pino logger instance with module context
 */
export function createModuleLogger(module: string) {
  return logger.child({ module })
}
