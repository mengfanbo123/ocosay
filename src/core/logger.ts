/**
 * 统一日志模块
 * 支持日志级别、控制台输出、文件输出
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

export interface LoggerConfig {
  /** 最小日志级别，低于此级别的日志不输出 */
  minLevel?: LogLevel;
  /** 是否输出到控制台 */
  console?: boolean;
  /** 日志文件路径，为空则不输出到文件 */
  filePath?: string;
  /** 日志文件最大大小(bytes)，超过则轮转 */
  maxFileSize?: number;
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  args?: unknown[];
}

export class Logger {
  private minLevel: LogLevel;
  private consoleEnabled: boolean;
  private filePath?: string;
  private maxFileSize: number;
  private writeStream?: import('fs').WriteStream;

  constructor(config: LoggerConfig = {}) {
    this.minLevel = config.minLevel ?? LogLevel.INFO;
    this.consoleEnabled = config.console ?? true;
    this.filePath = config.filePath;
    this.maxFileSize = config.maxFileSize ?? 10 * 1024 * 1024;

    if (this.filePath) {
      this.initFileStream();
    }
  }

  private initFileStream(): void {
    if (!this.filePath) return;

    import('fs').then((fs) => {
      this.writeStream = fs.createWriteStream(this.filePath!, { flags: 'a' });
    }).catch(() => {});
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.minLevel];
  }

  private formatTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private formatMessage(level: LogLevel, message: string, args?: unknown[]): string {
    const timestamp = this.formatTimestamp(new Date());
    const formattedArgs = args?.length ? ' ' + args.map((a) => this.stringify(a)).join(' ') : '';
    return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
  }

  private stringify(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.message}\n${value.stack}`;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private log(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const formatted = this.formatMessage(entry.level, entry.message, entry.args);

    if (this.consoleEnabled) {
      this.writeToConsole(entry.level, formatted);
    }

    if (this.writeStream) {
      this.writeToFile(formatted + '\n');
    }
  }

  private writeToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
    }
  }

  private writeToFile(message: string): void {
    if (this.writeStream) {
      this.writeStream.write(message);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log({ timestamp: new Date(), level: LogLevel.DEBUG, message, args });
  }

  info(message: string, ...args: unknown[]): void {
    this.log({ timestamp: new Date(), level: LogLevel.INFO, message, args });
  }

  warn(message: string, ...args: unknown[]): void {
    this.log({ timestamp: new Date(), level: LogLevel.WARN, message, args });
  }

  error(message: string, ...args: unknown[]): void {
    this.log({ timestamp: new Date(), level: LogLevel.ERROR, message, args });
  }

  /**
   * 关闭日志系统，释放文件流
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = undefined;
    }
  }
}

import { homedir } from 'os';
import { join } from 'path';

const logPath = join(homedir(), '.ocosay', 'ocosay.log');
export const logger = new Logger({
  minLevel: LogLevel.DEBUG,
  console: true,
  filePath: logPath,
});
