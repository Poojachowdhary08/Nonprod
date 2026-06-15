import { useEffect } from "react";
import SocketManager from "../utils/socketManager"; // adjust if path is different

interface SocketEventsProps {
  propertyId: string;
  employeeCode: string;
  engineerName: string;
  onNewMessage?: (data: any) => void;
  onReactionUpdate?: (data: any) => void;
  onStarUpdate?: (data: any) => void;
  onTyping?: (data: any) => void;
  onOnlineUsers?: (data: any) => void;
}

export default function useSocketEvents({
  propertyId,
  employeeCode,
  engineerName,
  onNewMessage,
  onReactionUpdate,
  onStarUpdate,
  onTyping,
  onOnlineUsers,
}: SocketEventsProps): void {
  useEffect(() => {
    const socket = SocketManager.getInstance(propertyId, employeeCode, engineerName);
    socket.connect();

    const listener = (data: any) => {
      console.log("📱 [Mobile WS] Message:", data);
      switch (data.type) {
        case "new_message":
          onNewMessage?.(data);
          break;
        case "reaction_update":
          onReactionUpdate?.(data);
          break;
        case "star_update":
          onStarUpdate?.(data);
          break;
        case "typing":
          onTyping?.(data);
          break;
        case "online_users":
          onOnlineUsers?.(data);
          break;
        default:
          console.log("❓ Unknown WS type:", data.type);
      }
    };

    socket.addListener(listener);
    return () => {
      socket.removeListener(listener);
    };
  }, [propertyId, employeeCode, engineerName]);
}