import { database, authentication } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    doc, getDoc, runTransaction, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ── DOM ─────────────────────────────────────────────────────
const statusScreen     = document.getElementById("status-screen");
const confMain         = document.getElementById("conf-main");
const orderImgWrap     = document.getElementById("order-img-wrap");
const orderTitle       = document.getElementById("order-title");
const orderMeta        = document.getElementById("order-meta");
const orderAmount      = document.getElementById("order-amount");
const qrSection        = document.getElementById("qr-section");
const scannerSection   = document.getElementById("scanner-section");
const manualSection    = document.getElementById("manual-section");
const completedSection = document.getElementById("completed-section");
const completedSub     = document.getElementById("completed-sub");
const qrCanvas         = document.getElementById("qr-canvas");
const qrTokenDisplay   = document.getElementById("qr-token-display");
const qrCountdown      = document.getElementById("qr-countdown");
const startScanBtn     = document.getElementById("start-scan-btn");
const scanResult       = document.getElementById("scan-result");
const primaryBtn       = document.getElementById("primary-action-btn");
const dotMeetup        = document.getElementById("dot-meetup");
const dotDone          = document.getElementById("dot-done");
const line1            = document.getElementById("line-1");
const line2            = document.getElementById("line-2");

// ── State ────────────────────────────────────────────────────
let ME        = null;
let listing   = null;
let listingId = null;
let payMethod = null;
let scanner   = null;
let qrTimer   = null;

const params  = new URLSearchParams(window.location.search);
listingId     = params.get("id");
payMethod     = params.get("method");

// ── Auth ─────────────────────────────────────────────────────
onAuthStateChanged(authentication, async user => {
    if (!user) { window.location.href = "login.html#login"; return; }

    const userDoc = await getDoc(doc(database, "users", user.uid));
    ME = { uid: user.uid, name: userDoc.data()?.name ?? user.email, email: user.email };

    if (!listingId) { showStatus("⚠️", "No order found."); return; }
    await loadAndRender();
});

// ── Load listing and decide what to show ─────────────────────
async function loadAndRender() {
    try {
        const snap = await getDoc(doc(database, "listings", listingId));
        if (!snap.exists()) { showStatus("📭", "This order no longer exists."); return; }
        listing = { id: snap.id, ...snap.data() };

        statusScreen.classList.add("hidden");
        confMain.classList.remove("hidden");

        renderOrderCard();

        const isBuyer  = listing.buyerId  === ME.uid;
        const isSeller = listing.sellerId === ME.uid;

        console.log("Confirmation debug:", {
            listingId, status: listing.status,
            buyerId: listing.buyerId, sellerId: listing.sellerId,
            myUid: ME.uid, isBuyer, isSeller, payMethod
        });

        // Already completed
        if (listing.status === "sold" || listing.status === "rented") {
            showCompleted(isSeller);
            return;
        }

        // Valid active states: escrow, pending (cash/etransfer), approved
        const validStatuses = ["escrow", "pending", "approved", "requested"];
        if (!validStatuses.includes(listing.status)) {
            showStatus("⚠️", `Unexpected listing status: ${listing.status}. Please contact support.`);
            return;
        }

        if (isBuyer) {
            dotMeetup.classList.add("active");
            if (payMethod === "wallet" || payMethod === "stripe") {
                qrSection.classList.remove("hidden");
                generateQR();
            } else {
                manualSection.classList.remove("hidden");
                document.getElementById("manual-instructions").textContent =
                    payMethod === "cash"
                        ? "Bring exact cash to the meetup. The seller will confirm receipt in the app after you hand over the payment."
                        : "Make sure your e-Transfer has been sent. The seller will confirm once they receive it.";
            }
        } else if (isSeller) {
            dotMeetup.classList.add("active");
            scannerSection.classList.remove("hidden");
            setupScanner();
        } else {
            // Neither buyer nor seller — show helpful debug info
            console.error("Not part of transaction. listing.buyerId:", listing.buyerId, "ME.uid:", ME.uid);
            showStatus("🚫", "You\'re not part of this transaction.");
        }

    } catch (err) {
        console.error("Load failed:", err);
        showStatus("⚠️", "Couldn't load this order.");
    }
}

// ── Order card ───────────────────────────────────────────────
function renderOrderCard() {
    if (listing.images?.[0]) {
        orderImgWrap.innerHTML = `<img src="${listing.images[0]}" alt="">`;
    }
    orderTitle.textContent  = listing.title ?? "Untitled";
    orderMeta.textContent   = `Seller: ${listing.sellerName ?? "Unknown"} · ${capitalize(listing.category ?? "")}`;
    orderAmount.textContent = listing.price ? `$${listing.price.toFixed(2)}` : "Exchange";
}

// ── QR code generation ───────────────────────────────────────
// The token is: listingId + buyerUID + a 5-min window timestamp
// This makes it time-limited so it can't be reused or screenshotted later
function generateQR() {
    qrCanvas.innerHTML = "";
    clearInterval(qrTimer);

    const windowMins = 5;
    const timeSlot   = Math.floor(Date.now() / (windowMins * 60 * 1000));
    const token      = `SC:${listingId}:${ME.uid}:${timeSlot}`;

    console.log(`QR token generated: ${token}`);

    new QRCode(qrCanvas, {
        text:         token,
        width:        200,
        height:       200,
        colorDark:    "#0f172a",
        colorLight:   "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
    });

    // Show a truncated version of the token so it looks legit
    qrTokenDisplay.textContent = token.slice(0, 32) + "...";

    // Countdown timer — regenerates QR every 5 minutes
    let secsLeft = windowMins * 60 - (Math.floor(Date.now() / 1000) % (windowMins * 60));

    qrTimer = setInterval(() => {
        secsLeft--;
        const m = String(Math.floor(secsLeft / 60)).padStart(2, "0");
        const s = String(secsLeft % 60).padStart(2, "0");
        qrCountdown.textContent = `${m}:${s}`;

        if (secsLeft <= 0) {
            generateQR(); // regenerate when expired
        }
    }, 1000);
}

// ── QR scanner setup (seller side) ──────────────────────────
function setupScanner() {
    startScanBtn.addEventListener("click", startScanner);
}

function startScanner() {
    startScanBtn.style.display = "none";

    scanner = new Html5Qrcode("reader");

    scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        err => {} // ignore frame errors
    ).catch(err => {
        console.error("Camera failed:", err);
        showScanResult("error", "Camera access denied. Check browser permissions.");
        startScanBtn.style.display = "flex";
    });
}

async function onScanSuccess(decodedText) {
    // Stop scanning immediately
    if (scanner) {
        await scanner.stop();
        scanner = null;
    }

    console.log(`QR scanned: ${decodedText}`);

    // Validate token format: SC:<listingId>:<buyerUID>:<timeSlot>
    const parts = decodedText.split(":");
    if (parts.length !== 4 || parts[0] !== "SC") {
        showScanResult("error", "Invalid QR code. Make sure the buyer is showing their confirmation screen.");
        return;
    }

    const [, scannedListingId, scannedBuyerUid, scannedTimeSlot] = parts;

    // Check it matches this transaction
    if (scannedListingId !== listingId) {
        showScanResult("error", "QR code is for a different listing.");
        return;
    }

    if (scannedBuyerUid !== listing.buyerId) {
        showScanResult("error", "QR code belongs to a different buyer.");
        return;
    }

    // Check time window (must be within the last 5-min slot or current)
    const windowMins   = 5;
    const currentSlot  = Math.floor(Date.now() / (windowMins * 60 * 1000));
    const tokenSlot    = parseInt(scannedTimeSlot);
    if (Math.abs(currentSlot - tokenSlot) > 1) {
        showScanResult("error", "QR code has expired. Ask the buyer to refresh their screen.");
        return;
    }

    // ✓ Valid — release escrow atomically
    showScanResult("success", "✓ QR verified! Releasing funds...");
    await releaseEscrow();
}

// ── Atomic escrow release ────────────────────────────────────
// This is the critical transaction — both the listing status update
// AND the seller balance credit happen together.
// If either fails, both roll back — money never disappears.
async function releaseEscrow() {
    try {
        await runTransaction(database, async tx => {
            const listingRef = doc(database, "listings", listingId);
            const sellerRef  = doc(database, "users", listing.sellerId);

            const listingSnap = await tx.get(listingRef);
            const sellerSnap  = await tx.get(sellerRef);

            if (!listingSnap.exists()) throw new Error("Listing not found.");

            const currentStatus = listingSnap.data().status;
            if (currentStatus === "sold" || currentStatus === "rented") {
                throw new Error("Already completed.");
            }

            const escrowAmt      = listingSnap.data().escrowAmt ?? 0;
            const sellerBalance  = sellerSnap.data()?.walletBalance ?? 0;
            const newStatus      = listing.category === "rent" ? "rented" : "sold";

            // 1. Mark listing as sold/rented
            tx.update(listingRef, {
                status:      newStatus,
                completedAt: serverTimestamp(),
            });

            // 2. Credit seller's wallet
            tx.update(sellerRef, {
                walletBalance: sellerBalance + escrowAmt,
            });
        });

        console.log(`✓ Escrow released. Listing marked as ${listing.category === "rent" ? "rented" : "sold"}.`);

        // Update step indicator
        dotMeetup.classList.remove("active");
        dotMeetup.classList.add("done");
        dotMeetup.innerHTML = `<i class="fa-solid fa-check"></i>`;
        line1.classList.add("done");
        dotDone.classList.add("done");
        dotDone.innerHTML = `<i class="fa-solid fa-check"></i>`;
        line2.classList.add("done");

        scanResult.textContent  = "✓ Funds released to your wallet!";
        scanResult.className    = "scan-result success";
        scanResult.classList.remove("hidden");

        setTimeout(() => showCompleted(true), 1500);

    } catch (err) {
        console.error("Escrow release failed:", err);
        // IMPORTANT: if this fails, money stays in escrow — nobody loses anything.
        // The seller can try scanning again or contact support.
        showScanResult("error", `Release failed: ${err.message}. Your money is safe in escrow — try again or contact support.`);

        // Re-enable scanner
        startScanBtn.style.display = "flex";
        startScanBtn.textContent   = "Try Again";
        startScanBtn.onclick       = startScanner;
    }
}

// ── Completed state ──────────────────────────────────────────
function showCompleted(isSeller) {
    qrSection.classList.add("hidden");
    scannerSection.classList.add("hidden");
    manualSection.classList.add("hidden");
    completedSection.classList.remove("hidden");

    dotMeetup.classList.add("done");
    dotMeetup.innerHTML = `<i class="fa-solid fa-check"></i>`;
    dotDone.classList.add("done");
    dotDone.innerHTML = `<i class="fa-solid fa-check"></i>`;
    line1.classList.add("done");
    line2.classList.add("done");

    completedSub.textContent = isSeller
        ? `$${(listing.escrowAmt ?? listing.price ?? 0).toFixed(2)} has been added to your wallet. You can withdraw it from your profile.`
        : `You're all set! Enjoy your ${listing.title}.`;

    if (isSeller) {
        primaryBtn.classList.remove("hidden");
        primaryBtn.textContent = "View Wallet";
        primaryBtn.onclick     = () => window.location.href = "profile.html#wallet";
    }
}

// ── Helpers ──────────────────────────────────────────────────
function showStatus(emoji, msg) {
    confMain.classList.add("hidden");
    statusScreen.classList.remove("hidden");
    statusScreen.innerHTML = `<div class="status-emoji">${emoji}</div><div class="status-msg">${msg}</div>`;
}

function showScanResult(type, msg) {
    scanResult.textContent = msg;
    scanResult.className   = `scan-result ${type}`;
    scanResult.classList.remove("hidden");
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }