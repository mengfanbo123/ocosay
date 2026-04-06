const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const isWSL = fs.existsSync('/proc/version') && 
              fs.readFileSync('/proc/version', 'utf8').includes('Microsoft');
const platform = process.platform;

const log = {
  info: (msg) => console.log(`📦 ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`)
};

function checkCmd(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    const shell = platform === 'win32' ? 'powershell' : 'bash';
    const args = platform === 'win32' ? ['-Command', cmd] : ['-c', cmd];
    const proc = spawn(shell, args, { stdio: 'inherit' });
    proc.on('close', (code) => (code === 0 ? resolve() : reject()));
    proc.on('error', reject);
  });
}

async function installMacOS() {
  if (checkCmd('brew list portaudio')) {
    log.success('PortAudio 已安装 (macOS)');
    return true;
  }
  log.info('安装 PortAudio (macOS)...');
  try {
    await runCmd('brew install portaudio');
    return true;
  } catch {
    return false;
  }
}

async function installWSL() {
  if (checkCmd('dpkg -s libportaudio-dev')) {
    log.success('PortAudio 已安装 (WSL)');
    return true;
  }
  log.info('安装 PortAudio (WSL)...');
  try {
    await runCmd('sudo apt-get update && sudo apt-get install -y libportaudio-dev portaudio');
    return true;
  } catch {
    return false;
  }
}

async function installWindowsNative() {
  if (checkCmd('choco list --local-only portaudio')) {
    log.success('PortAudio 已安装 (Windows)');
    return true;
  }
  if (!checkCmd('where choco')) {
    log.warn('未检测到 choco，尝试直接安装...');
    return false;
  }
  log.info('安装 PortAudio (Windows)...');
  try {
    await runCmd('choco install portaudio -y');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('🔊 PortAudio 安装脚本');
  console.log('====================');
  console.log(`平台: ${platform}${isWSL ? ' (WSL)' : ''}`);
  console.log('');
  let success = false;
  
  if (isWSL) {
    success = await installWSL();
  } else if (platform === 'darwin') {
    success = await installMacOS();
  } else if (platform === 'win32') {
    success = await installWindowsNative();
  } else {
    log.error('不支持的平台');
  }

  if (success) {
    log.success('PortAudio 安装完成!');
    process.exit(0);
  } else {
    log.error('========================================');
    log.error('PortAudio 安装失败，请手动安装：');
    log.error('========================================');
    if (platform === 'darwin') {
      log.error('  brew install portaudio');
    } else if (isWSL) {
      log.error('  sudo apt-get install -y libportaudio-dev portaudio');
    } else if (platform === 'win32') {
      log.error('  choco install portaudio');
      log.error('  或下载: https://www.portaudio.com/download.html');
    }
    process.exit(1);
  }
}

main();
