/**
 * Logger - pino 日志系统
 * 支持写入 ~/.ocosay/ocosay.log
 */

import pino from 'pino'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

// 日志目录（延迟创建，避免同步阻塞）
const logDir = join(homedir(), '.ocosay')

// 确保目录存在（同步版本用于初始化，之后应该异步化）
function ensureLogDir(): void {
  if (!existsSync(logDir)) {
    try {
      mkdirSync(logDir, { recursive: true })
    } catch (e) {
      // 忽略创建失败
    }
  }
}

// 立即调用确保目录存在（启动时一次）
ensureLogDir()

export const logger = pino({
  level: process.env.OCOSAY_LOG_LEVEL || 'info',
  transport: {
    targets: [
      {
        target: 'pino/file',
        options: { destination: join(logDir, 'ocosay.log'), mkdir: false },
        level: 'info',
      },
    ],
  },
})

// 开发环境日志级别设为 debug
if (process.env.NODE_ENV !== 'production') {
  logger.level = 'debug'
}
