/**
 * Audio Backend Interface
 * 音频后端接口定义 - 统一各平台音频播放实现
 */

/**
 * 音频后端接口
 * 定义各平台音频后端必须实现的方法
 */
export interface AudioBackend {
  /** 后端名称 */
  readonly name: string
  
  /** 是否支持真正的流式播放（边收边播） */
  readonly supportsStreaming: boolean
  
  /**
   * 开始播放音频文件
   * @param filePath 音频文件路径
   */
  start(filePath: string): void
  
  /**
   * 写入音频数据块（用于流式播放）
   * @param chunk 音频数据块
   */
  write(chunk: Buffer): void
  
  /**
   * 结束写入，关闭流
   */
  end(): void
  
  /**
   * 暂停播放
   */
  pause(): void
  
  /**
   * 恢复播放
   */
  resume(): void
  
  /**
   * 停止播放
   */
  stop(): void
  
  /**
   * 获取当前播放位置（秒）
   * 如果不支持返回 undefined
   */
  getCurrentTime?(): number | undefined
  
  /**
   * 获取音频总时长（秒）
   * 如果不支持返回 undefined
   */
  getDuration?(): number | undefined
  
  /**
   * 设置音量
   * @param volume 音量 0.0 - 1.0
   */
  setVolume?(volume: number): void
  
  /**
   * 销毁后端，释放资源
   */
  destroy(): void
}

/**
 * 音频后端事件回调接口
 */
export interface AudioBackendEvents {
  /** 开始播放回调 */
  onStart?: () => void
  
  /** 播放结束回调 */
  onEnd?: () => void
  
  /** 错误回调 */
  onError?: (error: Error) => void
  
  /** 暂停回调 */
  onPause?: () => void
  
  /** 恢复回调 */
  onResume?: () => void
  
  /** 停止回调 */
  onStop?: () => void
  
  /** 进度回调（已写入字节数） */
  onProgress?: (bytesWritten: number) => void
}

/**
 * 后端配置选项
 */
export interface BackendOptions {
  /** 音频格式 (mp3, wav, flac) */
  format?: 'mp3' | 'wav' | 'flac'
  
  /** 采样率 (如 16000, 44100) */
  sampleRate?: number
  
  /** 声道数 (1 = 单声道, 2 = 立体声) */
  channels?: number
  
  /** 音量 0.0 - 1.0 */
  volume?: number
  
  /** 事件回调 */
  events?: AudioBackendEvents
}
