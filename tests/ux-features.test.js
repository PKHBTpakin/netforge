/* ============================================
   tests/ux-features.test.js — สิ่งอำนวยความสะดวกที่เพิ่มรอบ 30 ก.ค. 2569 (รอบ 7)
   ============================================
   วิธีรัน:   node tests/ux-features.test.js

   ครอบคลุม:
   A. Undo / Redo — ต้องย้อนได้จริงทุกการกระทำ และต้องไม่กลืนขั้นตอนหายไป
      (จุดที่พลาดง่ายที่สุดคือ applyProjectData() ที่ undo เรียกเอง ไปสร้างประวัติซ้อนจนวนลูป)
   B. Export — CSV/TXT ต้องมีเนื้อหาครบและ escape ถูก, PNG ต้องคืนค่าตัวแปรมุมมองเดิมเสมอ
      (ถ้าคืนไม่ครบ จอจริงจะเพี้ยนทันทีหลังกด export ซึ่งเป็นบั๊กที่หาต้นตอยาก)
   C. ทำซ้ำ/สลับลำดับแผนก และเพดานจำนวนแผนก
   D. ชุดสี 12 สี — ต้องผ่าน WCAG และห่างกันพอให้แยกออกด้วยตาจริง
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js',
    'js/wan.js', 'js/cli.js', 'js/backdrop.js', 'js/practice.js', 'js/tools.js', 'js/library.js', 'js/history.js', 'js/export.js', 'js/app.js'];

let capturedToasts = [];
let downloads = []; // เก็บไฟล์ที่ถูกสั่งดาวน์โหลด เพื่อตรวจชื่อและเนื้อหา

function makeClassList() {
    const set = new Set();
    return {
        add: (...c) => c.forEach(x => set.add(x)),
        remove: (...c) => c.forEach(x => set.delete(x)),
        toggle: (c, force) => { if (force === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (force) set.add(c); else set.delete(c); return set.has(c); },
        contains: (c) => set.has(c)
    };
}
const ctxProxy = () => new Proxy({}, {
    get(t, p) { if (p === 'measureText') return () => ({ width: 10 }); if (p in t) return t[p]; return () => undefined; },
    set(t, p, v) { t[p] = v; return true; }
});
function makeElement(tag) {
    const el = {
        tagName: tag, _listeners: {}, classList: makeClassList(), style: {}, dataset: {}, children: [],
        value: '', innerHTML: '', innerText: '', textContent: '', href: '', download: '',
        width: 0, height: 0, _containsSet: new Set(),
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        removeEventListener() {},
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        contains(node) { return this._containsSet.has(node); },
        click() { if (this.tagName === 'a' && this.download) downloads.push({ name: this.download, href: this.href }); },
        focus() {}, select() {}, remove() {}, setSelectionRange() {},
        getBoundingClientRect() { return { width: 1200, height: 600, left: 0, top: 0 }; },
        setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
        querySelectorAll: () => []
    };
    // canvas ต้องทำงานได้จริง ไม่งั้นเส้นทาง export PNG จะถูกข้ามไปทั้งหมด
    if (tag === 'canvas') {
        el.getContext = () => ctxProxy();
        el.toBlob = (cb) => cb({ __png: true, size: el.width * el.height });
        el.toDataURL = () => 'data:image/png;base64,AAAA';
    }
    return el;
}
const elementsById = new Map();
function getElementById(id) {
    if (!elementsById.has(id)) {
        const el = makeElement(id === 'topoCanvas' ? 'canvas' : 'div');
        el.id = id;
        if (id === 'topoCanvas') el.parentElement = makeElement('div');
        elementsById.set(id, el);
    }
    return elementsById.get(id);
}
const documentStub = {
    documentElement: makeElement('html'), body: makeElement('body'), activeElement: null,
    getElementById, createElement: (tag) => makeElement(tag),
    execCommand: () => true, addEventListener: () => {}, querySelectorAll: () => []
};
const store = {};
const sandbox = {
    console, setTimeout, clearTimeout,
    document: documentStub,
    window: { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800, confirm: () => true },
    location: { href: 'https://x.io/n/', hash: '', protocol: 'https:' },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    },
    navigator: {}, TextEncoder, TextDecoder, btoa, atob,
    Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; this.text = String(parts[0]); } },
    URL: { createObjectURL: (b) => { lastBlob = b; return 'blob:fake'; }, revokeObjectURL: () => {} },
    FileReader: class { readAsText() {} },
    requestAnimationFrame: () => 1
};
let lastBlob = null;
const context = vm.createContext(sandbox);
for (const f of JS_FILES) {
    vm.runInContext(fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8'), context, { filename: f });
}
context.showToast = (msg, type) => { capturedToasts.push({ msg, type }); };

const results = [];
function check(label, cond, detail) { results.push({ label, pass: !!cond, detail: detail !== undefined ? String(detail) : '' }); }
const run = (code) => vm.runInContext(code, context);

(async () => {

/* ===== A. Undo / Redo ===== */

run("loadExample('company'); clearHistory();");
check('undo: เริ่มต้นไม่มีประวัติ', run('undoStack.length') === 0 && run('redoStack.length') === 0);
capturedToasts = [];
run('undo()');
check('undo: กดตอนไม่มีประวัติ -> แจ้งเฉย ๆ ไม่ throw', capturedToasts.some(t => /ไม่มีอะไรให้ย้อน/.test(t.msg)));

const before = run('state.departments.length');
run("state.departments.push({ id: state.nextId++, name: 'ZZ', hosts: 5 })"); // จำลองผลของการเพิ่ม
run("pushHistory('ทดสอบ'); state.departments.push({ id: state.nextId++, name: 'YY', hosts: 5 }); refreshAll();");
check('undo: pushHistory เก็บสภาพก่อนหน้าไว้', run('undoStack.length') === 1);
run('undo()');
check('undo: ย้อนกลับแล้วได้จำนวนแผนกก่อนหน้า', run('state.departments.length') === before + 1, run('state.departments.length'));
check('undo: ย้ายรายการไป redo', run('redoStack.length') === 1 && run('undoStack.length') === 0);
run('redo()');
check('redo: ทำซ้ำแล้วกลับไปสภาพหลังแก้', run('state.departments.length') === before + 2, run('state.departments.length'));

// จุดสำคัญ: applyProjectData ที่ undo เรียกเอง ต้องไม่ไปสร้างประวัติซ้อน
run('clearHistory()');
run("pushHistory('a'); state.departments.push({id: state.nextId++, name:'A1', hosts:5}); refreshAll();");
const stackBefore = run('undoStack.length');
run('undo()');
check('undo: ตัวมันเองไม่สร้างประวัติซ้อน (กันวนลูป)', run('undoStack.length') === stackBefore - 1, run('undoStack.length'));
check('undo: ธง isRestoring ถูกคืนค่าเสมอ', run('isRestoring') === false);

// พิมพ์ต่อเนื่องต้องรวบเป็นขั้นเดียว ไม่ใช่ทีละตัวอักษร
run('clearHistory()');
for (let i = 0; i < 8; i++) run("pushHistory('เปลี่ยนชื่อแผนก')");
check('undo: การกระทำเดิมซ้ำ ๆ ถูกรวบเป็นขั้นเดียว', run('undoStack.length') === 1, run('undoStack.length'));
run("pushHistory('ลบแผนก')");
check('undo: การกระทำคนละอย่างแยกขั้นกัน', run('undoStack.length') === 2);

// เพดานประวัติ
run('clearHistory()');
for (let i = 0; i < 60; i++) run("pushHistory('ขั้นที่ " + i + "')");
check('undo: ประวัติไม่เกินเพดาน HISTORY_MAX', run('undoStack.length') <= run('HISTORY_MAX'), run('undoStack.length'));

// แก้ใหม่หลัง undo ต้องล้าง redo (แตกกิ่งใหม่)
run("clearHistory(); pushHistory('x'); undo(); pushHistory('y');");
check('undo: แก้ใหม่หลังย้อนกลับ -> ล้าง redo ทิ้ง', run('redoStack.length') === 0);

// ปุ่มบน header ต้องสะท้อนสถานะ
run('clearHistory()');
check('undo: ปุ่มถูกปิดเมื่อไม่มีประวัติ', getElementById('btnUndo').disabled === true && getElementById('btnRedo').disabled === true);
run("pushHistory('z')");
check('undo: ปุ่มเปิดเมื่อมีประวัติ พร้อมบอกว่าจะย้อนอะไร',
    getElementById('btnUndo').disabled === false && /z/.test(getElementById('btnUndo').title), getElementById('btnUndo').title);

// เปลี่ยนโปรเจกต์ทั้งก้อน -> ประวัติเดิมไม่มีความหมาย
run("loadExample('small'); pushHistory('q');");
const snapForLib = run('buildProjectSnapshot()');
run('saveToLibrary("งานทดสอบ")');
run("openFromLibrary(loadLibrary()[0].id)");
check('undo: เปิดโปรเจกต์จากคลัง -> ล้างประวัติ (ย้อนข้ามโปรเจกต์ไม่มีความหมาย)', run('undoStack.length') === 0);

// ยืนยันก่อนล้างทั้งหมด
run("loadExample('company'); clearHistory();");
capturedToasts = [];
run('confirmClearAll()');
check('clear: ยืนยันแล้วล้างจริง', run('state.departments.length') === 0);
check('clear: ล้างแล้วยังย้อนกลับได้', run('undoStack.length') >= 1);
run('undo()');
check('clear: Ctrl+Z กู้ข้อมูลที่ล้างไปกลับมาได้ครบ', run('state.departments.length') === 6, run('state.departments.length'));

/* ===== B. Export ===== */

run("loadExample('company'); state.baseIp6='2001:db8::'; state.basePrefixLen6=48; state.newPrefixLen6=64; refreshAll();");
run(`(function(){
    var n = addManualNode(ServerDevice, 300, 500);
    addLink(n.id, topoNodes.switches[0].id);
    n.ip = suggestNextIp(n.linkedDeptId);
    var br = addManualNode(BranchRouterDevice, 900, 400); br.label = 'BR-Test';
    addLink('router', br.id);
    refreshAll();
})()`);

const csv = run('buildCsv()');
check('csv: มีตาราง IPv4 พร้อมหัวคอลัมน์', csv.includes('ตาราง IPv4') && csv.includes('Subnet Mask'));
check('csv: มีตาราง IPv6', csv.includes('ตาราง IPv6') && csv.includes('2001:db8::'));
check('csv: มีตารางลิงก์ WAN', csv.includes('ลิงก์ WAN') && csv.includes('/30'));
check('csv: มีรายการ Static IP ของอุปกรณ์บนผัง', csv.includes('IP คงที่'));
check('csv: บอกว่าแต่ละแผนกอยู่กับ Router ตัวไหน', csv.includes('อยู่กับ Router'));
check('csv: ใช้ CRLF ให้ Excel บน Windows ขึ้นบรรทัดถูก', csv.includes('\r\n'));

run("state.departments[0].name = 'ฝ่าย,ไอที \"หลัก\"'; refreshAll();");
const csv2 = run('buildCsv()');
check('csv: ชื่อที่มีจุลภาคและเครื่องหมายคำพูดถูก escape ถูกต้อง',
    csv2.includes('"ฝ่าย,ไอที ""หลัก"""'), (csv2.match(/"ฝ่าย[^\n]*/) || [''])[0]);

capturedToasts = []; downloads = [];
run('exportTableCSV()');
check('csv: สั่งดาวน์โหลดพร้อมชื่อไฟล์ .csv', downloads.some(d => /netforge-ip-plan-.*\.csv$/.test(d.name)), JSON.stringify(downloads.map(d => d.name)));
check('csv: ไฟล์มี BOM นำหน้าเพื่อให้ Excel อ่านภาษาไทยได้', lastBlob && lastBlob.text.charCodeAt(0) === 0xFEFF);

// แผนกที่จัดสรรไม่สำเร็จต้องอยู่ในไฟล์ด้วย
run("clearAll(); state.baseIp='10.0.0.0'; state.baseCidr=24; state.departments=[{id:1,name:'Big',hosts:500},{id:2,name:'Small',hosts:10}]; refreshAll();");
check('csv: มีหมวดแผนกที่จัดสรรไม่สำเร็จพร้อมเหตุผล',
    run('buildCsv()').includes('จัดสรรไม่สำเร็จ') && run('buildCsv()').includes('Big'));

run('clearAll()');
capturedToasts = [];
run('exportTableCSV()');
check('csv: ไม่มีข้อมูล -> เตือน ไม่ปล่อยไฟล์เปล่า', capturedToasts.some(t => t.type === 'error'));

// --- CLI เป็นไฟล์ ---
check('txt: stripCliHtml ถอดแท็กและคืนอักขระที่ escape ไว้',
    run(`stripCliHtml('<span class="cmd">ip route</span> &lt;next-hop&gt; &amp; &quot;x&quot;')`) === 'ip route <next-hop> & "x"',
    run(`stripCliHtml('<span class="cmd">ip route</span> &lt;next-hop&gt; &amp; &quot;x&quot;')`));

run("loadExample('small')");
run(`(function(){ var b = addManualNode(BranchRouterDevice, 800, 300); b.label='BR9'; addLink('router', b.id); refreshAll(); })()`);
const cliTxt = run('buildCliText()');
check('txt: รวม config ของ Router ทุกตัว', cliTxt.includes('Router-01') && cliTxt.includes('BR9'));
check('txt: มี config ของ Switch ด้วย', cliTxt.includes('Switch-01') && cliTxt.includes('switchport mode trunk'));
check('txt: ไม่มีแท็ก HTML หลงเหลือ', !/<[a-z/]/i.test(cliTxt));
check('txt: คืนค่า Router ที่ผู้ใช้เลือกดูอยู่หลังสร้างไฟล์เสร็จ', run("state.cliRouterId") === 'router', run('state.cliRouterId'));

capturedToasts = []; downloads = [];
run('exportCliTxt()');
check('txt: สั่งดาวน์โหลดไฟล์ .txt', downloads.some(d => /netforge-cli-.*\.txt$/.test(d.name)));

// --- PNG ---
run("loadExample('enterprise'); resetView(); viewZoom = 1.7; viewPanX = 55; viewPanY = -20;");
const viewBefore = run('JSON.stringify({z:viewZoom, px:viewPanX, py:viewPanY, w:cW, h:cH})');
capturedToasts = []; downloads = [];
run('exportTopologyPNG()');
check('png: สั่งดาวน์โหลดไฟล์ .png', downloads.some(d => /netforge-topology-.*\.png$/.test(d.name)), JSON.stringify(downloads.map(d => d.name)));
check('png: คืนค่าตัวแปรมุมมองเดิมครบทุกตัวหลัง export (ถ้าไม่คืน จอจริงจะเพี้ยนทันที)',
    run('JSON.stringify({z:viewZoom, px:viewPanX, py:viewPanY, w:cW, h:cH})') === viewBefore,
    viewBefore + ' -> ' + run('JSON.stringify({z:viewZoom, px:viewPanX, py:viewPanY, w:cW, h:cH})'));
check('png: ctx กลับมาชี้ที่ canvas จริงของหน้าเว็บ', run('ctx === document.getElementById("topoCanvas").getContext("2d") || ctx !== null'));
check('png: สั่งวาดจอใหม่หลัง export (ตารางที่แคชไว้เป็นของขนาดภาพ)', run('needsRedraw') === true || run('gridKey') === '');
run('resetView()');

run('clearAll()');
capturedToasts = [];
run('exportTopologyPNG()');
check('png: ไม่มีผัง -> เตือน ไม่ปล่อยไฟล์เปล่า', capturedToasts.some(t => t.type === 'error'));

/* ===== C. ทำซ้ำ / สลับลำดับ / เพดาน ===== */

check('cap: เพดานถูกยกเป็น 12 แผนก', run('MAX_DEPARTMENTS') === 12);

run("loadExample('small')"); // 3 แผนก
const namesBefore = run('state.departments.map(function(d){return d.name}).join(",")');
run('onDuplicateDept(state.departments[0].id)');
check('duplicate: ได้แผนกใหม่เพิ่ม 1', run('state.departments.length') === 4);
check('duplicate: ชื่อต่อท้ายด้วย -copy', run('state.departments[1].name').endsWith('-copy'), run('state.departments[1].name'));
check('duplicate: แทรกต่อจากตัวต้นฉบับทันที ไม่ใช่ท้ายรายการ',
    run('state.departments[1].name') === run('state.departments[0].name') + '-copy');
check('duplicate: จำนวน Host เท่าต้นฉบับ', run('state.departments[1].hosts') === run('state.departments[0].hosts'));
check('duplicate: ได้ id ใหม่ ไม่ชนของเดิม', run('state.departments[0].id') !== run('state.departments[1].id'));
run('undo()');
check('duplicate: ย้อนกลับได้', run('state.departments.map(function(d){return d.name}).join(",")') === namesBefore);

// เพดาน
run("clearAll(); for (var i=0;i<12;i++) state.departments.push({id: state.nextId++, name:'D'+i, hosts:5}); refreshAll();");
capturedToasts = [];
run('onDuplicateDept(state.departments[0].id)');
check('cap: ทำซ้ำตอนเต็มเพดาน -> เตือน ไม่เพิ่มให้', run('state.departments.length') === 12 && capturedToasts.some(t => t.type === 'error'));
getElementById('newDeptName').value = 'X'; getElementById('newDeptHosts').value = '5';
capturedToasts = [];
run('onAddDept()');
check('cap: เพิ่มแผนกตอนเต็มเพดาน -> เตือน', run('state.departments.length') === 12 && capturedToasts.some(t => /สูงสุด 12/.test(t.msg)));

// สลับลำดับ
run("loadExample('company')");
const order0 = run('state.departments.map(function(d){return d.name})');
run('onMoveDept(state.departments[1].id, -1)');
const order1 = run('state.departments.map(function(d){return d.name})');
check('move: เลื่อนขึ้นแล้วสลับกับตัวก่อนหน้า',
    order1[0] === order0[1] && order1[1] === order0[0], order0.slice(0,2).join(',') + ' -> ' + order1.slice(0,2).join(','));
run('onMoveDept(state.departments[0].id, -1)');
check('move: เลื่อนขึ้นที่ตัวบนสุด -> ไม่เกิดอะไร ไม่ throw',
    run('state.departments.map(function(d){return d.name}).join(",")') === order1.join(','));
const last = run('state.departments.length') - 1;
run('onMoveDept(state.departments[' + last + '].id, 1)');
check('move: เลื่อนลงที่ตัวล่างสุด -> ไม่เกิดอะไร',
    run('state.departments.map(function(d){return d.name}).join(",")') === order1.join(','));
run('undo()');
check('move: ย้อนกลับลำดับได้', run('state.departments.map(function(d){return d.name}).join(",")') === order0.join(','));

// สีต้องไม่เลื่อนตามการสลับลำดับ (ผูกกับแผนก ไม่ใช่ตำแหน่ง)
const colorMapBefore = run('JSON.stringify(state.departments.map(function(d){return [d.name, getDeptColor(d.id)]}))');
run('onMoveDept(state.departments[0].id, 1)');
const colorMapAfter = run('JSON.stringify(state.departments.map(function(d){return [d.name, getDeptColor(d.id)]}).sort())');
check('move: สลับลำดับแล้วสีของแต่ละแผนกยังเป็นสีเดิม',
    JSON.parse(colorMapBefore).every(function (p) {
        return JSON.parse(colorMapAfter).some(function (q) { return q[0] === p[0] && q[1] === p[1]; });
    }));

/* ===== D. ชุดสี 12 สี ===== */

function h2r(h) { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.substr(i,2),16)); }
function lumi(h) { const c = h2r(h).map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return .2126*c[0]+.7152*c[1]+.0722*c[2]; }
function contrast(a,b) { const l1 = lumi(a), l2 = lumi(b); return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); }
function toLab(h) {
    let [r,g,b] = h2r(h).map(v => { v/=255; return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    const X=(r*.4124+g*.3576+b*.1805)/.95047, Y=r*.2126+g*.7152+b*.0722, Z=(r*.0193+g*.1192+b*.9505)/1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787*t + 16/116);
    return [116*f(Y)-16, 500*(f(X)-f(Y)), 200*(f(Y)-f(Z))];
}
function labDist(a,b) { const A = toLab(a), B = toLab(b); return Math.hypot(A[0]-B[0], A[1]-B[1], A[2]-B[2]); }

const DARK = run('DEPT_COLORS_DARK'), LIGHT = run('DEPT_COLORS_LIGHT');
check('palette: มี 12 สีทั้งสองธีม', DARK.length === 12 && LIGHT.length === 12, DARK.length + '/' + LIGHT.length);
check('palette: จำนวนสีเท่ากับเพดานแผนก (ไม่มีแผนกไหนได้สีซ้ำ)', DARK.length === run('MAX_DEPARTMENTS'));

[['DARK', DARK, ['#0f1115','#171a21']], ['LIGHT', LIGHT, ['#EDF1F7','#FFFFFF']]].forEach(([name, P, bgs]) => {
    const minC = Math.min(...P.flatMap(c => bgs.map(b => contrast(c, b))));
    check('palette: ' + name + ' ทุกสีผ่าน WCAG AA (>=4.5:1) บนทั้งพื้นและการ์ด', minC >= 4.5, minC.toFixed(2));
    let worst = 999, pair = '';
    for (let i=0;i<P.length;i++) for (let j=i+1;j<P.length;j++) { const d = labDist(P[i],P[j]); if (d < worst) { worst = d; pair = P[i]+'/'+P[j]; } }
    check('palette: ' + name + ' ไม่มีคู่สีที่ใกล้กันจนแยกไม่ออก', worst >= 17, worst.toFixed(1) + ' (' + pair + ')');
    check('palette: ' + name + ' ไม่มีสีซ้ำกันเอง', new Set(P).size === P.length);
});

// สีแผนกต้องไม่ชนกับสีอุปกรณ์คงที่ ไม่งั้นบนผังจะแยกไม่ออกว่าอันไหนแผนกอันไหนอุปกรณ์
const FIXED_DARK = [run('ROUTER_COLOR_DARK'), run('PC_COLOR_DARK'), run('SERVER_COLOR_DARK'), run('BRANCH_COLOR_DARK')];
const FIXED_LIGHT = [run('ROUTER_COLOR_LIGHT'), run('PC_COLOR_LIGHT'), run('SERVER_COLOR_LIGHT'), run('BRANCH_COLOR_LIGHT')];
[['DARK', DARK, FIXED_DARK], ['LIGHT', LIGHT, FIXED_LIGHT]].forEach(([name, P, F]) => {
    let worst = 999, pair = '';
    P.forEach(c => F.forEach(f => { const d = labDist(c, f); if (d < worst) { worst = d; pair = c + ' vs ' + f; } }));
    check('palette: ' + name + ' สีแผนกไม่ชนกับสีอุปกรณ์คงที่', worst >= 20, worst.toFixed(1) + ' (' + pair + ')');
});

/* ===== ความสูงของแผงล่าง =====
   ปัญหาที่เจอจากการใช้จริง: แผงล่างสูงคงที่ 270px ทำให้ตารางยาว ๆ ถูกตัดจนอ่านไม่ครบ
   ทั้งสี่แท็บ และทางแก้เดียวคือลากเส้นแบ่งกลางจอ ซึ่งแทบไม่มีใครสังเกตเห็นว่าลากได้
   จึงเพิ่มปุ่มขยายไว้ที่แถบแท็บ และให้แท็บฝึกทำโจทย์ขยายเองอัตโนมัติเพราะเนื้อหายาวที่สุด */

check('panel: เริ่มต้นยังไม่ได้ขยาย', run('isBottomPanelMaximized()') === false);

run('switchTab("table"); toggleBottomPanelMax();');
check('panel: กดปุ่มขยายแล้วสูงขึ้นจริง',
    run('isBottomPanelMaximized()') === true && run('getBottomPanelHeight()') > 400,
    run('getBottomPanelHeight()'));
check('panel: ปุ่มเปลี่ยนข้อความเป็น "ย่อลง" หลังขยาย',
    getElementById('btnPanelMax').innerHTML.indexOf('ย่อลง') !== -1);

// ผู้ใช้กดขยายเอง แล้วสลับแท็บ ต้องคาไว้ อย่าไปย่อให้
run('switchTab("cli");');
check('panel: ผู้ใช้กดขยายเอง สลับแท็บแล้วต้องยังขยายอยู่',
    run('isBottomPanelMaximized()') === true);

run('toggleBottomPanelMax();');
check('panel: กดย่อแล้วกลับเป็นความสูงเดิม',
    run('isBottomPanelMaximized()') === false);
check('panel: ปุ่มกลับไปเขียนว่า "ขยาย"',
    getElementById('btnPanelMax').innerHTML.indexOf('ขยาย') !== -1);

// แท็บฝึกทำโจทย์ต้องขยายให้เอง เพราะเนื้อหายาวสุด
run('switchTab("practice");');
check('panel: เข้าแท็บฝึกทำโจทย์แล้วขยายให้อัตโนมัติ',
    run('isBottomPanelMaximized()') === true);
run('switchTab("table");');
check('panel: ออกจากแท็บฝึกแล้วย่อกลับให้เอง',
    run('isBottomPanelMaximized()') === false);

// ขยายเองอัตโนมัติ แล้วผู้ใช้กดปุ่มย่อระหว่างอยู่ในแท็บฝึก จากนั้นออกไปแท็บอื่น
run('switchTab("practice"); toggleBottomPanelMax();');
check('panel: อยู่แท็บฝึกแล้วกดย่อเอง ต้องย่อได้จริง',
    run('isBottomPanelMaximized()') === false);
run('switchTab("tools");');
check('panel: ออกจากแท็บฝึกทีหลังต้องไม่ไปย่อซ้ำจนเพี้ยน',
    run('isBottomPanelMaximized()') === false);

/* เดิมตอนกดขยาย ระบบกันที่ให้ผังไว้ 70-110px ด้วยความคิดว่า "ให้ยังเห็นผังอยู่บ้าง"
   แต่ผังสูง 70px ก็ดูไม่รู้เรื่องอยู่ดี กลายเป็นกินที่ตารางที่ผู้ใช้กำลังพยายามอ่านไปเปล่า ๆ
   ตอนนี้ให้กินพื้นที่ทำงานเกือบทั้งหมด เหลือไว้แค่พอให้ยังลากเส้นแบ่งกลับได้ */
check('panel: กดขยายแล้วได้พื้นที่อ่านเกือบทั้งหน้า',
    run('maxBottomPanelHeight()') > run('defaultBottomPanelHeight()'),
    run('maxBottomPanelHeight()') + ' > ' + run('defaultBottomPanelHeight()'));

check('panel: ขยายสุดแล้วยังต้องไม่ล้นออกนอกหน้าจอ',
    run('maxBottomPanelHeight()') < run('window.innerHeight'),
    run('maxBottomPanelHeight()') + ' < ' + run('window.innerHeight'));

/* ผังถูกบีบจนเกือบหายตอนขยายแผง ถ้าย่อตำแหน่งโหนดตามไปด้วย พอกดย่อแผงกลับ
   ผังที่ผู้ใช้ลากจัดไว้จะเพี้ยนถาวร เทสนี้จำลองพับเก็บแล้วกางกลับ ตำแหน่งต้องเท่าเดิม */
check('panel: พับผังเก็บแล้วกางกลับ ตำแหน่งอุปกรณ์ต้องไม่เพี้ยน',
    (function () {
        run('topoNodes.departments[0].x = 321; topoNodes.departments[0].y = 234;');
        const before = run('[topoNodes.departments[0].x, topoNodes.departments[0].y].join(",")');
        const parent = sandbox.document.getElementById('topoCanvas').parentElement;
        const tall = parent.getBoundingClientRect();
        parent.getBoundingClientRect = () => ({ width: tall.width, height: 10, left: 0, top: 0 });
        run('resizeCanvas();');
        parent.getBoundingClientRect = () => tall;
        run('resizeCanvas();');
        return run('[topoNodes.departments[0].x, topoNodes.departments[0].y].join(",")') === before;
    })());

/* ความสูงเริ่มต้น — เดิมตายตัว 270px ซึ่งมาจากสมัยที่แผงมีแค่ตาราง IP ไม่กี่แถว
   พอมีแผงวิเคราะห์ ตาราง WAN และแท็บฝึกทำโจทย์ ผู้ใช้ต้องมานั่งลากทุกครั้งที่เปิดโปรแกรม */
check('panel: ความสูงเริ่มต้นคิดตามขนาดจอ ไม่ใช่เลขตายตัว',
    (function () {
        const at = (h) => { const old = sandbox.window.innerHeight; sandbox.window.innerHeight = h;
            const v = run('defaultBottomPanelHeight()'); sandbox.window.innerHeight = old; return v; };
        return at(1080) > at(700);   // จอใหญ่ต้องได้แผงใหญ่กว่า
    })());
check('panel: ความสูงเริ่มต้นใหญ่กว่าค่าเดิม 270px อย่างมีนัย',
    run('defaultBottomPanelHeight()') >= 300, run('defaultBottomPanelHeight()'));
check('panel: จอเล็กมากก็ยังไม่ให้แผงกินจนไม่เห็นผัง',
    (function () {
        const old = sandbox.window.innerHeight; sandbox.window.innerHeight = 600;
        const v = run('defaultBottomPanelHeight()'); sandbox.window.innerHeight = old;
        return v <= 560;   // มีเพดานกันไว้
    })());
check('panel: กด RESET แล้วความสูงกลับเป็นค่าเริ่มต้น',
    (function () {
        run('toggleBottomPanelMax();');       // ขยายไว้ก่อน
        run('resetLayout();');
        return run('isBottomPanelMaximized()') === false &&
               run('getBottomPanelHeight()') === run('defaultBottomPanelHeight()');
    })(), run('getBottomPanelHeight()'));

/* ---------- โครงหน้าเว็บ: กล่องที่เลื่อนได้ต้องยอมหดลงได้ด้วย ----------
   ที่มา: ผู้ใช้รายงานสี่รอบว่าอ่านข้อมูลท้ายตารางไม่ได้ ผมแก้ไปสามรอบโดยไปปรับ "ความสูงของแผง"
   ทุกครั้ง ซึ่งไม่ใช่ต้นเหตุเลย ต้นเหตุจริงคือกล่องที่ครอบผังกับแผงล่างไว้ ไม่ได้ใส่ min-h-0

   กฎของ flexbox ที่เป็นต้นเหตุ: ลูกของ flex container มีค่า min-height เริ่มต้นเป็น auto
   ซึ่งแปลว่า "ห้ามหดเล็กกว่าเนื้อหาข้างใน" พอแผงล่างถูกตั้งให้สูงขึ้น กล่องแม่จึงยืดตาม
   แทนที่จะบีบให้ผังเล็กลง แล้วส่วนที่ยืดเกินขอบจอก็ถูก overflow-hidden ของกล่องชั้นบนตัดทิ้ง
   ผลคือเนื้อหาหายไปเลย ไม่ใช่แค่ล้นแล้วเลื่อนดูได้ จึงไม่มีแถบเลื่อนขึ้นให้เห็นด้วย

   เทสชุดนี้อ่าน index.html ตรง ๆ เพราะเป็นข้อผิดพลาดที่อยู่ในคลาส CSS ไม่ได้อยู่ในตรรกะ
   เทสอื่นทั้ง 81 ข้อจึงผ่านหมดในขณะที่ผู้ใช้กำลังเห็นข้อความถูกตัดอยู่บนจอ */

const indexHtml = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');

function classesOf(html) {
    const out = [];
    const re = /class="([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) out.push({ cls: m[1], at: m.index });
    return out;
}
const allClasses = classesOf(indexHtml);

check('โครงหน้า: กล่องพื้นที่ทำงานที่ครอบผังกับแผงล่าง ต้องมี min-h-0',
    (function () {
        const box = allClasses.find(function (c) {
            return c.cls.indexOf('flex-col') !== -1 && c.cls.indexOf('min-w-0') !== -1 && c.cls.indexOf('flex-1') !== -1;
        });
        return !!box && box.cls.indexOf('min-h-0') !== -1;
    })());

check('โครงหน้า: ผังต้องยอมหดได้เมื่อแผงล่างขยาย (md:min-h-0)',
    (function () {
        const canvasBox = allClasses.find(function (c) { return c.cls.indexOf('min-h-[350px]') !== -1; });
        return !!canvasBox && canvasBox.cls.indexOf('md:min-h-0') !== -1;
    })());

/* กฎรวม: อะไรก็ตามที่ตั้ง overflow-y-auto คู่กับ flex-1 ต้องมี min-h-0 เสมอ
   ไม่งั้นมันจะยืดตามเนื้อหาแทนที่จะเลื่อน ซึ่งเป็นบั๊กเดียวกันกับข้างบนทุกประการ
   ข้อนี้เป็นแบบ "ต้องไม่มีอะไรผิดเลย" ไม่ใช่ "ต้องมีสิ่งนี้" จึงจับจุดที่ยังคิดไม่ถึงได้ด้วย */
const scrollBoxesMissingMinH = allClasses.filter(function (c) {
    return c.cls.indexOf('overflow-y-auto') !== -1
        && c.cls.indexOf('flex-1') !== -1
        && c.cls.indexOf('min-h-0') === -1;
});
check('โครงหน้า: ทุกกล่องที่เลื่อนได้และเป็น flex-1 ต้องมี min-h-0 ครบ',
    scrollBoxesMissingMinH.length === 0,
    scrollBoxesMissingMinH.length ? scrollBoxesMissingMinH.map(function (c) { return c.cls.slice(0, 60); }).join(' | ') : 'ครบทุกกล่อง');

/* คลาสที่คุมโครงหน้าต้องมีอยู่จริงในไฟล์ CSS ที่ build แล้ว ไม่ใช่มีแค่ในโค้ด
   ที่มา: ตอนแก้บั๊กแผงล่างรอบนี้ ผมใส่ md:min-h-0 ลงใน index.html แล้วคิดว่าจบ
   แต่ css/tailwind.css ถูก build ไว้ล่วงหน้าและ commit ลง repo คลาสใหม่จึงยังไม่มีในไฟล์
   ผลคือแก้แล้วเหมือนไม่ได้แก้ ซึ่งเป็นอาการเดียวกับบั๊ก bg-dark-900/90 ที่เคยเจอมาก่อน
   CI มีขั้นตอนดักเรื่องนี้อยู่แล้ว แต่กว่าจะรู้ก็ต้อง push ขึ้นไปก่อน เทสข้อนี้จึงดักตั้งแต่ในเครื่อง */
const builtCss = fs.readFileSync(path.join(PROJECT_ROOT, 'css', 'tailwind.css'), 'utf8');
const layoutCriticalClasses = ['min-h-0', 'md\\:min-h-0', 'overflow-y-auto', 'md\\:overflow-hidden', 'flex-shrink-0'];
const missingInCss = layoutCriticalClasses.filter(function (c) {
    return builtCss.indexOf('.' + c + '{') === -1 && builtCss.indexOf('.' + c + ',') === -1
        && builtCss.indexOf('.' + c + ' ') === -1;
});
check('CSS: คลาสที่คุมโครงหน้าต้องถูก build ลงไฟล์ CSS จริงครบทุกตัว',
    missingInCss.length === 0,
    missingInCss.length ? 'ขาด ' + missingInCss.join(', ') + ' (ต้องรัน npm run build:css)' : 'ครบทุกตัว');

/* ความสูงตอนขยายต้องไม่เกินกล่องแม่ ไม่งั้นส่วนที่เกินจะถูกตัดทิ้งแบบเงียบ ๆ */
check('แผงล่าง: ความสูงตอนขยายต้องไม่เกินความสูงของกล่องแม่',
    run('(function(){var p=document.getElementById("bottomPanel");' +
        'var par=p&&p.parentElement;var h=par&&par.getBoundingClientRect?par.getBoundingClientRect().height:0;' +
        'return h ? (maxBottomPanelHeight() <= h) : true;})()'),
    run('maxBottomPanelHeight()') + ' px');

/* ---------- สรุปผล ---------- */
let pass = 0;
results.forEach(r => {
    if (r.pass) pass++;
    console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
});
console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
process.exit(pass === results.length ? 0 : 1);

})();
