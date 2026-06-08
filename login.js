import { authentication, database } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const signUp = document.getElementById("sign-up");
const login = document.getElementById("login");
const toLoginBtn = document.getElementById("to-login-btn");
const toSignUpBtn = document.getElementById("to-sign-up-btn");
const googleSignUp = document.getElementById("google-sign-up");
const googleLogin = document.getElementById("google-login");

const passwordToggles = document.querySelectorAll(".password-toggle");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");

const nameInput = document.getElementById("name");
const signUpEmailInput = document.getElementById("sign-up-email");
const signUpPasswordInput = document.getElementById("sign-up-password");
const schoolInput = document.getElementById("school");
const schoolsList = document.getElementById("schools-list");

const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");

window.addEventListener("DOMContentLoaded", () => {
    handleHashChange();
});

window.addEventListener("hashchange", () => {
    handleHashChange();
});

function handleHashChange() {
    login.classList.add("hidden");
    signUp.classList.add("hidden");

    const hash = window.location.hash;

    if (hash === "#login") {
        login.classList.remove("hidden");
    } else if (hash === "#signup") {
        signUp.classList.remove("hidden");
    }

    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        setTimeout(() => {
            renderGoogleButtons();
        }, 0);
    }
}

window.goBackToPreviousPage = function (event) {
    event.preventDefault();

    const urlParams = new URLSearchParams(window.location.search);
    const fallback = urlParams.get('fallback') || "index.html";

    window.location.href = fallback;
};

toLoginBtn.addEventListener("click", () => {
    // window.location.hash = "#login";
    window.history.replaceState(null, "", "#login");
    handleHashChange();
});

toSignUpBtn.addEventListener("click", () => {
    window.history.replaceState(null, "", "#signup");
    handleHashChange();
});


signUp.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = nameInput.value;
    const email = signUpEmailInput.value;
    const school = schoolInput.value;
    const password = signUpPasswordInput.value;

    try {
        const userCredential = await createUserWithEmailAndPassword(authentication, email, password);
        const user = userCredential.user;

        await setDoc(doc(database, "users", user.uid), {
            name: name,
            email: email,
            school: school,
            dateCreated: new Date().toISOString()
        });
        window.location.href = "home.html"
    } catch (error) {
        // console.error("Sign up error: ", error.code);
        if (error.code === "auth/email-already-in-use") {
            alert("An account with this email already exists. Try logging in instead.");
            window.history.replaceState(null, "", "#login");
            handleHashChange();
        } else if (error.code === "auth/weak-password") {
            alert("Password should be at least 6 characters long.");
        } else {
            alert("Sign up failed. Please try again.\nError: " + error.message);
        }
    }
});

login.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;

    try {
        const userCredential = await signInWithEmailAndPassword(authentication, email, password);
        window.location.href = "home.html"
    } catch (error) {

        if (error.code === "auth/invalid-credential") {
            alert("Invalid email or password. Please try again.");
        } else if (error.code === "auth/user-not-found") {
            alert("No account found with this email. Please sign up first.");
        } else {
            alert("Login failed. Please try again. \nError: " + error.message);
        }
    }
});

passwordToggles.forEach(toggle => {

    toggle.addEventListener("click", function () {
        const passwordInput = toggle.previousElementSibling;

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggle.classList.remove('fa-eye');
            toggle.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            toggle.classList.remove('fa-eye-slash');
            toggle.classList.add('fa-eye');
        }
    });

    toggle.addEventListener("mousedown", (e) => {
        e.preventDefault();
    })
})

let allSchools = [];

schoolInput.addEventListener("focus", () => {
    schoolsList.classList.remove("hidden");
    filterSchools(schoolInput.value);
});

schoolInput.addEventListener("input", () => {
    filterSchools(schoolInput.value);
});

schoolInput.addEventListener("blur", () => {
    setTimeout(() => {
        schoolsList.classList.add("hidden");
    }, 200);
});

async function loadOntarioSchools() {
    try {
        const response = await fetch("ontario-public-schools.json");
        const data = await response.json();
        const schools = data.records;

        schools.forEach(schoolData => {
            allSchools.push(schoolData[7]);
        });
    } catch (error) {
        console.error("Error loading json file: ", error);
    }
}

function filterSchools(userInput) {
    const input = userInput.toLowerCase().trim();

    const matchingSchools = allSchools.filter(schoolName => {
        return schoolName.toLowerCase().includes(input);
    });

    schoolsList.innerHTML = "";
    const topMatches = matchingSchools.slice(0, 20);

    topMatches.forEach(schoolName => {
        const option = document.createElement('div');
        option.className = 'school-option';
        option.textContent = schoolName;

        option.addEventListener("mousedown", () => {
            schoolInput.value = schoolName;
            schoolsList.classList.add("hidden");
        });
        schoolsList.appendChild(option);
    });
}

loadOntarioSchools();

window.initGoogle = function () {
    google.accounts.id.initialize({
        client_id: "146597308769-s4apsm6nbec00892sb4l5v29mks1voj5.apps.googleusercontent.com",
        callback: handleGoogleCredential,
        auto_prompt: false
    });

    renderGoogleButtons();
};

let resizeTimeout;
window.addEventListener('resize', () => {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            renderGoogleButtons();
        }, 250);
    }
});


function renderGoogleButtons() {
    var isSignUp = !signUp.classList.contains("hidden");

    if (isSignUp) {
        if (googleSignUp) {
            googleSignUp.innerHTML = "";
            const width = googleSignUp.offsetWidth;

            google.accounts.id.renderButton(
                googleSignUp,
                {
                    type: "standard",
                    // size: "large",
                    shape: "pill",
                    text: "signup_with",
                    width: width
                }
            );
        }
    } else {
        if (googleLogin) {
            googleLogin.innerHTML = "";
            const width = googleLogin.offsetWidth;

            google.accounts.id.renderButton(
                googleLogin,
                {
                    type: "standard",
                    // size: "large",
                    shape: "pill",
                    text: "signin_with",
                    width: width
                }
            );
        }
    }
}

function handleGoogleCredential(response) {
    const token = response.credential;
    const userProfile = decodeJWT(token);

    console.log("Successfully logged in with Google!");
    console.log("User Unique ID:", userProfile.sub);
    console.log("Name:", userProfile.name);
    console.log("Email:", userProfile.email);
    console.log("Profile Pic URL:", userProfile.picture);

}

function decodeJWT(token) {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
        atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
    );
    return JSON.parse(jsonPayload);
}

window.initGoogle();