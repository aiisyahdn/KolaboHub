import { db } from "./firebase-config.js";
import {
  addDoc, collection, serverTimestamp, 
  query, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/**
 * Mencatat aktivitas baru ke Firestore.
 * @param {string} userId - UID pengguna
 * @param {string} userName - Nama pengguna
 * @param {string} text - Deskripsi aktivitas
 * @param {string} type - 'task', 'reward', 'project'
 * @param {string|null} projectId - ID Proyek (Opsional, jika ada)
 */
export async function logActivity(userId, userName, text, type = "info", projectId = null) {
    try {
        await addDoc(collection(db, "activities"), {
            userId: userId,
            userName: userName,
            text: text,
            type: type,
            projectId: projectId, // Field Baru
            timestamp: serverTimestamp()
        });
        console.log("Activity logged:", text);
    } catch (error) {
        console.error("Error logging activity:", error);
    }
}

/**
 * Memuat aktivitas terbaru secara realtime.
 * Saat ini kita menampilkan semua aktivitas global.
 */
export function loadActivities() {
    const activityList = document.getElementById("activityList");
    if (!activityList) return;

    // Query: Ambil 5 aktivitas terakhir, urutkan dari yang paling baru
    const q = query(
        collection(db, "activities"), 
        orderBy("timestamp", "desc"), 
        limit(5)
    );

    onSnapshot(q, (snapshot) => {
        activityList.innerHTML = ""; // Bersihkan list lama

        if (snapshot.empty) {
            activityList.innerHTML = "<li class='list-group-item text-muted'>Belum ada aktivitas.</li>";
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const icon = getIconByType(data.type);
            // Format waktu sederhana
            const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Baru saja";
            
            const li = document.createElement("li");
            li.className = "list-group-item d-flex align-items-center";
            li.innerHTML = `
                <div class="me-3 fs-4">${icon}</div>
                <div>
                    <span class="fw-bold text-dark">${data.userName || 'User'}</span> 
                    <span class="text-muted small ms-2">${time}</span>
                    <br>
                    <span class="small text-secondary">${data.text}</span>
                </div>
            `;
            activityList.appendChild(li);
        });
    });
}

function getIconByType(type) {
    switch (type) {
        case 'task': return '<i class="bi bi-check-circle-fill text-success"></i>';
        case 'reward': return '<i class="bi bi-gift-fill text-warning"></i>';
        case 'project': return '<i class="bi bi-folder-plus text-primary"></i>';
        default: return '<i class="bi bi-info-circle-fill text-secondary"></i>';
    }
}