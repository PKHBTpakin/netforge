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
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js', 'js/wan.js', 'js/cli.js', 'js/backdrop.js', 'js/practice.js', 'js/tools.js', 'js/library.js', 'js/history.js', 'js/export.js', 'js/app.js'];

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

// console สำหรับ sandbox ที่กลืน error "ที่ตั้งใจให้เกิด" ไว้
// -----------------------------------------------------------------
// ช่วงที่ storageWorks === false เราจงใจทำให้ localStorage พังเพื่อดูว่าโค้ดกู้สถานการณ์ถูกไหม
// โค้ดแอปตอบสนองถูกต้องแล้วด้วยการ console.error แต่ปลายทางคือ stderr จริง
// ผลคือเวลารัน `node tests/run-all.js` จะมี stack trace โผล่มา 33 บรรทัดคั่นกลางผลเทสที่ผ่าน
// ทำให้คนอ่านนึกว่าพัง — จึงเก็บไว้เงียบ ๆ แทน
// สำคัญ: ไม่ได้ทิ้ง แต่เก็บใส่ mutedErrors แล้วพ่นออกมาให้ครบถ้ามี assertion ไหน fail
// (ถ้าเทสพังจริงจะยังดีบั๊กได้เหมือนเดิม ไม่ได้ปิดตาตัวเอง)
const mutedErrors = [];
const testConsole = {};
for (const k of Object.keys(console)) {
    testConsole[k] = typeof console[k] === 'function' ? console[k].bind(console) : console[k];
}
testConsole.error = function () {
    const line = Array.from(arguments).map(String).join(' ');
    if (!storageWorks) { mutedErrors.push(line); return; } // อยู่ในช่วงที่จงใจทำให้พัง -> คาดไว้แล้ว
    console.error.apply(console, arguments);               // นอกช่วงนั้น = error จริง ต้องเห็น
};
function dumpMutedErrors() {
    if (!mutedErrors.length) return;
    console.error('\n--- error ที่ถูกกลืนไว้ระหว่างเทสจำลอง storage พัง (' + mutedErrors.length + ') ---');
    mutedErrors.forEach(l => console.error(l));
}

const documentStub = {
    documentElement: makeElement('html'), body: makeElement('body'), activeElement: null,
    getElementById, createElement: (tag) => makeElement(tag),
    execCommand: () => { clipboardText = '(copied)'; return true; },
    addEventListener: () => {}, querySelectorAll: () => []
};

const locationStub = { href: 'https://sento.github.io/netforge/', hash: '', protocol: 'https:' };

const sandbox = {
    console: testConsole, setTimeout, clearTimeout,
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
    panel.includes('ใช้งานจริง') && panel.includes('เสียเพราะปัดขนาด') && panel.includes('เหลือเผื่อขยาย'), panel.slice(0, 100));
check('panel: อธิบายว่าส่วนที่เหลือไว้ไม่ใช่ความสูญเปล่า', panel.includes('ไม่ถือว่าเสียเปล่า'));
check('panel: เสนอเปลี่ยนเลขตั้งต้นพร้อมปุ่มกดเปลี่ยน (36.5% -> 73%)', panel.includes('ถ้าเปลี่ยนเลขตั้งต้นเป็น') && panel.includes('/24'));
check('panel: แสดงโควตาที่ได้ฟรี', panel.includes('เพิ่มเครื่องได้อีกฟรี'));

// ตรวจตัวเลข headroom กับ subnet จริง: IT-Department ขอ 50 ได้ /26 (62 usable) -> ฟรี 12
const itFree = run(`(function(){var d=state.calculated.find(x=>x.name==='IT-Department');return (d.subnet.size-2)-d.hosts;})()`);
check('headroom: IT-Department ขอ 50 ได้ /26 -> เพิ่มได้อีก 12 เครื่อง', itFree === 12, itFree);
check('headroom: ตัวเลขในแผงตรงกับที่คำนวณ', panel.includes('+' + itFree + ' เครื่อง'), panel.slice(panel.indexOf('เพิ่มเครื่อง'), panel.indexOf('เพิ่มเครื่อง') + 120));

// โหมด IPv6 ใช้แผงคนละชุด (เดิมซ่อนไปเฉย ๆ ทำให้พื้นที่วิเคราะห์ว่างเปล่าทั้งแถบ)
run("state.baseIp6='2001:db8::'; state.basePrefixLen6=48; state.newPrefixLen6=64; refreshAll(); setIpMode('v6', true);");
let v6panel = stripTags(getElementById('utilPanel').innerHTML);
check('panel-v6: ไม่ซ่อน แต่แสดงแผงของ IPv6 แทน', !getElementById('utilPanel').classList.contains('hidden'));
check('panel-v6: บอกจำนวน subnet ที่แบ่งได้', v6panel.includes('65,536'), v6panel.slice(0, 120));
check('panel-v6: อธิบายว่าจำนวน Host ไม่ใช่ข้อจำกัดของ IPv6', v6panel.includes('ไม่ใช่ข้อจำกัดของ IPv6'));
check('panel-v6: ยืนยันว่า /64 เป็นมาตรฐานของ SLAAC', v6panel.includes('SLAAC') && v6panel.includes('RFC 4291'));

run("state.newPrefixLen6=80; refreshAll(); renderUtilization();");
v6panel = stripTags(getElementById('utilPanel').innerHTML);
check('panel-v6: เตือนเมื่อไม่ได้ใช้ /64 (SLAAC จะใช้ไม่ได้)', v6panel.includes('ไม่ใช่ /64'), v6panel.slice(-160));
run("state.newPrefixLen6=64; refreshAll();");

run("state.baseIp6=''; refreshAll(); renderUtilization();");
check('panel-v6: ยังไม่ตั้งค่า -> ชี้ทางให้กดปุ่มแนะนำ ไม่ปล่อยว่าง',
    stripTags(getElementById('utilPanel').innerHTML).includes('ยังไม่ได้ตั้งค่า IPv6'));
run("state.baseIp6='2001:db8::'; refreshAll();");

run("setIpMode('v4', true)");
check('panel: กลับมาโหมด IPv4 แล้วแสดงแผงของ IPv4 อีกครั้ง',
    !getElementById('utilPanel').classList.contains('hidden') && stripTags(getElementById('utilPanel').innerHTML).includes('เสียเพราะปัดขนาด'));

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

/* ===== F. บั๊กที่พบจากการใช้งานจริงบน GitHub Pages (30 ก.ค. 2569 รอบ 3) ===== */

// F1 — ปุ่ม Suggest Base ตอนอยู่โหมด IPv6 ต้องไม่ไปแตะค่าของ IPv4
run("loadExample('company')");          // 172.16.0.0/23
run("setIpMode('v6', true)");
const v4Before = run("state.baseIp + '/' + state.baseCidr");
capturedToasts = [];
run('onSuggestBase()');
check('v6-suggest: ไม่แก้ Base ของ IPv4 ที่ซ่อนอยู่ (บั๊กเดิมย่อ /23 เป็น /24 เงียบ ๆ)',
    run("state.baseIp + '/' + state.baseCidr") === v4Before, v4Before + ' -> ' + run("state.baseIp + '/' + state.baseCidr"));
check('v6-suggest: ไม่แก้ค่าในช่อง CIDR ของ IPv4',
    String(getElementById('baseCidrInput').value) !== '24' || v4Before.endsWith('/24'), getElementById('baseCidrInput').value);
check('v6-suggest: toast ต้องพูดถึง IPv6 ไม่ใช่รายงานเลข /24 ของ IPv4',
    capturedToasts.some(t => /IPv6/.test(t.msg)) && !capturedToasts.some(t => /พอดีที่สุด/.test(t.msg)),
    JSON.stringify(capturedToasts.map(t => t.msg)));

run("state.baseIp6 = '2001:db8::'; state.basePrefixLen6 = 48; state.newPrefixLen6 = 64; refreshAll();");
capturedToasts = [];
run('onSuggestBase()');
check('v6-suggest: รายงานจำนวน subnet ที่แบ่งได้จริง (/48 -> /64 = 65,536)',
    capturedToasts.some(t => /65,536/.test(t.msg)), JSON.stringify(capturedToasts.map(t => t.msg)));
check('v6-suggest: อธิบายว่าทำไมไม่ต้องย่อ (อ้าง RFC 4291)',
    capturedToasts.some(t => /RFC 4291/.test(t.msg)));

// prefix ที่แบ่งได้ไม่พอกับจำนวนแผนก -> ต้อง "แก้ให้" ไม่ใช่แค่เตือนแล้วปล่อย
run("state.basePrefixLen6 = 62; state.newPrefixLen6 = 64; refreshAll();"); // 2 bits = 4 subnet แต่มี 6 แผนก
check('v6-suggest: เงื่อนไขตั้งต้นถูกต้อง (แบ่งได้ 4 แต่มี 6 แผนก)', run('state.calculatedV6.length') === 0);
capturedToasts = [];
run('onSuggestBase()');
check('v6-suggest: ขยาย Base Prefix ให้เองจนแบ่งครบ', run('state.basePrefixLen6') <= 61, '/' + run('state.basePrefixLen6'));
check('v6-suggest: คำนวณสำเร็จครบทุกแผนกหลังปรับ', run('state.calculatedV6.length') === 6, run('state.calculatedV6.length'));
check('v6-suggest: บอกผู้ใช้ว่าไปแก้อะไรมา', capturedToasts.some(t => /ขยาย Base Prefix/.test(t.msg)), JSON.stringify(capturedToasts.map(t => t.msg)));

// ยังไม่มี Base IPv6 เลย -> ต้องเติมให้แล้วคำนวณ ไม่ใช่บอกให้ไปพิมพ์เอง (ปัญหาที่ผู้ใช้รายงาน)
run("loadExample('company'); setIpMode('v6', true); state.baseIp6=''; state.basePrefixLen6=48; state.newPrefixLen6=64; refreshAll();");
capturedToasts = [];
run('onSuggestBase()');
check('v6-suggest: Base ว่าง -> เติมค่าให้จริง ไม่ใช่แค่บอกให้ไปพิมพ์เอง',
    run('state.baseIp6') === '2001:db8::', run('state.baseIp6'));
check('v6-suggest: เติมแล้วคำนวณให้เลยครบทุกแผนก', run('state.calculatedV6.length') === 6, run('state.calculatedV6.length'));
check('v6-suggest: ไม่ไปแตะค่าของ IPv4 (ยังเป็น /23 ของ Corporate Network)',
    run('state.baseCidr') === 23, '/' + run('state.baseCidr'));
check('v6-suggest: สะท้อนค่ากลับในช่องกรอกให้ผู้ใช้เห็น',
    getElementById('baseIp6Input').value === '2001:db8::', getElementById('baseIp6Input').value);

// Base ที่ไม่ตรงขอบ Block ต้องถูกปัดให้ เหมือนฝั่ง IPv4 (เดิม error แล้วคืนผลเปล่า)
run("state.baseIp6='2001:db8:0:5::'; state.basePrefixLen6=48; refreshAll();");
check('v6-normalize: calculateIPv6 ปัด Base ให้ตรงขอบเอง',
    run('state.baseIp6') === '2001:db8::', run('state.baseIp6'));
check('v6-normalize: ปัดแล้วคำนวณได้ครบ ไม่คืนผลเปล่าเหมือนเดิม', run('state.calculatedV6.length') === 6);
check('v6-normalize: helper ทำงานถูกต้อง',
    run("normalizeIpv6Network('2001:db8:abcd:1234::1', 48)") === '2001:db8:abcd::' &&
    run("normalizeIpv6Network('2001:db8::', 64)") === '2001:db8::' &&
    run("normalizeIpv6Network('ไม่ใช่ไอพี', 48)") === null,
    run("normalizeIpv6Network('2001:db8:abcd:1234::1', 48)"));

run("state.basePrefixLen6 = 48; state.newPrefixLen6 = 64; setIpMode('v4', true);");

// F2 — กล่อง Router บน Canvas ต้องแสดงค่าตามโหมดที่ดูอยู่
run("loadExample('company'); state.baseIp6='2001:db8::'; state.basePrefixLen6=48; refreshAll();");
check('router-label: โหมด IPv4 แสดง Base IPv4',
    run('topoNodes.router.getBaseNetworkSummary()') === '172.16.0.0/23', run('topoNodes.router.getBaseNetworkSummary()'));
run("setIpMode('v6', true)");
check('router-label: โหมด IPv6 แสดง Base IPv6 (เดิมโชว์ IPv4 ค้างไว้ ขัดกับกล่องแผนกที่ขึ้นว่ายังไม่มี IPv6)',
    run('topoNodes.router.getBaseNetworkSummary()') === '2001:db8::/48', run('topoNodes.router.getBaseNetworkSummary()'));
run("state.baseIp6 = ''");
check('router-label: โหมด IPv6 ที่ยังไม่ตั้งค่า แสดงข้อความเดียวกับกล่องแผนก',
    run('topoNodes.router.getBaseNetworkSummary()') === 'ยังไม่มี IPv6', run('topoNodes.router.getBaseNetworkSummary()'));
run("setIpMode('v4', true)");

// F3 — exportProject ต้องไม่ปล่อยไฟล์เปล่าออกมา
run('clearAll()');
capturedToasts = [];
run('exportProject()');
check('export: ไม่มีข้อมูล -> เตือนแทนที่จะโหลดไฟล์เปล่า 362 bytes ติดเครื่อง',
    capturedToasts.some(t => t.type === 'error') && !capturedToasts.some(t => /เป็นไฟล์แล้ว/.test(t.msg)),
    JSON.stringify(capturedToasts.map(t => t.msg)));
run("loadExample('small')");
capturedToasts = [];
run('exportProject()');
check('export: มีข้อมูลแล้วยัง export ได้ปกติ', capturedToasts.some(t => t.type === 'success'), JSON.stringify(capturedToasts.map(t => t.msg)));

/* ===== G. ผลตรวจรอบละเอียด (30 ก.ค. 2569 รอบ 4) ===== */

// อ่าน "สีที่ผู้ใช้เห็นจริง" ออกมาจาก HTML ที่ render แทนการเดาจาก index
function colorsFromHtml(html) {
    const map = {}; const re = /style="color:([^"]+)"[^>]*>([^<]+)</g; let m;
    while ((m = re.exec(html))) map[m[2].trim()] = m[1];
    return map;
}

// G1 — สีประจำแผนกต้องเป็นสีเดียวกันทุกที่ที่แสดง
run("loadExample('company'); state.baseIp6='2001:db8::'; state.basePrefixLen6=48; state.newPrefixLen6=64; refreshAll();");
run("setIpMode('v4', true); renderTable();");
const colV4 = colorsFromHtml(getElementById('ipTableBody').innerHTML);
run("setIpMode('v6', true); renderTable();");
const colV6 = colorsFromHtml(getElementById('ipTableBody').innerHTML);
run("setIpMode('v4', true); renderSidebarDepts();");
const colSide = colorsFromHtml(getElementById('deptList').innerHTML);
const deptNames = run('state.departments.map(d=>d.name)');

const colorBad = deptNames.filter(n => colV4[n] && colV6[n] && colV4[n] !== colV6[n]);
check('สี: แผนกเดียวกันได้สีเดียวกันในตาราง IPv4 และ IPv6 (เดิม 3/6 ไม่ตรง)',
    colorBad.length === 0, colorBad.length ? colorBad.map(n => n + ' ' + colV4[n] + '/' + colV6[n]).join(', ') : deptNames.length + ' แผนกตรงกันหมด');
check('สี: sidebar ใช้สีเดียวกับตาราง',
    deptNames.every(n => !colSide[n] || !colV4[n] || colSide[n] === colV4[n]));
check('สี: Canvas ใช้สีเดียวกับตาราง',
    run('topoNodes.switches').every(s => {
        const name = run('state.calculated.find(d=>d.id===' + s.deptId + ').name');
        return !colV4[name] || colV4[name] === s.color;
    }));

// ลบแผนกกลางแถวแล้วสีของแผนกที่เหลือต้องไม่เลื่อน (เหตุผลเดียวกับที่ VLAN ไม่เลื่อน)
const colBefore = run("state.calculated.map(d=>[d.name, getDeptColor(d.id)])");
run("onRemoveDept(state.departments[1].id)");
const colAfter = run("state.calculated.map(d=>[d.name, getDeptColor(d.id)])");
check('สี: ลบแผนกกลางแถวแล้วสีของแผนกอื่นไม่เลื่อนตาม',
    colAfter.every(([n, c]) => { const b = colBefore.find(x => x[0] === n); return !b || b[1] === c; }),
    JSON.stringify(colAfter.filter(([n, c]) => { const b = colBefore.find(x => x[0] === n); return b && b[1] !== c; })));

// G2 — แผนกที่จัดสรรไม่สำเร็จต้องไม่หายเงียบ
run("clearAll(); state.baseIp='10.0.0.0'; state.baseCidr=24; state.departments=[{id:1,name:'BigDept',hosts:500},{id:2,name:'SmallDept',hosts:10}]; refreshAll();");
check('failed: บันทึกลง state.failed พร้อมเหตุผล', run('state.failed.length') === 1, run('JSON.stringify(state.failed)'));
check('failed: มีแถวในตาราง IP', stripTags(getElementById('ipTableBody').innerHTML).includes('BigDept'));
check('failed: ตารางบอกเหตุผลที่แก้ตามได้', /จัดสรรไม่สำเร็จ.*Base/.test(stripTags(getElementById('ipTableBody').innerHTML)));
check('failed: sidebar ค้างเหตุผลไว้ถาวร (ไม่ใช่แค่ toast 2.5 วินาที)',
    /ขยาย Base|เหลือไม่พอ/.test(stripTags(getElementById('deptList').innerHTML)));
check('failed: แผนกที่สำเร็จยังคำนวณได้ปกติ', run('state.calculated.length') === 1 && run("state.calculated[0].name") === 'SmallDept');

run("clearAll(); state.baseIp='10.0.0.0'; state.baseCidr=28; state.departments=[{id:1,name:'A',hosts:500},{id:2,name:'B',hosts:400}]; refreshAll();");
check('failed: ทุกแผนกล้มเหลว -> ยังเห็นแถวเหตุผล', stripTags(getElementById('ipTableBody').innerHTML).includes('A'));
check('failed: ทุกแผนกล้มเหลว -> ไม่ขึ้น "เพิ่มแผนกและกด Calculate" ผิดบริบท',
    getElementById('tableEmpty').classList.contains('hidden'));

run('clearAll()');
check('failed: Clear แล้วล้าง state.failed ด้วย', run('state.failed.length') === 0);

// G3 — summaryRoutes ต้องถูกเก็บและคืนค่า
run("loadExample('small'); state.summaryRoutes=['10.9.9.0/24','10.9.10.0/24'];");
const snapWithRoutes = run('buildProjectSnapshot()');
check('summaryRoutes: ถูกเก็บลง snapshot', Array.isArray(snapWithRoutes.summaryRoutes) && snapWithRoutes.summaryRoutes.length === 2);
run("state.summaryRoutes=[]");
run('applyProjectData(__sr)', Object.assign(context, { __sr: snapWithRoutes }));
check('summaryRoutes: คืนค่ากลับครบหลังโหลดโปรเจกต์', run('state.summaryRoutes.length') === 2, run('JSON.stringify(state.summaryRoutes)'));
const oldSchema = JSON.parse(JSON.stringify(snapWithRoutes)); delete oldSchema.summaryRoutes;
run("state.summaryRoutes=['1.1.1.0/24']");
run('applyProjectData(__old)', Object.assign(context, { __old: oldSchema }));
check('summaryRoutes: ไฟล์เก่าที่ไม่มีฟิลด์นี้ -> ไม่ล้างของเดิมทิ้ง', run('state.summaryRoutes.length') === 1);

// G4 — หยุดวาดตอนไม่มีอะไรเคลื่อนไหว
run("loadExample('company'); state.showArrows = false; hoverInfo = null; dragInfo = null;");
run('renderFrame()'); // เฟรมนี้ล้าง needsRedraw
check('idle: ไม่มีอะไรขยับ -> isAnimating() เป็น false', run('isAnimating()') === false);
check('idle: needsRedraw ถูกล้างหลังวาด', run('needsRedraw') === false);
run('requestRedraw()');
check('idle: requestRedraw() สั่งให้วาดรอบใหม่ได้', run('needsRedraw') === true);
run("state.showArrows = true;");
check('idle: เปิดลูกศร -> ต้องวาดต่อเนื่อง', run('isAnimating()') === true);
run("state.showArrows = false; dragInfo = { nodeId:'router' };");
check('idle: กำลังลากโหนด -> ต้องวาดต่อเนื่อง', run('isAnimating()') === true);
run("dragInfo = null; hoverInfo = { id:'router' };");
check('idle: ชี้ค้างอยู่ -> ต้องวาดต่อเนื่อง', run('isAnimating()') === true);
run("hoverInfo = null; state.showArrows = true;");

check('idle: layoutTopology สั่งวาดใหม่เสมอ',
    (function () { run('renderFrame(); needsRedraw = false; layoutTopology();'); return run('needsRedraw') === true; })());
check('idle: เลือกโหนดสั่งวาดใหม่ (กรอบเน้นเปลี่ยน)',
    (function () { run('needsRedraw = false; selectNode(state.departments[0].id, "department");'); return run('needsRedraw') === true; })());

// G5 — CLI ตอนว่างต้องไม่เป็นจอดำทึบ
run('clearAll(); renderCLI();');
check('cli-empty: ใส่คลาส cli-empty ตอนไม่มีข้อมูล',
    getElementById('cliRouterOutput').classList.contains('cli-empty') && getElementById('cliSwitchOutput').classList.contains('cli-empty'));
run("loadExample('small'); renderCLI();");
check('cli-empty: ถอดคลาสออกเมื่อมีคำสั่งแล้ว',
    !getElementById('cliRouterOutput').classList.contains('cli-empty'));

/* ===== H. Router สาขา + ลิงก์ WAN (30 ก.ค. 2569 รอบ 5) =====
   จำลองสถานการณ์จริง: สำนักงานใหญ่ 6 แผนก + สาขา 1 แห่งที่รับแผนก Sales ไปดูแล
   เทสทั้งหมดในหมวดนี้ยิงผ่านทางเข้าจริง (addManualNode/addLink/renderCLI) ไม่ได้เรียกฟังก์ชันภายในลอย ๆ */

// stripTags ด้านบนแทนแท็กด้วย ' ' ซึ่งทำให้ 'hostname</span> <span>Router-01' กลายเป็น 'hostname   Router-01'
// หมวดนี้ต้องเทียบข้อความคำสั่ง IOS แบบตรงตัว จึงใช้ตัวถอดแท็กที่ไม่แทรกช่องว่างเพิ่ม
const cliText = (html) => String(html).replace(/<[^>]*>/g, '');

run("loadExample('company')"); // 172.16.0.0/23, 6 แผนก
const wanSetup = run(`(function(){
    var br = addManualNode(BranchRouterDevice, 1100, 300);
    br.label = 'Router-Branch-CM';
    addLink('router', br.id);
    var swSales = topoNodes.switches.find(function(s){
        return state.calculated.find(function(d){ return d.id === s.deptId; }).name === 'Sales';
    });
    addLink(br.id, swSales.id);
    refreshAll();
    return { branch: br.id, sw: swSales.id, vlan: swSales.vlanId };
})()`);

// H1 — การจอง /30
const wl = run('state.wanLinks[0]');
check('wan: ลิงก์ Router-Router ถูกจอง /30', wl && wl.cidr === 30, wl && wl.network + '/30');
check('wan: สองปลายได้คนละ IP และอยู่ใน usable range',
    wl && wl.ends[0].ip !== wl.ends[1].ip &&
    run("ipToLong('" + (wl ? wl.ends[0].ip : '0.0.0.0') + "')") === run("ipToLong('" + (wl ? wl.network : '0.0.0.0') + "') + 1") &&
    run("ipToLong('" + (wl ? wl.ends[1].ip : '0.0.0.0') + "')") === run("ipToLong('" + (wl ? wl.network : '0.0.0.0') + "') + 2"),
    wl && wl.ends.map(function(e) { return e.ip; }).join(' <-> '));
check('wan: netmask ของ /30 ถูกต้อง', wl && wl.netmask === '255.255.255.252');

// index ของ block ต้องไม่เลื่อนเมื่อเพิ่ม/ลบลิงก์อื่น (เหตุผลเดียวกับ VLAN)
const firstNet = wl.network;
run(`(function(){ var b2 = addManualNode(BranchRouterDevice, 1200, 420); addLink('router', b2.id); refreshAll(); })()`);
check('wan: เพิ่มลิงก์ใหม่แล้ว subnet ของลิงก์เดิมไม่เลื่อน',
    run('state.wanLinks.find(function(w){return w.network==="' + firstNet + '"})') !== undefined, firstNet);
check('wan: ลิงก์ที่สองได้ block ถัดไป ไม่ทับกัน',
    run('state.wanLinks.length') === 2 && run('state.wanLinks[0].network') !== run('state.wanLinks[1].network'),
    run('state.wanLinks.map(function(w){return w.network}).join(", ")'));
run("(function(){ var extra = topoNodes.manualNodes[topoNodes.manualNodes.length-1]; removeManualNode(extra.id); refreshAll(); })()");

// H2 — ความเป็นเจ้าของแผนก
check('wan: แผนกที่ลากไปเชื่อมสาขา ย้ายไปอยู่กับสาขาแล้ว',
    run("getDeptsOfRouter('" + wanSetup.branch + "').map(function(d){return d.name}).join()") === 'Sales');
check('wan: แผนกที่เหลือยังอยู่กับ Router หลัก',
    run("getDeptsOfRouter('router').length") === 5, run("getDeptsOfRouter('router').map(function(d){return d.name}).join(', ')"));
check('wan: Router หลักไม่ลากสายไป Switch ที่ย้ายไปสาขาแล้ว (กันวงลูปที่ไม่มีความหมาย)',
    run('getConnections().length') === (run('topoNodes.switches.length') - 1) + run('topoNodes.switches.length'),
    run('getConnections().length'));

// H3 — CLI ของสำนักงานใหญ่
run("state.cliRouterId='router'; renderCLI();");
const hqCli = cliText(getElementById('cliRouterOutput').innerHTML);
const salesSub = run("state.calculated.find(function(d){return d.name==='Sales'}).subnet");
check('cli-hq: hostname ยังเป็น Router-01', hqCli.includes('hostname Router-01'));
check('cli-hq: มี static route ไปวงของสาขา',
    hqCli.includes('ip route ' + salesSub.network + ' ' + salesSub.netmask), (hqCli.match(/ip route [^!\n]+/) || [''])[0].trim());
check('cli-hq: ไม่มี sub-interface ของแผนกที่ย้ายไปสาขาแล้ว',
    !hqCli.includes('GigabitEthernet0/0.' + wanSetup.vlan));
check('cli-hq: ไม่มี DHCP pool ของแผนกที่ย้ายไปสาขา', !hqCli.includes('ip dhcp pool Sales'));
check('cli-hq: มี interface WAN พร้อม netmask ของ /30', hqCli.includes('Serial0/') && hqCli.includes('255.255.255.252'));

// H4 — CLI ของสาขา
run("state.cliRouterId='" + wanSetup.branch + "'; renderCLI();");
const brCli = cliText(getElementById('cliRouterOutput').innerHTML);
check('cli-branch: hostname ใช้ชื่อที่ผู้ใช้ตั้ง', brCli.includes('hostname Router-Branch-CM'));
check('cli-branch: เป็น gateway ของแผนกตัวเอง', brCli.includes('ip address ' + salesSub.firstUsable));
check('cli-branch: มี DHCP pool ของแผนกตัวเอง',
    brCli.includes('ip dhcp pool Sales') && brCli.includes('default-router ' + salesSub.firstUsable));
check('cli-branch: ไม่มี pool ของแผนกที่อยู่สำนักงานใหญ่ (บั๊กที่ E2E จับได้)',
    !brCli.includes('ip dhcp pool IT-Department') && !brCli.includes('ip dhcp pool Finance'),
    (brCli.match(/ip dhcp pool \S+/g) || []).join(', '));
check('cli-branch: excluded-address มีเฉพาะของแผนกตัวเอง',
    (brCli.match(/ip dhcp excluded-address/g) || []).length === 1,
    (brCli.match(/ip dhcp excluded-address[^\n]*/g) || []).join(' | '));
check('cli-branch: ใช้ default route กลับต้นทาง (stub network มีทางออกทางเดียว)',
    brCli.includes('ip route 0.0.0.0 0.0.0.0'), (brCli.match(/ip route [^!\n]+/) || [''])[0].trim());
check('cli-branch: ไม่ไล่ static route ทีละวงของสำนักงานใหญ่', (brCli.match(/ip route /g) || []).length === 1);

// H5 — Switch config ยังครบทุก VLAN (สวิตช์กายภาพตัวเดียวรวมทุกแผนก)
const swCli = cliText(getElementById('cliSwitchOutput').innerHTML);
check('cli-switch: ยังมี VLAN ครบทุกแผนกไม่ว่าจะอยู่สาขาไหน',
    (swCli.match(/^vlan \d+$/gm) || []).length === run('state.calculated.length'),
    (swCli.match(/^vlan \d+$/gm) || []).length + ' vs ' + run('state.calculated.length'));

// H6 — กติกาการเชื่อมสาย
check('wan: ห้ามลาก Router หลักไป Switch ตรง ๆ (เชื่อมอัตโนมัติอยู่แล้ว)',
    run("validateLink(topoNodes.router, topoNodes.switches[0]).ok") === false);
check('wan: ห้ามให้แผนกเดียวขึ้นกับสองสาขาพร้อมกัน',
    (function () {
        const r = run(`(function(){
            var b3 = addManualNode(BranchRouterDevice, 900, 500);
            var sw = topoNodes.switches.find(function(s){ return getDeptOwnerRouter(s.deptId) !== null; });
            var res = validateLink(b3, sw);
            removeManualNode(b3.id);
            return res;
        })()`);
        return r.ok === false && /อยู่กับ/.test(r.message);
    })());

// H7 — ตาราง WAN
run('renderWanTable()');
const wanHtml = cliText(getElementById('wanPanel').innerHTML);
check('wan-table: แสดง subnet และ IP ทั้งสองฝั่ง',
    wanHtml.includes(wl.network) && wanHtml.includes(wl.ends[0].ip) && wanHtml.includes(wl.ends[1].ip));
run("setIpMode('v6', true); renderWanTable();");
check('wan-table: ซ่อนในโหมด IPv6 (WAN /30 เป็นเรื่องของ IPv4)',
    getElementById('wanPanel').classList.contains('hidden'));
run("setIpMode('v4', true);");

// H8 — save / load
const wanBefore = run('JSON.stringify({w:state.wanLinks, n:topoNodes.manualNodes.map(function(n){return [n.id,n.type,n.label]}), l:topoNodes.links.map(function(l){return [l.fromId,l.toId]})})');
const wanSnap = run('buildProjectSnapshot()');
run('clearAll()');
run('applyProjectData(__ws)', Object.assign(context, { __ws: wanSnap }));
const wanAfter = run('JSON.stringify({w:state.wanLinks, n:topoNodes.manualNodes.map(function(n){return [n.id,n.type,n.label]}), l:topoNodes.links.map(function(l){return [l.fromId,l.toId]})})');
check('wan: save/load ไป-กลับได้ Router สาขา ลิงก์ และ IP เดิมเป๊ะ', wanBefore === wanAfter,
    wanBefore === wanAfter ? '' : 'ก่อน ' + wanBefore.slice(0, 120) + ' / หลัง ' + wanAfter.slice(0, 120));
check('wan: ชื่อที่ผู้ใช้ตั้งไว้ไม่หายหลังโหลด',
    run("topoNodes.manualNodes.some(function(n){return n.label==='Router-Branch-CM'})"));

// H9 — ลบ Router สาขาแล้วทุกอย่างกลับสู่สภาพเดิม
run("(function(){ var br = topoNodes.manualNodes.find(function(n){return n.type==='router-branch'}); removeManualNode(br.id); refreshAll(); })()");
check('wan: ลบ Router สาขา -> ลิงก์ WAN หายตาม', run('state.wanLinks.length') === 0, run('state.wanLinks.length'));
check('wan: ลบ Router สาขา -> แผนกกลับมาขึ้นกับ Router หลักทั้งหมด',
    run("getDeptsOfRouter('router').length") === run('state.calculated.length'));
run("state.cliRouterId='router'; renderCLI();");
check('wan: ลบแล้ว CLI กลับมามีทุกแผนกเหมือนเดิม',
    cliText(getElementById('cliRouterOutput').innerHTML).includes('ip dhcp pool Sales'));

/* ===== I. ปัญหาที่พบจากการใช้งานจริงหลัง deploy (30 ก.ค. 2569 รอบ 6) ===== */

// I1 — คลิก Router สาขาแล้วต้องเปิดพาเนลของตัวมันเอง (ที่มีปุ่มลบ) ไม่ใช่พาเนลของ Router หลัก
run("loadExample('small')");
const brId = run("(function(){ var b = addManualNode(BranchRouterDevice, 400, 300); b.label='Router-Test'; refreshAll(); return b.id; })()");
const canvasEl2 = getElementById('topoCanvas');
run("state.placingType = null; state.connectMode = false;");
canvasEl2._listeners['mousedown'][0]({ clientX: 400, clientY: 300 });
check('branch-panel: คลิกแล้วเลือกเป็น router-branch ไม่ใช่ router หลัก',
    run('state.selectedNodeType') === 'router-branch', run('state.selectedNodeType'));
check('branch-panel: selectedDeptId ชี้ที่ id ของ Router สาขา', run('state.selectedDeptId') === brId, run('state.selectedDeptId'));
run('renderDetailPanel()');
const brPanel = getElementById('detailContent').innerHTML;
check('branch-panel: มีปุ่มลบ Router (เดิมไม่มีเพราะไปเปิดพาเนล Router หลัก)',
    brPanel.includes('onRemoveManualNode') && brPanel.includes('ลบ Router นี้'));
check('branch-panel: มีช่องแก้ชื่อ', brPanel.includes('onBranchRouterRename'));
check('branch-panel: ไม่ใช่พาเนลของ Router หลัก', !brPanel.includes('BASE NETWORK'));

capturedToasts = [];
run("onRemoveManualNode('" + brId + "')");
check('branch-panel: ลบได้จริง', run("topoNodes.manualNodes.some(function(n){return n.id==='" + brId + "'})") === false);

// I2 — เชื่อมสายแล้วต้องคำนวณ WAN ทันที ไม่ต้องรอให้ไปแก้อย่างอื่นก่อน
run("loadExample('small')");
const brId2 = run("(function(){ var b = addManualNode(BranchRouterDevice, 500, 300); b.label='BR2'; refreshAll(); return b.id; })()");
check('link-refresh: ก่อนเชื่อม ยังไม่มีลิงก์ WAN', run('state.wanLinks.length') === 0);
// ยิงผ่าน flow จริงของโหมด Connect (คลิกสองครั้ง) ไม่ได้เรียก addLink ตรง ๆ
run("toggleConnectMode()");
run("(function(){ var r = topoNodes.router; canvasClickAt = null; })()");
canvasEl2._listeners['mousedown'][0]({ clientX: run('topoNodes.router.x'), clientY: run('topoNodes.router.y') });
canvasEl2._listeners['mousedown'][0]({ clientX: 500, clientY: 300 });
check('link-refresh: เชื่อมแล้วได้ลิงก์ WAN ทันที (เดิมต้องรอ refresh อย่างอื่นก่อน)',
    run('state.wanLinks.length') === 1, run('state.wanLinks.length'));
check('link-refresh: ป้ายบนกล่อง Router สาขาไม่ขึ้นว่า "ยังไม่มีลิงก์ WAN" อีกแล้ว',
    run("topoNodes.manualNodes.find(function(n){return n.id==='" + brId2 + "'}).getIpLabel()").indexOf('ยังไม่มี') === -1,
    run("topoNodes.manualNodes.find(function(n){return n.id==='" + brId2 + "'}).getIpLabel()"));
run("state.connectMode = false;");

// I3 — ลูกศรวิ่งต้องมีบนสายที่ผู้ใช้ลากเองด้วย ไม่ใช่เฉพาะสายอัตโนมัติ
const autoCount = run('getConnections().length');
const allCount = run('getAllConnections().length');
check('arrows: getAllConnections รวมสายที่ลากเองด้วย', allCount > autoCount, autoCount + ' -> ' + allCount);
check('arrows: จำนวน particle ตรงกับจำนวนสายทั้งหมด (3 ตัวต่อเส้น)',
    run('particles.length') === allCount * 3, run('particles.length') + ' vs ' + (allCount * 3));

// ลบสายแล้ว particle ต้องลดตาม ไม่ค้างวิ่งบนสายที่ไม่มีอยู่แล้ว
const wanLinkId = run('state.wanLinks[0].linkId');
run("onRemoveLink('" + wanLinkId + "')");
check('arrows: ลบสายแล้ว particle ลดตาม', run('particles.length') === run('getAllConnections().length') * 3);
check('link-remove: ลบสายทีละเส้นได้โดยไม่ต้องลบทั้งอุปกรณ์',
    run('state.wanLinks.length') === 0 && run("topoNodes.manualNodes.some(function(n){return n.id==='" + brId2 + "'})") === true);

// I4 — ระบบพิกัดของมุมมอง (ย่อ/ขยาย/เลื่อน)
run('resetView()');
check('view: ค่าเริ่มต้น zoom 100% ไม่เลื่อน', run('viewZoom') === 1 && run('viewPanX') === 0 && run('viewPanY') === 0);

run('zoomBy(1.2)');
check('view: ขยายแล้ว zoom เพิ่มขึ้น', run('viewZoom') > 1, run('viewZoom').toFixed(3));
run('resetView(); zoomBy(1/1.2);');
check('view: ย่อแล้ว zoom ลดลง', run('viewZoom') < 1, run('viewZoom').toFixed(3));

run('resetView();');
for (let i = 0; i < 40; i++) run('zoomBy(1.2)');
check('view: ขยายจนสุดแล้วไม่เกินเพดาน', run('viewZoom') <= run('ZOOM_MAX') + 0.0001, run('viewZoom').toFixed(3));
run('resetView();');
for (let i = 0; i < 40; i++) run('zoomBy(1/1.2)');
check('view: ย่อจนสุดแล้วไม่ต่ำกว่าขั้นต่ำ', run('viewZoom') >= run('ZOOM_MIN') - 0.0001, run('viewZoom').toFixed(3));

// ซูมเข้าหาจุดหนึ่ง จุดนั้นต้องอยู่ที่เดิมบนจอ (ความรู้สึกแบบแผนที่)
run('resetView();');
const worldBefore = run('(function(){ return { x: (300 - viewPanX)/viewZoom, y: (200 - viewPanY)/viewZoom }; })()');
run('zoomAt(300, 200, 1.5)');
const worldAfter = run('(function(){ return { x: (300 - viewPanX)/viewZoom, y: (200 - viewPanY)/viewZoom }; })()');
check('view: ซูมแล้วจุดใต้เคอร์เซอร์ยังอยู่ตำแหน่งเดิม',
    Math.abs(worldBefore.x - worldAfter.x) < 0.001 && Math.abs(worldBefore.y - worldAfter.y) < 0.001,
    JSON.stringify(worldBefore) + ' vs ' + JSON.stringify(worldAfter));

// zoomToFit ต้องครอบทุกโหนดจริง
run("loadExample('enterprise')");
run("(function(){ var b = addManualNode(BranchRouterDevice, 1800, 900); refreshAll(); })()"); // วางไกลออกไปนอกกรอบ
run('zoomToFit()');
const fitOk = run(`(function(){
    var nodes = [topoNodes.router].concat(topoNodes.switches, topoNodes.departments, topoNodes.manualNodes).filter(Boolean);
    return nodes.every(function(n){
        var sx = n.x * viewZoom + viewPanX, sy = n.y * viewZoom + viewPanY;
        return sx > -1 && sx < cW + 1 && sy > -1 && sy < cH + 1;
    });
})()`);
check('view: zoomToFit ทำให้ทุกโหนดอยู่ในกรอบที่มองเห็น', fitOk, 'zoom ' + run('viewZoom').toFixed(2));

// I5 — การลากพื้นที่ว่างต้องเลื่อนผัง ไม่ใช่ทำอะไรไม่ได้เลย
run('resetView(); state.placingType = null; state.connectMode = false;');
const panBefore = run('viewPanX');
canvasEl2._listeners['mousedown'][0]({ clientX: 20, clientY: 560 }); // จุดว่างมุมล่างซ้าย
check('pan: คลิกที่ว่างแล้วเข้าสู่โหมดเลื่อนผัง', run('panInfo !== null'));
canvasEl2._listeners['mousemove'][0]({ clientX: 120, clientY: 560 });
check('pan: ลากแล้วผังเลื่อนตาม', run('viewPanX') > panBefore, panBefore + ' -> ' + run('viewPanX'));
canvasEl2._listeners['mouseup'][0]({});
check('pan: ปล่อยเมาส์แล้วออกจากโหมดเลื่อน', run('panInfo === null'));
check('pan: ระหว่างเลื่อนผังนับเป็นการเคลื่อนไหว (ต้องวาดต่อเนื่อง)',
    (function () { run('panInfo = { startX:0, startY:0, panX:0, panY:0 }'); const r = run('isAnimating()'); run('panInfo = null'); return r === true; })());

// พิกัดที่ส่งให้ hitTest ต้องเป็น world เสมอ แม้จะซูม/เลื่อนอยู่
run('resetView(); viewZoom = 2; viewPanX = -100; viewPanY = -50;');
const wc = run('getCanvasCoords({ clientX: 300, clientY: 250 })');
check('view: getCanvasCoords แปลงจอ -> world ถูกต้อง ((300+100)/2, (250+50)/2)',
    Math.abs(wc.x - 200) < 0.001 && Math.abs(wc.y - 150) < 0.001, JSON.stringify(wc));
run('resetView();');

/* ---------- สรุปผล ---------- */
let pass = 0;
results.forEach(r => {
    if (r.pass) pass++;
    console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
});
console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
if (pass !== results.length) dumpMutedErrors(); // มีอะไรพัง -> คืน error ที่กลืนไว้ให้ครบเพื่อดีบั๊ก
process.exit(pass === results.length ? 0 : 1);

})();
