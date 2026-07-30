/* ============================================
   6. App — ตัวเริ่มต้น รวมทุกอย่างเข้าด้วยกัน
   ไฟล์นี้ต้องโหลดสุดท้ายเท่านั้น
   ============================================ */

// สถานะหลัก
var state = {
    baseIp: '10.0.0.0',
    baseCidr: 24,
    nextId: 1,
    departments: [],
    calculated: [],
    failed: [],   // แผนกที่ VLSM จัดสรรไม่สำเร็จ + เหตุผล (calculateVLSM เป็นคนเติม ดู vlsm.js)
    selectedDeptId: null,
    selectedNodeType: null,
    detailOpen: false,
    activeTab: 'table',
    summaryRoutes: ['192.168.1.0/24', '192.168.2.0/24', '192.168.3.0/24'],
    showArrows: true, // <--- ตัวแปรสำหรับเปิดปิดลูกศร
    placingType: null, // null | 'pc' | 'server' — กำลังอยู่ในโหมดวางอุปกรณ์ใหม่หรือไม่
    connectMode: false, // กำลังอยู่ในโหมดลากเชื่อมสายหรือไม่
    linkFromId: null,   // id ของอุปกรณ์ตัวแรกที่เลือกไว้ระหว่างโหมด Connect
    theme: 'light',       // 'dark' | 'light' — applyTheme() ใน ui.js เป็นคนอัปเดตค่านี้จริง ตรงนี้แค่ default ตอนเริ่ม (Light = โหมดมาตรฐาน)

    // ----- IPv6 (แยกโหมดจาก IPv4 แต่ผลลัพธ์ทั้งสองฝั่งอยู่ครบพร้อมกันเสมอ ไม่ล้างตอนสลับโหมด เพื่อให้ CLI รวม Dual-Stack ได้ทีหลัง) -----
    ipMode: 'v4',       // 'v4' | 'v6' — โหมดที่กำลังแสดง/แก้ไขอยู่ตอนนี้
    baseIp6: '',        // ว่างจนกว่าผู้ใช้จะกด Calculate ในโหมด IPv6 ครั้งแรก (calculateIPv6() จะข้ามถ้ายังว่าง)
    basePrefixLen6: 48,
    newPrefixLen6: 64,
    calculatedV6: []
};

// รีเฟรชทั้งหมด
// forceLayout = true -> จัดผังใหม่หมด ทิ้งตำแหน่งที่ผู้ใช้ลากเอง (ใช้ตอน Clear/โหลด Example/กด RESET)
// ปกติ (false) -> รักษาตำแหน่งที่ลากไว้ ดู layoutTopology() ใน topology.js
function refreshAll(forceLayout) {
    calculateVLSM();
    calculateIPv6();
    renderSidebarDepts();
    renderTable();
    renderUtilization();
    layoutTopology(forceLayout);
    updateDetailSubnetInfo();
    // แท็บ CLI ไม่ได้ re-render เองตอนข้อมูลเปลี่ยน เดิมเรียกจาก switchTab() ที่เดียว
    // ผลคือถ้าเปิดแท็บ CLI ค้างไว้แล้วแก้แผนก/Base IP คำสั่งที่เห็นจะเป็นของเก่าจนกว่าจะสลับแท็บไปกลับ
    if (state.activeTab === 'cli' && typeof renderCLI === 'function') renderCLI();
    scheduleAutosave(); // debounce เก็บ Snapshot ลง localStorage อัตโนมัติทุกครั้งที่ state เปลี่ยน กันรีเฟรชเผลอข้อมูลหาย
}

// คำนวณ IPv6 แยกจาก VLSM (IPv4) เสมอ — ไม่สนใจ state.ipMode ตอนนี้ เพื่อให้ผลทั้งสองฝั่งพร้อมใช้งานพร้อมกันตลอด (รองรับ CLI Dual-Stack ทีหลัง)
function calculateIPv6() {
    if (!state.baseIp6) { state.calculatedV6 = []; return; } // ยังไม่เคยตั้งค่า Base IPv6 เลย ข้ามไปเงียบๆ ไม่ต้อง error
    try {
        var depts = state.departments.map(function(d) { return { id: d.id, name: d.name }; });
        var out = calculateIPv6Subnets(state.baseIp6, state.basePrefixLen6, depts, state.newPrefixLen6);
        state.calculatedV6 = out.results;
        if (out.errors.length) showToast(out.errors.join('\n'), 'error');
    } catch (err) {
        console.error('calculateIPv6 error:', err);
        state.calculatedV6 = [];
        showToast('คำนวณ IPv6 ไม่สำเร็จ', 'error');
    }
}

// โหลดตัวอย่าง
function toggleExampleDropdown() {
    document.getElementById('exampleDropdown').classList.toggle('open');
}

function loadExample(key) {
    var ex = EXAMPLES[key];
    if (!ex) return;
    document.getElementById('exampleDropdown').classList.remove('open');

    try {
        state.baseIp = ex.baseIp;
        state.baseCidr = ex.baseCidr;
        resetVlanRegistry();
        resetManualTopology();
        state.departments = ex.departments.map(function(d) {
            return { id: state.nextId++, name: d.name, hosts: d.hosts };
        });
        state.selectedDeptId = null;
        state.selectedNodeType = null;
        closeDetailPanel();

        document.getElementById('baseIpInput').value = ex.baseIp;
        document.getElementById('baseCidrInput').value = ex.baseCidr;

        refreshAll(true); // ชุดข้อมูลใหม่ทั้งชุด จัดผังใหม่จากศูนย์

        // Flash effect
        setTimeout(function() {
            document.querySelectorAll('.dept-item').forEach(function(el) {
                el.classList.add('dept-flash');
                el.addEventListener('animationend', function() { el.classList.remove('dept-flash'); }, { once: true });
            });
        }, 50);

        document.getElementById('statusBar').textContent = 'Loaded: ' + ex.label + ' — ' + ex.departments.length + ' depts — ' + ex.baseIp + '/' + ex.baseCidr;
        showToast('โหลดตัวอย่าง: ' + ex.label, 'success');
    } catch (err) {
        console.error('loadExample error:', err);
        showToast('โหลดตัวอย่างไม่สำเร็จ', 'error');
    }
}

function clearAll() {
    try {
        state.departments = [];
        state.calculated = [];
        state.failed = [];
        state.selectedDeptId = null;
        state.selectedNodeType = null;
        resetVlanRegistry();
        resetManualTopology();
        closeDetailPanel();
        refreshAll(true); // ล้างหมดแล้ว Router ควรกลับไปกลางจอตามผังมาตรฐาน
        document.getElementById('statusBar').textContent = 'Cleared — กด EXAMPLE เพื่อเริ่มต้น';
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'info');
    } catch (err) {
        console.error('clearAll error:', err);
        showToast('ล้างข้อมูลไม่สำเร็จ', 'error');
    }
}

/* ============================================
   6b. Save / Load Project — Export/Import เป็นไฟล์ .json
   เก็บเฉพาะ "ข้อมูลต้นทาง" ที่คำนวณค่าที่เหลือได้เสมอผ่าน refreshAll() (ไม่เก็บ state.calculated/calculatedV6)
   ไม่เก็บตำแหน่ง Router/Switch/Department เพราะ layoutTopology() รีเซ็ตตำแหน่งพวกนี้ใหม่ทุกครั้งที่แก้ข้อมูลอยู่แล้ว (ดูคอมเมนต์ใน topology.js)
   เก็บตำแหน่ง PC/Server (manualNodes) เพราะเป็นตำแหน่งเดียวที่เสถียรจริงระหว่างใช้งาน
   ============================================ */
var PROJECT_SCHEMA_VERSION = 1;

function buildProjectSnapshot() {
    return {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        baseIp: state.baseIp,
        baseCidr: state.baseCidr,
        nextId: state.nextId,
        departments: state.departments,
        ipMode: state.ipMode,
        baseIp6: state.baseIp6,
        basePrefixLen6: state.basePrefixLen6,
        newPrefixLen6: state.newPrefixLen6,
        // เส้นทางในเครื่องมือ Route Summary เดิมไม่ถูกเก็บ หายทุกครั้งที่โหลดโปรเจกต์ใหม่
        // ทั้งที่เป็นข้อมูลที่ผู้ใช้พิมพ์เองและเป็นส่วนหนึ่งของงานที่ทำค้างไว้
        summaryRoutes: Array.isArray(state.summaryRoutes) ? state.summaryRoutes.slice(0, 16) : [],
        vlan: {
            entries: Array.from(vlanRegistry.entries()), // Map ไม่ใช่ JSON ได้ตรงๆ ต้องแปลงเป็น [[deptId, vlanId], ...] ก่อน
            nextVlanId: nextVlanId
        },
        manualNodes: topoNodes.manualNodes.map(function(n) {
            return { id: n.id, type: n.type, x: n.x, y: n.y, ip: n.ip, linkedDeptId: n.linkedDeptId };
        }),
        nextManualNodeId: nextManualNodeId,
        links: topoNodes.links.map(function(l) {
            return { id: l.id, fromId: l.fromId, toId: l.toId };
        }),
        nextLinkId: nextLinkId
    };
}

function exportProject() {
    try {
        // เดิมไม่เช็คอะไรเลย กดตอนยังไม่มีข้อมูลก็ได้ไฟล์เปล่า 362 bytes ติดเครื่องไปโดยไม่มีประโยชน์
        // (copyShareLink() เช็คอยู่แล้ว ตรงนี้ควรทำเหมือนกันเพื่อความสม่ำเสมอ)
        if (state.departments.length === 0 && topoNodes.manualNodes.length === 0) {
            showToast('ยังไม่มีข้อมูลให้บันทึก — กด EXAMPLE หรือเพิ่มแผนกก่อน', 'error');
            return;
        }
        var data = buildProjectSnapshot();

        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var stamp = data.savedAt.slice(0, 19).replace(/[:T]/g, '-');
        var a = document.createElement('a');
        a.href = url;
        a.download = 'netforge-project-' + stamp + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

        showToast('บันทึกโปรเจกต์เป็นไฟล์แล้ว', 'success');
    } catch (err) {
        console.error('exportProject error:', err);
        showToast('บันทึกโปรเจกต์ไม่สำเร็จ', 'error');
    }
}

function triggerImportProject() {
    var input = document.getElementById('importFileInput');
    if (!input) return;
    input.value = ''; // เคลียร์ก่อนเสมอ กันเลือกไฟล์ชื่อเดิมซ้ำสองครั้งติดแล้ว 'change' ไม่ยิง
    input.click();
}

function onImportFileSelected(inputEl) {
    var file = inputEl.files && inputEl.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var data;
        try {
            data = JSON.parse(e.target.result);
        } catch (err) {
            console.error('importProject parse error:', err);
            showToast('ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง — โหลดไม่สำเร็จ', 'error');
            return;
        }
        applyProjectData(data);
    };
    reader.onerror = function() {
        showToast('อ่านไฟล์ไม่สำเร็จ', 'error');
    };
    reader.readAsText(file);
}

// ตรวจโครงสร้างขั้นต่ำก่อน apply จริง — กันไฟล์ผิดรูปแบบ/ไฟล์คนละแอปทำ state พังระหว่างโหลด
function isValidProjectData(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.schemaVersion !== 'number') return false;
    if (!isValidIp(data.baseIp)) return false;
    if (!Number.isInteger(data.baseCidr) || data.baseCidr < 8 || data.baseCidr > 30) return false;
    if (!Array.isArray(data.departments)) return false;
    for (var i = 0; i < data.departments.length; i++) {
        var d = data.departments[i];
        if (!d || typeof d.id !== 'number' || typeof d.name !== 'string' || isNaN(parseInt(d.hosts))) return false;
    }
    if (!Array.isArray(data.manualNodes) || !Array.isArray(data.links)) return false;
    return true;
}

function applyProjectData(data) {
    if (!isValidProjectData(data)) {
        showToast('โครงสร้างไฟล์ไม่ตรงกับ NetForge Project — โหลดไม่สำเร็จ', 'error');
        return;
    }
    try {
        resetVlanRegistry();
        resetManualTopology();
        state.selectedDeptId = null;
        state.selectedNodeType = null;
        closeDetailPanel();

        state.baseIp = data.baseIp;
        state.baseCidr = data.baseCidr;
        state.departments = data.departments.map(function(d) {
            return { id: d.id, name: String(d.name).trim() || ('Dept-' + d.id), hosts: Math.min(Math.max(parseInt(d.hosts) || 1, 1), 65534) };
        });
        if (state.departments.length > 8) {
            state.departments = state.departments.slice(0, 8);
            showToast('ไฟล์มีมากกว่า 8 แผนก — ใช้แค่ 8 แผนกแรก', 'info');
        }

        var maxDeptId = state.departments.reduce(function(m, d) { return Math.max(m, d.id); }, 0);
        state.nextId = Number.isInteger(data.nextId) && data.nextId > maxDeptId ? data.nextId : maxDeptId + 1;

        state.ipMode = data.ipMode === 'v6' ? 'v6' : 'v4';
        state.baseIp6 = typeof data.baseIp6 === 'string' ? data.baseIp6 : '';
        state.basePrefixLen6 = Number.isInteger(data.basePrefixLen6) ? data.basePrefixLen6 : 48;
        state.newPrefixLen6 = Number.isInteger(data.newPrefixLen6) ? data.newPrefixLen6 : 64;

        // ไฟล์เก่าที่บันทึกก่อนเพิ่มฟิลด์นี้จะไม่มี summaryRoutes -> คงค่าเดิมไว้ ไม่ล้างทิ้ง
        if (Array.isArray(data.summaryRoutes)) {
            state.summaryRoutes = data.summaryRoutes
                .filter(function(r) { return typeof r === 'string' && parseCidrText(r); })
                .slice(0, 16);
            if (typeof renderSummaryInputs === 'function') renderSummaryInputs();
        }

        if (data.vlan && Array.isArray(data.vlan.entries)) {
            data.vlan.entries.forEach(function(pair) {
                if (Array.isArray(pair) && pair.length === 2) vlanRegistry.set(pair[0], pair[1]);
            });
        }
        var maxVlan = 0;
        vlanRegistry.forEach(function(v) { maxVlan = Math.max(maxVlan, v); });
        nextVlanId = (data.vlan && Number.isInteger(data.vlan.nextVlanId) && data.vlan.nextVlanId > maxVlan) ? data.vlan.nextVlanId : maxVlan + 10;

        // สร้าง instance จริงของ PCDevice/ServerDevice (ไม่ใช่ก็อบปี้ object เฉยๆ) เพราะตอน render ต้องเรียก method อย่าง getIpLabel()
        data.manualNodes.forEach(function(n) {
            if (!n || (n.type !== 'pc' && n.type !== 'server') || typeof n.id !== 'string') return;
            var DeviceClass = n.type === 'pc' ? PCDevice : ServerDevice;
            var node = new DeviceClass(n.id, Number(n.x) || 0, Number(n.y) || 0);
            node.ip = (typeof n.ip === 'string' && isValidIp(n.ip)) ? n.ip : null;
            node.linkedDeptId = Number.isInteger(n.linkedDeptId) ? n.linkedDeptId : null;
            topoNodes.manualNodes.push(node);
        });
        var maxNodeNum = 0;
        topoNodes.manualNodes.forEach(function(n) {
            var num = parseInt(String(n.id).replace('m-', ''), 10);
            if (!isNaN(num)) maxNodeNum = Math.max(maxNodeNum, num);
        });
        nextManualNodeId = Number.isInteger(data.nextManualNodeId) && data.nextManualNodeId > maxNodeNum ? data.nextManualNodeId : maxNodeNum + 1;

        // Link เฉพาะคู่ที่ปลายทางมีอยู่จริงหลังสร้าง manualNodes/switch แล้วเท่านั้น กัน dangling reference จากไฟล์ที่แก้มือ/เสียหาย
        var validIds = { router: true };
        topoNodes.manualNodes.forEach(function(n) { validIds[n.id] = true; });
        state.departments.forEach(function(d) { validIds['sw-' + d.id] = true; });
        data.links.forEach(function(l) {
            if (l && validIds[l.fromId] && validIds[l.toId] && typeof l.id === 'string') {
                topoNodes.links.push({ id: l.id, fromId: l.fromId, toId: l.toId });
            }
        });
        var maxLinkNum = 0;
        topoNodes.links.forEach(function(l) {
            var num = parseInt(String(l.id).replace('link-', ''), 10);
            if (!isNaN(num)) maxLinkNum = Math.max(maxLinkNum, num);
        });
        nextLinkId = Number.isInteger(data.nextLinkId) && data.nextLinkId > maxLinkNum ? data.nextLinkId : maxLinkNum + 1;

        document.getElementById('baseIpInput').value = state.baseIp;
        document.getElementById('baseCidrInput').value = state.baseCidr;
        if (document.getElementById('baseIp6Input')) document.getElementById('baseIp6Input').value = state.baseIp6;
        if (document.getElementById('basePrefixInput')) document.getElementById('basePrefixInput').value = state.basePrefixLen6;
        if (document.getElementById('newPrefixInput')) document.getElementById('newPrefixInput').value = state.newPrefixLen6;
        setIpMode(state.ipMode, true); // silent — ไม่ toast ซ้อนกับ toast โหลดสำเร็จด้านล่าง

        refreshAll(true); // โปรเจกต์ใหม่ทั้งก้อน (ไฟล์ไม่ได้เก็บตำแหน่ง Router/Switch อยู่แล้ว)
        document.getElementById('statusBar').textContent = 'Loaded project — ' + state.departments.length + ' depts — ' + state.baseIp + '/' + state.baseCidr;
        showToast('โหลดโปรเจกต์สำเร็จ', 'success');
    } catch (err) {
        console.error('applyProjectData error:', err);
        showToast('โหลดโปรเจกต์ไม่สำเร็จ ข้อมูลอาจไม่สมบูรณ์', 'error');
    }
}

/* ============================================
   6c. Autosave — เก็บ Snapshot ลง localStorage อัตโนมัติ กันรีเฟรชเผลอข้อมูลหาย
   ใช้ buildProjectSnapshot() ก้อนเดียวกับ exportProject() ไม่เขียนซ้ำ เป็นแค่ตาข่ายนิรภัยสำรอง ไม่ทับ Save/Load ไฟล์ .json
   ============================================ */
var AUTOSAVE_KEY = 'netforge_autosave';
var autosaveTimer = null;

function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function() {
        try {
            if (state.departments.length === 0 && topoNodes.manualNodes.length === 0) {
                localStorage.removeItem(AUTOSAVE_KEY); // ไม่มีอะไรให้เก็บ (เช่นหลัง Clear All) ล้าง autosave เก่าทิ้งด้วย กันกู้คืนข้อมูลเปล่าตอนเปิดใหม่
                return;
            }
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildProjectSnapshot()));
        } catch (e) { /* localStorage เต็ม/ปิดใช้งาน — ไม่ toast กวนตา แค่ไม่มีตาข่ายนิรภัยรอบนี้ */ }
    }, 600);
}

function tryRestoreAutosave() {
    try {
        var raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return;
        var data = JSON.parse(raw);
        if (!isValidProjectData(data)) return;
        applyProjectData(data);
        showToast('กู้คืนข้อมูลล่าสุดจาก Autosave อัตโนมัติ (' + data.departments.length + ' แผนก) — กด CLEAR หากต้องการเริ่มใหม่', 'info');
    } catch (err) {
        console.error('tryRestoreAutosave error:', err);
    }
}

// สร้าง dropdown HTML
function buildExampleDropdown() {
    var icons = {
        company: { icon: 'fa-building', bg: 'rgba(76,141,255,0.1)', border: 'rgba(76,141,255,0.3)', color: '#4C8DFF' },
        school: { icon: 'fa-graduation-cap', bg: 'rgba(76,141,255,0.1)', border: 'rgba(76,141,255,0.3)', color: '#4C8DFF' },
        hospital: { icon: 'fa-hospital', bg: 'rgba(76,141,255,0.1)', border: 'rgba(76,141,255,0.3)', color: '#4C8DFF' },
        small: { icon: 'fa-store', bg: 'rgba(76,141,255,0.1)', border: 'rgba(76,141,255,0.3)', color: '#4C8DFF' },
        factory: { icon: 'fa-industry', bg: 'rgba(76,141,255,0.1)', border: 'rgba(76,141,255,0.3)', color: '#4C8DFF' },
        enterprise: { icon: 'fa-city', bg: 'rgba(76,141,255,0.1)', border: 'rgba(76,141,255,0.3)', color: '#4C8DFF' }
    };

    var html = '';
    Object.keys(EXAMPLES).forEach(function(key) {
        var ex = EXAMPLES[key];
        var ic = icons[key];
        html += '<div class="ex-item" onclick="loadExample(\'' + key + '\')">' +
            '<div class="ex-icon" style="background:' + ic.bg + ';border:1px solid ' + ic.border + ';color:' + ic.color + ';">' +
            '<i class="fas ' + ic.icon + '"></i></div>' +
            '<div><div class="ex-title">' + ex.label + '</div>' +
            '<div class="ex-desc">' + ex.departments.map(function(d) { return d.name; }).join(', ') + '<br>Base: ' + ex.baseIp + '/' + ex.baseCidr + '</div></div>' +
            '</div>';
    });
    document.getElementById('exampleDropdown').innerHTML = html;
}

// Toast
function showToast(msg, type) {
    type = type || 'success';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(function() { toast.classList.add('show'); });
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
    }, 2500);
}

// ปิด dropdown เมื่อคลิกข้างนอก
document.addEventListener('click', function(e) {
    var wrapper = document.getElementById('exampleWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        document.getElementById('exampleDropdown').classList.remove('open');
    }
});

// ปุ่ม Escape — ทางออกมาตรฐานที่ผู้ใช้คาดหวังจากทุกแอป แต่เดิมไม่มีเลย
// ไล่ปิดทีละชั้นจากบนลงล่าง (modal -> โหมดค้าง -> พาเนล) ไม่ปิดทุกอย่างรวดเดียว
// เพื่อให้กด Esc ซ้ำ ๆ แล้วถอยออกทีละขั้นได้ตามสัญชาตญาณ
function setupGlobalKeys() {
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        try {
            var lib = document.getElementById('libraryOverlay');
            if (lib && !lib.classList.contains('hidden')) { closeLibrary(); return; }

            var onboard = document.getElementById('onboardOverlay');
            if (onboard && !onboard.classList.contains('hidden')) { closeOnboarding(); return; }

            var dd = document.getElementById('exampleDropdown');
            if (dd && dd.classList.contains('open')) { dd.classList.remove('open'); return; }

            if (state.placingType || state.connectMode) {
                state.placingType = null;
                state.connectMode = false;
                state.linkFromId = null;
                if (typeof updateModeButtons === 'function') updateModeButtons();
                document.getElementById('statusBar').textContent = 'ยกเลิกโหมดแล้ว';
                return;
            }

            if (state.detailOpen) closeDetailPanel();
        } catch (err) {
            console.error('Escape handler error:', err);
        }
    });
}

// เริ่มต้นทุกอย่าง
function init() {
    try {
        // ต้องเรียกก่อนอย่างอื่นทั้งหมด เพราะ setupCanvas() ด้านล่างจะ trigger layoutTopology() ครั้งแรกทันที
        // ถ้าไม่สลับ DEPT_COLORS/ROUTER_COLOR ให้ถูกก่อน node แรกจะได้สีผิดธีมไปเลย
        var savedTheme = 'light';
        try { savedTheme = localStorage.getItem('netforge_theme') || 'light'; } catch (e) { /* เช่นกัน อ่านไม่ได้ก็ fallback เป็น light (ค่ามาตรฐาน) เงียบๆ */ }
        applyTheme(savedTheme);

        buildExampleDropdown();
        setupCanvas();
        setupCanvasEvents();

        // เรียกใช้ Resizer (จากไฟล์ ui.js)
        if (typeof initResizers === 'function') initResizers();

        window.addEventListener('resize', function() { resizeCanvas(); });

        document.getElementById('baseIpInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('baseCidrInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('baseIp6Input').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('basePrefixInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('newPrefixInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('newDeptHosts').addEventListener('keydown', function(e) { if (e.key === 'Enter') onAddDept(); });
        document.getElementById('newDeptName').addEventListener('keydown', function(e) { if (e.key === 'Enter') onAddDept(); });

        // แท็บ Net Tools — กด Enter ในช่องกรอกให้ทำงานเลย เหมือนช่องอื่นทั้งแอป
        var wcEl = document.getElementById('wcInput');
        if (wcEl) wcEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') calcWildcard(); });
        var sumEl = document.getElementById('summaryNew');
        if (sumEl) sumEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') addSummaryRoute(); });

        renderSidebarDepts();
        renderTable();
        renderUtilization();
        layoutTopology();
        renderFrame();

        document.getElementById('statusBar').textContent = 'Ready — กดปุ่ม EXAMPLE เพื่อโหลดข้อมูลตัวอย่าง';

        // ลิงก์แชร์ (#p=...) ต้องชนะ Autosave เสมอ — ผู้ใช้กดลิงก์นั้นเพราะตั้งใจจะเปิดงานชิ้นนั้น
        // ถ้าปล่อยให้ Autosave ทับ จะกลายเป็นเปิดลิงก์แล้วเห็นงานเก่าของตัวเอง ซึ่งสับสนหนัก
        var loadedFromUrl = (typeof tryLoadFromUrl === 'function') ? tryLoadFromUrl() : false;
        if (!loadedFromUrl) tryRestoreAutosave();
        if (!loadedFromUrl) maybeShowOnboardingOnFirstVisit();

        setupGlobalKeys();
    } catch (err) {
        console.error('init() ล้มเหลว:', err);
        document.body.innerHTML = '<div style="padding:40px;font-family:\'Share Tech Mono\',monospace;color:#F0575C;background:#0f1115;min-height:100vh;">' +
            '<h2 style="margin-bottom:10px;">NetForge โหลดไม่สำเร็จ</h2>' +
            '<p style="color:#d8dae0;">เกิดข้อผิดพลาดตอนเริ่มต้นระบบ ลองรีเฟรชหน้าเว็บ ถ้ายังไม่หายรบกวนแจ้งผู้พัฒนาพร้อมข้อความด้านล่างนี้</p>' +
            '<p style="opacity:0.6;font-size:14px;margin-top:10px;">' + (err && err.message ? err.message : String(err)) + '</p></div>';
    }
}

init();