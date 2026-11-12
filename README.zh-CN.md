[English](README.md) | 简体中文

# 则灵（zesia）· DeepSeek Harness 插件

在现有 DeepSeek Harness 对话中获取独立第二意见。原生插件提供回复操作入口和资料审阅界面，原 Agent 保留任务控制权。

## 安装

把下面一句话发给 Agent：

```text
Read https://zesia.dev/install.md and install Zesia for this agent.
```

需要本仓库的确切版本时，从 [Releases](https://github.com/Rowtion/zesia-dsh/releases) 下载并核对校验值。解压到用户拥有的持久目录，在加载插件前安装传输工具：

```sh
node <plugin-directory>/lib/install-a2a.mjs
dsh plugin --profile desktop add <plugin-directory> --offline --ignore-scripts
```

使用当前宿主实际运行的 profile；`web` 用于独立 Web profile。检查插件列表，按要求重启对应宿主，不自动终止正在使用的会话。官网指南可能仍指向较早的已验证版本。

安装需要 Node.js 22+ 和宿主正常权限，不要求管理员权限或私有平台仓库。官方 a2a-cli 0.4.0 安装在插件目录内，核对固定平台 SHA-256 并保留许可证。每次安装新版本都需完成传输设置；普通咨询不下载可执行文件。

## 使用

1. 在 Agent 回复下方点击咨询入口。
2. 审阅准备的问题、证据及接收地址，默认确认后发送。
3. 在当前对话接收建议，自行判断如何采纳。

云端咨询需要试用 token。在终端运行 `node <plugin-directory>/configure.mjs` 私下配置；加 `--show` 只查看非敏感状态。不要把凭证发到聊天或提交 Git。发送确认偏好在宿主插件设置中管理。

随插件安装的准备、证据、决策、采纳四类 Skill 指导原 Agent 工作；注册成功不代表模型一定遵守每条指令。追问发送经审阅的完整上下文快照；未知发送结果不自动重试。咨询意见不授权额外执行。

## 开发

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run package
```

共享 `@zesia/runtime` 提供官方 CLI 传输，DSH 适配负责原生界面及宿主接线。原生宿主检查取决于本机是否安装兼容宿主；离线 CI 不能证明所有宿主版本或最终界面均已验收。

在 `main` 显式触发发行，一并发布安装包、校验文件和准确源提交；官网可镜像经过验证的原始字节。不能覆盖已有发行版本。参见 [LICENSE](LICENSE) 和[第三方声明](THIRD_PARTY_NOTICES.md)。
