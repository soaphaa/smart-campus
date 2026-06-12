import { database } from "./firebase-config.js";
import { collection, getCountFromServer } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── Live stats from Firestore ─────────────────────────────────
async function loadStats() {
    try {
        const [usersSnap, listingsSnap] = await Promise.all([
            getCountFromServer(collection(database, "users")),
            getCountFromServer(collection(database, "listings"))
        ]);
        const u = usersSnap.data().count;
        const l = listingsSnap.data().count;

        const studentsEl = document.getElementById("stat-students");
        const listingsEl = document.getElementById("stat-listings");

        if (studentsEl && u > 0)
            studentsEl.textContent = u >= 1000 ? (u / 1000).toFixed(1) + "k" : u;
        if (listingsEl && l > 0)
            listingsEl.textContent = l;
    } catch (e) {
        console.log("Stats unavailable:", e.message);
    }
}

// ── Duplicate cards for seamless infinite auto-scroll ─────────
function initCarousel() {
    const track = document.getElementById("carousel");
    if (!track) return;
    Array.from(track.children).forEach(card => {
        track.appendChild(card.cloneNode(true));
    });
}

loadStats();
initCarousel();