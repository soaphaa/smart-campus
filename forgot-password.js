import { authentication } from "./firebase-config.js";
import { sendPasswordResetEmail, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const forgotPassword = document.getElementById("forgot-password");
const forgotPasswordForm = document.querySelector("#forgot-password form");
const resetEmail = document.getElementById("reset-email");

const passwordReset = document.getElementById("password-reset");
const passwordResetForm = document.querySelector("#password-reset form");
const resetPassword = document.getElementById("reset-password");
const passwordInput = document.getElementById("reset-password");
const passwordToggle = document.querySelector(".password-toggle");

const resetError = document.getElementById("reset-error");
const resetErrorForm = document.querySelector("#reset-error form");
const errorMessage = document.getElementById("error-message");

window.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const firebaseToken = urlParams.get("oobCode");
    const mode = urlParams.get("mode");

    if (firebaseToken && mode === "resetPassword") {
        console.log("🎯 Redirect successfully captured from email!");

        window.location.hash = `#password-reset?token=${firebaseToken}`;
    } else {
        handleHashChange();
    }
});

window.addEventListener("hashchange", () => {
    handleHashChange();
});

function handleHashChange() {
    forgotPassword.classList.add("hidden");
    passwordReset.classList.add("hidden");
    resetError.classList.add("hidden");

    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.split("?")[1]);
    const token = urlParams.get("token");

    if (token && token.length > 0) {
        passwordReset.classList.remove("hidden");
    } else {
        if (hash !== "#forgot-password") {
            window.location.hash = "#forgot-password";
        }
        forgotPassword.classList.remove("hidden");
    }
}

forgotPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = resetEmail.value;

    const actionCodeSettings = {
        url: "https://smart-campus-2b726.web.app/action.html"
    };

    try {
        await sendPasswordResetEmail(authentication, email, actionCodeSettings);
        alert("Password reset link sent! Please check your inbox.");
    } catch (error) {
        console.error("Error sending email: ", error.code);
        alert("Failed to send email: " + error.message);
    }
});

passwordResetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = resetPassword.value;

    const hash = window.location.hash;
    const urlParams = new URLSearchParams(hash.split("?")[1]);
    const token = urlParams.get("token");

    try {
        await confirmPasswordReset(authentication, token, newPassword);
        alert("Password successfully updated! You can now log in with your new password.");
    } catch (error) {
        console.error("Password reset failed:", error.code);

        if (error.code === "auth/expired-action-code") {
            errorMessage.textContent = "This recovery link has expired. For security reasons, please request a new one.";
        } else if (error.code === "auth/invalid-action-code") {
            errorMessage.textContent = "This link is invalid or has already been used to reset a password.";
        } else if (error.code === "auth/weak-password") {
            errorMessage.textContent = "Password must follow our security guidelines (at least 6 characters long).";
            alert("Password is too weak!");
            return;
        } else {
            errorMessage.textContent = "An unexpected error occurred. Please try again later.";
        }

        passwordReset.classList.add("hidden");
        resetError.classList.remove("hidden");

    }


});

passwordToggle.addEventListener("click", function () {

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        passwordToggle.classList.remove('fa-eye');
        passwordToggle.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        passwordToggle.classList.remove('fa-eye-slash');
        passwordToggle.classList.add('fa-eye');
    }
});

passwordToggle.addEventListener("mousedown", (e) => {
    e.preventDefault();
})

