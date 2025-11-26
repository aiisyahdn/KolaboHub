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
    
    // Listener User Data
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentUserName = data.name || "User";
            const points = data.points || 0;
            
            const dashboardPointsEl = document.getElementById('dashboardPoints');
            const welcomeNameEl = document.getElementById('welcomeName');
            
            if (dashboardPointsEl) dashboardPointsEl.textContent = points;
            if (welcomeNameEl) welcomeNameEl.textContent = currentUserName;

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
}

// Render Lingkaran Proyek (Updated Style)
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

// Render Aktivitas Sidebar (Updated Style)
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
                    <div class="feed-content">
                        <h6 class="text-truncate" style="max-width: 180px;" title="${data.text}">${data.text}</h6>
                        <small>${time}</small>
                    </div>
                </div>
            `;
        });
    });
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
                
                await updateDoc(doc(db, "users", ownerId), { points: increment(50) });
                await updateDoc(doc(db, "users", uid), { points: increment(25), redeemedReferral: true });

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