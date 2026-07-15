# P0–P9 门禁证据矩阵

| Gate | 当前状态           | 本地已完成                                                                                                        | 尚需关闭的硬门禁                                                                             |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| P0   | PARTIAL(server)    | `watchadmin` 公钥 sudo、`watchupload` 独立密钥 SFTP chroot/禁转发、root 与密码登录收紧、`sshd -t` 和第二会话通过  | 阿里云 AccessKey 撤销/ActionTrail、整机快照、root 密码轮换记录、合规工单、旧服务 24 小时基线 |
| P1   | PASS(local)        | Conda/Node 24.18/pnpm 10.33/FFmpeg 锁、workspace、统一 `verify`                                                   | 全新 clone 复演                                                                              |
| P2   | PASS               | SQLite checksum migration、管理员、房间、REST/WS/同步、14 个 API 集成用例                                         | 无                                                                                           |
| P3   | PASS(server-IP)    | 真实 tus、跨挂载 Worker 安全迁移、SFTP chroot `.part` 原子 rename/0660、稳定扫描入库、崩溃租约恢复、字幕/Range    | 无（IP 阶段）                                                                                |
| P4   | PARTIAL(server-IP) | 六容器健康/隔离与硬化；IP SAN TLS、443 扫描；安全组已放行且公网 TCP 7881/8189、实际 UDP 7882–7883/8189 已验证     | 可信证书、监控告警与正式最小化防火墙策略                                                     |
| P5   | PARTIAL(server)    | 本地 5 Chrome 语音与撤销/对账通过；服务器公网双成员 LiveKit 语音实际走 UDP 7882/7883                              | 五台真机 AEC/延迟、7881/TCP 强制回退、TURN/TLS 与家庭/校园/5G 多网络                         |
| P6   | PARTIAL(server)    | MediaMTX 鉴权/WHEP 通过；公网 Chrome WHIP 经 UDP 8189 实际发布 H264+Opus，OBS 配置 URL/token 生成通过             | Windows/macOS 真实 OBS、Opus stereo、TCP 回退与连续 60 分钟                                  |
| P7   | PASS(server-core)  | 公网真实 Chrome 登录/上传/字幕/建房/点播/双会话/只读权限、H264/Opus WHIP 与双成员语音通过；OWASP 9/10、覆盖率达标 | 三晚多网络容量、主机/容器重启、8 Mbps×4 连续 2 小时、生产日志告警送达                        |
| P8   | BLOCKED            | 域名切换与回滚检查表已固化                                                                                        | ICP、DNS、Web/TURN 证书、HAProxy/Coturn、四 SNI、校园网 443                                  |
| P9   | PARTIAL(server)    | 真实服务器发布、Image ID/RepoDigest、旧 MES 共存、SQLite 独立恢复、上一镜像回滚恢复；恢复镜像 30 分钟健康观察通过 | 已提交 Git SHA 与最终版本 24 小时告警观察                                                    |

本机正式部署前测试结论为 `PASS`；生产发布结论仍为 `NO-GO`。任何 `BLOCKED` 或外部硬门禁未关闭时，不得宣告正式发布完成。
