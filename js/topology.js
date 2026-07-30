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

const DEPT_COLORS_DARK = ['#14B8A6','#A78BFA','#F59E0B','#22C55E','#EC4899','#818CF8','#F97316','#0EA5E9'];
const DEPT_COLORS_LIGHT = ['#096459','#6D28D9','#7A4405','#0C5C2C','#9E144D','#4338CA','#8F3408','#025580'];
let DEPT_COLORS = DEPT_COLORS_DARK; // applyTheme() ใน ui.js สลับให้เมื่อ toggle โหมด

// สี "chrome" ของ Canvas เอง (ไม่ใช่สีอุปกรณ์) — กล่อง Node / เส้น grid / ตัวหนังสือ label หลัก
// วาดด้วยค่าตรงๆ ใน ctx.fillStyle ไม่ผ่าน CSS เลย เลยต้องมีตัวแปรคู่ขนานแบบนี้ให้ applyTheme() สลับ
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
}

function layoutTopology() {
    const rX = cW / 2, rY = 65;
    topoNodes.router = new RouterDevice(rX, rY);
    const depts = state.calculated;
    const count = depts.length;
    topoNodes.switches = [];
    topoNodes.departments = [];
    if (count === 0) { createParticles(); return; }

    const maxSpacing = 180, minSpacing = 100;
    let spacing = maxSpacing;
    if ((count - 1) * maxSpacing > cW - 160) spacing = Math.max(minSpacing, (cW - 160) / (count - 1));
    const startX = cW / 2 - (count - 1) * spacing / 2;

    depts.forEach((dept, i) => {
        const x = startX + i * spacing;
        const color = DEPT_COLORS[i % DEPT_COLORS.length];
        topoNodes.switches.push(new SwitchDevice(dept, x, 200, color));
        topoNodes.departments.push({
            id: 'dept-' + dept.id, type: 'department', deptId: dept.id,
            x, y: 350, w: 132, h: 60, label: dept.name, hosts: dept.hosts, color,
            subnet: dept.subnet
        });
    });
    createParticles();
}

// เรียกจาก applyTheme() ตอนสลับ Light/Dark — อัปเดตแค่สี "ในตัว" node ที่มีอยู่แล้ว
// ไม่รื้อ/สร้างใหม่เหมือน layoutTopology() เพราะจะทำให้ตำแหน่งที่ผู้ใช้ลากเองหายหมด
function recolorTopology() {
    if (topoNodes.router) topoNodes.router.color = ROUTER_COLOR;
    topoNodes.switches.forEach((sw, i) => {
        const idx = state.calculated.findIndex(d => d.id === sw.deptId);
        sw.color = DEPT_COLORS[(idx >= 0 ? idx : i) % DEPT_COLORS.length];
    });
    topoNodes.departments.forEach((d, i) => {
        const idx = state.calculated.findIndex(cd => cd.id === d.deptId);
        d.color = DEPT_COLORS[(idx >= 0 ? idx : i) % DEPT_COLORS.length];
    });
    topoNodes.manualNodes.forEach(n => {
        n.color = n.type === 'pc' ? PC_COLOR : SERVER_COLOR;
    });
    // particles (ลูกศรวิ่ง) เก็บสีเป็น string ไว้ตรงๆ ไม่ใช่ reference ที่ตามสีแผนกเองอัตโนมัติ
    // updateParticlePositions() คำนวณ getConnections() ใหม่แล้วอัปเดตทั้งตำแหน่ง+สีให้ตรงกับ sw.color/d.color ปัจจุบันอยู่แล้ว
    // เรียกซ้ำตรงนี้ได้เลย ตำแหน่งจะเท่าเดิม (ยังไม่ขยับ) แต่สีจะตรงกับที่เพิ่งทาใหม่ด้านบน
    updateParticlePositions();
}

function createParticles() {
    particles = [];
    getConnections().forEach(c => {
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
    const conns = getConnections();
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

function removeManualNode(id) {
    topoNodes.manualNodes = topoNodes.manualNodes.filter(n => n.id !== id);
    // ลบเส้นเชื่อมที่ค้างอยู่กับ node นี้ไปด้วย ป้องกัน Link ชี้ไปหา id ที่ไม่มีอยู่จริงแล้ว (dangling reference)
    topoNodes.links = topoNodes.links.filter(l => l.fromId !== id && l.toId !== id);
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
    if ((a.type === 'router' && isEndDevice(b.type)) || (b.type === 'router' && isEndDevice(a.type))) {
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
}

function drawGrid() {
    ctx.strokeStyle = CANVAS_GRID_COLOR;
    ctx.lineWidth = 1;
    for (let x = 0; x < cW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cH); ctx.stroke(); }
    for (let y = 0; y < cH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cW, y); ctx.stroke(); }
}

function drawConnections() {
    getConnections().concat(getManualConnections()).forEach(c => {
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

function drawNodeBox(node, icon, borderColor, isSelected, isHover) {
    const x = node.x - node.w / 2, y = node.y - node.h / 2;
    if (isSelected) { ctx.shadowColor = borderColor; ctx.shadowBlur = 6; }

    ctx.beginPath();
    ctx.roundRect(x, y, node.w, node.h, 8);
    ctx.fillStyle = CANVAS_BOX_BG;
    ctx.fill();
    ctx.strokeStyle = isSelected ? borderColor : (isHover ? borderColor + 'aa' : borderColor + '55');
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();
    ctx.shadowBlur = 0;

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
        n.subnetInfo = n.getIpLabel() + (n.linkedDeptId ? '' : ' • ยังไม่เชื่อม');
        drawNodeBox(n, n.icon, n.color,
            state.selectedNodeType === n.type && state.selectedDeptId === n.id,
            hoverInfo && hoverInfo.id === n.id);
    });
}

function renderFrame() {
    try {
        ctx.clearRect(0, 0, cW, cH);
        drawGrid();
        drawConnections();
        drawFlowArrows();
        drawRouterNode();
        drawSwitchNodes();
        drawDeptNodes();
        drawManualNodes();
    } catch (err) {
        // กันไม่ให้ error ในเฟรมเดียวทำให้ animation loop ทั้งหมดหยุดตายถาวร (จอค้าง)
        console.error('renderFrame error (ข้ามเฟรมนี้):', err);
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

function getCanvasCoords(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function findNodeById(id) {
    if (topoNodes.router && topoNodes.router.id === id) return topoNodes.router;
    return topoNodes.switches.find(s => s.id === id) ||
        topoNodes.departments.find(d => d.id === id) ||
        topoNodes.manualNodes.find(n => n.id === id);
}

function setupCanvasEvents() {
    canvas.addEventListener('mousedown', function(e) {
        try {
            const { x, y } = getCanvasCoords(e);

            // โหมดวางอุปกรณ์ใหม่ (ปุ่ม PC/Server ที่มุมขวาบน) มีสิทธิ์ก่อนเสมอ
            if (state.placingType) {
                const DeviceClass = state.placingType === 'pc' ? PCDevice : ServerDevice;
                addManualNode(DeviceClass, x, y);
                state.placingType = null;
                if (typeof updateModeButtons === 'function') updateModeButtons();
                if (typeof showToast === 'function') showToast('วางอุปกรณ์แล้ว — กด Connect เพื่อเชื่อมสาย', 'success');
                document.getElementById('statusBar').textContent = 'Ready';
                return;
            }

            // โหมดลากเชื่อมสาย (ปุ่ม Connect)
            if (state.connectMode) {
                const hit = hitTest(x, y);
                if (!hit) { state.linkFromId = null; return; } // คลิกพื้นที่ว่าง = ยกเลิกตัวที่เลือกไว้
                if (!state.linkFromId) {
                    state.linkFromId = hit.node.id;
                    document.getElementById('statusBar').textContent = 'เลือก ' + hit.node.label + ' แล้ว — คลิกอุปกรณ์ตัวที่สองเพื่อเชื่อม';
                    return;
                }
                if (state.linkFromId === hit.node.id) { state.linkFromId = null; return; } // คลิกตัวเดิมซ้ำ = ยกเลิก
                const link = addLink(state.linkFromId, hit.node.id);
                state.linkFromId = null;
                if (link) {
                    if (typeof showToast === 'function') showToast(lastLinkMessage || 'เชื่อมสำเร็จ', lastLinkMessage ? 'info' : 'success');
                } else if (typeof showToast === 'function') {
                    showToast(lastLinkMessage || 'เชื่อมไม่สำเร็จ', 'error');
                }
                document.getElementById('statusBar').textContent = 'โหมดเชื่อมสาย: คลิกอุปกรณ์ตัวแรก';
                return;
            }

            // พฤติกรรมเดิม: เลือก/ลาก Node
            const hit = hitTest(x, y);
            if (hit) {
                dragInfo = { nodeId: hit.node.id, type: hit.type, offsetX: x - hit.node.x, offsetY: y - hit.node.y };
                if (hit.type === 'department' || hit.type === 'switch' || hit.type === 'pc' || hit.type === 'server') selectNode(hit.deptId, hit.type);
                else { state.selectedDeptId = null; state.selectedNodeType = 'router'; renderDetailPanel(); renderSidebarDepts(); }
            } else {
                state.selectedDeptId = null; state.selectedNodeType = null;
                closeDetailPanel(); renderSidebarDepts();
            }
        } catch (err) {
            console.error('mousedown handler error:', err);
            dragInfo = null;
        }
    });
    canvas.addEventListener('mousemove', function(e) {
        try {
            const { x, y } = getCanvasCoords(e);
            if (dragInfo) {
                const node = findNodeById(dragInfo.nodeId);
                if (node) {
                    node.x = Math.max(node.w/2, Math.min(cW - node.w/2, x - dragInfo.offsetX));
                    node.y = Math.max(node.h/2, Math.min(cH - node.h/2, y - dragInfo.offsetY));
                    updateParticlePositions();
                }
                canvas.style.cursor = 'grabbing';
                return;
            }
            const hit = hitTest(x, y);
            hoverInfo = hit ? { id: hit.node.id, type: hit.type } : null;
            canvas.style.cursor = hit ? 'pointer' : 'default';
        } catch (err) {
            console.error('mousemove handler error:', err);
            dragInfo = null;
        }
    });
    canvas.addEventListener('mouseup', function() { dragInfo = null; canvas.style.cursor = 'default'; });
    canvas.addEventListener('mouseleave', function() { dragInfo = null; canvas.style.cursor = 'default'; });
}