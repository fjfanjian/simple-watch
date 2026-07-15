# OWASP Top 10 安全覆盖矩阵

权威执行入口为 `pnpm test:security`；详细攻击步骤位于 `TC-P7-004` 和 `tests/security/security.integration.test.ts`。生产依赖审计必须达到 high/critical 为零。

| OWASP 类别           | 自动化证据                                                          | 状态     |
| -------------------- | ------------------------------------------------------------------- | -------- |
| A01 访问控制失效     | 跨 Origin、缺 CSRF、成员踢人 IDOR、内部接口无凭据                   | PASS     |
| A02 加密机制失效     | Argon2id 密码校验、伪造 session/media token、timing-safe 内部 token | PASS     |
| A03 注入             | SQL 注入用户名、路径穿越、结构化 SQLite 参数                        | PASS     |
| A04 不安全设计       | 登录每 IP 固定窗口限流，且不信任 `X-Forwarded-For`                  | PASS     |
| A05 安全配置错误     | Caddy CSP、Permissions-Policy、nosniff、DENY frame、隐藏 Server     | PASS     |
| A06 易受攻击组件     | `pnpm audit --prod --audit-level high`                              | PASS     |
| A07 身份认证失效     | bootstrap 边界、错误凭据、过期/撤销会话、CSRF fail-closed           | PASS     |
| A08 软件和数据完整性 | 迁移 checksum、LiveKit webhook body SHA-256、发布 manifest          | PASS     |
| A09 日志和监控失效   | Fastify 结构化请求日志和部分 `audit_events`；生产告警尚需服务器验证 | EXTERNAL |
| A10 SSRF             | 业务 API 不接受远程 URL；元数据地址作为导入路径被 400 拒绝          | PASS     |

自动化覆盖为 9/10（90%）。A09 的本地结构化日志已存在，但告警送达和 24 小时观察必须在 P9 生产环境关闭，不能由本机结果代替。
