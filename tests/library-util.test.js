/* ============================================
   tests/library-util.test.js — ชุดทดสอบของที่เพิ่มรอบ 30 ก.ค. 2569 (รอบที่ 2)
   ============================================
   วิธีรัน:   node tests/library-util.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install (แพทเทิร์นเดียวกับไฟล์เทสอื่นในโฟลเดอร์นี้)

   ครอบคลุม:
   A. Utilization — คณิตศาสตร์ของ ใช้จริง / เสียจากการปัด / สำรองเผื่อโต ต้องบวกกันได้เท่ากับ
      ขนาด Base Block เป๊ะ ๆ เสมอ (ถ้าเพี้ยนแม้แต่ address เดียว แผงสรุปจะโกหกผู้ใช้)
   B. suggestBaseCidr — ต้องได้ block ที่เล็กที่สุดที่ยังจองครบ ไม่ใช่เล็กจนล้น
      และต้องยกสัดส่วนการใช้พื้นที่ของข้อมูลตัวอย่างจริงขึ้นได้ตามที่อ้าง
   C. Headroom — "เพิ่มเครื่องได้อีกฟรี ๆ" ต้องตรงกับขนาด subnet จริง
   D. Library — บันทึก/เปิด/เปลี่ยนชื่อ/ลบ/บันทึกทับ และพฤติกรรมตอน localStorage ใช้ไม่ได้
      (ห้ามบอกผู้ใช้ว่าเซฟแล้วทั้งที่เซฟไม่ได้ — เป็นความผิดพลาดที่อันตรายที่สุดของฟีเจอร์นี้)
   E. Share URL — เข้ารหัส/ถอดรหัสไป-กลับต้องได้ข้อมูลเดิมเป๊ะ รวมถึงชื่อแผนกภาษาไทย
      (btoa รับได้แค่ Latin-1 ถ้าไม่แปลง UTF-8 ก่อนจะพังทันทีที่มีอักษรไทย)
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js', 'js/tools.js', 'js/library.js', 'js/app.js'];

let capturedToasts = [];
let clipboardText = null;

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
        click() {}, focus() {}, select() {}, remove() {},
        setSelectionRange() {},
        getBoundingClientRect() { return { width: 1024, height: 768, left: 0, top: 0 }; },
        setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; },
        querySelectorAll: () => []
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

// localStorage ปลอมที่ "ปิดสวิตช์ได้" เพื่อจำลองกรณี file:// / โหมดส่วนตัว ที่ setItem โยน SecurityError
let storageWorks = true;
const store = {};
const localStorageStub = {
    getItem: k => { if (!storageWorks) throw new Error('SecurityError'); return k in store ? store[k] : null; },
    setItem: (k, v) => { if (!storageWorks) throw new Error('SecurityError'); store[k] = String(v); },
    removeItem: k => { if (!storageWorks) throw new Error('SecurityError'); delete store[k]; }
};

const documentStub = {
    documentElement: makeElement('html'), body: makeElement('body'), activeElement: null,
    getElementById, createElement: (tag) => makeElement(tag),
    execCommand: () => { clipboardText = '(copied)'; return true; },
    addEventListener: () => {}, querySelectorAll: () => []
};

const locationStub = { href: 'https://sento.github.io/netforge/', hash: '', protocol: 'https:' };

const sandbox = {
    console, setTimeout, clearTimeout,
    document: documentStub,
    window: { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1024, innerHeight: 768 },
    location: locationStub,
    localStorage: localStorageStub,
    navigator: {}, // ไม่มี clipboard API -> บังคับให้ copyToClipboard ใช้ทาง fallback ซึ่งเทสได้
    TextEncoder, TextDecoder, btoa, atob,
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
const stripTags = (html) => String(html).replace(/<[^>]*>/g, ' ');

(async () => {

/* ===== A. Utilization — ตัวเลขต้องบวกกันลงตัวเสมอ ===== */

run("loadExample('company')"); // 172.16.0.0/23 = 512 addresses
let u = run('calculateUtilization()');
check('util: total ตรงกับขนาด /23', u.total === 512, u.total);
check('util: used = ผลรวม (hosts+2) ของทุกแผนก = 187', u.used === 187, u.used);
check('util: allocated = ผลรวมขนาด subnet หลังปัด = 240', u.allocated === 240, u.allocated);
check('util: rounding = allocated - used = 53', u.rounding === 53, u.rounding);
check('util: reserve = total - allocated = 272', u.reserve === 272, u.reserve);
check('util: สามส่วนบวกกันได้เท่ากับ total เป๊ะ (ไม่มี address หายหรือเกิน)',
    u.used + u.rounding + u.reserve === u.total, u.used + '+' + u.rounding + '+' + u.reserve + ' = ' + u.total);
check('util: เปอร์เซ็นต์สามส่วนรวมกันได้ 100%',
    Math.abs(u.usedPct + u.roundingPct + u.reservePct - 100) < 0.0001,
    (u.usedPct + u.roundingPct + u.reservePct).toFixed(6));
check('util: ceilingPct = used/allocated = 77.9%', Math.abs(u.ceilingPct - 77.9166) < 0.01, u.ceilingPct.toFixed(2));

run('clearAll()');
u = run('calculateUtilization()');
check('util: ไม่มีแผนกเลย -> reserve เต็ม ไม่ติดลบ ไม่ NaN',
    u.used === 0 && u.rounding === 0 && u.reserve === u.total && !isNaN(u.usedPct), JSON.stringify(u.reserve));

// แผนกที่จัดสรรไม่สำเร็จต้องไม่ถูกนับ ไม่งั้นตัวเลขจะเกิน 100%
run("state.baseIp='10.0.0.0'; state.baseCidr=24; state.departments=[{id:1,name:'Big',hosts:500},{id:2,name:'Small',hosts:10}]; refreshAll();");
u = run('calculateUtilization()');
check('util: แผนกที่ล้นขอบไม่ถูกนับ -> ไม่เกิน 100%',
    u.used + u.rounding + u.reserve === u.total && u.usedPct <= 100, JSON.stringify({ u: u.used, r: u.rounding, re: u.reserve, t: u.total }));

/* ===== B. suggestBaseCidr ===== */

check('suggest: ไม่มีแผนก -> คืน null ไม่ throw', run('suggestBaseCidr([])') === null);
check('suggest: 1 แผนก 20 hosts (ต้อง 32) -> /27', run("suggestBaseCidr([{hosts:20}])") === 27, run("suggestBaseCidr([{hosts:20}])"));
check('suggest: 2 แผนก 100+100 hosts (128+128=256) -> /24', run("suggestBaseCidr([{hosts:100},{hosts:100}])") === 24);
check('suggest: ค่าที่ได้ต้องพอจริง ไม่ล้น',
    (function () {
        const depts = [{ hosts: 50 }, { hosts: 20 }, { hosts: 200 }, { hosts: 7 }];
        const cidr = run('suggestBaseCidr(' + JSON.stringify(depts) + ')');
        const alloc = run('calculateAllocation(' + JSON.stringify(depts) + ').allocated');
        return Math.pow(2, 32 - cidr) >= alloc && Math.pow(2, 32 - cidr) / 2 < alloc; // พอ และเล็กที่สุดที่พอ
    })());
check('suggest: ไม่คืนค่าที่เกินขอบเขต 8-30 ที่ onBaseChange รับได้',
    (function () {
        const tiny = run("suggestBaseCidr([{hosts:1}])");
        const huge = run("suggestBaseCidr([{hosts:65534},{hosts:65534},{hosts:65534},{hosts:65534}])");
        return tiny >= 8 && tiny <= 30 && huge >= 8 && huge <= 30;
    })(), run("suggestBaseCidr([{hosts:1}])") + ' / ' + run("suggestBaseCidr([{hosts:65534},{hosts:65534},{hosts:65534},{hosts:65534}])"));

// ยกสัดส่วนการใช้พื้นที่ของตัวอย่างจริงได้ตามที่อ้างในรีวิว
[['company', 36.5, 73.0], ['school', 20.0, 80.1]].forEach(function (row) {
    const [key, before, after] = row;
    run("loadExample('" + key + "')");
    const b = run('calculateUtilization().usedPct');
    run('onSuggestBase()');
    const a = run('calculateUtilization().usedPct');
    check('suggest: ' + key + ' ' + b.toFixed(1) + '% -> ' + a.toFixed(1) + '% (คาด ' + before + ' -> ' + after + ')',
        Math.abs(b - before) < 0.2 && Math.abs(a - after) < 0.2, b.toFixed(1) + ' -> ' + a.toFixed(1));
});

run("loadExample('small'); onSuggestBase();");
capturedToasts = [];
run('onSuggestBase()');
check('suggest: กดซ้ำตอนพอดีแล้ว -> บอกว่าพอดีที่สุดแล้ว ไม่เปลี่ยนค่ามั่ว',
    capturedToasts.some(t => /พอดีที่สุด/.test(t.msg)), JSON.stringify(capturedToasts));

run('clearAll()');
capturedToasts = [];
run('onSuggestBase()');
check('suggest: ไม่มีแผนก -> เตือนแทนที่จะพัง', capturedToasts.some(t => t.type === 'error'));

/* ===== C. แผงสรุป + Headroom ===== */

run("loadExample('company')");
run('renderUtilization()');
let panel = stripTags(getElementById('utilPanel').innerHTML);
check('panel: แสดงครบทั้งสามส่วน',
    panel.includes('ใช้จริง') && panel.includes('เสียจากการปัด') && panel.includes('สำรองเผื่อโต'), panel.slice(0, 100));
check('panel: อธิบายว่าสำรองไม่ใช่ความสูญเปล่า', panel.includes('ไม่ใช่ความสูญเปล่า'));
check('panel: เสนอย่อ Base พร้อมปุ่มปรับให้ (36.5% -> 73%)', panel.includes('ถ้าย่อ Base เป็น') && panel.includes('/24'));
check('panel: แสดงโควตาที่ได้ฟรี', panel.includes('เพิ่มเครื่องได้อีกฟรี'));

// ตรวจตัวเลข headroom กับ subnet จริง: IT-Department ขอ 50 ได้ /26 (62 usable) -> ฟรี 12
const itFree = run(`(function(){var d=state.calculated.find(x=>x.name==='IT-Department');return (d.subnet.size-2)-d.hosts;})()`);
check('headroom: IT-Department ขอ 50 ได้ /26 -> เพิ่มได้อีก 12 เครื่อง', itFree === 12, itFree);
check('headroom: ตัวเลขในแผงตรงกับที่คำนวณ', panel.includes('+' + itFree + ' เครื่อง'), panel.slice(panel.indexOf('เพิ่มเครื่อง'), panel.indexOf('เพิ่มเครื่อง') + 120));

run("setIpMode('v6', true)");
check('panel: โหมด IPv6 ซ่อนแผงนี้ (แนวคิดคนละแบบ)', getElementById('utilPanel').classList.contains('hidden'));
run("setIpMode('v4', true)");
check('panel: กลับมาโหมด IPv4 แล้วแสดงอีกครั้ง', !getElementById('utilPanel').classList.contains('hidden'));

/* ===== D. Library ===== */

check('library: ตรวจได้ว่า storage ใช้ได้', run('isStorageAvailable()') === true);
check('library: เริ่มต้นคลังว่าง', run('loadLibrary().length') === 0);

run("loadExample('school')");
capturedToasts = [];
const id1 = run("saveToLibrary('งานส่งอาจารย์ รอบ 1')");
check('library: บันทึกแล้วได้ id กลับมา', typeof id1 === 'string' && id1.length > 0, id1);
check('library: มี 1 รายการในคลัง', run('loadLibrary().length') === 1);
check('library: เก็บ metadata ครบ (ชื่อ/จำนวนแผนก/base)',
    (function () { const p = run('loadLibrary()[0]'); return p.name === 'งานส่งอาจารย์ รอบ 1' && p.deptCount === 5 && /^192\.168\./.test(p.base); })(),
    JSON.stringify(run('loadLibrary()[0]').base));
check('library: toast แจ้งสำเร็จ', capturedToasts.some(t => t.type === 'success'));

run("loadExample('hospital')");
const id2 = run("saveToLibrary('')"); // ไม่ตั้งชื่อ -> ต้องได้ชื่อ default ไม่ใช่ค่าว่าง
check('library: ไม่ตั้งชื่อ -> ได้ชื่อ default', run('loadLibrary()[0].name').length > 0, run('loadLibrary()[0].name'));
check('library: รายการใหม่อยู่บนสุด', run('loadLibrary()[0].id') === id2);
check('library: มี 2 รายการ', run('loadLibrary().length') === 2);

// เปิดของเก่ากลับมา ต้องได้ข้อมูลเดิมทั้งชุด
run('clearAll()');
check('library: ล้างก่อนทดสอบเปิด', run('state.departments.length') === 0);
run("openFromLibrary('" + id1 + "')");
check('library: เปิดกลับมาได้ 5 แผนก (School)', run('state.departments.length') === 5, run('state.departments.length'));
check('library: ชื่อแผนกตรงเดิม', run("state.departments.map(d=>d.name).join(',')").includes('Computer-Lab'), run("state.departments.map(d=>d.name).join(',')"));

run("renameInLibrary('" + id1 + "', '  งานส่งอาจารย์ รอบ 2  ')");
check('library: เปลี่ยนชื่อได้และตัดช่องว่างหัวท้าย',
    run('loadLibrary().find(p=>p.id===__id).name', Object.assign(context, { __id: id1 })) === 'งานส่งอาจารย์ รอบ 2',
    run('loadLibrary().find(p=>p.id===__id).name'));
run("renameInLibrary('" + id1 + "', '   ')");
check('library: ชื่อว่างถูกปฏิเสธ ชื่อเดิมคงอยู่',
    run('loadLibrary().find(p=>p.id===__id).name') === 'งานส่งอาจารย์ รอบ 2');

// บันทึกทับ
run("loadExample('small')"); // 3 แผนก
run("overwriteInLibrary('" + id1 + "')");
check('library: บันทึกทับแล้ว deptCount อัปเดตเป็น 3', run('loadLibrary().find(p=>p.id===__id).deptCount') === 3, run('loadLibrary().find(p=>p.id===__id).deptCount'));
check('library: บันทึกทับแล้วชื่อไม่เปลี่ยน', run('loadLibrary().find(p=>p.id===__id).name') === 'งานส่งอาจารย์ รอบ 2');

run("deleteFromLibrary('" + id2 + "')");
check('library: ลบแล้วเหลือ 1 รายการ', run('loadLibrary().length') === 1);
run("deleteFromLibrary('ไม่มี-id-นี้')");
check('library: ลบ id ที่ไม่มีอยู่ ไม่ throw ไม่ทำข้อมูลหาย', run('loadLibrary().length') === 1);

run('renderLibrary()');
// ชื่อโปรเจกต์อยู่ใน attribute value ของ <input> ไม่ใช่ text node -> ต้องดู innerHTML ดิบ ไม่ใช่ตัวที่ strip tag แล้ว
check('library: หน้ารายการแสดงชื่อโปรเจกต์', getElementById('libraryList').innerHTML.includes('งานส่งอาจารย์'));

// จุดสำคัญ: storage ใช้ไม่ได้ ต้องบอกตรง ๆ ห้ามบอกว่าเซฟสำเร็จ
storageWorks = false;
capturedToasts = [];
const failId = run("saveToLibrary('ควรเซฟไม่ได้')");
check('library: storage พัง -> saveToLibrary คืน null', failId === null, String(failId));
check('library: storage พัง -> ไม่มี toast success หลอกผู้ใช้',
    !capturedToasts.some(t => t.type === 'success') && capturedToasts.some(t => t.type === 'error'), JSON.stringify(capturedToasts));
check('library: storage พัง -> isStorageAvailable รายงานตรง', run('isStorageAvailable()') === false);
run('renderLibrary()');
check('library: storage พัง -> หน้ารายการแนะนำให้ใช้ไฟล์ .json แทน',
    stripTags(getElementById('libraryList').innerHTML).includes('.json'));
check('library: storage พัง -> loadLibrary คืน array ว่าง ไม่ throw', Array.isArray(run('loadLibrary()')) && run('loadLibrary().length') === 0);
storageWorks = true;

/* ===== E. Share URL ===== */

run("loadExample('company')");
run("state.departments[0].name = 'ฝ่ายไอที ชั้น3'"); // ทดสอบอักษรไทย + เว้นวรรค
run('refreshAll()');
const encoded = run('encodeProject(buildProjectSnapshot())');
check('share: base64url ไม่มีอักขระต้องห้ามใน URL (+ / =)', !/[+/=]/.test(encoded), encoded.slice(0, 40));
const decoded = run('decodeProject(__enc)', Object.assign(context, { __enc: encoded }));
check('share: ถอดรหัสได้ข้อมูลกลับครบ 6 แผนก', decoded.departments.length === 6, decoded.departments.length);
check('share: ชื่อแผนกภาษาไทยไม่เพี้ยนหลังไป-กลับ',
    decoded.departments[0].name === 'ฝ่ายไอที ชั้น3', decoded.departments[0].name);
// buildProjectSnapshot() ใส่ savedAt เป็นเวลาปัจจุบันทุกครั้ง จึงต้องตัดออกก่อนเทียบ ไม่งั้นไม่มีทางเท่ากัน
check('share: ข้อมูลทั้งก้อนเหมือนเดิมทุก byte (ยกเว้น savedAt ที่เปลี่ยนทุกครั้งโดยตั้งใจ)',
    (function () {
        const strip = (o) => { const c = Object.assign({}, o); delete c.savedAt; return JSON.stringify(c); };
        return strip(decoded) === strip(run('buildProjectSnapshot()'));
    })());

const url = run('buildShareUrl()');
check('share: URL ขึ้นต้นด้วย href เดิมและมี #p=', url.indexOf('https://sento.github.io/netforge/#p=') === 0, url.slice(0, 50));
check('share: ความยาว URL ต่ำกว่าเพดานปลอดภัย 30,000', url.length < 30000, url.length + ' ตัวอักษร');

capturedToasts = [];
run('copyShareLink()');
check('share: copyShareLink แจ้งว่าคัดลอกแล้ว', capturedToasts.some(t => /คัดลอกลิงก์แชร์/.test(t.msg)), JSON.stringify(capturedToasts.map(t => t.msg)));

run('clearAll()');
capturedToasts = [];
run('copyShareLink()');
check('share: ไม่มีข้อมูล -> เตือนแทนที่จะสร้างลิงก์เปล่า', capturedToasts.some(t => t.type === 'error'));

// เปิดจากลิงก์
run('clearAll()');
locationStub.hash = '#p=' + encoded;
capturedToasts = [];
const ok = run('tryLoadFromUrl()');
check('share: tryLoadFromUrl คืน true เมื่อโหลดสำเร็จ', ok === true);
check('share: โหลดจากลิงก์ได้ 6 แผนก', run('state.departments.length') === 6, run('state.departments.length'));
check('share: ชื่อไทยยังถูกต้องหลังโหลดจากลิงก์',
    run('state.departments.some(d=>d.name==="ฝ่ายไอที ชั้น3")'), run("state.departments.map(d=>d.name).join(',')"));

locationStub.hash = '#p=' + encoded.slice(0, 20) + 'ZZZZ'; // ตัดกลางทาง = ข้อมูลเสีย
capturedToasts = [];
check('share: ลิงก์เสีย -> คืน false ไม่ throw', run('tryLoadFromUrl()') === false);
check('share: ลิงก์เสีย -> แจ้งผู้ใช้ว่าลิงก์ใช้ไม่ได้', capturedToasts.some(t => t.type === 'error'), JSON.stringify(capturedToasts.map(t => t.msg)));

locationStub.hash = '';
check('share: ไม่มี hash -> คืน false เงียบ ๆ', run('tryLoadFromUrl()') === false);
locationStub.hash = '#somethingelse=1';
check('share: hash ที่ไม่ใช่ของเรา -> คืน false เงียบ ๆ', run('tryLoadFromUrl()') === false);

/* ---------- สรุปผล ---------- */
let pass = 0;
results.forEach(r => {
    if (r.pass) pass++;
    console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
});
console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
process.exit(pass === results.length ? 0 : 1);

})();
