/* ============================================
   tests/scenarios.test.js — ตัวอย่างผังหลาย Router / Router ที่ยังลอย / รูปแปลนอาคาร (2 ส.ค. 2569)
   ============================================
   วิธีรัน:   node tests/scenarios.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install (แพทเทิร์นเดียวกับไฟล์เทสอื่นในโฟลเดอร์นี้)

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):
   ผู้ใช้จริงรายงานมาว่า "กดปุ่ม Router บน Canvas แล้ววางลงไป มันใช้ไม่ได้ ต้องเชื่อมกับ Router
   ตัวเก่าก่อน" ซึ่งถูกต้องตามการออกแบบทุกประการ แต่ไม่มีอะไรในแอปบอกไว้เลย ผู้ใช้ต้องลองเองจนเจอ
   รอบนี้จึงเพิ่มสามอย่างที่ต้องมีเทสคุม:
     1. ตัวอย่างที่มาพร้อมผังหลาย Router ครบสาย — ให้ดูของจริงได้โดยไม่ต้องต่อเอง
     2. สัญญาณเตือนบน Router สาขาที่ยังไม่มีลิงก์ WAN
     3. รูปแปลนอาคารใต้ผัง ซึ่งเป็นข้อมูลก้อนใหญ่ที่สุดในโปรเจกต์ จึงมีกฎเรื่องที่เก็บเป็นพิเศษ

   ครอบคลุม:
   A. buildExampleTopology() — สร้าง Router สาขา ลากสาย และแบ่งความเป็นเจ้าของแผนกได้ถูกต้อง
   B. config ที่ได้จากตัวอย่างต้องใช้งานได้จริง — HQ มี static route ครบทุกวงหลังสาขา / สาขามี default route
   C. Router สาขาที่ยังไม่เชื่อม — ตรวจจับได้ และหายไปเองเมื่อเชื่อมแล้ว
   D. รูปแปลนอาคาร — บันทึก/โหลดกลับได้ครบ, ถูกตัดออกจากลิงก์แชร์เสมอ, ไม่รับ src ที่ชี้ออกนอกเครื่อง
   ============================================ */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/examples.js', 'js/vlsm.js', 'js/vlsm6.js', 'js/devices.js', 'js/topology.js', 'js/ui.js', 'js/wan.js', 'js/cli.js', 'js/backdrop.js', 'js/practice.js', 'js/tools.js', 'js/library.js', 'js/history.js', 'js/export.js', 'js/app.js'];

let capturedToasts = [];

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
    Blob: class { constructor(p, o) { this.parts = p; this.type = o && o.type; } },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    FileReader: class { readAsText() {} },
    requestAnimationFrame: () => 1
    // ไม่ใส่ Image ให้ sandbox โดยตั้งใจ — เพื่อพิสูจน์ว่า ensureBackdropImage() ต้องไม่ล้ม
    // ในสภาพแวดล้อมที่ไม่มี Image (โค้ดกันไว้ด้วย typeof Image !== 'function')
};
const context = vm.createContext(sandbox);
for (const f of JS_FILES) {
    vm.runInContext(fs.readFileSync(path.join(PROJECT_ROOT, f), 'utf8'), context, { filename: f });
}
context.showToast = (msg, type) => { capturedToasts.push({ msg, type }); };

const results = [];
function check(label, cond, detail) { results.push({ label, pass: !!cond, detail: detail !== undefined ? String(detail) : '' }); }
const run = (code) => vm.runInContext(code, context);
const cliText = (html) => String(html).replace(/<[^>]*>/g, '');

(async () => {

/* ===== A. ตัวอย่างที่มาพร้อมผัง ===== */

run("loadExample('branch2');");

check('A1: สร้าง Router สาขาครบตามที่ตัวอย่างกำหนด',
    run('getBranchRouters().length') === 2, run('getBranchRouters().length'));
check('A2: ชื่อสาขาถูกตั้งตามตัวอย่าง ไม่ใช่ชื่อค่าเริ่มต้น',
    run('getBranchRouters().map(function(r){return r.label}).sort().join("|")') === 'ChiangMai|KhonKaen',
    run('getBranchRouters().map(function(r){return r.label}).join(", ")'));
check('A3: ลิงก์ WAN ถูกสร้างครบและได้ /30 คนละวง',
    run('state.wanLinks.length') === 2 &&
    run('state.wanLinks[0].network') !== run('state.wanLinks[1].network'),
    run('state.wanLinks.map(function(w){return w.network+"/30"}).join(", ")'));

// ความเป็นเจ้าของแผนกคือหัวใจของตัวอย่างชุดนี้ — ถ้าผิด config ทุกตัวจะผิดตามหมด
const cmDepts = run('getDeptsOfRouter(getBranchRouters().find(function(r){return r.label==="ChiangMai"}).id).map(function(d){return d.name}).sort().join("|")');
check('A4: สาขาเชียงใหม่ดูแล 2 แผนกตามที่ระบุ',
    cmDepts === 'CM-Sales|CM-Stock', cmDepts);
const kkDepts = run('getDeptsOfRouter(getBranchRouters().find(function(r){return r.label==="KhonKaen"}).id).map(function(d){return d.name}).join("|")');
check('A5: สาขาขอนแก่นดูแล 1 แผนกตามที่ระบุ', kkDepts === 'KK-Sales', kkDepts);

const hqDepts = run('getDeptsOfRouter("router").map(function(d){return d.name}).sort().join("|")');
check('A6: แผนกที่เหลือยังอยู่กับ Router หลัก (ไม่ถูกสาขาแย่งไปโดยไม่ได้ตั้งใจ)',
    hqDepts === 'Data-Center|HQ-IT|HQ-Office', hqDepts);
check('A7: ทุกแผนกถูกนับเจ้าของครบพอดี ไม่มีตกหล่นและไม่มีนับซ้ำ',
    run('getDeptsOfRouter("router").length + getBranchRouters().reduce(function(s,r){return s+getDeptsOfRouter(r.id).length},0)') === run('state.calculated.length'),
    run('state.calculated.length'));

// ตัวอย่างชุดใหญ่
run("loadExample('branch3');");
check('A8: ตัวอย่าง 3 สาขา สร้างครบและต่อดาวเข้าศูนย์กลาง',
    run('getBranchRouters().length') === 3 && run('state.wanLinks.length') === 3,
    'สาขา ' + run('getBranchRouters().length') + ' / ลิงก์ ' + run('state.wanLinks.length'));
check('A9: ทุกลิงก์ WAN มีปลายข้างหนึ่งเป็น Router หลักเสมอ (ผังดาว ไม่ใช่ลูกโซ่)',
    run('getWanLinkRecords().every(function(l){ return l.fromId === "router" || l.toId === "router"; })'));

// โหลดตัวอย่างธรรมดาทับ ต้องล้างผังเดิมทิ้งให้หมด ไม่งั้น Router สาขาจะค้างข้ามตัวอย่าง
run("loadExample('company');");
check('A10: โหลดตัวอย่างที่ไม่มีผัง ต้องล้าง Router สาขาของตัวอย่างก่อนหน้าออกหมด',
    run('getBranchRouters().length') === 0 && run('state.wanLinks.length') === 0,
    'เหลือสาขา ' + run('getBranchRouters().length'));

/* ===== A-bis. ตำแหน่งบนผังต้องไม่ทับกัน =====
   รอบแรกฝังพิกัดตายตัวไว้ในไฟล์ตัวอย่าง (x:1150, y:120/380/620) ผลคือตอนเปิดใช้จริง
   Site-South ที่ y=380 ไปทับกล่องแผนกซึ่ง layoutTopology() วางไว้ที่ y=350 สูง 60 (กิน 320-380 พอดี)
   เห็นเป็นกล่องสองใบซ้อนกันจนอ่านไม่ออก และเส้นสายลากพาดข้ามผังทั้งใบ
   เทสหมวดนี้จับ "กล่องทับกัน" แบบครอบจักรวาล ไม่ใช่เช็คพิกัดเฉพาะจุดที่รู้ว่าเคยพลาด */

function allBoxes() {
    return run(`(function(){
        var list = [];
        if (topoNodes.router) list.push({ id:'router', label:'Router-01', x:topoNodes.router.x, y:topoNodes.router.y, w:topoNodes.router.w, h:topoNodes.router.h });
        topoNodes.switches.forEach(function(n){ list.push({ id:n.id, label:n.label, x:n.x, y:n.y, w:n.w, h:n.h }); });
        topoNodes.departments.forEach(function(n){ list.push({ id:n.id, label:n.label, x:n.x, y:n.y, w:n.w, h:n.h }); });
        topoNodes.manualNodes.forEach(function(n){ list.push({ id:n.id, label:n.label, x:n.x, y:n.y, w:n.w, h:n.h }); });
        return list;
    })()`);
}
function findOverlaps(boxes) {
    const hit = [];
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2;
            const overlapY = Math.abs(a.y - b.y) < (a.h + b.h) / 2;
            if (overlapX && overlapY) hit.push(a.label + ' ทับ ' + b.label);
        }
    }
    return hit;
}

['branch2', 'branch3'].forEach(function (key) {
    run("loadExample('" + key + "');");
    const boxes = allBoxes();
    const overlaps = findOverlaps(boxes);
    check('Abis-' + key + ': ไม่มีกล่องอุปกรณ์ตัวไหนทับกันเลย',
        overlaps.length === 0, overlaps.join(' | '));

    // สาขาต้องอยู่ใต้แถวแผนก ไม่ใช่ระดับเดียวกัน (สาเหตุตรงของบั๊กรอบแรก)
    const branchY = run('getBranchRouters().map(function(r){return r.y})');
    const deptBottom = run('Math.max.apply(null, topoNodes.departments.map(function(n){return n.y + n.h/2}))');
    check('Abis-' + key + ': Router สาขาอยู่ต่ำกว่าขอบล่างของแถวแผนกทุกตัว',
        branchY.every(y => y > deptBottom), 'สาขา y=' + branchY.join(',') + ' / ขอบล่างแผนก=' + deptBottom);
});

// เพดานของแอปคือ 12 แผนก ซึ่งเป็นกรณีที่กล่องเบียดกันมากที่สุด — ต้องยังไม่ทับกัน
// (บั๊กเดิม: minSpacing ตั้งไว้ 100 ทั้งที่กล่องกว้าง 132 พอถึง 12 แผนกทับกัน 32px)
run("clearAll(); state.baseIp='10.0.0.0'; state.baseCidr=18; state.departments=" +
    JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: 'Dept-' + (i + 1), hosts: 20 }))) +
    '; refreshAll(true);');
const maxBoxes = allBoxes();
check('Abis-12: ผังเต็มเพดาน 12 แผนก กล่องยังไม่ทับกัน',
    findOverlaps(maxBoxes).length === 0, findOverlaps(maxBoxes).slice(0, 3).join(' | '));

// สาขาที่ดูแลแผนกซึ่งอยู่ติดกัน ต้องไม่ถูกวางซ้อนกันเอง
run("loadExample('branch3');");
const bxs = run('getBranchRouters().map(function(r){return r.x}).sort(function(a,b){return a-b})');
check('Abis-gap: ระยะห่างแนวนอนระหว่างสาขาที่อยู่ติดกันไม่น้อยกว่า 190px',
    bxs.every((x, i) => i === 0 || x - bxs[i - 1] >= 190 - 0.001), bxs.map(Math.round).join(', '));

/* ===== B. config ที่ได้ต้องใช้งานได้จริง ===== */

run("loadExample('branch2'); selectCliRouter('router'); renderCLI();");
const hqCli = cliText(getElementById('cliRouterOutput').innerHTML);
const hqRoutes = hqCli.split('\n').filter(l => l.indexOf('ip route') === 0);
check('B1: HQ มี static route ครบทุกวงที่อยู่หลังสาขา (3 แผนก = 3 เส้นทาง)',
    hqRoutes.length === 3, hqRoutes.join(' | '));
check('B2: HQ ไม่มี default route (มีหลายทางออก ต้องระบุเจาะจง)',
    hqRoutes.every(l => l.indexOf('0.0.0.0 0.0.0.0') === -1), hqRoutes.join(' | '));
check('B3: HQ แจก DHCP เฉพาะแผนกของตัวเอง ไม่ยุ่งกับแผนกของสาขา',
    hqCli.split('\n').filter(l => l.indexOf('ip dhcp pool') === 0).length === 3,
    hqCli.split('\n').filter(l => l.indexOf('ip dhcp pool') === 0).join(' | '));

const branchId = run('getBranchRouters()[0].id');
run("selectCliRouter('" + branchId + "'); renderCLI();");
const brCli = cliText(getElementById('cliRouterOutput').innerHTML);
check('B4: สาขามี default route กลับต้นทาง (stub network ทางออกเดียว)',
    /^ip route 0\.0\.0\.0 0\.0\.0\.0 \d+\.\d+\.\d+\.\d+$/m.test(brCli),
    (brCli.match(/^ip route.*/m) || ['(ไม่มี)'])[0]);
check('B5: สาขามี interface WAN เป็น Serial',
    /^interface Serial\d+\/\d+\/\d+$/m.test(brCli), (brCli.match(/^interface Serial.*/m) || ['(ไม่มี)'])[0]);
check('B6: ทุกบรรทัดคำสั่งของสาขาไม่มีคอมเมนต์ต่อท้าย (กฎเดียวกับ cli-naming.test.js)',
    brCli.split('\n').filter(l => l.trim() && l.trim()[0] !== '!' && l.trim().indexOf('description ') !== 0)
         .every(l => l.indexOf('!') === -1));

/* ===== C. Router สาขาที่ยังไม่เชื่อม ===== */

run("clearAll(); loadExample('small');");
const lone = run("(function(){ var n = addManualNode(BranchRouterDevice, 900, 300); n.label='Lonely'; refreshAll(); return n.id; })()");

check('C1: Router สาขาที่เพิ่งวางถูกจัดว่ายังไม่เชื่อม',
    run('isOrphanBranchRouter(findNodeById("' + lone + '"))') === true);
check('C2: getOrphanBranchRouters() รายงานตัวที่ลอยอยู่ได้',
    run('getOrphanBranchRouters().length') === 1, run('getOrphanBranchRouters().length'));
check('C3: Router หลักไม่มีทางถูกนับว่าลอย (มันไม่ใช่ Router สาขา)',
    run('isOrphanBranchRouter(topoNodes.router)') === false);
check('C4: PC ธรรมดาไม่ถูกนับว่าลอย แม้จะยังไม่ได้เชื่อมอะไร',
    run("(function(){ var p = addManualNode(PCDevice, 700, 500); return isOrphanBranchRouter(p); })()") === false);

// แผงรายละเอียดต้องบอกวิธีแก้ ไม่ใช่แค่รายงานสถานะ
run("selectNode('" + lone + "', 'router-branch');");
const panel = getElementById('detailContent').innerHTML;
check('C5: แผงรายละเอียดขึ้นคำเตือนว่ายังใช้งานไม่ได้',
    panel.indexOf('ยังใช้งานไม่ได้') !== -1);
check('C6: คำเตือนบอกขั้นตอนแก้ครบ (Connect -> Router-01 -> ได้ /30)',
    panel.indexOf('Connect') !== -1 && panel.indexOf('Router-01') !== -1 && panel.indexOf('/30') !== -1);

// เชื่อมแล้วคำเตือนต้องหายไปเอง
run("addLink('router', '" + lone + "'); refreshAll(); selectNode('" + lone + "', 'router-branch');");
check('C7: พอเชื่อม WAN แล้วเลิกถูกนับว่าลอย',
    run('isOrphanBranchRouter(findNodeById("' + lone + '"))') === false);
check('C8: คำเตือนในแผงรายละเอียดหายไปหลังเชื่อม',
    getElementById('detailContent').innerHTML.indexOf('ยังใช้งานไม่ได้') === -1);

/* ===== C2. สัญญาณนาฬิกาของสายอนุกรม (clock rate) =====
   สายอนุกรมแบบเชื่อมตรงต้องมีฝั่งหนึ่งจ่ายสัญญาณนาฬิกา ถ้าฝั่งนั้นไม่ตั้ง clock rate สายจะไม่ขึ้น
   ทั้งที่ IP ถูกหมดแล้ว และไม่มี error อะไรขึ้นมาบอก เป็นอาการที่หาสาเหตุยากที่สุดอาการหนึ่ง
   "ฝั่งไหนเป็น DCE" คำนวณจากผังไม่ได้ ขึ้นกับการเสียบสายจริง โปรแกรมจึงเดาให้แล้วให้สลับเองได้ */

run("loadExample('branch2'); selectCliRouter('router'); renderCLI();");
const hqCliDce = cliText(getElementById('cliRouterOutput').innerHTML);
const brId = run('getBranchRouters()[0].id');
run("selectCliRouter('" + brId + "'); renderCLI();");
const brCliDce = cliText(getElementById('cliRouterOutput').innerHTML);

check('C2-1: ค่าเริ่มต้นให้ Router หลักเป็นฝั่งจ่ายสัญญาณนาฬิกา',
    run('state.wanLinks.every(function(w){ return w.dceId === "router"; })'),
    run('state.wanLinks.map(function(w){return w.dceId}).join(", ")'));
check('C2-2: config ของ Router หลักมีคำสั่ง clock rate ครบทุกสาย',
    hqCliDce.split('\n').filter(l => l.trim().indexOf('clock rate') === 0).length === 2,
    hqCliDce.split('\n').filter(l => l.trim().indexOf('clock rate') === 0).join(' | '));
check('C2-3: ค่าเริ่มต้นของความเร็วคือ 64000 ซึ่งเป็นค่ามาตรฐานในห้องแล็บ',
    hqCliDce.indexOf('clock rate 64000') !== -1);
// ต้องนับเฉพาะบรรทัดคำสั่ง เพราะฝั่ง DTE มีคอมเมนต์อธิบายที่มีคำว่า clock rate อยู่ด้วย
const cmdHas = (text, needle) => text.split('\n')
    .filter(l => l.trim() && l.trim()[0] !== '!')
    .some(l => l.trim().indexOf(needle) === 0);
check('C2-4: ฝั่งสาขาต้องไม่มีคำสั่ง clock rate เพราะเป็นฝั่งรับสัญญาณ',
    !cmdHas(brCliDce, 'clock rate'),
    brCliDce.split('\n').filter(l => l.trim().indexOf('clock rate') === 0).join(' | ') || '(ไม่มี)');
check('C2-5: ฝั่งสาขามีคอมเมนต์อธิบายว่าทำไมถึงไม่มี พร้อมบอกวิธีสลับ',
    brCliDce.indexOf('DTE') !== -1 && brCliDce.indexOf('สลับฝั่ง DCE') !== -1);
check('C2-6: clock rate อยู่ใต้บรรทัด ip address และเหนือ no shutdown (ลำดับที่ IOS รับ)',
    (function () {
        const lines = hqCliDce.split('\n').map(l => l.trim());
        const i = lines.findIndex(l => l.indexOf('clock rate') === 0);
        return i > 0 && lines[i - 1].indexOf('ip address') === 0 && lines[i + 1] === 'no shutdown';
    })(), hqCliDce.split('\n').map(l => l.trim()).slice(0, 0).join(''));

// สลับฝั่งแล้วคำสั่งต้องย้ายตาม
const linkId = run('state.wanLinks[0].linkId');
run("toggleWanDce('" + linkId + "');");
run("selectCliRouter('router'); renderCLI();");
const hqAfter = cliText(getElementById('cliRouterOutput').innerHTML);
run("selectCliRouter('" + brId + "'); renderCLI();");
const brAfter = cliText(getElementById('cliRouterOutput').innerHTML);
check('C2-7: สลับฝั่งแล้ว Router หลักเหลือ clock rate สายเดียว',
    hqAfter.split('\n').filter(l => l.trim().indexOf('clock rate') === 0).length === 1);
check('C2-8: สลับฝั่งแล้วสาขาได้ clock rate มาแทน',
    brAfter.indexOf('clock rate 64000') !== -1);
check('C2-9: ตัวเลือกที่ผู้ใช้สลับไว้ถูกเก็บลงไฟล์บันทึก',
    run('buildProjectSnapshot().wanDce["' + linkId + '"]') === run('getBranchRouters()[0].id'));
check('C2-10: โหลดไฟล์กลับมาแล้วฝั่ง DCE ยังเป็นตัวที่เลือกไว้',
    (function () {
        const snap = run('buildProjectSnapshot()');
        run('applyProjectData(' + JSON.stringify(snap) + ')');
        const dce = run('state.wanLinks[0].dceId');
        return dce !== 'router';
    })(), run('state.wanLinks[0].dceId'));

// เปลี่ยนความเร็ว
run('onWanClockRateChange(128000); selectCliRouter("router"); renderCLI();');
check('C2-11: เปลี่ยนความเร็วแล้วคำสั่งเปลี่ยนตาม',
    cliText(getElementById('cliRouterOutput').innerHTML).indexOf('clock rate 128000') !== -1);
check('C2-12: ค่าความเร็วที่ไม่อยู่ในรายการที่ IOS รับ ต้องถูกปฏิเสธ',
    (function () { run('onWanClockRateChange(12345);'); return run('getWanClockRate()') === 128000; })(),
    run('getWanClockRate()'));
run('onWanClockRateChange(64000);');

check('C2-13: บรรทัด clock rate เป็น ASCII ล้วน วางลง Packet Tracer ได้',
    !/[^\x00-\x7F]/.test((cliText(getElementById('cliRouterOutput').innerHTML)
        .split('\n').find(l => l.trim().indexOf('clock rate') === 0) || '')));

/* ===== D. รูปแปลนอาคาร ===== */

// data URI สั้น ๆ ใช้แทนรูปจริง — เทสนี้สนใจ "เส้นทางของข้อมูล" ไม่ได้สนใจการถอดรหัสรูป
const FAKE_IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

check('D1: ค่าเริ่มต้นคือไม่มีรูป', run('hasBackdrop()') === false);
check('D2: ensureBackdropImage() ไม่ล้มแม้สภาพแวดล้อมไม่มี Image',
    (function () { try { run('ensureBackdropImage()'); return true; } catch (e) { return false; } })());

run("state.backdrop = { src: " + JSON.stringify(FAKE_IMG) + ", x: 120, y: 80, scale: 1.5, opacity: 0.5, locked: false };");
check('D3: ตั้งรูปแล้ว hasBackdrop() เป็นจริง', run('hasBackdrop()') === true);

const snap = run('buildProjectSnapshot()');
check('D4: รูปติดไปกับ snapshot ที่ใช้บันทึกไฟล์/คลัง',
    snap.backdrop && snap.backdrop.src === FAKE_IMG && snap.backdrop.x === 120 && snap.backdrop.scale === 1.5,
    JSON.stringify(snap.backdrop && { x: snap.backdrop.x, scale: snap.backdrop.scale }));
check('D5: snapshot เก็บเป็นสำเนา ไม่ใช่ตัวเดียวกับ state (กัน Undo กลายพันธุ์)',
    (function () { run('state.backdrop.x = 999;'); return snap.backdrop.x === 120; })(), snap.backdrop.x);

// โหลดกลับ
run('state.backdrop.x = 120;');
const snap2 = run('buildProjectSnapshot()');
run('state.backdrop = null;');
run('applyProjectData(' + JSON.stringify(snap2) + ')');
check('D6: โหลดโปรเจกต์กลับมาแล้วได้รูปและตำแหน่งเดิมครบ',
    run('hasBackdrop()') === true && run('state.backdrop.x') === 120 && run('state.backdrop.scale') === 1.5,
    JSON.stringify(run('({x: state.backdrop.x, scale: state.backdrop.scale})')));

// ลิงก์แชร์ต้องไม่มีรูป — ถ้าหลุดไปจะได้ URL ยาวหลายแสนตัวอักษรที่ส่งไม่ได้
const shareSnap = run('snapshotForShare()');
check('D7: snapshotForShare() ตัดรูปออกเสมอ', shareSnap.backdrop === null);
check('D8: ลิงก์แชร์จริงสั้นพอที่จะส่งได้ แม้โปรเจกต์จะมีรูปอยู่',
    run('buildShareUrl().length') < 30000, run('buildShareUrl().length') + ' ตัวอักษร');
check('D9: เปิดลิงก์แชร์กลับมาแล้วไม่มีรูป และไม่พังกลางทาง',
    (function () {
        // tryLoadFromUrl() อ่านจาก location.hash — ยิงผ่านทางเข้าจริงเหมือนตอนผู้ใช้เปิดลิงก์
        const url = run('buildShareUrl()');
        sandbox.location.hash = '#p=' + url.split('#p=')[1];
        run('state.backdrop = null;');
        const ok = run('tryLoadFromUrl()');
        sandbox.location.hash = '';
        return ok === true && run('hasBackdrop()') === false;
    })());

// ไฟล์ที่ถูกแก้มาให้ชี้รูปออกนอกเครื่อง ต้องไม่ถูกรับ
run('state.backdrop = null;');
const evil = Object.assign({}, snap2, { backdrop: { src: 'https://example.com/track.png', x: 0, y: 0, scale: 1, opacity: 0.5, locked: true } });
run('applyProjectData(' + JSON.stringify(evil) + ')');
check('D10: ไม่รับ src ที่ไม่ใช่ data URI (กันไฟล์นำเข้าสั่งยิง request ออกนอกเครื่อง)',
    run('hasBackdrop()') === false);

const evil2 = Object.assign({}, snap2, { backdrop: { src: 'data:text/html;base64,PHNjcmlwdD4=', x: 0, y: 0, scale: 1, opacity: 0.5, locked: true } });
run('applyProjectData(' + JSON.stringify(evil2) + ')');
check('D11: ไม่รับ data URI ที่ไม่ใช่รูป', run('hasBackdrop()') === false);

// ค่าที่เกินขอบเขตต้องถูกบีบกลับ ไม่ใช่ปล่อยผ่านจนวาดรูปใหญ่เท่าจอ 50 เท่า
const wild = Object.assign({}, snap2, { backdrop: { src: FAKE_IMG, x: 0, y: 0, scale: 999, opacity: 5, locked: true } });
run('applyProjectData(' + JSON.stringify(wild) + ')');
check('D12: scale/opacity ที่เกินขอบเขตถูกบีบกลับให้อยู่ในช่วงที่ใช้ได้',
    run('state.backdrop.scale') === 4 && run('state.backdrop.opacity') === 1,
    'scale=' + run('state.backdrop.scale') + ' opacity=' + run('state.backdrop.opacity'));

check('D13: กด CLEAR แล้วรูปถูกล้างไปด้วย',
    (function () { run('clearAll();'); return run('hasBackdrop()') === false; })());

/* ===== E. โหมดฝึกทำโจทย์ =====
   จุดที่ต้องคุมให้แน่นที่สุดคือ "เฉลยต้องไม่มีทางผิด" เพราะถ้าโปรแกรมเฉลยผิดแม้ครั้งเดียว
   ความน่าเชื่อถือของทั้งโปรเจกต์หายไปทันที เฉลยจึงต้องมาจาก solveVLSM() ตัวเดียวกับที่ใช้คำนวณจริง
   ไม่ใช่โค้ดชุดที่สองที่เขียนขึ้นมาต่างหาก */

check('E1: solveVLSM เป็นฟังก์ชันบริสุทธิ์ ไม่แตะ state ของหน้าจอ',
    (function () {
        run("clearAll(); state.baseIp='10.0.0.0'; state.baseCidr=24; state.departments=[{id:1,name:'A',hosts:20}]; refreshAll();");
        const before = run('JSON.stringify({ip:state.baseIp,cidr:state.baseCidr,calc:state.calculated.length})');
        run("solveVLSM('192.168.99.0', 26, [{id:9,name:'Z',hosts:5}])");
        return run('JSON.stringify({ip:state.baseIp,cidr:state.baseCidr,calc:state.calculated.length})') === before;
    })());

check('E2: calculateVLSM กับ solveVLSM ให้ผลตรงกันเป๊ะ (เฉลยใช้เครื่องเดียวกับของจริง)',
    (function () {
        run("clearAll(); loadExample('company');");
        const real = run('JSON.stringify(state.calculated.map(function(d){return d.name+"|"+d.subnet.network+"/"+d.subnet.cidr}))');
        const pure = run('JSON.stringify(solveVLSM(state.baseIp, state.baseCidr, state.departments).results.map(function(d){return d.name+"|"+d.subnet.network+"/"+d.subnet.cidr}))');
        return real === pure;
    })());

// โจทย์ที่สุ่มมาต้องแก้ได้จริงเสมอ ไม่มีแผนกที่จัดสรรไม่ลง
// วนหลายรอบเพราะเป็นการสุ่ม ถ้าทดสอบรอบเดียวอาจบังเอิญผ่าน
['easy', 'medium', 'hard'].forEach(function (lv) {
    let allOk = true, detail = '';
    for (let i = 0; i < 25; i++) {
        const p = run("generatePracticeProblem('" + lv + "')");
        const solved = run('solveVLSM(' + JSON.stringify(p.baseIp) + ',' + p.baseCidr + ',' + JSON.stringify(p.departments) + ')');
        if (solved.failed.length > 0 || p.answer.length !== p.departments.length) {
            allOk = false; detail = 'รอบที่ ' + i + ' มีแผนกจัดสรรไม่ลง ' + solved.failed.length + ' แผนก'; break;
        }
    }
    check('E3-' + lv + ': สุ่มโจทย์ 25 รอบ ต้องแก้ได้ครบทุกแผนกทุกรอบ', allOk, detail);
});

check('E4: โจทย์ใช้เลขตั้งต้นที่ปัดเป็นขอบ block แล้ว',
    (function () {
        for (let i = 0; i < 15; i++) {
            const p = run("generatePracticeProblem('medium')");
            if (run("normalizeNetwork(" + JSON.stringify(p.baseIp) + "," + p.baseCidr + ")") !== p.baseIp) return false;
        }
        return true;
    })());

// ตรวจคำตอบ
run("startPractice('easy');");
const prob = run('practiceState.problem');
check('E5: เริ่มฝึกแล้วมีโจทย์และเฉลยครบ',
    prob && prob.answer.length === 3 && prob.departments.length === 3, prob && prob.answer.length);

// กรอกถูกทุกช่อง
run(`(function(){
    practiceState.problem.answer.forEach(function(a){
        onPracticeInput(a.id, 'network', a.subnet.network);
        onPracticeInput(a.id, 'cidr', String(a.subnet.cidr));
        onPracticeInput(a.id, 'first', a.subnet.firstUsable);
        onPracticeInput(a.id, 'last', a.subnet.lastUsable);
        onPracticeInput(a.id, 'broadcast', a.subnet.broadcast);
    });
    checkPracticeAnswers();
})()`);
check('E6: กรอกถูกทุกช่องต้องได้เต็ม',
    run('practiceState.score.correct') === run('practiceState.score.total') && run('practiceState.score.total') === 15,
    run('practiceState.score.correct') + '/' + run('practiceState.score.total'));

// กรอกผิดหนึ่งช่อง
run(`(function(){
    var a = practiceState.problem.answer[0];
    onPracticeInput(a.id, 'broadcast', '1.2.3.4');
    checkPracticeAnswers();
})()`);
check('E7: ผิดหนึ่งช่อง ต้องหักแค่ช่องเดียว ไม่ตีตกทั้งแถว',
    run('practiceState.score.correct') === 14, run('practiceState.score.correct'));
check('E8: มีคำอธิบายบอกว่าพลาดตรงไหน ไม่ใช่แค่บอกว่าผิด',
    (function () {
        const id = run('practiceState.problem.answer[0].id');
        const hint = run('practiceState.score.byDept[' + id + '].hint');
        return typeof hint === 'string' && hint.indexOf('Broadcast') !== -1;
    })());

// ขนาดผิด ต้องได้คำอธิบายที่ตรงกับสาเหตุ ไม่ใช่คำอธิบายกลาง ๆ
run(`(function(){
    var a = practiceState.problem.answer[0];
    onPracticeInput(a.id, 'broadcast', a.subnet.broadcast);
    onPracticeInput(a.id, 'cidr', String(a.subnet.cidr + 1));
    checkPracticeAnswers();
})()`);
check('E9: ใส่ขนาดเล็กเกินไป คำอธิบายต้องพูดถึงการบวก 2 และการปัดขึ้น',
    (function () {
        const id = run('practiceState.problem.answer[0].id');
        const h = run('practiceState.score.byDept[' + id + '].hint') || '';
        return h.indexOf('บวกอีก 2') !== -1 && h.indexOf('ปัดขึ้น') !== -1;
    })(), run('practiceState.score.byDept[' + run('practiceState.problem.answer[0].id') + '].hint'));

check('E10: รับคำตอบที่มีช่องว่างหัวท้ายและเลขศูนย์นำหน้า',
    (function () {
        const a = run('practiceState.problem.answer[1]');
        const padded = a.subnet.network.split('.').map(function (x) { return x.length < 3 ? '0'.repeat(3 - x.length) + x : x; }).join('.');
        run("onPracticeInput(" + a.id + ", 'network', '  " + padded + "  ');");
        run('checkPracticeAnswers();');
        return run('practiceState.score.byDept[' + a.id + '].fields.network') === true;
    })());

check('E11: รับขนาดที่พิมพ์มาพร้อมเครื่องหมายทับนำหน้า',
    (function () {
        const a = run('practiceState.problem.answer[1]');
        run("onPracticeInput(" + a.id + ", 'cidr', '/" + a.subnet.cidr + "');");
        run('checkPracticeAnswers();');
        return run('practiceState.score.byDept[' + a.id + '].fields.cidr') === true;
    })());

check('E12: กดดูเฉลยแล้วสถานะเปลี่ยน และวิธีคิดทีละขั้นถูกสร้างขึ้น',
    (function () {
        run('revealPracticeAnswer();');
        return run('practiceState.revealed') === true && run('renderPracticeSteps()').indexOf('วิธีคิดทีละขั้น') !== -1;
    })());

check('E13: เปลี่ยนระดับความยากแล้วจำนวนแผนกเปลี่ยนตาม',
    (function () {
        run("startPractice('hard');");
        return run('practiceState.problem.departments.length') === 7 && run('practiceState.problem.baseCidr') === 22;
    })(), run('practiceState.problem.departments.length'));

check('E14: สุ่มโจทย์ใหม่ต้องล้างคำตอบและคะแนนเดิมทิ้ง',
    run('Object.keys(practiceState.answers).length') === 0 &&
    run('practiceState.score') === null && run('practiceState.checked') === false);

// ย้ายโจทย์ไปเป็นงานจริง
check('E15: เอาโจทย์ไปทำต่อเป็นงานจริงได้ และผลตรงกับเฉลย',
    (function () {
        run("startPractice('easy');");
        const p = run('practiceState.problem');
        run('usePracticeProblemAsProject();');
        if (run('state.departments.length') !== p.departments.length) return false;
        if (run('state.baseIp') !== p.baseIp || run('state.baseCidr') !== p.baseCidr) return false;
        // ผลที่คำนวณบนหน้าจอจริง ต้องตรงกับเฉลยของโจทย์ทุกวง
        const realNets = run('state.calculated.map(function(d){return d.subnet.network+"/"+d.subnet.cidr}).sort().join(",")');
        const ansNets = p.answer.map(function (a) { return a.subnet.network + '/' + a.subnet.cidr; }).sort().join(',');
        return realNets === ansNets;
    })());

check('E16: ชื่อแผนกในโจทย์เป็นชื่อที่ IOS รับได้ (ไม่ทำให้ CLI พังถ้าเอาไปทำต่อ)',
    (function () {
        for (let i = 0; i < 20; i++) {
            const p = run("generatePracticeProblem('hard')");
            for (const d of p.departments) {
                if (run('toCiscoName(' + JSON.stringify(d.name) + ', "X")') !== d.name) return false;
            }
        }
        return true;
    })());

/* ---------- E17-E20: หน้าฝึกทำโจทย์ต้องไม่ยาวเกินจำเป็น ----------
   ผู้ใช้จริงรายงานว่าอ่านข้อมูลในแท็บฝึกทำโจทย์ไม่ครบ แม้จะขยายแผงล่างจนสุดแล้ว
   สาเหตุที่แท้จริงไม่ใช่แผงเล็กเกินไป แต่คือตอนกดตรวจโดยยังไม่กรอกอะไรเลย
   ระบบขึ้นคำอธิบายข้อความเดียวกันซ้ำทุกแถว (ระดับยาก = 7 บรรทัด) ยาวกว่าตัวตารางเอง
   ทั้งที่ไม่ได้ให้ข้อมูลอะไรเพิ่มเลย เทสสี่ข้อนี้กันไม่ให้อาการนั้นกลับมา */

function practiceHtml() {
    run('renderPractice();');
    return getElementById('practiceBody').innerHTML;
}
function countHints(html) {
    return (html.match(/fa-lightbulb/g) || []).length;
}

run("startPractice('hard');");
run('checkPracticeAnswers();');
const blankHtml = practiceHtml();

check('E17: กดตรวจทั้งที่ยังไม่กรอกอะไรเลย ต้องไม่ขึ้นคำอธิบายซ้ำทุกแถว',
    countHints(blankHtml) === 0, countHints(blankHtml) + ' คำอธิบาย');

check('E18: แทนที่จะซ้ำ ให้บอกตรง ๆ ครั้งเดียวว่ายังไม่ได้กรอก',
    blankHtml.indexOf('ยังไม่ได้กรอกคำตอบสักช่อง') !== -1);

check('E19: พอลงมือตอบแล้วผิด คำอธิบายต้องขึ้นเฉพาะแถวนั้น',
    (function () {
        const a = run('practiceState.problem.answer[0]');
        run("onPracticeInput(" + a.id + ", 'network', '10.99.99.0');");
        run('checkPracticeAnswers();');
        return countHints(practiceHtml()) === 1;
    })(), countHints(practiceHtml()) + ' คำอธิบาย');

check('E20: ตอบผิดสองแผนก ก็ได้คำอธิบายสองแถว ไม่ใช่ทุกแถว',
    (function () {
        const b = run('practiceState.problem.answer[1]');
        run("onPracticeInput(" + b.id + ", 'cidr', '/31');");
        run('checkPracticeAnswers();');
        const n = countHints(practiceHtml());
        return n === 2 && run('practiceState.problem.departments.length') === 7;
    })(), countHints(practiceHtml()) + ' คำอธิบาย จาก 7 แถว');

/* ---------- E21-E25: ตัวอย่างร้านค้าปลีก และเพดานจริงของการขยายสาขา ----------
   ที่มา: ผู้ใช้ถามว่าจะอ้างอิงองค์กรค้าปลีกที่มี 350 สาขาได้ไหม จึงต้องรู้ก่อนว่า
   โปรแกรมรองรับได้จริงถึงไหน ตัวเลขในเทสชุดนี้คือตัวเลขที่วัดได้จริง ไม่ใช่ที่คาดว่าจะเป็น

   ผลที่วัดได้ตอนทดสอบ 350 สาขา:
     - WAN Pool ค่าเริ่มต้น 10.255.255.0/24 จองได้แค่ 64 ลิงก์ ต้องขยายเป็น /21 ถึงจะครบ 350
     - พอร์ตที่สร้างให้จะไล่ไปถึง Serial0/349/0 ซึ่งไม่มีอยู่จริงบน Router รุ่นใด
     - config ของ Router หลักยาว 2,855 บรรทัด (89 KB) วางลง Packet Tracer ไม่ไหว
     - Router สาขาทั้ง 350 ตัวถูกวางทับกันที่จุดเดียว ผังกว้าง 0 px คือดูอะไรไม่ได้เลย
     - เพดานที่แท้จริงคือ MAX_DEPARTMENTS ไม่ใช่จำนวน Router
       เพราะสาขาที่ไม่มีแผนกอยู่ข้างหลัง จะไม่มีวงเครือข่ายให้ HQ สร้างเส้นทางไปหา */

run("loadExample('retail');");

check('E21: ตัวอย่างร้านค้าปลีกโหลดครบ และจัดสรรลงทุกแผนก',
    run('state.departments.length') === 10 && run('state.failed.length') === 0,
    run('state.departments.length') + ' แผนก จัดสรรไม่ลง ' + run('state.failed.length'));

check('E22: สร้าง Router สาขา 3 ตัวพร้อมลิงก์ WAN ครบตั้งแต่โหลด',
    run("topoNodes.manualNodes.filter(function(n){return n.type==='router-branch'}).length") === 3 &&
    run('calculateWanLinks().length') === 3);

check('E23: ทุกสาขาได้ขนาดวงเท่ากัน (โครงสร้างสาขาเหมือนกันจริง)',
    (function () {
        const cidrs = run("state.calculated.filter(function(d){return /-(POS|Office)$/.test(d.name)}).map(function(d){return d.subnet.cidr})");
        return cidrs.length === 6 && cidrs.every(function (c) { return c === 28; });
    })(),
    run("state.calculated.filter(function(d){return /-(POS|Office)$/.test(d.name)}).map(function(d){return '/'+d.subnet.cidr}).join(' ')"));

run("switchTab('cli'); renderCLI();");
check('E24: HQ มีเส้นทางไปหาทุกวงที่อยู่หลังสาขา ครบ 6 เส้น',
    (cliText(getElementById('cliRouterOutput').innerHTML).match(/ip route/g) || []).length === 6,
    (cliText(getElementById('cliRouterOutput').innerHTML).match(/ip route/g) || []).length + ' เส้น');

/* เพดานจริงของการขยายสาขา — ข้อนี้คือคำตอบของคำถาม "รองรับ 350 สาขาไหม"
   วาง Router เพิ่มได้ไม่จำกัดจริง แต่สาขาที่ไม่มีแผนกอยู่ข้างหลังคือกล่องเปล่า
   HQ จะไม่มีเส้นทางไปหาอะไรเลย จำนวนสาขาที่ "ใช้งานได้จริง" จึงถูกจำกัดด้วยจำนวนแผนก */
check('E25: สาขาที่ยังไม่มีแผนกอยู่ข้างหลัง ต้องไม่ทำให้ HQ มีเส้นทางเพิ่ม',
    (function () {
        const before = (cliText(getElementById('cliRouterOutput').innerHTML).match(/ip route/g) || []).length;
        run(`
          var n = addManualNode(BranchRouterDevice, 400, 500);
          n.label = 'Store-Empty';
          topoNodes.links.push({ id: 'WX', fromId: 'router', toId: n.id });
          refreshAll(true);
        `);
        run("switchTab('cli'); renderCLI();");
        const after = (cliText(getElementById('cliRouterOutput').innerHTML).match(/ip route/g) || []).length;
        return before === 6 && after === 6 && run('MAX_DEPARTMENTS') === 12;
    })(),
    'เพดานแผนก ' + run('MAX_DEPARTMENTS') + ' แผนก จึงมีสาขาที่มีเครือข่ายจริงได้สูงสุด 11 สาขา');

/* ---------- E26-E28: ชื่อบนผังต้องแยกออกจากกันได้ และภาษาต้องสม่ำเสมอ ----------
   ที่มา: ผู้ใช้ส่งภาพผังมาแล้วบอกว่า "ไม่รู้ว่า branch ตัวไหนเป็นของตัวไหน เพราะชื่อไม่เหมือนกัน"
   สาเหตุคือกล่องบนผังใส่ได้แค่ 10 ตัวอักษร แต่ชื่อที่ใช้ยาว 15-20 ตัว
   โค้ดเดิมย่อโดยตัดจากท้ายแล้วเติมจุด ซึ่งตัดทิ้งเฉพาะส่วนที่ใช้แยกความต่างพอดี
   ผลคือ Store-Ladprao-Office, Store-Rangsit-Office และ Store-Korat-Office
   ออกมาเป็น Sto..ffice เหมือนกันทั้งสามใบ ดูผังแล้วแยกไม่ออกเลยว่าใบไหนเป็นของสาขาไหน

   เทสข้อ E26 เป็นแบบ "ต้องไม่มีอะไรชนกันเลย" ซึ่งจับได้ทั้งชื่อที่มีอยู่ตอนนี้
   และชื่อที่จะเพิ่มเข้ามาในอนาคต ไม่ต้องไล่เขียนเทสทีละคู่ */

// จำลองการวัดความกว้างแบบฟอนต์โมโนสเปซ 14px ซึ่งเป็นฟอนต์จริงที่ใช้บนผัง
const monoCtx = { measureText: (t) => ({ width: String(t).length * 8.4 }) };
const DEPT_TEXT_W = 132 - 42;   // กล่องแผนกกว้าง 132 หักที่ของไอคอนออก

const collisions = [];
Object.keys(run('EXAMPLES')).forEach(function (key) {
    const names = run('EXAMPLES["' + key + '"].departments.map(function(d){return d.name})');
    const seen = {};
    names.forEach(function (n) {
        const shown = run('wrapLabel')(monoCtx, n, DEPT_TEXT_W, 2).join('↓');
        if (seen[shown]) collisions.push(key + ': ' + seen[shown] + ' กับ ' + n + ' -> "' + shown.replace('↓', ' / ') + '"');
        seen[shown] = n;
    });
});
check('E26: ไม่มีชื่อแผนกคู่ไหนในตัวอย่างเดียวกันที่แสดงบนผังออกมาเหมือนกัน',
    collisions.length === 0,
    collisions.length ? collisions.join('  |  ') : 'ตรวจครบทุกชุดตัวอย่าง ไม่มีคู่ไหนชนกัน');

/* ชื่อยาวต้องขึ้นสองบรรทัดแทนการย่อทิ้ง และต้องพยายามตัดที่ขีดกลางก่อน
   เพราะชื่ออุปกรณ์เครือข่ายใช้ขีดคั่นส่วนที่มีความหมาย ตัดตรงนั้นแล้วยังอ่านรู้เรื่องทั้งสองบรรทัด */
check('E27: ชื่อยาวขึ้นสองบรรทัดโดยตัดที่ขีดกลาง ไม่ใช่ตัดกลางคำ',
    (function () {
        const w = run('wrapLabel');
        const a = w(monoCtx, 'Ladprao-Office', DEPT_TEXT_W, 2);
        const b = w(monoCtx, 'North-Warehouse', DEPT_TEXT_W, 2);
        return a.length === 2 && a[0] === 'Ladprao' && a[1] === 'Office'
            && b.length === 2 && b[0] === 'North' && b[1] === 'Warehouse';
    })(),
    run('wrapLabel')(monoCtx, 'Ladprao-Office', DEPT_TEXT_W, 2).join(' / '));

/* ภาษาของป้ายชื่อชุดตัวอย่าง — ตอนนี้กำหนดให้เป็นภาษาไทยทั้งหมดก่อน
   ส่วนชื่อแผนกยังเป็นภาษาอังกฤษ เพราะถูกนำไปสร้างเป็นคำสั่ง Cisco ซึ่งรับเฉพาะตัวอักษรอังกฤษ
   ถ้าเปลี่ยนชื่อแผนกเป็นไทย toCiscoName() จะตัดจนเหลือค่าว่างแล้วใช้ชื่อสำรอง DEPT-<id> แทน */
const notThai = Object.keys(run('EXAMPLES')).filter(function (k) {
    return !/[฀-๿]/.test(run('EXAMPLES["' + k + '"].label'));
});
check('E28: ป้ายชื่อชุดตัวอย่างทุกชุดเป็นภาษาไทย',
    notThai.length === 0,
    notThai.length ? 'ยังเป็นอังกฤษ: ' + notThai.join(', ') : 'ครบทั้ง ' + Object.keys(run('EXAMPLES')).length + ' ชุด');

const noHint = Object.keys(run('EXAMPLES')).filter(function (k) { return !run('EXAMPLES["' + k + '"].hint'); });
check('E29: ทุกชุดตัวอย่างมีคำอธิบายกำกับว่าใช้ดูอะไร',
    noHint.length === 0,
    noHint.length ? 'ยังไม่มีคำอธิบาย: ' + noHint.join(', ') : 'ครบทุกชุด');

/* ---------- E30-E34: เมนูตัวอย่างแบบแบ่งหน้า ----------
   ที่มา: พอมี 9 ชุด เมนูสูงรวม 1,202px แต่จอมีที่ให้ราว 950px
   และ .example-dropdown ตั้ง overflow: hidden ไว้ ส่วนที่เกินจึงถูกตัดทิ้ง
   ไม่ใช่แค่ล้นแล้วเลื่อนดูได้ ผลคือชุดสุดท้ายกดเลือกไม่ได้เลยและไม่มีอะไรบอก

   E33 คือข้อที่สำคัญที่สุด เพราะถามว่า "ทุกชุดยังเข้าถึงได้จริงไหม"
   ซึ่งเป็นคำถามที่ถ้าเคยถามไว้ตั้งแต่แรก จะจับบั๊กเดิมได้ทันทีที่เพิ่มชุดที่ 9 */

run('examplePage = 0; buildExampleDropdown();');
const menuHtml = () => getElementById('exampleDropdown').innerHTML;
const itemsOnPage = () => (menuHtml().match(/class="ex-item"/g) || []).length;

check('E30: เมนูแสดงทีละ 3 ชุด ไม่ใช่ทั้งหมดพร้อมกัน',
    itemsOnPage() === 3 && run('EX_PER_PAGE') === 3,
    'หน้านี้มี ' + itemsOnPage() + ' ชุด');

check('E31: กดถัดไปแล้วเปลี่ยนหน้าจริง และวนกลับมาต้นเมื่อเลยชุดสุดท้าย',
    (function () {
        const first = menuHtml();
        run('changeExamplePage(1);');
        const second = menuHtml();
        if (first === second) return false;
        const total = Math.ceil(Object.keys(run('EXAMPLES')).length / run('EX_PER_PAGE'));
        run('changeExamplePage(' + (total - 1) + ');');   // เดินต่อจนครบรอบ
        return menuHtml() === first && run('examplePage') === 0;
    })());

check('E32: ชี้เมาส์ที่ชุดตัวอย่างแล้วขึ้นรายชื่อแผนกและช่วง IP ตั้งต้น',
    (function () {
        run("showExampleDetail('retail');");
        const d = getElementById('exampleDetail').innerHTML;
        return d.indexOf('HQ-IT') !== -1 && d.indexOf('10.40.0.0/23') !== -1;
    })(),
    getElementById('exampleDetail').innerHTML.replace(/<[^>]*>/g, '').slice(0, 60));

/* ข้อนี้เป็นแบบ "ต้องครบ ไม่มีตกหล่น" จึงคุมทุกชุดที่จะเพิ่มเข้ามาในอนาคตด้วย */
check('E33: เดินครบทุกหน้าแล้วต้องเจอชุดตัวอย่างครบทุกชุด ไม่มีชุดไหนกดไม่ถึง',
    (function () {
        const all = Object.keys(run('EXAMPLES'));
        const total = Math.ceil(all.length / run('EX_PER_PAGE'));
        const found = new Set();
        run('examplePage = 0; buildExampleDropdown();');
        for (let i = 0; i < total; i++) {
            const html = menuHtml();
            all.forEach(function (k) { if (html.indexOf("loadExample('" + k + "')") !== -1) found.add(k); });
            run('changeExamplePage(1);');
        }
        return found.size === all.length;
    })(),
    'ตรวจครบ ' + Object.keys(run('EXAMPLES')).length + ' ชุด');

check('E34: มีปุ่มเปลี่ยนหน้าและป้ายบอกว่ากำลังดูชุดที่เท่าไร',
    menuHtml().indexOf('changeExamplePage(-1)') !== -1 &&
    menuHtml().indexOf('changeExamplePage(1)') !== -1 &&
    /จาก \d+/.test(menuHtml()));

/* ---------- สรุปผล ---------- */
let pass = 0;
results.forEach(r => {
    if (r.pass) pass++;
    console.log((r.pass ? 'PASS' : 'FAIL') + ' — ' + r.label + (r.detail ? '  [' + r.detail + ']' : ''));
});
console.log('\n' + pass + '/' + results.length + ' passed — ' + new Date().toISOString());
process.exit(pass === results.length ? 0 : 1);

})();
