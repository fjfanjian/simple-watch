import { Room, Track } from "livekit-client";

const rooms: Room[] = [];

export async function connectFakeParticipant(url: string, token: string) {
  const room = new Room({ adaptiveStream: false, dynacast: false });
  await room.connect(url, token, { autoSubscribe: true });
  await room.localParticipant.setMicrophoneEnabled(true);
  rooms.push(room);
  return participantStats(room);
}

export function participantCount(): number {
  const room = rooms.at(-1);
  return room ? room.remoteParticipants.size + 1 : 0;
}

export function stats() {
  const room = rooms.at(-1);
  if (!room) return null;
  return participantStats(room);
}

export function connectionState(): string {
  return rooms.at(-1)?.state ?? "disconnected";
}

export function disconnectAll(): void {
  for (const room of rooms.splice(0)) void room.disconnect();
}

function participantStats(room: Room) {
  const localPublications = [
    ...room.localParticipant.trackPublications.values(),
  ];
  return {
    participants: room.remoteParticipants.size + 1,
    microphoneTracks: localPublications.filter(
      (publication) => publication.source === Track.Source.Microphone,
    ).length,
    cameraTracks: localPublications.filter(
      (publication) => publication.source === Track.Source.Camera,
    ).length,
  };
}
