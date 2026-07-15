import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export function HomePage() {
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = roomId.trim();
    if (normalized) void navigate(`/room/${encodeURIComponent(normalized)}`);
  };
  return (
    <main className="landing">
      <div className="grain" aria-hidden="true" />
      <header className="masthead">
        <span className="brand-mark">SW / 01</span>
        <Link to="/admin" className="text-link">
          放映员入口 ↗
        </Link>
      </header>
      <section className="hero">
        <p className="eyebrow">PRIVATE SYNCHRONIZED SCREENING</p>
        <h1>
          让远方的人，
          <br />
          <em>坐进同一排座位。</em>
        </h1>
        <p className="lede">
          一间只属于五个人的同步放映室。影片、直播、声音与字幕，在同一时刻抵达。
        </p>
        <form className="join-strip" onSubmit={submit}>
          <label htmlFor="room-id">房间编号</label>
          <input
            id="room-id"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            placeholder="粘贴 UUID"
            autoComplete="off"
          />
          <button type="submit">推门入场</button>
        </form>
      </section>
      <footer className="landing-footer">
        <span>H.264 / AAC / WEBVTT</span>
        <span>最多 5 席</span>
        <span>端到端会话鉴权</span>
      </footer>
    </main>
  );
}
