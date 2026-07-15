import { create } from "zustand";

interface SessionState {
  adminCsrf: string | null;
  roomCsrf: string | null;
  memberId: string | null;
  setAdminCsrf(value: string | null): void;
  setRoomCsrf(value: string | null): void;
  setMemberId(value: string | null): void;
}

export const useSession = create<SessionState>((set) => ({
  adminCsrf: null,
  roomCsrf: null,
  memberId: null,
  setAdminCsrf: (adminCsrf) => set({ adminCsrf }),
  setRoomCsrf: (roomCsrf) => set({ roomCsrf }),
  setMemberId: (memberId) => set({ memberId }),
}));
