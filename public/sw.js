self.addEventListener("push", (event) => {
  let data = {
    title: "Nexus AI Reminder",
    body: "Time to continue your learning roadmap.",
    url: "/",
  };

  try {
    data = event.data.json();
  } catch (error) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: {
        url: data.url || "/",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});