import { create } from "zustand";

export type SyncEvent = {
  type: string;
  payload: unknown;
  ts: number;
  traceId: string;
};

type State = {
  events: SyncEvent[];
  addEvent: (e: SyncEvent) => void;
  clear: () => void;
};

export const useEventStore = create<State>((set) => ({
  events: [],
  addEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 200) })),
  clear: () => set({ events: [] })
}));
