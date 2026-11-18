"use client";

import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { apiContext, type ApiAuth } from "@/components/inventory/shared";
import { useLoad } from "@/components/staff/shared";
import { registerServiceWorker } from "@/lib/pwa/register";

export type PushState = "unsupported" | "denied" | "off" | "on" | "loading";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Web Push on this device (P4.7, shared with the PWA in P6.4): registers the service worker,
 * reads the current subscription, subscribes / unsubscribes with the server's VAPID key.
 * `enable` / `disable` throw on failure — the caller shows the message.
 */
export function usePushNotifications(auth: ApiAuth) {
  const config = useLoad("push-config", () =>
    trpc.notification.pushConfig.query(undefined, apiContext(auth)),
  );
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iPhone: only an app added to the home screen gets PushManager (iOS 16.4+)
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await registerServiceWorker();
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const publicKey = config.data?.publicKey ?? null;
  const reloadConfig = config.reload;

  const enable = useCallback(async () => {
    if (!publicKey) return;
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await trpc.notification.pushSubscribe.mutate(
        { endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 255) },
        apiContext(auth),
      );
      setState("on");
      reloadConfig();
    } catch (e) {
      setState("off");
      throw e;
    }
  }, [auth, publicKey, reloadConfig]);

  const disable = useCallback(async () => {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await trpc.notification.pushUnsubscribe.mutate(
          { endpoint: sub.endpoint },
          apiContext(auth),
        );
        await sub.unsubscribe();
      }
      setState("off");
      reloadConfig();
    } catch (e) {
      setState("on");
      throw e;
    }
  }, [auth, reloadConfig]);

  return {
    state,
    publicKey,
    devices: config.data?.devices ?? [],
    configError: config.error,
    enable,
    disable,
  };
}
