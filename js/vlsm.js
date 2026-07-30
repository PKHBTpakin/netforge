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

    for (const dept of sorted) {
        const hostsNum = Number(dept.hosts);
        if (!isFinite(hostsNum) || hostsNum < 1) {
            errors.push((dept.name || 'Dept') + ': จำนวน Host ไม่ถูกต้อง');
            continue;
        }
        const needed = Math.max(hostsNum + 2, 4);
        const bits = Math.ceil(Math.log2(needed));
        const subnetSize = Math.pow(2, bits);
        const newCidr = 32 - bits;

        if (bits > 32 || newCidr < 0) {
            errors.push(dept.name + ': จำนวน Host มากเกินกว่าจะคำนวณเป็น IPv4 ได้');
            continue;
        }
        if (newCidr < baseCidr) {
            errors.push(dept.name + ': ต้องการ /' + newCidr + ' แต่ Base เป็น /' + baseCidr);
            continue;
        }
        const baseEnd = baseLong + Math.pow(2, 32 - baseCidr);
        if (currentIp + subnetSize > baseEnd) {
            errors.push(dept.name + ': เกินขอบเขต Base Network');
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
    if (errors.length) showToast(errors.join('\n'), 'error');
    return results;
}