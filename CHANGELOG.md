# Changelog

本项目的重要变更记录在此文件中，格式参考 Keep a Changelog。

## [Unreleased]

### Added

- 实现管理员、房间、成员、主持权、REST、WebSocket 和时钟同步核心流程。
- 实现 tus/SFTP 媒体导入、FFmpeg 兼容性检查、受保护 Range 和 WebVTT 字幕。
- 实现 MediaMTX WHIP/WHEP 节目直播、LiveKit 多人麦克风语音和 RTC 撤销对账。
- 实现 React 管理端与观影端、独立节目/通话音量、诊断和响应式界面。
- 提供本地与服务器 Compose、容器硬化、备份恢复、发布回滚和 P0–P9 门禁文档。
- 建立单元、集成、安全、覆盖率、媒体、RTC、浏览器及公网服务器测试套件。

### Fixed

- 修复跨文件系统媒体迁移、SFTP 稳定扫描和崩溃任务租约恢复。
- 修复 IP HTTPS 默认 SNI、默认 443 Origin、LiveKit 重连清退和多客户端语音协商。
- 修复媒体路径错误处理、Range 路由顺序及生产依赖安全问题。

### Security

- 使用只读根文件系统、最小 Linux capabilities、非特权容器和隔离网络部署服务。
- 实现 Secure/HttpOnly 会话、CSRF/Origin 校验、短期媒体凭据、路径限制和内部接口鉴权。
- 建立 OWASP 自动化回归、生产依赖审计和凭据不入库约束。
