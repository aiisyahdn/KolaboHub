import { auth, db } from "./firebase-config.js";
import {
  doc, getDoc, updateDoc, increment, collection, query, where, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { logActivity } from "./activity.js"; 

let currentUid = null;
let currentUserName = "User";

const REWARD_CATALOG = [
    { id: 'kopikenangan', name: 'Kopi Kenangan', desc: 'Voucher Diskon 20%', cost: 50, imageUrl: 'https://placehold.co/400x200/222/FFF?text=Kopi+Kenangan', color: '#FFB547' },
    { id: 'timezone', name: 'Timezone', desc: 'Saldo Bermain 50K', cost: 100, imageUrl: 'https://placehold.co/400x200/c21515/FFF?text=TIMEZONE', color: '#FF4747' },
    { id: 'spotify', name: 'Spotify Premium', desc: '1 Bulan Individual', cost: 200, imageUrl: 'https://placehold.co/400x200/1DB954/FFF?text=Spotify', color: '#1DB954' },
    { id: 'gopay', name: 'Saldo GoPay', desc: 'Cashback 25.000', cost: 150, imageUrl: 'https://placehold.co/400x200/00AED6/FFF?text=GoPay', color: '#00AED6' },
    { id: 'netflix', name: 'Netflix Mobile', desc: 'Langganan 1 Bulan', cost: 300, imageUrl: 'https://placehold.co/400x200/E50914/FFF?text=NETFLIX', color: '#E50914' }
];

function generateVoucherCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function loadUserPoints(uid) {
    const userRef = doc(db, "users", uid);
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentUserName = data.name || "User"; 
            const points = data.points || 0;
            const pointsElement = document.getElementById('userPoints');
            if (pointsElement) pointsElement.textContent = points;
            renderRewardsCatalog(points);
        }
    });
}

// Logic Load History Client-Side
async function loadRedemptionHistory(uid) {
    const historyContainer = document.getElementById('redemptionHistoryList');
    if (!historyContainer) return;

    const q = query(
        collection(db, "activities"), 
        where("userId", "==", uid)
    );

    try {
        const snapshot = await getDocs(q);
        let allActivities = [];
        snapshot.forEach(doc => allActivities.push(doc.data()));

        // Filter reward saja (abaikan level_up, task, dll) & sort terbaru
        const rewardHistory = allActivities
            .filter(a => a.type === 'reward') 
            .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
            .slice(0, 10);

        historyContainer.innerHTML = "";
        
        if (rewardHistory.length === 0) {
            historyContainer.innerHTML = `<div class="text-center text-muted small py-4">Belum ada riwayat penukaran.</div>`;
            return;
        }

        rewardHistory.forEach((data) => {
            const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString() : "-";
            
            // Parsing teks
            let rewardName = data.text;
            let pointCost = "REWARD";
            
            if (data.text.includes(":")) {
                const parts = data.text.split(":");
                rewardName = parts[1].trim(); 
                const costMatch = parts[0].match(/(\d+)/);
                if(costMatch) pointCost = costMatch[0] + " Poin";
            }

            // Ambil Kode Voucher dari metadata (jika ada)
            const voucherCode = data.metadata?.voucherCode || "KODE-TIDAK-TERSEDIA";

            historyContainer.innerHTML += `
                <div class="history-item" style="cursor: pointer;" onclick="alert('Kode Voucher Anda: ${voucherCode}')">
                    <div class="history-info">
                        <span class="history-badge">${pointCost}</span>
                        <h6>${rewardName}</h6>
                        <small style="opacity: 0.7; font-size: 0.75rem;">
                            <i class="bi bi-calendar3 me-1"></i> ${time}
                        </small>
                    </div>
                    <div class="history-icon">
                        <i class="bi bi-qr-code text-white fs-4"></i>
                    </div>
                </div>
            `;
        });

    } catch (err) {
        console.error("Gagal memuat history:", err);
        historyContainer.innerHTML = `<div class="text-center text-danger small">Gagal memuat data.</div>`;
    }
}

export async function redeemReward(rewardId, cost, rewardName) {
    if (!currentUid) return alert("Anda harus login.");

    const userRef = doc(db, "users", currentUid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return alert("Data user tidak ditemukan.");

    const currentPoints = userSnap.data().points || 0;
    if (currentPoints < cost) return alert("Poin tidak cukup!");

    if(!confirm(`Tukar ${cost} Poin untuk ${rewardName}?`)) return;

    try {
        await updateDoc(userRef, { points: increment(-cost) });
        
        const voucherCode = generateVoucherCode();
        alert(`Berhasil! Kode Voucher: ${voucherCode}\n(Kode tersimpan di riwayat)`);

        const logText = `Menukar ${cost} Poin: ${rewardName}`;
        
        // Simpan dengan Tipe 'reward' dan Metadata Kode Voucher
        await logActivity(currentUid, currentUserName, logText, "reward", null, { voucherCode: voucherCode });
        
        loadRedemptionHistory(currentUid);
        
    } catch (error) {
        console.error("Redeem failed:", error);
        alert("Gagal melakukan penukaran.");
    }
}
window.redeemReward = redeemReward; 

function renderRewardsCatalog(userPoints = 0) {
    const catalogContainer = document.getElementById('rewardsCatalog');
    if (!catalogContainer) return;
    
    catalogContainer.innerHTML = REWARD_CATALOG.map(reward => {
        const isDisabled = userPoints < reward.cost;
        const btnText = isDisabled ? `Butuh ${reward.cost} Poin` : `Tukar (${reward.cost} Poin)`;
        const btnClass = isDisabled ? 'btn-secondary opacity-50' : 'btn-primary-modern';
        
        return `
        <div class="reward-card-brand">
            <img src="${reward.imageUrl}" class="reward-brand-img" alt="${reward.name}">
            <div class="reward-overlay">
                <span class="badge bg-warning text-dark mb-2 fw-bold">${reward.cost} Poin</span>
                <h5 class="fw-bold mb-1">${reward.name}</h5>
                <p class="small text-white-50 mb-3">${reward.desc}</p>
                <button class="btn ${btnClass} w-100 btn-sm py-2" onclick="redeemReward('${reward.id}', ${reward.cost}, '${reward.name}')" ${isDisabled ? 'disabled' : ''}>
                    ${btnText}
                </button>
            </div>
        </div>
    `}).join('');
}

onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    currentUid = user.uid;
    loadUserPoints(user.uid);
    loadRedemptionHistory(user.uid);
});