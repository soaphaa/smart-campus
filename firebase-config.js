// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDbPyHyIloZu5-fPJTqj1Na6Z17MYjEgEA",
    authDomain: "smart-campus-2b726.firebaseapp.com",
    projectId: "smart-campus-2b726",
    storageBucket: "smart-campus-2b726.firebasestorage.app",
    messagingSenderId: "199267957188",
    appId: "1:199267957188:web:e2f34d81c0ae1bd43ecc91",
    measurementId: "G-S9T18VZZ3D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const authentication = getAuth(app);
export const database = getFirestore(app);