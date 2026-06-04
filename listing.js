import { database, authentication } from "./firebase-config.js";
import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    doc, getDoc, deleteDoc, updateDoc, increment,
    collection, getDocs, addDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ──────────────────────────────────────────────────
const statusScreen = document.getElementById("status-screen");
const detailMain = document.getElementById("detail-main");

const mainImageWrap = document.getElementById("main-image-wrap");
const thumbRow = document.getElementById("thumb-row");

const categoryEl = document.getElementById("detail-category");
const titleEl = document.getElementById("detail-title");
const priceEl = document.getElementById("detail-price");
const metaEl = document.getElementById("detail-meta");
const descriptionEl = document.getElementById("detail-description");

const sellerAvatar = document.getElementById("seller-avatar");
const sellerName = document.getElementById("seller-name");
const sellerSchool = document.getElementById("seller-school");
const sellerEmail = document.getElementById("seller-email");

const actionsEl = document.getElementById("actions");

// ── State ────────────────────────────────────────────────
let ME = null;
let listingId = null;
let listing = null;

const CATEGORY_LABEL = {
    new: "New", used: "Used", rent: "Rent", exchange: "Exchange"
};

// ── Init ─────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
listingId = params.get("id");

if (!listingId) {
    showStatus("⚠️", "No listing ID provided.");
}

onAuthStateChanged(authentication, async user => {
    if (!user) {
        window.location.href = "login.html#login";
        return;
    }
    const userDoc = await getDoc(doc(database, "users", user.uid));
    const data = userDoc.data() ?? {};
    ME = {
        uid: user.uid,
        name: data.name ?? user.email,
        email: user.email,
        school: data.school ?? ""
    };

    if (listingId) await loadListing();
});

// ── Load + render ────────────────────────────────────────
async function loadListing() {
    try {
        const snap = await getDoc(doc(database, "listings", listingId));
        if (!snap.exists()) {
            showStatus("📭", "This listing no longer exists.");
            return;
        }
        listing = { id: snap.id, ...snap.data() };
        render();

        if (listing.sellerId !== ME.uid) {
            updateDoc(doc(database, "listings", listingId), { views: increment(1) })
                .catch(err => console.warn("View increment failed:", err));
        }
    } catch (err) {
        console.error("Load listing failed:", err);
        showStatus("⚠️", "Couldn't load this listing.");
    }
}

function render() {
    statusScreen.classList.add("hidden");
    detailMain.classList.remove("hidden");

    // Gallery
    const images = listing.images ?? [];
    if (images.length > 0) {
        setMainImage(images[0]);
        thumbRow.innerHTML = images.map((src, i) => `
            <div class="thumb ${i === 0 ? "active" : ""}" data-i="${i}">
                <img src="${escapeAttr(src)}" alt="">
            </div>
        `).join("");
        thumbRow.addEventListener("click", e => {
            const t = e.target.closest(".thumb");
            if (!t) return;
            thumbRow.querySelectorAll(".thumb").forEach(x => x.classList.remove("active"));
            t.classList.add("active");
            setMainImage(images[Number(t.dataset.i)]);
        });
    }

    // Category + title + price
    if (listing.category) {
        categoryEl.textContent = CATEGORY_LABEL[listing.category] ?? listing.category;
        categoryEl.classList.add(`cat-${listing.category}`);
    } else {
        categoryEl.classList.add("hidden");
    }

    titleEl.textContent = listing.title ?? "Untitled";
    priceEl.innerHTML = formatPrice(listing);

    // Meta row
    const metaParts = [];
    if (listing.condition) {
        metaParts.push(`<span class="meta-item"><strong>Condition:</strong> ${escapeHtml(listing.condition)}</span>`);
    }
    if (listing.materialType) {
        metaParts.push(`<span class="meta-item"><strong>Type:</strong> ${escapeHtml(listing.materialType)}</span>`);
    }
    if (listing.courseCode) {
        metaParts.push(`<span class="meta-item"><strong>Course:</strong> ${escapeHtml(listing.courseCode)}</span>`);
    }
    if (listing.teacher) {
        metaParts.push(`<span class="meta-item"><strong>Teacher:</strong> ${escapeHtml(listing.teacher)}</span>`);
    }
    metaParts.push(`<span class="meta-item"><i class="fa-regular fa-clock"></i> ${timeAgo(listing.postedAt)}</span>`);
    if (typeof listing.views === "number") {
        metaParts.push(`<span class="meta-item"><i class="fa-regular fa-eye"></i> ${listing.views} view${listing.views === 1 ? "" : "s"}</span>`);
    }
    metaEl.innerHTML = metaParts.join("");

    descriptionEl.textContent = listing.description ?? "";

    // Seller
    const sName = listing.sellerName ?? "Unknown";
    sellerAvatar.textContent = (sName[0] ?? "?").toUpperCase();
    sellerName.textContent = sName;
    sellerSchool.textContent = listing.sellerSchool || "";
    sellerSchool.classList.toggle("hidden", !listing.sellerSchool);

    if (listing.sellerEmail) {
        sellerEmail.innerHTML = `<i class="fa-regular fa-envelope"></i> ${escapeHtml(listing.sellerEmail)}`;
        sellerEmail.href = `mailto:${listing.sellerEmail}`;
        sellerEmail.classList.remove("hidden");
    } else {
        sellerEmail.classList.add("hidden");
    }

    // Actions
    const isOwner = listing.sellerId === ME.uid;
    actionsEl.innerHTML = isOwner
        ? `
            <button class="action-btn primary" id="edit-btn"><i class="fa-regular fa-pen-to-square"></i>&nbsp; Edit</button>
            <button class="action-btn danger" id="delete-btn">Delete</button>
        `
        : `<button class="action-btn primary" id="msg-btn"><i class="fa-regular fa-comment"></i>&nbsp; Message Seller</button>`;

    document.getElementById("edit-btn")?.addEventListener("click", () => {
        window.location.href = `sell.html?edit=${listingId}`;
    });
    document.getElementById("delete-btn")?.addEventListener("click", handleDelete);
    document.getElementById("msg-btn")?.addEventListener("click", handleMessageSeller);
}

function setMainImage(src) {
    mainImageWrap.innerHTML = `<img src="${escapeAttr(src)}" alt=""
        onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',innerHTML:'<i class=\\'fa-regular fa-image\\'></i>'}))">`;
}

// ── Actions ──────────────────────────────────────────────
async function handleDelete() {
    if (!confirm(`Delete "${listing.title}"? This cannot be undone.`)) return;
    const btn = document.getElementById("delete-btn");
    btn.disabled = true;
    btn.textContent = "Deleting...";
    try {
        await deleteDoc(doc(database, "listings", listingId));
        window.location.href = "home.html";
    } catch (err) {
        console.error("Delete failed:", err);
        alert("Couldn't delete the listing. " + (err.message ?? ""));
        btn.disabled = false;
        btn.textContent = "Delete Listing";
    }
}

async function handleMessageSeller() {
    const btn = document.getElementById("msg-btn");
    btn.disabled = true;
    btn.textContent = "Opening chat...";
    try {
        const otherUid = listing.sellerId;
        const otherName = listing.sellerName ?? "Seller";

        // Look for existing conversation with both participants
        const snapshot = await getDocs(collection(database, "conversations"));
        const existing = snapshot.docs.find(d => {
            const p = d.data().participants ?? [];
            return p.includes(ME.uid) && p.includes(otherUid);
        });

        let convId;
        if (existing) {
            convId = existing.id;
        } else {
            const ref = await addDoc(collection(database, "conversations"), {
                participants: [ME.uid, otherUid],
                names: { [ME.uid]: ME.name, [otherUid]: otherName },
                lastMessage: ""
            });
            convId = ref.id;
        }

        window.location.href = `chat.html?conv=${convId}`;
    } catch (err) {
        console.error("Open chat failed:", err);
        alert("Couldn't open chat. " + (err.message ?? ""));
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-regular fa-comment"></i>&nbsp; Message Seller`;
    }
}

// ── Helpers ──────────────────────────────────────────────
function showStatus(emoji, msg) {
    statusScreen.classList.remove("hidden");
    detailMain.classList.add("hidden");
    statusScreen.innerHTML = `
        <div class="emoji">${emoji}</div>
        <div class="msg">${escapeHtml(msg)}</div>
    `;
}

function formatPrice(item) {
    if (item.category === "exchange") return `<span>Exchange</span>`;
    const price = typeof item.price === "number" ? `$${item.price.toFixed(2)}` : "—";
    if (item.category === "rent") {
        const unit = item.rentDuration ?? "week";
        return `${price}<span class="unit"> / ${unit}</span>`;
    }
    return price;
}

function timeAgo(ts) {
    if (!ts?.toDate) return "";
    const date = ts.toDate();
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

function escapeAttr(s) {
    return escapeHtml(s);
}
