/* ============================================
   1. VLSM Engine — สมองคำนวณ
   ============================================ */

function ipToLong(ip) {
    const p = ip.split('.').map(Number);
    return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

function longToIp(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function cidrToMask(cidr) {
    return longToIp(cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0);
}

function cidrToWildcard(cidr) {
    return longToIp(cidr === 0 ? 0xFFFFFFFF : ((1 << (32 - cidr)) - 1) >>> 0);
}

function isValidIp(ip) {
    if (typeof ip !== 'string') return false; // กันไฟล์ Project ที่ import มาแล้วไม่มี field นี้ (undefined) พังตอน .split() — isValidIpv6() กันจุดนี้ไว้อยู่แล้ว ฝั่ง IPv4 หลุดมาจุดเดียว
    const p = ip.split('.');
    if (p.length !== 4) return false;
    return p.every(x => {
        const n = Number(x);
        return !isNaN(n) && n >= 0 && n <= 255 && String(n) === x.trim();
    });
}

function ipToBinStr(ip) {
    return ip.split('.').map(n => Number(n).toString(2).padStart(8, '0')).join('.');
}

// คืน Network Address ของ ip ตาม cidr ที่ให้มา (ปัดลงหาขอบ block เสมอ)
// ใช้กันกรณีผู้ใช้กรอก Base เป็น host address เช่น 10.0.0.5/24 ซึ่งถ้าปล่อยผ่านจะทำให้ calculateVLSM()
// เริ่มแจก subnet จาก 10.0.0.5/25 (ไม่ใช่ Network Address จริง) และล้นออกนอกขอบ 10.0.0.0/24 ไปด้วย
// ฝั่ง IPv6 (calculateIPv6Subnets) เช็คเงื่อนไขนี้อยู่แล้ว ฝั่ง IPv4 เดิมไม่มีเลย
function normalizeNetwork(ip, cidr) {
    const mask = cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0;
    return longToIp((ipToLong(ip) & mask) >>> 0);
}

/* ============================================
   1c. Utilization — วิเคราะห์การใช้พื้นที่ใน Base Block
   แยกพื้นที่ออกเป็น 3 ส่วนแทนการรายงานเป็น "efficiency %" ตัวเดียว เพราะตัวเลขรวมตัวเดียว
   ทำให้เข้าใจผิดได้: การเหลือพื้นที่ว่างไม่ใช่ข้อบกพร่องเสมอไป ในงานจริงเราจอง block ใหญ่กว่า
   ที่ใช้ตอนนี้ "โดยตั้งใจ" เพื่อเผื่อขยาย การไล่ % ให้สูงจึงอาจสอนสิ่งที่ผิด
   3 ส่วนที่แยก:
     used     = host ที่ขอจริง + network + broadcast ของแต่ละ subnet
     rounding = ส่วนที่เสียไปจากการปัดขนาด subnet ขึ้นเป็นกำลังสอง (เลี่ยงไม่ได้ในระบบเลขฐานสอง)
     reserve  = ส่วนที่เหลือใน Base Block ยังไม่ถูกแตะ = พื้นที่สำรองเผื่อโต
   ============================================ */

// รวมความต้องการของชุดแผนกที่ให้มา — ใช้ได้ทั้ง state.departments (ก่อนคำนวณ) และ state.calculated (หลังคำนวณ)
function calculateAllocation(departments) {
    var requested = 0, allocated = 0, counted = 0;
    (departments || []).forEach(function (d) {
        var h = Number(d.hosts);
        if (!isFinite(h) || h < 1) return;
        requested += h + 2; // +2 = network address กับ broadcast address ที่จ่ายให้เครื่องไม่ได้
        allocated += Math.pow(2, Math.ceil(Math.log2(Math.max(h + 2, 4))));
        counted++;
    });
    return { requested: requested, allocated: allocated, counted: counted };
}

// หา CIDR ที่ "สั้นที่สุด" (block เล็กที่สุด) ที่ยังจองครบทุกแผนก
// เดิมผู้ใช้ต้องเดา Base เอง และข้อมูลตัวอย่างก็ตั้ง Base ใหญ่เกินความจำเป็น 4-8 เท่า
// ทำให้สัดส่วนการใช้พื้นที่จริงเหลือ 14-36% ทั้งที่อัลกอริทึมแจก subnet ถูกต้องอยู่แล้ว
function suggestBaseCidr(departments) {
    var alloc = calculateAllocation(departments).allocated;
    if (alloc <= 0) return null;
    var cidr = 32 - Math.ceil(Math.log2(alloc));
    if (cidr > 30) cidr = 30; // /31,/32 ใช้เป็น Base ของหลาย subnet ไม่ได้
    if (cidr < 8) cidr = 8;   // ตรงกับขอบเขตที่ onBaseChange() ยอมรับ
    return cidr;
}

// นับจาก state.calculated เท่านั้น (แผนกที่จัดสรรสำเร็จจริง) ไม่ใช่ state.departments
// เพราะแผนกที่ล้นขอบไม่ได้กินพื้นที่ใน block นี้เลย ถ้านับด้วยตัวเลขจะเกิน 100%
function calculateUtilization() {
    var a = calculateAllocation(state.calculated);
    var total = Math.pow(2, 32 - state.baseCidr);
    var rounding = a.allocated - a.requested;
    var reserve = total - a.allocated;
    var pct = function (n) { return total > 0 ? (n / total * 100) : 0; };
    return {
        total: total,
        used: a.requested,
        rounding: rounding,
        reserve: reserve < 0 ? 0 : reserve,
        usedPct: pct(a.requested),
        roundingPct: pct(rounding),
        reservePct: pct(reserve < 0 ? 0 : reserve),
        allocated: a.allocated,
        // เพดานทางทฤษฎี: ต่อให้เลือก Base พอดีเป๊ะ ก็ยังใช้ได้ไม่เกินสัดส่วนนี้เพราะการปัดกำลังสอง
        ceilingPct: a.allocated > 0 ? (a.requested / a.allocated * 100) : 0,
        suggestedCidr: suggestBaseCidr(state.calculated)
    };
}

function calculateVLSM() {
    const baseCidr = state.baseCidr;
    // ตาข่ายนิรภัยชั้นสุดท้าย: state.baseIp ถูกตั้งได้จากหลายทาง (กรอกเอง, โหลด Example, import ไฟล์, autosave)
    // onBaseChange() ปัดให้ตั้งแต่ต้นทางแล้ว แต่เส้นทางอื่นไม่ได้ผ่านตรงนั้น จึงปัดซ้ำตรงนี้ให้ครบทุกทาง
    // แก้ที่ state เลย (ไม่ใช่แค่ตัวแปรภายใน) เพื่อไม่ให้ Router panel/CLI โชว์ Base คนละค่ากับ subnet ที่แจกจริง
    const normalized = normalizeNetwork(state.baseIp, baseCidr);
    if (normalized !== state.baseIp) state.baseIp = normalized;
    const baseLong = ipToLong(state.baseIp);
    const sorted = [...state.departments].sort((a, b) => b.hosts - a.hosts);
    let currentIp = baseLong;
    const results = [];
    const errors = [];
    // แผนกที่จัดสรรไม่สำเร็จ เดิมถูกทิ้งไปเงียบ ๆ เหลือแค่ toast 2.5 วินาที
    // ผู้ใช้ที่พลาดช่วงนั้นจะไม่มีทางรู้เลยว่ามีแผนกหนึ่งไม่ได้อยู่ในแผน -> เก็บเหตุผลไว้ให้ UI แสดงค้าง
    const failed = [];
    const fail = (dept, reason) => {
        failed.push({ id: dept.id, name: dept.name || 'Dept', hosts: dept.hosts, reason: reason });
        errors.push((dept.name || 'Dept') + ': ' + reason);
    };

    for (const dept of sorted) {
        const hostsNum = Number(dept.hosts);
        if (!isFinite(hostsNum) || hostsNum < 1) {
            fail(dept, 'จำนวน Host ไม่ถูกต้อง');
            continue;
        }
        const needed = Math.max(hostsNum + 2, 4);
        const bits = Math.ceil(Math.log2(needed));
        const subnetSize = Math.pow(2, bits);
        const newCidr = 32 - bits;

        if (bits > 32 || newCidr < 0) {
            fail(dept, 'จำนวน Host มากเกินกว่าจะคำนวณเป็น IPv4 ได้');
            continue;
        }
        if (newCidr < baseCidr) {
            fail(dept, 'ต้องการ /' + newCidr + ' แต่ Base เป็น /' + baseCidr + ' — ขยาย Base ให้ใหญ่ขึ้น');
            continue;
        }
        const baseEnd = baseLong + Math.pow(2, 32 - baseCidr);
        if (currentIp + subnetSize > baseEnd) {
            fail(dept, 'พื้นที่ใน Base /' + baseCidr + ' เหลือไม่พอ (ต้องการ /' + newCidr + ')');
            continue;
        }

        const network = currentIp;
        const broadcast = network + subnetSize - 1;
        results.push({
            ...dept,
            subnet: {
                network: longToIp(network),
                broadcast: longToIp(broadcast),
                firstUsable: longToIp(network + 1),
                lastUsable: longToIp(broadcast - 1),
                netmask: cidrToMask(newCidr),
                cidr: newCidr,
                wildcard: cidrToWildcard(newCidr),
                size: subnetSize
            }
        });
        currentIp = broadcast + 1;
    }

    state.calculated = results;
    state.failed = failed;
    if (errors.length) showToast(errors.join('\n'), 'error');
    return results;
}