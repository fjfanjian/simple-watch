# SimpleWatch 正式部署前测试用例

本文档是测试步骤和预期结果的唯一权威来源；`tests/tracking/test-execution.csv` 只记录执行状态与证据路径。用例遵循 Arrange–Act–Assert。

## P1 开发环境

### TC-P1-001 隔离环境与锁文件

- 前置：已按 `environment.yml` 创建项目 Conda prefix。
- Arrange：进入仓库根目录，不激活全局 Node 环境。
- Act：运行 `pwsh -File tools/environment/run-dev.ps1 pnpm env:check`。
- Assert：Node 24、pnpm 10、FFmpeg 来自项目 prefix，缓存和临时目录位于仓库内，磁盘剩余不少于 30 GiB。

### TC-P1-002 仓库综合门禁

- Arrange：依赖与 OpenAPI 已生成。
- Act：运行 `pwsh -File tools/environment/run-dev.ps1 pnpm verify`。
- Assert：环境、计划、测试 ID、Lint、格式、类型、构建、单元、集成、安全、覆盖率、媒体、Worker、真实浏览器全栈、Range、Compose、RTC、备份、发布清单、OpenAPI 和 UI E2E 全部退出 0。

## P2 业务核心

### TC-P2-001 房间会话与容量

- Arrange：初始化管理员并登录。
- Act：创建房间，使用不同昵称加入至上限，再尝试重复昵称和第六名成员。
- Assert：前五名成功；重复昵称和超额成员被确定性错误码拒绝。

### TC-P2-002 主持状态机与幂等

- Arrange：主持人和成员均已加入。
- Act：提交相同 commandId、过期 revision、主持移交、踢人、密码轮换和关闭房间。
- Assert：相同命令返回原结果；冲突返回最新快照；权限和会话立即按状态变化。

### TC-P2-003 WebSocket 与时钟

- Arrange：有效房间 Cookie、可信 Origin 和 `simplewatch.v1` 子协议。
- Act：连接 WS，发送 hello、clock.ping 和 room.command。
- Assert：收到快照、四时间戳 pong 和 revision 广播；无效会话/Origin/子协议被关闭。

## P3 VOD 与上传

### TC-P3-001 tus 断点续传与半文件隔离

- Arrange：管理员取得 uploadToken，启动 API、tusd、Worker、Caddy。
- Act：POST 创建上传；PATCH 一半；HEAD 获取偏移；查询媒体库；PATCH 剩余字节。
- Assert：依次返回 201/204/200/204；HEAD 偏移等于首段字节；半文件不进入媒体库；完成后进入扫描队列。

### TC-P3-002 媒体兼容性与 Worker 发布

- Arrange：FFmpeg 生成 H.264/yuv420p/30fps + AAC/48k/stereo/faststart MP4。
- Act：Worker 执行 ffprobe、SHA-256 和原子移动。
- Assert：兼容样片发布至随机 storage key；非兼容编码或 moov 后置文件进入 inbox 并返回原因。

### TC-P3-003 受保护 Range

- Arrange：已发布媒体和有效管理员/房间会话。
- Act：请求 100 字节单 Range、越界 Range、多 Range、无 Cookie Range。
- Assert：依次为 206 且 100 字节、416、416、401；Node 不传输媒体字节。

### TC-P3-004 tus hook 与路径安全

- Arrange：有效 uploadToken 和内部 token。
- Act：调用 pre-create/post-finish 重复 hook、错误 uploadId、inbox 外 SFTP 路径。
- Assert：自定义 tus ID；完成 hook 幂等；token/ID 不匹配为 401；越界路径为 400。

### TC-P3-005 SFTP 稳定扫描

- Arrange：incoming 中放置完成文件和 `.part` 文件，完成文件 mtime 超过 120 秒。
- Act：间隔 60 秒执行两次扫描。
- Assert：只把两次属性稳定、regular、nlink=1 的完成文件原子移动至 inbox；`.part` 保留。

### TC-P3-006 WebVTT

- Arrange：已发布媒体和管理员会话。
- Act：提交 UTF-8 WebVTT；Worker 落盘；管理员和当前房间成员读取。
- Assert：换行规范化、大小受限、文件不可覆盖；未授权会话无法读取。

## P4–P6 协议与边缘

### TC-P4-001 本机 Compose 与原生服务拓扑

- Act：静态渲染本机 Compose，并原生同时启动 API、MediaMTX 与 LiveKit。
- Assert：Compose 无语法错误；三个真实服务健康，媒体和语音鉴权入口可用，内部控制接口不经边缘暴露。

### TC-P4-002 临时 IP HTTPS

- Act：外部检查证书链、HTTP 跳转、API/WSS、端口扫描和内部端口。
- Assert：受信证书；仅矩阵端口开放；app/tusd/内部 API 公网不可达。

### TC-P5-001 五人语音

- Act：五个浏览器加入语音，覆盖 UDP、7881/TCP、重连、踢人和丢 webhook。
- Assert：只有麦克风音频；被踢成员 20 秒内离开且不能重连；无摄像头、屏幕和 data track。

### TC-P5-002 五台真机与网络路径

- Arrange：准备五台真实终端，至少覆盖家庭宽带、校园网和 5G，TURN/TLS 443 已配置。
- Act：五人同时通话，分别强制 UDP、7881/TCP、TURN/TLS，执行断网恢复并记录 AEC、延迟和丢包。
- Assert：三类网络各有可用 ICE 路径；无持续回声；重连恢复且延迟、丢包在计划绿色阈值内。

### TC-P5-003 踢人双通道撤销与可靠重试

- Arrange：启动 API、Worker、LiveKit 与 MediaMTX；房间内存在已连接的 LiveKit 参与者和已登记的 MediaMTX 会话。
- Act：主持人踢出成员；Worker 领取两个 outbox 任务；分别模拟一次错误 lease 和一次下游失败后重试。
- Assert：错误 lease 被拒绝；LiveKit 参与者在 20 秒内被移除；MediaMTX 对该成员的全部会话执行 kick；旧媒体 JTI 无法再次鉴权；自托管 LiveKit 上用旧 token 重连的参与者会在下一轮 15 秒权威成员对账中再次移除；任务最终为 completed，失败任务在租约到期或 Worker 重启后仍可重领且不会重复产生业务副作用。

### TC-P6-001 OBS/WHEP

- Arrange：启动真实 MediaMTX 和 API，签发 WHEP/WHIP 凭据。
- Act：请求真实 WHEP 入口，并执行错误 action、path、JTI、session 和伪造 token 负例。
- Assert：有效凭据通过 MediaMTX HTTP 鉴权；错误凭据全部拒绝；MediaMTX 内部 API 不经公网暴露。

### TC-P6-002 双平台 OBS 与 60 分钟直播

- Arrange：Windows 和 macOS 各安装计划锁定版本的 OBS，网络开放 8189 UDP/TCP。
- Act：先以真实 Chrome Canvas 视频和麦克风音频执行自动化 WHIP 预检，要求 RTCStats 为 H264/Opus 且服务器确认 UDP 8189 双轨；再由两平台 OBS 分别发布 H.264/Opus stereo，浏览器连续 WHEP 观看 60 分钟并切换 UDP/TCP。
- Assert：自动化预检不得回退为纯音频或其他视频编码；OBS 音视频连续、声道正确；候选路径有效；VOD 与 LiveKit 语音不受影响，资源指标保持绿色。

## P7–P9 发布与恢复

### TC-P7-001 浏览器全流程

- Act：经真实 Caddy/API/tusd/Worker 执行管理员登录、UI 上传、字幕入队、建房、选片和第二浏览器入房；另执行桌面/移动视口、音量持久化和诊断脱敏测试。
- Assert：真实双会话关键流程通过；观众不能操作主持控件；桌面和移动端无横向溢出与控制台错误；诊断不包含 Cookie、JWT、密码或媒体凭据。

### TC-P7-002 安全与容量

- Act：运行依赖审计、OWASP 用例、5 人/单房间/磁盘配额、2 小时 VOD 和 60 分钟 RTC soak。
- Assert：无 P0/P1 缺陷；OWASP 覆盖目标达 90%；资源在预算内。

### TC-P7-003 测试套件完整性与后端覆盖率

- Arrange：媒体样片已生成，权威测试文档与执行 CSV 均存在。
- Act：运行 `pnpm test:ids` 和 `pnpm test:coverage`。
- Assert：测试 ID 双向一致且无重复；后端语句/行覆盖率不少于 80%、分支不少于 75%、函数不少于 85%。

### TC-P7-004 OWASP 安全回归

- Arrange：使用隔离 SQLite、测试管理员、房间成员和攻击载荷。
- Act：运行 `pnpm test:security`，覆盖访问控制、加密、注入、不安全设计、安全配置、依赖、认证、完整性、日志/监控和 SSRF 十类。
- Assert：至少九类具有自动化可执行证据；未认证、跨 Origin、CSRF、IDOR、路径穿越、token 重放和内部接口攻击均被拒绝；高危依赖为零。

### TC-P8-001 正式域名与 TURN

- Act：验证四个 SNI、未知 SNI、TURN/TLS 443、非开放 relay、证书续期演练。
- Assert：路由严格匹配；未知 SNI 拒绝；TURN 仅授权可用；续期不中断。

### TC-P9-001 本地发布清单

- Arrange：依赖锁、Conda 锁、迁移和原生 RTC 二进制均存在。
- Act：运行本地 release manifest 生成器。
- Assert：清单包含源码树、锁文件、全部迁移和 RTC 二进制 SHA-256；本地未提交状态明确标为 dirty。

### TC-P9-002 SQLite 备份与独立恢复

- Arrange：测试库包含当前全部迁移和业务样例。
- Act：使用 SQLite Backup API 生成备份，再复制到独立目录执行恢复校验。
- Assert：`integrity_check=ok`、外键违规为零、schema version 与源库一致，manifest 哈希匹配。

### TC-P9-003 生产发布、回滚与观察窗

- Act：执行发布、SQLite 一致备份、媒体清单、恢复、单服务回滚和主机重启。
- Assert：恢复后 integrity_check=ok；旧服务无回归；30 分钟和 24 小时观察无红色告警。
