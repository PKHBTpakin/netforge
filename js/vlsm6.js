/* ============================================
   1b. VLSM6 Engine — คำนวณ IPv6 ด้วย BigInt
   แยกจาก vlsm.js เพราะโมเดลคำนวณคนละแบบ:
   IPv4 (VLSM) = แบ่งตามจำนวน Host ที่ต้องการ (ขนาดไม่เท่ากัน)
   IPv6        = แบ่ง Block ตั้งต้นออกเป็น subnet ย่อยขนาดเท่ากันตาม Prefix ที่กำหนด (ปรับได้ ไม่ตายตัวที่ /64)
   ไฟล์นี้ไม่แตะ state/showToast เลย (pure function ล้วน) — เพื่อให้เทสแยกจาก UI ได้ง่าย
   จะต่อเข้ากับ state/ปุ่มจริงในขั้นที่ 3
   ============================================ */

// ---------- ตรวจรูปแบบ ----------

// ตรวจ IPv6 แบบเข้มงวด: อนุญาตแค่ hex+colon, ห้าม ':::' , ห้าม '::' ซ้ำเกิน 1 ครั้ง,
// ห้าม ':' เดี่ยวโผล่ที่ขอบฝั่งใดฝั่งหนึ่ง, จำนวนกลุ่มต้องถูกต้องตามกรณีมี/ไม่มี '::'
function isValidIpv6(str) {
    if (typeof str !== 'string') return false;
    str = str.trim();
    if (str === '') return false;
    if (!/^[0-9a-fA-F:]+$/.test(str)) return false; // อนุญาตแค่ hex digit กับ : เท่านั้น
    if (str.indexOf(':::') !== -1) return false; // 3 โคลอนติดกัน ผิดเสมอ

    var dcCount = (str.match(/::/g) || []).length;
    if (dcCount > 1) return false; // '::' ซ้ำได้แค่ครั้งเดียวในหนึ่งแอดเดรส

    var sides = dcCount === 1 ? str.split('::') : [str];
    if (sides.length > 2) return false;

    var totalGroups = 0;
    for (var s = 0; s < sides.length; s++) {
        var side = sides[s];
        if (side === '') continue; // ฝั่งว่าง แปลว่า '::' อยู่ตรงขอบ (เช่น '::1' หรือ '2001:db8::') ใช้ได้
        if (side.charAt(0) === ':' || side.charAt(side.length - 1) === ':') return false; // ':' เดี่ยวโผล่ขอบ ผิดเสมอ
        var groups = side.split(':');
        for (var g = 0; g < groups.length; g++) {
            if (!/^[0-9a-fA-F]{1,4}$/.test(groups[g])) return false;
        }
        totalGroups += groups.length;
    }

    if (dcCount === 1) {
        if (totalGroups > 7) return false; // ต้องเหลือที่ให้ '::' แทนอย่างน้อย 1 กลุ่มเสมอ
    } else {
        if (totalGroups !== 8) return false; // ไม่มี '::' ต้องครบ 8 กลุ่มพอดีเป๊ะ
    }
    return true;
}

// ---------- แปลงไปมา string <-> BigInt (128 บิต) ----------

function ipv6ToBig(str) {
    str = str.trim();
    var dc = str.indexOf('::') !== -1;
    var sides = dc ? str.split('::') : [str, undefined];
    var left = sides[0] ? sides[0].split(':').filter(function(x) { return x !== ''; }) : [];
    var right = (sides[1] !== undefined && sides[1] !== '') ? sides[1].split(':').filter(function(x) { return x !== ''; }) : [];
    var missing = 8 - left.length - right.length;
    var groups = left.concat(new Array(Math.max(missing, 0)).fill('0')).concat(right);

    var big = 0n;
    for (var i = 0; i < 8; i++) {
        big = (big << 16n) | BigInt('0x' + (groups[i] || '0'));
    }
    return big;
}

// แปลง BigInt กลับเป็น string แบบยุบ '::' ตามมาตรฐาน RFC 5952
// (หาช่วงเลข 0 ติดกัน "ยาวที่สุด" ที่มีอย่างน้อย 2 กลุ่มขึ้นไปมายุบ ถ้าเท่ากันเอาช่วงซ้ายสุด)
function bigToIpv6(big) {
    var groups = [];
    for (var i = 7; i >= 0; i--) {
        var shift = BigInt(i * 16);
        var g = (big >> shift) & 0xFFFFn;
        groups.push(g.toString(16));
    }
    var bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    for (var j = 0; j < 8; j++) {
        if (groups[j] === '0') {
            if (curStart === -1) curStart = j;
            curLen++;
            if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
        } else { curStart = -1; curLen = 0; }
    }
    if (bestLen < 2) return groups.join(':'); // ไม่มีช่วง 0 ติดกันยาวพอ (ต้อง >= 2 กลุ่ม) ไม่ต้องยุบ
    var before = groups.slice(0, bestStart);
    var after = groups.slice(bestStart + bestLen);
    return before.join(':') + '::' + after.join(':');
}

// ปัดที่อยู่ลงหาขอบ Block ของ prefix ที่ให้มา — คู่ขนานกับ normalizeNetwork() ของฝั่ง IPv4
// เดิมฝั่ง IPv6 ไม่มีตัวนี้ พอผู้ใช้กรอก 2001:db8:0:5::/48 ระบบจะ error แล้วคืนผลเปล่า
// ขณะที่ฝั่ง IPv4 ปัดให้เองเงียบ ๆ — พฤติกรรมสองฝั่งไม่เหมือนกันทั้งที่เป็นเรื่องเดียวกัน
// คืน null ถ้ารูปแบบไม่ถูกต้อง เพื่อให้ผู้เรียกแยกได้ระหว่าง "ปัดแล้ว" กับ "กรอกผิด"
function normalizeIpv6Network(str, prefixLen) {
    if (!isValidIpv6(str)) return null;
    prefixLen = Number(prefixLen);
    if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 128) return null;
    var shift = BigInt(128 - prefixLen);
    return bigToIpv6((ipv6ToBig(str) >> shift) << shift);
}

// ---------- คำนวณแบ่ง Subnet ----------

// baseIp6/basePrefixLen = Block ตั้งต้น (เช่น 2001:db8:: /48)
// departments = [{id, name}, ...] (ไม่สนใจ hosts เลย ต่างจาก IPv4 VLSM)
// newPrefixLen = ความยาว prefix ของ subnet ย่อยแต่ละอัน ปรับได้ (ค่าปกติ /64 แต่เปลี่ยนได้ เช่น /126 สำหรับลิงก์ Router-Router)
function calculateIPv6Subnets(baseIp6, basePrefixLen, departments, newPrefixLen) {
    var errors = [];

    if (!isValidIpv6(baseIp6)) {
        errors.push('Base IPv6 ไม่ถูกต้อง: ' + baseIp6);
        return { results: [], errors: errors };
    }
    basePrefixLen = Number(basePrefixLen);
    newPrefixLen = Number(newPrefixLen);
    if (!Number.isInteger(basePrefixLen) || basePrefixLen < 1 || basePrefixLen > 127) {
        errors.push('Base Prefix ต้องเป็นจำนวนเต็ม 1-127');
        return { results: [], errors: errors };
    }
    if (!Number.isInteger(newPrefixLen) || newPrefixLen <= basePrefixLen || newPrefixLen > 128) {
        errors.push('Prefix ย่อยต้องยาวกว่า Base (/' + basePrefixLen + ') และไม่เกิน /128');
        return { results: [], errors: errors };
    }
    if (!departments || departments.length === 0) {
        return { results: [], errors: errors };
    }

    var baseBig = ipv6ToBig(baseIp6);
    // เช็คว่า baseIp6 ที่ให้มาตรงกับขอบเขตของ basePrefixLen จริงไหม (กันกรอกเลขที่ไม่ใช่ต้น Block เช่น 2001:db8::5/48)
    var baseMaskShift = BigInt(128 - basePrefixLen);
    var baseNetwork = (baseBig >> baseMaskShift) << baseMaskShift;
    if (baseNetwork !== baseBig) {
        errors.push('Base IPv6 ไม่ตรงกับขอบเขตของ /' + basePrefixLen + ' (ควรเป็น ' + bigToIpv6(baseNetwork) + ')');
        return { results: [], errors: errors };
    }

    var subnetBits = BigInt(newPrefixLen - basePrefixLen);
    var maxSubnets = 1n << subnetBits; // จำนวน subnet /newPrefixLen ทั้งหมดที่แบ่งได้จาก Block นี้
    if (BigInt(departments.length) > maxSubnets) {
        errors.push('แบ่งได้สูงสุด ' + maxSubnets.toString() + ' subnet (/' + newPrefixLen + ') จาก Base นี้ แต่มี ' + departments.length + ' แผนก — ลด Prefix ย่อยให้สั้นลง หรือลดจำนวนแผนก');
        return { results: [], errors: errors };
    }

    var blockSize = 1n << BigInt(128 - newPrefixLen); // จำนวนแอดเดรสทั้งหมดต่อ subnet ย่อย 1 อัน
    var results = departments.map(function(dept, i) {
        var network = baseBig + (BigInt(i) * blockSize);
        var lastAddr = network + blockSize - 1n;
        return {
            id: dept.id,
            name: dept.name,
            subnet6: {
                network: bigToIpv6(network),
                prefixLen: newPrefixLen,
                cidrText: bigToIpv6(network) + '/' + newPrefixLen,
                // ที่อยู่แรกของ Block ตามธรรมเนียมถือเป็น Subnet-Router Anycast (RFC 4291) จึงแยกโชว์ firstUsable ต่างจาก network
                firstUsable: bigToIpv6(network + 1n),
                lastUsable: bigToIpv6(lastAddr),
                totalAddresses: blockSize.toString() // เก็บเป็น string เพราะอาจใหญ่เกิน Number ธรรมดา (เช่น /64 = 2^64)
            }
        };
    });
    return { results: results, errors: errors };
}
