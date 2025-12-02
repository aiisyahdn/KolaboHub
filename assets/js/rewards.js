import { auth, db } from "./firebase-config.js";
import {
  doc, getDoc, updateDoc, increment,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { logActivity } from "./activity.js";

let currentUid = null;
let currentUserName = "User";

const REWARD_CATALOG = [
    { id: 'voucher-kopi', name: 'Voucher Kopi Rp25K', cost: 50, value: 'Nikmati kopi favoritmu.', imageUrl: 'https://placehold.co/300x200/FFB547/ffffff?text=KOPI' },
    { id: 'voucher-transport', name: 'Diskon Grab 50K', cost: 100, value: 'Perjalanan lebih hemat.', imageUrl: 'https://placehold.co/300x200/4318FF/ffffff?text=GRAB' },
    { id: 'e-money', name: 'Saldo E-Money 100K', cost: 200, value: 'Top up saldo praktis.', imageUrl: 'https://placehold.co/300x200/05CD99/ffffff?text=E-MONEY' },
    { id: 'premium-acc', name: 'Lisensi Premium 1 Bulan', cost: 300, value: 'Akses fitur pro gratis.', imageUrl: 'https://placehold.co/300x200/2B3674/ffffff?text=PREMIUM' },
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
            if (pointsElement) {
                pointsElement.textContent = points;
                checkRedeemAvailability(points);
            }
        }
    });
}

function checkRedeemAvailability(currentPoints) {
    document.querySelectorAll('.btn-redeem-modern').forEach(button => {
        const cost = parseInt(button.getAttribute('data-cost'));
        if (currentPoints < cost) {
            button.disabled = true;
            button.textContent = `Kurang (${cost} Poin)`;
            button.style.opacity = "0.6";
        } else {
            button.disabled = false;
            button.textContent = `Tukar (${cost} Poin)`;
            button.style.opacity = "1";
        }
    });
}

export async function redeemReward(rewardId, cost) {
    if (!currentUid) return alert("Anda harus login.");

    const userRef = doc(db, "users", currentUid);
    const userSnap = await getDoc(userRef);
    const currentPoints = userSnap.data().points || 0;

    if (currentPoints < cost) {
        return alert("Poin Anda tidak cukup!");
    }

    if(!confirm(`Tukar ${cost} Poin untuk hadiah ini?`)) return;

    try {
        await updateDoc(userRef, {
            points: increment(-cost)
        });

        const reward = REWARD_CATALOG.find(r => r.id === rewardId);
        const rewardName = reward?.name || 'Reward';
        const voucherCode = generateVoucherCode();
        
        alert(`Berhasil! Voucher ${rewardName} Anda: ${voucherCode}`);

        // Log Aktivitas (Project ID = null)
        await logActivity(currentUid, currentUserName, `Menukar ${cost} Poin: ${rewardName}`, "reward", null);
        
    } catch (error) {
        console.error("Redeem failed:", error);
        alert("Gagal melakukan penukaran.");
    }
}
window.redeemReward = redeemReward; 

function renderRewardsCatalog() {
    const catalogContainer = document.getElementById('rewardsCatalog');
    if (!catalogContainer) return;
    
    catalogContainer.innerHTML = REWARD_CATALOG.map(reward => `
        <div class="reward-card">
            <img src="${reward.imageUrl}" class="reward-img" alt="${reward.name}">
            <div class="reward-body text-center">
                <h5 class="fw-bold text-dark mb-2" style="font-size: 1.1rem;">${reward.name}</h5>
                <p class="text-muted small mb-4">${reward.value}</p>
                <button 
                    class="btn btn-redeem-modern" 
                    data-cost="${reward.cost}" 
                    data-id="${reward.id}"
                    onclick="redeemReward('${reward.id}', ${reward.cost})"
                    disabled
                >
                    Loading...
                </button>
            </div>
        </div>
    `).join('');
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUid = user.uid;
    renderRewardsCatalog();
    loadUserPoints(user.uid);
});