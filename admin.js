import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, addDoc, getDocs, onSnapshot, serverTimestamp, query, orderBy, updateDoc, doc, getDoc, deleteDoc, setDoc, writeBatch, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

window.liveResultListeners = {};
window.globalStudents = []; 
// 1. ใส่ API Key ที่ก๊อปปี้มาตรงนี้
const IMGBB_API_KEY = "ac0a29761a5fc56e8f2d555a85a58581"; 

// 2. ฟังก์ชันคุยหลังบ้านกับ ImgBB
async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("key", IMGBB_API_KEY);

    try {
        const response = await fetch("https://api.imgbb.com/1/upload", {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        
        if (data.success) {
            return data.data.url; // ถ้าสำเร็จ ส่งลิงก์รูปกลับมา
        } else {
            throw new Error(data.error.message);
        }
    } catch (error) {
        console.error("Upload Error:", error);
        return null;
    }
}
// 3. ฟังก์ชันจัดการเมื่อเลือกรูป (โชว์กำลังโหลด -> อัปโหลด -> โชว์รูป/ข้อความสำเร็จ)
window.handleImageUpload = async function(inputElem) {
    const file = inputElem.files[0];
    if (!file) return;

    // หาตำแหน่งของช่องต่างๆ เพื่อเปลี่ยนหน้าตา 
    const wrapper = inputElem.closest('.image-upload-wrapper');
    const statusDiv = wrapper.querySelector('.upload-status');
    const previewDiv = wrapper.querySelector('.image-preview');
    const hiddenInput = wrapper.querySelector('.opt-img');
    const uploadBtn = wrapper.querySelector('.upload-btn');
    const removeBtn = wrapper.querySelector('.remove-img-btn');

    // ⏳ สถานะ: เปลี่ยนข้อความและกรอบเป็น "กำลังอัปโหลด" (ใช้ SVG แบบหมุน)
    statusDiv.innerHTML = `
        <span class="flex items-center justify-center gap-1.5 text-blue-500 font-bold">
            <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            กำลังอัปโหลด...
        </span>`;
    uploadBtn.disabled = true;

    // สั่งอัปโหลด
    const imageUrl = await uploadToImgBB(file);
    
    // ตรวจสอบผลลัพธ์
    if (imageUrl) {
        hiddenInput.value = imageUrl; // แอบเก็บ URL ไว้รอกด Submit
        previewDiv.style.backgroundImage = `url('${imageUrl}')`;
        previewDiv.classList.remove('hidden'); 
        removeBtn.classList.remove('hidden');
        
        // ✅ สถานะ: สำเร็จ (SVG เครื่องหมายถูก)
        statusDiv.innerHTML = `
            <span class="flex items-center justify-center gap-1.5 text-green-500 font-bold">
                <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                อัปโหลดสำเร็จ
            </span>`;
    } else {
        // ❌ สถานะ: ล้มเหลว (SVG เครื่องหมายตกใจ)
        statusDiv.innerHTML = `
            <span class="flex items-center justify-center gap-1.5 text-red-500 font-bold">
                <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                อัปโหลดไม่สำเร็จ
            </span>`;
    }
    
    uploadBtn.disabled = false;
};
// 4. ฟังก์ชันเมื่อกดลบรูปภาพ
window.removeImage = function(btnElem) {
    const wrapper = btnElem.closest('.image-upload-wrapper');
    const previewDiv = wrapper.querySelector('.image-preview');
    const hiddenInput = wrapper.querySelector('.opt-img');
    const statusDiv = wrapper.querySelector('.upload-status');
    const fileInput = wrapper.querySelector('.opt-img-file');
    
    hiddenInput.value = ''; 
    fileInput.value = ''; 
    previewDiv.style.backgroundImage = ''; 
    previewDiv.classList.add('hidden'); 
    btnElem.classList.add('hidden'); 
    
    // 🗑️ สถานะ: ลบแล้ว (SVG ขีดฆ่า/รีเซ็ต)
    statusDiv.innerHTML = `
        <span class="flex items-center justify-center gap-1.5 text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4l16 16M4 20L20 4"></path></svg>
            นำรูปออกแล้ว
        </span>`;
};
// แม่แบบ HTML ของตัวเลือกการโหวต (ปรับ Badge ให้กว้างขึ้นเพื่อรองรับคำว่า "หมายเลข")
const getOptionTemplate = (name = "", imgUrl = "", index = 1) => {
    const hasImage = imgUrl ? true : false;
    const showPreview = hasImage ? "" : "hidden";
    const bgStyle = hasImage ? `background-image: url('${imgUrl}');` : "";
    
    // ล็อกตัวเลือกที่ 1 และ 2 ไม่ให้มีปุ่มลบ
    const isLocked = index <= 2;
    const removeBtnHtml = isLocked ? '' : `
        <button type="button" onclick="this.closest('.option-group').remove(); updateOptionNumbers();" class="text-red-400 bg-red-50 p-1.5 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors shrink-0">
            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;
    
    return `
        <div class="flex items-center justify-between mb-2">
            <div class="bg-purple-600 text-white px-2.5 py-1 rounded-lg flex items-center justify-center font-bold text-[10px] shadow-sm opt-num-badge">
                หมายเลข ${index}
            </div>
            ${removeBtnHtml}
        </div>
        
        <input type="text" class="opt-name w-full border-b-2 border-gray-100 pb-1 mb-3 focus:outline-none focus:border-purple-600 text-sm font-bold mt-1 px-1" value="${name}" placeholder="ชื่อผู้สมัคร / ชื่อตัวเลือก" required>
        
        <div class="image-upload-wrapper mt-2 bg-gray-50 p-3 rounded-lg border border-gray-200 border-dashed">
            <input type="file" accept="image/*" class="opt-img-file hidden" onchange="handleImageUpload(this)">
            <div class="flex gap-2 relative z-10">
                <button type="button" onclick="this.parentElement.previousElementSibling.click()" class="upload-btn flex-1 bg-white border border-gray-200 hover:border-purple-400 hover:text-purple-600 text-gray-700 text-xs px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5 shadow-sm font-semibold">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> 
                    เลือกรูปภาพ
                </button>
                <button type="button" onclick="removeImage(this)" title="ลบรูป" class="remove-img-btn bg-red-50 hover:bg-red-100 text-red-500 px-3 py-2 rounded-md transition-colors ${showPreview} flex items-center justify-center">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
            <div class="upload-status text-xs mt-2 text-gray-500 text-center flex items-center justify-center gap-1.5">
                ${hasImage ? '<span class="text-blue-500 font-bold">ใช้รูปเดิม</span>' : '<span>รองรับ JPG, PNG</span>'}
            </div>
            <div class="image-preview w-full h-32 mt-3 ${showPreview} rounded-md border border-gray-200 bg-center bg-no-repeat bg-contain bg-white shadow-inner" style="${bgStyle}"></div>
            <input type="hidden" class="opt-img" value="${imgUrl}">
        </div>
    `;
};

// ฟังก์ชันอัปเดตเลขลำดับ (เพิ่มคำว่าหมายเลขเข้าไปด้วย)
window.updateOptionNumbers = function() {
    document.querySelectorAll('.option-group').forEach((group, idx) => {
        const badge = group.querySelector('.opt-num-badge');
        if (badge) badge.innerText = "หมายเลข " + (idx + 1);
    });
};

// ฟังก์ชันอัปเดตเลขลำดับเวลาลบตัวเลือก (ใส่เพิ่มลงไปใน admin.js)
window.updateOptionNumbers = function() {
    document.querySelectorAll('.option-group').forEach((group, idx) => {
        const badge = group.querySelector('.opt-num-badge');
        if (badge) badge.innerText = "หมายเลข " + (idx + 1);
    });
};

// ฟังก์ชันเปลี่ยนหน้าจอเป็น Error พร้อมปุ่มย้อนกลับ (ปรับ UI ตรงกลางแล้ว)
function showAuthError(title, desc) {
    const loadingDiv = document.getElementById("auth-loading");
    const contentDiv = document.getElementById("auth-content");
    
    if (loadingDiv) loadingDiv.style.display = 'none'; // ซ่อนตัวโหลด
    
    // สร้าง HTML ชุดใหม่ที่จัดกึ่งกลางสมบูรณ์แบบ
    const errorHtml = `
        <div class="flex flex-col items-center justify-center w-full fade-in mt-2">
            <div class="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-5 border-4 border-red-100 mx-auto shadow-sm">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>
            </div>
            
            <h2 class="text-2xl font-black text-gray-800 mb-2 text-center tracking-tight">${title}</h2>
            <p class="text-gray-500 mb-8 text-sm text-center leading-relaxed">${desc}</p>
            
            <button id="authBackBtn" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-2 border border-gray-200 shadow-sm active:scale-95">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg> 
                กลับไปหน้าแรก
            </button>
        </div>
    `;
    
    // ป้องกันการสร้างกล่อง Error ซ้ำซ้อน
    if (!document.getElementById("error-wrapper-ui")) {
        const errorWrapper = document.createElement("div");
        errorWrapper.id = "error-wrapper-ui";
        errorWrapper.className = "w-full";
        errorWrapper.innerHTML = errorHtml;
        contentDiv.appendChild(errorWrapper);

        // ผูกคำสั่งปุ่มย้อนกลับให้ Logout
        document.getElementById("authBackBtn").addEventListener("click", () => {
            signOut(auth).then(() => window.location.href = "index.html");
        });
    }
}

// ตรวจสอบสิทธิ์
onAuthStateChanged(auth, (user) => {
    const blocker = document.getElementById("auth-blocker");

    if (!user) { 
        window.location.href = "index.html"; 
    } 
    else if (user.email !== "studentcouncil@mst.ac.th") {
        // ไม่มีสิทธิ์ -> เปลี่ยนหน้าจอโหลดเป็นหน้าจอ Error
        showAuthError("ปฏิเสธการเข้าถึง", "บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้าระบบจัดการแอดมิน");
    } else { 
        // มีสิทธิ์ (แอดมิน) -> ซ่อนม่านบังหน้าจอ
        if(blocker) {
            blocker.classList.add("opacity-0");
            setTimeout(() => blocker.classList.add("hidden"), 300);
        }
        if(document.getElementById("adminEmail")) document.getElementById("adminEmail").innerText = `${user.email}`; 
        checkStudentCount(); 
    }
});


// ฟังก์ชันออกจากระบบ
const handleLogout = () => {
    Swal.fire({ 
        title: 'ออกจากระบบ?', 
        icon: 'question', 
        showCancelButton: true, 
        confirmButtonColor: '#d33',
        confirmButtonText: 'ยืนยัน', 
        cancelButtonText: 'ยกเลิก' 
    }).then((r) => { 
        if (r.isConfirmed) signOut(auth).then(() => window.location.href = "index.html"); 
    });
};

// ผูกคำสั่งให้ทำงานทั้งปุ่มบนคอมและปุ่มบนมือถือ
document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
document.getElementById("mobileLogoutBtn")?.addEventListener("click", handleLogout);


// ================= ระบบแสดงฟอร์มเต็มจอ =================
window.showCreateForm = function() {
    document.getElementById('campaignListView').classList.add('hidden');
    document.getElementById('campaignFormView').classList.remove('hidden');
    document.getElementById("createCampaignForm").reset();
    document.getElementById("editingId").value = "";
    document.getElementById("customLevelContainer").classList.add("hidden"); 
    document.getElementById("customRoomContainer").classList.add("hidden");
    document.getElementById("formTitle").innerHTML = `<div class="p-2 bg-purple-100 text-purple-600 rounded-xl"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div> สร้างรายการใหม่`; 
    document.getElementById("submitCampaignBtn").innerHTML = "บันทึกและเปิดระบบ";
    // เตรียมกรอบเปล่าๆ ให้ 2 ตัวเลือกเมื่อกดสร้างแคมเปญใหม่
    document.getElementById("optionsContainer").innerHTML = `
        <div class="option-group bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group mt-3">
            ${getOptionTemplate('', '', 1)}
        </div>
        <div class="option-group bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group mt-3">
            ${getOptionTemplate('', '', 2)}
        </div>
    `;
};

window.hideCreateForm = function() {
    document.getElementById('campaignFormView').classList.add('hidden');
    document.getElementById('campaignListView').classList.remove('hidden');
};

document.getElementById("voterTargetType")?.addEventListener("change", (e) => {
    document.getElementById("customLevelContainer").classList.add("hidden");
    document.getElementById("customRoomContainer").classList.add("hidden");
    if(e.target.value === "custom_level") document.getElementById("customLevelContainer").classList.remove("hidden");
    if(e.target.value === "custom_room") document.getElementById("customRoomContainer").classList.remove("hidden");
});

const optionsContainer = document.getElementById("optionsContainer");
document.getElementById("addOptionBtn")?.addEventListener("click", () => {
    const currentCount = document.querySelectorAll(".option-group").length;
    const div = document.createElement("div");
    div.className = "option-group bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group mt-3";
    div.innerHTML = getOptionTemplate('', '', currentCount + 1);
    document.getElementById("optionsContainer").appendChild(div);
});

optionsContainer?.addEventListener("click", (e) => {
    if (e.target.closest('.remove-btn')) e.target.closest('.option-group').remove();
});

document.getElementById("bulkAddBtn")?.addEventListener("click", () => {
    Swal.fire({
        title: 'นำเข้าข้อมูลจาก Google Sheets',
        html: `<textarea id="bulkPasteArea" class="w-full h-40 p-2 border border-gray-300 rounded-lg text-xs" placeholder="นาย ก [Tab] https://..."></textarea>`,
        showCancelButton: true, confirmButtonText: 'นำเข้าข้อมูล',
        preConfirm: () => document.getElementById("bulkPasteArea").value
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            let addedCount = 0;
            result.value.split('\n').forEach(line => {
                const cols = line.split('\t'); const name = cols[0]?.trim(); const img = cols[1]?.trim() || "";
                if (name) {
                    const div = document.createElement("div"); div.className = "option-group bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group mt-3";
                    div.innerHTML = `<button type="button" class="absolute top-2 right-2 text-red-500 bg-red-50 p-1.5 rounded-md remove-btn"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button><input type="text" class="opt-name w-full border-b-2 border-gray-100 pb-1 mb-2 focus:outline-none focus:border-purple-600 text-sm font-bold" value="${name}" required><input type="url" class="opt-img w-full text-xs text-gray-500 focus:outline-none bg-gray-50 p-2 rounded-md" value="${img}">`;
                    optionsContainer.appendChild(div); addedCount++;
                }
            });
            if (addedCount > 0) {
                optionsContainer.querySelectorAll(".option-group").forEach(g => { if(g.querySelector(".opt-name").value.trim() === "") g.remove(); });
                Swal.fire('สำเร็จ', `นำเข้า ${addedCount} รายการ`, 'success');
            }
        }
    });
});

function formatImageUrl(url) {
    if (!url) return "";
    const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)/);
    return gdMatch ? `https://drive.google.com/uc?export=view&id=${gdMatch[1]}` : url;
}

document.getElementById("createCampaignForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editingId = document.getElementById("editingId").value;
    const payload = { 
        title: document.getElementById("title").value, 
        description: document.getElementById("desc").value, 
        startTime: document.getElementById("startTime").value || null,
        endTime: document.getElementById("endTime").value || null, 
        allowed_voters: { type: document.getElementById("voterTargetType").value, values: [] } 
    };

    if (payload.allowed_voters.type === "custom_level") {
        payload.allowed_voters.values = Array.from(document.querySelectorAll("input[name='targetLevel']:checked")).map(cb => cb.value);
        if(!payload.allowed_voters.values.length) return Swal.fire('แจ้งเตือน', 'เลือกระดับชั้นอย่างน้อย 1 ระดับ', 'warning');
    } else if (payload.allowed_voters.type === "custom_room") {
        payload.allowed_voters.values = document.getElementById("customRoomInput").value.split(",").map(r => r.trim()).filter(r => r);
        if(!payload.allowed_voters.values.length) return Swal.fire('แจ้งเตือน', 'ระบุห้องเรียนอย่างน้อย 1 ห้อง', 'warning');
    }

    let optionsData = []; let initialVotes = {};
    document.querySelectorAll(".option-group").forEach(group => {
        const name = group.querySelector(".opt-name").value.trim();
        if (name) { optionsData.push({ name: name, image: formatImageUrl(group.querySelector(".opt-img").value.trim()) }); initialVotes[name] = 0; }
    });
    if (optionsData.length < 2) return Swal.fire('ผิดพลาด', 'ต้องมีอย่างน้อย 2 ตัวเลือก', 'error');
    payload.options = optionsData;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (editingId) {
            const campRef = doc(db, "campaigns", editingId);
            const oldVotes = (await getDoc(campRef)).data().votes_count || {};
            optionsData.forEach(opt => { if (oldVotes[opt.name] !== undefined) initialVotes[opt.name] = oldVotes[opt.name]; });
            payload.votes_count = initialVotes;
            await updateDoc(campRef, payload);
        } else {
            payload.votes_count = initialVotes; payload.status = "open"; payload.createdAt = serverTimestamp();
            await addDoc(collection(db, "campaigns"), payload);
        }
        Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
        hideCreateForm(); loadCampaigns();
    } catch (error) { Swal.fire('ผิดพลาด', 'บันทึกไม่ได้', 'error'); }
});

window.editCampaign = async function(campaignId) {
    Swal.fire({ title: 'กำลังดึงข้อมูล...', didOpen: () => Swal.showLoading() });
    try {
        const data = (await getDoc(doc(db, "campaigns", campaignId))).data();
        showCreateForm();
        document.getElementById("editingId").value = campaignId;
        document.getElementById("title").value = data.title;
        document.getElementById("desc").value = data.description || "";
        document.getElementById("startTime").value = data.startTime || "";
        document.getElementById("endTime").value = data.endTime || "";
        
        if(data.allowed_voters) {
            document.getElementById("voterTargetType").value = data.allowed_voters.type;
            document.getElementById("voterTargetType").dispatchEvent(new Event('change'));
            if(data.allowed_voters.type === 'custom_level') { document.querySelectorAll("input[name='targetLevel']").forEach(cb => cb.checked = data.allowed_voters.values.includes(cb.value)); } 
            else if(data.allowed_voters.type === 'custom_room') { document.getElementById("customRoomInput").value = data.allowed_voters.values.join(", "); }
        }

        optionsContainer.innerHTML = "";
        data.options.forEach((opt, idx) => {
            const div = document.createElement("div"); 
            div.className = "option-group bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group mt-3";
            div.innerHTML = getOptionTemplate(opt.name, opt.image, idx + 1); 
            optionsContainer.appendChild(div);
        });

        document.getElementById("formTitle").innerHTML = `<div class="p-2 bg-yellow-100 text-yellow-600 rounded-xl"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></div> แก้ไขรายการ`; 
        Swal.close();
    } catch (error) { Swal.fire('ผิดพลาด', 'ดึงข้อมูลไม่ได้', 'error'); }
}

window.loadCampaigns = async function() {
    const list = document.getElementById("campaignList");
    if(!list) return;
    list.innerHTML = '<div class="flex justify-center p-20"><div class="animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-purple-600"></div></div>';
    
    try {
        const q = query(collection(db, "campaigns"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        let allData = []; let active = 0;
        
        snapshot.forEach(docSnap => {
            let data = docSnap.data(); allData.push({id: docSnap.id, ...data});
            if(data.status === "open") active++;
        });

        if(document.getElementById("statActiveCampaigns")) document.getElementById("statActiveCampaigns").innerHTML = active;
        if(document.getElementById("statTotalCampaigns")) document.getElementById("statTotalCampaigns").innerHTML = allData.length;

        // อัปเดตกล่อง Dashboard สถานะล่าสุด
        updateDashboardLiveStats(allData);

                const render = (dataList) => {
            list.innerHTML = dataList.length ? "" : '<div class="text-center p-10 text-gray-500">ไม่พบรายการ</div>';
            dataList.forEach(data => {
                let badge = `<span class="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded font-bold">ทุกคน</span>`;
                if(data.allowed_voters && data.allowed_voters.type !== 'all') badge = `<span class="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded font-bold">เฉพาะกลุ่ม</span>`;
                
                let statusDot = data.status === "open" ? '<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block mr-1"></span>เปิดโหวต' : '<span class="w-2 h-2 rounded-full bg-gray-400 inline-block mr-1"></span>ปิดโหวต';
                
                // จัดรูปแบบวันที่
                const formatTime = (timeStr) => {
                    if(!timeStr) return "ไม่ระบุ";
                    return new Date(timeStr).toLocaleString('th-TH', { 
                        day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                    }) + " น.";
                };
                const timeInfo = `
                    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100 w-fit">
                        <div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> <b>เริ่ม:</b> ${formatTime(data.startTime)}</div>
                        <div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> <b>สิ้นสุด:</b> ${formatTime(data.endTime)}</div>
                    </div>
                `;

                // จัดการรูปภาพ
                let avatars = '<div class="flex -space-x-3 mt-3">';
                data.options.forEach((o, i) => { 
                    if(i < 5) {
                        if (o.image) {
                            avatars += `
                            <div class="relative w-10 h-10 rounded-full border-2 border-white shadow-sm z-10 flex items-center justify-center bg-purple-50 text-purple-700 font-black text-sm overflow-hidden" title="${o.name}">
                                <span>${i+1}</span>
                                <img src="${o.image}" class="absolute inset-0 w-full h-full object-cover" onerror="this.style.display='none'">
                            </div>`;
                        } else {
                            avatars += `<div class="relative w-10 h-10 rounded-full border-2 border-white shadow-sm z-10 flex items-center justify-center bg-purple-100 text-purple-700 font-black text-sm" title="${o.name}">${i+1}</div>`;
                        }
                    } 
                });
                if(data.options.length > 5) avatars += `<div class="relative w-10 h-10 rounded-full border-2 border-white bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold shadow-sm z-20">+${data.options.length-5}</div>`;
                avatars += '</div>';

                list.innerHTML += `
                    <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:border-purple-300 transition-colors flex flex-col md:flex-row justify-between gap-4">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">${badge} <span class="text-xs font-bold text-gray-500">${statusDot}</span></div>
                            <h3 class="font-extrabold text-lg text-gray-900">${data.title}</h3>
                            <p class="text-sm text-gray-500 truncate max-w-md">${data.description || 'ไม่มีคำอธิบาย'}</p>
                            ${timeInfo}
                            ${avatars}
                        </div>
                        <div class="flex md:flex-col gap-2 shrink-0 md:w-32 justify-center mt-0 md:mt-0">
                            <button onclick="viewResults('${data.id}')" class="w-full text-xs font-bold bg-purple-100 text-purple-700 py-2 rounded-lg hover:bg-purple-200">ผลคะแนน</button>
                            <button onclick="editCampaign('${data.id}')" class="w-full text-xs font-bold bg-yellow-50 text-yellow-700 py-2 rounded-lg hover:bg-yellow-100 border border-yellow-200">แก้ไข</button>
                            <button onclick="toggleStatus('${data.id}', '${data.status}')" class="w-full text-xs font-bold bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 border">${data.status==="open"?"ปิดระบบ":"เปิดระบบ"}</button>
                            <button onclick="deleteCampaign('${data.id}')" class="w-full text-xs font-bold text-red-500 py-2 rounded-lg hover:bg-red-50">ลบ</button>
                        </div>
                    </div>
                    <div id="results_${data.id}" class="hidden mt-2 bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-inner"></div>
                `;
            });
        };

        render(allData);

        const search = document.getElementById("adminSearchInput");
        if(search) search.addEventListener("input", (e) => render(allData.filter(c => c.title.toLowerCase().includes(e.target.value.toLowerCase()))));
    } catch (e) { }
}

async function updateDashboardLiveStats(campaigns) {
    const statsContainer = document.getElementById("liveVotingStats");
    if(!statsContainer) return;

    let activeCamps = campaigns.filter(c => c.status === "open");
    if(activeCamps.length === 0) {
        statsContainer.innerHTML = '<div class="text-center p-4 text-gray-400 font-medium">ไม่มีรายการเลือกตั้งที่เปิดอยู่</div>';
        return;
    }

    statsContainer.innerHTML = '';
    for(const camp of activeCamps) {
        let totalVoters = 0;
        let eligibleCount = 0;
        
        // เช็คคนที่มีสิทธิ์
        if(window.globalStudents && window.globalStudents.length > 0) {
            eligibleCount = window.globalStudents.filter(s => isStudentEligible(camp.allowed_voters, s)).length;
        }

        // นับคะแนนทั้งหมดจาก votes_count
        if (camp.votes_count) {
            Object.values(camp.votes_count).forEach(count => {
                if (typeof count === 'number') totalVoters += count;
            });
        }

        let percent = eligibleCount > 0 ? Math.round((totalVoters / eligibleCount) * 100) : 0;
        
        statsContainer.innerHTML += `
            <div class="mb-4 last:mb-0 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-gray-800 text-sm truncate pr-2">${camp.title}</span>
                    <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">${totalVoters} / ${eligibleCount} คน</span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-2.5">
                    <div class="bg-gradient-to-r from-blue-500 to-indigo-500 h-2.5 rounded-full" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }
}

window.toggleStatus = async function(id, status) {
    try { await updateDoc(doc(db, "campaigns", id), { status: status === "open" ? "closed" : "open" }); loadCampaigns(); } catch (e) {}
}
window.deleteCampaign = async function(id) {
    Swal.fire({ title: 'ยืนยันการลบ', text: "หากลบแล้ว ข้อมูลคะแนนจะหายไปตลอดกาล", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ลบทิ้งเลย' })
    .then(async (result) => {
        if (result.isConfirmed) {
            await deleteDoc(doc(db, "campaigns", id)); loadCampaigns(); 
        }
    });
}

// ... ส่วนนักเรียนคงเดิม ...
async function checkStudentCount() {
    try { 
        const snapshot = await getDocs(collection(db, "students"));
        window.globalStudents = []; 
        let levels = new Set();
        let roomNums = new Set();
        let lastUpdated = null; 

        snapshot.forEach(docSnap => { 
            let d = docSnap.data(); 
            window.globalStudents.push({ id: docSnap.id, ...d }); 
            if(d.level) levels.add(d.level);
            if(d.room) {
                let rNum = d.room.includes('/') ? d.room.split('/')[1] : d.room.replace(/\D/g,'');
                if(rNum) roomNums.add(rNum);
            }
            if (d.updated_at && (!lastUpdated || d.updated_at.toMillis() > lastUpdated.toMillis())) lastUpdated = d.updated_at;
        });

        if(document.getElementById("statTotalStudents")) document.getElementById("statTotalStudents").innerHTML = window.globalStudents.length;
        let dateStr = "ยังไม่มีข้อมูล"; 
        if (lastUpdated) dateStr = lastUpdated.toDate().toLocaleString('th-TH');
        
        if(document.getElementById("lastUpdatedText")) {
            document.getElementById("lastUpdatedText").innerHTML = `มีนักเรียนในระบบ: <b class="text-indigo-600 text-lg">${window.globalStudents.length}</b> คน<br><span class="text-xs text-gray-500 mt-1 block">อัปเดตล่าสุด: ${dateStr}</span>`;
        }
        
        const levelFilter = document.getElementById("studentLevelFilter");
        if(levelFilter) {
            levelFilter.innerHTML = '<option value="all">ทุกระดับชั้น</option>';
            Array.from(levels).sort().forEach(l => { levelFilter.innerHTML += `<option value="${l}">ชั้น ${l}</option>`; });
        }
        const roomFilter = document.getElementById("studentRoomFilter");
        if(roomFilter) {
            roomFilter.innerHTML = '<option value="all">ทุกห้องเรียน</option>';
            Array.from(roomNums).sort((a,b) => a - b).forEach(r => { roomFilter.innerHTML += `<option value="${r}">ห้อง ${r}</option>`; });
        }
        renderStudentTable();
        loadCampaigns(); // โหลดใหม่เพื่อให้สถิติโหวตทำงาน
        checkSystemHealth();
    } catch (e) { 
        if(document.getElementById("lastUpdatedText")) document.getElementById("lastUpdatedText").innerText = "โหลดข้อมูลผิดพลาด"; 
    }
}

// ... คงฟังก์ชัน Table และ Import ...
window.renderStudentTable = function() {
    const tbody = document.getElementById("studentTableBody");
    if (!tbody || !window.globalStudents) return;

    let kw = document.getElementById("studentSearchInput")?.value.toLowerCase() || "";
    let levelKw = document.getElementById("studentLevelFilter")?.value || "all";
    let roomKw = document.getElementById("studentRoomFilter")?.value || "all";

    let filtered = window.globalStudents.filter(s => {
        let matchKw = s.id.includes(kw) || s.name.toLowerCase().includes(kw);
        let matchLevel = (levelKw === "all") || (s.level === levelKw);
        let sRoomNum = s.room ? (s.room.includes('/') ? s.room.split('/')[1] : s.room.replace(/\D/g,'')) : "";
        let matchRoom = (roomKw === "all") || (sRoomNum === roomKw);
        return matchKw && matchLevel && matchRoom;
    }).sort((a, b) => a.id.localeCompare(b.id));

    let html = "";
    filtered.forEach(s => {
        let displayRoom = s.room ? (s.room.includes('/') ? s.room.split('/')[1] : s.room.replace(/\D/g,'')) : "-";
        html += `<tr class="hover:bg-indigo-50/50 transition-colors group">
            <td class="p-4 border-b font-mono font-bold text-indigo-600">${s.id}</td>
            <td class="p-4 border-b text-gray-800 font-medium">${s.name}</td>
            <td class="p-4 border-b text-center text-gray-600">ชั้น ${s.level}</td>
            <td class="p-4 border-b text-center font-bold text-gray-700">ห้อง ${displayRoom}</td>
            <td class="p-4 border-b text-center"><button onclick="deleteSingleStudent('${s.id}')" class="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 shadow-sm">ลบ</button></td>
        </tr>`;
    });
    tbody.innerHTML = filtered.length ? html : `<tr><td colspan="5" class="p-10 text-center text-gray-500 bg-gray-50 font-bold rounded-b-2xl">ไม่พบรายชื่อที่ค้นหา</td></tr>`;
};

document.getElementById("studentSearchInput")?.addEventListener("input", renderStudentTable);
document.getElementById("studentLevelFilter")?.addEventListener("change", renderStudentTable);
document.getElementById("studentRoomFilter")?.addEventListener("change", renderStudentTable);

document.getElementById("addSingleStudentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("singleStuId").value.trim();
    const name = document.getElementById("singleStuName").value.trim();
    const level = document.getElementById("singleStuLevel").value;
    const roomNum = document.getElementById("singleStuRoom").value.trim();
    const levelNum = level.replace("ม.", "");
    const formattedRoom = `ม.${levelNum}/${roomNum}`;
    
    try {
        Swal.fire({ title: 'กำลังเพิ่ม...', didOpen: () => Swal.showLoading() });
        await setDoc(doc(db, "students", id), { name, level, room: formattedRoom, updated_at: serverTimestamp() });
        Swal.fire('สำเร็จ', `เพิ่ม ${name} เข้าระบบแล้ว`, 'success');
        document.getElementById("addSingleStudentForm").reset();
        checkStudentCount();
    } catch(err) { Swal.fire('ผิดพลาด', 'ไม่สามารถเพิ่มได้', 'error'); }
});

window.deleteSingleStudent = async function(id) {
    if(confirm(`ยืนยันการลบรหัสนักเรียน ${id} ใช่หรือไม่?`)) {
        await deleteDoc(doc(db, "students", id)); checkStudentCount();
    }
};

// ================= 1. ระบบนำเข้าไฟล์ Excel เอง (ซิงค์รายชื่อ + ข้ามชีทซ่อน) =================
document.getElementById("importStudentsBtn")?.addEventListener("click", async () => {
    const file = document.getElementById("excelFileInput").files[0];
    if (!file) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์ก่อน', 'warning');
    Swal.fire({ title: 'กำลังเริ่มการซิงค์ข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            let all = [];
            
            wb.SheetNames.forEach((sn, index) => {
                // เช็กว่าชีทถูกซ่อนหรือไม่ ถ้าซ่อนให้ข้ามไป
                const sheetInfo = wb.Workbook?.Sheets?.[index];
                if (sheetInfo && sheetInfo.Hidden) return; 
                
                let currentLevel = "ไม่ระบุ"; 
                let match = sn.match(/[mม]\.?\s*(\d)/i); 
                if(match) currentLevel = `ม.${match[1]}`;
                
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
                let currentRoom = "ไม่ระบุ";
                
                rows.forEach(r => {
                    let roomMatchCell = r.find(c => typeof c==='string' && c.match(/\d+\s?\/\s?\d+/));
                    if(roomMatchCell) {
                        let cleanRoom = roomMatchCell.match(/\d+\s?\/\s?\d+/)[0].replace(/\s/g, '');
                        currentLevel = `ม.${cleanRoom.split('/')[0]}`; 
                        currentRoom = `ม.${cleanRoom}`;
                    }
                    let idx = r.findIndex(c => /^\d{5}$/.test(c.toString().trim()));
                    if (idx !== -1) {
                        let fname = r[idx+2]||""; let lname = r[idx+3]||"";
                        let fn = (r.length > idx+4 && r[idx+4]) ? r[idx+4].toString().trim() : `${r[idx+1]||""}${fname} ${lname}`.trim();
                        
                        let inlineRoom = r.find(c => typeof c==='string' && c.match(/\d+\s?\/\s?\d+/)); 
                        if(inlineRoom) {
                            let cleanInlineRoom = inlineRoom.match(/\d+\s?\/\s?\d+/)[0].replace(/\s/g, '');
                            currentLevel = `ม.${cleanInlineRoom.split('/')[0]}`;
                            currentRoom = `ม.${cleanInlineRoom}`;
                        }

                        if(fn.length > 5) {
                            all.push({ id: r[idx].toString().trim(), name: fn.replace(/['"]/g, ''), room: currentRoom, level: currentLevel });
                        }
                    }
                });
            });

            let uniqueNewStudents = Array.from(new Map(all.map(item => [item.id, item])).values());
            if(!uniqueNewStudents.length) return Swal.fire('ผิดพลาด', 'ไม่พบรายชื่อในรูปแบบที่ถูกต้อง', 'error');

            // --- เริ่มระบบซิงค์ข้อมูล (เปรียบเทียบเก่า-ใหม่) ---
            const existingSnapshot = await getDocs(collection(db, "students"));
            const existingIds = existingSnapshot.docs.map(doc => doc.id);
            const newIdsSet = new Set(uniqueNewStudents.map(s => s.id));
            const idsToDelete = existingIds.filter(id => !newIdsSet.has(id)); // หาคนที่ไม่มีในไฟล์ใหม่

            let batch = writeBatch(db); 
            let count = 0;

            // 1. อัปเดตและเพิ่มคนใหม่
            for(let i=0; i<uniqueNewStudents.length; i++) {
                const s = uniqueNewStudents[i];
                batch.set(doc(db, "students", s.id), { name: s.name, room: s.room, level: s.level, updated_at: serverTimestamp() });
                count++; 
                if(count === 490) { await batch.commit(); batch = writeBatch(db); count = 0; }
            }

            // 2. ลบคนที่ไม่มีชื่อในไฟล์ใหม่ออก
            for(let i=0; i<idsToDelete.length; i++) {
                batch.delete(doc(db, "students", idsToDelete[i]));
                count++;
                if(count === 490) { await batch.commit(); batch = writeBatch(db); count = 0; }
            }

            await batch.commit();
            Swal.fire('ซิงค์ข้อมูลสำเร็จ', `อัปเดต/เพิ่ม: ${uniqueNewStudents.length} คน<br>ลบรายชื่อเก่าที่หายไป: ${idsToDelete.length} คน`, 'success');
            document.getElementById("excelFileInput").value = ""; 
            checkStudentCount();
        } catch (err) { Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการนำเข้า', 'error'); }
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById("deleteStudentsBtn")?.addEventListener("click", () => {
    Swal.fire({ title: 'ยืนยันล้างข้อมูล?', text: "รายชื่อทั้งหมดจะถูกลบ", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ลบทิ้งทั้งหมด' })
    .then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const snap = await getDocs(collection(db, "students"));
            let batch = writeBatch(db); let count = 0;
            snap.forEach(d => { batch.delete(doc(db, "students", d.id)); count++; if(count===490) { batch.commit(); batch = writeBatch(db); count=0; } });
            await batch.commit(); Swal.fire('สำเร็จ', 'ล้างข้อมูลแล้ว', 'success'); checkStudentCount();
        }
    });
});

// ================= ระบบแสดงผลและแก้บั๊ก "ชั้น อื่นๆ" =================
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

window.viewResults = async function(campaignId) {
    const resultDiv = document.getElementById(`results_${campaignId}`);
    if (!resultDiv.classList.contains('hidden')) { resultDiv.classList.add('hidden'); return; }
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = '<div class="text-center py-6 text-purple-700 font-bold animate-pulse">กำลังประมวลผลคะแนนและสถิติรายห้อง...</div>';

    const loadData = async () => {
        try {
            const docSnap = await getDoc(doc(db, "campaigns", campaignId));
            if (!docSnap.exists()) { resultDiv.innerHTML = '<div class="text-center text-red-500">ไม่พบข้อมูล</div>'; return; }

            const data = docSnap.data(); const votes = data.votes_count || {}; const title = data.title;
            
            // ใช้ Mapping จำระดับชั้นจากชื่อห้องโดยตรง แก้บั๊ก "อื่นๆ"
            let eligibleByRoom = {};
            let levelOfRoomMapping = {};
            if(window.globalStudents) {
                window.globalStudents.forEach(s => {
                    if(isStudentEligible(data.allowed_voters, s)) { 
                        let r = s.room || "ไม่ระบุ"; 
                        eligibleByRoom[r] = (eligibleByRoom[r] || 0) + 1; 
                        levelOfRoomMapping[r] = s.level || "อื่นๆ";
                    }
                });
            }

            const votersSnap = await getDocs(collection(db, "campaigns", campaignId, "voters"));
            let votedByRoom = {};
            votersSnap.forEach(v => { 
                let r = v.data().room || "ไม่ระบุ"; 
                votedByRoom[r] = (votedByRoom[r] || 0) + 1; 
                if(v.data().level) levelOfRoomMapping[r] = v.data().level;
            });

            let statsByLevel = {};
            let sortedRooms = Object.keys(eligibleByRoom).sort((a,b) => a.localeCompare(b, 'th', {numeric:true}));
            sortedRooms.forEach(r => {
                let level = levelOfRoomMapping[r] || 'อื่นๆ';
                if(!statsByLevel[level]) statsByLevel[level] = [];
                statsByLevel[level].push(r);
            });

            let resultHtml = `
                <div class="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
                    <h4 class="font-extrabold text-gray-800 text-lg">สรุปผลคะแนน</h4>
                    <div class="flex gap-2">
                        <button onclick="exportExcel('${campaignId}')" class="text-xs font-bold bg-green-100 hover:bg-green-200 text-green-700 px-4 py-2 rounded-lg hidden sm:block">ออกไฟล์ Excel</button>
                        <button onclick="exportPDF('${campaignId}')" class="text-xs font-bold bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg hidden sm:block">บันทึก PDF</button>
                    </div>
                </div>
                
                <div id="pdf-content-${campaignId}" class="bg-white p-4 rounded-xl">
                    <h2 class="text-center font-bold text-xl text-purple-900 mb-6 hidden print-title">${title}</h2>
                    <ul class="space-y-5 mb-8">
            `;
            
            let totalVotes = 0; const validVotes = [];
            Object.entries(votes).forEach(([option, count]) => {
                if (option.trim().length > 0 && typeof count === 'number' && !isNaN(count)) { totalVotes += count; validVotes.push([option, count]); }
            });

            validVotes.sort((a, b) => b[1] - a[1]).forEach(([option, count], index) => {
                const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
                const barColor = index === 0 && count > 0 ? "bg-gradient-to-r from-purple-500 to-indigo-500" : "bg-gray-400"; 
                resultHtml += `
                    <li>
                        <div class="flex justify-between text-sm mb-2"><span class="font-bold text-gray-800">${option}</span><span class="font-extrabold text-purple-700">${count} คะแนน <span class="text-gray-400 font-normal ml-1">(${percent}%)</span></span></div>
                        <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden"><div class="${barColor} h-3 rounded-full transition-all duration-1000 ease-out" style="width: ${percent}%"></div></div>
                    </li>
                `;
            });
            resultHtml += `</ul><div class="bg-blue-50 p-4 rounded-xl text-center font-bold text-blue-900">จำนวนผู้ใช้สิทธิ์ทั้งหมด: ${totalVotes} คน</div>`;

            let levels = Object.keys(statsByLevel).sort();
            if (levels.length > 0) {
                levels.forEach((level) => {
                    resultHtml += `
                        <div class="mt-8 pt-6 page-break-section">
                            <h4 class="font-bold text-gray-800 mb-4 bg-gray-50 p-2 rounded-lg text-center">สถิติการใช้สิทธิ์ ชั้น ${level}</h4>
                            <div class="rounded-xl border border-gray-200 overflow-hidden">
                                <table class="w-full text-sm text-left border-collapse">
                                    <thead class="bg-gray-100"><tr class="text-gray-600"><th class="p-3 border-b">ห้องเรียน</th><th class="p-3 border-b text-center">มีสิทธิ์ (คน)</th><th class="p-3 border-b text-center">มาโหวต</th><th class="p-3 border-b text-center">%</th></tr></thead>
                                    <tbody>
                    `;
                    statsByLevel[level].forEach(r => {
                        let eligible = eligibleByRoom[r]; let voted = votedByRoom[r] || 0;
                        let pct = eligible > 0 ? Math.round((voted/eligible)*100) : 0;
                        let pctColor = pct === 100 ? 'text-green-600' : (pct >= 50 ? 'text-blue-600' : 'text-red-500');
                        let cleanRoomForDisplay = r.includes('/') ? "ห้อง " + r.split('/')[1] : r;
                        resultHtml += `<tr class="hover:bg-gray-50"><td class="p-3 border-b font-bold text-gray-700">${cleanRoomForDisplay}</td><td class="p-3 border-b text-center">${eligible}</td><td class="p-3 border-b text-center font-black text-gray-900">${voted}</td><td class="p-3 border-b text-center font-bold ${pctColor}">${pct}%</td></tr>`;
                    });

                    let totalLevelEligible = statsByLevel[level].reduce((sum, r) => sum + eligibleByRoom[r], 0);
                    let totalLevelVoted = statsByLevel[level].reduce((sum, r) => sum + (votedByRoom[r] || 0), 0);
                    let totalLevelPct = totalLevelEligible > 0 ? Math.round((totalLevelVoted/totalLevelEligible)*100) : 0;
                    resultHtml += `
                                    <tr class="bg-indigo-50 font-bold"><td class="p-3 text-indigo-900">รวม ${level}</td><td class="p-3 text-center text-indigo-900">${totalLevelEligible}</td><td class="p-3 text-center text-indigo-900">${totalLevelVoted}</td><td class="p-3 text-center text-indigo-700">${totalLevelPct}%</td></tr>
                                </tbody></table>
                            </div>
                        </div>`;
                });
            }

            resultHtml += `</div>
                <div class="mt-6 text-center">
                    <button onclick="document.getElementById('results_${campaignId}').classList.add('hidden')" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors inline-block">ปิดหน้าต่างผลคะแนน</button>
                </div>
            `; 
            resultDiv.innerHTML = resultHtml;

        } catch (error) { resultDiv.innerHTML = '<div class="text-center py-4 text-red-500 font-bold">เกิดข้อผิดพลาดในการโหลดผลคะแนน</div>'; }
    };
    loadData(); 
}

window.exportExcel = async function(campaignId) {
    try {
        Swal.fire({ title: 'กำลังสร้างไฟล์...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
        const docSnap = await getDoc(doc(db, "campaigns", campaignId));
        if (docSnap.exists()) {
            const data = docSnap.data(); const votes = data.votes_count || {}; const safeTitle = data.title.replace(/[/\\?%*:|"<>]/g, '-'); 
            const wb = XLSX.utils.book_new();

            let totalVotes = 0; const validVotes = [];
            Object.entries(votes).forEach(([option, count]) => {
                if (option.trim().length > 0 && typeof count === 'number' && !isNaN(count)) { totalVotes += count; validVotes.push([option, count]); }
            });

            let summaryData = [ ["หัวข้อการลงคะแนน:", data.title], [""], ["--- สรุปคะแนนผู้สมัคร ---", "", ""], ["ตัวเลือก / ผู้สมัคร", "คะแนนโหวต (คน)", "เปอร์เซ็นต์ (%)"] ];
            validVotes.sort((a, b) => b[1] - a[1]).forEach(([option, count]) => {
                const percent = totalVotes === 0 ? 0 : ((count / totalVotes) * 100).toFixed(2);
                summaryData.push([option, count, percent + "%"]);
            });
            summaryData.push(["", "", ""]); summaryData.push(["รวมผู้ใช้สิทธิ์ทั้งหมด", totalVotes, "100%"]);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "สรุปผลโหวต");

            let eligibleByRoom = {}; let levelOfRoomMapping = {};
            if(window.globalStudents) { 
                window.globalStudents.forEach(s => { 
                    if(isStudentEligible(data.allowed_voters, s)) { 
                        let r = s.room || "ไม่ระบุ"; eligibleByRoom[r] = (eligibleByRoom[r] || 0) + 1; levelOfRoomMapping[r] = s.level || "อื่นๆ";
                    } 
                }); 
            }

            const votersSnap = await getDocs(collection(db, "campaigns", campaignId, "voters"));
            let votedByRoom = {}; votersSnap.forEach(v => { 
                let r = v.data().room || "ไม่ระบุ"; votedByRoom[r] = (votedByRoom[r] || 0) + 1; 
                if(v.data().level) levelOfRoomMapping[r] = v.data().level;
            });
            
            let statsByLevel = {};
            let sortedRooms = Object.keys(eligibleByRoom).sort((a,b) => a.localeCompare(b, 'th', {numeric:true}));
            sortedRooms.forEach(r => { let level = levelOfRoomMapping[r] || 'อื่นๆ'; if(!statsByLevel[level]) statsByLevel[level] = []; statsByLevel[level].push(r); });

            let levels = Object.keys(statsByLevel).sort();
            levels.forEach(level => {
                let levelData = [ [`สถิติการใช้สิทธิ์ ชั้น ${level}`], ["ห้องเรียน", "จำนวนผู้มีสิทธิ์ (คน)", "มาใช้สิทธิ์ (คน)", "คิดเป็นเปอร์เซ็นต์ (%)"] ];
                let totalLevelEligible = 0; let totalLevelVoted = 0;
                statsByLevel[level].forEach(r => {
                    let eligible = eligibleByRoom[r]; let voted = votedByRoom[r] || 0; let pct = eligible > 0 ? ((voted/eligible)*100).toFixed(2) : 0;
                    totalLevelEligible += eligible; totalLevelVoted += voted; 
                    let cleanRoomForDisplay = r.includes('/') ? "ห้อง " + r.split('/')[1] : r;
                    levelData.push([cleanRoomForDisplay, eligible, voted, pct + "%"]);
                });
                let totalPct = totalLevelEligible > 0 ? ((totalLevelVoted/totalLevelEligible)*100).toFixed(2) : 0;
                levelData.push(["", "", "", ""]); levelData.push([`รวม ${level}`, totalLevelEligible, totalLevelVoted, totalPct + "%"]);
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(levelData), `สถิติ_${level}`);
            });
            XLSX.writeFile(wb, `ผลโหวต_${safeTitle}.xlsx`); Swal.close();
        }
    } catch (error) { Swal.fire('ผิดพลาด', 'สร้างไฟล์ Excel ไม่สำเร็จ', 'error'); }
}

window.exportPDF = async function(campaignId) {
    try {
        Swal.fire({ title: 'กำลังสร้างไฟล์ PDF...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
        const docSnap = await getDoc(doc(db, "campaigns", campaignId));
        let title = "รายงานผลคะแนน"; if (docSnap.exists()) title = docSnap.data().title.replace(/[/\\?%*:|"<>]/g, '-');
        const element = document.getElementById(`pdf-content-${campaignId}`);
        element.querySelector('.print-title').classList.remove('hidden');
        const opt = { margin: 10, filename: `ผลโหวต_${title}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } };
        html2pdf().set(opt).from(element).save().then(() => { element.querySelector('.print-title').classList.add('hidden'); Swal.close(); });
    } catch (error) { Swal.fire('ผิดพลาด', 'บันทึก PDF ไม่สำเร็จ', 'error'); }
}

window.viewImage = function(e, imageUrl, title) {
    e.preventDefault(); e.stopPropagation();
    Swal.fire({ title: title, imageUrl: imageUrl, imageAlt: title, showCloseButton: true, showConfirmButton: false, customClass: { image: 'rounded-xl object-contain max-h-[70vh]' } });
}
// ... โค้ดด้านบนคงเดิม ...

// เพิ่มฟังก์ชันตรวจสอบสถานะเซิร์ฟเวอร์
async function checkSystemHealth() {
    const statusEl = document.getElementById("systemHealthStatus");
    const msgEl = document.getElementById("systemHealthMsg");
    const iconEl = document.getElementById("systemHealthIcon");
    
    if (!statusEl || !msgEl) return;

    if (!navigator.onLine) {
        statusEl.innerHTML = `<span class="w-3 h-3 rounded-full bg-red-500"></span><span class="font-bold text-red-600">ออฟไลน์</span>`;
        msgEl.innerText = "คุณไม่ได้เชื่อมต่ออินเทอร์เน็ต";
        msgEl.className = "text-[11px] font-bold text-red-500 mt-2";
        return;
    }

        try {
        // จับเวลาดึงข้อมูล 1 Document เพื่อดู Latency
        const startTime = Date.now();
        
        // แก้ไขตรงนี้: ใช้ limit(1) เพื่อให้ดึงข้อมูลมาแค่ 1 รายการ จะได้เสียโควตาแค่ 1 Read
        const testQuery = query(collection(db, "campaigns"), limit(1));
        await getDocs(testQuery);
        
        const latency = Date.now() - startTime;

        const totalStudents = window.globalStudents ? window.globalStudents.length : 0;
        
        let healthColor, healthText, healthMsg, iconClass;

        if (totalStudents > 4000) {
            healthColor = "text-orange-600";
            healthText = "มีความเสี่ยง (โควตาฟรี)";
            healthMsg = `ผู้ใช้ ${totalStudents} คน อาจทำให้ทะลุลิมิตอ่าน 50k ครั้ง/วัน หากเข้าพร้อมกัน`;
            iconClass = "bg-orange-50 border-orange-100";
            statusEl.innerHTML = `<span class="w-3 h-3 rounded-full bg-orange-500 animate-pulse"></span><span class="font-bold text-orange-600 text-sm">เสี่ยง (Load)</span>`;
        } else if (latency > 2000) {
            healthColor = "text-yellow-600";
            healthText = "เซิร์ฟเวอร์ตอบสนองช้า";
            healthMsg = `ความหน่วง ${latency}ms (อาจเกิดจากเน็ตหรือเครื่องแอดมิน)`;
            iconClass = "bg-yellow-50 border-yellow-100";
            statusEl.innerHTML = `<span class="w-3 h-3 rounded-full bg-yellow-500"></span><span class="font-bold text-yellow-600">ล่าช้า (${latency}ms)</span>`;
        } else {
            healthColor = "text-green-600";
            healthText = "ปกติ (เสถียร)";
            healthMsg = `ความหน่วง ${latency}ms | รองรับผู้ใช้ปัจจุบันได้สบาย`;
            iconClass = "bg-green-50 border-green-100";
            statusEl.innerHTML = `<span class="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span><span class="font-bold text-green-600">ปกติ (เสถียร)</span>`;
        }

        msgEl.innerText = healthMsg;
        msgEl.className = `text-[11px] font-medium ${healthColor} mt-2`;
        iconEl.className = `p-2 rounded-lg border ${iconClass}`;
        iconEl.innerHTML = `<svg class="w-6 h-6 ${healthColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path></svg>`;

    } catch (e) {
        statusEl.innerHTML = `<span class="w-3 h-3 rounded-full bg-red-500"></span><span class="font-bold text-red-600">เชื่อมต่อล้มเหลว</span>`;
        msgEl.innerText = "ไม่สามารถเชื่อมต่อฐานข้อมูล Firebase ได้";
        msgEl.className = "text-[11px] font-bold text-red-500 mt-2";
    }
}

// เปลี่ยนความถี่เป็นเช็กทุกๆ 1 นาที (60,000 มิลลิวินาที) แทน 30 วินาที เพื่อประหยัดโควตา 
setInterval(checkSystemHealth, 60000);

// ================= 2. ระบบดึงข้อมูลอัตโนมัติ (Hybrid + ซิงค์รายชื่อ + ข้ามชีทซ่อน) =================
document.getElementById("autoImportWebBtn")?.addEventListener("click", async () => {
    Swal.fire({
        title: 'ระบบซิงค์ข้อมูลอัจฉริยะ',
        text: 'ระบบจะสแกนและซิงค์รายชื่อให้ตรงกับไฟล์ปัจจุบัน (เพิ่มคนใหม่, ลบคนที่หายไป)',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'เริ่มสแกนและซิงค์',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#7e22ce'
    }).then(async (result) => {
        if (result.isConfirmed) {
            let sheetUrl = "";

            try {
                // สแกนเว็บ
                Swal.fire({ title: 'กำลังสแกนเว็บไซต์...', html: 'ค้นหาลิงก์รายชื่อจาก www.mst.ac.th', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const targetWebUrl = encodeURIComponent("http://www.mst.ac.th/index.php");
                const webProxyUrl = `https://mst-proxy.studentcouncil-f38.workers.dev/?url=${targetWebUrl}`;
                const webResponse = await fetch(webProxyUrl);
                if (!webResponse.ok) throw new Error("Proxy ขัดข้อง");
                
                const webHtml = await webResponse.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(webHtml, "text/html");
                const links = Array.from(doc.querySelectorAll('a'));
                const targetLinkElement = links.find(a => a.textContent.includes('รายชื่อนักเรียน'));

                if (!targetLinkElement || !targetLinkElement.href) throw new Error("ไม่พบเมนูรายชื่อ");
                sheetUrl = targetLinkElement.href;
            } catch (scanError) {
                // กรณีเว็บล่ม ให้กรอกลิงก์เอง
                const { value: manualUrl } = await Swal.fire({
                    title: 'ระบบสแกนอัตโนมัติขัดข้อง',
                    html: `<div class="text-sm text-red-500 mb-2">โปรดไปที่เว็บโรงเรียน ก๊อปปี้ลิงก์ Google Sheets ของรายชื่อมาวางด้านล่างนี้</div>`,
                    input: 'url', inputPlaceholder: 'https://docs.google.com/spreadsheets/d/...',
                    icon: 'warning', showCancelButton: true, confirmButtonText: 'ตกลง', confirmButtonColor: '#7e22ce'
                });
                if (manualUrl) sheetUrl = manualUrl; else return; 
            }

            try {
                Swal.fire({ title: 'กำลังดาวน์โหลดไฟล์...', html: 'ดึงข้อมูลไฟล์ Excel มาตรวจสอบ', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const idMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
                if (!idMatch) throw new Error("ลิงก์ที่วางไม่ใช่รูปแบบ Google Sheets ที่ถูกต้อง");
                
                const fileId = idMatch[1];
                const xlsxExportUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
                
                let arrayBuffer;
                try {
                    const directResp = await fetch(xlsxExportUrl);
                    if (!directResp.ok) throw new Error("Direct fetch failed");
                    arrayBuffer = await directResp.arrayBuffer();
                } catch (e) {
                    const proxyUrl = `https://mst-proxy.studentcouncil-f38.workers.dev/?url=${encodeURIComponent(xlsxExportUrl)}`;
                    const proxyResp = await fetch(proxyUrl);
                    if (!proxyResp.ok) throw new Error("ดาวน์โหลดไฟล์ไม่ได้ โปรดเช็คสิทธิ์การแชร์ไฟล์");
                    arrayBuffer = await proxyResp.arrayBuffer();
                }

                Swal.fire({ title: 'กำลังวิเคราะห์และซิงค์...', html: 'แยกแยะรายชื่อและลบคนที่ไม่มีในระบบออก', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                let all = [];
                
                wb.SheetNames.forEach((sn, index) => {
                    const sheetInfo = wb.Workbook?.Sheets?.[index];
                    if (sheetInfo && sheetInfo.Hidden) return; // ข้ามชีทซ่อน

                    let currentLevel = "ไม่ระบุ"; 
                    let match = sn.match(/[mม]\.?\s*(\d)/i); 
                    if(match) currentLevel = `ม.${match[1]}`;
                    
                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
                    let currentRoom = "ไม่ระบุ";
                    
                    rows.forEach(r => {
                        let roomMatchCell = r.find(c => typeof c==='string' && c.match(/\d+\s?\/\s?\d+/));
                        if(roomMatchCell) {
                            let cleanRoom = roomMatchCell.match(/\d+\s?\/\s?\d+/)[0].replace(/\s/g, '');
                            currentLevel = `ม.${cleanRoom.split('/')[0]}`; 
                            currentRoom = `ม.${cleanRoom}`;
                        }

                        let idx = r.findIndex(c => /^\d{5}$/.test(c.toString().trim()));
                        if (idx !== -1) {
                            let fname = r[idx+2]||""; let lname = r[idx+3]||"";
                            let fn = (r.length > idx+4 && r[idx+4]) ? r[idx+4].toString().trim() : `${r[idx+1]||""}${fname} ${lname}`.trim();
                            
                            let inlineRoom = r.find(c => typeof c==='string' && c.match(/\d+\s?\/\s?\d+/)); 
                            if(inlineRoom) {
                                let cleanInlineRoom = inlineRoom.match(/\d+\s?\/\s?\d+/)[0].replace(/\s/g, '');
                                currentLevel = `ม.${cleanInlineRoom.split('/')[0]}`;
                                currentRoom = `ม.${cleanInlineRoom}`;
                            }
                            
                            if(fn.length > 5) {
                                all.push({ id: r[idx].toString().trim(), name: fn.replace(/['"]/g, ''), room: currentRoom, level: currentLevel });
                            }
                        }
                    });
                });

                let uniqueNewStudents = Array.from(new Map(all.map(item => [item.id, item])).values());
                if(uniqueNewStudents.length === 0) throw new Error("ไม่พบรายชื่อในรูปแบบที่ถูกต้องในชีทที่แสดงอยู่");

                // --- เริ่มระบบซิงค์ข้อมูล (เปรียบเทียบเก่า-ใหม่) ---
                const existingSnapshot = await getDocs(collection(db, "students"));
                const existingIds = existingSnapshot.docs.map(doc => doc.id);
                const newIdsSet = new Set(uniqueNewStudents.map(s => s.id));
                const idsToDelete = existingIds.filter(id => !newIdsSet.has(id));

                let batch = writeBatch(db); 
                let count = 0;

                // 1. อัปเดตและเพิ่มคนใหม่
                for(let i=0; i<uniqueNewStudents.length; i++) {
                    batch.set(doc(db, "students", uniqueNewStudents[i].id), { 
                        name: uniqueNewStudents[i].name, room: uniqueNewStudents[i].room, level: uniqueNewStudents[i].level, updated_at: serverTimestamp() 
                    });
                    count++; 
                    if(count === 490) { await batch.commit(); batch = writeBatch(db); count = 0; }
                }

                // 2. ลบคนที่ไม่มีชื่อในไฟล์ใหม่ออก
                for(let i=0; i<idsToDelete.length; i++) {
                    batch.delete(doc(db, "students", idsToDelete[i]));
                    count++;
                    if(count === 490) { await batch.commit(); batch = writeBatch(db); count = 0; }
                }
                
                await batch.commit();
                Swal.fire('ซิงค์ข้อมูลสำเร็จ', `อัปเดต/เพิ่ม: ${uniqueNewStudents.length} คน<br>ลบรายชื่อเก่าที่หายไป: ${idsToDelete.length} คน`, 'success');
                checkStudentCount(); 

            } catch (error) {
                console.error("Data Fetch Error:", error);
                Swal.fire('ล้มเหลว', error.message, 'error');
            }
        }
    });
});
// =================================================================================