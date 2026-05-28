const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function enablePushNotifications(userId) {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service worker is not supported in this browser.");
  }

  if (!("PushManager" in window)) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");

  const keyResponse = await fetch(`${API_BASE_URL}/api/push/public-key`);
  const keyData = await keyResponse.json();

  if (!keyData.publicKey) {
    throw new Error("VAPID public key is missing from backend.");
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });
  }

  const response = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      subscription,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to save push subscription.");
  }

  return true;
}