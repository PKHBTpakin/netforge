/* ============================================
   tests/ui-stability.test.js — ชุดทดสอบ Theme / Canvas Stability (ui.js, topology.js)
   ============================================
   วิธีรัน:   node tests/ui-stability.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install อะไรเพิ่ม ไม่มี dependency ภายนอก (แพทเทิร์นเดียวกับ tests/save-load.test.js)

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):
   สไลด์อัปเดตโปรเจกต์ 25 ก.ค. 2569 อ้างว่ามีชุดเทสอัตโนมัติ "43+ Assertions" ครอบคลุมระบบธีม แต่ไฟล์เทส
   ตัวจริงไม่เคยถูกบันทึกลง repo เลย รันในเครื่องชั่วคราวตอนทำสไลด์แล้วหายไปพร้อมเครื่อง ทำให้ตัวเลขในสไลด์
   reproduce ไม่ได้อีก (ปัญหาเดียวกับที่ tests/save-load.test.js เจอมาก่อน) ไฟล์นี้เขียนขึ้นใหม่เพื่อให้ตัวเลข
   ที่อ้างในสไลด์เป็นของจริง รันซ้ำได้ทุกเมื่อ ไม่มีทางหายไปอีก

   ครอบคลุม:
   - Boot default: เปิดแอปครั้งแรก (ไม่มี localStorage เดิม) ต้องได้ Light Mode เสมอ ไม่ใช่ Dark รวมถึง
     กรณี localStorage อ่าน/เขียนไม่ได้เลย (private browsing, file://) ต้องไม่ทำให้ init() ล้ม
   - สลับธีมผ่าน toggleTheme() — ทางเข้าจริงที่ปุ่ม #btnTheme เรียก ไม่ใช่เรียก applyTheme() ตรงๆ: state,
     7 ตัวแปรสี, localStorage, ปุ่ม #btnTheme, toast ต้องอัปเดตถูกต้องครบทุกจุด ทั้งสองทิศทาง (light<->dark)
   - ตำแหน่ง Node ไม่เปลี่ยนตอน recolor: จำลองผู้ใช้ลาก Router/Switch/Department/PC ไปตำแหน่งใหม่ แล้วสลับธีม
     ตำแหน่ง (x,y) ต้องเท่าเดิมทุก pixel มีแต่สีเท่านั้นที่เปลี่ยน (recolorTopology ต้องไม่แตะ x/y เด็ดขาด)
   - จำลอง Event จริงบน UI: ไม่เรียกฟังก์ชันภายในตรงๆ แต่ยิง mousedown ผ่าน listener จริงที่
     setupCanvasEvents() ลงทะเบียนไว้ (เหมือนเบราว์เซอร์คลิกจริง) ไล่ตาม flow วาง PC + ลากเชื่อม Switch

   วิธีทดสอบ: โหลดไฟล์ js/*.js ตัวจริงจากโปรเจกต์เข้า Node's vm module พร้อม stub DOM/Canvas/localStorage
   ขั้นต่ำ (ชุดเดียวกับ tests/save-load.test.js) แล้วขับผ่าน entry point จริงที่ผู้ใช้กด/ลาก ไม่ใช่ assertion ลอย ๆ
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js', 'js/tools.js', 'js/library.js', 'js/app.js'];

let capturedToasts = [];

// ---------- DOM / Browser API stubs (ชุดเดียวกับ tests/save-load.test.js เป๊ะ ๆ กันพฤติกรรมเพี้ยนระหว่างไฟล์เทส) ----------
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
        setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return (k in this) ? this[k] : null; },
        querySelectorAll: () => []
    };
}
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
const documentStub = {
    documentElement: makeElement('html'), body: makeElement('body'),
    getElementById, createElement: (tag) => makeElement(tag),
    addEventListener: () => {}, querySelectorAll: () => []
};
const localStorageStore = {};
let localStorageBroken = false;
const localStorageStub = {
    getItem: k => { if (localStorageBroken) throw new Error('SecurityError: localStorage unavailable'); return (k in localStorageStore ? localStorageStore[k] : null); },
    setItem: (k, v) => { if (localStorageBroken) throw new Error('SecurityError: localStorage unavailable'); localStorageStore[k] = String(v); },
    removeItem: k => { delete localStorageStore[k]; }
};

const sandbox = {
    console, setTimeout, clearTimeout,
    document: documentStub,
    window: { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1024, innerHeight: 768 },
    localStorage: localStorageStub,
    navigator: {},
    Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    FileReader: class { readAsText() {} },
    requestAnimationFrame: () => 1
};
const context = vm.createContext(sandbox);
for (const f of JS_FILES) {
    vm.runInContext(fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8'), context, { filename: f });
}
context.showToast = (msg, type) => { capturedToasts.push({ msg, type }); };

const results = [];
function check(label, cond, detail) { results.push({ label, pass: !!cond, detail: detail !== undefined ? String(detail) : '' }); }

(function () {
    // ===== ส่วนที่ 1: Boot Default =====
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
    localStorageBroken = false;
    vm.runInContext('init()', context);
    check('boot: default theme is light (no prior localStorage)', vm.runInContext('state.theme', context) === 'light', vm.runInContext('state.theme', context));
    check('boot: DEPT_COLORS points at LIGHT set', vm.runInContext('DEPT_COLORS === DEPT_COLORS_LIGHT', context));
    check('boot: ROUTER_COLOR points at LIGHT set', vm.runInContext('ROUTER_COLOR === ROUTER_COLOR_LIGHT', context));
    check('boot: <html data-theme> = light', vm.runInContext("document.documentElement.getAttribute('data-theme')", context) === 'light');
    check('boot: #btnTheme offers DARK (currently light)', /DARK/.test(vm.runInContext("document.getElementById('btnTheme').innerHTML", context)));

    localStorageStore['netforge_theme'] = 'dark';
    vm.runInContext('init()', context);
    check('boot: respects saved dark theme from localStorage', vm.runInContext('state.theme', context) === 'dark');
    check('boot: DEPT_COLORS points at DARK set when saved=dark', vm.runInContext('DEPT_COLORS === DEPT_COLORS_DARK', context));

    delete localStorageStore['netforge_theme'];
    localStorageBroken = true;
    let bootThrew = false;
    try { vm.runInContext('init()', context); } catch (e) { bootThrew = true; }
    check('boot: does not crash when localStorage throws entirely', !bootThrew);
    check('boot: falls back to light when localStorage unreadable', vm.runInContext('state.theme', context) === 'light', vm.runInContext('state.theme', context));
    localStorageBroken = false;

    // ===== ส่วนที่ 2: สลับธีมผ่าน toggleTheme() — ทางเข้าจริงที่ปุ่ม #btnTheme เรียก ไม่ใช่ applyTheme() ตรงๆ =====
    for (const k of Object.keys(localStorageStore)) delete localStorageStore[k];
    vm.runInContext('init()', context); // กลับสู่ light เสมอสำหรับส่วนนี้
    check('toggle-pre: starts at light', vm.runInContext('state.theme', context) === 'light');

    capturedToasts = [];
    vm.runInContext('toggleTheme()', context);
    check('toggle 1: state -> dark', vm.runInContext('state.theme', context) === 'dark');
    check('toggle 1: DEPT_COLORS -> DARK', vm.runInContext('DEPT_COLORS === DEPT_COLORS_DARK', context));
    check('toggle 1: ROUTER_COLOR -> DARK', vm.runInContext('ROUTER_COLOR === ROUTER_COLOR_DARK', context));
    check('toggle 1: PC_COLOR -> DARK', vm.runInContext('PC_COLOR === PC_COLOR_DARK', context));
    check('toggle 1: SERVER_COLOR -> DARK', vm.runInContext('SERVER_COLOR === SERVER_COLOR_DARK', context));
    check('toggle 1: localStorage persisted dark', localStorageStore['netforge_theme'] === 'dark');
    check('toggle 1: <html data-theme> cleared (dark = no attr per applyTheme logic)', vm.runInContext("document.documentElement.getAttribute('data-theme')", context) === '');
    check('toggle 1: #btnTheme now offers LIGHT', /LIGHT/.test(vm.runInContext("document.getElementById('btnTheme').innerHTML", context)));
    check('toggle 1: toast announces Dark Mode', capturedToasts.some(t => /Dark Mode/.test(t.msg)), JSON.stringify(capturedToasts));

    capturedToasts = [];
    vm.runInContext('toggleTheme()', context);
    check('toggle 2 (round-trip): state -> light', vm.runInContext('state.theme', context) === 'light');
    check('toggle 2: DEPT_COLORS -> LIGHT', vm.runInContext('DEPT_COLORS === DEPT_COLORS_LIGHT', context));
    check('toggle 2: localStorage persisted light', localStorageStore['netforge_theme'] === 'light');
    check('toggle 2: toast announces Light Mode', capturedToasts.some(t => /Light Mode/.test(t.msg)), JSON.stringify(capturedToasts));

    localStorageBroken = true;
    let toggleThrew = false;
    try { vm.runInContext('toggleTheme()', context); } catch (e) { toggleThrew = true; }
    check('toggle: does not crash when localStorage.setItem throws mid-toggle', !toggleThrew);
    check('toggle: in-memory state still switches even if persistence fails', vm.runInContext('state.theme', context) === 'dark', vm.runInContext('state.theme', context));
    localStorageBroken = false;

    // ===== ส่วนที่ 3: ตำแหน่ง Node ไม่เปลี่ยนตอน recolor (จำลองผู้ใช้ลาก Node เอง แล้วสลับธีม) =====
    vm.runInContext("loadExample('hospital')", context); // 7 แผนก — ตำแหน่งจาก layoutTopology() ครั้งแรก
    vm.runInContext(`
        (function () {
            topoNodes.router.x = 999; topoNodes.router.y = 111;
            topoNodes.switches[0].x = 555; topoNodes.switches[0].y = 222;
            topoNodes.departments[2].x = 333; topoNodes.departments[2].y = 444;
        })()
    `, context); // จำลองผู้ใช้ลาก Node ไปตำแหน่งใหม่ด้วยมือ (drag)

    const before = vm.runInContext(`({
        routerXY: [topoNodes.router.x, topoNodes.router.y],
        swXY: [topoNodes.switches[0].x, topoNodes.switches[0].y],
        deptXY: [topoNodes.departments[2].x, topoNodes.departments[2].y],
        swColor: topoNodes.switches[0].color
    })`, context);

    vm.runInContext('toggleTheme()', context); // สลับธีม -> เรียก recolorTopology() ภายใน

    const after = vm.runInContext(`({
        routerXY: [topoNodes.router.x, topoNodes.router.y],
        swXY: [topoNodes.switches[0].x, topoNodes.switches[0].y],
        deptXY: [topoNodes.departments[2].x, topoNodes.departments[2].y],
        swColor: topoNodes.switches[0].color
    })`, context);

    check('recolor: router position unchanged', JSON.stringify(before.routerXY) === JSON.stringify(after.routerXY), before.routerXY + ' -> ' + after.routerXY);
    check('recolor: switch position unchanged', JSON.stringify(before.swXY) === JSON.stringify(after.swXY), before.swXY + ' -> ' + after.swXY);
    check('recolor: department position unchanged', JSON.stringify(before.deptXY) === JSON.stringify(after.deptXY), before.deptXY + ' -> ' + after.deptXY);
    check('recolor: switch color DID change (theme actually applied)', before.swColor !== after.swColor, before.swColor + ' -> ' + after.swColor);

    const pcId = vm.runInContext('addManualNode(PCDevice, 777, 888).id', context);
    vm.runInContext('toggleTheme()', context);
    const pcAfter = vm.runInContext(`(function(){ var n = topoNodes.manualNodes.find(function(x){return x.id===${JSON.stringify(pcId)};}); return [n.x, n.y]; })()`, context);
    check('recolor: manual PC node position unchanged too', JSON.stringify(pcAfter) === JSON.stringify([777, 888]), pcAfter);

    // ===== ส่วนที่ 4: จำลอง Event จริงบน UI — ยิง mousedown ผ่าน listener จริงที่ setupCanvasEvents() ลงทะเบียนไว้ =====
    // รีเซ็ต canvas stub ก่อน เพราะ Section 1-2 เรียก init() ซ้ำหลายครั้ง (ทดสอบ boot) ทำให้มี listener สะสมค้างอยู่
    // ในการใช้งานจริง init() รันแค่ครั้งเดียวตอนโหลดหน้า — จุดนี้จำลอง "เปิดแอปใหม่" ให้ตรงสภาพจริงก่อนเช็ค
    elementsById.delete('topoCanvas');
    vm.runInContext('init()', context);
    vm.runInContext("clearAll(); loadExample('small')", context);
    const countBefore = vm.runInContext('topoNodes.manualNodes.length', context);

    vm.runInContext("togglePlacingMode('pc')", context); // เหมือนผู้ใช้กดปุ่ม PC จริง (มุมขวาบน)
    check('real-event: placingType armed after PC button', vm.runInContext('state.placingType', context) === 'pc');

    const canvasListeners = vm.runInContext("document.getElementById('topoCanvas')._listeners['mousedown']", context);
    check('real-event: setupCanvasEvents() registered exactly 1 mousedown listener', Array.isArray(canvasListeners) && canvasListeners.length === 1, canvasListeners && canvasListeners.length);

    // วางที่ (300,550) จงใจให้ห่างจาก Router (y~65) / Switch (y~200) / Department (y~350) ทุกแถว
    // กันพิกัดไปทับกล่อง Switch/Department ที่ layoutTopology() วางไว้แล้ว (ทำให้ hitTest คลุมเครือ)
    const PC_X = 300, PC_Y = 550;

    // ยิง event ผ่าน listener ที่จับได้จริง (ไม่เรียก addManualNode()/togglePlacingMode() ต่อกันตรงๆ) — จำลอง
    // browser dispatch เป๊ะตามรูปแบบที่ getCanvasCoords() ต้องการ (e.clientX/e.clientY)
    vm.runInContext(`document.getElementById('topoCanvas')._listeners['mousedown'][0]({ clientX: ${PC_X}, clientY: ${PC_Y} })`, context);

    const countAfter = vm.runInContext('topoNodes.manualNodes.length', context);
    check('real-event: mousedown while placing created exactly 1 new PC', countAfter === countBefore + 1, countBefore + ' -> ' + countAfter);
    check('real-event: placingType auto-cleared after placement (per real handler logic)', vm.runInContext('state.placingType', context) === null);
    const placedNode = vm.runInContext('topoNodes.manualNodes[topoNodes.manualNodes.length - 1]', context);
    check('real-event: placed node landed at clicked coords (300,550)', placedNode.x === PC_X && placedNode.y === PC_Y, placedNode.x + ',' + placedNode.y);

    // ต่อด้วย Connect: จำลองกดปุ่ม Connect แล้วคลิก PC -> คลิก Switch ผ่าน listener จริงเหมือนกันทั้งคู่
    vm.runInContext('toggleConnectMode()', context);
    const swX = vm.runInContext('topoNodes.switches[0].x', context), swY = vm.runInContext('topoNodes.switches[0].y', context);
    vm.runInContext(`document.getElementById('topoCanvas')._listeners['mousedown'][0]({ clientX: ${PC_X}, clientY: ${PC_Y} })`, context); // คลิก PC ที่เพิ่งวาง
    vm.runInContext(`document.getElementById('topoCanvas')._listeners['mousedown'][0]({ clientX: ${swX}, clientY: ${swY} })`, context); // คลิก Switch
    const linkedDeptId = vm.runInContext('topoNodes.manualNodes[topoNodes.manualNodes.length - 1].linkedDeptId', context);
    check('real-event: Connect flow via 2 real clicks linked PC to switch dept', linkedDeptId !== null, linkedDeptId);
    check('real-event: exactly 1 link created', vm.runInContext('topoNodes.links.length', context) === 1, vm.runInContext('topoNodes.links.length', context));

    // ===== รายงานผล =====
    console.log('\n=== NetForge UI Stability (Theme + Canvas) — Test Results ===\n');
    let pass = 0;
    for (const r of results) {
        console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
        if (r.pass) pass++;
    }
    console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
    process.exit(results.every(r => r.pass) ? 0 : 1);
})();
