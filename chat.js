import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    collection, addDoc, onSnapshot, query, orderBy,
    serverTimestamp, doc, setDoc, getDocs, getDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ────────────────────────────────────────────────────
const convList       = document.getElementById("conv-list");
const emptyState     = document.getElementById("empty-state");
const chatView       = document.getElementById("chat-view");
const chatName       = document.getElementById("chat-name");
const chatAvatar     = document.getElementById("chat-avatar");
const messagesEl     = document.getElementById("messages");
const msgForm        = document.getElementById("msg-form");
const msgInput       = document.getElementById("msg-input");
const backBtn        = document.getElementById("back-btn");
const sidebar        = document.getElementById("sidebar");
const newChatBtn     = document.getElementById("new-chat-btn");
const modal          = document.getElementById("new-chat-modal");
const modalClose     = document.getElementById("modal-close");
const modalSearch    = document.getElementById("modal-search");
const userList       = document.getElementById("user-list");
const logoutBtn      = document.getElementById("logout-btn");
const listingBanner  = document.getElementById("listing-banner");
const bannerTitle    = document.getElementById("banner-title");
const bannerPrice    = document.getElementById("banner-price");
const bannerImg      = document.getElementById("banner-img");
const buyNowBtn      = document.getElementById("buy-now-btn");
const viewListingBtn = document.getElementById("view-listing-btn");

let ME           = null;
let activeConvId = null;
let activeListing = null;  // listing context attached to current conv
let stopListening = null;
let allUsers      = [];    // cached for modal search

// ── Logout ─────────────────────────────────────────────────
logoutBtn.addEventListener("click", async () => {
    await signOut(authentication);
    window.location.href = "index.html";
});

// ── Auth ───────────────────────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (!user) {
        window.location.href = "login.html#login";
        return;
    }
    const userDoc = await getDoc(doc(database, "users", user.uid));
    ME = { uid: user.uid, name: userDoc.data()?.name ?? user.email, email: user.email };
    console.log(`Logged in as: ${ME.name} | UID: ${ME.uid}`);

    loadConversations();
    autoOpenFromUrl();
});

// ── Auto-open from URL params (?conv=, ?prefill=, ?listing=) ──
async function autoOpenFromUrl() {
    const p = new URLSearchParams(window.location.search);
    const convId    = p.get("conv");
    const prefill   = p.get("prefill");
    const listingId = p.get("listing");

    if (!convId) return;

    // Load listing context if provided
    if (listingId) {
        try {
            const snap = await getDoc(doc(database, "listings", listingId));
            if (snap.exists()) activeListing = { id: snap.id, ...snap.data() };
        } catch (e) { console.warn("Listing load failed:", e); }
    }

    try {
        const convDoc = await getDoc(doc(database, "conversations", convId));
        if (!convDoc.exists()) return;
        const data     = convDoc.data();
        const otherId  = data.participants?.find(id => id !== ME.uid);
        const otherName = data.names?.[otherId] ?? "Unknown";
        openConv(convId, otherName, otherId);

        // Send the prefill message automatically if provided
        if (prefill) {
            await sendMessage(prefill);
        }

        history.replaceState(null, "", "chat.html");
    } catch (err) {
        console.warn("Auto-open failed:", err);
    }
}

// ── Load conversation list ─────────────────────────────────
function loadConversations() {
    onSnapshot(collection(database, "conversations"), snapshot => {
        const mine = snapshot.docs.filter(d =>
            d.data().participants?.includes(ME.uid)
        );

        convList.innerHTML = "";

        if (mine.length === 0) {
            convList.innerHTML = `<li style="padding:1rem 1.2rem; color:var(--text-prompt); font-size:0.85rem; text-align:center;">No conversations yet.<br>Hit + to start one.</li>`;
            return;
        }

        mine.forEach(d => {
            const data      = d.data();
            const otherId   = data.participants.find(id => id !== ME.uid);
            const otherName = data.names?.[otherId] ?? "Unknown";
            const lastMsg   = data.lastMessage ?? "";
            const initials  = otherName.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();

            const li = document.createElement("li");
            li.className = "conv-item" + (d.id === activeConvId ? " active" : "");
            li.innerHTML = `
                <div class="conv-avatar">${initials}</div>
                <div class="conv-body">
                    <div class="conv-name">${otherName}</div>
                    <div class="conv-preview">${lastMsg || "No messages yet"}</div>
                </div>
            `;
            li.onclick = () => openConv(d.id, otherName, otherId);
            convList.appendChild(li);
        });
    });
}

// ── Open a conversation ────────────────────────────────────
function openConv(convId, name, otherId) {
    if (stopListening) stopListening();

    activeConvId = convId;
    chatName.textContent   = name;
    chatAvatar.textContent = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();

    emptyState.classList.add("hidden");
    chatView.classList.remove("hidden");
    sidebar.classList.add("hidden"); // mobile: slide away

    // Show listing banner if context is attached
    if (activeListing) {
        bannerTitle.textContent = activeListing.title ?? "Listing";
        bannerPrice.textContent = activeListing.price != null ? `$${activeListing.price.toFixed(2)}` : "Exchange";
        if (activeListing.images?.[0]) {
            bannerImg.innerHTML = `<img src="${activeListing.images[0]}" alt="">`;
        }
        listingBanner.classList.remove("hidden");
        viewListingBtn.style.display = "flex";
        viewListingBtn.onclick = () => window.location.href = `listing.html?id=${activeListing.id}`;
        buyNowBtn.onclick = () => window.location.href = `payment.html?id=${activeListing.id}`;
    } else {
        listingBanner.classList.add("hidden");
        viewListingBtn.style.display = "none";
    }

    console.log(`Opened conv with: ${name} | ID: ${convId}`);

    // Listen to messages in real time
    const q = query(
        collection(database, "conversations", convId, "messages"),
        orderBy("sentAt")
    );

    stopListening = onSnapshot(q, snapshot => {
        renderMessages(snapshot.docs);
    });

    msgInput.focus();
    renderConvList();
}

// ── Render messages ────────────────────────────────────────
function renderMessages(docs) {
    messagesEl.innerHTML = "";
    let prevSenderId = null;
    let prevDateStr  = null;

    docs.forEach(d => {
        const msg    = d.data();
        const isMine = msg.senderId === ME.uid;
        const ts     = msg.sentAt?.toDate?.() ?? new Date();
        const dateStr = ts.toDateString();

        // Date separator
        if (dateStr !== prevDateStr) {
            const sep = document.createElement("div");
            sep.className   = "date-sep";
            sep.textContent = formatDateSep(ts);
            messagesEl.appendChild(sep);
            prevDateStr  = dateStr;
            prevSenderId = null;
        }

        // System message (e.g. buy offer)
        if (msg.type === "system") {
            const div = document.createElement("div");
            div.className   = "bubble system";
            div.textContent = msg.text;
            messagesEl.appendChild(div);
            prevSenderId = null;
            return;
        }

        const isFollow = prevSenderId === msg.senderId;
        const initials = isMine ? "" : ME.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

        const row = document.createElement("div");
        row.className = `msg-row ${isMine ? "sent" : "received"}${isFollow ? " follow" : ""}`;
        row.innerHTML = `
            ${!isMine ? `<div class="msg-avatar">${initials}</div>` : ""}
            <div class="bubble-wrap">
                <div class="bubble">${escapeHtml(msg.text)}</div>
                ${!isFollow ? `<span class="bubble-time">${formatTime(ts)}</span>` : ""}
            </div>
        `;

        messagesEl.appendChild(row);
        prevSenderId = msg.senderId;
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderConvList() {
    // just re-highlight active
    document.querySelectorAll(".conv-item").forEach(li => {
        li.classList.toggle("active", li.dataset.id === activeConvId);
    });
}

// ── Send a message ─────────────────────────────────────────
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

// Enter to send
msgInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        msgForm.dispatchEvent(new Event("submit"));
    }
});

// ── Back button (mobile) ───────────────────────────────────
backBtn.addEventListener("click", () => {
    if (stopListening) stopListening();
    activeConvId  = null;
    activeListing = null;
    sidebar.classList.remove("hidden");
    chatView.classList.add("hidden");
    emptyState.classList.remove("hidden");
});

// ── New chat modal ─────────────────────────────────────────
newChatBtn.addEventListener("click", async () => {
    modal.classList.remove("hidden");
    modalSearch.value = "";
    userList.innerHTML = `<li style="padding:1rem; text-align:center; color:var(--text-prompt); font-size:0.85rem;">Loading...</li>`;

    const snapshot = await getDocs(collection(database, "users"));
    allUsers = snapshot.docs
        .filter(d => d.id !== ME.uid)
        .map(d => ({ id: d.id, ...d.data() }));

    console.log(`Users with accounts (${allUsers.length} total):`);
    allUsers.forEach(u => console.log(`  - ${u.name} | ${u.email} | School: ${u.school ?? "N/A"}`));

    renderUserList(allUsers);
    modalSearch.focus();
});

modalSearch.addEventListener("input", () => {
    const q = modalSearch.value.toLowerCase();
    renderUserList(allUsers.filter(u =>
        u.name.toLowerCase().includes(q) || (u.school ?? "").toLowerCase().includes(q)
    ));
});

function renderUserList(users) {
    userList.innerHTML = "";
    if (users.length === 0) {
        userList.innerHTML = `<li style="padding:1rem; text-align:center; color:var(--text-prompt); font-size:0.85rem;">No users found.</li>`;
        return;
    }
    users.forEach(u => {
        const li = document.createElement("li");
        li.className = "user-item";
        li.innerHTML = `
            <div class="user-avatar">${u.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
            <div>
                <div class="user-name">${u.name}</div>
                <div class="user-school">${u.school ?? u.email}</div>
            </div>
        `;
        li.onclick = () => startConv(u.id, u.name);
        userList.appendChild(li);
    });
}

modalClose.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });

// ── Start or open a conversation ───────────────────────────
async function startConv(otherUid, otherName) {
    modal.classList.add("hidden");

    const snapshot = await getDocs(collection(database, "conversations"));
    const existing = snapshot.docs.find(d => {
        const p = d.data().participants ?? [];
        return p.includes(ME.uid) && p.includes(otherUid);
    });

    if (existing) {
        openConv(existing.id, otherName, otherUid);
        return;
    }

    const ref = await addDoc(collection(database, "conversations"), {
        participants: [ME.uid, otherUid],
        names: { [ME.uid]: ME.name, [otherUid]: otherName },
        lastMessage: "",
    });

    console.log(`New conversation created with ${otherName}`);
    openConv(ref.id, otherName, otherUid);
}

// ── Helpers ────────────────────────────────────────────────
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])
    );
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateSep(date) {
    const now  = new Date();
    const diff = Math.floor((now - date) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}