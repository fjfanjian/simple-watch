# 生产发布与回滚运行手册

## 发布前 No-Go

以下任一项未满足即停止发布：P0 服务器接管证据、P4 公网 IP HTTPS/防火墙、P8 ICP/DNS/四 SNI/证书、第三方镜像 RepoDigest、干净且已提交的 Git SHA、数据库一致备份、外部 smoke、回滚目标仍可用。

本地发布候选先执行：

```powershell
pwsh -File tools/testing/run-predeploy.ps1
pwsh -File tools/release/create-manifest.ps1
```

生产 manifest 必须使用 `-Production`；工作树未提交或不干净时脚本会拒绝生成。当前本地 manifest 只证明源码、锁文件、迁移和原生 RTC 二进制校验和，不替代 Linux 容器 RepoDigest/Image ID。

## 服务器发布顺序

1. 保存当前 release 指针、防火墙、Compose 渲染结果和健康基线。
2. 开启维护页，停止 app、worker、tusd 写入者。
3. 执行 SQLite 一致备份和恢复 smoke。
4. 校验 Secret 权限、第三方 RepoDigest、首方 Image ID、端口和 `docker compose config`。
5. `docker compose up -d --wait --wait-timeout 120`。
6. 内部执行 health、登录、join、VOD Range、WS、LiveKit、WHEP smoke。
7. 关闭维护页，执行外部四 SNI、TURN、UDP/TCP、未知 SNI 拒绝测试。
8. 观察 30 分钟后才完成发布；24 小时告警观察完成后关闭 P9。

## 分层回滚

单服务失败先切回 manifest 记录的上一不可变镜像。若迁移声明旧应用不兼容，则保持维护页、停止所有写入者，按备份手册恢复数据库；不得仅切旧应用。整机快照仅用于宿主、Docker 或既有服务无法恢复的场景，执行前必须再次确认，因为它会同时回退其他共存服务。
