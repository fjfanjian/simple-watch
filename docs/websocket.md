# SimpleWatch WebSocket v1

房间实时连接地址为 `/api/v1/rooms/:roomId/ws`。客户端必须携带有效的 `sw_room`
Cookie、受信任的 `Origin`，并协商子协议 `simplewatch.v1`。

所有消息使用统一 envelope：

```ts
type Envelope<T> = {
  v: 1;
  type: string;
  id: string;
  roomId: string;
  sentAtMs: number;
  payload: T;
};
```

当前已实现：

- 客户端：`room.hello`、`clock.ping`、`room.command`。
- 服务端：`room.snapshot`、`clock.pong`、`host.changed`、
  `room.command.rejected`。
- `room.command` 使用 `commandId` 实现 10 分钟持久化幂等；
  `expectedRevision` 冲突时返回最新 snapshot。
- 服务端每 20 秒发送 WebSocket ping，60 秒未收到 pong 时以 4001 关闭。
- 每连接每秒最多接收 20 条消息，超限以 4008 关闭。

关闭码：

| 代码 | 含义                       |
| ---- | -------------------------- |
| 4001 | 会话失效、被踢或心跳超时   |
| 4003 | 权限不足                   |
| 4008 | 消息速率超限               |
| 4010 | 房间关闭                   |
| 1012 | 服务重启，客户端应退避重连 |
