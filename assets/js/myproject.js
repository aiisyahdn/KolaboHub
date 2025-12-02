import { auth, db } from "./firebase-config.js";
import {
  collection, addDoc, serverTimestamp,
  query, where, getDocs, updateDoc, doc, arrayUnion, getDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { logActivity } from "./activity.js";

let currentUserName = "User";

function generateProjectCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function loadNavbarPoints(uid) {
    onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const navbarPointsEl = document.getElementById('navbarPoints');
            if (navbarPointsEl) {
                navbarPointsEl.textContent = `${data.points || 0} Poin`;
            }
        }
    });
}

async function loadProjects(uid) {
    const list = document.getElementById("projectList");
    if (!list) return;

    list.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border text-primary spinner-border-sm" role="status"></div> Memuat...</div>';
    
    const q = query(collection(db, "projects"), where("members", "array-contains", uid));
    
    try {
        const result = await getDocs(q);

        if (result.empty) {
            list.innerHTML = '<div class="text-center text-muted w-100 py-5">Belum ada proyek. Silakan buat atau gabung.</div>';
            return;
        }

        let html = "";
        result.forEach(docRef => {
            let p = docRef.data();
            html += `
                <div class="project-card-item" data-id="${docRef.id}">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="fw-bold text-primary-dark mb-0">${p.name}</h5>
                        <span class="badge bg-primary-light text-primary px-3 py-2 rounded-pill">Active</span>
                    </div>
                    <p class="text-secondary small mb-3" style="min-height: 40px;">${p.description || "Tidak ada deskripsi"}</p>
                    
                    <div class="d-flex justify-content-between align-items-center pt-3 border-top">
                        <small class="text-muted bg-light px-2 py-1 rounded">Code: <b class="text-dark user-select-all">${p.projectCode}</b></small>
                        <i class="bi bi-arrow-right-circle-fill text-primary fs-4"></i>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
        
        document.querySelectorAll(".project-card-item").forEach(card => {
            card.addEventListener("click", () => {
                localStorage.setItem("currentProjectId", card.getAttribute("data-id"));
                window.location.href = "project.html";
            });
        });
    } catch (err) {
        console.error(err);
        list.innerHTML = '<div class="text-danger text-center">Gagal memuat data.</div>';
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }

    loadNavbarPoints(user.uid);
    loadProjects(user.uid);

    const userSnap = await getDoc(doc(db, "users", user.uid));
    if(userSnap.exists()) currentUserName = userSnap.data().name;

    const btnCreate = document.getElementById("btnCreateProject");
    if (btnCreate) {
        btnCreate.addEventListener("click", async () => {
            const name = document.getElementById("projectName").value;
            const desc = document.getElementById("projectDesc").value;
            if (!name) return alert("Nama proyek wajib diisi");

            try {
                btnCreate.disabled = true; btnCreate.innerText = "...";
                
                const newProjectRef = await addDoc(collection(db, "projects"), {
                    name, description: desc, ownerId: user.uid, members: [user.uid],
                    projectCode: generateProjectCode(), createdAt: serverTimestamp()
                });

                // LOG DENGAN PROJECT ID (newProjectRef.id)
                await logActivity(user.uid, currentUserName, `Membuat proyek baru: ${name}`, "project", newProjectRef.id);
                
                alert("Proyek berhasil dibuat!");
                location.reload();
            } catch (e) { 
                alert("Error: " + e.message); 
                btnCreate.disabled = false; btnCreate.innerText = "Buat Proyek";
            }
        });
    }

    const btnJoin = document.getElementById("btnJoinProject");
    if (btnJoin) {
        btnJoin.addEventListener("click", async () => {
            const code = document.getElementById("joinCode").value.trim();
            if (!code) return;
            
            const q = query(collection(db, "projects"), where("projectCode", "==", code));
            const snap = await getDocs(q);
            
            if (snap.empty) return alert("Kode salah!");
            
            snap.forEach(async (docRef) => {
                const p = docRef.data();
                if (p.members.includes(user.uid)) return alert("Sudah bergabung!");
                
                await updateDoc(doc(db, "projects", docRef.id), { members: arrayUnion(user.uid) });
                
                // LOG DENGAN PROJECT ID (docRef.id)
                await logActivity(user.uid, currentUserName, `Bergabung ke proyek: ${p.name}`, "project", docRef.id);
                
                alert("Berhasil bergabung!");
                location.reload();
            });
        });
    }
});