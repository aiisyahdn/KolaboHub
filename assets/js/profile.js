import { auth, db } from "./firebase-config.js";
import {
  doc, getDoc, onSnapshot, updateDoc, collection, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUid = null;

// Fungsi Helper Poin
function calculateAchievements(points) {
    const level = Math.floor(points / 50) + 1;
    const badges = [];
    if (points >= 10) badges.push("Quick Starter");
    if (points >= 50) badges.push("Team Player");
    if (points >= 100) badges.push("Task Master");
    if (points >= 200) badges.push("MVP Bulan Ini");
    return { level, badges };
}

// Fungsi Load Profil Utama
function loadUserProfile(uid) {
    const userRef = doc(db, "users", uid);
    
    onSnapshot(userRef, (docSnap) => {
        if (!docSnap.exists()) return;

        const data = docSnap.data();
        const points = data.points || 0;
        const { level, badges } = calculateAchievements(points);
        
        const profileNameEl = document.getElementById('profileName');
        const profileEmailEl = document.getElementById('profileEmail');
        const profilePointsEl = document.getElementById('profilePoints');
        const profileLevelEl = document.getElementById('profileLevel');
        const badgesContainer = document.getElementById('badgesContainer');
        const myReferralCodeEl = document.getElementById('myReferralCode');
        
        if (profileNameEl) profileNameEl.textContent = data.name || 'User Kolabohub';
        if (profileEmailEl) profileEmailEl.textContent = data.email || 'N/A';
        if (profilePointsEl) profilePointsEl.textContent = points;
        if (profileLevelEl) profileLevelEl.textContent = level;
        if (myReferralCodeEl) myReferralCodeEl.textContent = data.myReferralCode || '-';

        const inputEditName = document.getElementById('inputEditName');
        if (inputEditName && data.name) inputEditName.value = data.name;

        if (badgesContainer) {
            if (badges.length === 0) {
                badgesContainer.innerHTML = '<span class="text-muted small">Belum ada pencapaian. Kerjakan tugas untuk dapat badge!</span>';
            } else {
                badgesContainer.innerHTML = badges.map(badge => 
                    `<span class="badge bg-primary-kolabo me-2 mb-2 p-2">${badge}</span>`
                ).join('');
            }
        }
    });
}

// PERBAIKAN PENTING: Load Riwayat dengan Filter Client-Side
// (Menghindari error "Missing Index" dari Firestore)
function loadUserHistory(uid) {
    const historyContainer = document.getElementById("historyContainer");
    if (!historyContainer) return;

    // 1. Ambil data hanya berdasarkan userId (Query sederhana ini tidak butuh index)
    const q = query(
        collection(db, "activities"), 
        where("userId", "==", uid)
    );

    onSnapshot(q, (snapshot) => {
        // 2. Kumpulkan data ke array
        let activities = [];
        snapshot.forEach((doc) => {
            activities.push(doc.data());
        });

        // 3. Filter & Sort menggunakan JavaScript
        // Ambil yang tipe 'task', lalu urutkan dari yang terbaru (timestamp besar ke kecil)
        const taskHistory = activities
            .filter(act => act.type === 'task')
            .sort((a, b) => {
                const timeA = a.timestamp ? a.timestamp.seconds : 0;
                const timeB = b.timestamp ? b.timestamp.seconds : 0;
                return timeB - timeA;
            })
            .slice(0, 10); // Ambil 10 terakhir

        // 4. Tampilkan ke UI
        historyContainer.innerHTML = "";
        
        if (taskHistory.length === 0) {
            historyContainer.innerHTML = '<li class="list-group-item text-muted small">Belum ada riwayat tugas.</li>';
            return;
        }

        taskHistory.forEach((act) => {
            // Cek kata kunci untuk menentukan warna badge (selesai vs buat baru)
            let badgeClass = "bg-light text-dark border";
            let badgeText = "Activity";
            
            if (act.text.includes("Selesai") || act.text.includes("Menyelesaikan")) {
                badgeClass = "bg-success text-white";
                badgeText = "Done";
            } else if (act.text.includes("tugas baru")) {
                badgeClass = "bg-primary text-white";
                badgeText = "Created";
            }

            historyContainer.innerHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span class="small text-truncate" style="max-width: 70%;" title="${act.text}">
                        ${act.text}
                    </span>
                    <span class="badge ${badgeClass}" style="font-size: 0.7rem;">${badgeText}</span>
                </li>
            `;
        });
    });
}

window.copyReferral = function() {
    const code = document.getElementById('myReferralCode').innerText;
    navigator.clipboard.writeText(code).then(() => {
        alert("Kode berhasil disalin: " + code);
    });
}

// Event Listener Simpan Profil
const btnSave = document.getElementById('btnSaveProfile');
if (btnSave) {
    btnSave.addEventListener('click', async () => {
        const newName = document.getElementById('inputEditName').value.trim();
        if (!newName) return alert("Nama tidak boleh kosong.");

        try {
            btnSave.textContent = "Menyimpan...";
            btnSave.disabled = true;

            await updateDoc(doc(db, "users", currentUid), {
                name: newName
            });

            if (auth.currentUser) {
                await updateProfile(auth.currentUser, { displayName: newName });
            }

            const modalEl = document.getElementById('editProfileModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();

            alert("Profil berhasil diperbarui!");

        } catch (error) {
            console.error(error);
            alert("Gagal memperbarui profil.");
        } finally {
            btnSave.textContent = "Simpan Perubahan";
            btnSave.disabled = false;
        }
    });
}

// Init Auth
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUid = user.uid;
    loadUserProfile(user.uid);
    loadUserHistory(user.uid);
});