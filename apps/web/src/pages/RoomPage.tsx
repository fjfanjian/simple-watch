import { useQuery } from "@tanstack/react-query";
import type { Room as LiveKitRoom } from "livekit-client";
import { v7 as uuidv7 } from "uuid";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, ApiError, type MediaItem, type RoomSnapshot } from "../api.js";
import { loadPreferences, savePreferences } from "../preferences.js";
import { useSession } from "../store.js";

export function RoomPage() {
  const { roomId = "" } = useParams();
  const { adminCsrf, roomCsrf, setRoomCsrf, memberId, setMemberId } =
    useSession();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const voiceRoomRef = useRef<LiveKitRoom | null>(null);
  const voiceTracksRef = useRef<HTMLDivElement | null>(null);
  const liveReaderRef = useRef<{ close(): void } | null>(null);
  const [voiceState, setVoiceState] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [publishConfig, setPublishConfig] = useState<{
    url: string;
    token: string;
  } | null>(null);
  const isHost = Boolean(snapshot && memberId === snapshot.hostMemberId);
  const media = useQuery({
    queryKey: ["room-media", snapshot?.media?.id],
    queryFn: () => api<MediaItem>(`/api/v1/media/${snapshot?.media?.id ?? ""}`),
    enabled: Boolean(snapshot?.media?.id),
  });
  const library = useQuery({
    queryKey: ["media"],
    queryFn: () => api<MediaItem[]>("/api/v1/media"),
    enabled: isHost && Boolean(adminCsrf),
  });

  useEffect(() => {
    let active = true;
    void api<{ snapshot: RoomSnapshot; memberId: string; csrfToken: string }>(
      `/api/v1/rooms/${roomId}/bootstrap`,
    )
      .then((bootstrap) => {
        if (!active) return;
        setRoomCsrf(bootstrap.csrfToken);
        setMemberId(bootstrap.memberId);
        setSnapshot(bootstrap.snapshot);
        setJoined(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [roomId, setMemberId, setRoomCsrf]);

  useEffect(() => savePreferences(preferences), [preferences]);

  useEffect(() => {
    if (videoRef.current)
      videoRef.current.volume = preferences.programVolume / 100;
  }, [preferences.programVolume, snapshot?.mode]);

  useEffect(() => {
    voiceTracksRef.current
      ?.querySelectorAll<HTMLAudioElement>("audio[data-participant-id]")
      .forEach((element) => {
        element.volume = remoteVolume(
          element.dataset.participantId ?? "",
          preferences,
        );
      });
  }, [preferences]);

  useEffect(() => {
    if (!preferences.pushToTalk || voiceState !== "connected") return;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat && !isTyping(event.target))
        void voiceRoomRef.current?.localParticipant
          .setMicrophoneEnabled(true)
          .then(() => setMicrophoneEnabled(true));
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTyping(event.target))
        void voiceRoomRef.current?.localParticipant
          .setMicrophoneEnabled(false)
          .then(() => setMicrophoneEnabled(false));
    };
    void voiceRoomRef.current?.localParticipant
      .setMicrophoneEnabled(false)
      .then(() => setMicrophoneEnabled(false));
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, [preferences.pushToTalk, voiceState]);

  useEffect(() => {
    sessionStorage.setItem(
      "simplewatch.room-state",
      JSON.stringify({
        roomId: roomId.slice(0, 8),
        connected,
        voiceState,
        revision: snapshot?.revision ?? null,
      }),
    );
  }, [connected, roomId, snapshot?.revision, voiceState]);

  useEffect(() => {
    if (!joined) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${location.host}/api/v1/rooms/${roomId}/ws`,
      "simplewatch.v1",
    );
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      setConnected(true);
      socket.send(JSON.stringify(envelope(roomId, "room.hello", {})));
    });
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        type: string;
        payload: unknown;
      };
      if (message.type === "room.snapshot" || message.type === "host.changed") {
        setSnapshot(message.payload as RoomSnapshot);
      }
      if (message.type === "room.command.rejected")
        setError("操作未生效，状态已刷新");
    });
    return () => socket.close(1000, "page leave");
  }, [joined, roomId]);

  useEffect(() => {
    const video = videoRef.current;
    const transport = snapshot?.transport;
    if (!video || !transport) return;
    const desired =
      transport.positionSec +
      (transport.state === "playing"
        ? ((Date.now() - transport.anchoredAtServerMs) / 1000) * transport.rate
        : 0);
    if (Math.abs(video.currentTime - desired) > 0.8)
      video.currentTime = Math.max(0, desired);
    video.playbackRate = transport.rate;
    if (transport.state === "playing") void video.play().catch(() => undefined);
    else video.pause();
  }, [snapshot?.revision, snapshot?.transport]);

  useEffect(
    () => () => {
      voiceRoomRef.current?.disconnect();
      voiceRoomRef.current = null;
      liveReaderRef.current?.close();
      liveReaderRef.current = null;
    },
    [],
  );

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ member: { id: string }; csrfToken: string }>(
        `/api/v1/rooms/${roomId}/join`,
        {
          method: "POST",
          body: JSON.stringify({
            nickname: data.get("nickname"),
            password: data.get("password"),
          }),
        },
      );
      setRoomCsrf(result.csrfToken);
      setMemberId(result.member.id);
      const bootstrap = await api<{
        snapshot: RoomSnapshot;
        memberId: string;
        csrfToken: string;
      }>(`/api/v1/rooms/${roomId}/bootstrap`);
      setRoomCsrf(bootstrap.csrfToken);
      setMemberId(bootstrap.memberId);
      setSnapshot(bootstrap.snapshot);
      setJoined(true);
    } catch (joinError) {
      setError(
        joinError instanceof ApiError ? joinError.message : "无法加入房间",
      );
    }
  }

  function command(commandPayload: Record<string, unknown>) {
    if (!snapshot || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(
      JSON.stringify(
        envelope(roomId, "room.command", {
          commandId: uuidv7(),
          expectedRevision: snapshot.revision,
          effectiveAtServerMs: Date.now() + 750,
          command: commandPayload,
        }),
      ),
    );
  }

  async function enableVoice() {
    if (!roomCsrf || voiceState === "connecting") return;
    setVoiceState("connecting");
    setError("");
    try {
      // connect() and microphone permission remain in this click call chain so
      // browsers may resume audio playback without a separate hidden gesture.
      const credential = await api<{
        url: string;
        token: string;
      }>(`/api/v1/rooms/${roomId}/credentials`, {
        method: "POST",
        headers: { "x-csrf-token": roomCsrf },
        body: JSON.stringify({ purpose: "voice" }),
      });
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const voiceRoom = new Room({ adaptiveStream: true, dynacast: true });
      voiceRoom.on(
        RoomEvent.TrackSubscribed,
        (track, _publication, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const element = track.attach() as HTMLAudioElement;
          element.dataset.simplewatchVoice = "remote";
          element.dataset.participantId = participant.identity;
          element.volume = remoteVolume(participant.identity, preferences);
          voiceTracksRef.current?.append(element);
        },
      );
      voiceRoom.on(RoomEvent.TrackUnsubscribed, (track) => track.detach());
      voiceRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const video = videoRef.current;
        if (video && preferences.autoDuck)
          video.volume =
            (preferences.programVolume / 100) * (speakers.length ? 0.4 : 1);
      });
      voiceRoom.on(RoomEvent.Disconnected, () => {
        setVoiceState("idle");
        setMicrophoneEnabled(false);
      });
      await voiceRoom.connect(credential.url, credential.token, {
        autoSubscribe: true,
      });
      await voiceRoom.startAudio();
      await voiceRoom.localParticipant.setMicrophoneEnabled(
        true,
        preferences.inputDeviceId
          ? { deviceId: preferences.inputDeviceId }
          : undefined,
      );
      voiceRoomRef.current = voiceRoom;
      if (snapshot?.mode === "live") await enableLiveProgram();
      setMicrophoneEnabled(true);
      setVoiceState("connected");
    } catch (voiceError) {
      voiceRoomRef.current?.disconnect();
      voiceRoomRef.current = null;
      setVoiceState("error");
      setError(
        voiceError instanceof Error ? voiceError.message : "语音连接失败",
      );
    }
  }

  async function enableLiveProgram() {
    if (!roomCsrf || liveReaderRef.current) return;
    const credential = await api<{ url: string; token: string }>(
      `/api/v1/rooms/${roomId}/credentials`,
      {
        method: "POST",
        headers: { "x-csrf-token": roomCsrf },
        body: JSON.stringify({ purpose: "whep" }),
      },
    );
    await import("../vendor/mediamtx-reader.js");
    liveReaderRef.current = new window.MediaMTXWebRTCReader({
      url: credential.url,
      user: "",
      pass: "",
      token: credential.token,
      onTrack: (event) => {
        const video = videoRef.current;
        if (!video) return;
        const stream =
          event.streams[0] ?? new MediaStream(event.track ? [event.track] : []);
        video.srcObject = stream;
        void video.play().catch(() => undefined);
      },
      onError: (readerError) => setError(`直播信号中断：${readerError}`),
    });
  }

  async function toggleMicrophone() {
    const room = voiceRoomRef.current;
    if (!room) return;
    const next = !microphoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicrophoneEnabled(next);
  }

  async function moderate(action: "kick" | "handoff", targetMemberId: string) {
    if (
      !roomCsrf ||
      !confirm(action === "kick" ? "确认移出这位成员？" : "确认移交主持权？")
    )
      return;
    const path =
      action === "kick"
        ? `/api/v1/rooms/${roomId}/members/${targetMemberId}/kick`
        : `/api/v1/rooms/${roomId}/host/handoff`;
    const result = await api<RoomSnapshot | undefined>(path, {
      method: "POST",
      headers: { "x-csrf-token": roomCsrf },
      body: JSON.stringify(
        action === "kick" ? { reason: "host_removed" } : { targetMemberId },
      ),
    });
    if (result) setSnapshot(result);
  }

  async function requestPublishConfig() {
    if (!roomCsrf) return;
    const result = await api<{ url: string; token: string }>(
      `/api/v1/rooms/${roomId}/live/publish-config`,
      {
        method: "POST",
        headers: { "x-csrf-token": roomCsrf },
        body: "{}",
      },
    );
    setPublishConfig(result);
  }

  function setParticipantVolume(id: string, value: number) {
    const next = {
      ...preferences,
      participantVolumes: { ...preferences.participantVolumes, [id]: value },
    };
    setPreferences(next);
    voiceTracksRef.current
      ?.querySelectorAll<HTMLAudioElement>(
        `audio[data-participant-id="${CSS.escape(id)}"]`,
      )
      .forEach((element) => {
        element.volume = remoteVolume(id, next);
      });
  }

  if (!joined)
    return (
      <main className="room-shell join-room-shell">
        <Link to="/" className="brand-mark">
          SW / 门厅
        </Link>
        <form className="admission-card" onSubmit={join}>
          <p className="eyebrow">ADMISSION / {roomId.slice(0, 8)}</p>
          <h1>报上名字，领取座位。</h1>
          <label>
            昵称
            <input name="nickname" required maxLength={24} autoFocus />
          </label>
          <label>
            房间口令
            <input name="password" required type="password" />
          </label>
          <button type="submit">进入放映室</button>
          <output>{error}</output>
        </form>
      </main>
    );

  return (
    <main className="room-shell">
      <header className="room-header">
        <Link to="/" className="brand-mark">
          SIMPLEWATCH
        </Link>
        <div className="room-code">
          ROOM <strong>{roomId.slice(0, 8)}</strong>
        </div>
        <span className={`signal ${connected ? "online" : ""}`}>
          {connected ? "同步在线" : "正在重连"}
        </span>
        <nav className="room-links">
          <Link to="/settings">设置</Link>
          <Link to="/diagnostics">诊断</Link>
        </nav>
      </header>
      <div className="screen-layout">
        <section className="screen-frame">
          <div className="screen-meta">
            <span>
              {snapshot?.mode === "vod" ? "VOD PROGRAM" : "WAITING FOR REEL"}
            </span>
            <span>REV {snapshot?.revision ?? 0}</span>
          </div>
          {snapshot?.mode === "live" ? (
            <video ref={videoRef} controls={false} playsInline />
          ) : snapshot?.media ? (
            <video
              ref={videoRef}
              src={`/api/v1/media/${snapshot.media.id}/content`}
              controls={false}
              playsInline
            >
              {media.data?.subtitles.map((subtitle) => (
                <track
                  key={subtitle.id}
                  kind="subtitles"
                  src={`/api/v1/subtitles/${subtitle.id}`}
                  srcLang={subtitle.language}
                  label={subtitle.label}
                />
              ))}
            </video>
          ) : (
            <div className="blank-screen">
              <i />
              <p>等待主持人装片</p>
            </div>
          )}
          <div className="transport-bar">
            <button
              disabled={!isHost}
              onClick={() =>
                command({
                  kind:
                    snapshot?.transport?.state === "playing" ? "pause" : "play",
                })
              }
            >
              {snapshot?.transport?.state === "playing" ? "Ⅱ 暂停" : "▶ 播放"}
            </button>
            <button
              disabled={!isHost}
              onClick={() =>
                command({
                  kind: "seek",
                  positionSec: Math.max(
                    0,
                    (videoRef.current?.currentTime ?? 0) - 10,
                  ),
                })
              }
            >
              −10s
            </button>
            <button
              disabled={!isHost}
              onClick={() =>
                command({
                  kind: "seek",
                  positionSec: (videoRef.current?.currentTime ?? 0) + 10,
                })
              }
            >
              +10s
            </button>
            <select
              disabled={!isHost}
              aria-label="播放速度"
              value={snapshot?.transport?.rate ?? 1}
              onChange={(event) =>
                command({ kind: "set-rate", rate: Number(event.target.value) })
              }
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </div>
          <div className="local-mix">
            <label>
              节目音量{" "}
              <input
                aria-label="节目音量"
                type="range"
                min="0"
                max="100"
                value={preferences.programVolume}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    programVolume: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              通话音量{" "}
              <input
                aria-label="通话音量"
                type="range"
                min="0"
                max="100"
                value={preferences.callVolume}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    callVolume: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          {isHost && (
            <section className="host-controls">
              <strong>主持控制</strong>
              <select
                aria-label="选择点播影片"
                defaultValue=""
                onChange={(event) =>
                  event.target.value &&
                  command({ kind: "select-vod", mediaId: event.target.value })
                }
              >
                <option value="">选择片库影片</option>
                {library.data
                  ?.filter((item) => item.state === "published")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName}
                    </option>
                  ))}
              </select>
              <button onClick={() => command({ kind: "select-live" })}>
                切换直播
              </button>
              <button onClick={() => void requestPublishConfig()}>
                生成 OBS 配置
              </button>
              {publishConfig && (
                <div className="publish-config">
                  <code>{publishConfig.url}</code>
                  <code>{publishConfig.token}</code>
                  <button
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        `${publishConfig.url}\n${publishConfig.token}`,
                      )
                    }
                  >
                    复制
                  </button>
                </div>
              )}
            </section>
          )}
        </section>
        <aside className="audience-panel">
          <div className="panel-title">
            <span>SEATS</span>
            <h2>同场观众</h2>
          </div>
          <ol className="seat-list">
            {snapshot?.members.map((member, index) => (
              <li key={member.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span>
                  {member.nickname}
                  <small>{member.role === "host" ? "放映主持" : "观众"}</small>
                </span>
                <i className={member.online ? "present" : ""} />
                {voiceState === "connected" && member.id !== memberId && (
                  <input
                    aria-label={`${member.nickname} 通话音量`}
                    type="range"
                    min="0"
                    max="100"
                    value={preferences.participantVolumes[member.id] ?? 100}
                    onChange={(event) =>
                      setParticipantVolume(
                        member.id,
                        Number(event.target.value),
                      )
                    }
                  />
                )}
                {isHost && member.id !== memberId && (
                  <span className="member-actions">
                    <button onClick={() => void moderate("handoff", member.id)}>
                      移交
                    </button>
                    <button onClick={() => void moderate("kick", member.id)}>
                      移出
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="voice-card">
            <span>VOICE CHANNEL</span>
            <strong>
              {voiceState === "connected"
                ? microphoneEnabled
                  ? "麦克风已接通"
                  : "只听模式"
                : voiceState === "connecting"
                  ? "正在建立安全通道"
                  : voiceState === "error"
                    ? "语音暂不可用"
                    : "尚未进入语音席"}
            </strong>
            {voiceState === "connected" ? (
              <button onClick={() => void toggleMicrophone()}>
                {microphoneEnabled ? "静音" : "打开麦克风"}
              </button>
            ) : (
              <button
                disabled={voiceState === "connecting"}
                onClick={() => void enableVoice()}
              >
                进入并启用声音
              </button>
            )}
            <div ref={voiceTracksRef} hidden aria-hidden="true" />
          </div>
          {error && <output className="room-error">{error}</output>}
        </aside>
      </div>
      <footer className="room-footer">
        <span>CSRF {roomCsrf ? "ARMED" : "MISSING"}</span>
        <span>同步锚点 {snapshot?.transport?.anchoredAtServerMs ?? "—"}</span>
      </footer>
    </main>
  );
}

function remoteVolume(
  participantId: string,
  preferences: ReturnType<typeof loadPreferences>,
) {
  return (
    (preferences.callVolume / 100) *
    ((preferences.participantVolumes[participantId] ?? 100) / 100)
  );
}

function envelope(roomId: string, type: string, payload: unknown) {
  return { v: 1, type, id: uuidv7(), roomId, sentAtMs: Date.now(), payload };
}
