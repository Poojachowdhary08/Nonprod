self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Avenue Update", body: event.data.text(), data: {} };
  }

  const title = payload.title || "Avenue Update";
  const body = payload.body || "You have a new notification.";
  const data = payload.data || {};
  const url = data.url || `/?pushPayload=${encodeURIComponent(JSON.stringify(data))}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: {
        ...data,
        url,
      },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.type || "avenue-web-push",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";
  const payload = event.notification?.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && "postMessage" in client) {
          client.postMessage({
            type: "WEB_PUSH_NOTIFICATION_CLICK",
            payload,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
