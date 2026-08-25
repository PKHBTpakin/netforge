/* ============================================
   tests/labguide.test.js — คู่มือทำ Lab ที่ผู้ใช้กดโหลดออกไป (25 ส.ค. 2569)
   ============================================
   วิธีรัน:   node tests/labguide.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):

   ผู้ใช้นำ configuration จากโปรแกรมไปวางใน Packet Tracer แล้วติดสามเรื่อง
   ซึ่งไม่มีเรื่องไหนเลยที่ชุดทดสอบเดิมจับได้ เพราะทุกข้อเป็นเรื่อง "สิ่งที่ขาดหายไป"
   ไม่ใช่ "สิ่งที่ผิด"

     1. configuration ไม่มี enable กับ configure terminal นำหน้า
        วางแล้วถูกปฏิเสธทั้งชุดด้วย % Invalid input โดยไม่รู้สาเหตุ
     2. ไม่มีอะไรบอกว่า configuration ชุดไหนต้องวางลงอุปกรณ์ตัวใด
        ทำให้วาง switch config ลง router ได้ง่าย
     3. ไม่มีข้อมูลการตั้งค่าเครื่องลูกข่ายเลย ไม่รู้ว่า Default Gateway ใช้เลขอะไร

   เทสชุดนี้จึงถามในรูปแบบ "ต้องมีสิ่งนี้อยู่" กับ "ต้องไม่มีสิ่งนี้หลงเหลือ"
   ตามบทเรียนในบทที่ 5.2.2 ของรายงาน ที่ว่าข้อทดสอบแบบหลังจับสิ่งที่คิดไม่ถึงได้ดีกว่า

   ครอบคลุม:
   A. คู่มือมีคำสั่งเข้าโหมดและคำสั่งบันทึกครบทุกบล็อก
   B. ทุกบล็อกระบุชื่ออุปกรณ์ที่ต้องวางลงไป
   C. มีตารางการตั้งค่า PC พร้อม Default Gateway ที่ตรงกับ IP ของ sub-interface จริง
   D. HTML ที่ได้เป็นไฟล์เดียวจบ ไม่อ้างอิงไฟล์ภายนอก และมีปุ่มคัดลอกครบทุกบล็อก
   E. ตาราง IP TABLE ในหน้าเว็บมีคอลัมน์ Gateway
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js',
    'js/topology.js', 'js/ui.js', 'js/wan.js', 'js/cli.js', 'js/backdrop.js',
    'js/practice.js', 'js/tools.js', 'js/library.js', 'js/history.js',
    'js/export.js', 'js/labguide.js', 'js/app.js'];

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
const downloads = [];
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
    // เก็บเนื้อไฟล์ที่ถูกสั่งดาวน์โหลดไว้ตรวจ แทนการเขียนลงดิสก์จริง
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
// ดักการดาวน์โหลด เพื่อตรวจว่าไฟล์ที่ได้มีเนื้อหาถูกต้องและชื่อนามสกุลตรง
context.downloadBlob = (blob, name) => { downloads.push({ name, text: blob.parts.join('') }); };

const run = (code) => vm.runInContext(code, context);

const results = [];
function check(label, cond, detail) {
    results.push({ label, pass: !!cond, detail: detail !== undefined ? String(detail) : '' });
}

/* ===== เตรียมข้อมูล ใช้ตัวอย่างที่มี Router สาขาและลิงก์ WAN ครบ ===== */
run("loadExample('branch2');");

const md = run('labMarkdown()');
const html = run('labHtml()');

/* ===== A. คำสั่งเข้าโหมดและคำสั่งบันทึกครบทุกบล็อก ===== */

// นับจำนวนบล็อก configuration จากรั้ว ``` ใน Markdown
const fences = (md.match(/```/g) || []).length;
const blocks = fences / 2;
check('A1: มีบล็อก configuration อย่างน้อย 4 บล็อก (Router 3 ตัว + Switch)',
    blocks >= 4, 'พบ ' + blocks + ' บล็อก');

const nEnable = (md.match(/^enable$/gm) || []).length;
const nConfT  = (md.match(/^configure terminal$/gm) || []).length;
const nWrite  = (md.match(/^write memory$/gm) || []).length;
const nEnd    = (md.match(/^end$/gm) || []).length;

check('A2: ทุกบล็อกขึ้นต้นด้วย enable', nEnable === blocks, nEnable + ' / ' + blocks);
check('A3: ทุกบล็อกมี configure terminal', nConfT === blocks, nConfT + ' / ' + blocks);
check('A4: ทุกบล็อกปิดท้ายด้วย write memory', nWrite === blocks, nWrite + ' / ' + blocks);
check('A5: ทุกบล็อกมี end ก่อน write memory ตัวเดียว ไม่ซ้ำ',
    nEnd === blocks, nEnd + ' / ' + blocks);
check('A6: ทุกบล็อกมี no ip domain-lookup กันหน้าจอค้างตอนพิมพ์ผิด',
    (md.match(/^no ip domain-lookup$/gm) || []).length === blocks);

// คู่มือมีไว้วางลง Packet Tracer โดยเฉพาะ อักขระไทยแม้แต่ตัวเดียวในบล็อกคำสั่ง
// จะทำให้ตัวอักษรเพี้ยนทั้งหน้าจอ ต้องตัดออกเสมอไม่ว่าผู้ใช้จะกดปุ่มโหมด PT ไว้หรือไม่
const cfgBlocks = md.split('```').filter((_, i) => i % 2 === 1);
const thaiBlocks = cfgBlocks.filter(b => run('labHasNonAscii(' + JSON.stringify(b) + ')'));
check('A8: ไม่มีอักขระนอก ASCII หลงเหลือในบล็อกคำสั่งเลย',
    thaiBlocks.length === 0, thaiBlocks.length + ' / ' + cfgBlocks.length + ' บล็อก');

// ตรวจแบบ "ต้องไม่มี" — ลำดับคำสั่งต้องถูก enable มาก่อน configure terminal เสมอ
const badOrder = md.split('```').filter((_, i) => i % 2 === 1)
    .filter(b => b.indexOf('enable') > b.indexOf('configure terminal'));
check('A7: ไม่มีบล็อกใดที่ configure terminal มาก่อน enable', badOrder.length === 0,
    badOrder.length + ' บล็อก');

// hostname ต้องไม่หายไปจากบล็อกของ Router ตอนห่อคำสั่ง
// เคยพลาดตรงนี้มาแล้ว เพราะโค้ดตัด hostname ทิ้งทุกครั้งไม่ว่าจะมีชื่อใหม่มาแทนหรือไม่
const routerBlocks = cfgBlocks.slice(0, cfgBlocks.length - 1);
const noHost = routerBlocks.filter(b => !/^hostname \S+/m.test(b));
check('A9: ทุกบล็อกของ Router ยังมีบรรทัด hostname ครบ',
    noHost.length === 0, noHost.length + ' / ' + routerBlocks.length + ' บล็อกที่ขาด');

/* ===== B. ทุกบล็อกระบุว่าต้องวางลงอุปกรณ์ตัวใด ===== */

const routerNames = run('getAllRouters().map(function(r){return routerDisplayName(r)})');
check('B1: มีชื่อ Router ทุกตัวปรากฏเป็นหัวข้อในคู่มือ',
    routerNames.every(n => md.indexOf('### Router: ' + n) !== -1), routerNames.join(', '));
check('B2: ทุกหัวข้อ Router มีบรรทัดบอกว่าให้วางลงตัวไหน',
    routerNames.every(n => md.indexOf('วางลงที่ Router ชื่อ **' + n + '**') !== -1));
check('B3: บล็อก Switch บอกว่าใช้ได้กับ Switch ทุกตัวและให้เปลี่ยน hostname',
    md.indexOf('ใช้ได้กับ Switch ทุกตัว') !== -1 && md.indexOf('hostname') !== -1);
check('B4: มีคำเตือนให้ดูชื่อบนแถบหน้าต่างก่อนวาง',
    md.indexOf('ดูชื่อบนแถบหน้าต่าง') !== -1);

/* ===== C. ตารางการตั้งค่า PC ===== */

check('C1: มีหัวข้อการตั้งค่าเครื่องลูกข่าย', md.indexOf('## การตั้งค่าเครื่องลูกข่าย') !== -1);
check('C2: บอกที่อยู่ของหน้าตั้งค่าใน Packet Tracer',
    md.indexOf('Desktop') !== -1 && md.indexOf('IP Configuration') !== -1);
check('C3: มีคอลัมน์ Default Gateway', md.indexOf('Default Gateway') !== -1);

// Gateway ในตารางต้องตรงกับ IP ที่ configuration ตั้งให้ sub-interface จริง ๆ
// ถ้าไม่ตรง ผู้ใช้จะตั้ง gateway ผิดแล้วออกนอก subnet ไม่ได้ โดยไม่มีอะไรเตือน
run("selectCliRouter('router'); renderCLI();");
const hqCli = run("stripCliHtml(document.getElementById('cliRouterOutput').innerHTML)");
const cliIps = (hqCli.match(/^ ip address (\d+\.\d+\.\d+\.\d+)/gm) || [])
    .map(l => l.replace(/^ ip address /, ''));
const gwInDoc = cliIps.filter(ip => md.indexOf(ip) !== -1);
check('C4: ทุก IP ที่ Router ตั้งไว้ ปรากฏในคู่มือ (LAN อยู่ตาราง PC, Serial อยู่ตาราง WAN)',
    cliIps.length > 0 && gwInDoc.length === cliIps.length,
    gwInDoc.length + ' / ' + cliIps.length);

// gateway ของแผนกคือเลขแรกของ subnet ต้องปรากฏในตาราง PC ทุกแผนก
const deptGw = run('state.calculated.map(function(d){return d.subnet.firstUsable})');
const gwRows = deptGw.filter(ip => md.indexOf('| ' + ip + ' |') !== -1);
check('C4b: gateway ของทุกแผนกอยู่ในตาราง PC ครบ',
    deptGw.length > 0 && gwRows.length === deptGw.length,
    gwRows.length + ' / ' + deptGw.length);

// ช่วงที่ DHCP แจกต้องเริ่มถัดจาก gateway ไม่ใช่ที่ gateway
// เพราะ configuration กัน gateway ออกด้วย ip dhcp excluded-address ไว้แล้ว
const dhcpStartsAtGateway = cliIps.filter(function (ip) {
    return md.indexOf('| DHCP | ' + ip + ' |') !== -1;
});
check('C5: ช่วง DHCP ไม่เริ่มที่หมายเลข Gateway',
    dhcpStartsAtGateway.length === 0, dhcpStartsAtGateway.join(', '));

// ค่าช่วงต้องแยกเป็นคนละคอลัมน์ ห้ามรวมไว้ช่องเดียวคั่นด้วยขีด
// เพราะเมื่อคอลัมน์แคบแล้วตัดบรรทัด ขีดจะค้างท้ายบรรทัดจนอ่านเหมือนเป็นเลขคนละตัว
// (ผู้ใช้เจอปัญหานี้จริงตอนเปิดไฟล์ .md ในโปรแกรมแก้ไขข้อความ)
const dashRanges = (md.match(/\| \d+\.\d+\.\d+\.\d+ [–-] \d+\.\d+\.\d+\.\d+ \|/g) || []);
check('C6: ไม่มีช่องไหนรวมค่าช่วงไว้ในคอลัมน์เดียว',
    dashRanges.length === 0, dashRanges.slice(0, 3).join(' | '));
check('C7: ตาราง PC แยกคอลัมน์ IP เริ่มต้นกับ IP สุดท้าย',
    md.indexOf('| IP เริ่มต้น | IP สุดท้าย |') !== -1);
check('C8: ตารางแบ่ง subnet ระบุชัดว่า Gateway คือ Host แรก',
    md.indexOf('Gateway (Host แรก)') !== -1 && md.indexOf('| Host สุดท้าย |') !== -1);

/* ===== D. ไฟล์ HTML ===== */

check('D1: เป็นเอกสาร HTML สมบูรณ์', /^<!DOCTYPE html>/.test(html) && /<\/html>$/.test(html));
const extern = (html.match(/(src|href)="https?:\/\/[^"]+"/g) || [])
    .filter(u => u.indexOf('pkhbtpakin.github.io') === -1);
check('D2: ไม่อ้างอิงไฟล์ภายนอกเลย เปิดออฟไลน์ได้', extern.length === 0, extern.join(' | '));

const copyBtns = (html.match(/class="copy"/g) || []).length;
check('D3: มีปุ่มคัดลอกครบทุกบล็อก', copyBtns === blocks, copyBtns + ' / ' + blocks);
check('D4: ปุ่มคัดลอกมีทางสำรองเมื่อ clipboard API ใช้ไม่ได้ (เปิดผ่าน file://)',
    html.indexOf('execCommand("copy")') !== -1);
check('D5: HTML มีตาราง PC เหมือนใน Markdown',
    html.indexOf('การตั้งค่าเครื่องลูกข่าย') !== -1 && html.indexOf('Default Gateway') !== -1);

// ต้องไม่มี HTML tag หลุดเข้าไปในบล็อกคำสั่ง เพราะจะทำให้คัดลอกไปวางแล้วอุปกรณ์ปฏิเสธ
const preBlocks = html.match(/<pre id="b\d+">([\s\S]*?)<\/pre>/g) || [];
const dirty = preBlocks.filter(b => /&lt;span|<span/.test(b));
check('D6: ไม่มี tag หลงเหลือในบล็อกคำสั่ง', dirty.length === 0, dirty.length + ' บล็อก');

/* ===== E. คอลัมน์ Gateway ในหน้าเว็บ ===== */

run('renderTable();');
const head = getElementById('ipTableHead').innerHTML;
const body = getElementById('ipTableBody').innerHTML;
check('E1: หัวตาราง IP TABLE มีคอลัมน์ Gateway', head.indexOf('>Gateway<') !== -1);
// ตาราง IP TABLE แสดงเฉพาะแผนก ไม่มีลิงก์ WAN จึงต้องเทียบกับ gateway ของแผนกเท่านั้น
const deptGwAll = run('state.calculated.map(function(d){return d.subnet.firstUsable})');
check('E2: ทุกแถวในตารางมีค่า Gateway ของแผนกนั้น',
    deptGwAll.length > 0 && deptGwAll.every(ip => body.indexOf(ip) !== -1),
    deptGwAll.filter(ip => body.indexOf(ip) === -1).join(', ') || 'ครบทุกแผนก');

const indexHtml = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
check('E3: หัวตารางใน index.html เพิ่มคอลัมน์ให้ตรงกับที่ ui.js สร้าง',
    indexHtml.indexOf('>Gateway</th>') !== -1);
check('E4: เมนู EXPORT มีรายการคู่มือทั้งสองแบบ',
    indexHtml.indexOf('exportLabHtml()') !== -1 && indexHtml.indexOf('exportLabMd()') !== -1);
check('E5: index.html โหลด labguide.js หลัง export.js',
    indexHtml.indexOf('js/labguide.js') > indexHtml.indexOf('js/export.js'));

/* ===== F. ปุ่มดาวน์โหลดทำงานจริง ===== */

downloads.length = 0;
run('exportLabHtml(); exportLabMd();');
check('F1: กดแล้วได้ไฟล์สองไฟล์', downloads.length === 2,
    downloads.map(d => d.name).join(', '));
check('F2: นามสกุลไฟล์ถูกต้อง',
    downloads.some(d => /\.html$/.test(d.name)) && downloads.some(d => /\.md$/.test(d.name)));
check('F3: ไฟล์ที่ได้ไม่ว่างเปล่า', downloads.every(d => d.text.length > 2000),
    downloads.map(d => d.text.length).join(', '));

// กดตอนยังไม่มีข้อมูล ต้องไม่สร้างไฟล์เปล่าออกมา
run('clearAll();');
downloads.length = 0;
run('exportLabHtml();');
check('F4: ยังไม่มีข้อมูลแล้วกด ต้องไม่ได้ไฟล์เปล่า', downloads.length === 0);

/* ===== สรุป ===== */
const pass = results.filter(r => r.pass).length;
console.log('\n=== tests/labguide.test.js ===');
results.forEach(r => {
    console.log((r.pass ? '  ผ่าน  ' : '  ไม่ผ่าน ') + r.label + (r.detail ? '   [' + r.detail + ']' : ''));
});
console.log('\nผ่าน ' + pass + ' จาก ' + results.length + ' ข้อ');
// รูปแบบบรรทัดนี้ต้องตรงกับที่ run-all.js อ่าน คือ /(\d+)\/(\d+) passed/
console.log(pass + '/' + results.length + ' passed — ' + new Date().toISOString());
process.exit(pass === results.length ? 0 : 1);
