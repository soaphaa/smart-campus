import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    doc, getDoc, runTransaction, addDoc,
    collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── Stripe public key (test mode — safe to expose in frontend) ─────────────────
// Replace with your actual test publishable key from dashboard.stripe.com
const STRIPE_PUBLIC_KEY = "pk_test_51Tey1aI8o9RjXfQwuPl1uW61xZq6ZQdAJM3UxXBkZAthVSWY9qRxcfq6qofTBiYo3uwRCChgqudW2S8kE4E7Yulx00TbPBqeH5";
let stripe = null; // initialized lazily inside renderPage() once Stripe.js is loaded

// ── DOM ────────────────────────────────────────────────────────────────────────
const statusScreen  = document.getElementById("status-screen");
const payMain       = document.getElementById("pay-main");
const backLink      = document.getElementById("back-link");
const listingImg    = document.getElementById("listing-img-wrap");
const listingTitle  = document.getElementById("listing-title-text");
const listingSeller = document.getElementById("listing-seller");
const listingBadge  = document.getElementById("listing-category-badge");
const itemPriceEl   = document.getElementById("item-price");
const totalPriceEl  = document.getElementById("total-price");
const rentRow       = document.getElementById("rent-row");
const rentLabel     = document.getElementById("rent-label");
const walletBalance = document.getElementById("wallet-balance");
const walletStatus  = document.getElementById("wallet-status");
const methodInputs  = document.querySelectorAll("input[name='method']");
const confirmBtn    = document.getElementById("confirm-btn");
const confirmLabel  = document.getElementById("confirm-label");
const payError      = document.getElementById("pay-error");
const etEmail       = document.getElementById("et-email");
const etAmount      = document.getElementById("et-amount");
const etMessage     = document.getElementById("et-message");

// Panels
const panels = {
    wallet:    document.getElementById("wallet-panel"),
    stripe:    document.getElementById("stripe-panel"),
    cash:      document.getElementById("cash-panel"),
    etransfer: document.getElementById("etransfer-panel"),
};

// ── State ──────────────────────────────────────────────────────────────────────
let ME        = null;   // { uid, name, email, walletBalance }
let listing   = null;   // full listing object
let listingId = null;
let cardElement = null; // Stripe card element

const CATEGORY_COLORS = {
    new: "#4f46e5", used: "#f59e0b", rent: "#5dc9a5", exchange: "#ec4899"
};

// ── Read listing ID from URL ───────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
listingId = params.get("id");

if (!listingId) {
    showStatus("⚠️", "No listing specified.");
}

// ── Auth ───────────────────────────────────────────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (!user) {
        window.location.href = "login.html#login";
        return;
    }

    const userDoc  = await getDoc(doc(database, "users", user.uid));
    const userData = userDoc.data() ?? {};
    ME = {
        uid:           user.uid,
        name:          userData.name ?? user.email,
        email:         user.email,
        walletBalance: userData.walletBalance ?? 0,
    };

    // DEMO: give $50 wallet to any user with 0 balance
    if (ME.walletBalance === 0) {
        const { setDoc: sd, doc: fd } = await import("https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js");
        await sd(fd(database, "users", user.uid), { walletBalance: 50 }, { merge: true });
        ME.walletBalance = 50;
        console.log("Demo: seeded $50 wallet for", ME.name);
    }
    console.log(`Checkout loaded for: ${ME.name} | Wallet: $${ME.walletBalance.toFixed(2)}`);

    if (listingId) await loadListing();
});

// ── Load listing ───────────────────────────────────────────────────────────────
async function loadListing() {
    try {
        const snap = await getDoc(doc(database, "listings", listingId));

        if (!snap.exists()) {
            showStatus("📭", "This listing no longer exists.");
            return;
        }

        listing = { id: snap.id, ...snap.data() };

        if (listing.sellerId === ME.uid) {
            showStatus("🚫", "You can't buy your own listing.");
            return;
        }

        if (listing.status === "sold" || listing.status === "rented") {
            showStatus("🔒", "This item has already been sold or rented.");
            return;
        }

        renderPage();
    } catch (err) {
        console.error("Load listing failed:", err);
        showStatus("⚠️", "Couldn't load this listing.");
    }
}

// ── Render the checkout page ───────────────────────────────────────────────────
function renderPage() {
    statusScreen.classList.add("hidden");
    payMain.classList.remove("hidden");

    backLink.href = `listing.html?id=${listingId}`;

    // Listing preview
    if (listing.images?.[0]) {
        listingImg.innerHTML = `<img src="${listing.images[0]}" alt="">`;
    }

    listingTitle.textContent  = listing.title ?? "Untitled";
    listingSeller.textContent = `by ${listing.sellerName ?? "Unknown"}`;

    const cat = listing.category ?? "";
    listingBadge.textContent         = cat.charAt(0).toUpperCase() + cat.slice(1);
    listingBadge.style.background    = CATEGORY_COLORS[cat] ?? "#94a3b8";

    // Price
    const price = listing.price ?? 0;
    const isExchange = cat === "exchange";

    itemPriceEl.textContent  = isExchange ? "Exchange" : `$${price.toFixed(2)}`;
    totalPriceEl.textContent = isExchange ? "Free" : `$${price.toFixed(2)}`;

    if (cat === "rent" && listing.rentDuration) {
        rentRow.style.display  = "flex";
        rentLabel.textContent  = listing.rentDuration;
    }

    // Wallet balance display
    walletBalance.textContent = `$${ME.walletBalance.toFixed(2)}`;

    updateWalletStatus(price);
    updateETransferDetails();

    // Initialize Stripe here — by now the CDN script has finished loading
    stripe = Stripe(STRIPE_PUBLIC_KEY);
    initStripeElement();

    confirmBtn.disabled = false;
}

// ── Show wallet warning based on balance vs price ─────────────────────────────
function updateWalletStatus(price) {
    const balance = ME.walletBalance;
    if (listing.category === "exchange") {
        walletStatus.className = "ok";
        walletStatus.textContent = "✓ No payment needed for exchanges.";
        return;
    }
    if (balance >= price) {
        walletStatus.className = "ok";
        walletStatus.textContent = `✓ Your balance covers this purchase. $${(balance - price).toFixed(2)} remaining after.`;
    } else if (balance > 0) {
        walletStatus.className = "low";
        walletStatus.textContent = `⚠ Balance too low by $${(price - balance).toFixed(2)}. Top up or choose another method.`;
    } else {
        walletStatus.className = "empty";
        walletStatus.textContent = "Your wallet is empty. Choose a different payment method.";
    }
}

// ── Fill in e-Transfer details ─────────────────────────────────────────────────
function updateETransferDetails() {
    etEmail.textContent   = listing.sellerEmail ?? "—";
    etAmount.textContent  = listing.price != null ? `$${listing.price.toFixed(2)}` : "—";
    etMessage.textContent = `Smart Campus — ${listing.title}`;
}

// ── Stripe card element ────────────────────────────────────────────────────────
function initStripeElement() {
    const elements = stripe.elements();
    cardElement = elements.create("card", {
        style: {
            base: {
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: "16px",
                color: "#1e293b",
                "::placeholder": { color: "#94a3b8" },
            },
            invalid: { color: "#dc2626" },
        },
        hidePostalCode: true,
    });

    cardElement.mount("#card-element");

    cardElement.on("focus",  () => document.getElementById("card-element").classList.add("focused"));
    cardElement.on("blur",   () => document.getElementById("card-element").classList.remove("focused"));
    cardElement.on("change", e => {
        document.getElementById("card-errors").textContent = e.error?.message ?? "";
    });
}

// ── Method switcher ────────────────────────────────────────────────────────────
methodInputs.forEach(input => {
    input.addEventListener("change", () => {
        Object.keys(panels).forEach(key => {
            panels[key].classList.toggle("hidden", key !== input.value);
        });
        setError("");
    });
});

function selectedMethod() {
    return [...methodInputs].find(i => i.checked)?.value ?? "wallet";
}

// ── Confirm button ─────────────────────────────────────────────────────────────
confirmBtn.addEventListener("click", async () => {
    setError("");
    confirmBtn.disabled = true;
    confirmLabel.textContent = "Processing...";

    try {
        const method = selectedMethod();
        console.log(`Payment method: ${method} | Listing: ${listing.title} | Amount: $${listing.price}`);

        if (method === "wallet")    await payWithWallet();
        if (method === "stripe")    await payWithStripe();
        if (method === "cash")      await confirmCashOrETransfer("cash");
        if (method === "etransfer") await confirmCashOrETransfer("etransfer");

    } catch (err) {
        console.error("Payment failed:", err);
        setError(err.message ?? "Something went wrong. Please try again.");
        confirmBtn.disabled = false;
        confirmLabel.textContent = "Confirm Payment";
    }
});

// ── Wallet payment ─────────────────────────────────────────────────────────────
// Uses a Firestore runTransaction so the balance deduction and escrow creation
// happen atomically — if either step fails, both are rolled back.
async function payWithWallet() {
    const price = listing.price ?? 0;

    if (ME.walletBalance < price) {
        throw new Error("Insufficient wallet balance.");
    }

    await runTransaction(database, async tx => {
        const userRef    = doc(database, "users", ME.uid);
        const listingRef = doc(database, "listings", listingId);

        const userSnap    = await tx.get(userRef);
        const listingSnap = await tx.get(listingRef);

        if (!listingSnap.exists()) throw new Error("Listing no longer exists.");
        const st = listingSnap.data().status;
        if (["sold","rented","escrow","pending"].includes(st)) throw new Error("This listing is no longer available.");
        if (st === "requested" && listingSnap.data().buyerId !== ME.uid) throw new Error("Someone else requested this item first.");

        const currentBalance = userSnap.data().walletBalance ?? 0;
        if (currentBalance < price) throw new Error("Insufficient balance.");

        // Deduct from buyer's wallet
        tx.update(userRef, { walletBalance: currentBalance - price });

        // Lock listing in escrow
        tx.update(listingRef, {
            status:    "escrow",
            buyerId:   ME.uid,
            buyerName: ME.name,
            paidAt:    serverTimestamp(),
            payMethod: "wallet",
            escrowAmt: price,
        });
    });

    // Write to immutable ledger — only ever addDoc here, never edit
    await addDoc(collection(database, "users", ME.uid, "ledger"), {
        type:       "hold",
        amount:     -(listing.price),
        note:       `Escrow hold — ${listing.title}`,
        listingId:  listingId,
        ts:         serverTimestamp(),
    });

    console.log(`✓ Wallet payment complete. $${price} held in escrow for "${listing.title}"`);
    goToConfirmation("wallet");
}

// ── Stripe payment ─────────────────────────────────────────────────────────────
// In test mode this charges the test card and creates the escrow record.
// In production you'd create a PaymentIntent on a backend first.
async function payWithStripe() {
    confirmLabel.textContent = "Charging card...";

    // For real production: create PaymentIntent on backend, confirm here.
    // For test mode demo: we simulate a successful charge and lock escrow.
    // TODO: replace with real backend PaymentIntent when ready.

    const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: { name: ME.name, email: ME.email },
    });

    if (error) {
        throw new Error(error.message);
    }

    console.log(`Stripe PaymentMethod created: ${paymentMethod.id}`);

    // Lock listing in escrow (Stripe handled the actual charge)
    await runTransaction(database, async tx => {
        const listingRef  = doc(database, "listings", listingId);
        const listingSnap = await tx.get(listingRef);

        if (!listingSnap.exists()) throw new Error("Listing no longer exists.");
        if (listingSnap.data().status === "sold") throw new Error("Someone else just bought this.");

        tx.update(listingRef, {
            status:          "escrow",
            buyerId:         ME.uid,
            buyerName:       ME.name,
            paidAt:          serverTimestamp(),
            payMethod:       "stripe",
            stripePayMethod: paymentMethod.id,
            escrowAmt:       listing.price,
        });
    });

    console.log(`✓ Stripe payment complete. Listing locked in escrow.`);
    goToConfirmation("stripe");
}

// ── Cash / e-Transfer ─────────────────────────────────────────────────────────
// Marks the listing as "pending" (not full escrow) — seller must confirm.
async function confirmCashOrETransfer(method) {
    await runTransaction(database, async tx => {
        const listingRef  = doc(database, "listings", listingId);
        const listingSnap = await tx.get(listingRef);

        if (!listingSnap.exists()) throw new Error("Listing no longer exists.");
        if (listingSnap.data().status === "sold") throw new Error("Someone else just bought this.");

        tx.update(listingRef, {
            status:    "pending",
            buyerId:   ME.uid,
            buyerName: ME.name,
            paidAt:    serverTimestamp(),
            payMethod: method,
        });
    });

    console.log(`✓ ${method} confirmed. Listing marked as pending.`);
    goToConfirmation(method);
}

function goToConfirmation(method) {
    window.location.href = `confirmation.html?id=${listingId}&method=${method}`;
}

function showStatus(emoji, msg) {
    payMain.classList.add("hidden");
    statusScreen.classList.remove("hidden");
    statusScreen.innerHTML = `<div class="status-emoji">${emoji}</div><div class="status-msg">${msg}</div>`;
}

function setError(msg) {
    payError.textContent = msg;
}