const forgotPassword = document.getElementById("forgot-password");
const passwordReset = document.getElementById("password-reset");
const resetError = document.getElementById("reset-error");
const passwordInput = document.getElementById("reset-password");
const passwordToggle = document.querySelector(".password-toggle");

window.addEventListener("DOMContentLoaded", () => {
    handleHashChange();
});

window.addEventListener("hashchange", () => {
    handleHashChange();
});

function handleHashChange() {
    forgotPassword.classList.add("hidden");
    passwordReset.classList.add("hidden");
    resetError.classList.add("hidden");

    const hash = window.location.hash;

    if (hash.includes("?token=")) {
        const token = hash.split("?token=")[1];

        // logic to check token

        if (token && token.length > 0) {
            passwordReset.classList.remove("hidden");
        } else {
            resetError.classList.remove("hidden");
        }
    } else {
        if (hash !== "#forgot-password") {
            window.location.hash = "#forgot-password";
        }
        forgotPassword.classList.remove("hidden");
    }
}

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

