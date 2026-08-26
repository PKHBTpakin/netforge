/* ============================================
   4. Tools — เครื่องมือเสริมในแท็บ NET TOOLS
   ============================================
   ก่อนหน้านี้ไฟล์นี้เป็น stub ว่างเปล่า และ index.html ยังเรียก addSummaryRoute()/calcSummary()
   ที่ไม่เคยถูกนิยามที่ไหนเลย -> กดปุ่มในแท็บนี้แล้ว ReferenceError ทั้งแท็บ
   ไฟล์นี้เขียนขึ้นใหม่ให้ครบทั้ง 2 เครื่องมือ:
     1) Wildcard Mask  — แตกรายละเอียดของ x.x.x.x/yy หนึ่งก้อน
     2) Route Summary  — หา Supernet ที่ครอบทุกเส้นทางที่ใส่มา (ใช้จริงตอนทำ summarization บน Router)
   พึ่งพาแค่ helper จาก vlsm.js (ipToLong/longToIp/cidrToMask/cidrToWildcard/isValidIp/ipToBinStr)
   กับ escapeHtml() จาก ui.js — ไม่แตะ state ของ VLSM planner เลย นอกจาก state.summaryRoutes ของตัวเอง
   ============================================ */

// แปลง "192.168.1.0/24" -> { ip, cidr } พร้อมตรวจความถูกต้อง คืน null ถ้ารูปแบบผิด
function parseCidrText(text) {
    if (typeof text !== 'string') return null;
    var parts = text.trim().split('/');
    if (parts.length !== 2) return null;
    var ip = parts[0].trim();
    var cidr = parseInt(parts[1], 10);
    if (!isValidIp(ip)) return null;
    if (!Number.isInteger(cidr) || cidr < 0 || cidr > 32) return null;
    return { ip: ip, cidr: cidr };
}

/* ---------- 4a. Wildcard Mask ---------- */

function calcWildcard() {
    var input = document.getElementById('wcInput');
    var out = document.getElementById('wcResult');
    if (!input || !out) return;

    var parsed = parseCidrText(input.value);
    if (!parsed) {
        out.innerHTML = '<div class="text-hot text-[12px]"><i class="fas fa-triangle-exclamation mr-1"></i>' +
            'รูปแบบไม่ถูกต้อง — ต้องเป็น x.x.x.x/yy เช่น 192.168.1.0/24</div>';
        return;
    }

    var cidr = parsed.cidr;
    var maskLong = cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0;
    var network = (ipToLong(parsed.ip) & maskLong) >>> 0;
    var size = Math.pow(2, 32 - cidr);
    var broadcast = (network + size - 1) >>> 0;
    // /31 (RFC 3021 point-to-point) กับ /32 (host route) ไม่มี network/broadcast แยก จึงไม่มี "usable" ตามนิยามปกติ
    var usableCount = cidr >= 31 ? (cidr === 32 ? 1 : 2) : size - 2;
    var notOnBoundary = network !== ipToLong(parsed.ip);

    function row(label, value, cls) {
        return '<div class="glow-border rounded p-2 flex justify-between gap-2">' +
            '<span class="text-muted flex-shrink-0">' + label + '</span>' +
            '<span class="text-right break-all ' + (cls || '') + '">' + value + '</span></div>';
    }

    out.innerHTML =
        (notOnBoundary
            ? '<div class="text-hot text-[12px] mb-2"><i class="fas fa-circle-info mr-1"></i>' +
              escapeHtml(parsed.ip) + ' ไม่ใช่ Network Address ของ /' + cidr + ' — คำนวณจาก ' + longToIp(network) + '/' + cidr + ' ให้แทน</div>'
            : '') +
        '<div class="space-y-1">' +
            row('Network', longToIp(network) + '/' + cidr, 'text-neon') +
            row('Subnet Mask', cidrToMask(cidr)) +
            row('Wildcard Mask', cidrToWildcard(cidr), 'text-cyber') +
            row('Broadcast', longToIp(broadcast), 'text-hot') +
            (cidr <= 30
                ? row('Usable Range', longToIp(network + 1) + ' — ' + longToIp(broadcast - 1), 'text-cyber')
                : row('Usable Range', cidr === 32 ? longToIp(network) + ' (host route)' : longToIp(network) + ' — ' + longToIp(broadcast) + ' (RFC 3021)', 'text-cyber')) +
            row('Usable Hosts', usableCount.toLocaleString()) +
            row('Total Addresses', size.toLocaleString()) +
        '</div>' +
        '<div class="mt-2 text-[11px] text-subtle">Mask (binary)<br>' +
        '<span class="text-muted break-all">' + ipToBinStr(cidrToMask(cidr)) + '</span></div>';
}

/* ---------- 4b. Route Summarization ---------- */

function renderSummaryInputs() {
    var el = document.getElementById('summaryInputs');
    if (!el) return;

    if (!state.summaryRoutes || state.summaryRoutes.length === 0) {
        el.innerHTML = '<div class="text-subtle text-[12px] py-1">ยังไม่มีเส้นทางในรายการ เพิ่มได้ที่ช่องด้านล่าง</div>';
        return;
    }

    el.innerHTML = state.summaryRoutes.map(function(route, i) {
        return '<div class="flex items-center justify-between gap-2 text-[13px] py-0.5">' +
            '<span class="text-neon break-all">' + escapeHtml(route) + '</span>' +
            '<button onclick="removeSummaryRoute(' + i + ')" class="text-subtle hover:text-hot transition-colors flex-shrink-0" ' +
            'title="ลบเส้นทางนี้" aria-label="ลบเส้นทาง ' + escapeHtml(route) + '"><i class="fas fa-times" aria-hidden="true"></i></button>' +
        '</div>';
    }).join('');
}

function addSummaryRoute() {
    try {
        var input = document.getElementById('summaryNew');
        if (!input) return;
        var parsed = parseCidrText(input.value);
        if (!parsed) { showToast('รูปแบบไม่ถูกต้อง ต้องพิมพ์เป็น x.x.x.x/yy เช่น 192.168.4.0/24', 'error'); return; }

        // เก็บเป็น Network Address เสมอ กันผู้ใช้ใส่ host address แล้วผลสรุปเพี้ยน
        var maskLong = parsed.cidr === 0 ? 0 : (0xFFFFFFFF << (32 - parsed.cidr)) >>> 0;
        var normalized = longToIp((ipToLong(parsed.ip) & maskLong) >>> 0) + '/' + parsed.cidr;

        if (!state.summaryRoutes) state.summaryRoutes = [];
        if (state.summaryRoutes.indexOf(normalized) !== -1) { showToast('มีเส้นทางนี้อยู่แล้ว', 'info'); return; }
        if (state.summaryRoutes.length >= 16) { showToast('เพิ่มได้สูงสุด 16 เส้นทาง', 'error'); return; }

        state.summaryRoutes.push(normalized);
        input.value = '';
        renderSummaryInputs();
        showToast('เพิ่ม ' + normalized + ' แล้ว', 'success');
    } catch (err) {
        console.error('addSummaryRoute error:', err);
        showToast('โปรแกรมเพิ่มเส้นทางไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    }
}

function removeSummaryRoute(index) {
    try {
        if (!state.summaryRoutes || index < 0 || index >= state.summaryRoutes.length) return;
        var removed = state.summaryRoutes.splice(index, 1)[0];
        renderSummaryInputs();
        var out = document.getElementById('summaryResult');
        if (out) out.innerHTML = ''; // ผลเดิมอ้างอิงชุดที่เปลี่ยนไปแล้ว ล้างทิ้งกันเข้าใจผิด
        showToast('ลบ ' + removed + ' แล้ว', 'info');
    } catch (err) {
        console.error('removeSummaryRoute error:', err);
    }
}

// หา Supernet ที่ครอบทุกเส้นทาง = prefix ที่ยาวที่สุดที่ทุกเส้นทางยังมี bit นำหน้าเหมือนกันหมด
// (วิธีเดียวกับที่ทำมือ: เขียนเลขฐานสองเรียงกัน แล้วดูว่าตรงกันถึง bit ที่เท่าไหร่)
function calcSummary() {
    var out = document.getElementById('summaryResult');
    if (!out) return;

    try {
        var routes = state.summaryRoutes || [];
        if (routes.length < 2) {
            out.innerHTML = '<div class="text-hot text-[12px]"><i class="fas fa-triangle-exclamation mr-1"></i>ต้องมีอย่างน้อย 2 เส้นทางถึงจะสรุปได้</div>';
            return;
        }

        var parsedList = [];
        for (var i = 0; i < routes.length; i++) {
            var p = parseCidrText(routes[i]);
            if (!p) {
                out.innerHTML = '<div class="text-hot text-[12px]">เส้นทาง "' + escapeHtml(routes[i]) + '" อ่านไม่ออก</div>';
                return;
            }
            parsedList.push({ long: ipToLong(p.ip) >>> 0, cidr: p.cidr });
        }

        // นับ bit นำหน้าที่ตรงกันทุกเส้นทาง
        var commonBits = 32;
        for (var b = 0; b < 32; b++) {
            var mask = (1 << (31 - b)) >>> 0;
            var first = (parsedList[0].long & mask) >>> 0;
            var allSame = parsedList.every(function(r) { return ((r.long & mask) >>> 0) === first; });
            if (!allSame) { commonBits = b; break; }
        }
        // Summary จะยาวกว่า prefix ที่สั้นที่สุดในชุดไม่ได้ ไม่งั้นจะครอบไม่หมด
        var shortestCidr = parsedList.reduce(function(m, r) { return Math.min(m, r.cidr); }, 32);
        var summaryCidr = Math.min(commonBits, shortestCidr);

        var summaryMask = summaryCidr === 0 ? 0 : (0xFFFFFFFF << (32 - summaryCidr)) >>> 0;
        var summaryNet = (parsedList[0].long & summaryMask) >>> 0;
        var summarySize = Math.pow(2, 32 - summaryCidr);

        // Summary "แม่นพอดี" ไหม = จำนวน address ที่ครอบ เท่ากับผลรวมของเส้นทางจริงหรือเปล่า
        // ถ้าไม่เท่า แปลว่าดูดเอา subnet ที่ไม่ได้ขอเข้ามาด้วย (เสี่ยง blackhole route) — เตือนให้เห็น
        var coveredSize = parsedList.reduce(function(sum, r) { return sum + Math.pow(2, 32 - r.cidr); }, 0);
        var exact = coveredSize === summarySize;
        var extra = summarySize - coveredSize;

        out.innerHTML =
            '<div class="glow-border rounded p-2 mb-2">' +
                '<div class="text-subtle text-[11px] tracking-wider mb-1">SUMMARY ROUTE</div>' +
                '<div class="text-neon text-[15px] break-all">' + longToIp(summaryNet) + '/' + summaryCidr + '</div>' +
                '<div class="text-muted text-[11px] mt-1">Mask ' + cidrToMask(summaryCidr) + ' &nbsp;•&nbsp; Wildcard ' + cidrToWildcard(summaryCidr) + '</div>' +
            '</div>' +
            '<div class="text-[12px] space-y-1">' +
                '<div class="flex justify-between"><span class="text-muted">Bit ที่ตรงกันทุกเส้นทาง</span><span>' + commonBits + ' bits</span></div>' +
                '<div class="flex justify-between"><span class="text-muted">ครอบทั้งหมด</span><span>' + summarySize.toLocaleString() + ' addresses</span></div>' +
                '<div class="flex justify-between"><span class="text-muted">ที่ขอมาจริง</span><span>' + coveredSize.toLocaleString() + ' addresses</span></div>' +
            '</div>' +
            (exact
                ? '<div class="text-cyber text-[12px] mt-2"><i class="fas fa-circle-check mr-1"></i>สรุปได้พอดีเป๊ะ ไม่ดูด subnet อื่นเข้ามาเกิน</div>'
                : '<div class="text-hot text-[12px] mt-2"><i class="fas fa-triangle-exclamation mr-1"></i>ครอบเกินมา ' + extra.toLocaleString() +
                  ' addresses ที่ไม่ได้อยู่ในรายการ — ถ้า subnet เหล่านั้นมีใช้งานจริงที่อื่น จะโดน route ผิดทาง</div>') +
            '<div class="mt-2 text-[11px] text-subtle">คำสั่งบน Router<br>' +
            '<span class="text-muted break-all">ip route ' + longToIp(summaryNet) + ' ' + cidrToMask(summaryCidr) + ' &lt;next-hop&gt;</span></div>';
    } catch (err) {
        console.error('calcSummary error:', err);
        out.innerHTML = '<div class="text-hot text-[12px]">คำนวณไม่สำเร็จ ลองตรวจรูปแบบเส้นทางที่เพิ่มไว้อีกครั้ง</div>';
    }
}
