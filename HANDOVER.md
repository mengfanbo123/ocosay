# ocosay 项目交接文档 - 2026-04-05

## 项目信息
- 路径: /mnt/d/dev/github/project/ocosay
- npm: @mingxy/ocosay

## 当前进度

### 已完成 ✅
1. 插件加载问题修复 (v1.0.6)
2. 环境变量支持 {env:VAR_NAME} (v1.0.7)
3. WSL音频支持代码（待发布）

### 进行中 🔄
**OpenCode启动成功弹窗功能**
- 已找到API: `input.client.showToast()`
- 需要在 src/plugin.ts 的 OcosayPlugin 初始化后调用
- 弹窗内容: "ocosay plugin loading success" + autoRead状态

### 待做
1. 完成弹窗功能实现
2. npm发布新版本

## 关键发现

### WSL音频方案
- WSL可调用Windows PowerShell播放音频
- 已实现: index.ts添加isWsl()检测，powershell-backend.ts处理路径转换
- 路径转换: /mnt/d/... → D:\...

### OpenCode弹窗API
```typescript
input.client.showToast({
  variant: 'success',
  title: 'Ocosay 插件加载成功',
  message: `自动朗读模式: ${config.autoRead ? '已开启' : '已关闭'}`
})
```

## 教训
- 实现功能后必须同步写测试
- baseURL是api.minimaxi.com（别改！）
- 工具函数要统一导出，避免重复定义
- naudiodon是native模块，必须在optionalDependencies中声明

## 下一步
新会话请查阅记忆: memory_id=5b4a6b50-5214-4884-8153-cb0c89909098
