import { create } from "zustand";
import type { WsStatus } from "../types";

interface LiveState {
  wsStatus: WsStatus;
  lastPacketAt: string | null;
  selectedId: string | null;
  follow: boolean;
  showTrack: boolean;
  setWsStatus: (s: WsStatus) => void;
  setLastPacketAt: (iso: string) => void;
  select: (id: string | null) => void;
  setFollow: (f: boolean) => void;
  toggleTrack: () => void;
}

export const useLiveStore = create<LiveState>((set) => ({
  wsStatus: "connecting",
  lastPacketAt: null,
  selectedId: null,
  follow: false,
  showTrack: false,
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setLastPacketAt: (lastPacketAt) => set({ lastPacketAt }),
  select: (selectedId) =>
    set((prev) => ({
      selectedId,
      // Al cambiar de moto se apagan el seguimiento y la ruta de la anterior
      follow: selectedId === prev.selectedId ? prev.follow : false,
      showTrack: selectedId === prev.selectedId ? prev.showTrack : false,
    })),
  setFollow: (follow) => set({ follow }),
  toggleTrack: () => set((prev) => ({ showTrack: !prev.showTrack })),
}));
