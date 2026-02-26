import { supabase } from "@/integrations/supabase/client";

// Extend ServiceWorkerRegistration to include pushManager
declare global {
  interface ServiceWorkerRegistration {
    pushManager: PushManager;
  }
}

const VAPID_PUBLIC_KEY = 'BD0D6Rq6_A3StaTJxi0EMTPFduXfXGqGor1B_zyHtjSWeXZZW5NQnK1kZ3DVn4nlCTy8YNOFOcM2OZ6A1eovqjA';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushNotifications(userId: string): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Push notification permission denied');
      return false;
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw-push.js');
    await navigator.serviceWorker.ready;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
    });

    const subJson = subscription.toJSON();

    // Save subscription to database
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subJson.endpoint!,
          p256dh: subJson.keys!.p256dh!,
          auth: subJson.keys!.auth!,
        },
        { onConflict: 'user_id,endpoint' }
      );

    if (error) {
      console.error('Failed to save push subscription:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Push registration failed:', error);
    return false;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw-push.js');
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

export async function unregisterPush(userId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw-push.js');
    if (registration) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint);
      }
    }
  } catch (error) {
    console.error('Push unregister failed:', error);
  }
}
