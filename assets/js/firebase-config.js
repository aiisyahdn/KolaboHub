import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  
  // TODO: Ganti dengan konfigurasi Firebase milikmu
  const firebaseConfig = {
    apiKey: "AIzaSyBIGZ4c8aIT4VflWJVbyeXwowXRpiTa19U", 
    authDomain: "kolabohub.firebaseapp.com",
    projectId: "kolabohub",
    storageBucket: "kolabohub.firebasestorage.app",
    messagingSenderId: "787536095848",
    appId: "1:787536095848:web:648f522cafd8573a06a9dd",
    measurementId: "G-JEC5SBTTFS"
  };
  
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
  