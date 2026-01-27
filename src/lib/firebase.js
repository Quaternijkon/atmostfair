import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBFHzDuk-Bg0yuFYyV4SufErk0Aju_dUzo",
  authDomain: "atmostfair-84a15.firebaseapp.com",
  projectId: "atmostfair-84a15",
  storageBucket: "atmostfair-84a15.firebasestorage.app",
  messagingSenderId: "309487876744",
  appId: "1:309487876744:web:38356149523ad912e63d3d",
  measurementId: "G-1NPB3HRW5E"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
