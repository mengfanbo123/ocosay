import pino from 'pino'
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

const streams: pino.StreamEntry[] = [
  { stream: process.stdout },
]

try {
  streams.push({ stream: pino.destination({ dest: logFile, mkdir: true }) })
} catch {
  // fallback to stdout only
}

const level = process.env.NODE_ENV !== 'production' ? 'debug' : (process.env.OCOSAY_LOG_LEVEL || 'info')

export const logger = pino(
  {
    level,
    base: { service: 'ocosay' },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream(streams)
)
