/* ============================================
   tests/regression-fixes.test.js — ชุดทดสอบบั๊ก 9 ข้อที่แก้ในรอบรีวิว 30 ก.ค. 2569
   ============================================
   วิธีรัน:   node tests/regression-fixes.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install (แพทเทิร์นเดียวกับ save-load.test.js / ui-stability.test.js)

   ทำไมต้องมีไฟล์นี้:
   บั๊กทั้ง 9 ข้อด้านล่างเป็นแบบ "เงียบ" ทั้งหมด — ไม่ throw ไม่ขึ้น error ให้เห็น แค่ให้ผลลัพธ์ผิด
   หรือทำงานไม่ครบ ถ้าไม่มีเทสจับไว้ การแก้โค้ดรอบหน้าจะทำให้มันกลับมาโดยไม่มีใครรู้ตัว

   ครอบคลุม:
   1. Net Tools ทั้งแท็บใช้งานได้จริง (เดิม addSummaryRoute/calcSummary ไม่มีนิยาม -> ReferenceError)
   2. Canvas รับ touch event ได้ (เดิมผูกแค่ mouse -> มือถือใช้ไม่ได้เลย)
   3. แท็บ CLI อัปเดตตามข้อมูลที่เปลี่ยน (เดิม render แค่ตอนกดสลับแท็บ -> ค้างของเก่า)
   4. ตำแหน่ง node ที่ผู้ใช้ลากไม่ถูกรีเซ็ตตอนแก้ข้อมูล (แต่ปุ่ม RESET ต้องรีเซ็ตได้อยู่)
   5. เคอร์เซอร์ไม่หลุดตอนพิมพ์ในช่อง Detail Panel
   6. Base IP ถูกปัดเป็น Network Address เสมอ (เดิม 10.0.0.5/24 แจก subnet จาก .5 และล้นขอบ)
   7. ip dhcp excluded-address แยกบรรทัดตาม syntax IOS จริง (เดิมยัดทุกค่าในบรรทัดเดียว = แปะไม่ผ่าน)
   8. Static IP ของ PC/Server ถูกกันออกจาก DHCP Pool และปรากฏใน CLI
   9. โหมด IPv6 ล้วน (ไม่มีผล IPv4) ยังได้ CLI ออกมา
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js', 'js/wan.js', 'js/tools.js', 'js/library.js', 'js/app.js'];

let capturedToasts = [];

// ---------- DOM stubs (ต่อยอดจากสองไฟล์เทสเดิม + เพิ่ม activeElement/contains/focus tracking ที่ข้อ 5 ต้องใช้) ----------
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
        _focusCount: 0, _containsSet: new Set(),
        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        removeEventListener() {},
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        contains(node) { return this._containsSet.has(node); },
        click() {}, focus() { this._focusCount++; }, select() {}, remove() {},
        setSelectionRange(s, e) { this._sel = [s, e]; },
        getBoundingClientRect() { return { width: 1024, height: 768, left: 0, top: 0 }; },
        setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
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
    activeElement: null,
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
    Blob: class { constructor(p, o) { this.parts = p; this.type = o && o.type; } },
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
const run = (code) => vm.runInContext(code, context);
const stripTags = (html) => String(html).replace(/<[^>]*>/g, '');

(async () => {

/* ===== 1. Net Tools — ทั้งแท็บเคยตายเพราะฟังก์ชันไม่มีนิยาม ===== */

check('tools: ฟังก์ชันทั้ง 5 ตัวมีอยู่จริง (เดิม addSummaryRoute/calcSummary หายไป)',
    ['calcWildcard', 'renderSummaryInputs', 'addSummaryRoute', 'calcSummary', 'removeSummaryRoute']
        .every(f => run(`typeof ${f}`) === 'function'));

// --- Wildcard ---
getElementById('wcInput').value = '192.168.10.0/26';
run('calcWildcard()');
let wc = stripTags(getElementById('wcResult').innerHTML);
check('wildcard: /26 -> wildcard 0.0.0.63', wc.includes('0.0.0.63'), wc.slice(0, 120));
check('wildcard: /26 -> mask 255.255.255.192', wc.includes('255.255.255.192'));
check('wildcard: /26 -> broadcast .63', wc.includes('192.168.10.63'));
check('wildcard: /26 -> 62 usable hosts', wc.includes('62'));

getElementById('wcInput').value = '192.168.10.77/26';
run('calcWildcard()');
wc = stripTags(getElementById('wcResult').innerHTML);
check('wildcard: host address ถูกปัดลงเป็น 192.168.10.64/26 พร้อมแจ้งเตือน',
    wc.includes('192.168.10.64/26') && wc.includes('ไม่ใช่ Network Address'), wc.slice(0, 140));

getElementById('wcInput').value = 'ไม่ใช่ไอพี';
run('calcWildcard()');
check('wildcard: input ขยะ -> ขึ้นข้อความผิดพลาด ไม่ throw',
    stripTags(getElementById('wcResult').innerHTML).includes('รูปแบบไม่ถูกต้อง'));

// --- Route Summary ---
run("state.summaryRoutes = ['192.168.0.0/24','192.168.1.0/24','192.168.2.0/24','192.168.3.0/24']");
run('calcSummary()');
let sum = stripTags(getElementById('summaryResult').innerHTML);
check('summary: 192.168.0-3.0/24 สี่ก้อน -> 192.168.0.0/22', sum.includes('192.168.0.0/22'), sum.slice(0, 100));
check('summary: บอกว่าสรุปได้พอดีเป๊ะ (ไม่ดูดเกิน)', sum.includes('พอดีเป๊ะ'));

run("state.summaryRoutes = ['10.1.0.0/24','10.7.0.0/24']");
run('calcSummary()');
sum = stripTags(getElementById('summaryResult').innerHTML);
check('summary: ชุดไม่ต่อเนื่อง -> เตือนว่าครอบเกิน', sum.includes('ครอบเกินมา'), sum.slice(0, 140));

run("state.summaryRoutes = ['10.0.0.0/24']");
run('calcSummary()');
check('summary: เส้นทางเดียว -> แจ้งว่าต้องมีอย่างน้อย 2',
    stripTags(getElementById('summaryResult').innerHTML).includes('อย่างน้อย 2'));

run('state.summaryRoutes = []');
getElementById('summaryNew').value = '172.16.5.99/24';
capturedToasts = [];
run('addSummaryRoute()');
check('summary: addSummaryRoute เก็บเป็น Network Address (172.16.5.0/24 ไม่ใช่ .99)',
    run('state.summaryRoutes[0]') === '172.16.5.0/24', run('state.summaryRoutes[0]'));
getElementById('summaryNew').value = 'abc';
capturedToasts = [];
run('addSummaryRoute()');
check('summary: input ขยะถูกปฏิเสธพร้อม toast error',
    run('state.summaryRoutes.length') === 1 && capturedToasts.some(t => t.type === 'error'));
run('removeSummaryRoute(0)');
check('summary: removeSummaryRoute ลบออกได้', run('state.summaryRoutes.length') === 0);

/* ===== 2. Touch support บน Canvas ===== */

// init() ใน app.js เรียก setupCanvasEvents() ไปแล้วตอนโหลดไฟล์ — ห้ามเรียกซ้ำ ไม่งั้น listener จะซ้อนกันเป็น 2 ชุด
const canvasEl = getElementById('topoCanvas');
['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(t => {
    check('touch: ลงทะเบียน ' + t + ' แล้ว', (canvasEl._listeners[t] || []).length === 1);
});
check('touch: mousedown ยังมีตัวเดียวเหมือนเดิม (ไม่ซ้อน)', (canvasEl._listeners['mousedown'] || []).length === 1);

run("loadExample('small')");
const beforeTouchPlace = run('topoNodes.manualNodes.length');
run("togglePlacingMode('pc')");
canvasEl._listeners['touchstart'][0]({ touches: [{ clientX: 400, clientY: 500 }], preventDefault() {} });
check('touch: แตะหน้าจอตอนโหมดวาง PC สร้างอุปกรณ์ได้จริง',
    run('topoNodes.manualNodes.length') === beforeTouchPlace + 1, beforeTouchPlace + ' -> ' + run('topoNodes.manualNodes.length'));
check('touch: อุปกรณ์ลงตรงจุดที่แตะ (400,500)',
    run('topoNodes.manualNodes[topoNodes.manualNodes.length-1].x') === 400 &&
    run('topoNodes.manualNodes[topoNodes.manualNodes.length-1].y') === 500);

// แตะโหนดค้างแล้วลาก -> ต้องขยับตาม และต้อง preventDefault เฉพาะตอนลากจริง
let preventedWhileDragging = false, preventedWhileIdle = false;
canvasEl._listeners['touchstart'][0]({ touches: [{ clientX: 400, clientY: 500 }], preventDefault() {} });
check('touch: แตะโหนดแล้วเข้าสู่สถานะลาก (dragInfo ถูกตั้ง)', run('dragInfo !== null'));
canvasEl._listeners['touchmove'][0]({ touches: [{ clientX: 460, clientY: 560 }], preventDefault() { preventedWhileDragging = true; } });
check('touch: ลากนิ้วแล้วโหนดขยับตาม',
    run('topoNodes.manualNodes[topoNodes.manualNodes.length-1].x') === 460, run('topoNodes.manualNodes[topoNodes.manualNodes.length-1].x'));
check('touch: preventDefault ตอนลากโหนด (กันหน้าเลื่อนตาม)', preventedWhileDragging);
canvasEl._listeners['touchend'][0]({});
check('touch: ยกนิ้วแล้วหลุดสถานะลาก', run('dragInfo === null'));
canvasEl._listeners['touchmove'][0]({ touches: [{ clientX: 10, clientY: 10 }], preventDefault() { preventedWhileIdle = true; } });
check('touch: ไม่ preventDefault ตอนไม่ได้ลาก -> ปัดเลื่อนหน้าจอได้ปกติ', !preventedWhileIdle);
check('touch: สองนิ้ว (pinch zoom) ถูกปล่อยผ่านให้เบราว์เซอร์',
    (function () {
        const before = run('topoNodes.manualNodes.length');
        run("togglePlacingMode('pc')");
        canvasEl._listeners['touchstart'][0]({ touches: [{ clientX: 1, clientY: 1 }, { clientX: 2, clientY: 2 }], preventDefault() {} });
        const ok = run('topoNodes.manualNodes.length') === before;
        run('state.placingType = null');
        return ok;
    })());

/* ===== 3. แท็บ CLI ต้องไม่ค้างข้อมูลเก่า ===== */

run("loadExample('small'); switchTab('cli');");
const cliBefore = stripTags(getElementById('cliRouterOutput').innerHTML);
check('cli: render ครั้งแรกมีชื่อแผนกของ Small Office', cliBefore.includes('Reception') || cliBefore.length > 100, cliBefore.slice(0, 80));
run("state.departments.push({ id: state.nextId++, name: 'ZZTESTDEPT', hosts: 5 }); refreshAll();");
const cliAfter = stripTags(getElementById('cliRouterOutput').innerHTML);
check('cli: อยู่แท็บ CLI แล้วแก้ข้อมูล -> CLI อัปเดตเองทันที (เดิมค้างจนกว่าจะสลับแท็บ)',
    cliAfter.includes('ZZTESTDEPT') && !cliBefore.includes('ZZTESTDEPT'));
run("state.activeTab = 'table'");

/* ===== 4. ตำแหน่งที่ลากเองต้องอยู่คงที่ แต่ปุ่ม RESET ต้องรีเซ็ตได้ ===== */

run("loadExample('company')");
run('topoNodes.router.x = 777; topoNodes.router.y = 42; topoNodes.switches[0].x = 999; topoNodes.departments[0].x = 888;');
const dragSwId = run('topoNodes.switches[0].id');
run('refreshAll()'); // แก้ข้อมูลตามปกติ ไม่ force
check('layout: ตำแหน่ง Router ที่ลากไว้ยังอยู่หลัง refreshAll()', run('topoNodes.router.x') === 777, run('topoNodes.router.x'));
check('layout: ตำแหน่ง Switch ที่ลากไว้ยังอยู่', run(`topoNodes.switches.find(s=>s.id==='${dragSwId}').x`) === 999);
check('layout: ตำแหน่ง Department ที่ลากไว้ยังอยู่', run('topoNodes.departments[0].x') === 888);

run("state.departments.push({ id: state.nextId++, name: 'NewDept', hosts: 5 }); refreshAll();");
check('layout: เพิ่มแผนกใหม่แล้วโหนดเดิมยังไม่ขยับ', run(`topoNodes.switches.find(s=>s.id==='${dragSwId}').x`) === 999);
check('layout: แผนกที่เพิ่งเกิดได้ตำแหน่งตามผังมาตรฐาน (ไม่ใช่ 999)',
    run("topoNodes.switches.find(s=>s.label.indexOf('NewDept')>=0).x") !== 999);

run('resetLayout()');
check('layout: ปุ่ม RESET ยังรีเซ็ตตำแหน่งได้จริง (Router กลับกลางจอ)', run('topoNodes.router.x') !== 777, run('topoNodes.router.x'));
check('layout: ปุ่ม RESET รีเซ็ต Switch ด้วย', run(`topoNodes.switches.find(s=>s.id==='${dragSwId}').x`) !== 999);

run("loadExample('small')");
run('topoNodes.switches[0].x = 555;');
run("loadExample('company')");
check('layout: โหลด Example ใหม่ = จัดผังใหม่จากศูนย์ (force)', run('topoNodes.switches[0].x') !== 555);

/* ===== 5. เคอร์เซอร์ต้องไม่หลุดตอนพิมพ์ใน Detail Panel ===== */

run("loadExample('small'); selectNode(state.departments[0].id, 'department');");
const nameInput = getElementById('detailName');
nameInput.tagName = 'INPUT';
nameInput.selectionStart = 3; nameInput.selectionEnd = 3;
getElementById('detailContent')._containsSet.add(nameInput);
documentStub.activeElement = nameInput;
nameInput._focusCount = 0;
run('renderDetailPanel()');
check('focus: renderDetailPanel คืน focus ให้ช่องที่กำลังพิมพ์อยู่', nameInput._focusCount === 1, nameInput._focusCount);
check('focus: คืนตำแหน่งเคอร์เซอร์เดิมด้วย', JSON.stringify(nameInput._sel) === '[3,3]', JSON.stringify(nameInput._sel));

nameInput._focusCount = 0;
documentStub.activeElement = null;
run('renderDetailPanel()');
check('focus: ไม่มีใคร focus อยู่ -> ไม่ไปยัด focus ให้ใครมั่ว', nameInput._focusCount === 0);

documentStub.activeElement = makeElement('INPUT'); // อยู่นอก panel
documentStub.activeElement.id = 'newDeptName';
documentStub.activeElement.tagName = 'INPUT';
nameInput._focusCount = 0;
run('renderDetailPanel()');
check('focus: ช่องที่อยู่นอก Detail Panel ไม่ถูกแตะ', nameInput._focusCount === 0);
documentStub.activeElement = null;

/* ===== 6. Base IP ต้องถูกปัดเป็น Network Address ===== */

check('normalize: helper 10.0.0.5/24 -> 10.0.0.0', run("normalizeNetwork('10.0.0.5', 24)") === '10.0.0.0');
check('normalize: helper 172.16.200.13/20 -> 172.16.192.0', run("normalizeNetwork('172.16.200.13', 20)") === '172.16.192.0');
check('normalize: /32 คืนค่าเดิม', run("normalizeNetwork('8.8.8.8', 32)") === '8.8.8.8');

run('clearAll()');
getElementById('baseIpInput').value = '10.0.0.5';
getElementById('baseCidrInput').value = '24';
capturedToasts = [];
run('onBaseChange()');
check('normalize: onBaseChange ปัด state.baseIp เป็น 10.0.0.0', run('state.baseIp') === '10.0.0.0', run('state.baseIp'));
check('normalize: สะท้อนค่ากลับในช่องกรอกให้ผู้ใช้เห็น', getElementById('baseIpInput').value === '10.0.0.0');
check('normalize: แจ้งผู้ใช้ว่าปรับค่าให้แล้ว', capturedToasts.some(t => /Network Address/.test(t.msg)), JSON.stringify(capturedToasts));

// ตาข่ายชั้นสอง: ตั้ง state ตรง ๆ (เลียนแบบ import/autosave ที่ไม่ผ่าน onBaseChange)
run("state.baseIp = '192.168.1.130'; state.baseCidr = 24; state.departments = [{id:901,name:'A',hosts:20}]; calculateVLSM();");
check('normalize: calculateVLSM ปัดให้เองแม้ตั้ง state ตรง ๆ', run('state.baseIp') === '192.168.1.0', run('state.baseIp'));
check('normalize: subnet แรกเริ่มที่ขอบ block จริง (ไม่ใช่ .130)',
    run('state.calculated[0].subnet.network') === '192.168.1.0', run('state.calculated[0].subnet.network'));
check('normalize: subnet ไม่ล้นออกนอก base /24',
    run("ipToLong(state.calculated[0].subnet.broadcast) <= ipToLong('192.168.1.255')"));

/* ===== 7 + 8. CLI: excluded-address syntax + Static IP ของ PC/Server ===== */

run('clearAll()');
run("loadExample('small')");
const pcIp = run(`
    (function () {
        var n = addManualNode(PCDevice, 100, 100);
        var sw = topoNodes.switches[0];
        addLink(n.id, sw.id);
        n.ip = suggestNextIp(sw.deptId);
        return n.ip;
    })()
`);
run('renderCLI()');
const cliText = stripTags(getElementById('cliRouterOutput').innerHTML);
const exclLines = cliText.split('\n').filter(l => l.includes('ip dhcp excluded-address'));

check('cli: มีบรรทัด excluded-address อย่างน้อย 1 บรรทัดต่อแผนก', exclLines.length >= 3, exclLines.length);
check('cli: ทุกบรรทัด excluded-address มี IP ไม่เกิน 2 ตัว (syntax IOS จริง)',
    exclLines.every(l => {
        const cmdPart = l.split('!')[0]; // ตัดคอมเมนต์ท้ายบรรทัดออกก่อนนับ
        return (cmdPart.match(/\d+\.\d+\.\d+\.\d+/g) || []).length <= 2;
    }), exclLines.join(' | '));
check('cli: ไม่มีบรรทัดที่ยัด IP ยาวเป็นพรืดแบบเดิม',
    !exclLines.some(l => (l.split('!')[0].match(/\d+\.\d+\.\d+\.\d+/g) || []).length >= 3));

check('cli: Static IP ของ PC (' + pcIp + ') ถูกกันออกจาก DHCP Pool',
    exclLines.some(l => l.includes(pcIp)), exclLines.join(' | '));
check('cli: มีบล็อกสรุป Static IP ที่กำหนดบนผัง', cliText.includes('Static IP ที่กำหนดไว้บนผัง'));
check('cli: บล็อกสรุประบุทั้ง IP / mask / gateway', cliText.includes(pcIp) && cliText.includes('mask ') && cliText.includes('gw '));

/* ===== 9. โหมด IPv6 ล้วน (ไม่มีผล IPv4) ต้องยังได้ CLI ===== */

run('clearAll()');
// baseCidr /30 + แผนกที่ขอ 1000 hosts -> IPv4 คำนวณไม่ผ่านทุกแผนก (calculated ว่าง) แต่ IPv6 คำนวณได้ปกติ
run(`
    state.baseIp = '10.0.0.0'; state.baseCidr = 30;
    state.departments = [{ id: 801, name: 'V6Only', hosts: 1000 }];
    state.baseIp6 = '2001:db8::'; state.basePrefixLen6 = 48; state.newPrefixLen6 = 64;
    calculateVLSM(); calculateIPv6();
`);
check('ipv6-only: เงื่อนไขตั้งต้นถูกต้อง (calculated ว่าง, calculatedV6 มีข้อมูล)',
    run('state.calculated.length') === 0 && run('state.calculatedV6.length') === 1,
    run('state.calculated.length') + '/' + run('state.calculatedV6.length'));

run('layoutTopology(true); renderCLI();');
const v6Cli = stripTags(getElementById('cliRouterOutput').innerHTML);
const v6Sw = stripTags(getElementById('cliSwitchOutput').innerHTML);
check('ipv6-only: ไม่ขึ้น "ยังไม่มีข้อมูล" อีกแล้ว', !v6Cli.includes('ยังไม่มีข้อมูล'), v6Cli.slice(0, 80));
check('ipv6-only: Router config มี ipv6 unicast-routing', v6Cli.includes('ipv6 unicast-routing'));
check('ipv6-only: Router config มี ipv6 address ของแผนก', v6Cli.includes('ipv6 address') && v6Cli.includes('2001:db8::/64'), v6Cli.slice(0, 200));
check('ipv6-only: ไม่มี ip address (v4) ปนมาทั้งที่คำนวณ v4 ไม่ผ่าน', !/\bip address\b/.test(v6Cli));
check('ipv6-only: ไม่มี DHCP Pool (v4) ปนมา', !v6Cli.includes('ip dhcp pool'));
check('ipv6-only: Switch config ยังมี VLAN ของแผนกครบ', v6Sw.includes('V6Only') && v6Sw.includes('switchport mode trunk'), v6Sw.slice(0, 120));

/* ---------- สรุปผล ---------- */
let pass = 0;
results.forEach(r => {
    if (r.pass) pass++;
    console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
});
console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
process.exit(pass === results.length ? 0 : 1);

})();
