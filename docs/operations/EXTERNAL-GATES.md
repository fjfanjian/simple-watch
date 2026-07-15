# 必须在外部环境关闭的门禁

本机测试不能替代以下证据：

- P0：普通 sudo 用户和 SFTP chroot 已在服务器通过；仍需阿里云 AccessKey 撤销、ActionTrail、快照、合规工单和旧服务 24 小时基线。
- P4：公网 IP TLS、443 扫描、内部网络隔离、容器硬化和 RTC 安全组 UDP 实际链路已通过；仍需可信证书、监控和最终最小化防火墙规则。
- P5/P6：公网 UDP LiveKit 与 H264/Opus WHIP 已通过；仍需不同真实设备/网络的 AEC、延迟、强制 TCP/TURN、Win/mac OBS、Opus stereo 和 60 分钟直播。
- P7：晚高峰连续三晚、4 路 8 Mbps VOD、CPU/内存/带宽/丢包、网络切换和主机重启。
- P8：个人 ICP、四个 A 记录、Web/TURN 证书、四 SNI、未知 SNI 拒绝、校园网 443、续期演练。
- P9：服务器真实发布、备份恢复、上一镜像回滚恢复、旧服务共存和恢复后 30 分钟观察已通过；仍需已提交 Git SHA 与最终版本 24 小时告警观察。

服务器阶段明细见 `docs/gates/SERVER-IP-DEPLOYMENT-20260714.md`。

上述证据未全部进入门禁矩阵前，发布结论必须保持 No-Go。
