import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Ambil elemen navbar
const authNav = document.getElementById("authNavigation");
const loginNav = document.getElementById("loginNavigation");

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (authNav) authNav.style.display = "block";
    if (loginNav) loginNav.style.display = "none";
  } else {
    if (authNav) authNav.style.display = "none";
    if (loginNav) loginNav.style.display = "block";
  }
});

// Helper: Generate Kode Referral Acak
function generateReferralCode(name) {
    const prefix = (name || "USR").substring(0, 3).toUpperCase().replace(/\s/g, '');
    const randomNum = Math.floor(100 + Math.random() * 900);
    return prefix + randomNum; 
}

// Fungsi Simpan User Baru ke Firestore
async function saveUserToFirestore(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        const myCode = generateReferralCode(user.displayName || user.email);
        await setDoc(userRef, {
            name: user.displayName || "User",
            email: user.email,
            points: 0,
            level: 1,
            badges: [],
            myReferralCode: myCode,
            redeemedReferral: false,
            createdAt: new Date()
        });
    }
}

// REGISTER BIASA
export async function registerUser(event) {
  event.preventDefault();

  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!nameInput || !emailInput || !passwordInput) return;

  const name = nameInput.value;
  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCred.user, { displayName: name });
    await saveUserToFirestore(userCred.user);

    alert("Register sukses! Anda akan diarahkan ke Dashboard.");
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
    alert("Gagal Register: " + error.message);
  }
}

// LOGIN BIASA
export async function loginUser(event) {
  event.preventDefault();
  
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!emailInput || !passwordInput) return;

  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
    alert("Email atau password salah! Coba lagi.");
  }
}

// LOGIN DENGAN GOOGLE (Hanya Google)
export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        await saveUserToFirestore(result.user); 
        window.location.href = "index.html";
    } catch (error) {
        console.error("Google Login Error:", error);
        alert("Gagal login dengan Google: " + error.message);
    }
}

// LOGOUT
export function logoutUser() {
  const confirm = window.confirm("Yakin ingin keluar?");
  if(confirm) {
      signOut(auth).then(() => {
          window.location.href = "login.html";
      });
  }
}

// Event Listeners
document.getElementById("registerForm")?.addEventListener("submit", registerUser);
document.getElementById("loginForm")?.addEventListener("submit", loginUser);
document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    logoutUser();
});

// Listener Tombol Google
document.getElementById("btnGoogle")?.addEventListener("click", loginWithGoogle);