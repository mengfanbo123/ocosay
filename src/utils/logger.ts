import pino from 'pino'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const LOG_DIR = join(homedir(), '.ocosay')
const LOG_FILE = join(LOG_DIR, 'ocosay.log')

if (!existsSync(LOG_DIR)) {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
  } catch {
    // ignore
  }
}

const streams: pino.StreamEntry[] = [
  { stream: process.stdout },
]

try {
  streams.push({ stream: pino.destination({ dest: LOG_FILE, mkdir: true }) })
} catch {
  // fallback to stdout only
}

const level = process.env.NODE_ENV !== 'production' ? 'debug' : (process.env.OCOSAY_LOG_LEVEL || 'info')

// Base logger with custom timestamp format: [Ocosay][时间戳][级别][模块] 消息
const createLogger = pino(
  {
    level,
    base: { service: 'ocosay' },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
  },
  pino.multistream(streams)
)

/**
 * 创建带模块后缀的logger
 * @param module 模块名称，如 'Config', 'Speaker', 'Plugin'
 * @returns pino logger instance with module context
 */
export function createModuleLogger(module: string) {
  return createLogger.child({ module })
}

/**
 * 默认logger（不带模块后缀，用于兼容）
 */
export const logger = createLogger

export default logger
