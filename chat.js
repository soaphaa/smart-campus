// ─── Firebase setup (same config as login.js) ─────────────────────────────────
import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, setDoc, getDoc }
                           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithCredential, GoogleAuthProvider }
                           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey:     "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId:  "YOUR_PROJECT_ID",
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── Read the logged-in user from localStorage (set by login.js) ──────────────
// Using a fallback so the page loads even before Firebase is set up
const stored = localStorage.getItem("user");
const ME = stored ? JSON.parse(stored) : { id: "guest", name: "Guest" };

if (stored) {
    const credential = GoogleAuthProvider.credential(ME.token);
    signInWithCredential(auth, credential);
}

// ─── DOM ──────────────────────────────────────────────────────────────────────
const convList   = document.getElementById("conv-list");
const emptyState = document.getElementById("empty-state");
const chatView   = document.getElementById("chat-view");
const chatName   = document.getElementById("chat-name");
const messagesEl = document.getElementById("messages");
const msgForm    = document.getElementById("msg-form");
const msgInput   = document.getElementById("msg-input");
const backBtn    = document.getElementById("back-btn");
const sidebar    = document.getElementById("sidebar");

let activeConvId  = null;
let stopListening = null;  // cancels the message listener when you switch conversations

// ─── Load conversations ───────────────────────────────────────────────────────
// Watches the "conversations" collection for any that include the current user.
// Fires immediately, then again whenever anything changes.

onSnapshot(collection(db, "conversations"), snapshot => {
    const mine = snapshot.docs.filter(d => d.data().participants.includes(ME.id));

    convList.innerHTML = "";
    mine.forEach(d => {
        const data      = d.data();
        const otherId   = data.participants.find(id => id !== ME.id);
        const otherName = data.names?.[otherId] ?? "Unknown";
        const lastMsg   = data.lastMessage ?? "No messages yet";

        const li = document.createElement("li");
        li.className = "conv-item" + (d.id === activeConvId ? " active" : "");
        li.innerHTML = `<div class="conv-name">${otherName}</div>
                        <div class="conv-preview">${lastMsg}</div>`;
        li.onclick = () => openConv(d.id, otherName);
        convList.appendChild(li);
    });
});

// ─── Open a conversation ──────────────────────────────────────────────────────
function openConv(convId, name) {
    if (stopListening) stopListening();  // stop watching the old conversation

    activeConvId = convId;
    chatName.textContent = name;

    emptyState.classList.add("hidden");
    chatView.classList.remove("hidden");
    sidebar.classList.add("hidden");

    // Start watching the new conversation's messages
    const q = query(collection(db, "conversations", convId, "messages"), orderBy("sentAt"));

    stopListening = onSnapshot(q, snapshot => {
        messagesEl.innerHTML = "";
        snapshot.docs.forEach(d => {
            const msg = d.data();
            const div = document.createElement("div");
            div.className   = "bubble " + (msg.senderId === ME.id ? "sent" : "received");
            div.textContent = msg.text;
            messagesEl.appendChild(div);
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    msgInput.focus();
}

// ─── Send a message ───────────────────────────────────────────────────────────
// Writes to Firestore → triggers onSnapshot on every browser watching this conv

msgForm.addEventListener("submit", async e => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text || !activeConvId) return;
    msgInput.value = "";

    // Add the message to the subcollection
    await addDoc(collection(db, "conversations", activeConvId, "messages"), {
        text,
        senderId: ME.id,
        sentAt:   serverTimestamp(),
    });

    // Update the preview shown in the sidebar
    await setDoc(doc(db, "conversations", activeConvId), {
        lastMessage: text
    }, { merge: true });
});

// ─── Back button (mobile) ─────────────────────────────────────────────────────
backBtn.addEventListener("click", () => {
    if (stopListening) stopListening();
    activeConvId = null;
    sidebar.classList.remove("hidden");
    chatView.classList.add("hidden");
    emptyState.classList.remove("hidden");
});