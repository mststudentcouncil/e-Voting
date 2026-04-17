import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, increment, query, where, serverTimestamp, FieldPath } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUser = null;
let studentData = null; 
let allCampaigns = []; 
let countdownIntervals = []; 
let currentBoothData = null; 
let userSelectedOption = null; 

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
                    <div class="text-[11px] text-purple-200 mt-0.5"> ห้อง ${studentData.room} | รหัส ${studentId}</div>
                `;
                fetchCampaigns(); 
            } else {
                Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าถึง', text: `ไม่พบรหัสนักเรียน ${studentId} ในฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ` }).then(() => signOut(auth).then(() => window.location.href = "index.html"));
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

function getTargetGroupText(allowedVoters) {
    if (!allowedVoters || allowedVoters.type === "all") return "นักเรียนทุกคน";
    const type = allowedVoters.type;
    const values = allowedVoters.values || [];
    
    if (type === "junior") return "เฉพาะมัธยมศึกษาตอนต้น (ม.1 - ม.3)";
    if (type === "senior") return "เฉพาะมัธยมศึกษาตอนปลาย (ม.4 - ม.6)";
    if (type === "custom_level") return "เฉพาะชั้น " + values.join(", ");
    if (type === "custom_room") return "เฉพาะห้อง " + values.join(", ");
    return "กลุ่มเฉพาะ";
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
        const startTimestamp = data.startTime ? new Date(data.startTime).getTime() : 0;
        const endTimestamp = data.endTime ? new Date(data.endTime).getTime() : Infinity;

        const isExpired = now >= endTimestamp;
        const isNotStarted = startTimestamp > 0 && now < startTimestamp;
        const hasVoted = voterSnap.exists();
        
        let timeBadge = '';
        if (isNotStarted) {
            timeBadge = `<div class="text-xs font-bold text-blue-600 bg-blue-50 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg mb-4"><span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span> เปิดให้โหวตในอีก: <span id="timer-${campaignId}">กำลังคำนวณ...</span></div>`;
            startCountdown(campaignId, data.startTime); 
        } else if (!isExpired && !hasVoted && data.endTime) {
            timeBadge = `<div class="text-xs font-bold text-pink-600 bg-pink-50 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg mb-4"><span class="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span> ปิดรับโหวตใน: <span id="timer-${campaignId}">กำลังคำนวณ...</span></div>`;
            startCountdown(campaignId, data.endTime); 
        }

        let buttonHtml = '';
        if (hasVoted) {
            const voteTime = voterSnap.data().votedAt ? voterSnap.data().votedAt.toDate().toLocaleString('th-TH') : "ไม่ระบุเวลา";
            buttonHtml = `<div class="mt-5 bg-green-50 border border-green-200 p-4 rounded-xl flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div><div><p class="text-sm font-bold text-green-800">ท่านใช้สิทธิ์เรียบร้อยแล้ว</p><p class="text-[10px] text-green-600">เมื่อ: ${voteTime}</p></div></div></div>`;
        }
        else if (isExpired) buttonHtml = `<div class="mt-5 bg-gray-100 text-gray-500 font-bold py-3 px-4 rounded-xl text-center">หมดเวลาการลงคะแนน</div>`;
        else if (isNotStarted) buttonHtml = `<div class="mt-5 bg-blue-50 text-blue-500 border border-blue-200 font-bold py-3 px-4 rounded-xl text-center">ยังไม่ถึงเวลาเปิดระบบ</div>`;
        else buttonHtml = `<button onclick="enterBooth('${campaignId}')" class="w-full mt-5 bg-purple-700 hover:bg-purple-800 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all flex justify-center items-center gap-2 group">เข้าสู่คูหาลงคะแนน <svg class="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg></button>`;

        let avatars = '<div class="flex -space-x-3 mt-4">';
        data.options.forEach((o, i) => { 
            if(i<4) {
                if (o.image) {
                    avatars += `<img src="${o.image}" class="w-12 h-12 rounded-full border-2 border-white object-cover shadow-sm bg-white" onerror="this.style.display='none'">`;
                } else {
                    avatars += `<div class="w-12 h-12 rounded-full border-2 border-white bg-purple-100 text-purple-700 font-black text-sm flex items-center justify-center z-10 relative">${i+1}</div>`;
                }
            } 
        });
        if(data.options.length > 4) avatars += `<div class="w-12 h-12 rounded-full border-2 border-white bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold shadow-sm z-20 relative">+${data.options.length-4}</div>`;
        avatars += '</div>';

        // --- ส่วนที่คุณถามมา จะอยู่ตรงนี้ (รวมอยู่ใน Card HTML เรียบร้อยแล้ว) ---
        const targetText = getTargetGroupText(data.allowed_voters);
        
        const targetBadge = `
            <div class="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full w-fit mb-3">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                ผู้มีสิทธิ์: ${targetText}
            </div>
        `;

        const card = document.createElement("div");
        card.className = `bg-white p-6 rounded-3xl shadow-sm border border-gray-100 fade-in ${hasVoted ? 'opacity-80' : ''}`;
        card.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex-1">
                    ${targetBadge} 
                    <h3 class="text-xl font-extrabold text-gray-900 mb-1 leading-tight">${data.title}</h3>
                    <p class="text-gray-500 text-sm mb-3 line-clamp-2">${data.description || ''}</p>
                    ${timeBadge}
                    ${!hasVoted && !isExpired ? avatars : ''}
                </div>
            </div>
            ${buttonHtml}
        `;
        list.appendChild(card);
        // ------------------------------------------------------------------
    }
}


function startCountdown(campaignId, targetTimeStr) {
    const end = new Date(targetTimeStr).getTime();
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

// ================= ระบบคูหาลงคะแนน (Virtual Booth) เปลี่ยนรูปเป็นเบอร์/กากบาท =================
window.enterBooth = function(campaignId) {
    currentBoothData = allCampaigns.find(c => c.id === campaignId);
    userSelectedOption = null;

    document.getElementById("view-home").classList.add("hidden");
    document.getElementById("view-booth").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.getElementById("boothCampaignTitle").innerText = currentBoothData.title;
    document.getElementById("boothCampaignDesc").innerText = currentBoothData.description || 'โปรดเลือกหมายเลขที่คุณต้องการเพียง 1 หมายเลข';
    document.getElementById("stickySubmitBar").classList.add("translate-y-full");
    document.getElementById("selectedCandidateName").innerText = "-";

    const grid = document.getElementById("candidatesGrid");
    grid.innerHTML = "";

    let displayOptions = [...currentBoothData.options];
    displayOptions.push({ name: "ไม่ประสงค์ลงคะแนน", image: null, isNoVote: true });

    displayOptions.forEach((opt, index) => {
        const isNoVote = opt.isNoVote === true;
        const numberLabel = isNoVote ? '' : `<div class="absolute top-0 left-0 bg-purple-700 text-white font-bold px-4 py-1.5 rounded-br-2xl rounded-tl-2xl text-sm shadow-md z-20">เบอร์ ${index + 1}</div>`;
        
        let visualContent = '';
        if (isNoVote) {
            visualContent = `<div class="w-full h-full flex items-center justify-center bg-red-50 text-red-500 rounded-full border-4 border-gray-50 shadow-inner"><svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M6 18L18 6M6 6l12 12"></path></svg></div>`;
        } else if (opt.image) {
            // ถ้ามีรูป แต่โหลดไม่ได้ ก็จะซ่อนรูปแล้วให้เห็นเบอร์พื้นหลังแทน
            visualContent = `<div class="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-gray-50 overflow-hidden shadow-inner relative bg-purple-50 flex items-center justify-center text-purple-300 font-black text-5xl">
                <span>${index + 1}</span>
                <img src="${opt.image}" class="w-full h-full object-cover absolute top-0 left-0 z-10" onerror="this.style.display='none'">
            </div>`;
        } else {
            // ถ้าไม่ได้ใส่ลิงก์รูปมาแต่แรก ให้แสดงเบอร์เด่นๆ
            visualContent = `<div class="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-purple-100 overflow-hidden shadow-inner bg-purple-50 flex items-center justify-center text-purple-700 font-black text-[3.5rem]">${index + 1}</div>`;
        }
        
        const policyBtn = isNoVote ? '' : `<button onclick="event.stopPropagation(); showPolicy('${opt.name}', '${opt.image || ''}')" class="w-full mt-4 bg-gray-100 hover:bg-purple-100 text-purple-700 text-xs font-bold py-2.5 rounded-xl transition-colors flex justify-center items-center gap-1 border border-gray-200"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> รายละเอียดเพิ่มเติม</button>`;

        const titleClass = isNoVote ? "text-red-500 font-extrabold mt-4" : "text-gray-900 font-bold mt-2";

        grid.innerHTML += `
            <div class="candidate-card bg-white rounded-3xl p-4 shadow-sm relative cursor-pointer flex flex-col items-center text-center fade-in" 
                 onclick="selectOption(this, '${opt.name}')" style="animation-delay: ${index * 0.05}s">
                ${numberLabel}
                <div class="absolute top-4 right-4 w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center check-circle transition-colors z-20 bg-white">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <div class="mt-4">${visualContent}</div>
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
    document.getElementById("selectedCandidateName").innerText = optName;
    document.getElementById("stickySubmitBar").classList.remove("translate-y-full");
}

window.showPolicy = function(name, imageUrl) {
    Swal.fire({
        title: name,
        html: `<p class="text-sm text-gray-500 mb-4">คลิกพื้นที่ว่างเพื่อปิดหน้าต่าง</p>`,
        imageUrl: imageUrl || null,
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
        
        await updateDoc(doc(db, "campaigns", campaignId), new FieldPath("votes_count", voteValue), increment(1));

        Swal.close();
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

    const refId = "MST-" + Math.random().toString(36).substr(2, 8).toUpperCase();
    const now = new Date();
    const timeStr = now.toLocaleDateString('th-TH') + " " + now.toLocaleTimeString('th-TH') + " น.";

    document.getElementById("receiptRef").innerText = refId;
    document.getElementById("receiptTime").innerText = timeStr;
    document.getElementById("receiptCampaignName").innerText = campaignName;
    document.getElementById("receiptVoterName").innerText = voterName;
}
