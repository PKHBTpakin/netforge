/* ============================================
   0. Devices — โครงสร้างข้อมูลอุปกรณ์เครือข่าย
   แยก Properties/Behaviors ของ Router และ Switch ออกจากกัน
   ไฟล์นี้ต้องโหลดก่อน topology.js (แต่หลัง vlsm.js)
   ============================================ */

// เก็บ VLAN ID ของแต่ละแผนกแบบถาวร ผูกกับ deptId ตลอดชีพ
// ไม่คำนวณจากตำแหน่งในอาเรย์ -> ป้องกันเลข VLAN เลื่อนเองเมื่อลบ/เรียงแผนกใหม่
const vlanRegistry = new Map(); // deptId -> vlanId
let nextVlanId = 10;

function assignVlanId(deptId) {
    if (!vlanRegistry.has(deptId)) {
        vlanRegistry.set(deptId, nextVlanId);
        nextVlanId += 10;
    }
    return vlanRegistry.get(deptId);
}

// เรียกตอน Clear All หรือโหลด Example ใหม่ ให้ VLAN เริ่มนับจาก 10 ใหม่
function resetVlanRegistry() {
    vlanRegistry.clear();
    nextVlanId = 10;
}

/* ----- สีประจำแผนก -----
   บั๊กที่แก้: เดิมทุกที่หยิบสีด้วย DEPT_COLORS[index] โดยที่ "index" มาจากคนละอาเรย์กัน
     ตาราง IPv4 / ผัง / sidebar  ใช้ index ใน state.calculated  (เรียงตามขนาด subnet ใหญ่->เล็ก)
     ตาราง IPv6                  ใช้ index ใน state.calculatedV6 (เรียงตามลำดับที่เพิ่มแผนก)
   สองลำดับนี้ไม่ตรงกันเมื่อผู้ใช้ไม่ได้เพิ่มแผนกเรียงตามขนาด -> แผนกเดียวกันได้คนละสีในสองแท็บ
   (ตัวอย่าง Corporate Network: 3 จาก 6 แผนกสีไม่ตรงกัน) และพอสลับไปโหมด IPv6
   สีบนผัง (ยึด v4) ก็ไม่ตรงกับสีในตาราง (ยึด v6) อีก

   วิธีแก้: ผูกสีกับ "ตัวแผนก" ไม่ใช่ตำแหน่งในอาเรย์ โดยอาศัย vlanId ที่ผูกกับ deptId ตลอดชีพอยู่แล้ว
   (10,20,30,... -> index 0,1,2,...) ได้ประโยชน์ 3 อย่างฟรี ๆ:
     - ไม่ต้องเพิ่ม state ใหม่ และไม่ต้องแก้ schema ของไฟล์บันทึก (vlanRegistry ถูกเก็บอยู่แล้ว)
     - ลบแผนกกลางแถวแล้วสีของแผนกอื่นไม่เลื่อนตาม (เหตุผลเดียวกับที่ VLAN ไม่เลื่อน)
     - โหลดโปรเจกต์เก่ากลับมาได้สีเดิมเป๊ะ
   assignVlanId() เป็น idempotent อยู่แล้ว เรียกตรงนี้ได้ปลอดภัยแม้แผนกจะยังไม่มี Switch บนผัง
   (renderTable ทำงานก่อน layoutTopology ใน refreshAll) */
function getDeptColorIndex(deptId) {
    return Math.floor(assignVlanId(deptId) / 10) - 1;
}

function getDeptColor(deptId) {
    var i = getDeptColorIndex(deptId);
    if (!(i >= 0)) i = 0;
    return DEPT_COLORS[i % DEPT_COLORS.length];
}

// ----- สีของอุปกรณ์ตายตัว (Router/PC/Server) แยกชุด Dark/Light -----
// ตัวที่ constructor ใช้จริงคือ ROUTER_COLOR/PC_COLOR/SERVER_COLOR (let เปลี่ยนค่าได้)
// applyTheme() ใน ui.js จะสลับให้เมื่อ toggle โหมด
const ROUTER_COLOR_DARK = '#4C8DFF';
const PC_COLOR_DARK = '#22C55E';
const SERVER_COLOR_DARK = '#EC4899';
const ROUTER_COLOR_LIGHT = '#1841B8';
const PC_COLOR_LIGHT = '#0C5C2C';
const SERVER_COLOR_LIGHT = '#9E144D';
let ROUTER_COLOR = ROUTER_COLOR_DARK;
let PC_COLOR = PC_COLOR_DARK;
let SERVER_COLOR = SERVER_COLOR_DARK;

// ----- คลาสฐาน: คุณสมบัติร่วมที่ทุก Node บน Canvas ต้องมี -----
class NetworkDevice {
    constructor(id, type, x, y, w, h, label, color, icon) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.label = label;
        this.color = color;
        this.icon = icon;
        this.subnetInfo = ''; // ให้ drawXxxNode() เติมค่าตอน render แต่ละเฟรม
    }
}

// ----- Router: มีได้ตัวเดียวเสมอ เป็นเจ้าของ Base Network ของทั้งระบบ -----
class RouterDevice extends NetworkDevice {
    constructor(x, y) {
        super('router', 'router', x, y, 152, 54, 'Router-01', ROUTER_COLOR, '');
    }

    // ต้องตามโหมดที่ผู้ใช้กำลังดูอยู่ เหมือนที่กล่อง Department ทำ (ดู drawDeptNodes ใน topology.js)
    // เดิมคืนค่า IPv4 เสมอ ทำให้ตอนสลับไปโหมด IPv6 กล่อง Router ยังโชว์ 172.16.0.0/24
    // ขณะที่กล่องแผนกข้างล่างโชว์ "ยังไม่มี IPv6" — ขัดกันเองในผังเดียวกัน
    getBaseNetworkSummary() {
        if (state.ipMode === 'v6') {
            return state.baseIp6 ? (state.baseIp6 + '/' + state.basePrefixLen6) : 'ยังไม่มี IPv6';
        }
        return state.baseIp + '/' + state.baseCidr;
    }
}

// ----- Switch: มีได้หลายตัว ผูกกับ Department แบบ 1:1 เสมอ -----
class SwitchDevice extends NetworkDevice {
    constructor(dept, x, y, color) {
        super('sw-' + dept.id, 'switch', x, y, 122, 47, 'SW-' + dept.name, color, ''); // fa-ethernet — แยกจาก Server () ให้ชัดบน Canvas
        this.deptId = dept.id;
        this.vlanId = assignVlanId(dept.id); // ค่าคงที่ ไม่ใช่คำนวณจาก index ทุกเฟรมเหมือนเดิม
    }

    getVlanLabel() {
        return 'VLAN ' + this.vlanId;
    }
}

// ----- PC: อุปกรณ์ปลายทางที่ผู้ใช้วางเองบน Canvas (ไม่ auto-generate จาก state.calculated เหมือน Switch) -----
class PCDevice extends NetworkDevice {
    constructor(id, x, y) {
        super(id, 'pc', x, y, 100, 44, 'PC-' + id.replace('m-', ''), PC_COLOR, ''); // fa-display (จอ desktop)
        this.ip = null;           // ผู้ใช้กรอกเอง หรือให้ระบบ suggestNextIp() แนะนำจาก subnet ของแผนกที่เชื่อมอยู่
        this.linkedDeptId = null; // ผูกอัตโนมัติตอนเรียก addLink() เชื่อมกับ Switch (ดู topology.js)
    }

    getIpLabel() {
        return this.ip || 'No IP';
    }
}

// ----- Server: โครงเดียวกับ PC แต่สื่อความหมายว่าเป็นโฮสต์ให้บริการ (ปกติกำหนด IP Static) -----
class ServerDevice extends NetworkDevice {
    constructor(id, x, y) {
        super(id, 'server', x, y, 110, 47, 'Server-' + id.replace('m-', ''), SERVER_COLOR, ''); // fa-server
        this.ip = null;
        this.linkedDeptId = null;
    }

    getIpLabel() {
        return this.ip || 'No IP';
    }
}
