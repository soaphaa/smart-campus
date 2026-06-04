import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, getDoc, collection, getCountFromServer } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── Auth state: swap nav buttons if logged in ─────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (user) {
        const userDoc = await getDoc(doc(database, "users", user.uid));
        const name = userDoc.data()?.name ?? "Student";

        const navActions = document.querySelector(".nav-actions");
        navActions.innerHTML = `
            <span style="font-size:0.88rem; font-weight:600; color:#64748b;">Hi, ${name.split(" ")[0]} 👋</span>
            <button class="btn-ghost" id="logout-btn">Log out</button>
        `;
        document.getElementById("logout-btn").onclick = () =>
            authentication.signOut().then(() => window.location.reload());

        loadDashboard(user.uid, userDoc.data());
    }
});

// ── Dashboard values from Firestore ──────────────────────────────────────────
function loadDashboard(uid, data) {
    if (!data) return;
    if (data.moneySaved   != null) document.getElementById("dash-savings").textContent  = `$${data.moneySaved.toFixed(2)}`;
    if (data.rentalsActive != null) document.getElementById("dash-rentals").textContent = `${data.rentalsActive} items`;
    if (data.ordersTotal   != null) document.getElementById("dash-orders").textContent  = `${data.ordersTotal} orders`;
    if (data.savedItems    != null) document.getElementById("dash-saved").textContent   = `${data.savedItems} items`;
}

// ── Live stats from Firestore counts ─────────────────────────────────────────
async function loadStats() {
    try {
        const [usersSnap, listingsSnap] = await Promise.all([
            getCountFromServer(collection(database, "users")),
            getCountFromServer(collection(database, "listings"))
        ]);
        const u = usersSnap.data().count;
        const l = listingsSnap.data().count;
        if (u > 0) document.getElementById("stat-students").textContent = u >= 1000 ? (u / 1000).toFixed(1) + "k" : u;
        if (l > 0) document.getElementById("stat-listings").textContent = l;
    } catch (e) {
        console.log("Stats unavailable:", e.message);
    }
}

loadStats();