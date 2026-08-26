/* ============================================
   6. App — ตัวเริ่มต้น รวมทุกอย่างเข้าด้วยกัน
   ไฟล์นี้ต้องโหลดสุดท้ายเท่านั้น
   ============================================ */

// สถานะหลัก
var state = {
    baseIp: '10.0.0.0',
    baseCidr: 24,
    nextId: 1,
    departments: [],
    calculated: [],
    failed: [],   // แผนกที่ VLSM จัดสรรไม่สำเร็จ + เหตุผล (calculateVLSM เป็นคนเติม ดู vlsm.js)
    selectedDeptId: null,
    selectedNodeType: null,
    detailOpen: false,
    activeTab: 'table',
    summaryRoutes: ['192.168.1.0/24', '192.168.2.0/24', '192.168.3.0/24'],
    showArrows: true, // <--- ตัวแปรสำหรับเปิดปิดลูกศร
    placingType: null, // null | 'pc' | 'server' | 'router-branch' — กำลังอยู่ในโหมดวางอุปกรณ์ใหม่หรือไม่
    connectMode: false, // กำลังอยู่ในโหมดลากเชื่อมสายหรือไม่
    linkFromId: null,   // id ของอุปกรณ์ตัวแรกที่เลือกไว้ระหว่างโหมด Connect
    theme: 'light',       // 'dark' | 'light' — applyTheme() ใน ui.js เป็นคนอัปเดตค่านี้จริง ตรงนี้แค่ default ตอนเริ่ม (Light = โหมดมาตรฐาน)

    // ----- IPv6 (แยกโหมดจาก IPv4 แต่ผลลัพธ์ทั้งสองฝั่งอยู่ครบพร้อมกันเสมอ ไม่ล้างตอนสลับโหมด เพื่อให้ CLI รวม Dual-Stack ได้ทีหลัง) -----
    ipMode: 'v4',       // 'v4' | 'v6' — โหมดที่กำลังแสดง/แก้ไขอยู่ตอนนี้
    baseIp6: '',        // ว่างจนกว่าผู้ใช้จะกด Calculate ในโหมด IPv6 ครั้งแรก (calculateIPv6() จะข้ามถ้ายังว่าง)
    basePrefixLen6: 48,
    newPrefixLen6: 64,
    calculatedV6: [],

    // ----- WAN (Router สาขา) — ดู js/wan.js -----
    wanBase: WAN_DEFAULT_BASE,   // Pool สำหรับจอง /30 ให้ลิงก์ระหว่าง Router
    wanCidr: WAN_DEFAULT_CIDR,
    wanLinks: [],                // ผลคำนวณ calculateWanLinks() เติมให้ทุกครั้งที่ refreshAll()
    wanDce: {},                  // linkId -> id ของปลายที่เป็นฝั่ง DCE (ว่างไว้ = ให้โปรแกรมเดาให้)
    wanClockRate: 64000,         // ค่า clock rate ของฝั่ง DCE หน่วยเป็น bps

    // ----- รูปแปลนอาคารที่วางไว้ใต้ผัง — ดู js/backdrop.js -----
    // { src, x, y, scale, opacity, locked } | null  (src เป็น data URI ของ JPEG ที่ย่อแล้ว)
    backdrop: null
};

// รีเฟรชทั้งหมด
// forceLayout = true -> จัดผังใหม่หมด ทิ้งตำแหน่งที่ผู้ใช้ลากเอง (ใช้ตอน Clear/โหลด Example/กด RESET)
// ปกติ (false) -> รักษาตำแหน่งที่ลากไว้ ดู layoutTopology() ใน topology.js
function refreshAll(forceLayout) {
    calculateVLSM();
    calculateIPv6();
    calculateWanLinks(); // ต้องหลัง calculateVLSM เพราะ static route อ้างซับเน็ตของแผนก
    renderSidebarDepts();
    renderTable();
    renderUtilization();
    renderWanTable();
    layoutTopology(forceLayout);
    updateDetailSubnetInfo();
    // แท็บ CLI ไม่ได้ re-render เองตอนข้อมูลเปลี่ยน เดิมเรียกจาก switchTab() ที่เดียว
    // ผลคือถ้าเปิดแท็บ CLI ค้างไว้แล้วแก้แผนก/Base IP คำสั่งที่เห็นจะเป็นของเก่าจนกว่าจะสลับแท็บไปกลับ
    if (state.activeTab === 'cli' && typeof renderCLI === 'function') renderCLI();
    scheduleAutosave(); // debounce เก็บ Snapshot ลง localStorage อัตโนมัติทุกครั้งที่ state เปลี่ยน กันรีเฟรชเผลอข้อมูลหาย
}

// คำนวณ IPv6 แยกจาก VLSM (IPv4) เสมอ — ไม่สนใจ state.ipMode ตอนนี้ เพื่อให้ผลทั้งสองฝั่งพร้อมใช้งานพร้อมกันตลอด (รองรับ CLI Dual-Stack ทีหลัง)
function calculateIPv6() {
    if (!state.baseIp6) { state.calculatedV6 = []; return; } // ยังไม่เคยตั้งค่า Base IPv6 เลย ข้ามไปเงียบๆ ไม่ต้อง error
    try {
        // ตาข่ายนิรภัยชั้นสุดท้าย เหมือนที่ calculateVLSM() ทำกับฝั่ง IPv4
        // state.baseIp6 ถูกตั้งได้จากหลายทาง (กรอกเอง, import ไฟล์, ลิงก์แชร์, autosave) ไม่ได้ผ่าน onBaseChangeV6 ทุกทาง
        var norm6 = normalizeIpv6Network(state.baseIp6, state.basePrefixLen6);
        if (norm6 !== null && norm6 !== state.baseIp6) state.baseIp6 = norm6;
        var depts = state.departments.map(function(d) { return { id: d.id, name: d.name }; });
        var out = calculateIPv6Subnets(state.baseIp6, state.basePrefixLen6, depts, state.newPrefixLen6);
        state.calculatedV6 = out.results;
        if (out.errors.length) showToast(out.errors.join('\n'), 'error');
    } catch (err) {
        console.error('calculateIPv6 error:', err);
        state.calculatedV6 = [];
        showToast('โปรแกรมคำนวณ IPv6 ไม่สำเร็จ ลองกด CALCULATE ใหม่อีกครั้ง', 'error');
    }
}

// โหลดตัวอย่าง
function toggleExampleDropdown() {
    document.getElementById('exampleDropdown').classList.toggle('open');
}

function loadExample(key) {
    var ex = EXAMPLES[key];
    if (!ex) return;
    if (typeof pushHistory === 'function') pushHistory('โหลดตัวอย่าง');
    document.getElementById('exampleDropdown').classList.remove('open');

    try {
        state.baseIp = ex.baseIp;
        state.baseCidr = ex.baseCidr;
        resetVlanRegistry();
        resetWanRegistry();
        resetManualTopology();
        state.departments = ex.departments.map(function(d) {
            return { id: state.nextId++, name: d.name, hosts: d.hosts };
        });
        state.selectedDeptId = null;
        state.selectedNodeType = null;
        closeDetailPanel();

        document.getElementById('baseIpInput').value = ex.baseIp;
        document.getElementById('baseCidrInput').value = ex.baseCidr;

        refreshAll(true); // ชุดข้อมูลใหม่ทั้งชุด จัดผังใหม่จากศูนย์

        // ตัวอย่างที่มาพร้อมผังหลาย Router — ต้องสร้างหลัง refreshAll() รอบแรกเสมอ
        // เพราะ Switch ของแต่ละแผนกเพิ่งถูกสร้างขึ้นตรงนั้น ก่อนหน้านี้ยังไม่มีอะไรให้ลากเชื่อม
        var built = buildExampleTopology(ex.topology);

        // Flash effect
        setTimeout(function() {
            document.querySelectorAll('.dept-item').forEach(function(el) {
                el.classList.add('dept-flash');
                el.addEventListener('animationend', function() { el.classList.remove('dept-flash'); }, { once: true });
            });
        }, 50);

        document.getElementById('statusBar').textContent = 'โหลดตัวอย่าง ' + ex.label + ' แล้ว มี ' + ex.departments.length + ' แผนก ใช้ Base ' + ex.baseIp + '/' + ex.baseCidr +
            (built > 0 ? ' และมี Router สาขาอีก ' + built + ' ตัว' : '');
        showToast('โหลดตัวอย่าง: ' + ex.label + (built > 0 ? ' (Router สาขา ' + built + ' ตัว ต่อสายให้เรียบร้อยแล้ว)' : ''), 'success');
    } catch (err) {
        console.error('loadExample error:', err);
        showToast('โปรแกรมโหลดตัวอย่างไม่สำเร็จ ลองเลือกชุดตัวอย่างใหม่อีกครั้ง', 'error');
    }
}

/* สร้าง Router สาขา + ลากสายตามที่ตัวอย่างกำหนด แล้วคืนจำนวน Router สาขาที่สร้างได้จริง
   ลำดับสำคัญมาก และเป็นลำดับเดียวกับที่ผู้ใช้ต้องทำเองด้วยมือ:
     1. วาง Router สาขา
     2. ลากลิงก์ WAN ไปหา Router หลักก่อน  <-- ข้อที่คนทำเองมักข้าม แล้วงงว่าทำไมใช้ไม่ได้
     3. ค่อยลากไปคุม Switch ของแผนก
   ถ้าสลับข้อ 2 กับ 3 ผลลัพธ์สุดท้ายยังเหมือนกัน แต่ระหว่างทางจะมีจังหวะที่แผนกถูกตัดขาด
   จึงยึดลำดับนี้ไว้ให้ตรงกับที่สอนในแผงรายละเอียดและในคู่มือ */
function buildExampleTopology(topo) {
    if (!topo || !Array.isArray(topo.branches) || typeof addManualNode !== 'function') return 0;

    var idByKey = {}; // key ในไฟล์ตัวอย่าง -> id จริงที่เพิ่งถูกแจกบนผัง

    // ตำแหน่งสาขาคำนวณจากผังจริง ไม่ใช่พิกัดตายตัวในไฟล์ตัวอย่าง
    // รอบแรกเคยฝังพิกัดไว้ตรง ๆ (x:1150, y:120/380/620) ซึ่งพังทันทีที่ใช้จริง:
    //   - y=380 ไปทับแถวกล่องแผนกที่ layoutTopology() วางไว้ที่ y=350 สูง 60 (คือ 320-380 พอดี)
    //   - x คงที่ไม่สนใจว่าจอกว้างแค่ไหนและมีกี่แผนก พอแผนกเยอะผังจะกระจายไปทับ
    //   - สาขาอยู่ไกลจากแผนกที่ตัวเองดูแล เส้นเลยลากพาดข้ามทั้งผังจนอ่านไม่ออก
    var BRANCH_Y = 500;      // ใต้แถวแผนก (y=350 + สูง 60) โดยเว้นช่องให้เส้นหายใจ
    var MIN_GAP = 190;       // กว้างกว่ากล่อง Router เล็กน้อย กันสองสาขาซ้อนกันเอง

    // 1. วาง Router สาขาไว้ก่อนแบบหยาบ ๆ (ตำแหน่งจริงจะจัดอีกทีตอนท้าย)
    //    ยังจัดตำแหน่งตอนนี้ไม่ได้ เพราะ layoutTopology() ยังไม่รู้ว่าแผนกไหนเป็นของสาขาไหน
    //    จนกว่าจะลากสายเสร็จ — ตำแหน่งแผนกที่อ่านได้ตอนนี้จึงยังเป็นของผังแบบ Router เดียว
    topo.branches.forEach(function(b) {
        var node = addManualNode(BranchRouterDevice, topoNodes.router ? topoNodes.router.x : 400, BRANCH_Y);
        if (!node) return;
        node.label = b.label;
        idByKey[b.key] = node.id;
    });

    // 2. ลิงก์ WAN — ทำก่อนการผูกแผนกเสมอ
    (topo.wan || []).forEach(function(pair) {
        var from = pair[0] === 'router' ? 'router' : idByKey[pair[0]];
        var to = pair[1] === 'router' ? 'router' : idByKey[pair[1]];
        if (from && to) addLink(from, to);
    });

    // 3. ผูกแผนกเข้ากับสาขาที่ดูแล — หา Switch จากชื่อแผนก (ชื่อในตัวอย่างต้องสะกดตรงกัน)
    topo.branches.forEach(function(b) {
        var routerId = idByKey[b.key];
        if (!routerId) return;
        (b.depts || []).forEach(function(deptName) {
            var dept = state.departments.find(function(d) { return d.name === deptName; });
            if (!dept) { console.warn('ตัวอย่างอ้างถึงแผนกที่ไม่มีอยู่:', deptName); return; }
            var sw = topoNodes.switches.find(function(s) { return s.deptId === dept.id; });
            if (sw) addLink(routerId, sw.id);
        });
    });

    // 4. ต้องเป็น refreshAll(true) คือ "บังคับจัดผังใหม่" ไม่ใช่ refreshAll() เปล่า
    //    layoutTopology() แบบไม่บังคับจะคืนตำแหน่งเดิมที่จำไว้ก่อนหน้า ซึ่งเป็นตำแหน่งจากตอนที่
    //    ยังไม่มี Router สาขา = ยังไม่รู้ว่าแผนกไหนเป็นของใคร การจัดกลุ่มแผนกตามเจ้าของจึงไม่มีผลเลย
    //    (เจอตอนตรวจพิกัดจริง: ลำดับในโค้ดถูกแล้ว แต่ค่า x ที่ออกมายังเป็นของผังเดิมทุกตัว)
    refreshAll(true);

    // 5. ตอนนี้แผนกถูกจัดกลุ่มตามเจ้าของแล้ว ค่อยเลื่อนสาขาไปอยู่ใต้กลุ่มของตัวเอง
    //    ต้องทำหลังข้อ 4 เท่านั้น ถ้าคำนวณก่อนจะได้พิกัดของผังเดิมที่แผนกยังกระจัดกระจาย
    var placements = topo.branches.map(function(b) {
        var xs = (b.depts || []).map(function(name) {
            var dept = state.departments.find(function(d) { return d.name === name; });
            var node = dept && topoNodes.departments.find(function(n) { return n.deptId === dept.id; });
            return node ? node.x : null;
        }).filter(function(v) { return v !== null; });

        return {
            id: idByKey[b.key],
            x: xs.length ? xs.reduce(function(s, v) { return s + v; }, 0) / xs.length
                         : (topoNodes.router ? topoNodes.router.x : 400)
        };
    }).filter(function(p) { return p.id; });

    // แผนกของสองสาขาอาจอยู่ใกล้กันจนกล่อง Router ซ้อนกัน -> ดันออกจากกันตามลำดับซ้ายไปขวา
    placements.sort(function(p, q) { return p.x - q.x; });
    for (var i = 1; i < placements.length; i++) {
        if (placements[i].x - placements[i - 1].x < MIN_GAP) {
            placements[i].x = placements[i - 1].x + MIN_GAP;
        }
    }
    placements.forEach(function(p) {
        var node = findNodeById(p.id);
        if (node) { node.x = p.x; node.y = BRANCH_Y; }
    });

    // ผังที่มีสาขาสูงกว่าผัง Router เดียวเกือบเท่าตัว (แถวสาขาอยู่ที่ y=500) ถ้าไม่จัดให้พอดีกรอบ
    // ผู้ใช้จะเปิดตัวอย่างมาแล้วเห็นแค่ครึ่งบน ไม่เห็นสาขาเลย ทั้งที่นั่นคือสิ่งที่ตัวอย่างนี้ต้องการโชว์
    if (typeof updateParticlePositions === 'function') updateParticlePositions();
    if (typeof zoomToFit === 'function') zoomToFit();
    if (typeof requestRedraw === 'function') requestRedraw();

    return Object.keys(idByKey).length;
}

function clearAll() {
    if (typeof pushHistory === 'function') pushHistory('ล้างข้อมูลทั้งหมด');
    try {
        state.departments = [];
        state.calculated = [];
        state.failed = [];
        state.selectedDeptId = null;
        state.selectedNodeType = null;
        resetVlanRegistry();
        resetWanRegistry();
        resetManualTopology();
        // รูปพื้นหลังถือเป็นส่วนหนึ่งของงาน ต้องถูกล้างไปด้วย ไม่งั้นกด CLEAR แล้วยังเห็นแปลนตึกเดิมค้างอยู่
        // (ระบบ Undo เก็บ snapshot ที่มีรูปอยู่แล้ว กด Ctrl+Z เอากลับมาได้ถ้าเผลอกด)
        if (typeof removeBackdrop === 'function' && typeof hasBackdrop === 'function' && hasBackdrop()) {
            state.backdrop = defaultBackdrop();
            if (typeof ensureBackdropImage === 'function') ensureBackdropImage();
            if (typeof renderBackdropPanel === 'function') renderBackdropPanel();
        }
        closeDetailPanel();
        refreshAll(true); // ล้างหมดแล้ว Router ควรกลับไปกลางจอตามผังมาตรฐาน
        document.getElementById('statusBar').textContent = 'ล้างข้อมูลหมดแล้ว กดปุ่ม EXAMPLE เพื่อเริ่มจากตัวอย่าง หรือเพิ่มแผนกเองได้เลย';
        showToast('ล้างข้อมูลทั้งหมดแล้ว', 'info');
    } catch (err) {
        console.error('clearAll error:', err);
        showToast('โปรแกรมล้างข้อมูลไม่สำเร็จ ลองกด CLEAR ใหม่อีกครั้ง', 'error');
    }
}

/* ============================================
   6b. Save / Load Project — Export/Import เป็นไฟล์ .json
   เก็บเฉพาะ "ข้อมูลต้นทาง" ที่คำนวณค่าที่เหลือได้เสมอผ่าน refreshAll() (ไม่เก็บ state.calculated/calculatedV6)
   ไม่เก็บตำแหน่ง Router/Switch/Department เพราะ layoutTopology() รีเซ็ตตำแหน่งพวกนี้ใหม่ทุกครั้งที่แก้ข้อมูลอยู่แล้ว (ดูคอมเมนต์ใน topology.js)
   เก็บตำแหน่ง PC/Server (manualNodes) เพราะเป็นตำแหน่งเดียวที่เสถียรจริงระหว่างใช้งาน
   ============================================ */
var PROJECT_SCHEMA_VERSION = 1;

// เพดานจำนวนแผนก — ผูกกับจำนวนสีใน DEPT_COLORS (12 สี) เพื่อไม่ให้มีสองแผนกได้สีซ้ำกัน
// เดิมตั้งไว้ 8 แบบไม่มีเหตุผลรองรับ และเป็นข้อจำกัดที่ผู้ใช้ชนบ่อยเวลาวางแผนองค์กรจริง
var MAX_DEPARTMENTS = 12;

function buildProjectSnapshot() {
    return {
        schemaVersion: PROJECT_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        baseIp: state.baseIp,
        baseCidr: state.baseCidr,
        nextId: state.nextId,
        // ต้องสำเนาเป็น object ใหม่ ไม่ใช่ส่ง state.departments ตรง ๆ
        // เดิมเป็น reference ตัวเดียวกับของจริง ซึ่งไม่มีปัญหาตอน export/บันทึกลงคลัง
        // เพราะถูก JSON.stringify ทันที แต่ระบบ Undo เก็บ snapshot ค้างไว้ในหน่วยความจำ
        // -> สภาพที่ "เก็บไว้" กลายพันธุ์ตามการแก้ไขครั้งถัดไป ทำให้ย้อนกลับแล้วไม่มีอะไรเปลี่ยน
        departments: state.departments.map(function(d) { return { id: d.id, name: d.name, hosts: d.hosts }; }),
        ipMode: state.ipMode,
        baseIp6: state.baseIp6,
        basePrefixLen6: state.basePrefixLen6,
        newPrefixLen6: state.newPrefixLen6,
        // เส้นทางในเครื่องมือ Route Summary เดิมไม่ถูกเก็บ หายทุกครั้งที่โหลดโปรเจกต์ใหม่
        // ทั้งที่เป็นข้อมูลที่ผู้ใช้พิมพ์เองและเป็นส่วนหนึ่งของงานที่ทำค้างไว้
        summaryRoutes: Array.isArray(state.summaryRoutes) ? state.summaryRoutes.slice(0, 16) : [],
        vlan: {
            entries: Array.from(vlanRegistry.entries()), // Map ไม่ใช่ JSON ได้ตรงๆ ต้องแปลงเป็น [[deptId, vlanId], ...] ก่อน
            nextVlanId: nextVlanId
        },
        manualNodes: topoNodes.manualNodes.map(function(n) {
            return { id: n.id, type: n.type, x: n.x, y: n.y, ip: n.ip, linkedDeptId: n.linkedDeptId, label: n.label };
        }),
        wanBase: state.wanBase,
        wanCidr: state.wanCidr,
        // ฝั่ง DCE ที่ผู้ใช้เลือกเอง ต้องเก็บด้วย ไม่งั้นเปิดไฟล์กลับมาแล้วคำสั่ง clock rate
        // จะย้ายกลับไปอยู่ฝั่งที่โปรแกรมเดา ซึ่งอาจไม่ตรงกับสายที่เสียบไว้จริง
        wanDce: Object.assign({}, state.wanDce),
        wanClockRate: state.wanClockRate,
        wan: {
            entries: Array.from(wanRegistry.entries()), // linkId -> index ของ block /30 (คงที่ตลอดชีพลิงก์)
            nextIndex: nextWanIndex
        },
        nextManualNodeId: nextManualNodeId,
        links: topoNodes.links.map(function(l) {
            return { id: l.id, fromId: l.fromId, toId: l.toId };
        }),
        nextLinkId: nextLinkId,
        // รูปแปลนอาคาร — เป็นช่องเดียวในทั้ง snapshot ที่ใหญ่ระดับหลักแสนไบต์ (ที่เหลือรวมกันราว 2 KB)
        // สำเนาเป็น object ใหม่ด้วยเหตุผลเดียวกับ departments: ระบบ Undo เก็บ snapshot ค้างในหน่วยความจำ
        // ถ้าส่ง reference ตรง ๆ สภาพที่เก็บไว้จะกลายพันธุ์ตามการลากรูปครั้งถัดไป
        backdrop: (function() {
            var b = state.backdrop;
            if (!b || !b.src) return null;
            return { src: b.src, x: b.x, y: b.y, scale: b.scale, opacity: b.opacity, locked: b.locked };
        })()
    };
}

function exportProject() {
    try {
        // เดิมไม่เช็คอะไรเลย กดตอนยังไม่มีข้อมูลก็ได้ไฟล์เปล่า 362 bytes ติดเครื่องไปโดยไม่มีประโยชน์
        // (copyShareLink() เช็คอยู่แล้ว ตรงนี้ควรทำเหมือนกันเพื่อความสม่ำเสมอ)
        if (state.departments.length === 0 && topoNodes.manualNodes.length === 0) {
            showToast('ยังไม่มีข้อมูลให้บันทึก ลองกดปุ่ม EXAMPLE เพื่อโหลดตัวอย่าง หรือเพิ่มแผนกเองก่อน', 'error');
            return;
        }
        var data = buildProjectSnapshot();

        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var stamp = data.savedAt.slice(0, 19).replace(/[:T]/g, '-');
        var a = document.createElement('a');
        a.href = url;
        a.download = 'netforge-project-' + stamp + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

        showToast('บันทึกโปรเจกต์เป็นไฟล์แล้ว', 'success');
    } catch (err) {
        console.error('exportProject error:', err);
        showToast('โปรแกรมบันทึกไฟล์ไม่สำเร็จ ลองกด SAVE ใหม่อีกครั้ง ถ้ายังไม่ได้ให้ตรวจว่าเบราว์เซอร์บล็อกการดาวน์โหลดอยู่หรือเปล่า', 'error');
    }
}

function triggerImportProject() {
    var input = document.getElementById('importFileInput');
    if (!input) return;
    input.value = ''; // เคลียร์ก่อนเสมอ กันเลือกไฟล์ชื่อเดิมซ้ำสองครั้งติดแล้ว 'change' ไม่ยิง
    input.click();
}

function onImportFileSelected(inputEl) {
    var file = inputEl.files && inputEl.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var data;
        try {
            data = JSON.parse(e.target.result);
        } catch (err) {
            console.error('importProject parse error:', err);
            showToast('เปิดไฟล์นี้ไม่ได้ เพราะไม่ใช่ไฟล์ที่บันทึกจากโปรแกรมนี้', 'error');
            return;
        }
        applyProjectData(data);
        // เปลี่ยนโปรเจกต์คนละชิ้นแล้ว การย้อนกลับไปหาของเก่าไม่มีความหมายและทำให้สับสน
        if (typeof clearHistory === 'function') clearHistory();
    };
    reader.onerror = function() {
        showToast('อ่านไฟล์ไม่สำเร็จ ไฟล์อาจเสียหาย ลองเปิดไฟล์อื่นที่บันทึกจากโปรแกรมนี้', 'error');
    };
    reader.readAsText(file);
}

// ตรวจโครงสร้างขั้นต่ำก่อน apply จริง — กันไฟล์ผิดรูปแบบ/ไฟล์คนละแอปทำ state พังระหว่างโหลด
function isValidProjectData(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.schemaVersion !== 'number') return false;
    if (!isValidIp(data.baseIp)) return false;
    if (!Number.isInteger(data.baseCidr) || data.baseCidr < 8 || data.baseCidr > 30) return false;
    if (!Array.isArray(data.departments)) return false;
    for (var i = 0; i < data.departments.length; i++) {
        var d = data.departments[i];
        if (!d || typeof d.id !== 'number' || typeof d.name !== 'string' || isNaN(parseInt(d.hosts))) return false;
    }
    if (!Array.isArray(data.manualNodes) || !Array.isArray(data.links)) return false;
    return true;
}

function applyProjectData(data) {
    if (!isValidProjectData(data)) {
        showToast('เปิดไฟล์นี้ไม่ได้ ข้อมูลข้างในไม่ตรงกับที่โปรแกรมรู้จัก', 'error');
        return;
    }
    try {
        resetVlanRegistry();
        resetWanRegistry();
        resetManualTopology();
        state.selectedDeptId = null;
        state.selectedNodeType = null;
        closeDetailPanel();

        state.baseIp = data.baseIp;
        state.baseCidr = data.baseCidr;
        state.departments = data.departments.map(function(d) {
            return { id: d.id, name: String(d.name).trim() || ('Dept-' + d.id), hosts: Math.min(Math.max(parseInt(d.hosts) || 1, 1), 65534) };
        });
        if (state.departments.length > MAX_DEPARTMENTS) {
            state.departments = state.departments.slice(0, MAX_DEPARTMENTS);
            showToast('ไฟล์นี้มีแผนกมากกว่า ' + MAX_DEPARTMENTS + ' แผนก โปรแกรมรับได้สูงสุดเท่านี้ จึงใช้แค่ ' + MAX_DEPARTMENTS + ' แผนกแรก', 'info');
        }

        var maxDeptId = state.departments.reduce(function(m, d) { return Math.max(m, d.id); }, 0);
        state.nextId = Number.isInteger(data.nextId) && data.nextId > maxDeptId ? data.nextId : maxDeptId + 1;

        state.ipMode = data.ipMode === 'v6' ? 'v6' : 'v4';
        state.baseIp6 = typeof data.baseIp6 === 'string' ? data.baseIp6 : '';
        state.basePrefixLen6 = Number.isInteger(data.basePrefixLen6) ? data.basePrefixLen6 : 48;
        state.newPrefixLen6 = Number.isInteger(data.newPrefixLen6) ? data.newPrefixLen6 : 64;

        // ไฟล์เก่าที่บันทึกก่อนเพิ่มฟิลด์นี้จะไม่มี summaryRoutes -> คงค่าเดิมไว้ ไม่ล้างทิ้ง
        if (Array.isArray(data.summaryRoutes)) {
            state.summaryRoutes = data.summaryRoutes
                .filter(function(r) { return typeof r === 'string' && parseCidrText(r); })
                .slice(0, 16);
            if (typeof renderSummaryInputs === 'function') renderSummaryInputs();
        }

        // รูปแปลนอาคาร — ไฟล์เก่าที่บันทึกก่อนมีฟีเจอร์นี้จะไม่มีช่อง backdrop เลย ถือเป็น "ไม่มีรูป"
        // ตรวจ src ว่าเป็น data URI ของรูปจริง ๆ ก่อนรับ กันไฟล์ที่ถูกแก้มาให้ชี้ไป URL ภายนอก
        // (ถึงจะมี CSP img-src กันอีกชั้น แต่ไม่ควรพึ่งด่านเดียว และไม่ควรยิง request ออกไปตั้งแต่แรก)
        if (data.backdrop && typeof data.backdrop.src === 'string' && /^data:image\//.test(data.backdrop.src)) {
            state.backdrop = {
                src: data.backdrop.src,
                x: Number(data.backdrop.x) || 0,
                y: Number(data.backdrop.y) || 0,
                scale: Math.max(0.1, Math.min(4, Number(data.backdrop.scale) || 1)),
                opacity: Math.max(0.05, Math.min(1, Number(data.backdrop.opacity) || 0.35)),
                locked: data.backdrop.locked !== false
            };
        } else {
            state.backdrop = typeof defaultBackdrop === 'function' ? defaultBackdrop() : null;
        }
        if (typeof ensureBackdropImage === 'function') ensureBackdropImage();
        if (typeof renderBackdropPanel === 'function') renderBackdropPanel();

        if (data.vlan && Array.isArray(data.vlan.entries)) {
            data.vlan.entries.forEach(function(pair) {
                if (Array.isArray(pair) && pair.length === 2) vlanRegistry.set(pair[0], pair[1]);
            });
        }
        state.wanBase = (typeof data.wanBase === 'string' && isValidIp(data.wanBase)) ? data.wanBase : WAN_DEFAULT_BASE;
        state.wanCidr = Number.isInteger(data.wanCidr) ? data.wanCidr : WAN_DEFAULT_CIDR;
        // ไฟล์เก่าที่บันทึกก่อนมีฟีเจอร์นี้จะไม่มีสองช่องนี้ ให้ตกกลับไปใช้ค่าที่โปรแกรมเดาให้
        state.wanDce = (data.wanDce && typeof data.wanDce === 'object' && !Array.isArray(data.wanDce))
            ? Object.assign({}, data.wanDce) : {};
        state.wanClockRate = (typeof WAN_CLOCK_RATES !== 'undefined' && WAN_CLOCK_RATES.indexOf(Number(data.wanClockRate)) !== -1)
            ? Number(data.wanClockRate) : 64000;
        if (data.wan && Array.isArray(data.wan.entries)) {
            data.wan.entries.forEach(function(pair) {
                if (Array.isArray(pair) && pair.length === 2) wanRegistry.set(pair[0], pair[1]);
            });
        }
        var maxWan = -1;
        wanRegistry.forEach(function(v) { maxWan = Math.max(maxWan, v); });
        nextWanIndex = (data.wan && Number.isInteger(data.wan.nextIndex) && data.wan.nextIndex > maxWan) ? data.wan.nextIndex : maxWan + 1;

        var maxVlan = 0;
        vlanRegistry.forEach(function(v) { maxVlan = Math.max(maxVlan, v); });
        nextVlanId = (data.vlan && Number.isInteger(data.vlan.nextVlanId) && data.vlan.nextVlanId > maxVlan) ? data.vlan.nextVlanId : maxVlan + 10;

        // สร้าง instance จริงของ PCDevice/ServerDevice (ไม่ใช่ก็อบปี้ object เฉยๆ) เพราะตอน render ต้องเรียก method อย่าง getIpLabel()
        var DEVICE_CLASSES = { pc: PCDevice, server: ServerDevice, 'router-branch': BranchRouterDevice };
        data.manualNodes.forEach(function(n) {
            if (!n || typeof n.id !== 'string' || !DEVICE_CLASSES[n.type]) return;
            var DeviceClass = DEVICE_CLASSES[n.type];
            var node = new DeviceClass(n.id, Number(n.x) || 0, Number(n.y) || 0);
            node.ip = (typeof n.ip === 'string' && isValidIp(n.ip)) ? n.ip : null;
            node.linkedDeptId = Number.isInteger(n.linkedDeptId) ? n.linkedDeptId : null;
            if (typeof n.label === 'string' && n.label.trim()) node.label = n.label.trim().slice(0, 40);
            topoNodes.manualNodes.push(node);
        });
        var maxNodeNum = 0;
        topoNodes.manualNodes.forEach(function(n) {
            var num = parseInt(String(n.id).replace('m-', ''), 10);
            if (!isNaN(num)) maxNodeNum = Math.max(maxNodeNum, num);
        });
        nextManualNodeId = Number.isInteger(data.nextManualNodeId) && data.nextManualNodeId > maxNodeNum ? data.nextManualNodeId : maxNodeNum + 1;

        // Link เฉพาะคู่ที่ปลายทางมีอยู่จริงหลังสร้าง manualNodes/switch แล้วเท่านั้น กัน dangling reference จากไฟล์ที่แก้มือ/เสียหาย
        var validIds = { router: true };
        topoNodes.manualNodes.forEach(function(n) { validIds[n.id] = true; });
        state.departments.forEach(function(d) { validIds['sw-' + d.id] = true; });
        data.links.forEach(function(l) {
            if (l && validIds[l.fromId] && validIds[l.toId] && typeof l.id === 'string') {
                topoNodes.links.push({ id: l.id, fromId: l.fromId, toId: l.toId });
            }
        });
        var maxLinkNum = 0;
        topoNodes.links.forEach(function(l) {
            var num = parseInt(String(l.id).replace('link-', ''), 10);
            if (!isNaN(num)) maxLinkNum = Math.max(maxLinkNum, num);
        });
        nextLinkId = Number.isInteger(data.nextLinkId) && data.nextLinkId > maxLinkNum ? data.nextLinkId : maxLinkNum + 1;

        document.getElementById('baseIpInput').value = state.baseIp;
        document.getElementById('baseCidrInput').value = state.baseCidr;
        if (document.getElementById('baseIp6Input')) document.getElementById('baseIp6Input').value = state.baseIp6;
        if (document.getElementById('basePrefixInput')) document.getElementById('basePrefixInput').value = state.basePrefixLen6;
        if (document.getElementById('newPrefixInput')) document.getElementById('newPrefixInput').value = state.newPrefixLen6;
        setIpMode(state.ipMode, true); // silent — ไม่ toast ซ้อนกับ toast โหลดสำเร็จด้านล่าง

        refreshAll(true); // โปรเจกต์ใหม่ทั้งก้อน (ไฟล์ไม่ได้เก็บตำแหน่ง Router/Switch อยู่แล้ว)
        document.getElementById('statusBar').textContent = 'เปิดไฟล์โปรเจกต์แล้ว มี ' + state.departments.length + ' แผนก ใช้ Base ' + state.baseIp + '/' + state.baseCidr;
        showToast('โหลดโปรเจกต์สำเร็จ', 'success');
    } catch (err) {
        console.error('applyProjectData error:', err);
        showToast('เปิดโปรเจกต์ไม่สำเร็จ ข้อมูลในไฟล์อาจไม่ครบ ลองเปิดไฟล์สำรองอันอื่น หรือกด CLEAR แล้วเริ่มใหม่', 'error');
    }
}

/* ============================================
   6c. Autosave — เก็บ Snapshot ลง localStorage อัตโนมัติ กันรีเฟรชเผลอข้อมูลหาย
   ใช้ buildProjectSnapshot() ก้อนเดียวกับ exportProject() ไม่เขียนซ้ำ เป็นแค่ตาข่ายนิรภัยสำรอง ไม่ทับ Save/Load ไฟล์ .json
   ============================================ */
var AUTOSAVE_KEY = 'netforge_autosave';
var autosaveTimer = null;

function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function() {
        try {
            if (state.departments.length === 0 && topoNodes.manualNodes.length === 0) {
                localStorage.removeItem(AUTOSAVE_KEY); // ไม่มีอะไรให้เก็บ (เช่นหลัง Clear All) ล้าง autosave เก่าทิ้งด้วย กันกู้คืนข้อมูลเปล่าตอนเปิดใหม่
                return;
            }
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildProjectSnapshot()));
        } catch (e) { /* localStorage เต็ม/ปิดใช้งาน — ไม่ toast กวนตา แค่ไม่มีตาข่ายนิรภัยรอบนี้ */ }
    }, 600);
}

function tryRestoreAutosave() {
    try {
        var raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return;
        var data = JSON.parse(raw);
        if (!isValidProjectData(data)) return;
        applyProjectData(data);
        showToast('เปิดโปรเจกต์ที่ค้างไว้ครั้งก่อนกลับมาให้แล้ว (' + data.departments.length + ' แผนก) ถ้าอยากเริ่มใหม่ให้กดปุ่ม CLEAR', 'info');
    } catch (err) {
        console.error('tryRestoreAutosave error:', err);
    }
}

// สร้าง dropdown HTML
/* จำนวนชุดตัวอย่างต่อหนึ่งหน้าของเมนู
   3 ชุดทำให้เมนูสูงราว 300px ซึ่งพอดีกับจอทุกขนาดรวมถึงโน้ตบุ๊กจอเตี้ย
   และยังเห็นได้พร้อมกันมากพอที่จะเทียบกันได้ ไม่ใช่ทีละชุด */
var EX_PER_PAGE = 3;
var examplePage = 0;
var EX_DETAIL_HINT = 'ชี้เมาส์ค้างที่ชุดตัวอย่างเพื่อดูรายชื่อแผนกและช่วง IP ตั้งต้น';

function buildExampleDropdown() {
    // เก็บแค่ไอคอน — สีเคยเขียนซ้ำเหมือนกันทั้ง 6 บรรทัด ทำให้ดูเหมือนตั้งได้รายตัวทั้งที่ไม่เคยต่างกันเลย
    var icons = {
        company: 'fa-building',
        school: 'fa-graduation-cap',
        hospital: 'fa-hospital',
        small: 'fa-store',
        factory: 'fa-industry',
        enterprise: 'fa-city',
        branch2: 'fa-code-branch',
        branch3: 'fa-sitemap',
        retail: 'fa-store'
    };

    var keys = Object.keys(EXAMPLES);
    var totalPages = Math.max(1, Math.ceil(keys.length / EX_PER_PAGE));
    // กันหน้าค้างเกินขอบเมื่อจำนวนชุดตัวอย่างเปลี่ยน
    if (examplePage >= totalPages) examplePage = 0;
    if (examplePage < 0) examplePage = totalPages - 1;

    var start = examplePage * EX_PER_PAGE;
    var pageKeys = keys.slice(start, start + EX_PER_PAGE);

    var html = '';
    pageKeys.forEach(function(key) {
        var ex = EXAMPLES[key];
        // เดิมไม่มี fallback: เพิ่มตัวอย่างใหม่แล้วลืมเติมไอคอน -> ic เป็น undefined -> throw
        // ตรงกลาง buildExampleDropdown() ซึ่งถูกเรียกจาก init() ผลคือ **แอปไม่ขึ้นทั้งหน้า**
        // เพราะ init() ตายก่อนทำงานที่เหลือ ความผิดพลาดเล็กที่ลงโทษแรงเกินเหตุ จึงต้องมีค่าสำรอง
        var icon = icons[key] || 'fa-diagram-project';
        var branchCount = ex.topology && Array.isArray(ex.topology.branches) ? ex.topology.branches.length : 0;

        // รายชื่อแผนกกับ Base ไม่ได้อยู่ในรายการแล้ว ย้ายไปขึ้นในแถบล่างตอนชี้เมาส์
        // เพราะสองอย่างนั้นกินที่ 50-90px ต่อชุด ซึ่งเป็นสาเหตุที่เมนูยาวเกินจอ
        html += '<div class="ex-item" tabindex="0"' +
            ' onclick="loadExample(\'' + key + '\')"' +
            ' onmouseenter="showExampleDetail(\'' + key + '\')"' +
            ' onfocus="showExampleDetail(\'' + key + '\')"' +
            ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();loadExample(\'' + key + '\');}">' +
            '<div class="ex-icon"><i class="fas ' + icon + '" aria-hidden="true"></i></div>' +
            '<div class="min-w-0"><div class="ex-title">' + escapeHtml(ex.label) +
                // ป้ายบอกว่าตัวอย่างนี้มาพร้อมผังหลาย Router — เป็นเหตุผลหลักที่คนเลือกตัวอย่างพวกนี้
                (branchCount > 0
                    ? ' <span class="ex-badge">' + branchCount + ' สาขา</span>'
                    : '') + '</div>' +
            (ex.hint ? '<div class="ex-desc">' + escapeHtml(ex.hint) + '</div>' : '') +
            '</div></div>';
    });

    // แถบรายละเอียด ความสูงคงที่ ไม่ให้รายการด้านบนขยับตอนชี้เมาส์ไปมา
    html += '<div class="ex-detail" id="exampleDetail">' + EX_DETAIL_HINT + '</div>';

    // แถบเปลี่ยนหน้า — หยุด event ไม่ให้ทะลุไปโดนตัวรายการหรือทำให้เมนูปิด
    html += '<div class="ex-nav" onclick="event.stopPropagation()">' +
        '<button type="button" class="ex-nav-btn" onclick="changeExamplePage(-1)" title="ชุดก่อนหน้า" aria-label="ชุดตัวอย่างก่อนหน้า">' +
            '<i class="fas fa-chevron-left" aria-hidden="true"></i></button>' +
        '<span class="ex-nav-label" role="status" aria-live="polite">' +
            (start + 1) + '–' + (start + pageKeys.length) + ' จาก ' + keys.length + '</span>' +
        '<button type="button" class="ex-nav-btn" onclick="changeExamplePage(1)" title="ชุดถัดไป" aria-label="ชุดตัวอย่างถัดไป">' +
            '<i class="fas fa-chevron-right" aria-hidden="true"></i></button>' +
        '</div>';

    document.getElementById('exampleDropdown').innerHTML = html;
}

/* ---------- เปลี่ยนหน้าและแถบรายละเอียดของเมนูตัวอย่าง ----------
   เมนูเดิมแสดงทั้ง 9 ชุดพร้อมกัน แต่ละชุดมีทั้งคำอธิบาย รายชื่อแผนก และบรรทัด Base
   รวมแล้วสูง 1,202px ขณะที่จอมีที่ให้ราว 950px และ .example-dropdown ตั้ง overflow: hidden ไว้
   ส่วนที่เกินจึงถูกตัดทิ้ง ไม่ใช่แค่ล้นแล้วเลื่อนดูได้ ผลคือชุดสุดท้ายกดเลือกไม่ได้เลย */
function changeExamplePage(delta) {
    var total = Math.max(1, Math.ceil(Object.keys(EXAMPLES).length / EX_PER_PAGE));
    // วนกลับมาต้นเมื่อเลยขอบ ทั้งสองทิศทาง
    examplePage = ((examplePage + delta) % total + total) % total;
    buildExampleDropdown();
}

function showExampleDetail(key) {
    var el = document.getElementById('exampleDetail');
    var ex = EXAMPLES[key];
    if (!el) return;
    if (!ex) { el.innerHTML = EX_DETAIL_HINT; return; }
    el.innerHTML = '<span class="ex-detail-label">แผนก</span> ' +
        escapeHtml(ex.departments.map(function(d) { return d.name; }).join(', ')) +
        ' <span class="ex-detail-label">Base</span> ' + escapeHtml(ex.baseIp + '/' + ex.baseCidr);
}

/* Toast

   ทำไมเวลาแสดงผลถึงไม่คงที่ (อ่านก่อนแก้กลับเป็นตัวเลขเดียว):

   เดิมตั้งไว้ตายตัว 2500 ms ทุกข้อความ ซึ่งพอดีกับข้อความสั้นอย่าง "คำนวณเรียบร้อยแล้ว"
   แต่ข้อความแจ้งข้อผิดพลาดต้องบอกสองอย่างเสมอ คือเกิดอะไรขึ้น และต้องทำอะไรต่อ
   มันจึงยาวกว่ามาก เช่น

     "บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลในเบราว์เซอร์น่าจะเต็ม ลองลบโปรเจกต์เก่าที่ไม่ใช้แล้วออกก่อน"

   91 ตัวอักษร อ่านไม่ทันใน 2.5 วินาที กล่องหายไปก่อนที่ผู้ใช้จะรู้ว่าต้องทำอะไร
   เท่ากับข้อความที่เขียนดีขึ้นกลับไม่มีประโยชน์ เพราะไม่มีใครได้อ่าน

   จึงคิดเวลาจากความยาวข้อความแทน แล้วจำกัดไว้สองด้าน
     ขั้นต่ำ 2500 ms  ข้อความสั้นไม่ควรหายเร็วกว่าเดิม
     ขั้นสูง 9000 ms  ต่อให้ยาวมากก็ไม่ควรค้างจนบังหน้าจอ

   และเปิดให้คลิกที่กล่องเพื่อปิดทิ้งได้ทันที สำหรับคนที่อ่านจบก่อนเวลา */
function showToast(msg, type) {
    type = type || 'success';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = msg;
    toast.title = 'คลิกเพื่อปิด';
    container.appendChild(toast);
    requestAnimationFrame(function() { toast.classList.add('show'); });

    var ms = 2000 + String(msg).length * 55;
    if (ms < 2500) ms = 2500;
    if (ms > 9000) ms = 9000;

    var timer = null;
    var closing = false;
    function dismissToast() {
        if (closing) return;   // กันกดซ้ำระหว่างที่กำลังเฟดออกอยู่
        closing = true;
        clearTimeout(timer);
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
    }
    timer = setTimeout(dismissToast, ms);
    toast.addEventListener('click', dismissToast);
}

function toggleExportMenu() {
    document.getElementById('exportDropdown').classList.toggle('open');
}
function closeExportMenu() {
    document.getElementById('exportDropdown').classList.remove('open');
}

// ปิด dropdown เมื่อคลิกข้างนอก
document.addEventListener('click', function(e) {
    var wrapper = document.getElementById('exampleWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        document.getElementById('exampleDropdown').classList.remove('open');
    }
    var exWrap = document.getElementById('exportWrapper');
    if (exWrap && !exWrap.contains(e.target)) closeExportMenu();
});

// ปุ่ม Escape — ทางออกมาตรฐานที่ผู้ใช้คาดหวังจากทุกแอป แต่เดิมไม่มีเลย
// ไล่ปิดทีละชั้นจากบนลงล่าง (modal -> โหมดค้าง -> พาเนล) ไม่ปิดทุกอย่างรวดเดียว
// เพื่อให้กด Esc ซ้ำ ๆ แล้วถอยออกทีละขั้นได้ตามสัญชาตญาณ
function setupGlobalKeys() {
    document.addEventListener('keydown', function (e) {
        // ----- คีย์ลัดที่ใช้ร่วมกับ Ctrl/Cmd -----
        // ข้ามเมื่อกำลังพิมพ์อยู่ในช่องกรอก ยกเว้น Ctrl+Z/Y ที่ควรใช้ได้ทุกที่
        var el = document.activeElement;
        var typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
        var mod = e.ctrlKey || e.metaKey;

        if (mod) {
            var k = String(e.key).toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
            if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
            if (k === 's') { e.preventDefault(); openLibrary(); return; }          // บันทึกลงคลัง
            if (k === 'e') { e.preventDefault(); exportTopologyPNG(); return; }    // ออกเป็นรูป
            if (k === 'f' && !typing) { e.preventDefault(); zoomToFit(); return; } // จัดผังพอดีกรอบ
            return;
        }

        // ----- คีย์เดี่ยว (เฉพาะตอนไม่ได้พิมพ์อยู่ในช่องกรอก) -----
        if (!typing) {
            if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); showOnboarding(); return; }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // ลบสิ่งที่เลือกอยู่บนผัง — ทางลัดที่ผู้ใช้คาดหวังจากทุกโปรแกรมวาด
                if (state.selectedNodeType === 'pc' || state.selectedNodeType === 'server' || state.selectedNodeType === 'router-branch') {
                    e.preventDefault(); onRemoveManualNode(state.selectedDeptId); return;
                }
                if (state.selectedNodeType === 'department' && state.selectedDeptId) {
                    e.preventDefault(); onRemoveDept(state.selectedDeptId); return;
                }
            }
        }

        if (e.key !== 'Escape') return;
        try {
            var lib = document.getElementById('libraryOverlay');
            if (lib && !lib.classList.contains('hidden')) { closeLibrary(); return; }

            var onboard = document.getElementById('onboardOverlay');
            if (onboard && !onboard.classList.contains('hidden')) { closeOnboarding(); return; }

            var dd = document.getElementById('exampleDropdown');
            if (dd && dd.classList.contains('open')) { dd.classList.remove('open'); return; }

            if (state.placingType || state.connectMode) {
                state.placingType = null;
                state.connectMode = false;
                state.linkFromId = null;
                if (typeof updateModeButtons === 'function') updateModeButtons();
                document.getElementById('statusBar').textContent = 'ยกเลิกแล้ว';
                return;
            }

            if (state.detailOpen) closeDetailPanel();
        } catch (err) {
            console.error('Escape handler error:', err);
        }
    });
}

// เริ่มต้นทุกอย่าง
function init() {
    try {
        // ต้องเรียกก่อนอย่างอื่นทั้งหมด เพราะ setupCanvas() ด้านล่างจะ trigger layoutTopology() ครั้งแรกทันที
        // ถ้าไม่สลับ DEPT_COLORS/ROUTER_COLOR ให้ถูกก่อน node แรกจะได้สีผิดธีมไปเลย
        var savedTheme = 'light';
        try { savedTheme = localStorage.getItem('netforge_theme') || 'light'; } catch (e) { /* เช่นกัน อ่านไม่ได้ก็ fallback เป็น light (ค่ามาตรฐาน) เงียบๆ */ }
        applyTheme(savedTheme);

        buildExampleDropdown();
        setupCanvas();
        setupCanvasEvents();

        // เรียกใช้ Resizer (จากไฟล์ ui.js)
        if (typeof initResizers === 'function') initResizers();

        window.addEventListener('resize', function() {
            resizeCanvas();
            // ถ้าแผงล่างกำลังขยายเต็มจออยู่ ต้องคำนวณความสูงใหม่ตามขนาดหน้าต่างที่เปลี่ยน
            // ไม่งั้นย่อหน้าต่างลงแล้วแผงจะล้นออกนอกจอ หรือขยายหน้าต่างแล้วเหลือช่องว่างค้าง
            if (typeof isBottomPanelMaximized === 'function' && isBottomPanelMaximized()) {
                setBottomPanelHeight(maxBottomPanelHeight());
            }
        });

        document.getElementById('baseIpInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('baseCidrInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('baseIp6Input').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('basePrefixInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('newPrefixInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') onBaseChange(); });
        document.getElementById('newDeptHosts').addEventListener('keydown', function(e) { if (e.key === 'Enter') onAddDept(); });
        document.getElementById('newDeptName').addEventListener('keydown', function(e) { if (e.key === 'Enter') onAddDept(); });

        // แท็บ Net Tools — กด Enter ในช่องกรอกให้ทำงานเลย เหมือนช่องอื่นทั้งแอป
        var wcEl = document.getElementById('wcInput');
        if (wcEl) wcEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') calcWildcard(); });
        var sumEl = document.getElementById('summaryNew');
        if (sumEl) sumEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') addSummaryRoute(); });

        renderSidebarDepts();
        renderTable();
        renderUtilization();
        renderWanTable();
        layoutTopology();
        renderFrame();

        document.getElementById('statusBar').textContent = 'พร้อมใช้งาน ถ้ายังไม่รู้จะเริ่มยังไง ลองกดปุ่ม EXAMPLE เพื่อโหลดตัวอย่างดูก่อน';

        // ลิงก์แชร์ (#p=...) ต้องชนะ Autosave เสมอ — ผู้ใช้กดลิงก์นั้นเพราะตั้งใจจะเปิดงานชิ้นนั้น
        // ถ้าปล่อยให้ Autosave ทับ จะกลายเป็นเปิดลิงก์แล้วเห็นงานเก่าของตัวเอง ซึ่งสับสนหนัก
        var loadedFromUrl = (typeof tryLoadFromUrl === 'function') ? tryLoadFromUrl() : false;
        if (!loadedFromUrl) tryRestoreAutosave();
        if (!loadedFromUrl) maybeShowOnboardingOnFirstVisit();

        setupGlobalKeys();
    } catch (err) {
        console.error('init() ล้มเหลว:', err);
        document.body.innerHTML = '<div style="padding:40px;font-family:\'Share Tech Mono\',monospace;color:#F0575C;background:#0f1115;min-height:100vh;">' +
            '<h2 style="margin-bottom:10px;">NetForge โหลดไม่สำเร็จ</h2>' +
            '<p style="color:#d8dae0;">เกิดข้อผิดพลาดตอนเริ่มต้นระบบ ลองรีเฟรชหน้าเว็บดูก่อน ข้อมูลที่บันทึกไว้ยังอยู่ครบ ไม่ได้หายไปไหน ถ้ายังไม่หายให้แจ้งผู้พัฒนาพร้อมข้อความด้านล่างนี้</p>' +
            '<p style="opacity:0.6;font-size:14px;margin-top:10px;">' + (err && err.message ? err.message : String(err)) + '</p></div>';
    }
}

init();