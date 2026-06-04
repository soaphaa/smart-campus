import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    collection, addDoc, onSnapshot,
    query, orderBy, serverTimestamp,
    doc, setDoc, getDocs, getDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ───────────────────────────────────────
const convList   = document.getElementById("conv-list");
const emptyState = document.getElementById("empty-state");
const chatView   = document.getElementById("chat-view");
const chatName   = document.getElementById("chat-name");
const messagesEl = document.getElementById("messages");
const msgForm    = document.getElementById("msg-form");
const msgInput   = document.getElementById("msg-input");
const backBtn    = document.getElementById("back-btn");
const sidebar    = document.getElementById("sidebar");
const newChatBtn = document.getElementById("new-chat-btn");
const modal      = document.getElementById("new-chat-modal");
const modalClose = document.getElementById("modal-close");
const userList   = document.getElementById("user-list");

let ME           = null;
let activeConvId = null;
let stopListening = null;

// ── Auth ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (!user) {
        console.log("No user logged in — redirecting to login.");
        window.location.href = "login.html#login";
        return;
    }

    const userDoc = await getDoc(doc(database, "users", user.uid));
    ME = { uid: user.uid, name: userDoc.data()?.name ?? user.email, email: user.email };

    console.log(`Logged in as: ${ME.name} (${ME.email}) | UID: ${ME.uid}`);

    loadConversations();
    autoOpenFromUrl();
});

// ── Auto-open conversation from ?conv=<id> ───────────────────────────────────
async function autoOpenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get("conv");
    if (!convId) return;

    try {
        const convDoc = await getDoc(doc(database, "conversations", convId));
        if (!convDoc.exists()) return;

        const data = convDoc.data();
        const otherId = data.participants?.find(id => id !== ME.uid);
        const otherName = data.names?.[otherId] ?? "Unknown";

        openConv(convId, otherName);
        history.replaceState(null, "", "chat.html");
    } catch (err) {
        console.warn("Auto-open conversation failed:", err);
    }
}

// ── Load conversations ────────────────────────────────────────────────────────
function loadConversations() {
    onSnapshot(collection(database, "conversations"), snapshot => {
        const mine = snapshot.docs.filter(d =>
            d.data().participants?.includes(ME.uid)
        );

        console.log(`Conversations found: ${mine.length}`);

        convList.innerHTML = "";

        if (mine.length === 0) {
            convList.innerHTML = `<li style="padding:1rem 1.4rem; color:var(--text-prompt); font-size:0.85rem;">No conversations yet. Start one below ↓</li>`;
            return;
        }

        mine.forEach(d => {
            const data      = d.data();
            const otherId   = data.participants.find(id => id !== ME.uid);
            const otherName = data.names?.[otherId] ?? "Unknown";
            const lastMsg   = data.lastMessage ?? "No messages yet";

            console.log(`  Conversation with: ${otherName} | Last message: "${lastMsg}"`);

            const li = document.createElement("li");
            li.className = "conv-item" + (d.id === activeConvId ? " active" : "");
            li.innerHTML = `
                <div class="conv-name">${otherName}</div>
                <div class="conv-preview">${lastMsg}</div>
            `;
            li.onclick = () => openConv(d.id, otherName);
            convList.appendChild(li);
        });
    });
}

// ── Open a conversation ───────────────────────────────────────────────────────
function openConv(convId, name) {
    if (stopListening) stopListening();

    activeConvId = convId;
    chatName.textContent = name;
    emptyState.classList.add("hidden");
    chatView.classList.remove("hidden");
    sidebar.classList.add("hidden");

    console.log(`Opened conversation with: ${name} | Conv ID: ${convId}`);

    const q = query(
        collection(database, "conversations", convId, "messages"),
        orderBy("sentAt")
    );

    stopListening = onSnapshot(q, snapshot => {
        messagesEl.innerHTML = "";
        snapshot.docs.forEach(d => {
            const msg = d.data();
            const div = document.createElement("div");
            const isMine = msg.senderId === ME.uid;
            div.className   = "bubble " + (isMine ? "sent" : "received");
            div.textContent = msg.text;
            messagesEl.appendChild(div);

            if (!isMine) {
                console.log(`New message received from ${name}: "${msg.text}"`);
            }
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    msgInput.focus();
}

// ── Send a message ────────────────────────────────────────────────────────────
msgForm.addEventListener("submit", async e => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text || !activeConvId) return;
    msgInput.value = "";

    await addDoc(collection(database, "conversations", activeConvId, "messages"), {
        text,
        senderId: ME.uid,
        sentAt:   serverTimestamp(),
    });

    await setDoc(doc(database, "conversations", activeConvId),
        { lastMessage: text }, { merge: true }
    );

    console.log(`Message sent to conv ${activeConvId}: "${text}"`);
});

// ── Back button ───────────────────────────────────────────────────────────────
backBtn.addEventListener("click", () => {
    if (stopListening) stopListening();
    activeConvId = null;
    sidebar.classList.remove("hidden");
    chatView.classList.add("hidden");
    emptyState.classList.remove("hidden");
    console.log("Left conversation.");
});

// ── New chat modal ────────────────────────────────────────────────────────────
newChatBtn.addEventListener("click", async () => {
    modal.classList.remove("hidden");
    userList.innerHTML = `<li style="padding:0.8rem 1.2rem; color:var(--text-prompt); font-size:0.85rem;">Loading...</li>`;

    const snapshot = await getDocs(collection(database, "users"));
    const others = snapshot.docs.filter(d => d.id !== ME.uid);

    console.log(`Users with accounts (${others.length} total):`);
    others.forEach(d => {
        const data = d.data();
        console.log(`  - ${data.name} | ${data.email} | School: ${data.school ?? "N/A"} | UID: ${d.id}`);
    });

    userList.innerHTML = "";

    if (others.length === 0) {
        userList.innerHTML = `<li style="padding:0.8rem 1.2rem; color:var(--text-prompt); font-size:0.85rem;">No other users found.</li>`;
        return;
    }

    others.forEach(d => {
        const data = d.data();
        const li   = document.createElement("li");
        li.className = "user-item";
        li.innerHTML = `
            <div class="user-avatar">${data.name[0].toUpperCase()}</div>
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

// ── Start or open a conversation ──────────────────────────────────────────────
async function startConv(otherUid, otherName) {
    modal.classList.add("hidden");

    const snapshot = await getDocs(collection(database, "conversations"));
    const existing = snapshot.docs.find(d => {
        const p = d.data().participants ?? [];
        return p.includes(ME.uid) && p.includes(otherUid);
    });

    if (existing) {
        console.log(`Existing conversation found with ${otherName}, opening it.`);
        openConv(existing.id, otherName);
        return;
    }

    const convRef = await addDoc(collection(database, "conversations"), {
        participants: [ME.uid, otherUid],
        names: { [ME.uid]: ME.name, [otherUid]: otherName },
        lastMessage: "",
    });

    console.log(`New conversation created with ${otherName} | Conv ID: ${convRef.id}`);
    openConv(convRef.id, otherName);
}