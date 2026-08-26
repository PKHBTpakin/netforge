/* ============================================
   9. History — ย้อนกลับ (Undo) และทำซ้ำ (Redo)
   ============================================
   ปัญหาที่ไฟล์นี้แก้:
   เดิมทั้งแอปไม่มี confirm() และไม่มีทางย้อนกลับเลยแม้แต่จุดเดียว
   กด CLEAR พลาดครั้งเดียว = งานหายทั้งหมดทันที ลบแผนกผิด = หายถาวร
   ซึ่งอันตรายมากสำหรับเครื่องมือที่ผู้ใช้ใช้ทำงานจริงเป็นชั่วโมง

   วิธีที่เลือก — snapshot ทั้งก้อน ไม่ใช่ command pattern:
   buildProjectSnapshot() / applyProjectData() มีอยู่แล้วและถูกใช้กับ Save/Load/คลัง/ลิงก์แชร์
   ผ่านการทดสอบมาแล้วว่าเก็บ-คืนสถานะได้ครบทุกฟิลด์ จึงเอามาใช้ซ้ำได้ทันที
   ไม่ต้องเขียนตรรกะ undo แยกของแต่ละ action (ซึ่งจะกลายเป็นโค้ดคู่ขนานที่หลุดกันได้ง่าย)
   ข้อแลกเปลี่ยนคือเปลือง memory มากกว่า แต่ snapshot จริงอยู่ที่ ~1.9 KB
   เก็บ 40 ขั้นก็ยังไม่ถึง 80 KB — ไม่ใช่ปัญหา

   จุดที่ต้องระวัง: applyProjectData() เองก็ทำให้ state เปลี่ยน
   ถ้าไม่กันไว้ การ undo จะไปสร้าง history ใหม่ทับซ้อนกันเป็นวงวน -> ใช้ธง isRestoring คุม
   ============================================ */

var HISTORY_MAX = 40;
var undoStack = [];
var redoStack = [];
var isRestoring = false;        // กันไม่ให้การ undo/redo ไปสร้างประวัติซ้อนอีกชั้น
var lastPushAt = 0;
var lastPushLabel = '';

// เรียก "ก่อน" ลงมือแก้ทุกครั้ง — เก็บสภาพก่อนหน้าไว้ให้ย้อนกลับได้
// label ใช้ทั้งบอกผู้ใช้ว่ากำลังย้อนอะไร และใช้รวบการกระทำต่อเนื่อง (เช่นพิมพ์ทีละตัวอักษร) ให้เป็นขั้นเดียว
function pushHistory(label) {
    if (isRestoring) return;
    try {
        var now = Date.now();
        // พิมพ์ต่อเนื่องในช่องเดิมไม่ควรกลายเป็น undo ทีละตัวอักษร — รวบเป็นขั้นเดียวถ้าห่างกันไม่ถึง 900ms
        if (label && label === lastPushLabel && now - lastPushAt < 900) { lastPushAt = now; return; }

        // สำเนาลึกอีกชั้นเพื่อความปลอดภัย — snapshot ถูกเก็บค้างในหน่วยความจำนานกว่าการใช้งานอื่น
        // ถ้ามีฟิลด์ไหนในอนาคตเผลอส่ง reference มา ระบบ Undo จะพังแบบเงียบ ๆ หาสาเหตุยาก
        undoStack.push({ label: label || 'แก้ไข', data: JSON.parse(JSON.stringify(buildProjectSnapshot())) });
        if (undoStack.length > HISTORY_MAX) undoStack.shift();
        redoStack = []; // แตกกิ่งใหม่แล้ว ของที่ redo ไว้ใช้ไม่ได้อีก
        lastPushAt = now;
        lastPushLabel = label || '';
        updateHistoryButtons();
    } catch (err) {
        console.error('pushHistory error:', err);
    }
}

function applyHistorySnapshot(entry) {
    isRestoring = true;
    try {
        applyProjectData(entry.data);
    } finally {
        isRestoring = false;
    }
}

function undo() {
    if (undoStack.length === 0) { showToast('ไม่มีอะไรให้ย้อนกลับแล้ว', 'info'); return; }
    try {
        var current = { label: 'สถานะปัจจุบัน', data: JSON.parse(JSON.stringify(buildProjectSnapshot())) };
        var entry = undoStack.pop();
        redoStack.push(current);
        if (redoStack.length > HISTORY_MAX) redoStack.shift();
        applyHistorySnapshot(entry);
        lastPushLabel = ''; // ตัดการรวบขั้น ไม่งั้นการแก้ครั้งถัดไปอาจถูกกลืนหายไป
        updateHistoryButtons();
        showToast('ย้อนกลับ: ' + entry.label, 'info');
    } catch (err) {
        console.error('undo error:', err);
        showToast('โปรแกรมย้อนกลับไม่สำเร็จ ลองกด Ctrl+Z ใหม่อีกครั้ง', 'error');
    }
}

function redo() {
    if (redoStack.length === 0) { showToast('ไม่มีอะไรให้ทำซ้ำ', 'info'); return; }
    try {
        var current = { label: 'สถานะปัจจุบัน', data: JSON.parse(JSON.stringify(buildProjectSnapshot())) };
        var entry = redoStack.pop();
        undoStack.push(current);
        if (undoStack.length > HISTORY_MAX) undoStack.shift();
        applyHistorySnapshot(entry);
        lastPushLabel = '';
        updateHistoryButtons();
        showToast('ทำซ้ำแล้ว', 'info');
    } catch (err) {
        console.error('redo error:', err);
        showToast('โปรแกรมทำซ้ำไม่สำเร็จ ลองกด Ctrl+Y ใหม่อีกครั้ง', 'error');
    }
}

// ล้างประวัติ — ใช้ตอนเปลี่ยนโปรเจกต์ทั้งก้อน (โหลดจากคลัง/ไฟล์/ลิงก์)
// เพราะการย้อนข้ามโปรเจกต์คนละชิ้นไม่มีความหมายและทำให้ผู้ใช้สับสน
function clearHistory() {
    undoStack = [];
    redoStack = [];
    lastPushLabel = '';
    updateHistoryButtons();
}

function updateHistoryButtons() {
    var u = document.getElementById('btnUndo');
    var r = document.getElementById('btnRedo');
    if (u) {
        u.disabled = undoStack.length === 0;
        u.classList.toggle('is-disabled', undoStack.length === 0);
        u.title = undoStack.length ? ('ย้อนกลับ: ' + undoStack[undoStack.length - 1].label + '  (Ctrl+Z)') : 'ยังไม่มีอะไรให้ย้อนกลับ  (Ctrl+Z)';
    }
    if (r) {
        r.disabled = redoStack.length === 0;
        r.classList.toggle('is-disabled', redoStack.length === 0);
        r.title = redoStack.length ? 'ทำซ้ำ  (Ctrl+Y)' : 'ยังไม่มีอะไรให้ทำซ้ำ  (Ctrl+Y)';
    }
}

/* ---------- ยืนยันก่อนล้างข้อมูลทั้งหมด ----------
   ใช้กล่องยืนยันเฉพาะ CLEAR ที่เดียว เพราะเป็นการกระทำเดียวที่ทำลายทุกอย่างพร้อมกัน
   ส่วนการลบทีละชิ้นไม่ถามซ้ำ แต่ไปบอกในข้อความแจ้งผลว่ากด Ctrl+Z ย้อนได้
   (การถามซ้ำทุกครั้งจะกวนกว่ามีประโยชน์ เมื่อมีทางย้อนกลับอยู่แล้ว) */
function confirmClearAll() {
    var count = state.departments.length;
    var devices = topoNodes.manualNodes.length;
    if (count === 0 && devices === 0) { clearAll(); return; }

    var msg = 'ล้างข้อมูลทั้งหมด?\n\n' +
        'จะลบ ' + count + ' แผนก' + (devices ? ' และอุปกรณ์บนผัง ' + devices + ' ตัว' : '') + '\n\n' +
        'กด Ctrl+Z ย้อนกลับได้ภายหลัง และงานที่บันทึกไว้ในคลังจะไม่ถูกแตะต้อง';

    var ok = true;
    try { ok = window.confirm(msg); } catch (e) { ok = true; } // สภาพแวดล้อมที่ไม่มี confirm ให้ผ่านไปเลย
    if (ok) clearAll();
}
