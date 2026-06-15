// app/lib/bus.ts
type Handler<T = any> = (evt: T) => void;

class TinyBus {
  private map = new Map<string, Set<Handler>>();

  on<T = any>(type: string, handler: Handler<T>) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type)!.add(handler as Handler);
  }
  off<T = any>(type: string, handler: Handler<T>) {
    this.map.get(type)?.delete(handler as Handler);
  }
  emit<T = any>(type: string, evt: T) {
    this.map.get(type)?.forEach(fn => fn(evt));
  }
}

export const bus = new TinyBus();

// Events we’ll use:
// bus.emit("inventory:updated", { request_id, patch: Partial<InventoryRequest> })
// bus.emit("inventory:deleted", { request_id })

