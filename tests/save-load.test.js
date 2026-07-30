/* ============================================
   tests/save-load.test.js — ชุดทดสอบ Save/Load + Autosave (app.js)
   ============================================
   วิธีรัน:   node tests/save-load.test.js
   ต้องมี:    Node.js เท่านั้น (nodejs.org) ไม่ต้อง npm install อะไรเพิ่ม ไม่มี dependency ภายนอก

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):
   โปรเจกต์นี้เคยมีชุดเทส 2 รอบที่ "รันผ่านจริง" แต่ไม่เคยถูกบันทึกลง repo เลย
   (รันในเครื่องชั่วคราวตอนทำสไลด์อัปเดตโปรเจกต์ แล้วหายไปพร้อมเครื่อง — ทั้ง Onboarding Modal
   และตัวเลข "43 Assertions" ที่อ้างในสไลด์ 25 ก.ค. 2569) ผลคือทีมงานเองก็ reproduce ตัวเลขนั้นไม่ได้อีก
   ไฟล์นี้จงใจเขียนเป็น Node เปล่า ๆ ไม่พึ่ง framework ใด ๆ (ไม่ใช่ Jest/Mocha) เพื่อไม่ให้ "ต้อง npm install
   ก่อนถึงจะรันได้" กลายเป็นเหตุผลที่ไม่มีใครรันซ้ำอีก — copy โฟลเดอร์นี้ไปเครื่องไหนที่มี Node ก็รันได้ทันที

   ครอบคลุม:
   - exportProject(): โครงสร้างไฟล์ที่ export ถูกต้อง (schemaVersion, baseIp/baseCidr, departments,
     manualNodes+ip+link, vlan mapping)
   - applyProjectData() / onImportFileSelected(): import กลับมาแล้วข้อมูลตรงกับต้นฉบับ 100%
   - Validation: ไฟล์ null/ไม่ครบฟิลด์/ค่าเกินขอบเขต ต้องไม่ throw และต้องมี error toast ไม่ทำ state พัง
   - Edge case: ไฟล์เกิน 8 แผนก (ตัดเหลือ 8 ตามกติกาเดิมของ onAddDept), link ชี้ไปหา node ที่ไม่มีจริง
     (ต้องถูกกรองทิ้ง), next-counter (nextId/nextVlanId/nextManualNodeId/nextLinkId) หายไปจากไฟล์
     (ต้อง fallback เป็น max(id)+1)
   - Autosave: debounce เขียนลง localStorage เดียวไม่ถี่ตามทุกคีย์สโตรก, กู้คืนอัตโนมัติตอน init(),
     Clear All ต้องล้าง autosave key ทิ้งด้วย ไม่ให้กู้ข้อมูลเปล่ากลับมา

   วิธีทดสอบ: โหลดไฟล์ js/*.js ตัวจริงจากโปรเจกต์ (ไม่ใช่ก็อบปี้โค้ดมาเขียนใหม่) เข้า Node's vm module
   พร้อม stub DOM/Canvas/localStorage/Blob/FileReader ขั้นต่ำที่จำเป็น แล้วจำลอง flow ผู้ใช้จริง
   (โหลดตัวอย่าง → วาง PC → ลากเชื่อมสาย → Save → Clear → Load กลับ ฯลฯ) ไม่ใช่การเขียน assertion ลอย ๆ
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js', 'js/tools.js', 'js/library.js', 'js/app.js'];

let capturedToasts = [];
let capturedBlob = null;

// ---------- DOM / Browser API stubs (ขั้นต่ำที่พอให้ init() ทั้งไฟล์รันได้จริงโดยไม่พังกลางทาง) ----------
function makeClassList() {
    const set = new Set();
    return {
        add: (...c) => c.forEach(x => set.add(x)),
        remove: (...c) => c.forEach(x => set.delete(x)),
        toggle: (c, force) => { if (force === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (force) set.add(c); else set.delete(c); return set.has(c); },
        contains: (c) => set.has(c)
    };
}
function makeElement(tag) {
    return {
        tagName: tag, _listeners: {}, classList: makeClassList(), style: {}, dataset: {}, children: [],
        value: '', innerHTML: '', innerText: '', textContent: '',
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        removeEventListener() {},
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        click() {}, focus() {}, select() {}, remove() {},
        getBoundingClientRect() { return { width: 1024, height: 768, left: 0, top: 0 }; },
        setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
        querySelectorAll: () => []
    };
}
// Canvas 2D context ปลอม — รับทุก method call เป็น no-op, measureText คืนค่าคงที่กันลูป while ใน drawNodeBox() วนไม่รู้จบ
const ctxProxy = new Proxy({ fillStyle: '', strokeStyle: '', font: '', lineWidth: 0, textAlign: '', textBaseline: '', shadowBlur: 0, shadowColor: '' }, {
    get(t, p) { if (p === 'measureText') return () => ({ width: 10 }); if (p in t) return t[p]; return (...a) => undefined; },
    set(t, p, v) { t[p] = v; return true; }
});
const elementsById = new Map();
function getElementById(id) {
    if (!elementsById.has(id)) {
        const el = makeElement('div'); el.id = id;
        if (id === 'topoCanvas') { el.tagName = 'canvas'; el.parentElement = makeElement('div'); el.getContext = () => ctxProxy; }
        elementsById.set(id, el);
    }
    return elementsById.get(id);
}
class BlobStub { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } }
class FileReaderStub {
    readAsText(file) {
        try { const text = file.__text; if (this.onload) this.onload({ target: { result: text } }); }
        catch (e) { if (this.onerror) this.onerror(e); }
    }
}
const documentStub = {
    documentElement: makeElement('html'), body: makeElement('body'),
    getElementById, createElement: (tag) => makeElement(tag),
    addEventListener: () => {}, querySelectorAll: () => []
};
const localStorageStore = {};
const localStorageStub = {
    getItem: k => (k in localStorageStore ? localStorageStore[k] : null),
    setItem: (k, v) => { localStorageStore[k] = String(v); },
    removeItem: k => { delete localStorageStore[k]; }
};

const sandbox = {
    console, setTimeout, clearTimeout,
    document: documentStub,
    window: { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1024, innerHeight: 768 },
    localStorage: localStorageStub,
    navigator: {},
    Blob: BlobStub,
    URL: { createObjectURL: (b) => { capturedBlob = b; return 'blob:fake'; }, revokeObjectURL: () => {} },
    FileReader: FileReaderStub,
    requestAnimationFrame: () => 1
};
const context = vm.createContext(sandbox);
for (const f of JS_FILES) {
    vm.runInContext(fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8'), context, { filename: f });
}
context.showToast = (msg, type) => { capturedToasts.push({ msg, type }); };

const results = [];
function check(label, cond, detail) { results.push({ label, pass: !!cond, detail: detail !== undefined ? String(detail) : '' }); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    // ===== ส่วนที่ 1: Export ของโปรเจกต์ที่มีข้อมูลจริง (ตัวอย่าง Small Office + PC ที่วางเอง + ลิงก์) =====
    vm.runInContext("loadExample('small')", context);
    const manualId = vm.runInContext(`
        (function () {
            var n = addManualNode(PCDevice, 111, 222);
            var sw = topoNodes.switches[0];
            addLink(n.id, sw.id);
            n.ip = suggestNextIp(sw.deptId);
            return n.id;
        })()
    `, context);
    capturedBlob = null;
    vm.runInContext('exportProject()', context);
    check('export: blob captured', !!capturedBlob);
    let exported = null;
    try { exported = JSON.parse(capturedBlob.parts[0]); } catch (e) {}
    check('export: valid JSON', !!exported);
    check('export: schemaVersion=1', exported && exported.schemaVersion === 1);
    check('export: 3 departments (Small Office)', exported && exported.departments.length === 3, exported && exported.departments.length);
    check('export: baseIp/baseCidr match', exported && exported.baseIp === '192.168.1.0' && exported.baseCidr === 24, exported && (exported.baseIp + '/' + exported.baseCidr));
    check('export: 1 manualNode w/ ip+link', exported && exported.manualNodes.length === 1 && !!exported.manualNodes[0].ip && exported.manualNodes[0].linkedDeptId != null, exported && JSON.stringify(exported.manualNodes));
    check('export: 1 link', exported && exported.links.length === 1, exported && exported.links.length);
    check('export: vlan entries = 3', exported && exported.vlan.entries.length === 3, exported && exported.vlan.entries.length);

    const originalDeptNames = vm.runInContext('state.departments.map(d=>d.name)', context);
    const originalVlanEntries = vm.runInContext('Array.from(vlanRegistry.entries())', context);

    // ===== ส่วนที่ 2: Import กลับเข้า session ที่ล้างไปแล้ว ต้องได้ข้อมูลตรงเป๊ะ =====
    vm.runInContext('clearAll()', context);
    check('reset: departments cleared', vm.runInContext('state.departments.length', context) === 0);
    check('reset: manualNodes cleared', vm.runInContext('topoNodes.manualNodes.length', context) === 0);

    context.__testFile = { files: [{ __text: JSON.stringify(exported) }] };
    capturedToasts = [];
    vm.runInContext('onImportFileSelected(__testFile)', context);

    const afterDeptNames = vm.runInContext('state.departments.map(d=>d.name)', context);
    check('import: department count restored', afterDeptNames.length === 3, afterDeptNames.length);
    check('import: department names match', JSON.stringify(afterDeptNames) === JSON.stringify(originalDeptNames), afterDeptNames.join(',') + ' vs ' + originalDeptNames.join(','));
    check('import: base network restored', vm.runInContext("state.baseIp + '/' + state.baseCidr", context) === '192.168.1.0/24');
    check('import: manualNodes restored w/ ip', vm.runInContext('topoNodes.manualNodes.length', context) === 1 && !!vm.runInContext('topoNodes.manualNodes[0].ip', context));
    check('import: manualNode is real PCDevice instance (has getIpLabel)', vm.runInContext('typeof topoNodes.manualNodes[0].getIpLabel', context) === 'function');
    check('import: link restored', vm.runInContext('topoNodes.links.length', context) === 1);
    const afterVlanEntries = vm.runInContext('Array.from(vlanRegistry.entries())', context);
    check('import: vlan mapping restored', JSON.stringify(afterVlanEntries) === JSON.stringify(originalVlanEntries), JSON.stringify(afterVlanEntries) + ' vs ' + JSON.stringify(originalVlanEntries));
    check('import: success toast shown', capturedToasts.some(t => t.type === 'success'), JSON.stringify(capturedToasts));

    // ===== ส่วนที่ 3: Validation ต้องปฏิเสธไฟล์เสียโดยไม่ throw และไม่ทำ state พัง =====
    function tryApply(data) {
        try { vm.runInContext('applyProjectData(__badData)', Object.assign(context, { __badData: data })); return { threw: false }; }
        catch (e) { return { threw: true, err: String(e) }; }
    }
    capturedToasts = [];
    const r1 = tryApply(null);
    const r2 = tryApply({ schemaVersion: 1 }); // ขาดฟิลด์เกือบทั้งหมด
    const r3 = tryApply({ schemaVersion: 1, baseIp: '10.0.0.0', baseCidr: 99, departments: [], manualNodes: [], links: [] }); // CIDR เกินขอบเขต
    check('validation: null data does not throw', !r1.threw, r1.err);
    check('validation: incomplete data does not throw', !r2.threw, r2.err);
    check('validation: out-of-range cidr does not throw', !r3.threw, r3.err);
    check('validation: all 3 produced error toasts', capturedToasts.filter(t => t.type === 'error').length === 3, JSON.stringify(capturedToasts));
    check('validation: state untouched after rejection (still 3 depts from last successful import)', vm.runInContext('state.departments.length', context) === 3);

    // ===== ส่วนที่ 4: ไฟล์ผิดปกติ — เกิน 8 แผนก / link ค้าง / ไม่มี next-counter =====
    const corrupted = {
        schemaVersion: 1, baseIp: '10.0.0.0', baseCidr: 24,
        departments: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, name: 'D' + (i + 1), hosts: 10 })), // 9 แผนก ไม่มี nextId
        ipMode: 'v4',
        manualNodes: [{ id: 'm-5', type: 'pc', x: 10, y: 10, ip: null, linkedDeptId: null }],
        links: [{ id: 'link-9', fromId: 'm-5', toId: 'm-does-not-exist' }] // ลิงก์ค้าง ปลายทางไม่มีจริง
    };
    capturedToasts = [];
    vm.runInContext('applyProjectData(__corrupted)', Object.assign(context, { __corrupted: corrupted }));
    check('corrupt: truncated to 8 departments', vm.runInContext('state.departments.length', context) === 8, vm.runInContext('state.departments.length', context));
    check('corrupt: dangling link dropped', vm.runInContext('topoNodes.links.length', context) === 0, vm.runInContext('topoNodes.links.length', context));
    check('corrupt: nextId fallback > max dept id', vm.runInContext('state.nextId', context) > 8, vm.runInContext('state.nextId', context));
    check('corrupt: nextManualNodeId fallback > 5', vm.runInContext('nextManualNodeId', context) > 5, vm.runInContext('nextManualNodeId', context));
    check('corrupt: truncation warning toast shown', capturedToasts.some(t => /8 แผนกแรก/.test(t.msg)), JSON.stringify(capturedToasts));

    // ===== ส่วนที่ 5: Autosave — debounce เขียน localStorage + กู้คืนตอน init() + Clear ล้าง key =====
    vm.runInContext("loadExample('company')", context); // Corporate Network — 6 แผนก
    check('autosave: nothing written yet (still debouncing)', localStorageStub.getItem('netforge_autosave') === null);
    await sleep(750); // เกิน debounce 600ms
    const raw1 = localStorageStub.getItem('netforge_autosave');
    check('autosave: written to localStorage after debounce', !!raw1);
    const saved1 = raw1 ? JSON.parse(raw1) : null;
    check('autosave: snapshot has 6 departments (Corporate Network)', saved1 && saved1.departments.length === 6, saved1 && saved1.departments.length);

    vm.runInContext("onDetailInput(state.departments[0].id, 'hosts', 55)", context);
    vm.runInContext("onDetailInput(state.departments[0].id, 'hosts', 56)", context);
    vm.runInContext("onDetailInput(state.departments[0].id, 'hosts', 57)", context);
    await sleep(750);
    const saved2 = JSON.parse(localStorageStub.getItem('netforge_autosave'));
    check('autosave: rapid edits debounce into final value only', saved2.departments[0].hosts === 57, saved2.departments[0].hosts);

    const preservedDeptNames = vm.runInContext('state.departments.map(d=>d.name)', context);
    capturedToasts = [];
    vm.runInContext('init()', context); // จำลองเปิดแอปใหม่ (localStorage ยังมีข้อมูลค้างจากรอบก่อน)
    const afterInitNames = vm.runInContext('state.departments.map(d=>d.name)', context);
    check('restore: init() re-applies autosave data', JSON.stringify(afterInitNames) === JSON.stringify(preservedDeptNames), afterInitNames.join(',') + ' vs ' + preservedDeptNames.join(','));
    check('restore: shows "Autosave" toast', capturedToasts.some(t => /Autosave/.test(t.msg)), JSON.stringify(capturedToasts));

    vm.runInContext('clearAll()', context);
    await sleep(750);
    check('clear: autosave key removed from localStorage', localStorageStub.getItem('netforge_autosave') === null, localStorageStub.getItem('netforge_autosave'));

    capturedToasts = [];
    vm.runInContext('init()', context);
    check('fresh init: no departments after init with empty autosave', vm.runInContext('state.departments.length', context) === 0);
    check('fresh init: no restore toast fired', !capturedToasts.some(t => /Autosave/.test(t.msg)), JSON.stringify(capturedToasts));

    // ===== ส่วนที่ 6: ชื่อแผนกที่มาจากไฟล์ import ต้อง escape ก่อนแทรกลง innerHTML เสมอ (กัน XSS ผ่าน Save/Load) =====
    // จุดที่ทดสอบนี้เป็นรอยต่อระหว่างงาน Save/Load (import) กับงาน HTML-escape (render) — import เป็นทางเข้าของ
    // "ข้อมูลที่ไม่น่าเชื่อถือ" (ไฟล์ .json ใครก็แก้เองได้ก่อนเอามา Load) จึงต้องเช็คว่าชื่อแผนกที่หลุดผ่าน
    // isValidProjectData() เข้ามาได้ (เพราะ validation เช็คแค่ type เป็น string ไม่เช็ค XSS pattern) ยังโดน
    // escapeHtml() ครอบก่อนแสดงผลทุกจุดอยู่ดี
    const xssPayload = '"><img src=x onerror=alert(1)>';
    const xssProject = {
        schemaVersion: 1, baseIp: '10.0.0.0', baseCidr: 24,
        departments: [{ id: 1, name: xssPayload, hosts: 10 }],
        manualNodes: [], links: []
    };
    vm.runInContext('applyProjectData(__xss)', Object.assign(context, { __xss: xssProject }));
    vm.runInContext("switchTab('cli')", context); // CLI panel render เฉพาะตอนสลับแท็บมาดู ต้องบังคับ trigger เอง
    vm.runInContext("selectNode(state.departments[0].id, 'department')", context);
    const deptListHtml = vm.runInContext("document.getElementById('deptList').innerHTML", context);
    const tableHtml = vm.runInContext("document.getElementById('ipTableBody').innerHTML", context);
    const cliHtml = vm.runInContext("document.getElementById('cliRouterOutput').innerHTML", context);
    const detailHtml = vm.runInContext("document.getElementById('detailContent').innerHTML", context);
    check('xss-via-import: sidebar does not contain raw payload', !deptListHtml.includes(xssPayload), deptListHtml.slice(0, 120));
    check('xss-via-import: IP table does not contain raw payload', !tableHtml.includes(xssPayload));
    check('xss-via-import: CLI output does not contain raw payload', !cliHtml.includes(xssPayload));
    check('xss-via-import: detail panel does not contain raw payload', !detailHtml.includes(xssPayload));
    check('xss-via-import: sidebar shows escaped entities instead', deptListHtml.includes('&quot;&gt;&lt;img'), deptListHtml.slice(0, 120));

    // ===== รายงานผล =====
    console.log('\n=== NetForge Save/Load + Autosave — Test Results ===\n');
    let pass = 0;
    for (const r of results) {
        console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
        if (r.pass) pass++;
    }
    console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
    process.exit(results.every(r => r.pass) ? 0 : 1);
})();
