const { initialize } = require('../dist/index')
const { getProvider } = require('../dist/providers/base')

const API_KEY = process.env.MINIMAX_API_KEY

if (!API_KEY) {
  console.error('❌ 请设置环境变量 MINIMAX_API_KEY')
  console.log('示例: MINIMAX_API_KEY=your-api-key node tests/integration-test.js')
  process.exit(1)
}

async function test() {
  console.log('🔧 初始化 ocosay...')
  
  await initialize({
    providers: {
      minimax: {
        apiKey: API_KEY,
        voiceId: 'male-qn-qingse',
        model: 'stream'
      }
    }
  })
  
  console.log('✅ 初始化成功!\n')
  
  console.log('📝 测试 1: 同步合成 (model: sync)')
  try {
    const provider = getProvider('minimax')
    const result = await provider.speak('你好，这是同步合成测试！', { model: 'sync' })
    const data = Buffer.isBuffer(result.audioData) ? result.audioData : Buffer.from([])
    console.log('✅ 同步合成成功! 音频大小: ' + data.length + ' bytes, 格式: ' + result.format)
  } catch (error) {
    console.error('❌ 同步合成失败:', error.message || error)
  }
  
  console.log('')
  
  console.log('📝 测试 2: 流式合成 (model: stream)')
  try {
    const provider = getProvider('minimax')
    const result = await provider.speak('你好，这是流式合成测试！', { model: 'stream' })
    const data = Buffer.isBuffer(result.audioData) ? result.audioData : Buffer.from([])
    console.log('✅ 流式合成成功! 音频大小: ' + data.length + ' bytes, 格式: ' + result.format)
  } catch (error) {
    console.error('❌ 流式合成失败:', error.message || error)
  }
  
  console.log('')
  
  console.log('📝 测试 3: 异步合成 (model: async)')
  try {
    const provider = getProvider('minimax')
    const result = await provider.speak('你好，这是异步合成测试！', { model: 'async' })
    const data = Buffer.isBuffer(result.audioData) ? result.audioData : Buffer.from([])
    console.log('✅ 异步合成成功! 音频大小: ' + data.length + ' bytes, 格式: ' + result.format)
  } catch (error) {
    console.error('❌ 异步合成失败:', error.message || error)
  }
  
  console.log('')
  
  console.log('📝 测试 4: 列出音色')
  try {
    const provider = getProvider('minimax')
    const voices = await provider.listVoices()
    console.log('✅ 获取到 ' + voices.length + ' 个音色:')
    voices.slice(0, 5).forEach(v => {
      console.log('   - ' + v.id + ': ' + v.name + ' (' + (v.language || 'unknown') + ')')
    })
  } catch (error) {
    console.error('❌ 列出音色失败:', error.message || error)
  }
  
  console.log('')
  console.log('🎉 集成测试完成!')
  
  process.exit(0)
}

test().catch(err => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
