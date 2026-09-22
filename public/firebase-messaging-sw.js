/* Firebase Cloud Messaging service worker.
 * Handles push notifications while the app is in background/closed.
 * Also provides a minimal fetch listener so browsers treat this as a
 * valid PWA service worker (enables the native "Install app" prompt). */

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA0Lt9wGrNdNAyS3BWT2Wh2A9AY6R5e40k", // placeholder — replaced below
  authDomain: "liberty-begin-app.firebaseapp.com",
  projectId: "liberty-begin-app",
  storageBucket: "liberty-begin-app.firebasestorage.app",
  messagingSenderId: "804035958699",
  appId: "1:804035958699:web:ddc5564e7bde04240764ee",
});

const messaging = firebase.messaging();

// Background push handler — shows OS-level notification (lock screen, notification tray).
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || "Liberty Begin";
  const body = payload?.notification?.body || payload?.data?.body || "";
  const link = payload?.fcmOptions?.link || payload?.data?.link || "/";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload?.data?.tag || "liberty-notif",
    data: { link, ...(payload?.data || {}) },
    vibrate: [120, 60, 120],
  });
});

// Click on notification -> focus/open the app at the intended route
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification?.data?.link || "/";
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.postMessage({ type: "notification-click", link });
          try { await client.navigate(link); } catch (_) {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })(),
  );
});

// Minimal fetch handler — required so Chrome/Edge consider this a valid PWA
// service worker and enable the native "Install app" prompt. Passthrough only,
// no caching, so it never serves stale HTML in the Lovable preview.
self.addEventListener("fetch", () => {});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
