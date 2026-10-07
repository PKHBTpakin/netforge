/* ============================================
   tests/device-model.test.js — แบบจำลองอุปกรณ์ Switch/Router (7 ต.ค. 2569)
   ============================================
   วิธีรัน:   node tests/device-model.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):

   เฟสนี้แยกข้อมูลและพฤติกรรมของ Switch กับ Router ออกจากกันตามคำสั่งโปรเจกต์
   ของเดิมตอบคำถามว่า "โหนดนี้เป็น Router ไหม" ด้วยการเทียบสตริงกระจาย 31 จุด
   และเขียนตรรกะชุดเดียวกันซ้ำสองที่โดยไม่รู้ตัว

     wan.js        function isRouterType(type) { return type === 'router' || type === 'router-branch'; }
     topology.js   const isRouter = t => t === 'router' || t === 'router-branch';

   สองชุดนี้มีโอกาสเลื่อนจากกันเงียบ ๆ ตอนเพิ่มอุปกรณ์ชนิดใหม่ ซึ่งเป็นบั๊กที่
   ไม่มี error ไม่มีอะไรพัง แค่กฎการเชื่อมสายของอุปกรณ์ชนิดใหม่ทำงานไม่ครบ
   ตารางคุณสมบัติ DEVICE_CAPS ใน devices.js จึงถูกตั้งให้เป็นแหล่งความจริงแหล่งเดียว
   และไฟล์นี้ล็อกไว้ว่าต้องไม่มีใครเขียนตรรกะนั้นซ้ำขึ้นมาอีก

   ครอบคลุม:
   A. ตาราง DEVICE_CAPS ครบ แช่แข็ง และทุกชนิดมีคุณสมบัติชุดเดียวกัน
   B. ค่าในตารางตรงกับความเป็นจริงของเครือข่าย (Switch ชั้น 2 ไม่มี IP ของตัวเอง ฯลฯ)
   C. ชนิดที่ไม่รู้จักต้องไม่แครช และต้องไม่ได้สิทธิ์อะไรเลย
   D. method is() และ caps บนอุปกรณ์จริงที่สร้างจาก constructor
   E. ตัวช่วยระบุชนิดต้องมีที่เดียวในโปรเจกต์ ห้ามประกาศซ้ำ (ตรวจจากซอร์สโดยตรง)
   F. กฎการเชื่อมสายให้ผลเหมือนก่อน refactor ทุกกรณี
   G. ไฟล์เทสต้องไม่จบด้วย process.exit() เพราะทำให้ stdout ขาดเป็นครั้งคราว
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js',
    'js/topology.js', 'js/ui.js', 'js/wan.js', 'js/cli.js', 'js/backdrop.js',
    'js/practice.js', 'js/tools.js', 'js/library.js', 'js/history.js',
    'js/export.js', 'js/labguide.js', 'js/app.js'];

/* ===== สภาพแวดล้อมจำลองของเบราว์เซอร์ ชุดเดียวกับ tests/labguide.test.js ===== */

function makeClassList() {
    const set = new Set();
    return {
        add: (...c) => c.forEach(x => set.add(x)),
        remove: (...c) => c.forEach(x => set.delete(x)),
        toggle: (c, f) => { if (f === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (f) set.add(c); else set.delete(c); return set.has(c); },
        contains: (c) => set.has(c)
    };
}
function makeElement(tag) {
    return {
        tagName: tag, _listeners: {}, classList: makeClassList(), style: {}, dataset: {}, children: [],
        value: '', innerHTML: '', innerText: '', textContent: '',
        addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
        removeEventListener() {},
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        contains() { return false; },
        click() {}, focus() {}, select() {}, remove() {}, setSelectionRange() {},
        querySelector: () => null, querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
        closest: () => null, insertAdjacentHTML() {}, scrollIntoView() {}, setAttribute() {},
        getAttribute: () => null, hasAttribute: () => false, removeAttribute() {}
    };
}
const ctxProxy = new Proxy({}, {
    get(t, p) { if (p === 'measureText') return () => ({ width: 10 }); if (p in t) return t[p]; return () => undefined; },
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
const store = {};
const sandbox = {
    console, setTimeout, clearTimeout,
    document: {
        documentElement: makeElement('html'), body: makeElement('body'), activeElement: null,
        getElementById, createElement: (t) => makeElement(t), execCommand: () => true,
        addEventListener: () => {}, querySelectorAll: () => []
    },
    window: { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1600, innerHeight: 900 },
    location: { href: 'https://pkhbtpakin.github.io/netforge/', hash: '', protocol: 'https:' },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    },
    navigator: {}, TextEncoder, TextDecoder, btoa, atob,
    Blob: class { constructor(p, o) { this.parts = p; this.type = o && o.type; } },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    FileReader: class { readAsText() {} },
    requestAnimationFrame: () => 1
};
const context = vm.createContext(sandbox);
for (const f of JS_FILES) {
    vm.runInContext(fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8'), context, { filename: f });
}
context.showToast = () => {};
const run = (code) => vm.runInContext(code, context);
function safeRun(code, fallback) {
    try { return run(code); } catch (e) { return fallback === undefined ? null : fallback; }
}

const results = [];
function check(label, cond, detail) {
    results.push({ label, pass: !!cond, detail: detail !== undefined ? String(detail) : '' });
}
const src = (f) => fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8');

/* ===== A. ตารางคุณสมบัติ ===== */

const TYPES = ['router', 'router-branch', 'switch', 'pc', 'server', 'department'];
const capsJson = safeRun('JSON.stringify(DEVICE_CAPS)', 'null');
const CAPS = JSON.parse(capsJson || 'null') || {};

check('A1: มีตาราง DEVICE_CAPS อยู่จริง', Object.keys(CAPS).length > 0);
TYPES.forEach(function (t, i) {
    check('A2.' + (i + 1) + ': ตารางมีชนิด ' + t, !!CAPS[t]);
});
check('A3: ตารางไม่มีชนิดเกินที่ใช้จริง',
    Object.keys(CAPS).every(function (k) { return TYPES.indexOf(k) !== -1; }),
    Object.keys(CAPS).join(', '));

// ทุกชนิดต้องมีคีย์ครบเท่ากัน ไม่งั้นชนิดที่ตกคีย์ไปจะได้ undefined แทน false เงียบ ๆ
const keyRef = CAPS['router'] ? Object.keys(CAPS['router']).sort().join(',') : '';
TYPES.forEach(function (t, i) {
    const k = CAPS[t] ? Object.keys(CAPS[t]).sort().join(',') : '(ไม่มีชนิดนี้)';
    check('A4.' + (i + 1) + ': ' + t + ' มีคุณสมบัติครบชุดเดียวกับชนิดอื่น', k === keyRef, k === keyRef ? '' : k);
});

check('A5: ตารางถูกแช่แข็ง แก้ไม่ได้', safeRun('Object.isFrozen(DEVICE_CAPS)', false) === true);
check('A6: แต่ละแถวถูกแช่แข็ง แก้ไม่ได้',
    TYPES.every(function (t) { return safeRun('Object.isFrozen(DEVICE_CAPS[' + JSON.stringify(t) + '])', false) === true; }));
// พยายามแก้จริง ค่าต้องไม่เปลี่ยน — กันการเผลอเขียนทับระหว่างรันแล้วกฎเพี้ยนทั้งโปรแกรม
check('A7: เขียนทับค่าในตารางแล้วค่าไม่เปลี่ยนจริง',
    safeRun("(function(){ try { DEVICE_CAPS.switch.isRouter = true; } catch (e) {} return DEVICE_CAPS.switch.isRouter; })()", true) === false);

/* ===== B. ค่าในตารางตรงกับความเป็นจริงของเครือข่าย ===== */

const EXPECT = {
    'router':        { isRouter: true,  isMainRouter: true,  isBranchRouter: false, isSwitch: false, isEndDevice: false, isVirtual: false, ownsBaseNetwork: true,  hasVlan: false, hasOwnIp: true,  canBeDeleted: false },
    'router-branch': { isRouter: true,  isMainRouter: false, isBranchRouter: true,  isSwitch: false, isEndDevice: false, isVirtual: false, ownsBaseNetwork: false, hasVlan: false, hasOwnIp: true,  canBeDeleted: true  },
    'switch':        { isRouter: false, isMainRouter: false, isBranchRouter: false, isSwitch: true,  isEndDevice: false, isVirtual: false, ownsBaseNetwork: false, hasVlan: true,  hasOwnIp: false, canBeDeleted: false },
    'pc':            { isRouter: false, isMainRouter: false, isBranchRouter: false, isSwitch: false, isEndDevice: true,  isVirtual: false, ownsBaseNetwork: false, hasVlan: false, hasOwnIp: true,  canBeDeleted: true  },
    'server':        { isRouter: false, isMainRouter: false, isBranchRouter: false, isSwitch: false, isEndDevice: true,  isVirtual: false, ownsBaseNetwork: false, hasVlan: false, hasOwnIp: true,  canBeDeleted: true  },
    'department':    { isRouter: false, isMainRouter: false, isBranchRouter: false, isSwitch: false, isEndDevice: false, isVirtual: true,  ownsBaseNetwork: false, hasVlan: false, hasOwnIp: false, canBeDeleted: false }
};
Object.keys(EXPECT).forEach(function (t, i) {
    const got = CAPS[t] || {};
    const want = EXPECT[t];
    const wrong = Object.keys(want).filter(function (k) { return got[k] !== want[k]; });
    check('B' + (i + 1) + ': คุณสมบัติของ ' + t + ' ถูกต้องครบทุกช่อง', wrong.length === 0,
        wrong.map(function (k) { return k + ' ได้ ' + got[k] + ' ต้องเป็น ' + want[k]; }).join(' · '));
});

// กฎที่ต้องจริงเสมอไม่ว่าจะเพิ่มชนิดใหม่อีกกี่ชนิด
check('B7: ไม่มีชนิดไหนเป็นทั้ง Router และ Switch พร้อมกัน',
    Object.keys(CAPS).every(function (t) { return !(CAPS[t].isRouter && CAPS[t].isSwitch); }));
check('B8: ไม่มีชนิดไหนเป็นทั้งอุปกรณ์ปลายทางและ Router พร้อมกัน',
    Object.keys(CAPS).every(function (t) { return !(CAPS[t].isRouter && CAPS[t].isEndDevice); }));
check('B9: Router หลักมีได้ชนิดเดียวเท่านั้น',
    Object.keys(CAPS).filter(function (t) { return CAPS[t].isMainRouter; }).length === 1);
check('B10: ของที่เป็นแค่กล่องแสดงผล ต้องไม่มีสิทธิ์เป็นอุปกรณ์ใด ๆ',
    Object.keys(CAPS).every(function (t) {
        return !CAPS[t].isVirtual || (!CAPS[t].isRouter && !CAPS[t].isSwitch && !CAPS[t].isEndDevice && !CAPS[t].hasOwnIp);
    }));
check('B11: ทุกชนิดมีชื่อเรียกและบทบาทกำกับไว้ ไม่มีช่องว่าง',
    Object.keys(CAPS).every(function (t) { return !!CAPS[t].label && !!CAPS[t].role; }));
check('B12: เฉพาะของที่ผู้ใช้วางเองเท่านั้นที่ลบได้',
    Object.keys(CAPS).every(function (t) { return CAPS[t].canBeDeleted === CAPS[t].isManual; }),
    Object.keys(CAPS).filter(function (t) { return CAPS[t].canBeDeleted !== CAPS[t].isManual; }).join(', '));

/* ===== C. ชนิดที่ไม่รู้จัก — ต้องไม่แครชและไม่ได้สิทธิ์ ===== */

const WEIRD = ["'firewall'", "'l3-switch'", "''", 'null', 'undefined', '123', '({})', '[]'];
WEIRD.forEach(function (expr, i) {
    const r = safeRun('JSON.stringify(deviceCaps(' + expr + '))', null);
    check('C1.' + (i + 1) + ': deviceCaps(' + expr + ') ไม่แครชและคืนตารางกลับมา', r !== null && r !== 'null' && r !== undefined, String(r).slice(0, 60));
});
const unknown = JSON.parse(safeRun("JSON.stringify(deviceCaps('firewall'))", '{}'));
check('C2: ชนิดที่ไม่รู้จัก ทุกคุณสมบัติเป็น false ไม่มีข้อยกเว้น',
    Object.keys(unknown).filter(function (k) { return typeof unknown[k] === 'boolean'; })
        .every(function (k) { return unknown[k] === false; }),
    JSON.stringify(unknown));
check('C3: ชนิดที่ไม่รู้จัก มีคีย์ครบเท่าชนิดปกติ (ไม่ได้คืน object เปล่า)',
    Object.keys(unknown).sort().join(',') === keyRef);
check('C4: isRouterType ของชนิดที่ไม่รู้จัก เป็น false', safeRun("isRouterType('firewall')", true) === false);
check('C5: isSwitchType ของชนิดที่ไม่รู้จัก เป็น false', safeRun("isSwitchType('firewall')", true) === false);
check('C6: isEndDeviceType ของชนิดที่ไม่รู้จัก เป็น false', safeRun("isEndDeviceType(null)", true) === false);
check('C7: isVirtualNodeType ของชนิดที่ไม่รู้จัก เป็น false', safeRun("isVirtualNodeType(undefined)", true) === false);

/* ===== D. method is() บนอุปกรณ์จริง ===== */

run("loadExample('branch2');");
const r0 = safeRun("(function(){var r=topoNodes.router;return JSON.stringify({isR:r.is('isRouter'),isS:r.is('isSwitch'),main:r.is('isMainRouter'),label:r.caps.label,junk:r.is('ชื่อมั่ว')});})()", null);
const RD = JSON.parse(r0 || '{}');
check('D1: Router หลักตอบว่าเป็น Router', RD.isR === true);
check('D2: Router หลักตอบว่าไม่ใช่ Switch', RD.isS === false);
check('D3: Router หลักรู้ว่าตัวเองเป็นตัวหลัก', RD.main === true);
check('D4: อ่านชื่อเรียกจาก caps ได้', RD.label === 'Router', RD.label);
check('D5: ถามความสามารถที่ไม่มีในตาราง ต้องได้ false ไม่ใช่ undefined', RD.junk === false, String(RD.junk));

const s0 = safeRun("(function(){var s=topoNodes.switches[0];if(!s)return null;return JSON.stringify({isS:s.is('isSwitch'),isR:s.is('isRouter'),vlan:s.is('hasVlan'),ip:s.is('hasOwnIp')});})()", null);
const SD = JSON.parse(s0 || '{}');
check('D6: Switch ตอบว่าเป็น Switch', SD.isS === true);
check('D7: Switch ตอบว่าไม่ใช่ Router', SD.isR === false);
check('D8: Switch มี VLAN', SD.vlan === true);
check('D9: Switch ไม่มี IP ของตัวเอง (อุปกรณ์ชั้นที่ 2)', SD.ip === false);

const p0 = safeRun("(function(){var p=new PCDevice('m-999',0,0);return JSON.stringify({end:p.is('isEndDevice'),del:p.is('canBeDeleted'),r:p.is('isRouter')});})()", null);
const PD = JSON.parse(p0 || '{}');
check('D10: PC ที่สร้างใหม่ตอบว่าเป็นอุปกรณ์ปลายทาง', PD.end === true);
check('D11: PC ลบได้', PD.del === true);
check('D12: PC ไม่ใช่ Router', PD.r === false);

/* ===== E. ตัวช่วยระบุชนิดต้องมีที่เดียว ===== */

const devicesSrc = src('js/devices.js');
const wanSrc = src('js/wan.js');
const topoSrc = src('js/topology.js');

check('E1: isRouterType ประกาศอยู่ใน devices.js', devicesSrc.indexOf('function isRouterType') !== -1);
check('E2: wan.js ไม่ประกาศ isRouterType ซ้ำอีกชุด', wanSrc.indexOf('function isRouterType') === -1);
check('E3: topology.js ไม่ประกาศ isRouter แบบลูกศรซ้ำในฟังก์ชัน',
    topoSrc.indexOf("const isRouter = t =>") === -1);
check('E4: topology.js ไม่ประกาศ isEndDevice ซ้ำในฟังก์ชัน',
    topoSrc.indexOf("const isEndDevice = t =>") === -1);

const allJs = fs.readdirSync(path.join(PROJECT_ROOT, 'js')).filter(function (f) { return f.endsWith('.js'); });
let declCount = 0;
allJs.forEach(function (f) { if (src('js/' + f).indexOf('function isRouterType') !== -1) declCount++; });
check('E5: ทั้งโปรเจกต์ประกาศ isRouterType แค่ที่เดียว', declCount === 1, declCount + ' ที่');

// กันการถอยกลับไปเทียบสตริงตรง ๆ ในสองฟังก์ชันที่เพิ่งแก้
const vStart = topoSrc.indexOf('function validateLink');
const vEnd = topoSrc.indexOf('\n}', vStart);
const validateSrc = vStart !== -1 ? topoSrc.slice(vStart, vEnd) : '';
check('E6: validateLink ไม่เทียบสตริงชนิดอุปกรณ์ตรง ๆ แล้ว',
    validateSrc.length > 0 && !/type === '(router|router-branch|switch|pc|server|department)'/.test(validateSrc),
    (validateSrc.match(/type === '[a-z-]+'/g) || []).join(', '));

/* ===== F. กฎการเชื่อมสายให้ผลเหมือนก่อน refactor ===== */

const branchId = safeRun("(function(){var b=getBranchRouters()[0];return b?b.id:null;})()", null);
check('F0: ตัวอย่าง branch2 มี Router สาขาให้ทดสอบ', !!branchId, String(branchId));

function linkOf(aId, bId) {
    const r = safeRun('(function(){var a=findNodeById(' + JSON.stringify(aId) + '),b=findNodeById(' + JSON.stringify(bId) +
        ');if(!a||!b)return JSON.stringify({miss:true});return JSON.stringify(validateLink(a,b));})()', null);
    return JSON.parse(r || '{"miss":true}');
}
const swId = safeRun("(function(){var s=topoNodes.switches[0];return s?s.id:null;})()", null);
const deptId = safeRun("(function(){var d=topoNodes.departments[0];return d?d.id:null;})()", null);
const swId2 = safeRun("(function(){var s=topoNodes.switches[1];return s?s.id:null;})()", null);

const f1 = linkOf('router', swId);
check('F1: Router หลัก + Switch ต้องห้าม พร้อมบอกให้ไปลากที่ Router สาขา',
    f1.ok === false && String(f1.message).indexOf('อัตโนมัติ') !== -1, f1.message);

const f2 = linkOf(deptId, swId);
check('F2: Department + Switch ต้องห้าม เพราะไม่ใช่อุปกรณ์จริง',
    f2.ok === false && String(f2.message).indexOf('ไม่ใช่อุปกรณ์จริง') !== -1, f2.message);

const f3 = linkOf(branchId, swId);
check('F3: Router สาขา + Switch ได้ และบอกว่าย้ายแผนกไปอยู่หลังสาขา',
    f3.ok === true && String(f3.message).indexOf('ย้ายแผนกนี้') !== -1, f3.message);

const f4 = linkOf('router', branchId);
check('F4: Router + Router ได้ และบอกว่าเป็นลิงก์ WAN จอง /30',
    f4.ok === true && String(f4.message).indexOf('/30') !== -1, f4.message);

const f5 = linkOf(swId, swId2);
check('F5: Switch + Switch ยังปล่อยผ่าน (ช่องโหว่ที่รอแก้ในขั้นที่ 4 ไม่ใช่ของตกหล่น)',
    f5.ok === true && !f5.message, JSON.stringify(f5));

const pcId = safeRun("(function(){var p=addManualNode(PCDevice,10,10);return p.id;})()", null);
const f6 = linkOf('router', pcId);
check('F6: Router + PC ได้ แต่ต้องเตือนว่าปกติควรผ่าน Switch',
    f6.ok === true && String(f6.message).indexOf('ควรผ่าน Switch') !== -1, f6.message);

/* ===== G. ไฟล์เทสต้องไม่จบด้วย process.exit() ===== */

const testFiles = fs.readdirSync(path.join(PROJECT_ROOT, 'tests')).filter(function (f) { return f.endsWith('.js'); });
const STMT = /^[ \t]*process\.exit\(.+\);[ \t]*$/m;
const offenders = testFiles.filter(function (f) { return STMT.test(src('tests/' + f)); });
check('G1: ไม่มีไฟล์เทสไฟล์ไหนจบด้วย process.exit()', offenders.length === 0, offenders.join(', '));

const noExitCode = testFiles.filter(function (f) { return src('tests/' + f).indexOf('process.exitCode') === -1; });
check('G2: ทุกไฟล์เทสกำหนด exit code ด้วย process.exitCode', noExitCode.length === 0, noExitCode.join(', '));
check('G3: run-all.js อธิบายเหตุผลไว้ให้คนรุ่นหลังอ่าน',
    src('tests/run-all.js').indexOf('process.exitCode') !== -1 &&
    src('tests/run-all.js').indexOf('pipe') !== -1);
check('G4: มีไฟล์เทสอย่างน้อย 11 ไฟล์ในโฟลเดอร์', testFiles.length >= 11, testFiles.length + ' ไฟล์');

/* ===== สรุป ===== */
const pass = results.filter(r => r.pass).length;
console.log('\n=== tests/device-model.test.js ===');
results.forEach(r => {
    console.log((r.pass ? '  ผ่าน  ' : '  ไม่ผ่าน ') + r.label + (r.detail ? '   [' + r.detail + ']' : ''));
});
console.log('\nผ่าน ' + pass + ' จาก ' + results.length + ' ข้อ');
// รูปแบบบรรทัดนี้ต้องตรงกับที่ run-all.js อ่าน คือ /(\d+)\/(\d+) passed/
console.log(pass + '/' + results.length + ' passed — ' + new Date().toISOString());
// จบด้วย process.exitCode ไม่ใช่การสั่งให้โปรเซสตายทันที — เหตุผลเต็มอยู่ใน tests/run-all.js
process.exitCode = pass === results.length ? 0 : 1;
