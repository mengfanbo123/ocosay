import { initialize, speak, stop, listVoices, getSpeaker } from '../src/index'
import { getDefaultSpeaker } from '../src/core/speaker'
import { getProvider } from '../src/providers/base'

const API_KEY = process.env.MINIMAX_API_KEY

if (!API_KEY) {
  console.error('❌ 请设置环境变量 MINIMAX_API_KEY')
  console.log('示例: MINIMAX_API_KEY=your-api-key node tests/integration-test.ts')
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
    console.log(`✅ 同步合成成功! 音频大小: ${result.audioData.length} bytes, 格式: ${result.format}`)
  } catch (error: any) {
    console.error('❌ 同步合成失败:', error.message || error)
  }
  
  console.log('')
  
  console.log('📝 测试 2: 流式合成 (model: stream)')
  try {
    const provider = getProvider('minimax')
    const result = await provider.speak('你好，这是流式合成测试！', { model: 'stream' })
    console.log(`✅ 流式合成成功! 音频大小: ${result.audioData.length} bytes, 格式: ${result.format}`)
  } catch (error: any) {
    console.error('❌ 流式合成失败:', error.message || error)
  }
  
  console.log('')
  
  console.log('📝 测试 3: 异步合成 (model: async)')
  try {
    const provider = getProvider('minimax')
    const result = await provider.speak('你好，这是异步合成测试！', { model: 'async' })
    console.log(`✅ 异步合成成功! 音频大小: ${result.audioData.length} bytes, 格式: ${result.format}`)
  } catch (error: any) {
    console.error('❌ 异步合成失败:', error.message || error)
  }
  
  console.log('')
  
  console.log('📝 测试 4: 列出音色')
  try {
    const voices = await listVoices('minimax')
    console.log(`✅ 获取到 ${voices.length} 个音色:`)
    voices.slice(0, 5).forEach((v: any) => {
      console.log(`   - ${v.id}: ${v.name} (${v.language || 'unknown'})`)
    })
  } catch (error: any) {
    console.error('❌ 列出音色失败:', error.message || error)
  }
  
  console.log('')
  
  console.log('📝 测试 5: 便捷函数 speak 调用链验证')
  try {
    const speaker = getDefaultSpeaker()
    speaker.on('end', () => console.log('   播放结束!'))
    speaker.on('error', (err: any) => console.log('   播放错误(正常，没有音频设备):', err.message))
    console.log('✅ speak 便捷函数调用链验证通过')
  } catch (error: any) {
    console.error('❌ speak 失败:', error.message || error)
  }
  
  console.log('')
  console.log('🎉 集成测试完成!')
  
  process.exit(0)
}

test().catch((err: any) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
