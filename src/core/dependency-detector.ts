/**
 * dependency-detector.ts - 检测层
 * 捕获编译命令的 stderr 输出，解析缺失的头文件
 */

import { execSync } from 'child_process'

export interface DetectResult {
  missingHeaders: string[]
  rawOutput: string
}

/**
 * 从编译错误输出中解析缺失的头文件路径
 * 匹配模式: "fatal error: alsa/asoundlib.h: No such file or directory"
 */
export function parseMissingHeaders(errorOutput: string): string[] {
  const pattern = /fatal error:\s+([^:]+):\s+No such file or directory/g
  const headers: string[] = []
  let match: RegExpExecArray | null = pattern.exec(errorOutput)
  while (match !== null) {
    headers.push(match[1])
    match = pattern.exec(errorOutput)
  }

  return headers
}

/**
 * 执行命令并捕获输出，不抛错
 */
export function execCapture(cmd: string, cwd?: string): { success: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { success: true, stdout, stderr: '' }
  } catch (err) {
    const error = err as { stdout?: Buffer | string; stderr?: Buffer | string }
    return {
      success: false,
      stdout: error.stdout ? error.stdout.toString() : '',
      stderr: error.stderr ? error.stderr.toString() : '',
    }
  }
}

/**
 * 检测命令执行后的缺失依赖
 */
export function detectMissingDependencies(cmd: string, cwd?: string): DetectResult {
  const result = execCapture(cmd, cwd)
  const missingHeaders = parseMissingHeaders(result.stderr)

  return {
    missingHeaders,
    rawOutput: result.stderr,
  }
}
