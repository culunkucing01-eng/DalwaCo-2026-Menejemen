import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAmVAcuCpZxuhkbxBrKlL6RGe_uF7KR9Ro",
  authDomain: "dalwaco2-c3cfb.firebaseapp.com",
  projectId: "dalwaco2-c3cfb",
  storageBucket: "dalwaco2-c3cfb.firebasestorage.app",
  messagingSenderId: "83193863778",
  appId: "1:83193863778:web:e28127dbb6c0b1aeacfb3b",
};

const app = initializeApp(firebaseConfig);

// Offline persistence dengan API terbaru (mendukung multi-tab)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
export const auth = getAuth(app);
export default app;
