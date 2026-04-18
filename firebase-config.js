// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
// ใส่ค่า Config ใหม่ของคุณตรงนี้
const firebaseConfig = {
  apiKey: "AIzaSyDg6LnmXjvARHw8yCMwREirjfVQ2vQrXEg",
  authDomain: "sc-e-voting.firebaseapp.com",
  projectId: "sc-e-voting",
  storageBucket: "sc-e-voting.firebasestorage.app",
  messagingSenderId: "206037022201",
  appId: "1:206037022201:web:7f51638d387a2d03323928"
};

// เริ่มต้นใช้งาน Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ส่งออก auth และ db ไปให้ไฟล์อื่นใช้
export { auth, db };