# 微信免费提现券 AutoJs6 定时领取

脚本只领取“微信支付提现笔笔省”的每日免费提现券，不执行提现、支付或银行卡操作。`main.js` 保留了原设备上已验证的领取 `press` 坐标兜底。

## 环境要求

- Android 手机、微信和 AutoJs6。
- 已开启 AutoJs6 无障碍服务，并允许后台运行和自启动。
- 自动解锁为可选功能；安全锁屏不接受无障碍点击时，需要 Shizuku 或 Root 权限。
- 建议开启 AutoJs6 通知权限；任务会通知“领取成功、今日已领取、需检查或运行失败”。
- 微信界面和设备分辨率发生变化后，坐标兜底可能需要重新校准。

## 安装

1. 下载或克隆本仓库，将项目文件夹放入 AutoJs6 的脚本目录。
2. 在 AutoJs6 中打开该文件夹；`project.json` 会将 `main.js` 作为项目入口。
3. 若需要自动解锁，按照下一节创建仅保存在手机本地的配置文件。
4. 先在已解锁状态和锁屏状态下分别手动测试一次，再创建定时任务。

每次解锁后，脚本会通过 Shizuku 检查微信是否仍有后台进程；存在时只执行一次 `am force-stop com.tencent.mm`，确认停止后再冷启动微信，避免从睡前遗留页面继续操作。Shizuku 不可用时会记录警告并保留原启动流程。

## 本地 PIN 配置

自动解锁是可选功能。若运行时设备已经解锁，可以不创建 `unlockConfig.json`。

1. 将 `unlockConfig.example.json` 复制为 `unlockConfig.json`。
2. 把 `enabled` 改为 `true`，仅在本机文件中填写数字 PIN。
3. 不要提交 `unlockConfig.json`；项目的 `.gitignore` 已忽略它。
4. 默认仅通过 selector 点击 Android 锁屏数字键。若设备锁屏键盘不暴露无障碍节点，可在实机校准四行数字键的相对位置后，再将 `pinKeypadFallback.enabled` 和 `pinKeypadFallback.preferCoordinates` 改为 `true`。

脚本不会绕过系统锁屏，也不会重复尝试 PIN。PIN 错误或无法确认解锁时会立即安全退出。

本机安全锁屏会阻塞无障碍坐标点击，因此 `unlockConfig.json` 默认使用 `"tapMethod": "shizuku"`。请安装并启动 Shizuku（版本 11 或更高），然后在 AutoJs6 首页抽屉中开启 Shizuku 权限。它只通过 `input tap` 点击正常系统数字键盘，不会绕过 PIN。已 root 的设备也可改为 `"tapMethod": "root"`。

> 注意：`.gitignore` 只对 Git 客户端提交生效。使用 GitHub 网页的“Add files via upload”时，请勿手动选择或上传真实的 `unlockConfig.json`。

示例中的键盘坐标只是参考值，不保证适用于其他品牌、分辨率或系统版本。PIN 输入失败时脚本会停止，不会循环尝试。

## 配置每天 05:00

1. 把整个项目目录同步到手机并在 AutoJs6 中打开项目。
2. 手动运行一次，确认无障碍权限、后台弹出界面权限、微信页面和本机坐标兜底均正常。
3. 在 AutoJs6 的定时任务中新增“每日”任务，时间设为 `05:00`，脚本选择本项目的 `main.js`。
4. 在系统电池设置中允许 AutoJs6 后台运行/自启动，并关闭对 AutoJs6 的电池优化。
5. AutoJs6 新版本可在设置中选择定时任务调度引擎；请在本机先做一次短期锁屏定时测试，再投入凌晨无人值守运行。

任务结束时会发送一条静音系统通知。请在 Android 系统设置中允许 AutoJs6 发送通知；若通知权限关闭，领取流程仍会执行，但日志会提示无法发送通知。

结束时脚本会回退微信、返回桌面，并在 Android 9+ 上请求无障碍全局锁屏动作熄灭屏幕。若系统或 ROM 禁止该动作，日志会明确提示，而不会尝试 root 电源键。
