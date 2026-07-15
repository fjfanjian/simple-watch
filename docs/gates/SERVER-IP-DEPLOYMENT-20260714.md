# 服务器 IP 阶段部署记录（2026-07-14）

目标实例：`8.134.239.34`（Ubuntu 22.04，2C/3.4 GiB）。发布目录为 `/opt/simplewatch/releases/20260714-1849`，当前链接为 `/opt/simplewatch/current`，持久数据位于 `/srv/simplewatch`。

## 已验证

- app、worker、Caddy、tusd、MediaMTX、LiveKit 六个容器运行；app/Caddy 健康检查通过。
- 公网 `https://8.134.239.34/health/ready` 返回 200，IP SAN RSA 测试证书可完成 TLS；CSP、HSTS、Permissions-Policy、nosniff、DENY 等响应头存在。
- 公网真实 Chrome 完成管理员登录、tus 上传、FFprobe 入库、WebVTT、建房、点播、第二成员加入及成员只读控制，证据为 `artifacts/predeploy/server-public-core-e2e-hardened.log`。
- 阿里云安全组放行后，公网 TCP 443、7881、8189 均可达；双成员 LiveKit 语音实际选择 UDP 7882/7883，证据为 `artifacts/predeploy/server-public-voice-udp-evidence.log`。
- 公网真实 Chrome 生成 OBS 配置并向 WHIP 发布确定性视频和音频，浏览器 RTCStats 断言 H264/Opus，MediaMTX 日志确认经 UDP 8189 收到 `2 tracks (H264, Opus)`；完整用例继续通过双成员语音，证据为 `artifacts/predeploy/server-public-full-e2e-whip-h264.log` 与 `artifacts/predeploy/server-public-whip-h264-evidence.log`。
- SFTP 独立密钥登录、chroot `/srv/simplewatch/sftp`、默认目录 `/incoming`、`.part` 原子 rename、文件 `0660`、两次稳定扫描、跨挂载移动、崩溃租约恢复与最终 published 入库全部通过。专用私钥保存在本机 `C:\Users\fj\.ssh\simplewatch_watchupload_ed25519_v3`，证据为 `artifacts/predeploy/server-sftp-import.log`。
- `watchadmin` 公钥登录及免密 sudo 第二会话通过；root 密码登录、普通密码登录和键盘交互登录已禁用，root 公钥应急入口保留。
- 六个容器均为非 privileged、只读根文件系统、`no-new-privileges`、drop all capabilities；仅 Caddy 恢复 `CAP_NET_BIND_SERVICE`。Caddy 与 tusd 的 Linux RepoDigest 已记录。
- SQLite Backup API 备份及独立打开校验通过：`integrity=ok`、外键违规 0、schema `004`。最终备份证据为 `artifacts/predeploy/server-final-backup.json`。
- app/worker 已真实切换到上一镜像并通过健康检查，再恢复当前镜像且公网 ready=200；证据为 `artifacts/predeploy/server-rollback-rehearsal.log`。
- 恢复后的 app 镜像在精确 1800 秒采样时仍为 healthy，公网 ready=200，六容器资源占用正常；证据为 `artifacts/predeploy/server-30min-observation.log`。
- 既有 `circular-loom-mes-web` 保持运行；既有 `circular-loom-mes-gateway` 的周期性重启是部署前已存在状态，本次未修改。

## 当前阻断

安全组 RTC 端口阻断已关闭。当前自动化证据覆盖公网 UDP LiveKit 与 UDP WHIP；尚未覆盖强制 7881/TCP、8189/TCP 回退、TURN/TLS 443、多网络真机以及 Windows/macOS 真实 OBS 的 60 分钟发布。正式验证应将安全组来源收敛到计划允许的 CIDR，并记录最终最小化规则。

正式域名阶段仍需 ICP、可信 Web 证书、Coturn/TURN TLS 443 和计划约定的 relay 端口，当前自签 IP 证书不能作为正式证书。

## 仍需人工/外部证据

- 阿里云 AccessKey 撤销、ActionTrail 检查、整机快照与产品合规工单；
- 五台真机、家庭/校园/5G、强制 TCP/TURN 回退、Windows/macOS OBS 及 60 分钟直播；
- 三晚高峰、四路 8 Mbps、重启/网络切换与 24 小时告警观察；
- 域名、ICP、四 SNI、可信证书、TURN 和续期演练；
- 正式 Git SHA 及最终发布后 24 小时观察窗；当前恢复镜像的 30 分钟健康观察已通过。

因此服务器 IP 阶段核心功能为 PASS，但正式生产发布仍为 **NO-GO**。
