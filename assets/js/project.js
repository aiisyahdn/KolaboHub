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
let currentProjectName = "Proyek"; 

// --- Helper Functions ---
function calculateAchievements(totalPoints) {
    // Level dihitung berdasarkan TOTAL POIN SEUMUR HIDUP (bukan saldo saat ini)
    const level = Math.floor(totalPoints / 50) + 1;
    const badges = [];
    if (totalPoints >= 10) badges.push("Quick Starter");
    if (totalPoints >= 50) badges.push("Team Player");
    if (totalPoints >= 100) badges.push("Task Master");
    if (totalPoints >= 200) badges.push("MVP Bulan Ini");
    return { level, badges }; 
}

async function updateRewards(uid) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const data = userSnap.data();
    
    // Gunakan lifetimePoints jika ada, jika tidak fallback ke points
    const totalLifetimePoints = data.lifetimePoints !== undefined ? data.lifetimePoints : (data.points || 0);
    
    const { level, badges } = calculateAchievements(totalLifetimePoints);
    
    // Update Level jika naik
    if (data.level !== level || JSON.stringify(data.badges) !== JSON.stringify(badges)) {
        await updateDoc(userRef, { level, badges });
        if (data.level !== level) {
            logActivity(uid, currentUserName, `naik ke Level ${level}!`, "reward");
        }
    }
    loadProfile(); 
}

async function loadProfile() {
    if (!currentUid) return;
    const d = (await getDoc(doc(db, "users", currentUid))).data();
    currentUserName = d.name || "User";

    const setTxt = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; };
    setTxt("userPoints", d.points || 0); // Poin Saldo (Bisa berkurang)
    setTxt("userLevel", d.level || 1);   // Level (Stabil)
    
    const badgeEl = document.getElementById("userBadges");
    if (badgeEl) {
        badgeEl.innerHTML = (d.badges||[]).map(b => `<span class="badge bg-primary-kolabo me-1">${b}</span>`).join('') || "-";
    }
}

// --- LOGIKA STATUS TUGAS ---
async function updateTaskStatus(projectId, taskId, currentStatus, title, isPointsAwarded = false) {
    
    let nextStatus = currentStatus;
    if (currentStatus === "todo") nextStatus = "doing";
    else if (currentStatus === "doing") nextStatus = "done";
    else if (currentStatus === "done") {
        if(!confirm("Kembalikan tugas ini ke To Do?")) return;
        nextStatus = "todo";
    }

    if (nextStatus === currentStatus) return;

    const taskRef = doc(db, "projects", projectId, "tasks", taskId);
    let updateData = { status: nextStatus };

    if (nextStatus === "done" && currentStatus === "doing") {
        if (!isPointsAwarded) {
            const userRef = doc(db, "users", currentUid);
            
            // --- PERBAIKAN: Safety Check Lifetime Points ---
            // Sebelum increment, pastikan lifetimePoints sudah ada.
            // Jika belum ada, kita inisialisasi dengan poin saat ini agar tidak mulai dari 0.
            try {
                const s = await getDoc(userRef);
                if (s.exists()) {
                    const d = s.data();
                    if (d.lifetimePoints === undefined) {
                        await updateDoc(userRef, { lifetimePoints: d.points || 0 });
                    }
                }
            } catch (e) {
                console.error("Gagal sinkronisasi lifetimePoints:", e);
            }
            // ------------------------------------------------

            // Tambah ke 'points' (Saldo) DAN 'lifetimePoints' (Reputasi)
            await updateDoc(userRef, { 
                points: increment(10),
                lifetimePoints: increment(10) 
            });
            
            const activityText = `+10 point menyelesaikan tugas "${title}" pada project "${currentProjectName}"`;
            await logActivity(currentUid, currentUserName, activityText, "task");
            
            await updateRewards(currentUid); // Cek kenaikan level
            updateData.isPointsAwarded = true; 
        }
    }

    await updateDoc(taskRef, updateData);
    loadTasks(projectId);
}

// Update UI Progress Bar
function updateProgressBar(total, done) {
    const bar = document.getElementById("projectProgressBar");
    const text = document.getElementById("progressText");
    let percent = 0;
    if (total > 0) percent = Math.round((done / total) * 100);

    if(bar) {
        bar.style.width = `${percent}%`;
        bar.className = percent === 100 ? "progress-bar bg-success" : "progress-bar bg-primary";
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

    let totalTasks = 0, doneTasks = 0, tasksArray = [];
    snap.forEach(d => { tasksArray.push({ ...d.data(), id: d.id }); });

    tasksArray.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

    tasksArray.forEach(t => {
        totalTasks++;
        if (t.status === 'done') doneTasks++;

        const li = document.createElement("div"); li.className = "kanban-card"; 
        let statusIcon = t.status === 'done' ? '<i class="bi bi-check-circle-fill text-success"></i>' : (t.status === 'doing' ? '<i class="bi bi-arrow-repeat text-primary spin-icon"></i>' : '<i class="bi bi-circle text-secondary"></i>');

        li.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <span class="fw-bold text-dark" style="font-size: 0.95rem;">${t.title}</span>
                ${t.status==='done' ? '<span class="badge bg-success-subtle text-success" style="font-size:0.6rem;">DONE</span>' : ''}
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2">
                <small class="text-muted" style="font-size:0.75rem">${statusIcon} ${t.status}</small>
            </div>
        `;
        
        li.style.cursor = "pointer";
        li.onclick = () => updateTaskStatus(pid, t.id, t.status, t.title, t.isPointsAwarded || false);
        if (lists[t.status]) lists[t.status].appendChild(li);
    });
    updateProgressBar(totalTasks, doneTasks);
}

function loadChat(pid) {
    const chatContainer = document.getElementById("chatContainer");
    if (!chatContainer) return;
    const q = query(collection(db, "projects", pid, "messages"), orderBy("timestamp", "desc"), limit(50));

    onSnapshot(q, (snapshot) => {
        chatContainer.innerHTML = "";
        if (snapshot.empty) { chatContainer.innerHTML = '<div class="text-center text-muted small mt-5">Belum ada pesan.</div>'; return; }
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
    }, (error) => { console.log("Chat Error:", error); });

    const btnSend = document.getElementById("btnSendChat");
    const inputChat = document.getElementById("chatInput");
    const newBtnSend = btnSend.cloneNode(true);
    btnSend.parentNode.replaceChild(newBtnSend, btnSend);

    newBtnSend.addEventListener("click", async () => {
        const text = inputChat.value.trim();
        if (!text) return;
        try {
            await addDoc(collection(db, "projects", pid, "messages"), {
                text: text, userId: currentUid, userName: currentUserName, timestamp: serverTimestamp()
            });
            inputChat.value = ""; 
        } catch (error) { console.error("Gagal kirim pesan:", error); }
    });
    inputChat.addEventListener("keypress", (e) => { if (e.key === "Enter") newBtnSend.click(); });
}

async function loadMembers(project) {
    const list = document.getElementById("memberList");
    if (!list) return;
    list.innerHTML = "";
    for (let uid of project.members) {
        const u = (await getDoc(doc(db, "users", uid))).data();
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
    
    currentProjectName = pSnap.data().name; 
    document.getElementById("projectName").innerText = currentProjectName;
    
    // Perbaikan: Pastikan data user diperbaiki saat load pertama kali juga
    const userRef = doc(db, "users", user.uid);
    getDoc(userRef).then(snap => {
        if(snap.exists() && snap.data().lifetimePoints === undefined) {
             updateDoc(userRef, { lifetimePoints: snap.data().points || 0 });
        }
    });

    loadMembers(pSnap.data());
    loadTasks(projectId);
    loadProfile();
    loadChat(projectId);

    const btnAdd = document.getElementById("addTask");
    if (btnAdd) {
        btnAdd.onclick = async () => {
            const input = document.getElementById("newTask");
            if (!input.value.trim()) return;
            await addDoc(collection(db, "projects", projectId, "tasks"), {
                title: input.value, status: "todo", isPointsAwarded: false, createdAt: serverTimestamp(), userId: user.uid
            });
            await logActivity(currentUid, currentUserName, `membuat tugas baru "${input.value}" pada project "${currentProjectName}"`, "task");
            input.value = "";
            loadTasks(projectId);
        };
    }
});