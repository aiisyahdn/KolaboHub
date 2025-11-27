import { auth, db } from "./firebase-config.js";
import {
  doc, onSnapshot, getDocs, collection, query, where, orderBy, limit, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let currentUid = null;
let currentUserName = "User";

function loadDashboardData(uid) {
    const userRef = doc(db, "users", uid);
    
    // 1. Listener Data User (Poin & Nama)
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentUserName = data.name || "User";
            const points = data.points || 0;
            
            const dashboardPointsEl = document.getElementById('dashboardPoints');
            const welcomeNameEl = document.getElementById('welcomeName');
            
            if (dashboardPointsEl) dashboardPointsEl.textContent = points;
            if (welcomeNameEl) welcomeNameEl.textContent = currentUserName;

            // Cek Referral
            if (data.redeemedReferral === false) {
                const modalEl = document.getElementById('referralModal');
                if (modalEl) {
                    const existingModal = bootstrap.Modal.getInstance(modalEl);
                    if (!existingModal) {
                        const referralModal = new bootstrap.Modal(modalEl);
                        referralModal.show();
                        setupReferralLogic(uid, currentUserName, referralModal);
                    }
                }
            }
        }
    });
    
    loadActiveProjectsWidget(uid);
    loadSidebarActivities();
    loadCurrentTaskWidget(uid); // Fungsi Baru!
}

// 2. Render Lingkaran Proyek (Updated Style)
async function loadActiveProjectsWidget(uid) {
    const container = document.getElementById('activeProjectsContainer');
    if (!container) return;

    const q = query(collection(db, "projects"), where("members", "array-contains", uid), limit(3));
    
    try {
        const snapshot = await getDocs(q);
        container.innerHTML = "";

        if (snapshot.empty) {
            container.innerHTML = `<div class="text-center text-muted small my-auto">Belum ada proyek aktif.</div>`;
            return;
        }

        let i = 1;
        snapshot.forEach(doc => {
            const p = doc.data();
            const circleClass = i === 1 ? 'circle-1' : (i === 2 ? 'circle-2' : 'circle-3');
            
            container.innerHTML += `
                <div class="project-circle-item">
                    <div class="circle-placeholder ${circleClass} shadow-sm">
                        <i class="bi bi-folder2-open"></i>
                    </div>
                    <div class="project-name-small text-truncate px-1">${p.name}</div>
                </div>
            `;
            i++;
        });
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="text-danger small text-center">Gagal memuat.</div>`;
    }
}

// 3. Render Aktivitas Sidebar (Updated dengan Nama User)
function loadSidebarActivities() {
    const container = document.getElementById('activityListContainer');
    if (!container) return;

    const q = query(collection(db, "activities"), orderBy("timestamp", "desc"), limit(4));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        if (snapshot.empty) {
            container.innerHTML = "<p class='text-muted small text-center'>Belum ada aktivitas.</p>";
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Now";
            
            let iconClass = "bi-info-circle";
            let bgClass = "#E9EDF7"; 
            let textClass = "#2B3674";

            if (data.type === 'reward') { iconClass = "bi-gift-fill"; textClass = "#FFB547"; bgClass = "#FFF7E8"; }
            if (data.type === 'task') { iconClass = "bi-check-circle-fill"; textClass = "#05CD99"; bgClass = "#E6FAF5"; }
            if (data.type === 'project') { iconClass = "bi-folder-fill"; textClass = "#4318FF"; bgClass = "#F4F7FE"; }

            container.innerHTML += `
                <div class="feed-item">
                    <div class="feed-icon" style="background-color: ${bgClass}; color: ${textClass};">
                        <i class="bi ${iconClass}"></i>
                    </div>
                    <div class="feed-content w-100">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="fw-bold text-dark" style="font-size: 0.9rem;">${data.userName || 'User'}</span>
                            <small class="text-muted" style="font-size: 0.7rem;">${time}</small>
                        </div>
                        <p class="text-secondary small mb-0" style="line-height: 1.4; font-size: 0.8rem;">
                            ${data.text}
                        </p>
                    </div>
                </div>
            `;
        });
    });
}

// 4. FUNGSI BARU: Render Current Task Widget
// Mencari tugas 'doing' pertama yang ditemukan dari proyek user
async function loadCurrentTaskWidget(uid) {
    const taskTitleEl = document.getElementById('currentTaskTitle');
    const taskProgressEl = document.getElementById('currentTaskProgress');
    const taskProgressBar = document.getElementById('currentTaskProgressBar');
    const taskProjectEl = document.getElementById('currentTaskProject');

    // Pastikan elemen ada di HTML (jika belum, harus ditambahkan ID-nya di index.html)
    if (!taskTitleEl) return; 

    try {
        // Ambil semua proyek user
        const projectsQuery = query(collection(db, "projects"), where("members", "array-contains", uid));
        const projectsSnap = await getDocs(projectsQuery);

        if (projectsSnap.empty) {
            setNoTaskState();
            return;
        }

        let foundTask = null;
        let foundProjectName = "";

        // Loop setiap proyek untuk cari tugas 'doing' (Agak berat tapi solusi termudah tanpa collectionGroup index)
        // Idealnya menggunakan collectionGroup query jika index sudah di-setup di Firebase Console
        for (const projectDoc of projectsSnap.docs) {
            const tasksQuery = query(
                collection(db, "projects", projectDoc.id, "tasks"), 
                where("status", "==", "doing"),
                where("userId", "==", uid), // Hanya tugas milik user ini (opsional) atau semua tugas tim
                limit(1)
            );
            
            // Catatan: Jika ingin menampilkan tugas tim, hapus `where("userId", "==", uid)`
            // Di sini kita asumsikan "Current Task" adalah tugas yang sedang dikerjakan OLEH USER SAYA
            
            const tasksSnap = await getDocs(tasksQuery);
            if (!tasksSnap.empty) {
                foundTask = tasksSnap.docs[0].data();
                foundProjectName = projectDoc.data().name;
                break; // Ketemu satu, stop searching
            }
        }

        if (foundTask) {
            taskTitleEl.textContent = foundTask.title;
            taskProjectEl.textContent = foundProjectName;
            
            // Logika Progress Simulasi:
            // Todo = 0%, Doing = 50%, Done = 100%
            // Karena ini 'doing', kita set 50% atau 75% biar terlihat progress
            const progressVal = "50%"; 
            
            if(taskProgressEl) taskProgressEl.textContent = progressVal;
            if(taskProgressBar) taskProgressBar.style.width = progressVal;
        } else {
            setNoTaskState();
        }

    } catch (err) {
        console.error("Error loading current task:", err);
        setNoTaskState();
    }

    function setNoTaskState() {
        taskTitleEl.textContent = "Tidak ada tugas aktif";
        if(taskProjectEl) taskProjectEl.textContent = "-";
        if(taskProgressEl) taskProgressEl.textContent = "0%";
        if(taskProgressBar) taskProgressBar.style.width = "0%";
    }
}


function setupReferralLogic(uid, myName, modalInstance) {
    const btnClaim = document.getElementById('btnClaimReferral');
    const btnSkip = document.getElementById('btnSkipReferral');
    const inputCode = document.getElementById('inputReferralCode');
    const errorMsg = document.getElementById('referralError');

    if (btnSkip) {
        btnSkip.onclick = async () => {
            if(confirm("Yakin? Bonus ini hangus jika dilewati.")) {
                await updateDoc(doc(db, "users", uid), { redeemedReferral: true }); 
                modalInstance.hide();
            }
        };
    }

    if (btnClaim) {
        btnClaim.onclick = async () => {
            const code = inputCode.value.trim().toUpperCase();
            if (!code) return;

            const qOwner = query(collection(db, "users"), where("myReferralCode", "==", code));
            const ownerSnap = await getDocs(qOwner);

            if (ownerSnap.empty) {
                errorMsg.classList.remove('d-none');
                errorMsg.textContent = "Kode tidak valid.";
                return;
            }

            let ownerId = null;
            let isSelf = false;
            ownerSnap.forEach(d => { if(d.id === uid) isSelf = true; else ownerId = d.id; });

            if (isSelf) { 
                errorMsg.classList.remove('d-none'); 
                errorMsg.textContent = "Tidak bisa pakai kode sendiri."; return; 
            }

            try {
                btnClaim.disabled = true; btnClaim.textContent = "...";
                
                // Tambah Points & Lifetime Points ke Pemilik Kode
                await updateDoc(doc(db, "users", ownerId), { 
                    points: increment(50),
                    lifetimePoints: increment(50) 
                });

                // Tambah Points & Lifetime Points ke User Baru
                await updateDoc(doc(db, "users", uid), { 
                    points: increment(25),
                    lifetimePoints: increment(25), 
                    redeemedReferral: true 
                });

                modalInstance.hide();
                alert(`Sukses! +25 Poin untukmu.`);
            } catch (err) {
                console.error(err);
                alert("Error koneksi.");
                btnClaim.disabled = false; btnClaim.textContent = "Klaim Hadiah";
            }
        };
    }
}

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    currentUid = user.uid;
    loadDashboardData(user.uid);
});