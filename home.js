import { authentication, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, getDoc, collection, getCountFromServer } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── Update nav based on auth state ───────────────────────────────────────────
// If logged in: swap login/signup buttons for a greeting + logout
// If logged out: show login/signup (default HTML state)

onAuthStateChanged(authentication, async user => {
    if (user) {
        const userDoc = await getDoc(doc(database, "users", user.uid));
        const name = userDoc.data()?.name ?? "Student";

        // Replace nav buttons with greeting
        const navActions = document.querySelector(".nav-actions");
        navActions.innerHTML = `
            <span style="font-size:0.88rem; font-weight:600; color:#64748b;">Hi, ${name.split(" ")[0]}</span>
            <button class="btn-ghost" id="logout-btn">Log out</button>
        `;
        document.getElementById("logout-btn").onclick = () => {
            authentication.signOut().then(() => window.location.reload());
        };

        // Load real dashboard values
        loadDashboard(user.uid);
    }
});

// ── Load real dashboard data ──────────────────────────────────────────────────
async function loadDashboard(uid) {
    const userDoc = await getDoc(doc(database, "users", uid));
    const data = userDoc.data();

    if (data?.moneySaved)   document.getElementById("dash-savings").textContent  = `$${data.moneySaved.toFixed(2)}`;
    if (data?.rentalsActive) document.getElementById("dash-rentals").textContent = `${data.rentalsActive} items`;
    if (data?.ordersTotal)   document.getElementById("dash-orders").textContent  = `${data.ordersTotal} orders`;
    if (data?.savedItems)    document.getElementById("dash-saved").textContent   = `${data.savedItems} items`;
}

// ── Load real listing + user counts into stats strip ─────────────────────────
async function loadStats() {
    try {
        const usersSnap    = await getCountFromServer(collection(database, "users"));
        const listingsSnap = await getCountFromServer(collection(database, "listings"));

        const userCount    = usersSnap.data().count;
        const listingCount = listingsSnap.data().count;

        if (userCount > 0)    document.getElementById("stat-students").textContent = userCount >= 1000 ? (userCount / 1000).toFixed(1) + "k" : userCount;
        if (listingCount > 0) document.getElementById("stat-listings").textContent = listingCount;
    } catch (e) {
        // Collections don't exist yet — placeholder values stay
        console.log("Stats not loaded yet (collections may be empty):", e.message);
    }
}

loadStats();