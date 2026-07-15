# 备份与恢复运行手册

数据库必须通过 SQLite Backup API 生成一致快照，不得直接复制正在运行的数据库、WAL 或 SHM 文件。影片文件不进入备份；默认 RPO 为 24 小时、RTO 为 60 分钟。

本地/维护窗执行：

```powershell
pwsh -File tools/backup/backup-local.ps1 -DatabasePath C:\path\simplewatch.sqlite3
pwsh -File tools/backup/restore-smoke.ps1 -BackupDirectory artifacts\backups\<timestamp>
```

恢复生产库前必须先进入维护模式并停止 app、worker、tusd 写入者；保留故障数据库及其 WAL/SHM 现场。先在独立目录执行 SHA-256、`integrity_check`、`foreign_key_check` 和 schema 版本检查，通过后才允许原子切换数据库文件。恢复后先跑内部 smoke，再退出维护模式，并记录备份时间至故障时间之间可能丢失的会话、上传和元数据。

每日备份保留 7 份，每周备份保留 4 份。Secret 和证书只允许进入 `age` 加密包；媒体文件丢失时必须重新上传。
