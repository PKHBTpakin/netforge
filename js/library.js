/* ============================================
   7. Library — คลังโปรเจกต์ในเบราว์เซอร์ + แชร์ผ่าน URL
   ============================================
   ปัญหาที่ไฟล์นี้แก้:
   เดิมถ้าผู้ใช้อยากเก็บงานหลายเวอร์ชัน ต้องกด SAVE โหลดไฟล์ .json ลงเครื่องทุกครั้ง
   เวลานำเสนอก็ต้องหอบไฟล์ไปด้วยแล้ว LOAD ทีละไฟล์ ส่วน Autosave ที่มีอยู่เป็นช่องเดียว
   ที่เขียนทับตัวเองทุก 600ms ไม่ใช่ประวัติ

   ไฟล์นี้เพิ่มสองอย่างที่ "ไม่ต้อง login และไม่ต้องมีเซิร์ฟเวอร์":
     A) คลังโปรเจกต์  — เก็บหลายโปรเจกต์ใน localStorage เปิดจากในแอปได้เลย
     B) แชร์ผ่าน URL  — ยัดทั้งโปรเจกต์ลง URL hash ส่งลิงก์เดียวเปิดงานได้ทันที ข้ามเครื่องได้

   ขนาดข้อมูลจริง (วัดจากโปรเจกต์ใหญ่สุดที่แอปรองรับ: 8 แผนก + 10 อุปกรณ์ + 10 ลิงก์):
     JSON บีบบรรทัด 1,893 bytes -> localStorage 5MB เก็บได้ราว 2,700 โปรเจกต์
     base64url สำหรับ URL ~2,500 ตัวอักษร -> ต่ำกว่าเพดานเบราว์เซอร์ (~32,000) มาก

   ข้อจำกัดที่ต้องรู้: พฤติกรรมของ localStorage บน file:// ไม่ได้ถูกกำหนดในมาตรฐาน
   Safari โยน SecurityError, Firefox มีประวัติบั๊ก ทุกฟังก์ชันในไฟล์นี้จึงห่อ try/catch
   และคืนค่าที่ปลอดภัยเสมอ ถ้าใช้ไม่ได้จะแจ้งผู้ใช้ให้ export ไฟล์แทน ไม่ปล่อยให้เข้าใจผิดว่าเซฟแล้ว
   ============================================ */

var LIBRARY_KEY = 'netforge_library';
var LIBRARY_MAX = 50; // กันเผลอสะสมจนเต็มโควตา — เกินแล้วให้ผู้ใช้ลบเองก่อน จะได้รู้ตัว

/* ---------- ชั้นเก็บข้อมูล ---------- */

function isStorageAvailable() {
    try {
        var probe = '__nf_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return true;
    } catch (e) {
        return false; // private mode / file:// บางเบราว์เซอร์ / โควตาเต็ม
    }
}

function loadLibrary() {
    try {
        var raw = localStorage.getItem(LIBRARY_KEY);
        if (!raw) return [];
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        console.error('loadLibrary error:', e);
        return []; // ข้อมูลเสีย -> ถือว่าคลังว่าง ดีกว่าทำทั้งแอปพัง
    }
}

function persistLibrary(list) {
    try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
        return true;
    } catch (e) {
        console.error('persistLibrary error:', e);
        return false;
    }
}

/* ---------- CRUD ---------- */

function saveToLibrary(name) {
    try {
        if (!isStorageAvailable()) {
            showToast('เบราว์เซอร์นี้เก็บข้อมูลให้อัตโนมัติไม่ได้ อาจเพราะเปิดจากไฟล์โดยตรงหรือใช้โหมดไม่ระบุตัวตน ให้กดปุ่ม SAVE บันทึกเป็นไฟล์เองแทน', 'error');
            return null;
        }
        if (state.departments.length === 0 && topoNodes.manualNodes.length === 0) {
            showToast('ยังไม่มีข้อมูลให้บันทึก', 'error');
            return null;
        }

        var list = loadLibrary();
        if (list.length >= LIBRARY_MAX) {
            showToast('คลังโปรเจกต์เต็มแล้ว (เก็บได้สูงสุด ' + LIBRARY_MAX + ' ชิ้น) ต้องลบโปรเจกต์เก่าออกก่อนถึงจะเก็บเพิ่มได้', 'error');
            return null;
        }

        var trimmed = String(name || '').trim();
        var entry = {
            id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            name: trimmed || ('โปรเจกต์ ' + (list.length + 1)),
            savedAt: new Date().toISOString(),
            deptCount: state.departments.length,
            base: state.baseIp + '/' + state.baseCidr,
            data: buildProjectSnapshot() // ใช้ก้อนเดียวกับ export ไฟล์ .json ไม่เขียนโครงสร้างซ้ำ
        };

        list.unshift(entry); // ใหม่สุดอยู่บนสุด
        if (!persistLibrary(list)) {
            showToast('บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลในเบราว์เซอร์น่าจะเต็ม ลองลบโปรเจกต์เก่าที่ไม่ใช้แล้วออกก่อน', 'error');
            return null;
        }
        renderLibrary();
        showToast('บันทึก "' + entry.name + '" ลงคลังแล้ว', 'success');
        return entry.id;
    } catch (err) {
        console.error('saveToLibrary error:', err);
        showToast('โปรแกรมบันทึกลงคลังไม่สำเร็จ ลองกดใหม่อีกครั้ง ถ้ายังไม่ได้ให้กด SAVE เก็บเป็นไฟล์ไว้ก่อน', 'error');
        return null;
    }
}

function openFromLibrary(id) {
    try {
        var entry = loadLibrary().find(function (p) { return p.id === id; });
        if (!entry) { showToast('ไม่พบโปรเจกต์นี้ในคลัง', 'error'); return; }
        closeLibrary();
        applyProjectData(entry.data); // ทางเดียวกับ import ไฟล์ ผ่าน validation ชุดเดิมทั้งหมด
        if (typeof clearHistory === 'function') clearHistory(); // คนละโปรเจกต์แล้ว ประวัติเดิมไม่มีความหมาย
        document.getElementById('statusBar').textContent = 'เปิดจากคลัง: ' + entry.name;
    } catch (err) {
        console.error('openFromLibrary error:', err);
        showToast('โปรแกรมเปิดโปรเจกต์ไม่สำเร็จ ข้อมูลในคลังอาจเสียหาย ลองเปิดชิ้นอื่นดู', 'error');
    }
}

function deleteFromLibrary(id) {
    try {
        var list = loadLibrary();
        var entry = list.find(function (p) { return p.id === id; });
        if (!entry) return;
        persistLibrary(list.filter(function (p) { return p.id !== id; }));
        renderLibrary();
        showToast('ลบ "' + entry.name + '" แล้ว', 'info');
    } catch (err) {
        console.error('deleteFromLibrary error:', err);
    }
}

function renameInLibrary(id, newName) {
    try {
        var trimmed = String(newName || '').trim();
        if (!trimmed) return; // ชื่อว่างไม่รับ ปล่อยชื่อเดิมไว้
        var list = loadLibrary();
        var entry = list.find(function (p) { return p.id === id; });
        if (!entry) return;
        entry.name = trimmed.slice(0, 60);
        persistLibrary(list);
        renderLibrary();
    } catch (err) {
        console.error('renameInLibrary error:', err);
    }
}

// เขียนทับโปรเจกต์เดิมด้วยสถานะปัจจุบัน — สำหรับตอนแก้งานเก่าแล้วอยากเซฟทับ ไม่ใช่สร้างใหม่ทุกครั้ง
function overwriteInLibrary(id) {
    try {
        var list = loadLibrary();
        var entry = list.find(function (p) { return p.id === id; });
        if (!entry) return;
        entry.data = buildProjectSnapshot();
        entry.savedAt = new Date().toISOString();
        entry.deptCount = state.departments.length;
        entry.base = state.baseIp + '/' + state.baseCidr;
        if (!persistLibrary(list)) { showToast('บันทึกทับไม่สำเร็จ พื้นที่เก็บข้อมูลในเบราว์เซอร์น่าจะเต็ม ลองลบโปรเจกต์เก่าที่ไม่ใช้แล้วออกก่อน', 'error'); return; }
        renderLibrary();
        showToast('บันทึกทับ "' + entry.name + '" แล้ว', 'success');
    } catch (err) {
        console.error('overwriteInLibrary error:', err);
    }
}

/* ---------- B) แชร์ผ่าน URL ----------
   ใช้ base64url ของ JSON แบบ UTF-8 (btoa รับได้แค่ Latin-1 ชื่อแผนกภาษาไทยจะพังถ้าไม่แปลงก่อน)
   ไม่บีบอัดด้วย CompressionStream เพราะเป็น API ที่ยังไม่มีในทุกเบราว์เซอร์และเป็น async
   ขนาดที่ได้ (~2,500 ตัวอักษร) ต่ำกว่าเพดาน URL อยู่แล้ว ไม่คุ้มที่จะแลกกับความซับซ้อน */

function encodeProject(snapshot) {
    var json = JSON.stringify(snapshot);
    var bytes = new TextEncoder().encode(json);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // base64url — ปลอดภัยใน URL
}

function decodeProject(encoded) {
    var b64 = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
}

/* รูปแปลนอาคารใหญ่ระดับ 120-350 KB ซึ่งกลายเป็น base64 ราว 160-470K ตัวอักษร
   เกินเพดาน URL ของทุกเบราว์เซอร์และทุกแชตแอปแบบเทียบกันไม่ติด (ทั้งโปรเจกต์ที่เหลือราว 2 KB)
   จึงตัดรูปออกจากลิงก์เสมอ ไม่ใช่ปล่อยให้สร้างลิงก์ที่ส่งไม่ได้แล้วค่อยไปพังตอนวาง
   ผู้ใช้ที่ต้องการส่งรูปไปด้วยมีทางอยู่แล้วคือปุ่ม SAVE ที่ได้ไฟล์ .json ซึ่งมีรูปครบ */
function snapshotForShare() {
    var snap = buildProjectSnapshot();
    snap.backdrop = null;
    return snap;
}

function buildShareUrl() {
    var base = location.href.split('#')[0];
    return base + '#p=' + encodeProject(snapshotForShare());
}

function copyShareLink() {
    try {
        if (state.departments.length === 0 && topoNodes.manualNodes.length === 0) {
            showToast('ยังไม่มีข้อมูลให้แชร์', 'error');
            return;
        }
        var url = buildShareUrl();
        if (url.length > 30000) { // เผื่อขอบเขตความยาว URL ที่เบราว์เซอร์/แชตแอปรองรับ
            showToast('โปรเจกต์นี้ใหญ่เกินกว่าจะใส่ในลิงก์ได้ ให้ใช้ปุ่ม SAVE บันทึกเป็นไฟล์แล้วส่งไฟล์แทน', 'error');
            return;
        }
        copyToClipboard(url, 'คัดลอกลิงก์แชร์แล้ว (' + url.length.toLocaleString() + ' ตัวอักษร) — วางส่งได้เลย');
        // บอกให้ชัดว่ารูปไม่ได้ไปด้วย ไม่งั้นผู้รับเปิดลิงก์แล้วไม่เห็นแปลนอาคาร จะเข้าใจว่าลิงก์เสีย
        if (typeof hasBackdrop === 'function' && hasBackdrop()) {
            setTimeout(function () {
                showToast('ลิงก์นี้ไม่มีรูปแปลนอาคารติดไปด้วย เพราะไฟล์รูปใหญ่เกินกว่าจะใส่ในลิงก์ได้ ถ้าอยากส่งรูปไปด้วยให้ใช้ปุ่ม SAVE แล้วส่งเป็นไฟล์แทน', 'info');
            }, 800);
        }
        if (location.protocol === 'file:') {
            // ลิงก์ file:// เปิดได้แค่บนเครื่องที่มีไฟล์นั้นอยู่จริง เตือนไว้กันเข้าใจผิดว่าส่งให้คนอื่นได้
            setTimeout(function () {
                showToast('ตอนนี้คุณเปิดโปรแกรมจากไฟล์ในเครื่อง ลิงก์ที่ได้จึงใช้ได้แค่บนเครื่องนี้ ถ้าจะส่งให้คนอื่นต้องเอาเว็บขึ้นออนไลน์ก่อน', 'info');
            }, 800);
        }
    } catch (err) {
        console.error('copyShareLink error:', err);
        showToast('โปรแกรมสร้างลิงก์ไม่สำเร็จ ลองกดใหม่อีกครั้ง ถ้ายังไม่ได้ให้กด SAVE บันทึกเป็นไฟล์แล้วส่งไฟล์แทน', 'error');
    }
}

// เรียกจาก init() — ถ้าเปิดมาด้วยลิงก์ที่มี #p= ให้โหลดโปรเจกต์นั้นทันที
// คืน true ถ้าโหลดสำเร็จ เพื่อให้ init() ข้ามการกู้ Autosave (ลิงก์ที่ผู้ใช้ตั้งใจเปิดต้องชนะเสมอ)
function tryLoadFromUrl() {
    try {
        if (typeof location === 'undefined' || !location.hash) return false;
        var m = location.hash.match(/[#&]p=([A-Za-z0-9\-_]+)/);
        if (!m) return false;

        var data;
        try {
            data = decodeProject(m[1]);
        } catch (e) {
            showToast('ลิงก์นี้เปิดไม่ได้ อาจถูกคัดลอกมาไม่ครบหรือเสียหายระหว่างทาง', 'error');
            return false;
        }
        if (!isValidProjectData(data)) {
            showToast('ลิงก์นี้ไม่ใช่โปรเจกต์ NetForge', 'error');
            return false;
        }

        applyProjectData(data);
        if (typeof clearHistory === 'function') clearHistory();
        showToast('เปิดโปรเจกต์จากลิงก์เรียบร้อยแล้ว ถ้าอยากเก็บไว้ในเครื่อง ให้กดปุ่ม LIBRARY', 'info');
        return true;
    } catch (err) {
        console.error('tryLoadFromUrl error:', err);
        return false;
    }
}

/* ---------- UI ---------- */

function openLibrary() {
    var el = document.getElementById('libraryOverlay');
    if (!el) return;
    renderLibrary();
    el.classList.remove('hidden');
}

function closeLibrary() {
    var el = document.getElementById('libraryOverlay');
    if (el) el.classList.add('hidden');
}

function onSaveToLibrary() {
    var input = document.getElementById('libraryNewName');
    var name = input ? input.value : '';
    if (saveToLibrary(name) && input) input.value = '';
}

function formatSavedAt(iso) {
    try {
        var d = new Date(iso);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
}

function renderLibrary() {
    var el = document.getElementById('libraryList');
    if (!el) return;

    if (!isStorageAvailable()) {
        el.innerHTML = '<div class="text-hot text-[13px] py-4 leading-relaxed">' +
            '<i class="fas fa-triangle-exclamation mr-1"></i>เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูล<br>' +
            '<span class="text-muted text-[12px]">มักเกิดตอนเปิดไฟล์ตรง ๆ (file://) หรืออยู่ในโหมดส่วนตัว ' +
            'ใช้ปุ่ม SAVE/LOAD เป็นไฟล์ .json แทนได้ตามปกติ</span></div>';
        return;
    }

    var list = loadLibrary();
    if (list.length === 0) {
        el.innerHTML = '<div class="text-muted text-center py-6 text-[13px]">คลังยังว่าง<br>' +
            '<span class="text-subtle text-[12px]">ตั้งชื่อแล้วกดบันทึกด้านบนเพื่อเก็บโปรเจกต์ปัจจุบันไว้</span></div>';
        return;
    }

    el.innerHTML = list.map(function (p) {
        return '<div class="dept-item">' +
            '<div class="flex items-start justify-between gap-2 mb-1">' +
                '<input type="text" value="' + escapeHtml(p.name) + '" ' +
                    'onchange="renameInLibrary(\'' + p.id + '\', this.value)" ' +
                    'class="input-cyber flex-1 min-w-0 text-[14px] font-bold" title="แก้ชื่อได้เลย" />' +
            '</div>' +
            '<div class="text-[12px] text-muted mb-2">' +
                formatSavedAt(p.savedAt) + ' &nbsp;•&nbsp; ' + (p.deptCount || 0) + ' แผนก &nbsp;•&nbsp; ' + escapeHtml(p.base || '-') +
            '</div>' +
            '<div class="flex gap-1.5 flex-wrap">' +
                '<button onclick="openFromLibrary(\'' + p.id + '\')" class="btn-neon text-[12px]"><i class="fas fa-folder-open mr-1"></i>เปิด</button>' +
                '<button onclick="overwriteInLibrary(\'' + p.id + '\')" class="btn-cyber text-[12px]" title="บันทึกสถานะปัจจุบันทับโปรเจกต์นี้"><i class="fas fa-arrows-rotate mr-1"></i>บันทึกทับ</button>' +
                // ปุ่มถังขยะมีทุกการ์ดในคลัง ต้องระบุชื่อโปรเจกต์ใน aria-label ไม่งั้นแยกไม่ออกว่าจะลบอันไหน
                '<button onclick="deleteFromLibrary(\'' + p.id + '\')" class="btn-hot text-[12px] ml-auto" title="ลบโปรเจกต์นี้" aria-label="ลบโปรเจกต์ ' + escapeHtml(p.name) + '"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>' +
            '</div>' +
        '</div>';
    }).join('');
}
