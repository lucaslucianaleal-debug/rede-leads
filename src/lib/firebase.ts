import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCzwAWRef44wB5tc98eFupuNK6C2Q7x4Eg",
  authDomain: "rede-leads.firebaseapp.com",
  projectId: "rede-leads",
  storageBucket: "rede-leads.firebasestorage.app",
  messagingSenderId: "245830989556",
  appId: "1:245830989556:web:077187fa9244d614bb50a1",
  measurementId: "G-X4MCYRWDTM"
};

// Verifica se o app já foi inicializado
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const auth = getAuth(app);
