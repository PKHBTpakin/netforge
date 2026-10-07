/* ============================================
   tests/practice-steps.test.js — หน้าเฉลยของโหมดฝึก (7 ต.ค. 2569)
   ============================================
   วิธีรัน:   node tests/practice-steps.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):

   ทส.3 ข้อ 6 เขียนไว้ว่าโหมดฝึกจะ "เฉลยพร้อมคำอธิบายโดยละเอียด"
   แต่ของจริงที่ขึ้นบนหน้าจอคือตารางสรุปหกคอลัมน์ ซึ่งบอกแค่ผลลัพธ์
   ไม่ได้บอกว่าได้มาอย่างไร และไม่มีช่อง Host แรก กับ Host สุดท้าย อยู่ในนั้นเลย
   ทั้งที่ตารางคำตอบด้านบนบังคับให้ผู้ใช้กรอกสองช่องนี้ด้วย
   คนที่ตอบสองช่องนั้นผิดจึงเปิดเฉลยแล้วยังไม่รู้ว่าคิดผิดตรงไหน

   เรื่องนี้ชุดทดสอบเดิมจับไม่ได้เลย เพราะไม่มีอะไรพัง ไม่มี error
   ตารางก็แสดงผลถูกต้องตามที่เขียนไว้ มันเป็นข้อบกพร่องแบบ "สิ่งที่ขาดหายไป"
   จึงต้องถามกลับด้านตามบทเรียนในบทที่ 5.2.2 ของรายงาน ว่า "ต้องมีสิ่งนี้อยู่"

   เทสชุดนี้ล็อกไว้สามเรื่องที่เสียเวลาแก้ไปหลายรอบ ไม่ให้ถอยกลับที่เดิม:

     1. เนื้อหา   เฉลยต้องมีการ์ดอธิบายครบ 6 ขั้นทุกแผนก และมีครบทั้ง 5 ช่อง
     2. ความอ่านง่าย  ขนาดตัวอักษรในบล็อกเฉลยต้องไม่เล็กกว่า 14px
                      (ผู้ใช้ตีกลับสองรอบตอนเป็น 11px กับ 14px ว่าอ่านไม่ออก)
     3. สี       ห้ามใช้โค้ดสีตายตัวที่วัดแล้วไม่ผ่าน WCAG AA
                 คือ #1F7A45 (3.26:1 ในโหมดมืด) กับ #b8790f (3.63:1 ในโหมดสว่าง)
                 ต้องใช้ var(--ok) กับ var(--warn) แทนเท่านั้น

   ครอบคลุม:
   A. การ์ด 6 ขั้น ขึ้นครบทุกแผนก และมีหัวข้อทั้ง 6 ชื่อ
   B. ครบทั้ง 5 ช่อง โดยเฉพาะ Host แรก กับ Host สุดท้าย ที่หายไปแต่เดิม
   C. ตัวเลขทุกตัวในเฉลยตรงกับที่ solveVLSM() คำนวณ ไม่ได้คิดเลขใหม่เอง
   D. ตารางสรุปหกคอลัมน์ของเดิมยังอยู่ ไม่ได้ลบของเก่าทิ้งไปแลกของใหม่
   E. เฉลยต้องไม่โผล่มาก่อนผู้ใช้กดปุ่มดูเฉลย
   F. ขนาดตัวอักษรและเส้นคั่นแถวตามที่ผู้ใช้ขอ
   G. สีมาจากตัวแปรธีม ไม่มีโค้ดสีที่ contrast ไม่ผ่านหลงเหลือ
   H. คำใบ้ตอนตอบผิด ไม่แครชและไม่พูดเลขนอกช่วงออกมา
   I. ทุกระดับความยาก render ได้ ไม่มี NaN หรือ undefined หลุดไปโชว์
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

/* รันแล้วถ้าโค้ดที่ทดสอบพังหรือยังไม่มีฟังก์ชันนั้น ให้คืนค่าว่างแทนการโยน error ทิ้ง
   เพราะต้องการให้ผลออกมาเป็น "ข้อนี้ไม่ผ่าน เพราะ..." ให้อ่านได้ทุกข้อ
   ไม่ใช่ crash ที่ข้อแรกแล้วไม่รู้ว่าอีก 120 ข้อเป็นอย่างไร */
function safeRun(code, fallback) {
    try { return run(code); } catch (e) { return fallback === undefined ? '' : fallback; }
}

/* ไล่สองยกกำลังด้วยสูตรที่เขียนไว้ในเทสเอง เพื่อให้ค่าที่คาดหวังไม่ได้มาจากโค้ดที่กำลังทดสอบ
   ถ้าเอา practicePow2Text() ของโปรแกรมมาสร้างค่าที่คาดหวัง เทสจะเห็นด้วยกับโค้ดเสมอ
   แม้โค้ดจะคิดผิด ซึ่งเท่ากับไม่ได้ทดสอบอะไรเลย */
function expectPow2Text(need) {
    const steps = [];
    for (let k = 2; k <= 20; k++) {
        const v = Math.pow(2, k);
        steps.push({ exp: k, val: v, ok: v >= need });
        if (v >= need) break;
    }
    return steps.slice(-2).map(function (s) {
        return '2 ยกกำลัง ' + s.exp + ' = ' + s.val + (s.ok ? ' พอ' : ' ไม่พอ');
    }).join(' · ');
}

const results = [];
function check(label, cond, detail) {
    results.push({ label, pass: !!cond, detail: detail !== undefined ? String(detail) : '' });
}
function countOf(hay, needle) {
    if (!needle) return 0;
    return String(hay).split(needle).length - 1;
}

/* ===== เตรียมโจทย์แบบกำหนดเองแทนการสุ่ม =====
   generatePracticeProblem() สุ่มทั้งช่วง IP และจำนวนเครื่อง ถ้าเอามาใช้ตรง ๆ
   เทสจะเช็กค่าที่คาดไว้ล่วงหน้าไม่ได้ และจะผ่านหรือไม่ผ่านสลับกันไปแต่ละรอบ
   จึงยัดโจทย์คงที่ลง practiceState.problem โดยให้ solveVLSM() เป็นคนคำนวณคำตอบ
   เหมือนที่โปรแกรมจริงทำ เพื่อให้สิ่งที่ทดสอบคือ "การแสดงผล" ไม่ใช่ "การสุ่ม" */

const FIXED = run(`
    (function () {
        var depts = [
            { id: 1, name: 'IT-Dept',   hosts: 50 },
            { id: 2, name: 'Marketing', hosts: 25 },
            { id: 3, name: 'HR',        hosts: 10 }
        ];
        var solved = solveVLSM('192.168.1.0', 24, depts);
        practiceState.level = 'easy';
        practiceState.problem = {
            baseIp: '192.168.1.0', baseCidr: 24,
            departments: depts, answer: solved.results
        };
        practiceState.answers = {};
        practiceState.checked = false;
        practiceState.revealed = true;
        practiceState.score = null;
        return JSON.stringify({ failed: solved.failed.length, answer: solved.results });
    })();
`);
const fixed = JSON.parse(FIXED);
const ANS = fixed.answer;

check('0: โจทย์ตั้งต้นจัดสรรได้ครบ 3 แผนก',
    fixed.failed === 0 && ANS.length === 3,
    'จัดไม่ได้ ' + fixed.failed + ' แผนก / ได้คำตอบ ' + ANS.length + ' แผนก');

safeRun('renderPracticeSteps();');          // เรียกเปล่า ๆ ก่อน เพื่อให้ error โผล่ที่บรรทัดนี้ ไม่ใช่ปนในหน้าจอ
let renderErr = '';
let steps = '';
try { steps = String(run('renderPracticeSteps()')); } catch (e) { renderErr = e.message; }
check('0b: renderPracticeSteps() ต้องมีอยู่และเรียกได้ไม่พัง', renderErr === '' && steps.length > 0, renderErr);
safeRun('renderPractice();');

/* ===== A. การ์ด 6 ขั้น ขึ้นครบทุกแผนก ===== */

check('A1: มีหัวข้อ วิธีคิดทีละขั้น', steps.indexOf('วิธีคิดทีละขั้น') !== -1);

for (let n = 1; n <= 6; n++) {
    check('A2.' + n + ': ป้าย ขั้น ' + n + ' ขึ้นครบ 3 แผนก',
        countOf(steps, 'ขั้น ' + n) === ANS.length,
        'พบ ' + countOf(steps, 'ขั้น ' + n) + ' ครั้ง ต้องได้ ' + ANS.length);
}

[
    ['A3.1', 'ทำไมได้คิวนี้'],
    ['A3.2', 'ต้องการเท่าไหร่'],
    ['A3.3', 'ปัดขึ้นเป็น'],
    ['A3.4', 'เลขทับ'],
    ['A3.5', 'วางตรงไหน'],
    ['A3.6', 'เติม 5 ช่อง']
].forEach(function (pair) {
    check(pair[0] + ': มีหัวข้อขั้น "' + pair[1] + '"', steps.indexOf(pair[1]) !== -1);
});

ANS.forEach(function (a, i) {
    check('A4.' + (i + 1) + ': บอกลำดับที่จัดสรรของ ' + a.name,
        steps.indexOf('ลำดับที่ ' + (i + 1) + ' จาก ' + ANS.length) !== -1);
});

check('A5: เรียงจากแผนกใหญ่ไปเล็กจริง',
    ANS.every(function (a, i) { return i === 0 || ANS[i - 1].hosts >= a.hosts; }),
    ANS.map(function (a) { return a.name + ':' + a.hosts; }).join(' > '));

check('A6: บรรทัดนำบอกลำดับการเรียงให้เห็น',
    steps.indexOf('IT-Dept 50') !== -1 &&
    steps.indexOf('Marketing 25') !== -1 &&
    steps.indexOf('HR 10') !== -1);

/* ===== B. ครบทั้ง 5 ช่อง — จุดที่หายไปแต่เดิม =====
   สองข้อ B2 กับ B3 คือหัวใจของไฟล์นี้ ถ้าใครถอดการ์ดขั้นที่ 6 ออก
   สองข้อนี้ต้องฟ้องทันที เพราะตารางสรุปของเดิมไม่มีสองค่านี้อยู่เลย */

ANS.forEach(function (a, i) {
    const tag = '.' + (i + 1) + ': ' + a.name;
    check('B1' + tag + ' มี Network',
        steps.indexOf('Network ' + a.subnet.network) !== -1, a.subnet.network);
    check('B2' + tag + ' มี Host แรก',
        steps.indexOf('Host แรก ' + a.subnet.firstUsable) !== -1, a.subnet.firstUsable);
    check('B3' + tag + ' มี Host สุดท้าย',
        steps.indexOf('Host สุดท้าย ' + a.subnet.lastUsable) !== -1, a.subnet.lastUsable);
    check('B4' + tag + ' มี Broadcast',
        steps.indexOf('Broadcast ' + a.subnet.broadcast) !== -1, a.subnet.broadcast);
    check('B5' + tag + ' มีเลขหลังทับ /' + a.subnet.cidr,
        steps.indexOf('/' + a.subnet.cidr) !== -1);
});

check('B6: อธิบายที่มาของ Host แรก ว่าคือตัวแรกบวกหนึ่ง',
    steps.indexOf('ตัวแรก + 1') !== -1);
check('B7: อธิบายที่มาของ Host สุดท้าย ว่าคือตัวสุดท้ายลบหนึ่ง',
    steps.indexOf('ตัวสุดท้าย − 1') !== -1);
check('B8: ครบ 5 ช่อง × 3 แผนก = Network ขึ้น 3 ครั้งในการ์ด',
    countOf(steps, 'Network ') >= ANS.length, countOf(steps, 'Network '));

/* ===== C. ตัวเลขตรงกับ solveVLSM() ไม่ได้คิดเลขใหม่เอง ===== */

ANS.forEach(function (a, i) {
    const need = a.hosts + 2;
    const bits = 32 - a.subnet.cidr;
    const tag = '.' + (i + 1) + ': ' + a.name;

    check('C1' + tag + ' โชว์การบวก 2 ให้ Network กับ Broadcast',
        steps.indexOf(a.hosts + ' + 2 = ' + need) !== -1, a.hosts + ' + 2 = ' + need);

    const pow2 = expectPow2Text(need);
    check('C2' + tag + ' ไล่สองยกกำลังให้เห็นทั้งตัวที่ไม่พอและตัวที่พอ',
        steps.indexOf(pow2) !== -1, pow2);
    check('C2b' + tag + ' practicePow2Text() ให้ผลตรงกับสูตรที่คิดแยกในเทส',
        safeRun('practicePow2Text(' + need + ')', null) === pow2,
        safeRun('practicePow2Text(' + need + ')', '(เรียกไม่ได้)'));

    check('C3' + tag + ' ขนาดที่ปัดขึ้นได้ ตรงกับ subnet.size ที่ระบบคำนวณ',
        Math.pow(2, bits) === a.subnet.size,
        '2^' + bits + ' = ' + Math.pow(2, bits) + ' เทียบกับ ' + a.subnet.size);

    check('C4' + tag + ' โชว์การลบ 32 ออกจากบิตโฮสต์',
        steps.indexOf('32 − ' + bits + ' = /' + a.subnet.cidr) !== -1);

    check('C5' + tag + ' โชว์ netmask ที่ตรงกับเลขหลังทับ',
        steps.indexOf(a.subnet.netmask) !== -1, a.subnet.netmask);

    check('C6' + tag + ' จุดเริ่มหารด้วยขนาดลงตัว และเฉลยบอกไว้',
        safeRun('ipToLong("' + a.subnet.network + '") % ' + a.subnet.size) === 0 &&
        steps.indexOf('หารด้วย ' + a.subnet.size + ' ลงตัว') !== -1,
        a.subnet.network + ' % ' + a.subnet.size);

    if (i > 0) {
        check('C7' + tag + ' ขั้นวางตรงไหน อ้างถึง Broadcast ของแผนกก่อนหน้า',
            steps.indexOf(ANS[i - 1].subnet.broadcast) !== -1 &&
            steps.indexOf(ANS[i - 1].name) !== -1,
            'ต่อจาก ' + ANS[i - 1].name + ' ที่จบ ' + ANS[i - 1].subnet.broadcast);
        check('C8' + tag + ' วางต่อกันพอดี ไม่เว้นช่องว่างและไม่ทับกัน',
            safeRun('ipToLong("' + a.subnet.network + '") - ipToLong("' + ANS[i - 1].subnet.broadcast + '")') === 1);
    } else {
        check('C7.1: แผนกแรกบอกว่าเริ่มที่ต้นช่วงที่ได้รับมา',
            steps.indexOf('แผนกแรก') !== -1);
    }
});

/* ===== D. ตารางสรุปของเดิมยังอยู่ =====
   เขียนไว้เพราะของใหม่ถูกเติม "ด้านบน" ของเดิม ไม่ได้เขียนแทน
   ถ้าวันหลังมีคนคิดว่าซ้ำซ้อนแล้วลบตารางเก่าทิ้ง ข้อพวกนี้จะฟ้องให้คิดอีกครั้ง */

['ลำดับ', 'แผนก', 'ต้องการจริง', 'ขนาดที่ได้', 'คือ', 'ช่วงที่ได้'].forEach(function (h, i) {
    check('D1.' + (i + 1) + ': ตารางสรุปยังมีคอลัมน์ ' + h, steps.indexOf(h) !== -1);
});
ANS.forEach(function (a, i) {
    check('D2.' + (i + 1) + ': ตารางสรุปยังบอกขนาดที่ปัดได้ของ ' + a.name,
        steps.indexOf('ปัดขึ้นเป็น ' + a.subnet.size) !== -1);
    check('D3.' + (i + 1) + ': ตารางสรุปยังบอกช่วงต้นถึงปลายของ ' + a.name,
        steps.indexOf(a.subnet.network + ' ถึง ' + a.subnet.broadcast) !== -1);
});

/* ===== E. เฉลยต้องไม่โผล่ก่อนกดปุ่ม ===== */

run('practiceState.revealed = false; renderPractice();');
const hidden = run("document.getElementById('practiceBody').innerHTML");
check('E1: ยังไม่กดดูเฉลย ต้องไม่มีบล็อกวิธีคิดทีละขั้น',
    hidden.indexOf('วิธีคิดทีละขั้น') === -1);
check('E2: ยังไม่กดดูเฉลย ต้องไม่มีการ์ดขั้นที่ 6',
    hidden.indexOf('ขั้น 6') === -1);
check('E3: ยังไม่กดดูเฉลย ต้องไม่โชว์คำตอบใต้ช่องกรอก',
    hidden.indexOf(ANS[0].subnet.firstUsable) === -1, ANS[0].subnet.firstUsable);
check('E4: ตารางโจทย์ยังบังคับกรอกครบทั้ง 5 ช่อง',
    ['Network', '/xx', 'Host แรกที่ใช้ได้', 'Host สุดท้ายที่ใช้ได้', 'Broadcast']
        .every(function (ph) { return hidden.indexOf('placeholder="' + ph + '"') !== -1; }));
run('practiceState.revealed = true; renderPractice();');

check('E5: กดดูเฉลยแล้ว บล็อกวิธีคิดทีละขั้นต้องอยู่ในหน้าจอจริง',
    run("document.getElementById('practiceBody').innerHTML").indexOf('วิธีคิดทีละขั้น') !== -1);

/* ===== F. ขนาดตัวอักษรและเส้นคั่นแถว =====
   ผู้ใช้ตีกลับสองรอบ รอบแรกตอนเป็น 11px รอบสองตอนเป็น 14px
   สรุปที่ 16px สำหรับเนื้อขั้นตอน และ 17px สำหรับหัวข้อ ห้ามลดกลับ */

check('F1: หัวข้อในบล็อกเฉลยใช้ 17px', steps.indexOf('text-[17px]') !== -1);
check('F2: ตารางขั้นตอนใช้ 16px', steps.indexOf('text-[16px]') !== -1);
['text-[10px]', 'text-[11px]', 'text-[12px]', 'text-[13px]'].forEach(function (sz, i) {
    check('F3.' + (i + 1) + ': บล็อกเฉลยไม่มีตัวอักษรขนาด ' + sz,
        steps.indexOf(sz) === -1);
});
check('F4: มีเส้นคั่นระหว่างแถวครบ 6 ขั้น × 3 แผนก',
    countOf(steps, 'border-top:1px solid var(--border)') === 6 * ANS.length,
    countOf(steps, 'border-top:1px solid var(--border)') + ' เส้น ต้องได้ ' + (6 * ANS.length));
check('F5: ขั้นที่ 6 แยกบรรทัดด้วย div ไม่ใช่ br ที่ชิดกันจนอ่านยาก',
    countOf(steps, '<div class="py-0.5">') === 4 * ANS.length,
    countOf(steps, '<div class="py-0.5">'));

/* ===== G. สีต้องมาจากตัวแปรธีม =====
   วัดด้วยสูตร WCAG แล้วสองค่านี้ไม่ผ่าน 4.5:1 จึงถูกถอดออกไปเมื่อ 7 ต.ค. 2569
     #1F7A45  บนพื้นโหมดมืด  = 3.26:1
     #b8790f  บนพื้นโหมดสว่าง = 3.63:1
   ข้อพวกนี้กันการเผลอก๊อปสีเก่ากลับมาใช้ซ้ำ */

const BAD_COLORS = ['#1F7A45', '#1f7a45', '#b8790f', '#B8790F'];
BAD_COLORS.forEach(function (c, i) {
    check('G1.' + (i + 1) + ': บล็อกเฉลยไม่มีโค้ดสี ' + c, steps.indexOf(c) === -1);
});
const practiceSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'js/practice.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'js/ui.js'), 'utf8');
BAD_COLORS.forEach(function (c, i) {
    check('G2.' + (i + 1) + ': js/practice.js ไม่มีโค้ดสี ' + c, practiceSrc.indexOf(c) === -1);
    check('G3.' + (i + 1) + ': js/ui.js ไม่มีโค้ดสี ' + c, uiSrc.indexOf(c) === -1);
});
check('G4: บล็อกเฉลยอ้างสีตัวอักษรจากตัวแปรธีม',
    steps.indexOf('color:var(--text)') !== -1);
check('G5: บล็อกเฉลยอ้างสีพื้นและเส้นขอบจากตัวแปรธีม',
    steps.indexOf('var(--item-bg)') !== -1 && steps.indexOf('var(--border)') !== -1);

const cssSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'css/style.css'), 'utf8');
check('G6: style.css ประกาศ --warn ทั้งโหมดมืดและโหมดสว่าง',
    countOf(cssSrc, '--warn:') >= 2, countOf(cssSrc, '--warn:') + ' ที่');
check('G7: style.css ประกาศ --ok ทั้งโหมดมืดและโหมดสว่าง',
    countOf(cssSrc, '--ok:') >= 2, countOf(cssSrc, '--ok:') + ' ที่');

/* ===== H. คำใบ้ตอนตอบผิด =====
   เคสที่เคยทำให้โชว์เลขประหลาด คือใส่ /99 แล้ว Math.pow(2, 32-99)
   ได้เลขทศนิยมยาวเหยียดไปขึ้นบนหน้าจอ จึงต้องกันค่านอกช่วงก่อนเข้าสูตร */

const A0 = ANS[0];
function hint(given, fields) {
    return run('practiceHintFor(' +
        JSON.stringify(A0) + ',' + JSON.stringify(given) + ',' + JSON.stringify(fields) + ')');
}
const ALL_WRONG = { network: false, cidr: false, first: false, last: false, broadcast: false };
const ALL_RIGHT = { network: true, cidr: true, first: true, last: true, broadcast: true };

const h99 = hint({ cidr: '99' }, ALL_WRONG);
check('H1: ใส่ /99 ต้องบอกว่าเลขต้องอยู่ระหว่าง 1 ถึง 32',
    h99 && h99.indexOf('1 ถึง 32') !== -1, h99);
check('H2: ใส่ /99 ต้องไม่โชว์เลขประหลาดจาก Math.pow',
    h99 && h99.indexOf('e-') === -1 && h99.indexOf('.') === -1 && h99.indexOf('Infinity') === -1, h99);

const h0 = hint({ cidr: '0' }, ALL_WRONG);
check('H3: ใส่ /0 ต้องถูกกันไว้เหมือนกัน',
    h0 && h0.indexOf('1 ถึง 32') !== -1, h0);

const hNeg = hint({ cidr: '-5' }, ALL_WRONG);
check('H4: ใส่เลขลบ ต้องไม่แครชและไม่ให้ผลลัพธ์ว่าง',
    typeof hNeg === 'string' && hNeg.length > 10, hNeg);

const hBlank = hint({}, ALL_WRONG);
check('H5: ไม่กรอกขนาดเลย ต้องบอกให้ใส่ตัวเลขหลังทับ',
    hBlank && hBlank.indexOf('ยังไม่ได้กรอกขนาด') !== -1, hBlank);

const hJunk = hint({ cidr: 'ยี่สิบเจ็ด' }, ALL_WRONG);
check('H6: กรอกเป็นตัวหนังสือ ต้องบอกรูปแบบที่ต้องการ',
    hJunk && hJunk.indexOf('ยังไม่ได้กรอกขนาด') !== -1, hJunk);

const hSize = hint({ cidr: '28' }, ALL_WRONG);
check('H7: ขนาดผิด ต้องอธิบายตั้งแต่การบวก 2 จนถึงการลบ 32',
    hSize && hSize.indexOf('ขั้นที่ 1') !== -1 &&
    hSize.indexOf(A0.hosts + ' เครื่อง') !== -1 &&
    hSize.indexOf('2 ยกกำลัง') !== -1 &&
    hSize.indexOf('/' + A0.subnet.cidr) !== -1, hSize);
check('H8: ขนาดผิดด้านเล็กเกิน ต้องบอกว่าเล็กเกินไป',
    hSize && hSize.indexOf('เล็กเกินไป') !== -1, hSize);

const hBig = hint({ cidr: '24' }, ALL_WRONG);
check('H9: ขนาดผิดด้านใหญ่เกิน ต้องบอกว่าใหญ่เกินจำเป็น',
    hBig && hBig.indexOf('ใหญ่เกินจำเป็น') !== -1, hBig);

const hNet = hint({ cidr: '/' + A0.subnet.cidr },
    { network: false, cidr: true, first: false, last: false, broadcast: false });
check('H10: ขนาดถูกแต่จุดเริ่มผิด ต้องชี้ไปขั้นที่ 2 และบอกคำตอบ',
    hNet && hNet.indexOf('ขั้นที่ 2') !== -1 && hNet.indexOf(A0.subnet.network) !== -1, hNet);

const hBc = hint({ cidr: '/' + A0.subnet.cidr },
    { network: true, cidr: true, first: false, last: false, broadcast: false });
check('H11: Broadcast ผิด ต้องชี้ไปขั้นที่ 3 พร้อมวิธีคิด',
    hBc && hBc.indexOf('ขั้นที่ 3') !== -1 && hBc.indexOf(A0.subnet.broadcast) !== -1, hBc);

const hRange = hint({ cidr: '/' + A0.subnet.cidr },
    { network: true, cidr: true, first: false, last: true, broadcast: true });
check('H12: ช่วง Host ผิด ต้องชี้ไปขั้นที่ 4 พร้อมเลขทั้งสองช่อง',
    hRange && hRange.indexOf('ขั้นที่ 4') !== -1 &&
    hRange.indexOf(A0.subnet.firstUsable) !== -1 &&
    hRange.indexOf(A0.subnet.lastUsable) !== -1, hRange);

check('H13: ตอบถูกครบทุกช่อง ต้องไม่มีคำใบ้', hint({ cidr: '/' + A0.subnet.cidr }, ALL_RIGHT) === null);

/* คำใบ้ถูกส่งผ่าน escapeHtml() ก่อนขึ้นหน้าจอ ถ้าเผลอใส่แท็กลงไป
   ผู้ใช้จะเห็นเป็น &lt;b&gt; โชว์เป็นตัวหนังสือ จึงต้องเป็นข้อความเปล่าทั้งหมด */
const ALL_HINTS = [h99, h0, hNeg, hBlank, hJunk, hSize, hBig, hNet, hBc, hRange].filter(Boolean);
check('H14: ทุกคำใบ้เป็นข้อความเปล่า ไม่มีแท็ก HTML ปน',
    ALL_HINTS.every(function (h) { return h.indexOf('<') === -1 && h.indexOf('&') === -1; }),
    ALL_HINTS.length + ' ข้อความ');
check('H15: ทุกคำใบ้ไม่มี NaN หรือ undefined หลุดไป',
    ALL_HINTS.every(function (h) { return h.indexOf('NaN') === -1 && h.indexOf('undefined') === -1; }));
check('H16: ทุกคำใบ้ไม่มีคำว่า เบอร์ ตามกฎใน wording.test.js',
    ALL_HINTS.every(function (h) { return h.indexOf('เบอร์') === -1; }));

/* ===== I. ทุกระดับความยาก render ได้ ไม่มีค่าเสียหลุดไปโชว์ =====
   รอบนี้ใช้การสุ่มจริงตามที่ผู้ใช้เจอ แต่ถามแค่เรื่องที่ไม่ขึ้นกับค่าที่สุ่มได้
   คือ "ต้องมีครบ 6 ขั้นทุกแผนก" กับ "ต้องไม่มี NaN" ซึ่งต้องจริงทุกโจทย์ */

const LEVELS = Object.keys(run('PRACTICE_LEVELS'));
check('I0: มีระดับความยากให้เลือกอย่างน้อย 3 ระดับ', LEVELS.length >= 3, LEVELS.join(', '));

LEVELS.forEach(function (lv) {
    let worst = '';
    let okAll = true;
    for (let t = 0; t < 5; t++) {
        safeRun("startPractice('" + lv + "'); practiceState.revealed = true;");
        const n = safeRun('practiceState.problem.answer.length', 0);
        const s = String(safeRun('renderPracticeSteps()', ''));
        const bad = ['NaN', 'undefined', 'Infinity', 'null'].filter(function (w) { return s.indexOf(w) !== -1; });
        let missing = [];
        for (let k = 1; k <= 6; k++) {
            if (countOf(s, 'ขั้น ' + k) !== n) missing.push('ขั้น ' + k);
        }
        if (bad.length || missing.length) {
            okAll = false;
            worst = 'รอบ ' + (t + 1) + ' เจอ ' + bad.concat(missing).join(', ');
            break;
        }
    }
    check('I1 ' + lv + ': สุ่ม 5 โจทย์ ได้ 6 ขั้นครบทุกแผนก และไม่มีค่าเสีย', okAll, worst);
});

/* กดตรวจตอนยังไม่กรอกอะไรเลย ต้องไม่แครชและต้องบอกตรง ๆ ว่ายังไม่ได้ตอบ */
safeRun("startPractice('easy'); practiceState.answers = {}; checkPracticeAnswers();");
const blankScreen = run("document.getElementById('practiceBody').innerHTML");
check('I2: กดตรวจโดยไม่กรอกอะไร ต้องบอกว่ายังไม่ได้กรอกคำตอบ',
    blankScreen.indexOf('ยังไม่ได้กรอกคำตอบสักช่อง') !== -1);
check('I3: กดตรวจโดยไม่กรอกอะไร ต้องไม่มีคำใบ้ซ้ำทุกแถว',
    countOf(blankScreen, 'fa-lightbulb') === 0, countOf(blankScreen, 'fa-lightbulb'));

/* กรอกค่าพังทุกแบบที่คิดออก แล้วต้องไม่มี exception หลุดออกมา */
let crash = '';
try {
    run(`
        startPractice('easy');
        practiceState.problem.departments.forEach(function (d) {
            practiceState.answers[d.id] = {
                network: '999.999.999.999', cidr: '/0',
                first: '', last: '192.168.1', broadcast: 'abc'
            };
        });
        checkPracticeAnswers();
        practiceState.revealed = true;
        renderPractice();
    `);
} catch (e) { crash = e.message; }
check('I4: กรอกค่าพังทุกช่อง ต้องไม่แครช', crash === '', crash);
const junkScreen = run("document.getElementById('practiceBody').innerHTML");
check('I5: หน้าจอหลังกรอกค่าพัง ยังไม่มี NaN หรือ undefined โชว์',
    junkScreen.indexOf('NaN') === -1 && junkScreen.indexOf('undefined') === -1);
check('I6: หน้าจอหลังกรอกค่าพัง ยังมีเฉลย 6 ขั้นให้อ่าน',
    junkScreen.indexOf('ขั้น 6') !== -1);

/* ===== สรุป ===== */
const pass = results.filter(r => r.pass).length;
console.log('\n=== tests/practice-steps.test.js ===');
results.forEach(r => {
    console.log((r.pass ? '  ผ่าน  ' : '  ไม่ผ่าน ') + r.label + (r.detail ? '   [' + r.detail + ']' : ''));
});
console.log('\nผ่าน ' + pass + ' จาก ' + results.length + ' ข้อ');
// รูปแบบบรรทัดนี้ต้องตรงกับที่ run-all.js อ่าน คือ /(\d+)\/(\d+) passed/
console.log(pass + '/' + results.length + ' passed — ' + new Date().toISOString());
// จบด้วย process.exitCode ไม่ใช่การสั่งให้โปรเซสตายทันที — เหตุผลเต็มอยู่ใน tests/run-all.js
process.exitCode = pass === results.length ? 0 : 1;
