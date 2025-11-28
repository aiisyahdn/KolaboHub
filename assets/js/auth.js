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

function generateReferralCode(name) {
    const prefix = (name || "USR").substring(0, 3).toUpperCase().replace(/\s/g, '');
    const randomNum = Math.floor(100 + Math.random() * 900);
    return prefix + randomNum; 
}

// Helper: Setup User Baru & Redirect ke Dashboard
async function handleUserLogin(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // Jika user baru, buat data awal
    if (!userSnap.exists()) {
        const myCode = generateReferralCode(user.displayName || user.email);
        await setDoc(userRef, {
            name: user.displayName || "User",
            email: user.email,
            points: 0,
            lifetimePoints: 0,
            level: 1,
            badges: [],
            myReferralCode: myCode,
            redeemedReferral: false,
            createdAt: new Date()
        });
    } else {
        // Migrasi untuk user lama yg belum punya lifetimePoints
        const data = userSnap.data();
        if (data.lifetimePoints === undefined) {
            await setDoc(userRef, { lifetimePoints: data.points || 0 }, { merge: true });
        }
    }

    // PERBAIKAN: Langsung ke Dashboard (index.html), jangan ke referral.html
    window.location.href = "index.html";
}

// REGISTER
export async function registerUser(event) {
  event.preventDefault();
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!nameInput || !emailInput || !passwordInput) return;

  try {
    // Ubah tombol jadi loading
    const btn = event.submitter;
    const originalText = btn.innerText;
    btn.disabled = true; 
    btn.innerText = "Processing...";

    const userCred = await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    await updateProfile(userCred.user, { displayName: nameInput.value });
    
    await handleUserLogin(userCred.user);

  } catch (error) {
    console.error(error);
    alert("Gagal Register: " + error.message);
    const btn = event.submitter;
    btn.disabled = false;
    btn.innerText = "Sign Up";
  }
}

// LOGIN
export async function loginUser(event) {
  event.preventDefault();
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!emailInput || !passwordInput) return;

  try {
    const btn = event.submitter;
    const originalText = btn.innerText;
    btn.disabled = true; 
    btn.innerText = "Logging in...";

    const userCred = await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    await handleUserLogin(userCred.user);
    
  } catch (error) {
    console.error(error);
    alert("Email atau password salah!");
    const btn = event.submitter;
    btn.disabled = false;
    btn.innerText = "Log In";
  }
}

// GOOGLE LOGIN
export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        await handleUserLogin(result.user);
    } catch (error) {
        console.error("Google Login Error:", error);
        alert("Gagal login dengan Google. Pastikan domain sudah diizinkan di Firebase Console.");
    }
}

export function logoutUser() {
  if(confirm("Yakin ingin keluar?")) {
      signOut(auth).then(() => { window.location.href = "login.html"; });
  }
}

document.getElementById("registerForm")?.addEventListener("submit", registerUser);
document.getElementById("loginForm")?.addEventListener("submit", loginUser);
document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    logoutUser();
});
document.getElementById("btnGoogle")?.addEventListener("click", loginWithGoogle);