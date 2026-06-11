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

// ── Drag-to-scroll for carousel ───────────────────────────────
function initCarouselDrag() {
    const wrap = document.querySelector(".carousel-track-wrap");
    if (!wrap) return;

    let isDown = false, startX = 0, scrollLeft = 0;

    wrap.addEventListener("mousedown", e => {
        isDown = true;
        wrap.classList.add("dragging");
        startX     = e.pageX - wrap.offsetLeft;
        scrollLeft = wrap.scrollLeft;
    });
    wrap.addEventListener("mouseleave", () => { isDown = false; wrap.classList.remove("dragging"); });
    wrap.addEventListener("mouseup",    () => { isDown = false; wrap.classList.remove("dragging"); });
    wrap.addEventListener("mousemove",  e => {
        if (!isDown) return;
        e.preventDefault();
        const x    = e.pageX - wrap.offsetLeft;
        wrap.scrollLeft = scrollLeft - (x - startX) * 1.4;
    });
}

loadStats();
initCarouselDrag();