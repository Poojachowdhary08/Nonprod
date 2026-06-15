// utils/notificationEvents.ts
import mitt from "mitt";

type NotificationEventPayload = any;

type Events = {
  notification: NotificationEventPayload;
};

const emitter = mitt<Events>();

export const emitNotificationEvent = (data: NotificationEventPayload) => {
  emitter.emit("notification", data);
};

export const onNotificationEvent = (
  handler: (data: NotificationEventPayload) => void
) => {
  emitter.on("notification", handler);
  return () => emitter.off("notification", handler); // unsubscribe
};
