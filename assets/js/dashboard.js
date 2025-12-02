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
    
    // Panggil fungsi dengan urutan yang benar
    // Kita perlu load project list dulu sebelum load aktivitas, agar bisa difilter
    loadProjectsAndActivities(uid);
    loadCurrentTaskWidget(uid); 
}

// Fungsi Gabungan: Load Proyek -> Load Aktivitas (agar filter bekerja)
async function loadProjectsAndActivities(uid) {
    const activeContainer = document.getElementById('activeProjectsContainer');
    const feedContainer = document.getElementById('activityListContainer');
    
    // 1. Ambil Semua Proyek User (untuk Widget & Filter Feed)
    const qProjects = query(collection(db, "projects"), where("members", "array-contains", uid));
    
    try {
        const snapshot = await getDocs(qProjects);
        let myProjectIds = []; // Simpan ID proyek user di sini
        let projectsData = [];

        snapshot.forEach(doc => {
            const p = doc.data();
            myProjectIds.push(doc.id);
            projectsData.push(p);
        });

        // 2. Render Widget Active Projects (Ambil 3 teratas)
        if (activeContainer) {
            activeContainer.innerHTML = "";
            if (projectsData.length === 0) {
                activeContainer.innerHTML = `<div class="text-center text-muted small my-auto">Belum ada proyek aktif.</div>`;
            } else {
                // Ambil 3 saja
                projectsData.slice(0, 3).forEach((p, index) => {
                    const circleClass = index === 0 ? 'circle-1' : (index === 1 ? 'circle-2' : 'circle-3');
                    activeContainer.innerHTML += `
                        <div class="project-circle-item">
                            <div class="circle-placeholder ${circleClass} shadow-sm">
                                <i class="bi bi-folder2-open"></i>
                            </div>
                            <div class="project-name-small text-truncate px-1">${p.name}</div>
                        </div>
                    `;
                });
            }
        }

        // 3. Render Activity Feed (Filter based on myProjectIds OR myUid)
        loadSidebarActivitiesFiltered(uid, myProjectIds);

    } catch (err) {
        console.error("Error loading dashboard data:", err);
    }
}

// Fungsi Render Feed dengan Filter Manual (Client-side Filtering)
function loadSidebarActivitiesFiltered(myUid, myProjectIds) {
    const container = document.getElementById('activityListContainer');
    if (!container) return;

    // Ambil 50 aktivitas terbaru secara global
    // (Firestore tidak bisa query OR yang kompleks, jadi kita filter di client)
    const q = query(collection(db, "activities"), orderBy("timestamp", "desc"), limit(50));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        let count = 0;
        const MAX_DISPLAY = 5; // Tampilkan 5 aktivitas saja

        snapshot.forEach(doc => {
            if (count >= MAX_DISPLAY) return;

            const data = doc.data();
            
            // --- LOGIKA FILTER ---
            // Tampilkan jika:
            // 1. Aktivitas milik SAYA SENDIRI (userId == myUid)
            // 2. ATAU Aktivitas terkait PROYEK SAYA (projectId ada di myProjectIds)
            
            const isMyActivity = data.userId === myUid;
            const isMyProjectActivity = data.projectId && myProjectIds.includes(data.projectId);

            if (isMyActivity || isMyProjectActivity) {
                
                const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Now";
                let iconClass = "bi-info-circle"; let bgClass = "#E9EDF7"; let textClass = "#2B3674";
                let actorName = isMyActivity ? "Anda" : (data.userName || "Seseorang");
                let fullMessage = `<strong>${actorName}</strong> ${data.text}`;

                if (data.type === 'reward') { iconClass = "bi-gift-fill"; textClass = "#FFB547"; bgClass = "#FFF7E8"; }
                if (data.type === 'task') { iconClass = "bi-check-circle-fill"; textClass = "#05CD99"; bgClass = "#E6FAF5"; }
                if (data.type === 'project') { iconClass = "bi-folder-fill"; textClass = "#4318FF"; bgClass = "#F4F7FE"; }

                container.innerHTML += `
                    <div class="feed-item">
                        <div class="feed-icon" style="background-color: ${bgClass}; color: ${textClass};">
                            <i class="bi ${iconClass}"></i>
                        </div>
                        <div class="feed-content w-100">
                            <p class="text-dark small mb-1" style="line-height: 1.4;">
                                ${fullMessage}
                            </p>
                            <small class="text-muted" style="font-size: 0.7rem;">${time}</small>
                        </div>
                    </div>
                `;
                count++;
            }
        });

        if (count === 0) {
            container.innerHTML = "<p class='text-muted small text-center'>Belum ada aktivitas.</p>";
        }
    });
}

async function loadCurrentTaskWidget(uid) {
    const taskTitleEl = document.getElementById('currentTaskTitle');
    const taskProgressEl = document.getElementById('currentTaskProgress');
    const taskProgressBar = document.getElementById('currentTaskProgressBar');
    const taskProjectEl = document.getElementById('currentTaskProject');

    if (!taskTitleEl) return; 

    try {
        const projectsQuery = query(collection(db, "projects"), where("members", "array-contains", uid));
        const projectsSnap = await getDocs(projectsQuery);

        if (projectsSnap.empty) { setNoTaskState(); return; }

        let foundTask = null;
        let foundProjectName = "";

        for (const projectDoc of projectsSnap.docs) {
            const tasksQuery = query(
                collection(db, "projects", projectDoc.id, "tasks"), 
                where("status", "==", "doing"),
                where("userId", "==", uid), 
                limit(1)
            );
            
            const tasksSnap = await getDocs(tasksQuery);
            if (!tasksSnap.empty) {
                foundTask = tasksSnap.docs[0].data();
                foundProjectName = projectDoc.data().name;
                break; 
            }
        }

        if (foundTask) {
            taskTitleEl.textContent = foundTask.title;
            taskProjectEl.textContent = foundProjectName;
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