export function randId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function makeTraceId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowMinus(ms: number) {
  return Date.now() - ms;
}
