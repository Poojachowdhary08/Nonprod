type MessageHandler = (data: any) => void;

class SocketManager {
  private static instances: { [key: string]: SocketManager } = {};
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: any;
  private listeners: Set<MessageHandler> = new Set();

  private constructor(
    private propertyId: string,
    private employeeCode: string,
    private engineerName: string
  ) {}

  static getInstance(propertyId: string, employeeCode: string, engineerName: string) {
    const key = `${propertyId}_${employeeCode}`;
    if (!SocketManager.instances[key]) {
      SocketManager.instances[key] = new SocketManager(propertyId, employeeCode, engineerName);
    }
    return SocketManager.instances[key];
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log("🧠 WebSocket already connected.");
      return;
    }

    const url = `wss://test.datso.io/ws/chat/${this.propertyId}?employee_code=${this.employeeCode}&engineer_name=${encodeURIComponent(this.engineerName)}`;
    console.log("🔌 Connecting WebSocket:", url);

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log("✅ WebSocket OPEN");
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("📨 WS Message Received:", data);
      this.listeners.forEach((listener) => listener(data));
    };

    this.socket.onclose = () => {
      console.warn("🛑 WS Disconnected. Retrying...");
      this.reconnect();
    };

    this.socket.onerror = (err) => {
      console.error("❌ WS Error:", err);
      this.reconnect();
    };
  }

  send(data: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.warn("⚠️ WebSocket not ready. Dropping message:", data);
    }
  }

  reconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => {
      console.log("🔁 Reconnecting WebSocket...");
      this.connect();
    }, Math.min(5000, this.reconnectAttempts * 1000));
  }

  disconnect() {
    if (this.socket) {
      console.log("🔌 Disconnecting WebSocket...");
      this.socket.close();
      this.socket = null;
    }
    clearTimeout(this.reconnectTimeout);
  }

  addListener(handler: MessageHandler) {
    this.listeners.add(handler);
  }

  removeListener(handler: MessageHandler) {
    this.listeners.delete(handler);
  }
}

export default SocketManager;