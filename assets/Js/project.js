import { auth, db } from "./firebase-config.js";
import {
  doc, getDoc, addDoc, updateDoc, collection, serverTimestamp,
  query, getDocs, increment, onSnapshot, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { logActivity } from "./activity.js";

const projectId = localStorage.getItem("currentProjectId");
let currentUid = null; 
let currentUserName = "User"; 

// --- Helper Functions ---
function calculateAchievements(points) {
    const level = Math.floor(points / 50) + 1;
    const badges = [];
    if (points >= 10) badges.push("Quick Starter");
    if (points >= 50) badges.push("Team Player");
    if (points >= 100) badges.push("Task Master");
    if (points >= 200) badges.push("MVP Bulan Ini");
    return { level, badges }; 
}

async function updateRewards(uid) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const data = userSnap.data();
    const { level, badges } = calculateAchievements(data.points || 0);
    
    if (data.level !== level || JSON.stringify(data.badges) !== JSON.stringify(badges)) {
        await updateDoc(userRef, { level, badges });
        if (data.level !== level) {
            logActivity(uid, currentUserName, `Naik ke Level ${level}!`, "reward");
        }
    }
    loadProfile(); 
}

async function loadProfile() {
    if (!currentUid) return;
    const d = (await getDoc(doc(db, "users", currentUid))).data();
    currentUserName = d.name || "User";

    const setTxt = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; };
    setTxt("userPoints", d.points || 0);
    setTxt("userLevel", d.level || 1);
    
    const badgeEl = document.getElementById("userBadges");
    if (badgeEl) {
        badgeEl.innerHTML = (d.badges||[]).map(b => `<span class="badge bg-primary-kolabo me-1">${b}</span>`).join('') || "-";
    }
}

// --- LOGIKA STATUS TUGAS & POIN (DIPERBAIKI) ---
async function updateTaskStatus(projectId, taskId, currentStatus, title, isPointsAwarded = false) {
    
    // 1. Tentukan Status Berikutnya (Siklus: Todo -> Doing -> Done)
    // Jika sudah 'done', tidak bisa kembali otomatis (cegah spam poin), atau kembali ke 'todo' tanpa poin
    let nextStatus = currentStatus;
    
    if (currentStatus === "todo") {
        nextStatus = "doing";
    } else if (currentStatus === "doing") {
        nextStatus = "done";
    } else if (currentStatus === "done") {
        // Opsional: Izinkan kembali ke todo jika user salah klik, tapi TIDAK kurangi poin (biar simple)
        // Atau blokir agar tidak bisa diubah lagi
        if(!confirm("Kembalikan tugas ini ke To Do? (Poin tidak akan ditarik kembali)")) return;
        nextStatus = "todo";
    }

    // Jika status tidak berubah, berhenti
    if (nextStatus === currentStatus) return;

    // 2. Update Status di Firestore
    // Kita juga simpan flag 'isPointsAwarded' di tugas agar poin tidak dobel
    const taskRef = doc(db, "projects", projectId, "tasks", taskId);
    
    // Object update dasar
    let updateData = { status: nextStatus };

    // 3. Logika Pemberian Poin (Hanya jika Doing -> Done DAN belum pernah dapat poin)
    if (nextStatus === "done" && currentStatus === "doing") {
        // Cek apakah tugas ini sebelumnya SUDAH pernah memberikan poin?
        // Kita asumsikan flag isPointsAwarded disimpan di dokumen tugas.
        if (!isPointsAwarded) {
            // Beri Poin
            await updateDoc(doc(db, "users", currentUid), { points: increment(10) });
            await logActivity(currentUid, currentUserName, `Selesai: "${title}" (+10 Poin)`, "task");
            await updateRewards(currentUid);
            
            // Tandai tugas ini sudah memberi poin
            updateData.isPointsAwarded = true; 
        }
    }

    // Jalankan Update
    await updateDoc(taskRef, updateData);
    
    // Reload UI
    loadTasks(projectId);
}

// FUNGSI BARU: Update UI Progress Bar
function updateProgressBar(total, done) {
    const bar = document.getElementById("projectProgressBar");
    const text = document.getElementById("progressText");
    
    let percent = 0;
    if (total > 0) {
        percent = Math.round((done / total) * 100);
    }

    if(bar) {
        bar.style.width = `${percent}%`;
        if(percent === 100) {
            bar.className = "progress-bar bg-success";
        } else {
            bar.className = "progress-bar bg-primary";
        }
    }
    if(text) text.innerText = `${percent}% Completed`;
}

// Load Tasks
async function loadTasks(pid) {
    const q = collection(db, "projects", pid, "tasks");
    const snap = await getDocs(q);
    
    const lists = { todo: document.getElementById("todoList"), doing: document.getElementById("doingList"), done: document.getElementById("doneList") };
    
    if (!lists.todo) return;
    Object.values(lists).forEach(el => el.innerHTML = "");

    let totalTasks = 0;
    let doneTasks = 0;
    let tasksArray = [];

    snap.forEach(d => {
        const t = d.data();
        t.id = d.id;
        tasksArray.push(t);
    });

    // Sort Client-side
    tasksArray.sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.seconds : 0;
        const timeB = b.createdAt ? b.createdAt.seconds : 0;
        return timeA - timeB;
    });

    tasksArray.forEach(t => {
        totalTasks++;
        if (t.status === 'done') doneTasks++;

        const li = document.createElement("div"); // Ganti li jadi div agar lebih fleksibel di kanban
        li.className = "kanban-card"; // Pakai class baru dari style.css
        
        // Ikon status
        let statusIcon = '<i class="bi bi-circle text-secondary"></i>';
        if(t.status === 'doing') statusIcon = '<i class="bi bi-arrow-repeat text-primary spin-icon"></i>';
        if(t.status === 'done') statusIcon = '<i class="bi bi-check-circle-fill text-success"></i>';

        li.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <span class="fw-bold text-dark" style="font-size: 0.95rem;">${t.title}</span>
                ${t.status==='done' ? '<span class="badge bg-success-subtle text-success" style="font-size:0.6rem;">DONE</span>' : ''}
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2">
                <small class="text-muted" style="font-size:0.75rem">
                    ${statusIcon} ${t.status === 'todo' ? 'To Do' : (t.status === 'doing' ? 'In Progress' : 'Completed')}
                </small>
                ${t.status !== 'done' ? '<i class="bi bi-chevron-right text-muted small"></i>' : ''}
            </div>
        `;
        
        // Kirim flag isPointsAwarded ke fungsi update
        // Agar kita tahu apakah tugas ini "bekas" done atau baru
        const pointsFlag = t.isPointsAwarded || false;

        li.style.cursor = "pointer";
        li.onclick = () => updateTaskStatus(pid, t.id, t.status, t.title, pointsFlag);
        
        if (lists[t.status]) lists[t.status].appendChild(li);
    });

    updateProgressBar(totalTasks, doneTasks);
}

// --- Chat Logic ---
function loadChat(pid) {
    const chatContainer = document.getElementById("chatContainer");
    if (!chatContainer) return;

    // Hapus orderBy sementara jika index belum ready, atau gunakan limit saja
    // Idealnya: orderBy timestamp desc
    const q = query(
        collection(db, "projects", pid, "messages"), 
        orderBy("timestamp", "desc"), 
        limit(50)
    );

    onSnapshot(q, (snapshot) => {
        chatContainer.innerHTML = "";
        
        if (snapshot.empty) {
            chatContainer.innerHTML = '<div class="text-center text-muted small mt-5">Belum ada pesan. Mulailah diskusi!</div>';
            return;
        }

        snapshot.forEach((doc) => {
            const msg = doc.data();
            const isMe = msg.userId === currentUid;
            const time = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...';

            const msgDiv = document.createElement("div");
            msgDiv.className = `chat-bubble ${isMe ? 'chat-own' : 'chat-other'}`;
            msgDiv.innerHTML = `
                ${!isMe ? `<div class="fw-bold small text-primary mb-1">${msg.userName}</div>` : ''}
                <div>${msg.text}</div>
                <div class="text-end" style="font-size: 0.65rem; opacity: 0.7; margin-top:4px;">${time}</div>
            `;
            chatContainer.appendChild(msgDiv);
        });
    }, (error) => {
        console.log("Chat Error (Index?):", error);
    });

    const btnSend = document.getElementById("btnSendChat");
    const inputChat = document.getElementById("chatInput");

    const newBtnSend = btnSend.cloneNode(true);
    btnSend.parentNode.replaceChild(newBtnSend, btnSend);

    newBtnSend.addEventListener("click", async () => {
        const text = inputChat.value.trim();
        if (!text) return;

        try {
            await addDoc(collection(db, "projects", pid, "messages"), {
                text: text,
                userId: currentUid,
                userName: currentUserName,
                timestamp: serverTimestamp()
            });
            inputChat.value = ""; 
        } catch (error) {
            console.error("Gagal kirim pesan:", error);
        }
    });
    
    inputChat.addEventListener("keypress", (e) => {
        if (e.key === "Enter") newBtnSend.click();
    });
}

async function loadMembers(project) {
    const list = document.getElementById("memberList");
    if (!list) return;
    list.innerHTML = "";
    for (let uid of project.members) {
        const u = (await getDoc(doc(db, "users", uid))).data();
        // Tampilkan avatar kecil untuk member
        if (u) list.innerHTML += `
            <li class="d-flex align-items-center bg-white px-3 py-2 rounded border shadow-sm">
                <img src="https://placehold.co/30x30/4318FF/ffffff?text=${u.name.charAt(0)}" class="rounded-circle me-2" width="30">
                <span class="small fw-bold text-dark">${u.name}</span>
            </li>
        `;
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) return window.location.href = "login.html";
    currentUid = user.uid;
    
    if (!projectId) return window.location.href = "myproject.html";

    const pSnap = await getDoc(doc(db, "projects", projectId));
    if (!pSnap.exists()) return window.location.href = "myproject.html";
    
    document.getElementById("projectName").innerText = pSnap.data().name;
    loadMembers(pSnap.data());
    
    // Load Data
    loadTasks(projectId);
    loadProfile();
    loadChat(projectId);

    const btnAdd = document.getElementById("addTask");
    if (btnAdd) {
        btnAdd.onclick = async () => {
            const input = document.getElementById("newTask");
            if (!input.value.trim()) return;
            
            // Reset isPointsAwarded ke false saat buat tugas baru
            await addDoc(collection(db, "projects", projectId, "tasks"), {
                title: input.value, 
                status: "todo", 
                isPointsAwarded: false, // Default belum dapat poin
                createdAt: serverTimestamp(), 
                userId: user.uid
            });
            
            await logActivity(currentUid, currentUserName, `Tugas baru: "${input.value}"`, "task");
            input.value = "";
            loadTasks(projectId);
        };
    }
});