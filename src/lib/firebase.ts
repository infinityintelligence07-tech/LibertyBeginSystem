import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

// These values are safe in client code by Firebase design (public identifiers).
export const firebaseConfig = {
  apiKey: "AIzaSyA0Lt9wGrNdNAyS3BWT2Wh2A9AY6R5e40k",
  authDomain: "liberty-begin-app.firebaseapp.com",
  projectId: "liberty-begin-app",
  storageBucket: "liberty-begin-app.firebasestorage.app",
  messagingSenderId: "804035958699",
  appId: "1:804035958699:web:ddc5564e7bde04240764ee",
  measurementId: "G-Y7F5QNDT1J",
};

// VAPID public key (Web Push certificate) from Firebase Console → Cloud Messaging.
export const VAPID_KEY = "BEJo9Ko_tuRxSFEzQychKQ_chUHYlRzHJYBT8sxe4q-motbCr-93sO5Whng-V_uArGa2NuWVh6IniBfasGSr05g";

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export async function getMessagingSafe(): Promise<Messaging | null> {
  try {
    if (typeof window === "undefined") return null;
    if (!(await isSupported())) return null;
    return getMessaging(firebaseApp);
  } catch {
    return null;
  }
}
