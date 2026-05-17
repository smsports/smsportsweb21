import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase using Compat singleton pattern
let app;
if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
} else {
    app = firebase.app();
}

const db = app.firestore();
const auth = app.auth();

/**
 * Robust Firestore Settings
 * experimentalForceLongPolling: true is used to bypass WebSocket connection issues 
 * which often cause the "Could not reach Cloud Firestore backend" error in 
 * certain network environments or browser security sandboxes.
 * 
 * NOTE: We do not set experimentalAutoDetectLongPolling to avoid conflicts.
 */
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    experimentalForceLongPolling: true
});

// Enable offline persistence with enhanced error handling
const initPersistence = async () => {
    try {
        // DISABLING PERSISTENCE for stability in AI Studio preview iframe + resolving ID: b815
        // await db.enablePersistence({ synchronizeTabs: false });
        console.log("Firestore: Persistence disabled for stability.");
    } catch (err: any) {
        if (err.code === 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab at a time.
            console.warn("Firestore: Persistence failed (multiple tabs). Operating in online-only mode.");
        } else if (err.code === 'unimplemented') {
            // The current browser does not support all of the features required to enable persistence
            console.warn("Firestore: Persistence not supported by browser.");
        } else {
            console.error("Firestore Persistence Error:", err.message);
        }
    }
};

// Initialize persistence without blocking the main execution thread
initPersistence();

export { db, auth };