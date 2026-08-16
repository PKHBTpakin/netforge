/* ============================================
   tests/cli-naming.test.js — ชุดทดสอบชื่อและคำเตือนใน Cisco IOS Config (31 ก.ค. 2569)
   ============================================
   วิธีรัน:   node tests/cli-naming.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install (แพทเทิร์นเดียวกับไฟล์เทสอื่นในโฟลเดอร์นี้)

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):
   ก่อนรอบนี้ CLI Generator เอาชื่อแผนกดิบ ๆ ไปวางเป็นชื่อ `ip dhcp pool` โดยตรง ข้อมูลตัวอย่าง
   ในแอปตั้งชื่อแบบมีขีดหมด ("IT-Department", "Computer-Lab") บั๊กจึงไม่เคยโผล่ตอนทดลองใช้
   แต่ผู้ใช้จริงพิมพ์ชื่อเองได้อิสระ พอตั้งว่า "IT Support" หรือ "ฝ่ายไอที" จะได้คำสั่ง
       ip dhcp pool IT Support     -> IOS ตอบ % Invalid input detected
       ip dhcp pool ฝ่ายไอที        -> IOS ไม่รับ non-ASCII บน CLI
   ผลคือ pool ไม่ถูกสร้าง แผนกนั้นแจก DHCP ไม่ได้เลย และเป็นความผิดพลาดที่เงียบมาก เพราะคนที่
   copy config ไปแปะทีเดียวทั้งก้อนแทบไม่มีใครไล่อ่านว่าบรรทัดไหนโดนอุปกรณ์ปฏิเสธ

   ครอบคลุม:
   A. toCiscoName() — กฎการแปลงชื่อทีละข้อ รวมทั้ง fallback ตอนชื่อถูกตัดจนเหลือค่าว่าง
   B. ชื่อ pool ใน config จริง — ยิงผ่าน renderCLI() ไม่ได้เรียกฟังก์ชันภายในลอย ๆ
      รวมกฎครอบจักรวาล: ทุกบรรทัด `ip dhcp pool` ต้องมี 4 token เสมอ ไม่ว่าผู้ใช้ตั้งชื่ออะไรมา
   C. ชื่อซ้ำหลังแปลง — "IT Support" กับ "IT-Support" ต้องไม่กลายเป็น pool เดียวกัน
      (IOS ไม่ error แต่ไปแก้ pool เดิมแทน = แผนกหลังกินทับแผนกแรกเงียบ ๆ ซึ่งหาสาเหตุยากมาก)
   D. hostname กับชื่อที่ให้คนอ่าน ต้องแยกกัน — คำสั่งต้องปลอดภัย แต่แท็บ/หัวข้อยังเห็นชื่อไทย
   E. คำเตือนรหัสผ่านตัวอย่าง ต้องอยู่เหนือ enable secret และต้องรอดไปถึงไฟล์ .txt ที่ export
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js', 'js/wan.js', 'js/cli.js', 'js/backdrop.js', 'js/practice.js', 'js/tools.js', 'js/library.js', 'js/history.js', 'js/export.js', 'js/app.js'];

let capturedToasts = [];
let downloadedText = null;

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
        contains() { return false; },
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

const store = {};
const localStorageStub = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
};

const documentStub = {
    documentElement: makeElement('html'), body: makeElement('body'), activeElement: null,
    getElementById, createElement: (tag) => makeElement(tag),
    execCommand: () => true,
    addEventListener: () => {}, querySelectorAll: () => []
};

const sandbox = {
    console, setTimeout, clearTimeout,
    document: documentStub,
    window: { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1024, innerHeight: 768 },
    location: { href: 'https://sento.github.io/netforge/', hash: '', protocol: 'https:' },
    localStorage: localStorageStub,
    navigator: {},
    TextEncoder, TextDecoder, btoa, atob,
    // ดักเนื้อไฟล์ที่ถูกสั่งดาวน์โหลด เพื่อตรวจไฟล์ .txt ที่ผู้ใช้ได้จริง ไม่ใช่แค่ HTML บนหน้าจอ
    Blob: class { constructor(p, o) { downloadedText = (p || []).join(''); this.parts = p; this.type = o && o.type; } },
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

// ถอดแท็กแบบไม่แทรกช่องว่างเพิ่ม — หมวดนี้เทียบข้อความคำสั่ง IOS แบบตรงตัว
const cliText = (html) => String(html).replace(/<[^>]*>/g, '');
const routerCli = () => cliText(getElementById('cliRouterOutput').innerHTML);
// ตั้งชื่อแผนกตามที่ส่งมา แล้วสั่งคำนวณ+สร้าง config ผ่านทางเข้าจริงที่ปุ่มเรียก
function setupDepts(names) {
    run('clearAll();');
    const depts = names.map((n, i) => ({ id: i + 1, name: n, hosts: 20 }));
    run("state.baseIp='10.0.0.0'; state.baseCidr=24; state.departments=" + JSON.stringify(depts) + '; refreshAll(); renderCLI();');
}

(async () => {

/* ===== A. toCiscoName() — กฎการแปลงทีละข้อ ===== */

const tc = (s, f) => run('toCiscoName(' + JSON.stringify(s) + (f === undefined ? '' : ', ' + JSON.stringify(f)) + ')');

check('A1: เว้นวรรคกลางชื่อกลายเป็นขีด', tc('IT Support') === 'IT-Support', tc('IT Support'));
check('A2: เว้นวรรคติดกันหลายตัวยุบเหลือขีดเดียว', tc('IT   Support') === 'IT-Support', tc('IT   Support'));
check('A3: ตัดช่องว่างหัวท้ายก่อนแปลง', tc('  Sales  ') === 'Sales', tc('  Sales  '));
check('A4: ชื่อที่ถูกต้องอยู่แล้วต้องไม่ถูกแตะ (กันเทสรอบนี้ทำของเดิมพัง)',
    tc('IT-Department') === 'IT-Department' && tc('Computer_Lab2') === 'Computer_Lab2', tc('IT-Department'));
// ช่องว่างกลายเป็นขีดก่อน แล้วค่อยตัดอักขระที่เหลือ: 'R&D (ชั้น3)!' -> 'R&D-(ชั้น3)!' -> 'RD-3'
check('A5: อักขระที่ IOS ไม่รับถูกตัดทิ้ง', tc('R&D (ชั้น3)!') === 'RD-3', tc('R&D (ชั้น3)!'));
check('A6: ขีดที่ติดกันหลังการตัดยุบเหลือตัวเดียว', tc('A - - B') === 'A-B', tc('A - - B'));
check('A7: ขีดหัวท้ายที่เหลือค้างถูกตัดออก', tc('--Sales--') === 'Sales', tc('--Sales--'));
check('A8: ชื่อยาวเกิน 32 ตัวถูกตัดตามเพดานของ IOS',
    tc('A'.repeat(50)).length === 32, tc('A'.repeat(50)).length);
check('A9: ชื่อภาษาไทยล้วนถูกตัดจนว่าง -> ใช้ fallback',
    tc('ฝ่ายไอที', 'DEPT-7') === 'DEPT-7', tc('ฝ่ายไอที', 'DEPT-7'));
check('A10: ไทยปนอังกฤษ เก็บเฉพาะส่วนที่ IOS รับได้',
    tc('ฝ่าย IT', 'DEPT-7') === 'IT', tc('ฝ่าย IT', 'DEPT-7'));
check('A11: null / undefined / ค่าว่าง ใช้ fallback ไม่ใช่ตกเป็นสตริง "null"',
    tc(null, 'DEPT-1') === 'DEPT-1' && tc('', 'DEPT-1') === 'DEPT-1' && run("toCiscoName(undefined, 'DEPT-1')") === 'DEPT-1');
check('A12: fallback ถูกล้างด้วยกฎเดียวกัน ไม่ปล่อยของสกปรกออกไปเป็นคำสั่ง',
    tc('ฝ่ายไอที', 'สาขา A') === 'A', tc('ฝ่ายไอที', 'สาขา A'));
check('A13: ว่างทั้งชื่อและ fallback ยังต้องได้ชื่อที่ใช้ได้ ไม่ใช่ค่าว่าง',
    tc('ฝ่ายไอที', 'ฝ่ายบัญชี') === 'POOL', tc('ฝ่ายไอที', 'ฝ่ายบัญชี'));

/* ===== B. ชื่อ pool ใน config จริง (ยิงผ่าน renderCLI) ===== */

setupDepts(['IT Support']);
let cli = routerCli();
check('B1: ชื่อมีเว้นวรรคออกมาเป็น pool ที่ IOS รับได้',
    cli.indexOf('ip dhcp pool IT-Support') !== -1, (cli.match(/ip dhcp pool.*/) || [''])[0]);
check('B2: ไม่มีคำสั่ง pool ที่ยังมีเว้นวรรคหลงเหลือ (บั๊กตัวจริงของรอบนี้)',
    cli.indexOf('ip dhcp pool IT Support') === -1);

setupDepts(['ฝ่ายไอที']);
cli = routerCli();
check('B3: ชื่อไทยล้วนได้ชื่อสำรองอิงจาก id ของแผนก',
    cli.indexOf('ip dhcp pool DEPT-1') !== -1, (cli.match(/ip dhcp pool.*/) || [''])[0]);
check('B4: ชื่อไทยเดิมยังถูกกำกับไว้ในคอมเมนต์ ให้ไล่ได้ว่า DEPT-1 คือแผนกไหน',
    cli.indexOf('! ฝ่ายไอที') !== -1);
// `description` รับข้อความอิสระถึงท้ายบรรทัดและถูกเก็บเป็นสตริงเฉย ๆ ไม่ได้เอาไป parse ต่อ
// จึงจงใจปล่อยให้เก็บชื่อไทยไว้ — ผู้ใช้ที่กด show run จะได้อ่านออกว่า interface นี้ของแผนกไหน
// บรรทัดอื่นที่เป็นคำสั่งจริงต้องไม่มีอักขระไทยเด็ดขาด เพราะ IOS เอาไปตีความเป็น token
const cmdLines = (text) => text.split('\n')
    .filter(l => l.trim() && l.trim()[0] !== '!' && l.trim().indexOf('description ') !== 0);
check('B5: ไม่มีอักขระไทยหลุดไปอยู่ในบรรทัดคำสั่ง (คอมเมนต์กับ description ไม่นับ)',
    cmdLines(cli).every(l => !/[฀-๿]/.test(l)),
    cmdLines(cli).filter(l => /[฀-๿]/.test(l)).join(' | '));
// IOS ไม่มีคอมเมนต์ท้ายบรรทัด — `!` เป็นคอมเมนต์เฉพาะตอนขึ้นต้นบรรทัด
// กฎนี้ครอบทั้ง config ไม่ใช่แค่จุดที่รู้ว่าเคยพลาด เพื่อดักการเผลอเติมแบบเดิมในอนาคต
check('B5b: ไม่มีคอมเมนต์ต่อท้ายบรรทัดคำสั่ง (IOS จะอ่านเป็น argument เกินแล้วปฏิเสธทั้งบรรทัด)',
    cmdLines(cli).every(l => l.indexOf('!') === -1),
    cmdLines(cli).filter(l => l.indexOf('!') !== -1).join(' | '));

// กฎครอบจักรวาล — ต่อให้ผู้ใช้ตั้งชื่อพิสดารแค่ไหน โครงสร้างบรรทัดต้องคงที่เสมอ
setupDepts(['IT Support', 'ฝ่ายบัญชี', 'R&D (ชั้น 3)', '   ', 'Sales-01', 'ชื่อยาวมาก ๆ ที่ไม่มีตัวอังกฤษเลยสักตัว']);
cli = routerCli();
const poolLines = cli.split('\n').filter(l => l.indexOf('ip dhcp pool') === 0);
check('B6: มีบรรทัด pool ครบทุกแผนก', poolLines.length === 6, poolLines.length);
check('B7: ทุกบรรทัด pool มี 4 token พอดี (ip / dhcp / pool / ชื่อ)',
    poolLines.every(l => l.trim().split(/\s+/).length === 4),
    poolLines.filter(l => l.trim().split(/\s+/).length !== 4).join(' | '));
check('B8: ทุกชื่อ pool เป็น ASCII ที่ IOS รับได้',
    poolLines.every(l => /^ip dhcp pool [A-Za-z0-9_-]{1,32}$/.test(l.trim())),
    poolLines.join(' | '));

/* ===== C. ชื่อซ้ำหลังแปลง ===== */

setupDepts(['IT Support', 'IT-Support']);
cli = routerCli();
const dupPools = cli.split('\n').filter(l => l.indexOf('ip dhcp pool') === 0).map(l => l.trim());
check('C1: สองชื่อที่แปลงแล้วชนกัน ต้องได้ pool คนละชื่อ ไม่ทับกัน',
    dupPools.length === 2 && dupPools[0] !== dupPools[1], dupPools.join(' | '));

setupDepts(['ฝ่ายไอที', 'ฝ่ายบัญชี', 'ฝ่ายบุคคล']);
cli = routerCli();
const thaiPools = cli.split('\n').filter(l => l.indexOf('ip dhcp pool') === 0).map(l => l.trim());
check('C2: หลายแผนกที่ชื่อไทยล้วน ต้องได้ชื่อไม่ซ้ำกันทุกตัว',
    new Set(thaiPools).size === 3, thaiPools.join(' | '));

/* ===== D. hostname (คำสั่ง) ต้องแยกจากชื่อที่ให้คนอ่าน ===== */

run("loadExample('company');");
const branch = run(`(function(){
    var br = addManualNode(BranchRouterDevice, 1100, 300);
    br.label = 'สาขาเชียงใหม่';
    addLink('router', br.id);
    refreshAll();
    return br.id;
})()`);
run("selectCliRouter('" + branch + "');");
cli = routerCli();
const hostLine = (cli.match(/^hostname .*/m) || [''])[0];
check('D1: hostname ของสาขาชื่อไทยต้องเป็น ASCII ที่ IOS รับได้',
    /^hostname [A-Za-z0-9_-]+$/.test(hostLine), hostLine);
check('D2: routerDisplayName ยังคืนชื่อไทยเดิมไว้ให้ UI',
    run("routerDisplayName(topoNodes.manualNodes.find(function(n){return n.id==='" + branch + "'}))") === 'สาขาเชียงใหม่');
check('D3: แท็บเลือก Router โชว์ชื่อไทย ไม่ใช่ชื่อที่ถูกแปลงแล้ว',
    getElementById('cliRouterPicker').innerHTML.indexOf('สาขาเชียงใหม่') !== -1);
check('D4: หัวข้อคอมเมนต์บนสุดของ config ก็ใช้ชื่อไทย (เป็นคอมเมนต์ ไม่ใช่คำสั่ง)',
    cli.indexOf('! สาขาเชียงใหม่') !== -1);
check('D5: Router หลักยังชื่อ Router-01 เหมือนเดิม',
    run("routerHostname({ id: 'router' })") === 'Router-01' && run("routerDisplayName({ id: 'router' })") === 'Router-01');
check('D6: สาขาที่ไม่ได้ตั้งชื่อเลย ยังได้ hostname ที่ใช้ได้',
    /^[A-Za-z0-9_-]+$/.test(run("routerHostname({ id: 'm-9', label: '' })")),
    run("routerHostname({ id: 'm-9', label: '' })"));

// บล็อก WAN/route เป็นคนละฟังก์ชันกับ DHCP (buildWanSectionHTML) จึงต้องตรวจแยก
// ทั้งสามทางแยกในนั้นเคยต่อคอมเมนต์ท้ายบรรทัด ip route ไว้หมด = เส้นทางแปะลงอุปกรณ์ไม่ผ่านเลย
check('D7: config ของสาขา (มี default route) ไม่มีคอมเมนต์ต่อท้ายคำสั่ง',
    cmdLines(cli).every(l => l.indexOf('!') === -1),
    cmdLines(cli).filter(l => l.indexOf('!') !== -1).join(' | '));
check('D8: สาขาได้ default route ชี้กลับต้นทางจริง',
    /^ip route 0\.0\.0\.0 0\.0\.0\.0 \d+\.\d+\.\d+\.\d+$/m.test(cli),
    (cli.match(/^ip route.*/m) || [''])[0]);

// สำนักงานใหญ่เดินอีกทางแยกหนึ่ง (static route เจาะจงรายวง) ต้องตรวจด้วย
run("(function(){ var sw = topoNodes.switches[0]; addLink('" + branch + "', sw.id); refreshAll(); })(); selectCliRouter('router'); renderCLI();");
const hqCli = routerCli();
const hqRoutes = hqCli.split('\n').filter(l => l.indexOf('ip route') === 0);
check('D9: สำนักงานใหญ่ได้ static route เจาะจงไปยังวงหลังสาขา', hqRoutes.length > 0, hqRoutes.join(' | '));
check('D10: ทุกบรรทัด ip route มี 5 token พอดี (ip / route / network / mask / next-hop)',
    hqRoutes.every(l => l.trim().split(/\s+/).length === 5), hqRoutes.join(' | '));
check('D11: config สำนักงานใหญ่ทั้งก้อนไม่มีคอมเมนต์ต่อท้ายคำสั่ง',
    cmdLines(hqCli).every(l => l.indexOf('!') === -1),
    cmdLines(hqCli).filter(l => l.indexOf('!') !== -1).join(' | '));

/* ===== E. คำเตือนรหัสผ่านตัวอย่าง ===== */

run("selectCliRouter('router'); renderCLI();");
cli = routerCli();
const lines = cli.split('\n');
const secretIdx = lines.findIndex(l => l.indexOf('enable secret') === 0);
check('E1: ยังมีบรรทัด enable secret อยู่ (ไม่ได้ตัดทิ้ง แค่เตือน)', secretIdx > 0, secretIdx);
check('E2: คำเตือนอยู่บรรทัดเหนือ enable secret พอดี — ตำแหน่งที่ตาไปหยุดตอนอ่าน config',
    secretIdx > 0 && lines[secretIdx - 1].indexOf('!') === 0 && lines[secretIdx - 1].indexOf('เปลี่ยนก่อนนำไปใช้') !== -1,
    secretIdx > 0 ? lines[secretIdx - 1] : '(ไม่พบ)');
check('E3: ไม่ใส่ service password-encryption ให้อัตโนมัติ (type 7 ถอดกลับได้ = ปลอดภัยลวง)',
    cli.indexOf('service password-encryption') === -1);

// ไฟล์ .txt ที่ผู้ใช้ได้จริงต้องมีคำเตือนด้วย ไม่ใช่มีแค่บนหน้าจอ
run("loadExample('small'); renderCLI(); exportCliTxt();");
check('E4: คำเตือนรอดไปถึงไฟล์ .txt ที่ export (ผ่าน stripCliHtml)',
    downloadedText && downloadedText.indexOf('เปลี่ยนก่อนนำไปใช้') !== -1);
check('E5: ไฟล์ .txt ไม่มีแท็ก HTML ปนออกไป',
    downloadedText && downloadedText.indexOf('<span') === -1);

/* ===== F. โหมดคัดลอกสำหรับ Packet Tracer =====
   Packet Tracer กับสายคอนโซลจริงรับได้เฉพาะ ASCII ถ้าวางคอมเมนต์ภาษาไทยลงไปจะเพี้ยนทั้งหน้าจอ
   ซึ่งเป็นอาการที่หาสาเหตุยากมากตอนกำลังสาธิตอยู่ จึงต้องมีโหมดตัดคอมเมนต์ที่ไม่ใช่ ASCII ออก */

run("loadExample('company'); selectCliRouter('router'); renderCLI();");
const fullCli = cliText(getElementById('cliRouterOutput').innerHTML);
const asciiCli = run('stripNonAsciiComments(' + JSON.stringify(fullCli) + ')');

check('F1: ผลลัพธ์โหมด PT ไม่มีอักขระนอก ASCII เหลืออยู่เลย',
    !/[^\x00-\x7F]/.test(asciiCli),
    (asciiCli.match(/^.*[^\x00-\x7F].*$/m) || ['(สะอาด)'])[0]);
check('F2: บรรทัดคำสั่งยังอยู่ครบทุกบรรทัด ไม่ได้ถูกตัดไปด้วย',
    fullCli.split('\n').filter(l => l.trim() && l.trim()[0] !== '!').length ===
    asciiCli.split('\n').filter(l => l.trim() && l.trim()[0] !== '!').length,
    'เดิม ' + fullCli.split('\n').filter(l => l.trim() && l.trim()[0] !== '!').length +
    ' เหลือ ' + asciiCli.split('\n').filter(l => l.trim() && l.trim()[0] !== '!').length);
check('F3: คอมเมนต์ที่เป็นภาษาอังกฤษล้วนยังถูกเก็บไว้ (ยังอ่านรู้เรื่องว่าแต่ละบล็อกคืออะไร)',
    asciiCli.indexOf('! ===') !== -1);
check('F4: คำสั่งสำคัญยังครบ ไม่ได้หายไปกับคอมเมนต์',
    asciiCli.indexOf('hostname Router-01') !== -1 &&
    asciiCli.indexOf('ip dhcp pool') !== -1 &&
    asciiCli.indexOf('encapsulation dot1Q') !== -1);

// config ของสาขามีคอมเมนต์ไทยเยอะกว่า (บล็อก WAN + route) ต้องสะอาดเหมือนกัน
run("loadExample('branch2');");
run("selectCliRouter(getBranchRouters()[0].id); renderCLI();");
const brFull = cliText(getElementById('cliRouterOutput').innerHTML);
const brAscii = run('stripNonAsciiComments(' + JSON.stringify(brFull) + ')');
check('F5: config ของสาขาในโหมด PT ก็สะอาดเช่นกัน', !/[^\x00-\x7F]/.test(brAscii));
check('F6: สาขายังมี default route ครบหลังตัดคอมเมนต์',
    /^ip route 0\.0\.0\.0 0\.0\.0\.0 /m.test(brAscii));

/* ---------- สรุปผล ---------- */
let pass = 0;
results.forEach(r => {
    if (r.pass) pass++;
    console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
});
console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
process.exit(pass === results.length ? 0 : 1);

})();
