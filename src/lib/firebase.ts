import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  projectId: "hostcraft-656",
  appId: "1:637245823266:web:05dadc259d48903d25ad7b",
  storageBucket: "hostcraft-656.firebasestorage.app",
  apiKey: "AIzaSyCA5ojk4fEeZPjJErujRO7FL7w6GYKYcyg",
  authDomain: "hostcraft-656.firebaseapp.com",
  messagingSenderId: "637245823266",
  measurementId: "G-XXXXXXXXXX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
