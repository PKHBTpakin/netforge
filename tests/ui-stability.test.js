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
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js', 'js/wan.js', 'js/cli.js', 'js/backdrop.js', 'js/practice.js', 'js/tools.js', 'js/library.js', 'js/history.js', 'js/export.js', 'js/app.js'];

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

// console ที่กลืน error "ที่ตั้งใจให้เกิด" ไว้ — เหตุผลเดียวกับใน library-util.test.js
// ช่วง localStorageBroken === true คือช่วงที่เราจงใจให้ storage พังเพื่อทดสอบทางกู้สถานการณ์
// error ที่โค้ดแอปพ่นตอนนั้นคือพฤติกรรมที่ถูกต้อง ไม่ใช่ปัญหา จึงไม่ควรรก stderr
// แต่ยังเก็บไว้และพ่นคืนทั้งหมดถ้ามี assertion ไหน fail
const mutedErrors = [];
const testConsole = {};
for (const k of Object.keys(console)) {
    testConsole[k] = typeof console[k] === 'function' ? console[k].bind(console) : console[k];
}
testConsole.error = function () {
    const line = Array.from(arguments).map(String).join(' ');
    if (localStorageBroken) { mutedErrors.push(line); return; }
    console.error.apply(console, arguments);
};
function dumpMutedErrors() {
    if (!mutedErrors.length) return;
    console.error('\n--- error ที่ถูกกลืนไว้ระหว่างเทสจำลอง storage พัง (' + mutedErrors.length + ') ---');
    mutedErrors.forEach(l => console.error(l));
}

const sandbox = {
    console: testConsole, setTimeout, clearTimeout,
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
    check('toggle 1: toast แจ้งว่าสลับเป็นโหมดมืด', capturedToasts.some(t => /โหมดมืด/.test(t.msg)), JSON.stringify(capturedToasts));

    capturedToasts = [];
    vm.runInContext('toggleTheme()', context);
    check('toggle 2 (round-trip): state -> light', vm.runInContext('state.theme', context) === 'light');
    check('toggle 2: DEPT_COLORS -> LIGHT', vm.runInContext('DEPT_COLORS === DEPT_COLORS_LIGHT', context));
    check('toggle 2: localStorage persisted light', localStorageStore['netforge_theme'] === 'light');
    check('toggle 2: toast แจ้งว่าสลับเป็นโหมดสว่าง', capturedToasts.some(t => /โหมดสว่าง/.test(t.msg)), JSON.stringify(capturedToasts));

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

    /* ===== ธีม: สลับแล้วส่วน HTML ต้องทาสีใหม่ด้วย (เพิ่ม 7 ต.ค. 2569) =====

       ผู้ใช้รายงานว่าในโหมดสว่าง ข้อความในตาราง IP แทบอ่านไม่ออก และเวลาชี้เมาส์
       จะเห็นเป็นแถบสีดำ ตรวจแล้วพบบั๊กสองเรื่องที่ชุดทดสอบ 817 ข้อเดิมจับไม่ได้เลย

       1. applyTheme() สลับตัวแปรสีให้ครบ สั่งวาด Canvas ใหม่ และ recolorTopology()
          แต่ไม่ได้สั่งให้ส่วน HTML วาดใหม่ สีประจำแผนกถูกฝังเป็น style="color:#xxxxxx"
          ตอน render ไม่ใช่ตัวแปร CSS (จำเป็น เพราะมี 12 สีหมุนเวียนตามแผนก)
          ตาราง IP / รายชื่อแผนก / แผงรายละเอียด จึงค้างสีของธีมเดิมไว้
          สีเหลือง #FDE047 ที่ออกแบบมาสำหรับพื้นดำ วัดบนพื้นขาวได้ประมาณ 1.4:1

       2. tailwind.config.js ผูกสีชุด dark กับตัวแปร CSS ไว้หมดแล้ว ยกเว้น dark-700
          ที่ฝังเป็น #1d212b ตายตัว และทุกแถวของตารางใช้ hover:bg-dark-700

       เป็นบั๊กแบบ "ไม่มี error ไม่มีอะไรพัง แค่คนอ่านไม่เห็น" จึงต้องถามด้วยข้อทดสอบ
       แบบ "ต้องไม่มีสีของอีกโหมดหลงเหลือ" ไม่ใช่ "ต้องมีสีนี้อยู่" */

    vm.runInContext("loadExample('company'); selectNode(state.departments[0].id, 'department');", context);
    const D_FIRST = vm.runInContext('DEPT_COLORS_DARK[0]', context);
    const L_FIRST = vm.runInContext('DEPT_COLORS_LIGHT[0]', context);
    const paneHtml = function (id) { return vm.runInContext("document.getElementById('" + id + "').innerHTML", context); };

    vm.runInContext("applyTheme('dark');", context);
    vm.runInContext("applyTheme('light');", context);
    check('theme-repaint: ตาราง IP ไม่เหลือสีของโหมดมืดหลังสลับไปสว่าง',
        paneHtml('ipTableBody').indexOf(D_FIRST) === -1, D_FIRST);
    check('theme-repaint: ตาราง IP ได้สีของโหมดสว่างมาจริง',
        paneHtml('ipTableBody').indexOf(L_FIRST) !== -1, L_FIRST);
    check('theme-repaint: รายชื่อแผนกฝั่งซ้ายไม่เหลือสีของโหมดมืด',
        paneHtml('deptList').indexOf(D_FIRST) === -1);
    check('theme-repaint: แผงรายละเอียดไม่เหลือสีของโหมดมืด',
        paneHtml('detailContent').indexOf(D_FIRST) === -1);

    vm.runInContext("applyTheme('dark');", context);
    check('theme-repaint: สลับกลับเป็นมืดแล้ว ตารางไม่เหลือสีของโหมดสว่าง',
        paneHtml('ipTableBody').indexOf(L_FIRST) === -1, L_FIRST);
    check('theme-repaint: สลับกลับเป็นมืดแล้ว ตารางได้สีของโหมดมืดมาจริง',
        paneHtml('ipTableBody').indexOf(D_FIRST) !== -1);
    check('theme-repaint: รายชื่อแผนกฝั่งซ้ายไม่เหลือสีของโหมดสว่าง',
        paneHtml('deptList').indexOf(L_FIRST) === -1);

    // สลับไปกลับ 6 รอบ ต้องนิ่ง ไม่สะสมสีค้างจากรอบก่อน
    let themeFlipOk = true;
    for (let i = 0; i < 3; i++) {
        vm.runInContext("applyTheme('light');", context);
        if (paneHtml('ipTableBody').indexOf(D_FIRST) !== -1) themeFlipOk = false;
        vm.runInContext("applyTheme('dark');", context);
        if (paneHtml('ipTableBody').indexOf(L_FIRST) !== -1) themeFlipOk = false;
    }
    check('theme-repaint: สลับไปกลับ 6 รอบแล้วยังไม่มีสีของอีกโหมดค้าง', themeFlipOk);

    /* ===== ธีม: สีพื้นแถวตอนชี้เมาส์ ต้องมาจากตัวแปร ไม่ใช่ค่าตายตัว ===== */

    const cfgSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'tailwind.config.js'), 'utf8');
    const darkPalette = (cfgSrc.match(/dark:\s*\{[^}]*\}/) || [''])[0];
    check('theme-hover: ชุดสี dark ใน tailwind.config.js ไม่มีโค้ดสีตายตัวเหลือแม้แต่ตัวเดียว',
        darkPalette.length > 0 && !/#[0-9a-fA-F]{3,8}/.test(darkPalette), darkPalette);

    const styleSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'css/style.css'), 'utf8');
    check('theme-hover: style.css ประกาศ --row-hover ครบทั้งสองธีม',
        (styleSrc.match(/--row-hover\s*:/g) || []).length >= 2,
        (styleSrc.match(/--row-hover\s*:/g) || []).length + ' ที่');

    const twSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'css/tailwind.css'), 'utf8');
    check('theme-hover: css/tailwind.css ที่คอมไพล์แล้ว ใช้ var(--row-hover) ไม่ใช่สี rgb ตายตัว',
        /hover\\:bg-dark-700:hover\{background-color:var\(--row-hover\)\}/.test(twSrc),
        (twSrc.match(/hover\\:bg-dark-700:hover\{[^}]*\}/) || ['(ไม่พบ)'])[0]);

    /* ===== css/tailwind.css ต้องตรงกับคลาสที่ใช้จริงในซอร์ส =====
       index.html เขียนเตือนไว้ว่า "ถ้าเพิ่มคลาส Tailwind ใหม่ ต้องรัน npm run build:css ก่อน commit"
       แต่ไม่มีอะไรบังคับ รอบ 7 ต.ค. ลืมรันจริง ทำให้ text-[17px] whitespace-nowrap pr-4
       ไม่มีสไตล์บนเว็บจริงทั้งที่เห็นในโค้ด ข้อนี้จับแทนสายตาคน

       ยกเว้น fa-* กับ fas ของ Font Awesome (มาจาก CDN) และคลาสที่ labguide.js
       กำหนดสไตล์ไว้ใน HTML ที่มันสร้างเอง กับคลาสที่ใช้เป็นตัวเกาะให้ JS เท่านั้น */
    const ALLOW_CLASSES = ['fas', 'far', 'fab', 'help-pane', 'tab-content', 'note', 'tag', 'cfg', 'copy'];
    function cssEscapeClass(t) {
        return '.' + t.replace(/([\[\]\.\/\(\)#%])/g, '\\$1').replace(/:/g, '\\:');
    }
    const srcFiles = ['index.html'].concat(
        fs.readdirSync(path.join(PROJECT_ROOT, 'js')).filter(function (f) { return f.endsWith('.js'); }).map(function (f) { return 'js/' + f; })
    );
    const usedClasses = new Set();
    srcFiles.forEach(function (f) {
        const text = fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8');
        const re = /class=["']([^"'<>+]*?)["']/g;
        let m;
        while ((m = re.exec(text))) {
            m[1].split(/\s+/).forEach(function (t) {
                if (/^[a-z][a-z0-9:_\-\[\]\.\/%]*$/.test(t) && t.indexOf('fa-') !== 0 && ALLOW_CLASSES.indexOf(t) === -1) {
                    usedClasses.add(t);
                }
            });
        }
    });
    const missingStyle = Array.from(usedClasses).filter(function (t) {
        const sel = cssEscapeClass(t);
        return twSrc.indexOf(sel) === -1 && styleSrc.indexOf(sel) === -1;
    });
    check('build-css: ทุกคลาสที่ใช้ในซอร์สมีสไตล์จริงใน tailwind.css หรือ style.css',
        missingStyle.length === 0,
        missingStyle.length > 0 ? 'ขาด ' + missingStyle.length + ' ตัว: ' + missingStyle.join(' ') + ' — ลืมรัน npm run build:css หรือเปล่า' : usedClasses.size + ' คลาส');

    /* ===== กล่อง CLI Config ต้องตามธีม และต้องอ่านออกจริงทั้งสองโหมด (7 ต.ค. 2569) =====

       เดิมกล่องนี้ถูกตรึงเป็นจอดำเสมอ พร้อมคอมเมนต์เตือนว่าห้ามใช้ var() กับสีตัวอักษร
       แต่บรรทัด .cmd กลับใช้ var(--neon) จริง ๆ ผลคือในโหมดสว่าง คำสั่ง Cisco ทุกคำ
       กลายเป็น #1841B8 บนพื้นดำ วัดได้ 2.49:1 ต่ำกว่าเกณฑ์ AA เกือบครึ่ง
       ผู้ใช้เลือกให้กล่องนี้ตามธีมไปด้วย จึงย้ายมาใช้ตัวแปร --cli-* ทั้งชุด

       ข้อทดสอบชุดนี้ไม่ได้เชื่อตัวเลขที่เขียนในคอมเมนต์ แต่อ่านค่าสีจาก style.css
       แล้วคำนวณสูตร WCAG ใหม่เองทุกครั้งที่รัน ถ้ามีใครแก้สีจนตกเกณฑ์จะฟ้องทันที
       ไม่ต้องรอให้ใครสังเกตเห็นด้วยตาเปล่า */

    function srgbChannel(v) {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    function relLuminance(hex) {
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map(function (x) { return x + x; }).join('') : h;
        return 0.2126 * srgbChannel(parseInt(full.slice(0, 2), 16)) +
               0.7152 * srgbChannel(parseInt(full.slice(2, 4), 16)) +
               0.0722 * srgbChannel(parseInt(full.slice(4, 6), 16));
    }
    function contrastRatio(a, b) {
        const la = relLuminance(a), lb = relLuminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    // ดึงค่าตัวแปรจากบล็อกธีมที่ระบุ โดยตัดคอมเมนต์ /* ... */ ออกก่อน กันอ่านตัวเลขในคำอธิบายมาเป็นค่าสี
    function themeVars(cssText, selector) {
        const start = cssText.indexOf(selector);
        if (start === -1) return {};
        const open = cssText.indexOf('{', start);
        const close = cssText.indexOf('\n}', open);
        const body = cssText.slice(open, close).replace(/\/\*[\s\S]*?\*\//g, '');
        const out = {};
        const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
        let m;
        while ((m = re.exec(body))) out[m[1]] = m[2].trim();
        return out;
    }

    const cssText = fs.readFileSync(path.join(PROJECT_ROOT, 'css/style.css'), 'utf8');
    const darkVars = themeVars(cssText, ':root');
    const lightVars = themeVars(cssText, '[data-theme="light"]');
    const CLI_TOKENS = [
        ['--cli-text', 'ข้อความเปล่า'],
        ['--cli-cmd', 'คำสั่ง Cisco'],
        ['--cli-value', 'ค่า/IP'],
        ['--cli-comment', 'คอมเมนต์']
    ];

    [['โหมดมืด', darkVars], ['โหมดสว่าง', lightVars]].forEach(function (pair) {
        const label = pair[0], vars = pair[1];
        const bg = vars['--cli-bg'];
        check('cli-theme: ' + label + ' ประกาศ --cli-bg ไว้', /^#[0-9a-fA-F]{3,8}$/.test(String(bg)), String(bg));
        CLI_TOKENS.forEach(function (t) {
            const key = t[0], name = t[1];
            const val = vars[key];
            if (!/^#[0-9a-fA-F]{3,8}$/.test(String(val)) || !/^#[0-9a-fA-F]{3,8}$/.test(String(bg))) {
                check('cli-theme: ' + label + ' ' + name + ' (' + key + ') เป็นโค้ดสีที่อ่านได้', false, String(val));
                return;
            }
            const ratio = contrastRatio(val, bg);
            check('cli-theme: ' + label + ' ' + name + ' อ่านออกบนพื้นกล่อง CLI (ต้อง >= 4.5)',
                ratio >= 4.5, val + ' บน ' + bg + ' = ' + ratio.toFixed(2) + ':1');
        });
    });

    // โหมดมืดต้องหน้าตาเท่าเดิมเป๊ะ ไม่ใช่ "ปรับไปด้วยเลย" ตอนแก้โหมดสว่าง
    check('cli-theme: โหมดมืดยังใช้ค่าสีเดิมทุกตัว ไม่ได้เปลี่ยนไปด้วย',
        darkVars['--cli-bg'] === '#000000' && darkVars['--cli-cmd'] === '#5C97FF' &&
        darkVars['--cli-value'] === '#94A3B8' && darkVars['--cli-comment'] === '#9BA4B8',
        [darkVars['--cli-bg'], darkVars['--cli-cmd'], darkVars['--cli-value'], darkVars['--cli-comment']].join(' '));

    // ตัวบล็อก .cli-output กับ token ของมัน ต้องไม่มีโค้ดสีตายตัวเหลือ
    const cliBlockStart = cssText.indexOf('.cli-output {');
    const cliBlockEnd = cssText.indexOf('.cli-output .value');
    const cliBlock = cliBlockStart !== -1 && cliBlockEnd !== -1
        ? cssText.slice(cliBlockStart, cliBlockEnd + 60).replace(/\/\*[\s\S]*?\*\//g, '') : '';
    check('cli-theme: บล็อก .cli-output ไม่มีโค้ดสีตายตัวหลงเหลือ',
        cliBlock.length > 0 && !/#[0-9a-fA-F]{3,8}/.test(cliBlock),
        (cliBlock.match(/#[0-9a-fA-F]{3,8}/g) || []).join(' '));
    check('cli-theme: .cli-output กำหนดสีตัวอักษรของตัวเอง ไม่ปล่อยให้สืบทอด --text มา',
        /\.cli-output\s*\{[^}]*color:\s*var\(--cli-text\)/.test(cssText));

    // สีที่ CLI เคยใช้แล้วตกเกณฑ์ ห้ามกลับมา
    check('cli-theme: .cmd เลิกใช้ var(--neon) แล้ว (ตกเกณฑ์ 2.49:1 บนพื้นดำในโหมดสว่าง)',
        !/\.cli-output\s+\.cmd\s*\{[^}]*var\(--neon\)/.test(cssText));

    // ทุก span ที่ cli.js สร้างจริง ต้องมีสีกำหนดไว้ครบ ไม่มีตัวไหนตกหล่น
    const cliJs = fs.readFileSync(path.join(PROJECT_ROOT, 'js/cli.js'), 'utf8');
    const spanClasses = Array.from(new Set((cliJs.match(/class="([a-z]+)"/g) || []).map(function (x) {
        return x.replace(/class="|"/g, '');
    })));
    const unstyled = spanClasses.filter(function (c) { return cssText.indexOf('.cli-output .' + c) === -1; });
    check('cli-theme: ทุกคลาสที่ cli.js ใช้มีสีกำหนดไว้ใน style.css ครบ',
        unstyled.length === 0, unstyled.length ? 'ขาด: ' + unstyled.join(' ') : spanClasses.join(' '));

    /* ===== ห้ามฝังโค้ดสีเป็น "สีตัวอักษร" ลงในไฟล์ JS ของหน้าแอป (8 ต.ค. 2569) =====

       รอบ 7 ต.ค. กวาดสีโดยค้นหาทีละชื่อ (#1F7A45 กับ #b8790f) ซึ่งแคบเกินไป
       จึงพลาด #f0a020 ที่ฝังไว้อีกสองที่ และตัวที่สำคัญคือหัวข้อกล่องเตือน
       "Router นี้ยังใช้งานไม่ได้" ใน ui.js ที่เป็นข้อความตัวหนา
       วัดบนพื้นกล่องเตือนในโหมดสว่างได้ 2.01:1 คือแทบมองไม่เห็น

       ข้อนี้จึงถามกลับด้านว่า "ต้องไม่มีโค้ดสีใด ๆ ถูกใช้เป็นสีตัวอักษรเลย"
       แทนการไล่ชื่อสีทีละตัว เพิ่มสีใหม่กี่ตัวก็จับได้หมดโดยไม่ต้องแก้เทส
       สีที่เป็นพื้นหรือเส้นขอบแบบ rgba(...) ไม่นับ เพราะเป็นสีเคลือบบาง ๆ ที่ใช้ได้ทั้งสองธีม */

    const COLOR_EXEMPT = {
        // CSS ของไฟล์ HTML ที่โปรแกรมสร้างออกไปให้ผู้ใช้ดาวน์โหลด เป็นเอกสารสำหรับพิมพ์
        // พื้นขาวเสมอ ไม่ได้อยู่ในหน้าแอปและไม่มีระบบธีม
        'labguide.js': 'CSS ของคู่มือ Lab ที่ export ออกไป',
        // หน้าจอ fallback ตอน init() ล้ม ต้องใช้ค่าตายตัวเพราะตอนนั้น CSS อาจโหลดไม่สำเร็จ
        // ถ้าใช้ var() แล้วไฟล์ CSS หาย ข้อความแจ้ง error จะมองไม่เห็นเลย ซึ่งแย่ที่สุด
        'app.js': 'หน้าจอแจ้ง error ตอนระบบเริ่มไม่ขึ้น'
    };
    const jsFiles = fs.readdirSync(path.join(PROJECT_ROOT, 'js')).filter(function (f) { return f.endsWith('.js'); });
    const inlineColorOffenders = [];
    jsFiles.forEach(function (f) {
        if (COLOR_EXEMPT[f]) return;
        const lines = fs.readFileSync(path.join(PROJECT_ROOT, 'js', f), 'utf8').split('\n');
        lines.forEach(function (line, i) {
            const m = line.match(/color:\s*#[0-9a-fA-F]{3,8}/g);
            if (m) inlineColorOffenders.push(f + ':' + (i + 1) + ' ' + m.join(' '));
        });
    });
    check('no-hex: ไม่มีไฟล์ JS ของหน้าแอปไฟล์ไหนฝังโค้ดสีเป็นสีตัวอักษร',
        inlineColorOffenders.length === 0,
        inlineColorOffenders.length ? inlineColorOffenders.join(' · ') + ' — ให้ใช้ var(--warn) var(--ok) var(--hot) var(--text) แทน'
                                    : 'ตรวจ ' + (jsFiles.length - Object.keys(COLOR_EXEMPT).length) + ' ไฟล์');

    // ไฟล์ที่ยกเว้นต้องยังมีอยู่จริง ไม่ใช่รายชื่อที่ตกค้างจากไฟล์ที่ถูกลบไปแล้ว
    check('no-hex: รายชื่อไฟล์ที่ยกเว้นยังตรงกับไฟล์จริงในโปรเจกต์',
        Object.keys(COLOR_EXEMPT).every(function (f) { return jsFiles.indexOf(f) !== -1; }),
        Object.keys(COLOR_EXEMPT).join(' '));

    /* กล่องเตือนในโหมดสว่างต้องอ่านออกจริง วัดโดยผสมสีพื้นโปร่งแสงลงบนพื้นการ์ดก่อน
       ไม่ใช่วัดกับพื้นการ์ดเปล่า ๆ ซึ่งจะได้ตัวเลขที่ดูดีกว่าความจริง */
    function blendOver(fgHex, alpha, bgHex) {
        const f = fgHex.replace('#', ''), b = bgHex.replace('#', '');
        const out = [0, 2, 4].map(function (i) {
            const fv = parseInt(f.slice(i, i + 2), 16), bv = parseInt(b.slice(i, i + 2), 16);
            return Math.round(fv * alpha + bv * (1 - alpha));
        });
        return '#' + out.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
    }
    [['โหมดมืด', darkVars, '#171a21'], ['โหมดสว่าง', lightVars, '#FFFFFF']].forEach(function (t) {
        const label = t[0], vars = t[1], card = t[2];
        const panelBg = blendOver('#F0A020', 0.10, card);  // rgba(240,160,32,0.1) ที่ใช้เป็นพื้นกล่องเตือน
        const warn = vars['--warn'];
        const r = contrastRatio(warn, panelBg);
        check('no-hex: ' + label + ' หัวข้อกล่องเตือนอ่านออกบนพื้นกล่องเตือนจริง (ต้อง >= 4.5)',
            r >= 4.5, warn + ' บน ' + panelBg + ' = ' + r.toFixed(2) + ':1');
    });

    // ===== รายงานผล =====
    console.log('\n=== NetForge UI Stability (Theme + Canvas) — Test Results ===\n');
    let pass = 0;
    for (const r of results) {
        console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
        if (r.pass) pass++;
    }
    console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
    if (!results.every(r => r.pass)) dumpMutedErrors(); // มีอะไรพัง -> คืน error ที่กลืนไว้ให้ครบ
    // จบด้วย process.exitCode ไม่ใช่การสั่งให้โปรเซสตายทันที — เหตุผลเต็มอยู่ใน tests/run-all.js
    process.exitCode = results.every(r => r.pass) ? 0 : 1;
})();
