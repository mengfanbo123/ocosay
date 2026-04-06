describe('logger.ts', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('should export a logger object with info, warn, error, debug methods', async () => {
    const { logger } = await import('../src/utils/logger')
    
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })

  it('should support info level logging', async () => {
    const { logger } = await import('../src/utils/logger')
    
    expect(() => logger.info('test message')).not.toThrow()
  })

  it('should support warn level logging', async () => {
    const { logger } = await import('../src/utils/logger')
    
    expect(() => logger.warn('test warning')).not.toThrow()
  })

  it('should support error level logging', async () => {
    const { logger } = await import('../src/utils/logger')
    
    expect(() => logger.error('test error')).not.toThrow()
  })

  it('should support debug level logging', async () => {
    const { logger } = await import('../src/utils/logger')
    
    expect(() => logger.debug('test debug')).not.toThrow()
  })

  it('should support structured logging with object and message', async () => {
    const { logger } = await import('../src/utils/logger')
    
    expect(() => logger.info({ key: 'value' }, 'message')).not.toThrow()
  })

  it('should support logging with just a message string', async () => {
    const { logger } = await import('../src/utils/logger')
    
    expect(() => logger.info('simple message')).not.toThrow()
  })
})
