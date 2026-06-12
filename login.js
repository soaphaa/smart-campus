import { authentication, database } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const signUpCard      = document.getElementById("sign-up");
const loginCard       = document.getElementById("login");
const toLoginBtn      = document.getElementById("to-login-btn");
const toSignUpBtn     = document.getElementById("to-sign-up-btn");
const googleSignUp    = document.getElementById("google-sign-up");
const googleLogin     = document.getElementById("google-login");

const signUpForm      = document.getElementById("sign-up-form");
const loginForm       = document.getElementById("login-form");
const signUpBtn       = document.getElementById("sign-up-btn");
const loginBtn        = document.getElementById("login-btn");

const nameInput       = document.getElementById("name");
const signUpEmail     = document.getElementById("sign-up-email");
const signUpPassword  = document.getElementById("sign-up-password");
const schoolInput     = document.getElementById("school");
const schoolsList     = document.getElementById("schools-list");

const loginEmail      = document.getElementById("login-email");
const loginPassword   = document.getElementById("login-password");

// ── Toast ─────────────────────────────────────────────────
const toastEl   = document.getElementById("toast");
const toastIcon = document.getElementById("toast-icon");
const toastMsg  = document.getElementById("toast-msg");

function showToast(msg, type = "success") {
    toastEl.className = `show toast-${type}`;
    toastIcon.className = type === "success"
        ? "fa-solid fa-circle-check"
        : "fa-solid fa-circle-xmark";
    toastMsg.textContent = msg;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.className = ""; }, 3500);
}

// ── Hash routing ──────────────────────────────────────────
window.addEventListener("DOMContentLoaded", handleHashChange);
window.addEventListener("hashchange", handleHashChange);

function handleHashChange() {
    loginCard.classList.add("hidden");
    signUpCard.classList.add("hidden");

    const hash = window.location.hash;
    if (hash === "#signup") {
        signUpCard.classList.remove("hidden");
    } else {
        // Default to login for any other hash (including #login)
        window.history.replaceState(null, "", "#login");
        loginCard.classList.remove("hidden");
    }

    if (typeof google !== "undefined" && google.accounts?.id) {
        setTimeout(renderGoogleButtons, 0);
    }
}

toLoginBtn.addEventListener("click", () => {
    window.history.replaceState(null, "", "#login");
    handleHashChange();
});

toSignUpBtn.addEventListener("click", () => {
    window.history.replaceState(null, "", "#signup");
    handleHashChange();
});

// ── Back navigation ───────────────────────────────────────
window.goBackToPreviousPage = function (e) {
    e.preventDefault();
    const fallback = new URLSearchParams(window.location.search).get("fallback") || "index.html";
    window.location.href = fallback;
};

// ── Sign up ───────────────────────────────────────────────
signUpForm.addEventListener("submit", async e => {
    e.preventDefault();
    const name     = nameInput.value.trim();
    const email    = signUpEmail.value.trim();
    const school   = schoolInput.value.trim();
    const password = signUpPassword.value;

    if (!name || !email || !school || !password) {
        showToast("Please fill in all fields.", "error");
        return;
    }

    setLoading(signUpBtn, true, "Creating account…");

    try {
        const cred = await createUserWithEmailAndPassword(authentication, email, password);
        await setDoc(doc(database, "users", cred.user.uid), {
            name, email, school,
            dateCreated: new Date().toISOString()
        });
        showToast("Account created! Welcome to Smart Campus 🎉");
        setTimeout(() => window.location.href = "home.html", 1000);
    } catch (err) {
        setLoading(signUpBtn, false, "Sign Up");
        if (err.code === "auth/email-already-in-use") {
            showToast("An account with this email already exists.", "error");
            window.history.replaceState(null, "", "#login");
            handleHashChange();
        } else if (err.code === "auth/weak-password") {
            showToast("Password must be at least 6 characters.", "error");
        } else {
            showToast("Sign up failed. Please try again.", "error");
            console.error(err);
        }
    }
});

// ── Log in ────────────────────────────────────────────────
loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const email    = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
        showToast("Please enter your email and password.", "error");
        return;
    }

    setLoading(loginBtn, true, "Logging in…");

    try {
        await signInWithEmailAndPassword(authentication, email, password);
        showToast("Logged in successfully!");
        setTimeout(() => window.location.href = "home.html", 800);
    } catch (err) {
        setLoading(loginBtn, false, "Log In");
        if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
            showToast("Invalid email or password.", "error");
        } else {
            showToast("Login failed. Please try again.", "error");
            console.error(err);
        }
    }
});

// ── Password toggles ──────────────────────────────────────
document.querySelectorAll(".pwd-toggle").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.target);
        const isText = input.type === "text";
        input.type = isText ? "password" : "text";
        btn.querySelector("i").className = isText ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
    });
});

// ── School autocomplete ───────────────────────────────────
let allSchools = [];

schoolInput.addEventListener("focus", () => {
    schoolsList.classList.remove("hidden");
    filterSchools(schoolInput.value);
});

schoolInput.addEventListener("input", () => filterSchools(schoolInput.value));

schoolInput.addEventListener("blur", () => {
    setTimeout(() => schoolsList.classList.add("hidden"), 200);
});

async function loadOntarioSchools() {
    try {
        const res = await fetch("ontario-public-schools.json");
        const data = await res.json();
        allSchools = data.records.map(r => r[7]);
    } catch (err) {
        console.error("Couldn't load schools list:", err);
    }
}

function filterSchools(value) {
    const q = value.toLowerCase().trim();
    const matches = allSchools.filter(s => s.toLowerCase().includes(q)).slice(0, 20);
    schoolsList.innerHTML = matches.map(name => {
        const div = document.createElement("div");
        div.className = "school-option";
        div.textContent = name;
        div.addEventListener("mousedown", () => {
            schoolInput.value = name;
            schoolsList.classList.add("hidden");
        });
        return div.outerHTML;
    }).join("");

    // Re-attach listeners (outerHTML loses them)
    schoolsList.querySelectorAll(".school-option").forEach((el, i) => {
        el.addEventListener("mousedown", () => {
            schoolInput.value = matches[i];
            schoolsList.classList.add("hidden");
        });
    });
}

loadOntarioSchools();

// ── Loading state helper ──────────────────────────────────
function setLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.textContent = label;
}

// ── Google Sign-In ────────────────────────────────────────
window.initGoogle = function () {
    google.accounts.id.initialize({
        client_id: "146597308769-s4apsm6nbec00892sb4l5v29mks1voj5.apps.googleusercontent.com",
        callback: handleGoogleCredential,
        auto_prompt: false
    });
    renderGoogleButtons();
};

let resizeTimer;
window.addEventListener("resize", () => {
    if (typeof google !== "undefined" && google.accounts?.id) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderGoogleButtons, 250);
    }
});

function renderGoogleButtons() {
    const isSignUp = !signUpCard.classList.contains("hidden");
    const target   = isSignUp ? googleSignUp : googleLogin;
    if (!target) return;
    target.innerHTML = "";
    google.accounts.id.renderButton(target, {
        type: "standard",
        shape: "pill",
        text: isSignUp ? "signup_with" : "signin_with",
        width: target.offsetWidth
    });
}

function handleGoogleCredential(response) {
    const profile = decodeJWT(response.credential);
    console.log("Google sign-in:", profile.name, profile.email);
    // TODO: wire up Firestore user creation for Google accounts
}

function decodeJWT(token) {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(
        atob(payload).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    ));
}

window.initGoogle();