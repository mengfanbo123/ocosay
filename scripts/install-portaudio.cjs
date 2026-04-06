const { execSync, spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');

const platform = process.platform;
const isWSL = fs.existsSync('/proc/version') && 
              fs.readFileSync('/proc/version', 'utf8').includes('Microsoft');

const log = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[OK] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`)
};

function exec(cmd, ignoreError = false) {
  try {
    const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
    return { success: true, output };
  } catch (err) {
    if (ignoreError) return { success: false, output: '' };
    return { success: false, output: err.message };
  }
}

function askPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('需要 sudo 权限，请输入密码: ', (password) => {
      rl.close();
      resolve(password);
    });
  });
}

async function runWithSudo(cmd) {
  // 先尝试直接运行（可能已缓存密码）
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch { /* 继续尝试密码 */ }

  // 需要密码
  const password = await askPassword();
  if (!password) {
    log.error('未输入密码，安装取消');
    return false;
  }

  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', `echo "${password}" | sudo -S ${cmd}`], {
      stdio: 'inherit'
    });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function execCmd(cmd) {
  return new Promise((resolve) => {
    const shell = platform === 'win32' ? 'powershell' : 'bash';
    const args = platform === 'win32' ? ['-Command', cmd] : ['-c', cmd];
    const proc = spawn(shell, args, { stdio: 'inherit' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

function checkAlsa() {
  const result = exec('which aplay');
  if (result.success) {
    const aplayOutput = exec('aplay -l');
    if (aplayOutput.success && !aplayOutput.output.includes('no soundcards')) {
      return { available: true, type: 'alsa', command: result.output.trim() };
    }
  }
  return { available: false, type: null, command: result.success ? result.output.trim() : null };
}

async function installAlsaUtils() {
  log.info('安装 alsa-utils...');
  return runWithSudo('apt-get update && apt-get install -y alsa-utils');
}

async function installPortAudioDev() {
  log.info('安装 libportaudio-dev...');
  return runWithSudo('apt-get update && apt-get install -y libportaudio-dev');
}

function testAlsaPlayback() {
  const result = exec('aplay -l');
  if (!result.success) return { success: false, reason: 'aplay 命令不可用' };
  if (result.output.includes('no soundcards') || result.output.includes('no devices')) {
    return { success: false, reason: '没有音频设备' };
  }
  return { success: true, devices: result.output };
}

async function main() {
  console.log('=== 音频环境检测与安装脚本 ===');
  console.log(`平台: ${platform}${isWSL ? ' (WSL)' : ''}`);
  console.log('');

  // 步骤1: 检测 alsa
  log.info('检测 alsa...');
  const alsa = checkAlsa();
  if (alsa.available) {
    log.success(`alsa 可用: ${alsa.command}`);
    const test = testAlsaPlayback();
    if (test.success) {
      log.success('alsa 播放设备检测通过:');
      console.log(test.devices);
      log.success('=== 音频环境就绪 ===');
      process.exit(0);
    } else {
      log.warn(`alsa 测试失败: ${test.reason}`);
    }
  } else {
    log.warn('alsa 未安装');
  }

  // 步骤2: 安装 alsa-utils
  log.info('安装 alsa-utils...');
  const installed = await installAlsaUtils();
  if (!installed) {
    log.error('alsa-utils 安装失败');
    process.exit(1);
  }
  log.success('alsa-utils 安装成功');

  // 步骤3: 重新检测
  const alsa2 = checkAlsa();
  if (alsa2.available) {
    const test = testAlsaPlayback();
    if (test.success) {
      log.success('alsa 播放设备检测通过:');
      console.log(test.devices);
      log.success('=== 音频环境就绪 ===');
      process.exit(0);
    } else {
      log.warn(`检测到 alsa 但无播放设备: ${test.reason}`);
    }
  }

  // 步骤4: WSL 安装 PortAudio
  if (isWSL) {
    log.info('安装 libportaudio-dev...');
    await installPortAudioDev();
  }

  // 最终检测
  const alsa3 = checkAlsa();
  if (alsa3.available) {
    const test = testAlsaPlayback();
    if (test.success) {
      log.success('=== 音频环境就绪 ===');
      process.exit(0);
    }
  }

  log.error('=== 无法配置音频环境 ===');
  if (isWSL) {
    log.error('WSL 没有音频设备');
    log.error('方案: 配置 Windows 音频转发或手动安装音频驱动');
  }
  process.exit(1);
}

main();
