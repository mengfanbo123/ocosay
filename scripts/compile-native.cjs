const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const log = {
  info: (msg) => console.log(`📦 ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`)
};

function runCmd(cmd) {
  try {
    log.info(`执行: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (e) {
    return false;
  }
}

function main() {
  const naudiodonPath = path.join(__dirname, '..', 'node_modules', 'naudiodon');
  
  if (!fs.existsSync(naudiodonPath)) {
    log.info('naudiodon 未安装，跳过编译');
    return 0;
  }
  
  log.info('编译 naudiodon 原生模块...');
  
  const methods = [
    'npm rebuild naudiodon',
    'node-gyp rebuild'
  ];
  
  for (const method of methods) {
    if (runCmd(method)) {
      log.success('naudiodon 编译成功!');
      return 0;
    }
  }
  
  log.error('naudiodon 编译失败');
  log.info('插件仍可使用，但音频功能可能不可用');
  return 0;
}

main();
