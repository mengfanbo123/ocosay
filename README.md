# @mingxy/ocosay

OpenCode MiniMax TTS 插件，支持语音合成与播放。

## 安装

```bash
npm install -g @mingxy/ocosay
```

> ✅ 安装过程自动完成 PortAudio 依赖检测与编译

---

## ⚠️ 自动安装失败时

如果终端出现 PortAudio 相关错误，请手动安装：

### macOS

```bash
brew install portaudio
```

### Windows WSL

```bash
sudo apt-get install -y libportaudio-dev portaudio
```

### Windows 原生

```powershell
choco install portaudio
```

安装完成后重新运行：

```bash
npm install -g @mingxy/ocosay
```

---

## 验证

```bash
node -e "require('naudiodon')"
```

无报错即成功。

---

## 配置

在 OpenCode 配置文件中添加：

```json
{
  "plugins": ["@mingxy/ocosay"]
}
```

---

## 故障排除

| 问题 | 解决 |
|------|------|
| Cannot find module 'naudiodon' | 运行 `npm rebuild naudiodon` |
| 音频播放无声 | 检查系统音频设备 |
| 其他错误 | 运行诊断：`node scripts/verify-audio.js` |

---

## 平台支持

| 平台 | 状态 |
|------|------|
| macOS | ✅ |
| Windows WSL | ✅ |
| Windows 原生 | ⚠️ |
