// Firebase & Cloud Firestore Service
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  writeBatch,
} from "firebase/firestore";

// Firebase credentials can be supplied via .env.local or .env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDemoPlaceholderKey12345",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "worldspin-app.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "worldspin-app",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "worldspin-app.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1027957062196",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

// Initialize Firebase safely
let db = null;
let auth = null;
let isConfigured = false;

try {
  if (
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_API_KEY !== "AIzaSyDemoPlaceholderKey12345" &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  ) {
    const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
    isConfigured = true;
  }
} catch (err) {
  console.warn("Firebase initialization skipped; using local storage fallback:", err);
}

const LOCAL_STORAGE_KEY = "worldspin_custom_destinations";

/**
 * Subscribe to Firebase Auth state changes
 */
export function subscribeToAuth(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/**
 * Sign in an administrator with Email & Password
 */
export async function signInAdmin(email, password) {
  if (!auth) {
    throw new Error("Firebase Authentication is not configured.");
  }
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

/**
 * Sign out current administrator
 */
export async function signOutAdmin() {
  if (!auth) return;
  await signOut(auth);
}

/**
 * Verify whether a signed-in user is authorized in /admins/{uid} or via custom claim
 */
export async function checkIsAdmin(user) {
  if (!user || !db) return false;
  try {
    const tokenResult = await user.getIdTokenResult();
    if (tokenResult?.claims?.admin === true) return true;
    const adminSnap = await getDoc(doc(db, "admins", user.uid));
    return adminSnap.exists();
  } catch (err) {
    console.warn("Admin authorization check failed:", err);
    return false;
  }
}

/**
 * Fetch destinations from Firestore, falling back to LocalStorage or default dataset
 */
export async function loadDestinations(fallbackData) {
  // 1. Try Firestore if configured
  if (isConfigured && db) {
    try {
      const snap = await getDocs(collection(db, "destinations"));
      if (!snap.empty) {
        const cloudData = snap.docs.map((d) => d.data());
        cloudData.sort((a, b) => (a.number || 0) - (b.number || 0));
        return cloudData;
      }
    } catch (err) {
      console.warn("Could not load from Firestore, checking local storage:", err);
    }
  }

  // 2. Check LocalStorage
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore local storage parse error
  }

  // 3. Fallback to default 100 destinations
  return fallbackData;
}

/**
 * Save a single destination update to Cloud Firestore & LocalStorage
 */
export async function saveDestination(updatedDestination, allDestinations) {
  if (isConfigured && db) {
    const docRef = doc(db, "destinations", String(updatedDestination.number));
    await setDoc(docRef, updatedDestination);
  }

  try {
    const nextList = allDestinations.map((d) =>
      d.number === updatedDestination.number ? updatedDestination : d
    );
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextList));
    return nextList;
  } catch (err) {
    console.error("Failed to save to local storage:", err);
    return allDestinations.map((d) =>
      d.number === updatedDestination.number ? updatedDestination : d
    );
  }
}

/**
 * One-click seed: Upload all 100 destinations to Firebase Firestore
 */
export async function seedAllDestinationsToCloud(destinations) {
  if (!isConfigured || !db) {
    throw new Error(
      "Firebase is not configured yet. Add your Firebase credentials to .env.local to enable cloud sync."
    );
  }

  const batch = writeBatch(db);
  destinations.forEach((item) => {
    const docRef = doc(db, "destinations", String(item.number));
    batch.set(docRef, item);
  });

  await batch.commit();
}

/**
 * Reset all destinations back to original client defaults
 */
export function resetLocalDestinations(defaultData) {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // Ignore
  }
  return defaultData;
}

export { auth, db, isConfigured };
