/* ============================================
   8. WAN — Router สาขา และลิงก์ระหว่าง Router
   ============================================
   ปัญหาที่ไฟล์นี้แก้:
   เดิมแบบจำลองรองรับ Router ได้ตัวเดียวเสมอ (router-on-a-stick ตัวเดียวคุมทุก VLAN)
   ทำให้จำลอง "หลายสาขาเชื่อมกันด้วยลิงก์ WAN" ซึ่งเป็นเนื้อหาหลักของวิชาเครือข่ายไม่ได้เลย

   วิธีที่เลือก — เพิ่มแบบต่อยอด ไม่รื้อของเดิม:
     Router สาขาถูกเก็บใน topoNodes.manualNodes ชุดเดียวกับ PC/Server
     จึงได้กลไกวาง/ลาก/ลบ/เชื่อม/บันทึก-โหลด มาใช้ฟรีทั้งหมด ไม่ต้องแตะโครงสร้างดาวที่ทำงานอยู่

   กติกาของแบบจำลอง (ตั้งใจให้ตรงกับการออกแบบจริง):
     1. ลิงก์ Router-to-Router = ลิงก์ WAN ระบบจอง /30 ให้อัตโนมัติจาก WAN Pool
        ใช้ /30 เพราะเป็นขนาดมาตรฐานของลิงก์ point-to-point (2 usable address พอดี)
     2. Switch ของแผนกที่ถูกลากไปเชื่อมกับ Router สาขา ถือว่า "ย้ายไปอยู่สาขานั้น"
        สายจาก Router หลักจะถูกตัดออกอัตโนมัติ (ไม่งั้นจะกลายเป็นวงลูปที่ไม่มีความหมาย)
     3. แผนกที่ไม่ได้ถูกสาขาไหนรับไป ยังขึ้นกับ Router หลักเหมือนเดิมทุกประการ

   หมายเหตุเรื่องการจอง /30:
     ผูก index ของ block กับ "id ของลิงก์" ผ่าน wanRegistry แบบเดียวกับที่ vlanRegistry
     ผูก VLAN กับ deptId — เพื่อไม่ให้เลข IP ของลิงก์ที่ตั้งไปแล้วเลื่อนเมื่อผู้ใช้ลบลิงก์อื่นทิ้ง
   ============================================ */

var WAN_DEFAULT_BASE = '10.255.255.0';
var WAN_DEFAULT_CIDR = 24;

// linkId -> ลำดับ block /30 ที่ลิงก์นั้นถือครอง (ค่าคงที่ตลอดชีพของลิงก์)
var wanRegistry = new Map();
var nextWanIndex = 0;

function assignWanIndex(linkId) {
    if (!wanRegistry.has(linkId)) {
        wanRegistry.set(linkId, nextWanIndex);
        nextWanIndex += 1;
    }
    return wanRegistry.get(linkId);
}

function resetWanRegistry() {
    wanRegistry.clear();
    nextWanIndex = 0;
}

/* ---------- ตัวช่วยระบุชนิดโหนด ---------- */

function isRouterType(type) {
    return type === 'router' || type === 'router-branch';
}

function isRouterNode(node) {
    return !!node && isRouterType(node.type);
}

// Router สาขาทั้งหมดที่ผู้ใช้วางเอง (Router หลักไม่รวมอยู่ในนี้ เพราะอยู่ที่ topoNodes.router)
function getBranchRouters() {
    return topoNodes.manualNodes.filter(function (n) { return n.type === 'router-branch'; });
}

/* ---------- Router สาขาที่ยังลอยอยู่ ----------
   ปุ่ม Router บน Canvas วาง "Router สาขา" ให้เสมอ (Router หลักมีได้ตัวเดียวและมีมาให้ตั้งแต่ต้น)
   Router สาขาที่เพิ่งวางลงไปยังไม่มีความหมายอะไรเลยจนกว่าจะมีลิงก์ WAN ไปหา Router ตัวอื่น:
     - ไม่มี IP ฝั่ง WAN เพราะ /30 จะถูกจองตอนมีลิงก์เท่านั้น
     - ไม่มี default route กลับต้นทาง
     - ต่อให้ลากไปคุมแผนกไว้แล้ว แผนกนั้นจะถูกตัดขาดจากส่วนอื่นของเครือข่ายทันที
       เพราะ Router หลักเลิกดูแลแผนกนั้นแล้ว แต่สาขาก็ยังไม่มีทางออก
   ข้อสุดท้ายอันตรายที่สุด เพราะผังดูเหมือนถูกต้องทุกอย่างแต่ config ที่ได้ใช้งานจริงไม่ได้
   จึงต้องมีสัญญาณเตือนบนผังและในแผงรายละเอียด ไม่ใช่ให้ผู้ใช้ค้นพบเอาเองตอนแปะลงอุปกรณ์ */
function isOrphanBranchRouter(node) {
    if (!node || node.type !== 'router-branch') return false;
    return getWanLinksOfRouter(node.id).length === 0;
}

function getOrphanBranchRouters() {
    return getBranchRouters().filter(isOrphanBranchRouter);
}

// Router ทั้งหมดในระบบ เรียง Router หลักไว้ก่อนเสมอ
function getAllRouters() {
    var list = [];
    if (topoNodes.router) list.push(topoNodes.router);
    return list.concat(getBranchRouters());
}

/* ---------- Switch อยู่กับ Router ตัวไหน ---------- */

// คืน Router สาขาที่ "รับ" แผนกนี้ไปดูแล หรือ null ถ้ายังขึ้นกับ Router หลัก
// ตัดสินจากลิงก์ที่ผู้ใช้ลากเองระหว่าง Router สาขา กับ Switch ของแผนกนั้น
function getDeptOwnerRouter(deptId) {
    var swId = 'sw-' + deptId;
    for (var i = 0; i < topoNodes.links.length; i++) {
        var l = topoNodes.links[i];
        var otherId = l.fromId === swId ? l.toId : (l.toId === swId ? l.fromId : null);
        if (!otherId) continue;
        var other = topoNodes.manualNodes.find(function (n) { return n.id === otherId; });
        if (other && other.type === 'router-branch') return other;
    }
    return null;
}

// แผนกที่ Router ตัวที่ระบุเป็นเจ้าของ ('router' = Router หลัก รับทุกแผนกที่ไม่มีสาขารับไป)
function getDeptsOfRouter(routerId) {
    return state.calculated.filter(function (d) {
        var owner = getDeptOwnerRouter(d.id);
        return routerId === 'router' ? owner === null : (owner && owner.id === routerId);
    });
}

/* ---------- คำนวณซับเน็ตของลิงก์ WAN ---------- */

function getWanPool() {
    var ip = (typeof state.wanBase === 'string' && isValidIp(state.wanBase)) ? state.wanBase : WAN_DEFAULT_BASE;
    var cidr = Number.isInteger(state.wanCidr) && state.wanCidr >= 8 && state.wanCidr <= 30 ? state.wanCidr : WAN_DEFAULT_CIDR;
    return { ip: normalizeNetwork(ip, cidr), cidr: cidr };
}

// ลิงก์ที่ปลายทั้งสองข้างเป็น Router = ลิงก์ WAN
function getWanLinkRecords() {
    return topoNodes.links.filter(function (l) {
        var a = findNodeById(l.fromId), b = findNodeById(l.toId);
        return isRouterNode(a) && isRouterNode(b);
    });
}

// คืนรายละเอียดการจอง /30 ของทุกลิงก์ WAN
// ฝั่งที่ id เรียงมาก่อนได้ address แรก (network+1) อีกฝั่งได้ network+2 — กำหนดตายตัวเพื่อให้ผลคงที่ทุกครั้ง
function calculateWanLinks() {
    var pool = getWanPool();
    var poolStart = ipToLong(pool.ip);
    var poolSize = Math.pow(2, 32 - pool.cidr);
    var maxBlocks = Math.floor(poolSize / 4);

    var results = [];
    var errors = [];

    getWanLinkRecords().forEach(function (l) {
        var a = findNodeById(l.fromId), b = findNodeById(l.toId);
        if (!a || !b) return;

        var idx = assignWanIndex(l.id);
        if (idx >= maxBlocks) {
            errors.push('ลิงก์ WAN เกินขนาด Pool (' + pool.ip + '/' + pool.cidr + ' รองรับ ' + maxBlocks + ' ลิงก์)');
            return;
        }

        var network = (poolStart + idx * 4) >>> 0;
        var first = a.id <= b.id ? a : b;
        var second = a.id <= b.id ? b : a;

        results.push({
            linkId: l.id,
            network: longToIp(network),
            cidr: 30,
            netmask: cidrToMask(30),
            wildcard: cidrToWildcard(30),
            broadcast: longToIp((network + 3) >>> 0),
            ends: [
                { id: first.id, label: first.label, ip: longToIp((network + 1) >>> 0) },
                { id: second.id, label: second.label, ip: longToIp((network + 2) >>> 0) }
            ],
            dceId: resolveDceEnd(l.id, first.id, second.id)
        });
    });

    if (errors.length && typeof showToast === 'function') showToast(errors.join('\n'), 'error');
    state.wanLinks = results;
    return results;
}

/* ---------- ฝั่ง DCE ของสาย Serial ----------
   สาย Serial แบบ point-to-point มีฝั่งหนึ่งเป็น DCE อีกฝั่งเป็น DTE เฉพาะฝั่ง DCE ที่ต้องมี clock rate
   อีกฝั่งเป็นฝ่ายรับ เรียกว่า DTE ฝั่ง DCE เท่านั้นที่ต้องตั้งคำสั่ง clock rate

   ประเด็นสำคัญ: "ฝั่งไหนเป็น DCE" ไม่ใช่สิ่งที่คำนวณจากผังได้ มันขึ้นกับว่าปลายสายฝั่งไหน
   ถูกเสียบเข้ากับอุปกรณ์ตัวไหน ซึ่งเป็นเรื่องของสายจริงในห้องแล็บ ไม่ใช่เรื่องของตรรกะเครือข่าย
   (ในงานจริงที่เช่าสายจากผู้ให้บริการ ตัวจ่ายนาฬิกาคืออุปกรณ์ของผู้ให้บริการ ทั้งสอง Router
    เป็น DTE ทั้งคู่ และไม่ต้องตั้ง clock rate เลย)

   โปรแกรมจึงเดาให้ก่อนตามธรรมเนียมที่ใช้กันในห้องแล็บ คือให้ Router หลักเป็นฝั่ง DCE
   แล้วเปิดให้ผู้ใช้สลับเองได้จากตาราง WAN ถ้าเสียบสายกลับด้าน */
function resolveDceEnd(linkId, firstId, secondId) {
    var chosen = state.wanDce && state.wanDce[linkId];
    if (chosen === firstId || chosen === secondId) return chosen;
    // ค่าเริ่มต้น: Router หลักเป็นฝั่งจ่ายนาฬิกา ถ้าไม่มีในลิงก์นี้ก็ใช้ปลายแรก
    if (firstId === 'router') return firstId;
    if (secondId === 'router') return secondId;
    return firstId;
}

// สลับว่าปลายไหนของลิงก์เป็นฝั่ง DCE — เรียกจากปุ่มในตาราง WAN
function toggleWanDce(linkId) {
    var link = (state.wanLinks || []).find(function (w) { return w.linkId === linkId; });
    if (!link) return;
    if (typeof pushHistory === 'function') pushHistory('สลับฝั่ง DCE');
    if (!state.wanDce) state.wanDce = {};
    var other = link.ends.find(function (e) { return e.id !== link.dceId; });
    if (!other) return;
    state.wanDce[linkId] = other.id;
    if (typeof refreshAll === 'function') refreshAll();
    if (typeof showToast === 'function') {
        showToast('ย้ายฝั่ง DCE ไปที่ ' + other.label + ' แล้ว คำสั่ง clock rate จะย้ายตามไปด้วย', 'info');
    }
}

// ค่าที่จะใส่ในคำสั่ง clock rate หน่วยเป็น bps
// 64000 เป็นค่ามาตรฐานที่ใช้กันในห้องแล็บและ Packet Tracer รับได้แน่นอน
function getWanClockRate() {
    var v = Number(state.wanClockRate);
    return WAN_CLOCK_RATES.indexOf(v) !== -1 ? v : 64000;
}

// ค่าที่อุปกรณ์ Cisco ยอมรับจริง ไม่ใช่ตัวเลขอะไรก็ได้ — ถ้าใส่ค่านอกรายการนี้ IOS จะปฏิเสธ
const WAN_CLOCK_RATES = [9600, 19200, 38400, 56000, 64000, 128000, 256000, 512000, 1024000, 2048000, 4000000];

// ลิงก์ WAN ทั้งหมดที่ Router ตัวนี้มีส่วนร่วม พร้อมบอกว่าฝั่งเราคือ IP ไหน ฝั่งตรงข้ามคือใคร
function getWanLinksOfRouter(routerId) {
    return (state.wanLinks || []).filter(function (w) {
        return w.ends.some(function (e) { return e.id === routerId; });
    }).map(function (w) {
        var mine = w.ends.find(function (e) { return e.id === routerId; });
        var peer = w.ends.find(function (e) { return e.id !== routerId; });
        return {
            link: w, myIp: mine.ip, peerIp: peer.ip, peerId: peer.id, peerLabel: peer.label,
            isDce: w.dceId === routerId   // ฝั่งเราต้องตั้ง clock rate ไหม
        };
    });
}

/* ---------- ตัวช่วยสำหรับ CLI ---------- */

// ชื่อ hostname ที่ใช้ใน config — Router หลักคง 'Router-01' ไว้เหมือนเดิม (เทสเดิมอ้างอิงชื่อนี้)
// ชื่อสำหรับ "คำสั่ง hostname" เท่านั้น — ต้องเป็นชื่อที่ IOS รับได้จริง
// เดิมแทนแค่เว้นวรรคด้วยขีด ซึ่งแก้ได้ครึ่งเดียว: ชื่อสาขาภาษาไทย (เช่น "สาขาเชียงใหม่")
// ยังหลุดไปเป็น `hostname สาขาเชียงใหม่` ซึ่ง IOS ไม่รับ — ใช้ toCiscoName() ให้ครบทุกกรณี
// (ui.js โหลดก่อน wan.js เสมอทั้งใน index.html และในชุดเทส จึงเรียกได้ปลอดภัย)
function routerHostname(routerNode) {
    if (routerNode.id === 'router') return 'Router-01';
    return toCiscoName(routerNode.label, 'Router-' + routerNode.id);
}

// ชื่อสำหรับ "ให้คนอ่าน" — ปุ่มเลือก Router, หัวข้อในไฟล์ export, คอมเมนต์ `!` ใน config
// ต้องแยกจาก routerHostname() เพราะที่เหล่านี้ไม่ใช่คำสั่ง จึงเก็บชื่อไทยที่ผู้ใช้ตั้งไว้ได้
// ถ้าใช้ตัวเดียวกันทั้งสองงาน ผู้ใช้ที่ตั้งชื่อ "สาขาเชียงใหม่" จะเห็นแท็บเป็น Router-m-3 แทน
function routerDisplayName(routerNode) {
    if (routerNode.id === 'router') return 'Router-01';
    return String(routerNode.label || '').trim() || ('Router-' + routerNode.id);
}

// เส้นทางที่ Router ตัวนี้ต้องรู้จัก เพื่อไปถึงแผนกที่อยู่หลัง Router ตัวอื่น
// ใช้ static route เพราะอ่านง่ายที่สุดและเห็นความสัมพันธ์ตรงไปตรงมา เหมาะกับการเรียนการสอน
function getStaticRoutesForRouter(routerId) {
    var routes = [];
    var myLinks = getWanLinksOfRouter(routerId);

    myLinks.forEach(function (wl) {
        getDeptsOfRouter(wl.peerId).forEach(function (d) {
            routes.push({
                network: d.subnet.network,
                netmask: d.subnet.netmask,
                nextHop: wl.peerIp,
                via: wl.peerLabel,
                deptName: d.name
            });
        });
    });
    return routes;
}
