import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, increment, query, where, serverTimestamp, FieldPath } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUser = null;
let studentData = null; 
let allCampaigns = []; 
let countdownIntervals = []; 
let currentBoothData = null; // เก็บข้อมูลการเลือกตั้งที่กำลังโหวต
let userSelectedOption = null; // เก็บเบอร์ที่เลือก

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; } 
    
    const email = user.email; 
    const emailMatch = email.match(/(\d{5})@mst\.ac\.th$/);
    if (emailMatch) {
        const studentId = emailMatch[1]; 
        try {
            const studentDoc = await getDoc(doc(db, "students", studentId));
            if (studentDoc.exists()) {
                currentUser = user;
                studentData = studentDoc.data();
                studentData.id = studentId; 
                document.getElementById("userEmail").innerHTML = `
                    <div class="font-bold text-sm tracking-wide text-white drop-shadow-md truncate">${studentData.name}</div>
                    <div class="text-[11px] text-purple-200 mt-0.5">มัธยมศึกษาปีที่ ${studentData.room} | รหัสนักเรียน ${studentId}</div>
                `;
                fetchCampaigns(); 
            } else {
                Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าถึง', text: `ไม่พบรหัสนักเรียน ${studentId} ในฐานข้อมูล` }).then(() => signOut(auth).then(() => window.location.href = "index.html"));
            }
        } catch (error) { 
            Swal.fire('ข้อผิดพลาด', 'ระบบขัดข้อง ไม่สามารถตรวจสอบรายชื่อได้', 'error'); 
        }
    } else {
        Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'รองรับเฉพาะอีเมล @mst.ac.th' }).then(() => signOut(auth).then(() => window.location.href = "index.html"));
    }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'question', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก' }).then((r) => { if (r.isConfirmed) signOut(auth).then(() => window.location.href = "index.html"); });
});

function isStudentEligible(campaignRules, studentInfo) {
    if (!campaignRules) return true; 
    const { type, values } = campaignRules;
    const stuLevel = (studentInfo.level || "").replace(/[mM]\./, 'ม.'); 
    const stuRoom = studentInfo.room || ""; 
    
    if (type === "all") return true;
    if (type === "junior") return ["ม.1", "ม.2", "ม.3"].includes(stuLevel);
    if (type === "senior") return ["ม.4", "ม.5", "ม.6"].includes(stuLevel);
    if (type === "custom_level") return values.includes(stuLevel);
    if (type === "custom_room") return values.some(val => val.replace(/\s/g, '') === stuRoom.replace(/\s/g, ''));
    return false;
}

async function fetchCampaigns() { 
    const q = query(collection(db, "campaigns"), where("status", "==", "open"));
    try {
        const querySnapshot = await getDocs(q); 
        let tempCampaigns = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (isStudentEligible(data.allowed_voters, studentData)) tempCampaigns.push({ id: doc.id, ...data });
        });
        allCampaigns = tempCampaigns;
        renderCampaigns(allCampaigns);
    } catch (error) { 
        document.getElementById("campaignList").innerHTML = '<div class="text-center text-red-500 p-5 bg-red-50 rounded-xl">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>'; 
    }
}

async function renderCampaigns(campaignsToRender) {
    const list = document.getElementById("campaignList");
    list.innerHTML = ""; 
    countdownIntervals.forEach(clearInterval); countdownIntervals = [];

    if (campaignsToRender.length === 0) {
        list.innerHTML = `<div class="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 text-center text-gray-500 flex flex-col items-center"><div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"><svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg></div><p class="font-bold">ไม่มีรายการเลือกตั้งสำหรับคุณในขณะนี้</p></div>`;
        return;
    }

    for (const data of campaignsToRender) {
        const campaignId = data.id;
        const voterSnap = await getDoc(doc(db, "campaigns", campaignId, "voters", studentData.id));
        
        const now = new Date().getTime();
        const isExpired = data.endTime && now >= new Date(data.endTime).getTime();
        const hasVoted = voterSnap.exists();
        
        let timeBadge = '';
        if (data.endTime && !isExpired && !hasVoted) {
            timeBadge = `<div class="text-xs font-bold text-pink-600 bg-pink-50 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg mb-4"><span class="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span> ปิดรับโหวตใน: <span id="timer-${campaignId}">กำลังคำนวณ...</span></div>`;
            startCountdown(campaignId, data.endTime); 
        }

        let buttonHtml = '';
        if (hasVoted) {
            const voteTime = voterSnap.data().votedAt ? voterSnap.data().votedAt.toDate().toLocaleString('th-TH') : "ไม่ระบุเวลา";
            buttonHtml = `<div class="mt-5 bg-green-50 border border-green-200 p-4 rounded-xl flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div><div><p class="text-sm font-bold text-green-800">ท่านใช้สิทธิ์เรียบร้อยแล้ว</p><p class="text-[10px] text-green-600">เมื่อ: ${voteTime}</p></div></div></div>`;
        }
        else if (isExpired) buttonHtml = `<div class="mt-5 bg-gray-100 text-gray-500 font-bold py-3 px-4 rounded-xl text-center">หมดเวลาการลงคะแนน</div>`;
        else buttonHtml = `<button onclick="enterBooth('${campaignId}')" class="w-full mt-5 bg-purple-700 hover:bg-purple-800 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all flex justify-center items-center gap-2 group">เข้าสู่คูหาลงคะแนน <svg class="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></button>`;

        let avatars = '<div class="flex -space-x-3 mt-4">';
        data.options.forEach((o, i) => { if(i<4) avatars += `<img src="${o.image || 'https://placehold.co/100/e2e8f0/64748b?text=Image'}" class="w-12 h-12 rounded-full border-2 border-white object-cover shadow-sm bg-white">`; });
        if(data.options.length > 4) avatars += `<div class="w-12 h-12 rounded-full border-2 border-white bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shadow-sm">+${data.options.length-4}</div>`;
        avatars += '</div>';

        const card = document.createElement("div");
        card.className = `bg-white p-6 rounded-3xl shadow-sm border border-gray-100 fade-in ${hasVoted ? 'opacity-80' : ''}`;
        card.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex-1">
                    <h3 class="text-xl font-extrabold text-gray-900 mb-1 leading-tight">${data.title}</h3>
                    <p class="text-gray-500 text-sm mb-3 line-clamp-2">${data.description || 'การเลือกตั้งคณะกรรมการนักเรียน'}</p>
                    ${timeBadge}
                    ${!hasVoted && !isExpired ? avatars : ''}
                </div>
            </div>
            ${buttonHtml}
        `;
        list.appendChild(card);
    }
}

function startCountdown(campaignId, endTimeStr) {
    const end = new Date(endTimeStr).getTime();
    const interval = setInterval(() => {
        const now = new Date().getTime(); const distance = end - now;
        if (distance < 0) { clearInterval(interval); fetchCampaigns(); return; }
        const el = document.getElementById(`timer-${campaignId}`);
        if (!el) return;
        const d = Math.floor(distance / (1000 * 60 * 60 * 24));
        const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);
        let t = ""; if(d > 0) t += `${d} วัน `; t += `${h} ชม. ${m} นาที ${s} วิ.`;
        el.innerHTML = t;
    }, 1000);
    countdownIntervals.push(interval);
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const kw = e.target.value.toLowerCase();
    renderCampaigns(allCampaigns.filter(c => c.title.toLowerCase().includes(kw) || (c.description && c.description.toLowerCase().includes(kw))));
});

// ================= ระบบคูหาลงคะแนน (Virtual Booth) =================
window.enterBooth = function(campaignId) {
    currentBoothData = allCampaigns.find(c => c.id === campaignId);
    userSelectedOption = null;

    document.getElementById("view-home").classList.add("hidden");
    document.getElementById("view-booth").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.getElementById("boothCampaignTitle").innerText = currentBoothData.title;
    document.getElementById("boothCampaignDesc").innerText = currentBoothData.description || 'โปรดเลือกผู้สมัครที่คุณต้องการเพียง 1 หมายเลข';
    document.getElementById("stickySubmitBar").classList.add("translate-y-full"); // ซ่อนปุ่มยืนยันก่อน
    document.getElementById("selectedCandidateName").innerText = "-";

    const grid = document.getElementById("candidatesGrid");
    grid.innerHTML = "";

    // เติมปุ่ม "ไม่ประสงค์ลงคะแนน" อัตโนมัติในตอนท้าย
    let displayOptions = [...currentBoothData.options];
    displayOptions.push({ name: "ไม่ประสงค์ลงคะแนน", image: null, isNoVote: true });

    displayOptions.forEach((opt, index) => {
        const isNoVote = opt.isNoVote === true;
        const numberLabel = isNoVote ? '' : `<div class="absolute top-0 left-0 bg-purple-700 text-white font-bold px-4 py-1.5 rounded-br-2xl rounded-tl-2xl text-sm shadow-md z-10">เบอร์ ${index + 1}</div>`;
        
        const defaultImg = isNoVote ? 'https://i.postimg.cc/85z1Dk9n/novote.png' : 'https://placehold.co/400x400/f3f4f6/a8a29e?text=No+Image';
        const imgSrc = opt.image || defaultImg;
        
        const policyBtn = isNoVote ? '' : `<button onclick="event.stopPropagation(); showPolicy('${opt.name}', '${imgSrc}')" class="w-full mt-4 bg-gray-100 hover:bg-purple-100 text-purple-700 text-xs font-bold py-2.5 rounded-xl transition-colors flex justify-center items-center gap-1 border border-gray-200"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ดูประวัติ/นโยบาย</button>`;

        const titleClass = isNoVote ? "text-red-500 font-extrabold mt-4" : "text-gray-900 font-bold mt-2";

        grid.innerHTML += `
            <div class="candidate-card bg-white rounded-3xl p-4 shadow-sm relative cursor-pointer flex flex-col items-center text-center fade-in" 
                 onclick="selectOption(this, '${opt.name}')" style="animation-delay: ${index * 0.05}s">
                ${numberLabel}
                <div class="absolute top-4 right-4 w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center check-circle transition-colors z-10 bg-white">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <div class="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-gray-50 overflow-hidden mt-4 shadow-inner">
                    <img src="${imgSrc}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='${defaultImg}';">
                </div>
                <div class="mt-4 w-full flex-1 flex flex-col justify-between">
                    <h3 class="text-base leading-snug ${titleClass}">${opt.name}</h3>
                    ${policyBtn}
                </div>
            </div>
        `;
    });
};

window.exitBooth = function() {
    document.getElementById("view-booth").classList.add("hidden");
    document.getElementById("view-home").classList.remove("hidden");
    document.getElementById("stickySubmitBar").classList.add("translate-y-full");
    currentBoothData = null; userSelectedOption = null;
}

window.selectOption = function(element, optName) {
    document.querySelectorAll(".candidate-card").forEach(el => el.classList.remove("selected"));
    element.classList.add("selected");
    userSelectedOption = optName;

    // อัปเดตแถบด้านล่างและเด้งขึ้นมา
    document.getElementById("selectedCandidateName").innerText = optName;
    document.getElementById("stickySubmitBar").classList.remove("translate-y-full");
}

window.showPolicy = function(name, imageUrl) {
    Swal.fire({
        title: name,
        html: `<p class="text-sm text-gray-500 mb-4">วิสัยทัศน์และนโยบายผู้สมัคร</p>`,
        imageUrl: imageUrl,
        imageAlt: name,
        showCloseButton: true,
        showConfirmButton: false,
        customClass: { image: 'rounded-2xl object-cover max-h-[60vh] shadow-md border border-gray-100', popup: 'rounded-[2rem]' }
    });
}

// ================= ระบบยืนยันการโหวต =================
window.confirmVote = function() {
    if (!userSelectedOption || !currentBoothData) return;
    
    const isNoVote = userSelectedOption === "ไม่ประสงค์ลงคะแนน";
    const titleHtml = isNoVote 
        ? `<b class="text-red-500 text-2xl">ไม่ประสงค์ลงคะแนน</b>` 
        : `เบอร์ที่ท่านเลือกคือ <br><b class="text-purple-700 text-2xl mt-2 block">${userSelectedOption}</b>`;

    Swal.fire({
        title: 'ยืนยันการลงคะแนน',
        html: `${titleHtml}<br><br><div class="bg-yellow-50 text-yellow-700 p-3 rounded-xl text-xs font-bold border border-yellow-200">⚠️ โปรดตรวจสอบให้แน่ใจ หากยืนยันแล้วจะไม่สามารถกลับมาแก้ไขได้อีก</div>`,
        icon: 'question',
        showCancelButton: true, confirmButtonColor: '#6b21a8', cancelButtonColor: '#d1d5db',
        confirmButtonText: 'ยืนยันสิทธิ์', cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-[2rem]' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            submitFinalVote();
        }
    });
}

async function submitFinalVote() {
    const campaignId = currentBoothData.id;
    const voteValue = userSelectedOption;

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', html: 'กรุณารอสักครู่ ระบบกำลังเข้ารหัสลับ', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const voterRef = doc(db, "campaigns", campaignId, "voters", studentData.id);
        if ((await getDoc(voterRef)).exists()) { Swal.fire('ข้อผิดพลาด', 'ท่านได้ใช้สิทธิ์ไปแล้ว', 'error'); exitBooth(); return; }

        const voteTimestamp = serverTimestamp();
        await setDoc(voterRef, { 
            votedAt: voteTimestamp,
            studentId: studentData.id, 
            name: studentData.name,
            room: studentData.room,
            level: studentData.level,
            uidUsed: currentUser.uid 
        });
        
        // อุดช่องโหว่เรื่องจุดด้วย FieldPath
        await updateDoc(doc(db, "campaigns", campaignId), new FieldPath("votes_count", voteValue), increment(1));

        Swal.close();
        
        // ไปหน้าใบเสร็จ
        showReceipt(currentBoothData.title, studentData.name);
        
    } catch (error) { 
        Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error'); 
    }
}

// ================= ระบบใบเสร็จ (E-Receipt) =================
function showReceipt(campaignName, voterName) {
    document.getElementById("view-booth").classList.add("hidden");
    document.getElementById("view-receipt").classList.remove("hidden");
    document.getElementById("stickySubmitBar").classList.add("translate-y-full");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // สร้างรหัสอ้างอิงและวันที่
    const refId = "MST-" + Math.random().toString(36).substr(2, 8).toUpperCase();
    const now = new Date();
    const timeStr = now.toLocaleDateString('th-TH') + " " + now.toLocaleTimeString('th-TH') + " น.";

    document.getElementById("receiptRef").innerText = refId;
    document.getElementById("receiptTime").innerText = timeStr;
    document.getElementById("receiptCampaignName").innerText = campaignName;
    document.getElementById("receiptVoterName").innerText = voterName;
}
