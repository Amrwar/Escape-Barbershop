/**
 * Push handling, folded into the app's service worker by next-pwa.
 *
 * Two jobs: show what the server sent, and take the customer to the right
 * screen when they tap it. If a window is already open it is reused and
 * brought forward, rather than opening the app a second time.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let message;
  try {
    message = event.data.json();
  } catch {
    message = { title: "Escape Barbershop", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(message.title ?? "Escape Barbershop", {
      body: message.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // A second message about the same appointment replaces the first.
      tag: message.tag,
      renotify: Boolean(message.tag),
      data: { url: message.url ?? "/app" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes("/app") && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
