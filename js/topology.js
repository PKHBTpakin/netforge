/* ============================================
   3. Topology — วาดผังเครือข่ายบน Canvas
   ============================================ */

let canvas, ctx, cW, cH, dpr;
let topoNodes = { router: null, switches: [], departments: [], manualNodes: [], links: [] };
let nextManualNodeId = 1;
let nextLinkId = 1;
let particles = [];
let dragInfo = null;
let hoverInfo = null;
let animFrame = null;

/* ----- มุมมอง: ย่อ/ขยาย และเลื่อนผัง -----
   พอวาง Router สาขาได้หลายตัว ผังจะกว้างเกินกรอบ Canvas จนกล่องทับกันจนอ่านไม่ออก
   จึงแยก "พิกัดจริงของโหนด" (world) ออกจาก "พิกัดบนจอ" (screen)
     screen = world * viewZoom + pan
     world  = (screen - pan) / viewZoom
   ตำแหน่งโหนดทุกตัวยังเก็บเป็น world เหมือนเดิมทั้งหมด จึงไม่กระทบไฟล์บันทึกหรือโค้ดคำนวณเดิมเลย */
let viewZoom = 1;
let viewPanX = 0, viewPanY = 0;
let panInfo = null; // { startX, startY, panX, panY } ระหว่างลากพื้นที่ว่างเพื่อเลื่อนผัง
let backdropDrag = null; // { offsetX, offsetY } ระหว่างลากรูปแปลนอาคารตอนปลดล็อก

// รูปพื้นหลังกินพื้นที่ตรงจุดนี้ไหม (พิกัด world) — ใช้ตัดสินว่าคลิกพื้นที่ว่างคือ "เลื่อนผัง" หรือ "เลื่อนรูป"
function hitBackdrop(x, y) {
    if (typeof backdropImg === 'undefined' || !backdropImg || !state.backdrop) return false;
    const b = state.backdrop;
    const s = Math.max(0.05, Number(b.scale) || 1);
    return x >= b.x && x <= b.x + backdropImg.naturalWidth * s &&
           y >= b.y && y <= b.y + backdropImg.naturalHeight * s;
}
const ZOOM_MIN = 0.35, ZOOM_MAX = 2.5;

/* ชุดสีประจำแผนก — ขยายจาก 8 เป็น 12 สีตอนปลดเพดานจำนวนแผนก
   ไม่ได้เลือกด้วยสายตา แต่คัดด้วยการคำนวณ: เริ่มจากชุดผู้สมัครหลายสิบสี แล้วเลือกชุดที่
   "ระยะห่างต่ำสุดระหว่างสีคู่ใด ๆ ในปริภูมิ CIE Lab" มากที่สุด ภายใต้เงื่อนไข
     1. contrast >= 4.5:1 บนทั้งพื้นหลังและการ์ดของธีมตัวเอง (WCAG AA)
     2. ต้องห่างจากสีอุปกรณ์คงที่ (Router/PC/Server/Router สาขา) พอสมควร ไม่งั้นบนผังจะแยกไม่ออก
   ผลที่ได้ Dark ระยะคู่ใกล้สุดดีขึ้นจาก 11.3 เป็น 27.6 (ชุดเดิมมีม่วงสองเฉดที่ใกล้กันจนแทบแยกไม่ออก)
   Light ได้ 17.6 ซึ่งยังดีกว่าชุดเดิมที่ 17.2 (สีเข้มบนพื้นขาวเบียดกันเองในปริภูมิสีโดยธรรมชาติ) */
const DEPT_COLORS_DARK = ['#FDE047','#E879F9','#67E8F9','#F87171','#A5B4FC','#86EFAC','#F97316','#D4A574','#A3E635','#F9A8D4','#CBD5E1','#14B8A6'];
const DEPT_COLORS_LIGHT = ['#025580','#B91C1C','#6D28D9','#701A75','#0F766E','#A21CAF','#7F1D1D','#312E81','#334155','#6B21A8','#9A3412','#134E4A'];
let DEPT_COLORS = DEPT_COLORS_DARK; // applyTheme() ใน ui.js สลับให้เมื่อ toggle โหมด

// สี "chrome" ของ Canvas เอง (ไม่ใช่สีอุปกรณ์) — กล่อง Node / เส้น grid / ตัวหนังสือ label หลัก
// วาดด้วยค่าตรงๆ ใน ctx.fillStyle ไม่ผ่าน CSS เลย เลยต้องมีตัวแปรคู่ขนานแบบนี้ให้ applyTheme() สลับ
// สีเตือน — จงใจ "ไม่" ผูกกับระบบธีม เพราะความหมายของมันคือ "มีอะไรผิด" ซึ่งต้องอ่านออกเหมือนกัน
// ทั้ง Light และ Dark เหลืองอำพันตัวนี้ผ่าน contrast 4.5:1 บนพื้นทั้งสองโหมด และไม่ชนกับสีแผนก 12 สี
const CANVAS_WARN_COLOR = '#f0a020';
let CANVAS_BOX_BG = 'rgba(15,17,21,0.95)';
let CANVAS_GRID_COLOR = 'rgba(0,212,255,0.04)';
let CANVAS_LABEL_COLOR = '#e0e0f0';

function setupCanvas() {
    canvas = document.getElementById('topoCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
}

function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const oldW = cW, oldH = cH;
    cW = rect.width;
    cH = rect.height;
    canvas.width = cW * dpr;
    canvas.height = cH * dpr;
    canvas.style.width = cW + 'px';
    canvas.style.height = cH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!topoNodes.router) {
        layoutTopology(); // ครั้งแรกที่ยังไม่มี node เลย ต้องจัด layout เต็มรูปแบบ
        return;
    }
    /* ตอนกดปุ่มขยายแผงล่าง ผังจะถูกบีบจนเกือบหาย ซึ่งไม่ใช่การ "ย่อผัง" แต่คือการ "พับผังเก็บ"
       ถ้าปล่อยให้ย่อตำแหน่งตามสัดส่วนด้วย ทุกโหนดจะถูกอัดกองรวมกันที่ขอบบน
       แล้วตอนกดย่อแผงกลับ ผังที่ผู้ใช้อุตส่าห์ลากจัดไว้ก็จะเพี้ยนไปเลย
       จึงถือว่าถ้าสูงไม่ถึง 120px คือกำลังพับเก็บ ให้จำตำแหน่งเดิมไว้เฉย ๆ */
    const COLLAPSED_H = 120;
    if (cH < COLLAPSED_H || oldH < COLLAPSED_H) { requestRedraw(); return; }

    // ปรับตำแหน่ง node ตามสัดส่วนใหม่แทนการรื้อสร้างใหม่ทั้งหมด
    // แก้ปัญหาลูกศรกระตุก/รีเซ็ตตอนลากแถบปรับขนาด (resizer)
    if (oldW && oldH && (oldW !== cW || oldH !== cH)) {
        const sx = cW / oldW, sy = cH / oldH;
        topoNodes.router.x *= sx; topoNodes.router.y *= sy;
        topoNodes.switches.forEach(n => { n.x *= sx; n.y *= sy; });
        topoNodes.departments.forEach(n => { n.x *= sx; n.y *= sy; });
        topoNodes.manualNodes.forEach(n => { n.x *= sx; n.y *= sy; }); // PC/Server ต้องขยับตามสัดส่วนเหมือน node อื่นๆ ไม่งั้นจะหลุดตำแหน่งหลัง resize
        updateParticlePositions();
    }
    requestRedraw();
}

// layoutTopology(force)
// เดิมฟังก์ชันนี้สร้าง Router/Switch/Department ใหม่หมดทุกครั้งที่ถูกเรียก และ refreshAll() ก็เรียกมันทุกครั้ง
// ที่ state เปลี่ยน ผลคือแค่พิมพ์ชื่อแผนกเพิ่ม 1 ตัวอักษร ตำแหน่งทุกโหนดที่ผู้ใช้อุตส่าห์ลากจัดไว้ก็เด้งกลับหมด
// ตอนนี้จึงจำตำแหน่งเดิมไว้ตาม id แล้วคืนให้โหนดที่ "ยังเป็นตัวเดิม" หลังสร้างใหม่
// โหนดที่เพิ่งเกิด (แผนกใหม่) ยังได้ตำแหน่งตามผังมาตรฐานเหมือนเดิม
// force = true -> ทิ้งตำแหน่งเดิมทั้งหมด จัดผังใหม่จากศูนย์ (ปุ่ม RESET / Clear / โหลด Example)
function layoutTopology(force) {
    const prev = {};
    if (!force) {
        if (topoNodes.router) prev['router'] = { x: topoNodes.router.x, y: topoNodes.router.y };
        topoNodes.switches.forEach(n => { prev[n.id] = { x: n.x, y: n.y }; });
        topoNodes.departments.forEach(n => { prev[n.id] = { x: n.x, y: n.y }; });
    }

    const rX = cW / 2, rY = 65;
    topoNodes.router = new RouterDevice(rX, rY);
    if (prev['router']) { topoNodes.router.x = prev['router'].x; topoNodes.router.y = prev['router'].y; }

    const depts = state.calculated;
    const count = depts.length;
    topoNodes.switches = [];
    topoNodes.departments = [];
    if (count === 0) { createParticles(); requestRedraw(); return; }

    // minSpacing ต้องไม่น้อยกว่าความกว้างกล่อง ไม่งั้นกล่องที่อยู่ติดกันจะซ้อนทับกันเอง
    // เดิมตั้งไว้ 100 ทั้งที่กล่องแผนกกว้าง 132 -> ตั้งแต่ 8 แผนกขึ้นไปบนจอกว้าง 1024
    // กล่องจะเริ่มกินกันเอง และที่ 12 แผนก (เพดานของแอป) ทับกันถึง 32px จนอ่านชื่อไม่ออก
    // ปล่อยให้ผังกว้างเกินกรอบดีกว่าให้กล่องทับกัน เพราะตอนนี้ผังย่อ/เลื่อน/จัดพอดีกรอบได้แล้ว
    // (ปุ่ม ⛶ / Ctrl+F เรียก zoomToFit ซึ่งจัดการกรณีผังกว้างให้อยู่แล้ว)
    const DEPT_BOX_W = 132;
    const maxSpacing = 180, minSpacing = DEPT_BOX_W + 14;
    let spacing = maxSpacing;
    if ((count - 1) * maxSpacing > cW - 160) spacing = Math.max(minSpacing, (cW - 160) / (count - 1));
    const startX = cW / 2 - (count - 1) * spacing / 2;

    /* ลำดับ "ตำแหน่งบนจอ" ของแผนก — จัดกลุ่มตาม Router ที่ดูแล
       state.calculated เรียงตามจำนวน host มากไปน้อย (จำเป็นต่อการแจก subnet ห้ามแตะ)
       แต่ลำดับนั้นทำให้แผนกของสาขาเดียวกันกระจัดกระจายอยู่คนละมุมของแถว
       เส้นจากสาขาจึงต้องลากพาดข้ามผังไปหาแผนกของตัวเองทีละเส้น จนดูเหมือนเส้นพันกันมั่ว
       ตรงนี้เรียงใหม่เฉพาะ "ลำดับการวางตำแหน่ง" โดยไม่แตะ state.calculated เลย
       ผลคือแผนกของ Router เดียวกันอยู่ติดกัน เส้นสั้นลงและแทบไม่ตัดกัน
       ส่วน subnet/VLAN/สี ยังผูกกับ dept.id เหมือนเดิมทุกประการ ไม่มีอะไรเปลี่ยนค่า */
    const ownerOrder = new Map(); // routerId -> ลำดับกลุ่ม ('' = Router หลัก มาก่อนเสมอ)
    ownerOrder.set('', 0);
    const layoutDepts = depts.slice().sort((a, b) => {
        const oa = (typeof getDeptOwnerRouter === 'function' && getDeptOwnerRouter(a.id)) || null;
        const ob = (typeof getDeptOwnerRouter === 'function' && getDeptOwnerRouter(b.id)) || null;
        const ka = oa ? oa.id : '', kb = ob ? ob.id : '';
        if (!ownerOrder.has(ka)) ownerOrder.set(ka, ownerOrder.size);
        if (!ownerOrder.has(kb)) ownerOrder.set(kb, ownerOrder.size);
        const d = ownerOrder.get(ka) - ownerOrder.get(kb);
        // กลุ่มเดียวกัน -> คงลำดับเดิม (host มากไปน้อย) เพื่อให้ผังนิ่ง ไม่สลับไปมาทุกครั้งที่คำนวณใหม่
        return d !== 0 ? d : depts.indexOf(a) - depts.indexOf(b);
    });

    layoutDepts.forEach((dept, i) => {
        const x = startX + i * spacing;
        const color = getDeptColor(dept.id); // ผูกกับแผนก ไม่ใช่ลำดับ (ดู getDeptColor ใน devices.js)

        const sw = new SwitchDevice(dept, x, 200, color);
        const swPrev = prev[sw.id];
        if (swPrev) { sw.x = swPrev.x; sw.y = swPrev.y; }
        topoNodes.switches.push(sw);

        const deptNode = {
            id: 'dept-' + dept.id, type: 'department', deptId: dept.id,
            x, y: 350, w: 132, h: 60, label: dept.name, hosts: dept.hosts, color,
            subnet: dept.subnet
        };
        const dPrev = prev[deptNode.id];
        if (dPrev) { deptNode.x = dPrev.x; deptNode.y = dPrev.y; }
        topoNodes.departments.push(deptNode);
    });
    createParticles();
    requestRedraw();
}

// เรียกจาก applyTheme() ตอนสลับ Light/Dark — อัปเดตแค่สี "ในตัว" node ที่มีอยู่แล้ว
// ไม่รื้อ/สร้างใหม่เหมือน layoutTopology() เพราะจะทำให้ตำแหน่งที่ผู้ใช้ลากเองหายหมด
function recolorTopology() {
    if (topoNodes.router) topoNodes.router.color = ROUTER_COLOR;
    topoNodes.switches.forEach(sw => { sw.color = getDeptColor(sw.deptId); });
    topoNodes.departments.forEach(d => { d.color = getDeptColor(d.deptId); });
    topoNodes.manualNodes.forEach(n => {
        n.color = n.type === 'pc' ? PC_COLOR : (n.type === 'router-branch' ? BRANCH_COLOR : SERVER_COLOR);
    });
    // particles (ลูกศรวิ่ง) เก็บสีเป็น string ไว้ตรงๆ ไม่ใช่ reference ที่ตามสีแผนกเองอัตโนมัติ
    // updateParticlePositions() คำนวณ getConnections() ใหม่แล้วอัปเดตทั้งตำแหน่ง+สีให้ตรงกับ sw.color/d.color ปัจจุบันอยู่แล้ว
    // เรียกซ้ำตรงนี้ได้เลย ตำแหน่งจะเท่าเดิม (ยังไม่ขยับ) แต่สีจะตรงกับที่เพิ่งทาใหม่ด้านบน
    updateParticlePositions();
    requestRedraw();
}

// รวมสายอัตโนมัติกับสายที่ผู้ใช้ลากเองไว้ที่เดียว เพื่อให้ทั้งการวาดเส้นและลูกศรวิ่งใช้ชุดเดียวกันเสมอ
// เดิม particle สร้างจาก getConnections() อย่างเดียว -> สายที่ผู้ใช้ลากเอง (PC/Server และลิงก์ WAN)
// ถูกวาดเป็นเส้นแต่ไม่มีลูกศรวิ่งเลย ดูเหมือนสายนั้น "ไม่ทำงาน"
function getAllConnections() {
    return getConnections().concat(typeof getManualConnections === 'function' ? getManualConnections() : []);
}

function createParticles() {
    particles = [];
    getAllConnections().forEach(c => {
        for (let i = 0; i < 3; i++) {
            particles.push({
                // กลับมาใช้ c.color (สีตามแผนก) ตามที่ผู้ใช้ยืนยัน — ช่วยแยกได้ว่าลูกศรวิ่งอยู่บนสายไหนตอนมีหลายโหนด
                // ตัดปัญหา "ลายตา" ด้วยการเอา glow ออกแทน (ดู drawFlowArrows) ไม่ใช่ลดสี
                sx: c.sx, sy: c.sy, ex: c.ex, ey: c.ey,
                progress: i / 3, speed: 0.004 + Math.random() * 0.003, color: c.color
            });
        }
    });
}

// อัปเดตแค่ปลายเส้นของ particle เดิม ไม่รีเซ็ต progress/speed
// ใช้ตอน resize หรือลาก node เพื่อไม่ให้ลูกศรกระตุก/รีสตาร์ทระหว่างลาก
function updateParticlePositions() {
    const conns = getAllConnections();
    // จำนวนสายเปลี่ยนไป (เพิ่ม/ลบลิงก์) -> ต้องสร้าง particle ชุดใหม่ ไม่ใช่แค่ขยับปลายเส้นของชุดเดิม
    if (particles.length !== conns.length * 3) { createParticles(); return; }
    conns.forEach((c, ci) => {
        for (let i = 0; i < 3; i++) {
            const p = particles[ci * 3 + i];
            if (p) { p.sx = c.sx; p.sy = c.sy; p.ex = c.ex; p.ey = c.ey; p.color = c.color; }
        }
    });
}

function getConnections() {
    const conns = [];
    const r = topoNodes.router;
    if (!r) return conns;
    topoNodes.switches.forEach(sw => {
        // แผนกที่ถูกลากไปเชื่อมกับ Router สาขาแล้ว ถือว่าย้ายไปอยู่สาขานั้น
        // ไม่ต้องลากสายจาก Router หลักซ้ำอีก (ไม่งั้นจะกลายเป็นวงลูปที่ไม่มีความหมายในแบบจำลอง)
        // สายไปสาขาจะถูกวาดโดย getManualConnections() จากลิงก์ที่ผู้ใช้ลากเองอยู่แล้ว
        if (typeof getDeptOwnerRouter === 'function' && getDeptOwnerRouter(sw.deptId)) return;
        conns.push({ sx: r.x, sy: r.y + r.h/2, ex: sw.x, ey: sw.y - sw.h/2, color: sw.color });
    });
    topoNodes.switches.forEach(sw => {
        const dept = topoNodes.departments.find(d => d.deptId === sw.deptId);
        if (dept) conns.push({ sx: sw.x, sy: sw.y + sw.h/2, ex: dept.x, ey: dept.y - dept.h/2, color: dept.color });
    });
    return conns;
}

/* ============================================
   3b. Manual Topology — PC/Server ที่ผู้ใช้วางเอง + เส้นเชื่อมที่ลากเอง
   ต่างจาก switches/departments ตรงที่ไม่ auto-generate จาก state.calculated
   ผู้ใช้เป็นคนสร้าง/ลบ/เชื่อมเอง จึงต้องมี id counter และ CRUD ของตัวเอง
   ยังไม่ผูกกับ UI/Canvas ใดๆ ในขั้นนี้ — จะต่อสายในขั้นที่ 3 (Split-Pane/Canvas UI)
   ============================================ */

function addManualNode(DeviceClass, x, y) {
    const id = 'm-' + (nextManualNodeId++);
    const node = new DeviceClass(id, x, y);
    topoNodes.manualNodes.push(node);
    return node;
}

// เรียกหลังลบสาย/ลบอุปกรณ์ เพื่อให้ผลคำนวณ WAN และลูกศรตรงกับผังทันที
function refreshAfterTopologyChange() {
    if (typeof refreshAll === 'function') refreshAll();
    else { createParticles(); requestRedraw(); }
}

function removeManualNode(id) {
    topoNodes.manualNodes = topoNodes.manualNodes.filter(n => n.id !== id);
    // ลบเส้นเชื่อมที่ค้างอยู่กับ node นี้ไปด้วย ป้องกัน Link ชี้ไปหา id ที่ไม่มีอยู่จริงแล้ว (dangling reference)
    topoNodes.links = topoNodes.links.filter(l => l.fromId !== id && l.toId !== id);
    refreshAfterTopologyChange();
}

// เก็บเหตุผลล่าสุดจาก addLink() ไว้ให้ผู้เรียกใช้ (มือถือ mousedown handler) แสดง toast ที่เจาะจงกว่าแค่ "สำเร็จ/ไม่สำเร็จ"
let lastLinkMessage = null;

// ตรวจว่าคู่อุปกรณ์ที่จะเชื่อมสมเหตุสมผลตามหลักปฏิบัติไหม
// คืน ok:false = ห้ามเชื่อมเด็ดขาด (ผิดหลักการจนไม่มีความหมายในแบบจำลอง)
// คืน ok:true พร้อม message = เชื่อมได้ แต่เตือนไว้ว่าไม่ตรงตามที่นิยมทำจริง
function validateLink(a, b) {
    if (a.type === 'department' || b.type === 'department') {
        return { ok: false, message: 'Department ไม่ใช่อุปกรณ์จริง เชื่อมกับ Switch ของแผนกนั้นแทน' };
    }
    const isEndDevice = t => t === 'pc' || t === 'server';
    const isRouter = t => t === 'router' || t === 'router-branch';

    // ----- ลิงก์ WAN: Router ต่อ Router -----
    if (isRouter(a.type) && isRouter(b.type)) {
        return { ok: true, message: 'ลิงก์ WAN — ระบบจองซับเน็ต /30 ให้อัตโนมัติ ดูเลข IP ได้ที่แท็บ IP Table' };
    }

    // ----- Switch ย้ายไปอยู่กับ Router สาขา -----
    if ((a.type === 'router-branch' && b.type === 'switch') || (b.type === 'router-branch' && a.type === 'switch')) {
        const sw = a.type === 'switch' ? a : b;
        const branch = a.type === 'router-branch' ? a : b;
        // Switch หนึ่งตัวขึ้นกับ Router ได้ตัวเดียว ไม่งั้น CLI จะกำหนด gateway ซ้ำสองที่
        const existing = typeof getDeptOwnerRouter === 'function' ? getDeptOwnerRouter(sw.deptId) : null;
        if (existing && existing.id !== branch.id) {
            return { ok: false, message: 'แผนกนี้อยู่กับ ' + existing.label + ' อยู่แล้ว — ลบสายเดิมออกก่อนถ้าจะย้าย' };
        }
        return { ok: true, message: 'ย้ายแผนกนี้ไปอยู่หลัง ' + branch.label + ' แล้ว — สายจาก Router หลักถูกตัดออกอัตโนมัติ' };
    }

    // Router หลักกับ Switch เชื่อมกันอยู่แล้วโดยอัตโนมัติ ไม่ต้องลากเพิ่ม
    if ((a.type === 'router' && b.type === 'switch') || (b.type === 'router' && a.type === 'switch')) {
        return { ok: false, message: 'Switch เชื่อมกับ Router หลักอยู่แล้วโดยอัตโนมัติ — ถ้าจะย้ายไปสาขา ให้ลากไปที่ Router สาขาแทน' };
    }

    if ((isRouter(a.type) && isEndDevice(b.type)) || (isRouter(b.type) && isEndDevice(a.type))) {
        return { ok: true, message: 'ปกติ PC/Server จะไม่เชื่อมตรงกับ Router ควรผ่าน Switch — เชื่อมให้ตามที่สั่งแล้ว' };
    }
    if (isEndDevice(a.type) && isEndDevice(b.type)) {
        return { ok: true, message: 'การเชื่อม PC/Server ตรงกันมักใช้เฉพาะกรณีพิเศษ ตรวจสอบให้แน่ใจว่าตั้งใจ' };
    }
    return { ok: true, message: null };
}

function addLink(fromId, toId) {
    lastLinkMessage = null;
    if (!fromId || !toId || fromId === toId) { lastLinkMessage = 'ไม่สามารถเชื่อมอุปกรณ์กับตัวเองได้'; return null; }
    const a = findNodeById(fromId), b = findNodeById(toId);
    if (!a || !b) { lastLinkMessage = 'ไม่พบอุปกรณ์ที่จะเชื่อม'; return null; }
    const exists = topoNodes.links.some(l =>
        (l.fromId === fromId && l.toId === toId) || (l.fromId === toId && l.toId === fromId));
    if (exists) { lastLinkMessage = 'เชื่อมสองอุปกรณ์นี้ไว้อยู่แล้ว'; return null; }

    const check = validateLink(a, b);
    if (!check.ok) { lastLinkMessage = check.message; return null; }

    const link = { id: 'link-' + (nextLinkId++), fromId, toId };
    topoNodes.links.push(link);

    // ถ้าปลายทางฝั่งใดฝั่งหนึ่งเป็น Switch -> ผูก PC/Server เข้ากับแผนกนั้นอัตโนมัติ
    // เพื่อให้ suggestNextIp() รู้ว่าจะแนะนำ IP จาก subnet ไหน โดยไม่ต้องให้ผู้ใช้เลือกเอง
    [[a, b], [b, a]].forEach(pair => {
        const self = pair[0], other = pair[1];
        // Router สาขามีช่อง linkedDeptId ติดมาด้วย (สืบทอดโครงเดียวกับ PC/Server) แต่ความหมายคนละเรื่อง
        // ความเป็นเจ้าของแผนกของ Router ดูจากลิงก์โดยตรงผ่าน getDeptOwnerRouter() ไม่ใช่จากช่องนี้
        if (self.type === 'router-branch') return;
        if (other.type === 'switch' && 'linkedDeptId' in self) {
            // ย้ายไปเชื่อมแผนกใหม่ที่ไม่ใช่แผนกเดิม -> IP เก่าอ้างอิง subnet ที่ไม่เกี่ยวข้องแล้ว ล้างทิ้งกันข้อมูลหลอก
            if (self.linkedDeptId !== null && self.linkedDeptId !== other.deptId) {
                self.ip = null;
                check.message = (check.message ? check.message + ' — ' : '') + 'ย้ายไปเชื่อมแผนกใหม่ IP เดิมถูกล้างแล้ว กด Suggest IP ใหม่ได้';
            }
            self.linkedDeptId = other.deptId;
        }
    });

    lastLinkMessage = check.message;
    return link;
}

// เรียกตอนลบแผนก (onRemoveDept) — ล้างข้อมูลของ PC/Server ที่ยังผูก/เชื่อมกับแผนกที่ถูกลบไปแล้ว
// ป้องกัน linkedDeptId/IP ค้างอ้างอิงแผนกผี และลบเส้นเชื่อมที่ปลายทางหายไปจริง (Switch ของแผนกนั้นถูกลบด้วย)
function detachManualNodesFromDept(deptId) {
    topoNodes.manualNodes.forEach(n => {
        if (n.linkedDeptId === deptId) { n.linkedDeptId = null; n.ip = null; }
    });
    topoNodes.links = topoNodes.links.filter(l => {
        const a = findNodeById(l.fromId), b = findNodeById(l.toId);
        return !!a && !!b;
    });
}

function removeLink(linkId) {
    topoNodes.links = topoNodes.links.filter(l => l.id !== linkId);
    refreshAfterTopologyChange();
}

// คืนค่ารูปแบบเดียวกับ getConnections() เพื่อให้ขั้นที่ 3 เอาไปวาดต่อได้ทันทีโดยไม่ต้องแก้โครงเดิม
function getManualConnections() {
    const conns = [];
    topoNodes.links.forEach(l => {
        const a = findNodeById(l.fromId);
        const b = findNodeById(l.toId);
        if (a && b) conns.push({ sx: a.x, sy: a.y, ex: b.x, ey: b.y, color: a.color || '#818CF8' });
    });
    return conns;
}

// แนะนำ IP ว่างถัดไปใน subnet ของแผนกที่ PC/Server เชื่อมอยู่
// ข้าม firstUsable เสมอ เพราะถูกจองเป็น Gateway ของ Router ต่อ VLAN แล้ว
// (ดู renderCLI ใน ui.js: "ip address <firstUsable> <netmask>" กับ "default-router <firstUsable>")
function suggestNextIp(deptId) {
    const dept = state.calculated.find(d => d.id === deptId);
    if (!dept) return null;

    const s = dept.subnet;
    const start = ipToLong(s.firstUsable) + 1;
    const end = ipToLong(s.lastUsable);
    if (start > end) return null; // subnet เล็กเกินไป ไม่เหลือที่ให้ Host อื่นนอกจาก Gateway

    const used = new Set();
    topoNodes.manualNodes.forEach(n => {
        if (n.linkedDeptId === deptId && n.ip) used.add(ipToLong(n.ip));
    });

    for (let ip = start; ip <= end; ip++) {
        if (!used.has(ip)) return longToIp(ip);
    }
    return null; // Subnet เต็มแล้ว ไม่เหลือ IP ให้แนะนำ
}

// เรียกตอน Clear All หรือโหลด Example ใหม่ — ล้าง PC/Server กับเส้นเชื่อมที่ผู้ใช้สร้างเอง
// ป้องกัน Node ค้าง (dangling) ชี้ไปหาแผนกที่ถูกลบ/เปลี่ยนไปแล้วหลังสลับตัวอย่าง
function resetManualTopology() {
    topoNodes.manualNodes = [];
    topoNodes.links = [];
    nextManualNodeId = 1;
    nextLinkId = 1;
    if (typeof resetWanRegistry === 'function') resetWanRegistry(); // ลิงก์หายหมดแล้ว index ของ /30 เดิมไม่มีความหมาย
}

/* ตารางพื้นหลัง — วาดครั้งเดียวเก็บใส่ canvas ซ่อนไว้ แล้วแปะเป็นภาพทุกเฟรม
   เดิมวาดเส้นใหม่ทั้งหมดทุกเฟรม: จอ 1400x600 = 50 เส้น x 4 คำสั่ง = ~200 คำสั่ง/เฟรม
   คิดเป็น 21% ของภาระวาดทั้งหมด ทั้งที่ภาพออกมาเหมือนเดิมทุกเฟรมไม่เคยเปลี่ยน
   สร้างใหม่เฉพาะตอนขนาด canvas หรือสีธีมเปลี่ยนเท่านั้น */
let gridCanvas = null, gridKey = '';

function drawGrid() {
    // ระยะห่างเส้นตารางย่อ/ขยายตามมุมมอง และเลื่อนตามการ pan ด้วยการขยับตำแหน่งที่วาง (ไม่ใช่วาดใหม่)
    // จึงแคชได้เหมือนเดิม โดยทำ tile ให้ใหญ่กว่าจอ 1 ช่อง แล้วเลื่อนที่วางตามเศษของ pan
    const spacing = 40 * viewZoom;
    const offX = ((viewPanX % spacing) + spacing) % spacing;
    const offY = ((viewPanY % spacing) + spacing) % spacing;
    const key = cW + 'x' + cH + '|' + CANVAS_GRID_COLOR + '|' + dpr + '|' + spacing.toFixed(3);
    if (gridKey !== key) {
        try {
            if (!gridCanvas) gridCanvas = document.createElement('canvas');
            const tileW = cW + spacing, tileH = cH + spacing; // เผื่ออีก 1 ช่องให้เลื่อนได้โดยไม่มีขอบโหว่
            gridCanvas.width = Math.max(1, Math.ceil(tileW * dpr));
            gridCanvas.height = Math.max(1, Math.ceil(tileH * dpr));
            const g = gridCanvas.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.clearRect(0, 0, tileW, tileH);
            g.strokeStyle = CANVAS_GRID_COLOR;
            g.lineWidth = 1;
            g.beginPath(); // รวมทุกเส้นไว้ใน path เดียว stroke ครั้งเดียวจบ
            for (let x = 0; x <= tileW; x += spacing) { g.moveTo(x, 0); g.lineTo(x, tileH); }
            for (let y = 0; y <= tileH; y += spacing) { g.moveTo(0, y); g.lineTo(tileW, y); }
            g.stroke();
            gridKey = key;
        } catch (e) {
            // สร้าง canvas ซ้อนไม่ได้ (เช่นในสภาพแวดล้อมทดสอบ) -> ถอยไปวาดตรง ๆ แบบเดิม ไม่ให้ทั้งเฟรมพัง
            gridCanvas = null; gridKey = '';
            ctx.strokeStyle = CANVAS_GRID_COLOR;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = offX - spacing; x <= cW; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, cH); }
            for (let y = offY - spacing; y <= cH; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(cW, y); }
            ctx.stroke();
            return;
        }
    }
    if (gridCanvas) ctx.drawImage(gridCanvas, offX - spacing, offY - spacing, cW + spacing, cH + spacing);
}

function drawConnections() {
    getAllConnections().forEach(c => {
        ctx.beginPath();
        ctx.moveTo(c.sx, c.sy);
        const midY = (c.sy + c.ey) / 2;
        ctx.bezierCurveTo(c.sx, midY, c.ex, midY, c.ex, c.ey);
        ctx.strokeStyle = c.color + '60'; // เพิ่มความชัดของเส้นเชื่อม (จาก 30 -> 60 hex alpha ~19% เป็น ~38%) ตามที่ผู้ใช้ฟีดแบ็กว่าเดิมจางเกินไป
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function drawFlowArrows() {
    if (!state.showArrows) return; 

    particles.forEach(p => {
        p.progress += p.speed;
        if (p.progress > 1) p.progress -= 1;
        const midY = (p.sy + p.ey) / 2;
        const t = p.progress, mt = 1 - t;
        const bx = mt*mt*mt*p.sx + 3*mt*mt*t*p.sx + 3*mt*t*t*p.ex + t*t*t*p.ex;
        const by = mt*mt*mt*p.sy + 3*mt*mt*t*midY + 3*mt*t*t*midY + t*t*t*p.ey;
        const t2 = Math.min(t + 0.01, 1), mt2 = 1 - t2;
        const bx2 = mt2*mt2*mt2*p.sx + 3*mt2*mt2*t2*p.sx + 3*mt2*t2*t2*p.ex + t2*t2*t2*p.ex;
        const by2 = mt2*mt2*mt2*p.sy + 3*mt2*mt2*t2*midY + 3*mt2*t2*t2*midY + t2*t2*t2*p.ey;
        const angle = Math.atan2(by2 - by, bx2 - bx);

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fillStyle = p.color; // เอา shadowBlur/glow ออกตามที่ผู้ใช้เลือก — ตัวการหลักที่ทำให้ลูกศรหลายสีพร้อมกันดูลายตา ไม่ใช่สีเอง
        ctx.fill();
        ctx.restore();
    });
}

function drawNodeBox(node, icon, borderColor, isSelected, isHover, isWarning) {
    const x = node.x - node.w / 2, y = node.y - node.h / 2;
    if (isSelected) { ctx.shadowColor = borderColor; ctx.shadowBlur = 6; }

    ctx.beginPath();
    ctx.roundRect(x, y, node.w, node.h, 8);
    ctx.fillStyle = CANVAS_BOX_BG;
    ctx.fill();
    // กล่องที่มีคำเตือนใช้เส้นขอบเต็มความทึบและหนาขึ้นเสมอ ไม่ว่าจะถูกเลือกอยู่หรือไม่
    // เพราะประเด็นคือ "ต้องสังเกตเห็นโดยไม่ต้องไปคลิกก่อน"
    ctx.strokeStyle = isWarning ? borderColor : (isSelected ? borderColor : (isHover ? borderColor + 'aa' : borderColor + '55'));
    ctx.lineWidth = isWarning ? 2 : (isSelected ? 2 : 1);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ป้ายอัศเจรีย์มุมขวาบนของกล่อง — สัญลักษณ์เดียวที่อ่านออกทันทีแม้ย่อผังจนอ่านตัวหนังสือไม่ทัน
    if (isWarning) {
        ctx.beginPath();
        ctx.arc(x + node.w - 4, y + 4, 8, 0, Math.PI * 2);
        ctx.fillStyle = borderColor;
        ctx.fill();
        ctx.fillStyle = '#1a1205'; // เข้มเกือบดำ ให้ตัด ! ออกจากพื้นเหลืองได้ในทั้งสองธีม
        ctx.font = 'bold 12px "Share Tech Mono"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', x + node.w - 4, y + 5);
    }

    ctx.fillStyle = borderColor;
    ctx.font = '900 16px "Font Awesome 6 Free"'; // ต้องระบุ weight 900 ไม่งั้น solid icon ของ FA6 จะไม่ขึ้น (ขึ้นเป็นกล่องแทน)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x + 19, node.y);

    ctx.fillStyle = CANVAS_LABEL_COLOR;
    ctx.font = '14px "Share Tech Mono"';
    ctx.textAlign = 'left';
    const labelX = x + 34, maxTextW = node.w - 42;
    let label = node.label;
    if (ctx.measureText(label).width > maxTextW) {
        while (ctx.measureText(label + '...').width > maxTextW && label.length > 0) label = label.slice(0, -1);
        label += '...';
    }
    ctx.fillText(label, labelX, node.y - (node.subnetInfo ? 7 : 0));
    if (node.subnetInfo) {
        ctx.fillStyle = borderColor; // เดิมลดความทึบด้วย 'aa' (~67%) แต่ทำให้ contrast หลังผสมกับพื้นหลังตกต่ำกว่า 4.5:1 ทุกสี -> ใช้สีเต็มความทึบเหมือน label หลัก
        ctx.font = '11px "Share Tech Mono"';
        ctx.fillText(node.subnetInfo, labelX, node.y + 9);
    }
}

function drawRouterNode() {
    const r = topoNodes.router;
    if (!r) return;
    r.subnetInfo = r.getBaseNetworkSummary();
    drawNodeBox(r, r.icon, r.color,
        state.selectedNodeType === 'router',
        hoverInfo && hoverInfo.type === 'router');
}

function drawSwitchNodes() {
    topoNodes.switches.forEach(sw => {
        sw.subnetInfo = sw.getVlanLabel();
        drawNodeBox(sw, sw.icon, sw.color,
            state.selectedDeptId === sw.deptId && state.selectedNodeType === 'switch',
            hoverInfo && hoverInfo.id === sw.id);
    });
}

function drawDeptNodes() {
    topoNodes.departments.forEach(d => {
        // \u0e42\u0e2b\u0e21\u0e14 IPv6: \u0e16\u0e49\u0e32\u0e41\u0e1c\u0e19\u0e01\u0e19\u0e35\u0e49\u0e21\u0e35\u0e1c\u0e25 IPv6 \u0e04\u0e33\u0e19\u0e27\u0e13\u0e44\u0e27\u0e49\u0e41\u0e25\u0e49\u0e27 \u0e42\u0e0a\u0e27\u0e4c Prefix \u0e41\u0e17\u0e19\u0e08\u0e33\u0e19\u0e27\u0e19 Host (VLAN/Host \u0e44\u0e21\u0e48\u0e40\u0e01\u0e35\u0e48\u0e22\u0e27\u0e01\u0e31\u0e1a IPv6 \u0e42\u0e14\u0e22\u0e15\u0e23\u0e07)
        var v6 = state.ipMode === 'v6' ? state.calculatedV6.find(x => x.id === d.deptId) : null;
        d.subnetInfo = (state.ipMode === 'v6')
            ? (v6 ? '/' + v6.subnet6.prefixLen : '\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35 IPv6')
            : d.hosts + ' hosts';

        drawNodeBox(d, '\uf108', d.color,
            state.selectedDeptId === d.deptId && state.selectedNodeType === 'department',
            hoverInfo && hoverInfo.id === d.id);

        ctx.fillStyle = d.color; // เดิมลดความทึบด้วย '80' (~50%) แต่ทำให้ contrast หลังผสมกับพื้นหลังตกต่ำกว่า 4.5:1 ทุกสี -> ใช้สีเต็มความทึบ
        ctx.font = '11px "Share Tech Mono"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (state.ipMode === 'v6') {
            if (v6) ctx.fillText(v6.subnet6.network, d.x, d.y + d.h / 2 + 6);
        } else if (d.subnet) {
            ctx.fillText(d.subnet.network + '/' + d.subnet.cidr, d.x, d.y + d.h / 2 + 6);
        }
    });
}

function drawManualNodes() {
    topoNodes.manualNodes.forEach(n => {
        // Router สาขามีความหมายของ 'เชื่อมแล้ว' คนละแบบกับ PC/Server (ดูจากลิงก์ WAN ไม่ใช่ linkedDeptId)
        const orphan = typeof isOrphanBranchRouter === 'function' && isOrphanBranchRouter(n);
        n.subnetInfo = n.type === 'router-branch'
            ? (orphan ? 'ยังไม่ได้เชื่อม WAN — ใช้งานไม่ได้' : n.getIpLabel())
            : n.getIpLabel() + (n.linkedDeptId ? '' : ' • ยังไม่เชื่อม');
        drawNodeBox(n, n.icon, orphan ? CANVAS_WARN_COLOR : n.color,
            state.selectedNodeType === n.type && state.selectedDeptId === n.id,
            hoverInfo && hoverInfo.id === n.id,
            orphan);
    });
}

/* ----- หยุดวาดตอนไม่มีอะไรเคลื่อนไหว -----
   เดิม renderFrame() วนที่ 60fps ตลอดเวลาที่เปิดแอปค้างไว้ แม้ผู้ใช้ไม่ได้แตะอะไรเลย
   วัดจริงได้ ~937 คำสั่งวาด/เฟรม = ~56,000 คำสั่ง/วินาที กินซีพียูและแบตฟรี ๆ
   ตอนนี้วาดต่อเมื่อมีเหตุผลจริงเท่านั้น:
     - ลูกศรวิ่งเปิดอยู่และมี particle (ภาพเปลี่ยนทุกเฟรมจริง)
     - กำลังลากโหนด / มีการชี้ค้าง (hover)
     - มีอะไรสั่ง requestRedraw() มา (ข้อมูลเปลี่ยน สลับธีม resize ฯลฯ)
   วาดเผื่อไปอีก 1 เฟรมหลังหมดเหตุผล เพื่อให้สถานะสุดท้าย (เช่นกรอบ hover ที่หายไป) ถูกลบออกจริง */
let needsRedraw = true;

function requestRedraw() {
    needsRedraw = true;
}

function isAnimating() {
    return (state.showArrows && particles.length > 0) || dragInfo !== null || panInfo !== null || backdropDrag !== null || hoverInfo !== null;
}

function renderFrame() {
    try {
        if (needsRedraw || isAnimating()) {
            // ชั้นที่ 1 — พิกัดจอ: ล้างพื้นและวาดตาราง (ตารางเลื่อนตามผังด้วยการเลื่อน pattern ไม่ใช่ transform)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cW, cH);
            drawGrid();
            // ชั้นที่ 2 — พิกัด world: ทุกอย่างที่เหลือวาดด้วยพิกัดเดิมของโหนด ไม่ต้องแก้โค้ดวาดสักบรรทัด
            ctx.setTransform(dpr * viewZoom, 0, 0, dpr * viewZoom, viewPanX * dpr, viewPanY * dpr);
            // รูปแปลนอาคารต้องอยู่ล่างสุดเสมอ วาดก่อนทุกอย่างในชั้น world
            if (typeof drawBackdrop === 'function') drawBackdrop();
            drawConnections();
            drawFlowArrows();
            drawRouterNode();
            drawSwitchNodes();
            drawDeptNodes();
            drawManualNodes();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // คืนค่าให้โค้ดอื่นที่อาจวาดต่อ
            needsRedraw = false;
        }
    } catch (err) {
        // กันไม่ให้ error ในเฟรมเดียวทำให้ animation loop ทั้งหมดหยุดตายถาวร (จอค้าง)
        console.error('renderFrame error (ข้ามเฟรมนี้):', err);
        needsRedraw = false;
    }
    animFrame = requestAnimationFrame(renderFrame);
}

function hitTest(mx, my) {
    for (const d of topoNodes.departments) {
        if (mx >= d.x-d.w/2 && mx <= d.x+d.w/2 && my >= d.y-d.h/2 && my <= d.y+d.h/2)
            return { node: d, type: 'department', deptId: d.deptId };
    }
    for (const n of topoNodes.manualNodes) {
        if (mx >= n.x-n.w/2 && mx <= n.x+n.w/2 && my >= n.y-n.h/2 && my <= n.y+n.h/2)
            return { node: n, type: n.type, deptId: n.id }; // ใช้ช่อง deptId เดิมเก็บ id (string) ของ PC/Server แทน
    }
    for (const s of topoNodes.switches) {
        if (mx >= s.x-s.w/2 && mx <= s.x+s.w/2 && my >= s.y-s.h/2 && my <= s.y+s.h/2)
            return { node: s, type: 'switch', deptId: s.deptId };
    }
    const r = topoNodes.router;
    if (r && mx >= r.x-r.w/2 && mx <= r.x+r.w/2 && my >= r.y-r.h/2 && my <= r.y+r.h/2)
        return { node: r, type: 'router', deptId: null };
    return null;
}

// รับได้ทั้ง MouseEvent และ TouchEvent — ฝั่ง touch ใช้นิ้วแรกเสมอ (ไม่รองรับ multi-touch โดยตั้งใจ)
function getCanvasCoords(e) {
    const p = getScreenCoords(e);
    // แปลงเป็นพิกัด world ก่อนคืนค่า เพื่อให้ hitTest/การลากโหนดทำงานบนระบบพิกัดเดิมทั้งหมด
    return { x: (p.x - viewPanX) / viewZoom, y: (p.y - viewPanY) / viewZoom };
}

// พิกัดดิบบนจอ (ใช้ตอนเลื่อนผังและซูมเข้าหาตำแหน่งเมาส์)
function getScreenCoords(e) {
    const r = canvas.getBoundingClientRect();
    const src = (e.touches && e.touches.length) ? e.touches[0]
              : (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0]
              : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
}

// ซูมโดยตรึงจุดใต้เมาส์ให้อยู่กับที่ (ความรู้สึกเดียวกับแผนที่ทั่วไป)
function zoomAt(screenX, screenY, factor) {
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewZoom * factor));
    if (next === viewZoom) return;
    const wx = (screenX - viewPanX) / viewZoom;
    const wy = (screenY - viewPanY) / viewZoom;
    viewZoom = next;
    viewPanX = screenX - wx * viewZoom;
    viewPanY = screenY - wy * viewZoom;
    requestRedraw();
    updateZoomLabel();
}

function zoomBy(factor) { zoomAt(cW / 2, cH / 2, factor); }

// จัดมุมมองให้เห็นทุกโหนดพอดีกรอบ
function zoomToFit() {
    const nodes = [topoNodes.router].concat(topoNodes.switches, topoNodes.departments, topoNodes.manualNodes)
        .filter(Boolean);
    if (nodes.length === 0) { viewZoom = 1; viewPanX = 0; viewPanY = 0; requestRedraw(); updateZoomLabel(); return; }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
        minX = Math.min(minX, n.x - n.w / 2); maxX = Math.max(maxX, n.x + n.w / 2);
        minY = Math.min(minY, n.y - n.h / 2); maxY = Math.max(maxY, n.y + n.h / 2);
    });
    const pad = 60; // เผื่อที่ให้ป้ายใต้กล่องและ legend มุมล่างซ้าย
    const w = (maxX - minX) + pad * 2, h = (maxY - minY) + pad * 2;
    viewZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(cW / w, cH / h)));
    viewPanX = cW / 2 - ((minX + maxX) / 2) * viewZoom;
    viewPanY = cH / 2 - ((minY + maxY) / 2) * viewZoom;
    requestRedraw();
    updateZoomLabel();
}

function resetView() {
    viewZoom = 1; viewPanX = 0; viewPanY = 0;
    requestRedraw();
    updateZoomLabel();
}

function updateZoomLabel() {
    const el = document.getElementById('zoomLabel');
    if (el) el.textContent = Math.round(viewZoom * 100) + '%';
}

function findNodeById(id) {
    if (topoNodes.router && topoNodes.router.id === id) return topoNodes.router;
    return topoNodes.switches.find(s => s.id === id) ||
        topoNodes.departments.find(d => d.id === id) ||
        topoNodes.manualNodes.find(n => n.id === id);
}

/* ============================================
   3c. Input handling — Mouse + Touch ใช้ตรรกะชุดเดียวกัน
   เดิมผูกแค่ mousedown/mousemove/mouseup ทำให้บนมือถือ/แท็บเล็ตแตะวาง PC ลากโหนด หรือเชื่อมสายไม่ได้เลย
   ทั้งที่ UI เขียนว่า "TAP NODE TO EDIT" และมี responsive layout ครบ
   จึงแยกตรรกะออกเป็น handlePointerDown/Move/Up แล้วให้ทั้ง mouse และ touch เรียกตัวเดียวกัน
   หลักสำคัญของฝั่ง touch: ไม่ preventDefault ตอน touchstart (ไม่งั้นเลื่อนหน้าจอไม่ได้ทั้งแคนวาส)
   จะ preventDefault เฉพาะตอน touchmove ที่กำลังลากโหนดจริงเท่านั้น -> แตะที่ว่างแล้วยังปัดเลื่อนหน้าได้ปกติ
   ============================================ */

function handlePointerDown(x, y) {
    try {
        // โหมดวางอุปกรณ์ใหม่ (ปุ่ม PC/Server ที่มุมขวาบน) มีสิทธิ์ก่อนเสมอ
        if (state.placingType) {
            if (typeof pushHistory === 'function') pushHistory('วางอุปกรณ์');
            const DeviceClass = state.placingType === 'pc' ? PCDevice
                              : state.placingType === 'router-branch' ? BranchRouterDevice
                              : ServerDevice;
            const placedType = state.placingType;
            const placed = addManualNode(DeviceClass, x, y);
            refreshAfterTopologyChange();
            state.placingType = null;
            if (typeof updateModeButtons === 'function') updateModeButtons();
            // Router สาขาต่างจาก PC/Server ตรงที่ "วางแล้วยังใช้ไม่ได้" จนกว่าจะมีลิงก์ WAN
            // บอกขั้นตอนถัดไปให้ตรง ๆ ตั้งแต่วินาทีที่วาง ดีกว่าให้ไปงงเอาตอนดู config ที่ไม่มีทางออก
            if (typeof showToast === 'function') {
                showToast(placedType === 'router-branch'
                    ? 'วาง Router ของสาขาแล้ว แต่ยังใช้งานไม่ได้ ต้องกดปุ่ม Connect แล้วลากสายไปเชื่อมกับ Router-01 ก่อน'
                    : 'วางอุปกรณ์แล้ว กดปุ่ม Connect เพื่อลากสายเชื่อมกับอุปกรณ์ตัวอื่น', placedType === 'router-branch' ? 'info' : 'success');
            }
            // เปิดแผงรายละเอียดของ Router ที่เพิ่งวางให้เลย ในนั้นมีขั้นตอนครบ 3 ข้อ
            if (placedType === 'router-branch' && placed && typeof selectNode === 'function') {
                selectNode(placed.id, 'router-branch');
            }
            document.getElementById('statusBar').textContent = 'Ready';
            return;
        }

        // โหมดลากเชื่อมสาย (ปุ่ม Connect)
        if (state.connectMode) {
            const hit = hitTest(x, y);
            if (!hit) { state.linkFromId = null; return; } // คลิกพื้นที่ว่าง = ยกเลิกตัวที่เลือกไว้
            if (!state.linkFromId) {
                state.linkFromId = hit.node.id;
                document.getElementById('statusBar').textContent = 'เลือก ' + hit.node.label + ' แล้ว ต่อไปให้คลิกอุปกรณ์ตัวที่สองที่ต้องการเชื่อมด้วย';
                return;
            }
            if (state.linkFromId === hit.node.id) { state.linkFromId = null; return; } // คลิกตัวเดิมซ้ำ = ยกเลิก
            if (typeof pushHistory === 'function') pushHistory('เชื่อมสาย');
            const link = addLink(state.linkFromId, hit.node.id);
            state.linkFromId = null;
            // ต้องคำนวณใหม่ทันที ไม่งั้นลิงก์ WAN ที่เพิ่งสร้างจะยังไม่ได้ /30 จนกว่าผู้ใช้จะไปแก้อย่างอื่น
            // (อาการที่เห็น: กล่อง Router สาขายังขึ้นว่า "ยังไม่มีลิงก์ WAN" ทั้งที่สายลากเชื่อมแล้ว)
            // และสายที่เพิ่งเพิ่มก็ต้องมีลูกศรวิ่งด้วย ซึ่ง particle สร้างตอน layoutTopology/createParticles
            if (typeof refreshAll === 'function') refreshAll();
            if (link) {
                if (typeof showToast === 'function') showToast(lastLinkMessage || 'เชื่อมสำเร็จ', lastLinkMessage ? 'info' : 'success');
            } else if (typeof showToast === 'function') {
                showToast(lastLinkMessage || 'เชื่อมไม่สำเร็จ', 'error');
            }
            document.getElementById('statusBar').textContent = 'กำลังลากสาย ให้คลิกอุปกรณ์ตัวแรกที่ต้องการเชื่อม';
            return;
        }

        // พฤติกรรมเดิม: เลือก/ลาก Node
        const hit = hitTest(x, y);
        if (hit) {
            dragInfo = { nodeId: hit.node.id, type: hit.type, offsetX: x - hit.node.x, offsetY: y - hit.node.y };
            // 'router-branch' ต้องอยู่ในรายการนี้ด้วย ไม่งั้นจะตกไปเข้าเงื่อนไข else ซึ่งเปิดพาเนลของ
            // Router หลักแทน -> ผู้ใช้เลยไม่เห็นปุ่มลบและแก้ชื่อของ Router สาขาที่เพิ่งวางเลย
            if (hit.type === 'department' || hit.type === 'switch' || hit.type === 'pc' || hit.type === 'server' || hit.type === 'router-branch') selectNode(hit.deptId, hit.type);
            else { state.selectedDeptId = null; state.selectedNodeType = 'router'; renderDetailPanel(); renderSidebarDepts(); }
        } else if (typeof isBackdropDraggable === 'function' && isBackdropDraggable() && hitBackdrop(x, y)) {
            // รูปพื้นหลังที่ "ปลดล็อกไว้" กินคลิกก่อนการเลื่อนผัง — เป็นโหมดชั่วคราวตอนจัดตำแหน่งเท่านั้น
            // พอกดล็อก รูปจะคลิกทะลุได้ทันทีและกิ่งนี้จะไม่ถูกเข้าอีกเลย
            backdropDrag = { offsetX: x - state.backdrop.x, offsetY: y - state.backdrop.y };
        } else {
            // คลิกพื้นที่ว่าง = เริ่มเลื่อนผัง (นอกเหนือจากการยกเลิกการเลือก)
            // ทำให้ผังที่กว้างเกินกรอบยังเข้าถึงได้ทุกส่วนโดยไม่ต้องย่อจนอ่านไม่ออก
            panInfo = { startX: x * viewZoom + viewPanX, startY: y * viewZoom + viewPanY, panX: viewPanX, panY: viewPanY };
            state.selectedDeptId = null; state.selectedNodeType = null;
            closeDetailPanel(); renderSidebarDepts();
        }
    } catch (err) {
        console.error('handlePointerDown error:', err);
        dragInfo = null;
    }
    requestRedraw();
}

// isHover = true เฉพาะเมาส์ — นิ้วไม่มีสถานะ "ชี้ค้าง" การอัปเดต hoverInfo จาก touch จะทำให้โหนดค้างสว่างหลังยกนิ้ว
function handlePointerMove(x, y, isHover) {
    try {
        if (backdropDrag && state.backdrop) {
            state.backdrop.x = x - backdropDrag.offsetX;
            state.backdrop.y = y - backdropDrag.offsetY;
            if (isHover) canvas.style.cursor = 'grabbing';
            requestRedraw();
            return;
        }
        if (panInfo) {
            const sx = x * viewZoom + viewPanX, sy = y * viewZoom + viewPanY;
            viewPanX = panInfo.panX + (sx - panInfo.startX);
            viewPanY = panInfo.panY + (sy - panInfo.startY);
            if (isHover) canvas.style.cursor = 'grabbing';
            requestRedraw();
            return;
        }
        if (dragInfo) {
            const node = findNodeById(dragInfo.nodeId);
            if (node) {
                // จำกัดให้อยู่ในพื้นที่ที่ "มองเห็นอยู่ตอนนี้" (แปลงกรอบจอเป็นพิกัด world)
                // เดิมใช้ 0..cW ตรง ๆ ซึ่งพอซูม/เลื่อนผังแล้วจะลากโหนดไปวางนอกกรอบที่เห็นไม่ได้เลย
                const vx0 = -viewPanX / viewZoom, vy0 = -viewPanY / viewZoom;
                const vx1 = vx0 + cW / viewZoom, vy1 = vy0 + cH / viewZoom;
                node.x = Math.max(vx0 + node.w/2, Math.min(vx1 - node.w/2, x - dragInfo.offsetX));
                node.y = Math.max(vy0 + node.h/2, Math.min(vy1 - node.h/2, y - dragInfo.offsetY));
                updateParticlePositions();
            }
            if (isHover) canvas.style.cursor = 'grabbing';
            return;
        }
        if (!isHover) return;
        const hit = hitTest(x, y);
        hoverInfo = hit ? { id: hit.node.id, type: hit.type } : null;
        canvas.style.cursor = hit ? 'pointer' : 'default';
    } catch (err) {
        console.error('handlePointerMove error:', err);
        dragInfo = null;
    }
}

function handlePointerUp() {
    // เก็บตำแหน่งรูปที่เพิ่งจัดเสร็จ ไม่งั้นรีเฟรชแล้วรูปเด้งกลับที่เดิม
    if (backdropDrag && typeof scheduleAutosave === 'function') scheduleAutosave();
    dragInfo = null;
    panInfo = null;
    backdropDrag = null;
    canvas.style.cursor = 'default';
    requestRedraw();
}

function setupCanvasEvents() {
    // ----- Mouse -----
    canvas.addEventListener('mousedown', function(e) {
        const { x, y } = getCanvasCoords(e);
        handlePointerDown(x, y);
    });
    canvas.addEventListener('mousemove', function(e) {
        const { x, y } = getCanvasCoords(e);
        handlePointerMove(x, y, true);
    });
    // ล้อเมาส์ = ซูมเข้าหาตำแหน่งเคอร์เซอร์  (passive:false เพราะต้อง preventDefault กันหน้าเลื่อน)
    canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        const p = getScreenCoords(e);
        zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', function() { hoverInfo = null; handlePointerUp(); });

    // ----- Touch -----
    // passive:false จำเป็นเพราะ touchmove ต้อง preventDefault ได้ตอนกำลังลากโหนด
    // (เบราว์เซอร์สมัยใหม่ตั้ง touchmove เป็น passive โดยปริยาย ซึ่ง preventDefault จะไม่มีผล)
    canvas.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return; // สองนิ้วขึ้นไป = ผู้ใช้ตั้งใจ zoom/scroll ปล่อยให้เบราว์เซอร์จัดการเอง
        const { x, y } = getCanvasCoords(e);
        handlePointerDown(x, y);
    }, { passive: true });

    canvas.addEventListener('touchmove', function(e) {
        if (e.touches.length !== 1) return;
        // กันหน้าเลื่อน/เด้งเฉพาะตอนลากโหนดจริงเท่านั้น แตะที่ว่างแล้วปัดยังเลื่อนหน้าได้ตามปกติ
        if (dragInfo) e.preventDefault();
        const { x, y } = getCanvasCoords(e);
        handlePointerMove(x, y, false);
    }, { passive: false });

    canvas.addEventListener('touchend', function() { hoverInfo = null; handlePointerUp(); });
    canvas.addEventListener('touchcancel', function() { hoverInfo = null; handlePointerUp(); });
}