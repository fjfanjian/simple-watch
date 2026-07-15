import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as tus from "tus-js-client";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, ApiError, type MediaItem } from "../api.js";
import { useSession } from "../store.js";

export function AdminPage() {
  const { adminCsrf, setAdminCsrf, setRoomCsrf, setMemberId } = useSession();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const media = useQuery({
    queryKey: ["media"],
    queryFn: () => api<MediaItem[]>("/api/v1/media"),
    enabled: Boolean(adminCsrf),
    refetchInterval: 3000,
  });

  async function login(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api<{ csrfToken: string }>("/api/v1/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setAdminCsrf(result.csrfToken);
      setMessage("控制台已解锁");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "登录失败");
    }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await api<{
      room: { id: string };
      member: { id: string };
      csrfToken: string;
    }>("/api/v1/rooms", {
      method: "POST",
      headers: { "x-csrf-token": adminCsrf ?? "" },
      body: JSON.stringify({
        password: data.get("roomPassword"),
        hostNickname: data.get("nickname"),
        maxMembers: 5,
      }),
    });
    setRoomCsrf(result.csrfToken);
    setMemberId(result.member.id);
    void navigate(`/room/${result.room.id}`);
  }

  async function uploadFile(file: File) {
    if (!adminCsrf) return;
    setMessage("正在申请上传席位…");
    const auth = await api<{
      uploadId: string;
      tusEndpoint: string;
      uploadToken: string;
    }>("/api/v1/uploads/authorize", {
      method: "POST",
      headers: { "x-csrf-token": adminCsrf },
      body: JSON.stringify({
        filename: file.name,
        bytes: file.size,
        mime: file.type || "video/mp4",
      }),
    });
    await new Promise<void>((resolveUpload, rejectUpload) => {
      const upload = new tus.Upload(file, {
        endpoint: auth.tusEndpoint,
        headers: { "Upload-Token": auth.uploadToken },
        metadata: { filename: file.name, filetype: file.type || "video/mp4" },
        chunkSize: 16 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
        onProgress(bytesUploaded, bytesTotal) {
          setMessage(
            `上传中 ${Math.round((bytesUploaded / bytesTotal) * 100)}%`,
          );
        },
        onError: rejectUpload,
        onSuccess: () => resolveUpload(),
      });
      upload.start();
    });
    setMessage("上传完成，正在检查兼容性");
    await queryClient.invalidateQueries({ queryKey: ["media"] });
  }

  async function uploadSubtitle(mediaId: string, file: File) {
    if (!adminCsrf) return;
    await api(`/api/v1/admin/media/${mediaId}/subtitles`, {
      method: "POST",
      headers: { "x-csrf-token": adminCsrf },
      body: JSON.stringify({
        language: "zh-CN",
        label: file.name,
        content: await file.text(),
      }),
    });
    setMessage(`字幕 ${file.name} 已进入处理队列`);
    await queryClient.invalidateQueries({ queryKey: ["media"] });
  }

  if (!adminCsrf) {
    return (
      <main className="console-shell login-shell">
        <Link to="/" className="brand-mark">
          SW / 返回门厅
        </Link>
        <form className="login-card" onSubmit={login}>
          <p className="eyebrow">PROJECTIONIST ONLY</p>
          <h1>放映员控制台</h1>
          <label>
            账号
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            口令
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit">解锁控制台</button>
          <output aria-live="polite">{message}</output>
        </form>
      </main>
    );
  }

  return (
    <main className="console-shell">
      <header className="console-header">
        <div>
          <span className="brand-mark">SIMPLEWATCH</span>
          <h1>放映控制</h1>
        </div>
        <span className="status-pill">
          <i /> SYSTEM READY
        </span>
      </header>
      <div className="console-grid">
        <section className="panel room-panel">
          <div className="panel-title">
            <span>01</span>
            <h2>开启一场放映</h2>
          </div>
          <form onSubmit={createRoom} className="stack-form">
            <label>
              主持昵称
              <input
                name="nickname"
                required
                maxLength={24}
                defaultValue="Host"
              />
            </label>
            <label>
              房间口令
              <input
                name="roomPassword"
                required
                minLength={8}
                type="password"
              />
            </label>
            <button type="submit">建立五席放映室 →</button>
          </form>
        </section>
        <section className="panel upload-panel">
          <div className="panel-title">
            <span>02</span>
            <h2>送片入库</h2>
          </div>
          <label className="drop-zone">
            <input
              type="file"
              accept="video/mp4"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
            <strong>选择 MP4 影片</strong>
            <small>H.264 · AAC 48k · 双声道 · 1080p30</small>
          </label>
          <output className="upload-status" aria-live="polite">
            {message}
          </output>
        </section>
        <section className="panel media-panel">
          <div className="panel-title">
            <span>03</span>
            <h2>片库</h2>
            <b>{media.data?.length ?? 0} REELS</b>
          </div>
          <div className="media-list">
            {media.data?.map((item, index) => (
              <article key={item.id} className="media-row">
                <span className="reel-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{item.displayName}</h3>
                  <p>
                    {formatBytes(item.bytes)} ·{" "}
                    {item.durationMs
                      ? formatDuration(item.durationMs)
                      : "检查中"}
                  </p>
                </div>
                <span className={`media-state state-${item.state}`}>
                  {stateLabel(item.state)}
                </span>
                {item.state === "published" && (
                  <label className="subtitle-upload">
                    添加 WebVTT 字幕
                    <input
                      aria-label={`为 ${item.displayName} 添加字幕`}
                      type="file"
                      accept=".vtt,text/vtt"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadSubtitle(item.id, file);
                      }}
                    />
                  </label>
                )}
              </article>
            ))}
            {!media.data?.length && (
              <p className="empty-state">片架还是空的。先送来第一卷影片。</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function stateLabel(state: MediaItem["state"]) {
  return (
    {
      scanning: "检片中",
      compatible: "兼容",
      published: "可放映",
      incompatible: "不兼容",
      failed: "失败",
    } as const
  )[state];
}
