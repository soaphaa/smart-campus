import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    collection, addDoc, onSnapshot, query, orderBy,
    serverTimestamp, doc, setDoc, getDocs, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ───────────────────────────────────────────────────
const convList    = document.getElementById("conv-list");
const emptyState  = document.getElementById("empty-state");
const chatView    = document.getElementById("chat-view");
const chatName    = document.getElementById("chat-name");
const messagesEl  = document.getElementById("messages");
const msgForm     = document.getElementById("msg-form");
const msgInput    = document.getElementById("msg-input");
const backBtn     = document.getElementById("back-btn");
const sidebar     = document.getElementById("sidebar");
const newChatBtn  = document.getElementById("new-chat-btn");
const modal       = document.getElementById("new-chat-modal");
const modalClose  = document.getElementById("modal-close");
const userList    = document.getElementById("user-list");
const logoutBtn   = document.getElementById("logout-btn");

let ME           = null;
let activeConvId = null;
let stopListening = null;

// ── Logout ────────────────────────────────────────────────
logoutBtn.addEventListener("click", async () => {
    await signOut(authentication);
    window.location.href = "index.html";
});

// ── Auth ──────────────────────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (!user) { window.location.href = "login.html#login"; return; }

    const ud = await getDoc(doc(database, "users", user.uid));
    ME = { uid: user.uid, name: ud.data()?.name ?? user.email, email: user.email };
    console.log(`Chat: logged in as ${ME.name}`);

    loadConversations();
    autoOpenFromUrl();
});

// ── Auto-open from URL (?conv=, ?listing=) ────────────────
async function autoOpenFromUrl() {
    const p          = new URLSearchParams(window.location.search);
    const convId     = p.get("conv");
    const listingId  = p.get("listing");
    const prefill    = p.get("prefill");

    if (!convId) return;

    try {
        const convDoc = await getDoc(doc(database, "conversations", convId));
        if (!convDoc.exists()) return;
        const data      = convDoc.data();
        const otherId   = data.participants?.find(id => id !== ME.uid);
        const otherName = data.names?.[otherId] ?? "Unknown";

        await openConv(convId, otherName);

        // Send prefilled opening message automatically
        if (prefill) {
            await sendMessage(prefill);
        }

        history.replaceState(null, "", "chat.html");
    } catch (err) {
        console.warn("Auto-open failed:", err);
    }
}

// ── Load conversation list ────────────────────────────────
function loadConversations() {
    onSnapshot(collection(database, "conversations"), snapshot => {
        const mine = snapshot.docs.filter(d => d.data().participants?.includes(ME.uid));
        console.log(`Conversations: ${mine.length}`);

        convList.innerHTML = "";
        if (mine.length === 0) {
            convList.innerHTML = `<li style="padding:1rem 1.4rem;color:var(--text-prompt);font-size:0.85rem;">No conversations yet.</li>`;
            return;
        }

        mine.forEach(d => {
            const data      = d.data();
            const otherId   = data.participants.find(id => id !== ME.uid);
            const otherName = data.names?.[otherId] ?? "Unknown";
            const lastMsg   = data.lastMessage ?? "";

            const li = document.createElement("li");
            li.className = "conv-item" + (d.id === activeConvId ? " active" : "");
            li.innerHTML = `
                <div class="conv-name">${otherName}</div>
                <div class="conv-preview">${lastMsg || "No messages yet"}</div>
            `;
            li.onclick = () => openConv(d.id, otherName);
            convList.appendChild(li);
        });
    });
}

// ── Open a conversation ───────────────────────────────────
async function openConv(convId, name) {
    if (stopListening) stopListening();

    activeConvId = convId;
    chatName.textContent = name;
    emptyState.classList.add("hidden");
    chatView.classList.remove("hidden");
    sidebar.classList.add("hidden");

    console.log(`Opened conv: ${name} | ${convId}`);

    // Remove any existing banner from previous conv
    document.getElementById("approve-banner")?.remove();
    document.getElementById("listing-banner")?.remove();

    // Load conversation data to check for attached listing
    const convSnap  = await getDoc(doc(database, "conversations", convId));
    const listingRef = convSnap.data()?.listingRef;

    if (listingRef?.id) {
        const lSnap  = await getDoc(doc(database, "listings", listingRef.id));
        const listing = lSnap.data();
        if (listing) showListingBanner(listing, listingRef.id);
    }

    // Listen to messages
    const q = query(
        collection(database, "conversations", convId, "messages"),
        orderBy("sentAt")
    );

    stopListening = onSnapshot(q, snapshot => {
        messagesEl.innerHTML = "";
        snapshot.docs.forEach(d => {
            const msg    = d.data();
            const isMine = msg.senderId === ME.uid;
            const div    = document.createElement("div");
            div.className   = "bubble " + (isMine ? "sent" : "received");
            div.textContent = msg.text;
            messagesEl.appendChild(div);
            if (!isMine) console.log(`Received from ${name}: "${msg.text}"`);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    msgInput.focus();
}

// ── Listing banner inside chat ────────────────────────────
// This is where all buying decisions happen.
// Seller sees: Approve / Decline
// Buyer sees: "Message sent" or Pay Now (after approval)
function showListingBanner(listing, lId) {
    const isSeller   = listing.sellerId === ME.uid;
    const isBuyer    = listing.buyerId  === ME.uid;
    const status     = listing.status;

    const banner = document.createElement("div");
    banner.id    = "approve-banner";

    // Left side: item info
    const imgHtml = listing.image
        ? `<img src="${listing.image}" style="width:42px;height:42px;object-fit:cover;border-radius:0.5rem;">`
        : `<div style="width:42px;height:42px;background:var(--background-color);border-radius:0.5rem;display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--text-prompt)"><i class="fa-regular fa-image"></i></div>`;

    const priceText = listing.price != null ? `$${listing.price.toFixed(2)}` : "Exchange";

    let actionHtml = "";

    if (isSeller) {
        if (status === "requested") {
            actionHtml = `
                <button id="approve-btn">✓ Allow Purchase</button>
                <button id="decline-btn">✕ Decline</button>
            `;
        } else if (["approved","escrow","pending"].includes(status)) {
            actionHtml = `<span style="font-size:0.8rem;color:#0d9488;font-weight:600;">✓ Purchase approved</span>`;
        } else if (["sold","rented"].includes(status)) {
            actionHtml = `<span style="font-size:0.8rem;color:var(--text-prompt);">✓ Sold</span>`;
        } else {
            // No request yet — seller just sees the item
            actionHtml = `<span style="font-size:0.8rem;color:var(--text-prompt);">Awaiting buyer request</span>`;
        }
    } else {
        // Buyer side
        if (status === "approved" && isBuyer) {
            actionHtml = `<button id="pay-now-btn">💳 Pay Now</button>`;
        } else if (status === "requested" && isBuyer) {
            actionHtml = `<span style="font-size:0.8rem;color:var(--text-prompt);">⏳ Waiting for seller to approve</span>`;
        } else if (status === "escrow" && isBuyer) {
            actionHtml = `<a href="confirmation.html?id=${lId}&method=${listing.payMethod ?? 'wallet'}" style="font-size:0.82rem;font-weight:700;color:var(--primary-color);text-decoration:none;">📱 View QR Code</a>`;
        } else if (["sold","rented"].includes(status) && isBuyer) {
            actionHtml = `<a href="confirmation.html?id=${lId}&method=${listing.payMethod ?? 'wallet'}" style="font-size:0.82rem;font-weight:700;color:var(--primary-color);text-decoration:none;">✓ View Order</a>`;
        } else if (!["sold","rented","escrow"].includes(status)) {
            // Item available — buyer can request
            actionHtml = `<button id="request-btn">🛒 Request to Buy</button>`;
        } else {
            actionHtml = `<span style="font-size:0.8rem;color:#dc2626;">🔒 No longer available</span>`;
        }
    }

    banner.innerHTML = `
        <div id="approve-banner-info" style="display:flex;align-items:center;gap:0.75rem;flex:1;min-width:0;">
            ${imgHtml}
            <div style="min-width:0;">
                <div style="font-weight:700;font-size:0.88rem;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${listing.title ?? "Listing"}</div>
                <div style="font-size:0.78rem;color:var(--primary-color);font-weight:600;">${priceText}</div>
            </div>
        </div>
        <div id="approve-banner-actions">${actionHtml}</div>
    `;

    chatView.insertBefore(banner, messagesEl);

    // Wire up buttons
    banner.querySelector("#request-btn")?.addEventListener("click", async () => {
        await updateDoc(doc(database, "listings", lId), {
            status:      "requested",
            buyerId:     ME.uid,
            buyerName:   ME.name,
            requestedAt: serverTimestamp(),
        });
        await sendMessage(`Hi! I'd like to buy "${listing.title}" for ${priceText}. Is it available?`);
        // Refresh the banner
        document.getElementById("approve-banner")?.remove();
        const fresh = await getDoc(doc(database, "listings", lId));
        showListingBanner(fresh.data(), lId);
    });

    banner.querySelector("#approve-btn")?.addEventListener("click", async () => {
        await updateDoc(doc(database, "listings", lId), { status: "approved" });
        console.log("Approved purchase for listing:", lId);
        document.getElementById("approve-banner")?.remove();
        const fresh = await getDoc(doc(database, "listings", lId));
        showListingBanner(fresh.data(), lId);
    });

    banner.querySelector("#decline-btn")?.addEventListener("click", async () => {
        await updateDoc(doc(database, "listings", lId), {
            status: null, buyerId: null, buyerName: null
        });
        document.getElementById("approve-banner")?.remove();
        const fresh = await getDoc(doc(database, "listings", lId));
        showListingBanner(fresh.data(), lId);
    });

    banner.querySelector("#pay-now-btn")?.addEventListener("click", () => {
        window.location.href = `payment.html?id=${lId}`;
    });
}

// ── Send a message ────────────────────────────────────────
async function sendMessage(text) {
    if (!text?.trim() || !activeConvId) return;

    await addDoc(collection(database, "conversations", activeConvId, "messages"), {
        text: text.trim(),
        senderId: ME.uid,
        sentAt:   serverTimestamp(),
    });

    await setDoc(doc(database, "conversations", activeConvId),
        { lastMessage: text.trim() }, { merge: true }
    );

    console.log(`Sent: "${text}"`);
}

msgForm.addEventListener("submit", async e => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text) return;
    msgInput.value = "";
    await sendMessage(text);
});

// ── Back button ───────────────────────────────────────────
backBtn.addEventListener("click", () => {
    if (stopListening) stopListening();
    activeConvId = null;
    sidebar.classList.remove("hidden");
    chatView.classList.add("hidden");
    emptyState.classList.remove("hidden");
});

// ── New chat modal ────────────────────────────────────────
newChatBtn.addEventListener("click", async () => {
    modal.classList.remove("hidden");
    userList.innerHTML = `<li style="padding:1rem;color:var(--text-prompt);font-size:0.85rem;">Loading...</li>`;

    const snapshot = await getDocs(collection(database, "users"));
    const others   = snapshot.docs.filter(d => d.id !== ME.uid);

    console.log(`Users (${others.length}):`);
    others.forEach(d => {
        const data = d.data();
        console.log(`  - ${data.name} | ${data.email} | School: ${data.school ?? "N/A"}`);
    });

    userList.innerHTML = "";
    if (others.length === 0) {
        userList.innerHTML = `<li style="padding:1rem;color:var(--text-prompt);font-size:0.85rem;">No other users found.</li>`;
        return;
    }

    others.forEach(d => {
        const data = d.data();
        const li   = document.createElement("li");
        li.className = "user-item";
        const initials = data.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
        li.innerHTML = `
            <div class="user-avatar">${initials}</div>
            <div>
                <div class="user-name">${data.name}</div>
                <div class="user-school">${data.school ?? data.email}</div>
            </div>
        `;
        li.onclick = () => startConv(d.id, data.name);
        userList.appendChild(li);
    });
});

modalClose.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });

async function startConv(otherUid, otherName) {
    modal.classList.add("hidden");

    const snapshot = await getDocs(collection(database, "conversations"));
    const existing  = snapshot.docs.find(d => {
        const p = d.data().participants ?? [];
        return p.includes(ME.uid) && p.includes(otherUid);
    });

    if (existing) { openConv(existing.id, otherName); return; }

    const ref = await addDoc(collection(database, "conversations"), {
        participants: [ME.uid, otherUid],
        names:        { [ME.uid]: ME.name, [otherUid]: otherName },
        lastMessage:  "",
    });

    console.log(`New conv with ${otherName}`);
    openConv(ref.id, otherName);
}