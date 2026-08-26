/* ============================================
   2. UI — ตาราง, แผนก, Detail Panel, Sidebar, ธีม, layout
   ============================================
   ส่วนสร้าง config Cisco IOS เคยอยู่ในไฟล์นี้ ย้ายออกไป js/cli.js แล้วเมื่อ 31 ก.ค. 2569
   (เหลือ copyToClipboard ไว้ที่นี่ เพราะ library.js ใช้คู่กับลิงก์แชร์ด้วย ไม่ใช่ของ CLI อย่างเดียว)
   ============================================ */

let isEditing = false;

// Escape ก่อนแทรกลง innerHTML/attribute เสมอ — ชื่อแผนกเป็น free text ที่ผู้ใช้พิมพ์เอง
// ไม่มี input ไหนกรอง ", <, & ตั้งแต่ต้นทาง ถ้าไม่ escape ตรงนี้ชื่อที่มีอักขระพวกนี้จะทำโครงสร้าง HTML พัง
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function selectNode(deptId, type) {
    state.selectedDeptId = deptId;
    state.selectedNodeType = type;
    if (typeof requestRedraw === 'function') requestRedraw(); // กรอบเน้นบน Canvas เปลี่ยน
    renderDetailPanel();
    renderSidebarDepts();
    openDetailPanel();
}

function openDetailPanel() {
    state.detailOpen = true;
    document.getElementById('detailPanel').classList.add('open');
}

function closeDetailPanel() {
    state.detailOpen = false;
    document.getElementById('detailPanel').classList.remove('open');
}

function renderSidebarDepts() {
    const el = document.getElementById('deptList');
    document.getElementById('deptCount').textContent = state.departments.length;

    if (state.departments.length === 0) {
        el.innerHTML = '<div class="text-muted text-center py-6 text-[13px]">ยังไม่มีแผนกในรายการ<br><span class="text-subtle text-[12px]">พิมพ์เพิ่มเองด้านบน หรือกดปุ่ม EXAMPLE เพื่อโหลดตัวอย่าง</span></div>';
        return;
    }

    /* รายการนี้เคยอ่านจาก state.calculated (ผล IPv4) ตรง ๆ โดยไม่ดูโหมดที่เปิดอยู่เลย
       ผลคือพอสลับไปโหมด IPv6 ตารางเปลี่ยนเป็น prefix ของ IPv6 แล้ว แต่แถบซ้ายยังค้างเลข IPv4 เดิม
       ผู้ใช้จึงเห็นเลขสองชุดที่ไม่ตรงกันอยู่บนหน้าจอเดียวกันโดยไม่มีอะไรบอกว่าอันไหนคืออันจริง */
    const isV6 = state.ipMode === 'v6';

    el.innerHTML = state.departments.map(function(dept) {
        const calc = isV6
            ? (state.calculatedV6 || []).find(function(c) { return c.id === dept.id; })
            : state.calculated.find(function(c) { return c.id === dept.id; });
        const isSel = state.selectedDeptId === dept.id;
        const color = calc ? getDeptColor(dept.id) : 'var(--muted)';
        // การจัดสรรไม่สำเร็จเป็นเรื่องของ IPv4 เท่านั้น เพราะ IPv6 แบ่งเป็นก้อนเท่ากันหมด ไม่มีกรณีลงไม่พอดี
        const failed = isV6 ? null : (state.failed || []).find(function(f) { return f.id === dept.id; });
        // แผนกที่ได้ช่วงหมายเลขแล้วจริง = กำลังถูกใช้งานอยู่ในแผนปัจจุบัน
        const allocated = !!calc && !failed;
        const safeName = escapeHtml(dept.name); // ใช้ทั้งในเนื้อหาและใน aria-label ด้านล่าง
        return '<div class="dept-item ' + (isSel ? 'selected' : '') +
                (failed ? ' dept-failed' : '') +
                '" onclick="selectNode(' + dept.id + ',\'department\')" style="' + (isSel ? 'border-color:' + color : '') + '">' +
            '<div class="flex items-center justify-between mb-1">' +
                '<span class="text-[14px] font-bold" style="color:' + color + '">' +
                    (failed
                        ? '<i class="fas fa-triangle-exclamation text-hot mr-1" aria-hidden="true"></i>'
                        : (allocated ? '<i class="fas fa-circle-check dept-ok-mark mr-1" title="แผนกนี้ได้ช่วง IP แล้ว" aria-hidden="true"></i>' : '')) +
                    escapeHtml(dept.name) + '</span>' +
                '<span class="dept-actions">' +
                    // aria-label ต้องมีชื่อแผนกด้วย — ในรายการมีปุ่มถังขยะซ้ำกันทุกแถว
                    // ถ้าเขียนแค่ "ลบแผนกนี้" โปรแกรมอ่านหน้าจอจะอ่านเหมือนกันหมดจนแยกไม่ออกว่ากำลังจะลบอันไหน
                    '<button onclick="event.stopPropagation();onMoveDept(' + dept.id + ',-1)" class="text-subtle hover:text-neon text-[12px] transition-colors" title="เลื่อนขึ้น" aria-label="เลื่อนแผนก ' + safeName + ' ขึ้น"><i class="fas fa-chevron-up" aria-hidden="true"></i></button>' +
                    '<button onclick="event.stopPropagation();onMoveDept(' + dept.id + ',1)" class="text-subtle hover:text-neon text-[12px] transition-colors" title="เลื่อนลง" aria-label="เลื่อนแผนก ' + safeName + ' ลง"><i class="fas fa-chevron-down" aria-hidden="true"></i></button>' +
                    '<button onclick="event.stopPropagation();onDuplicateDept(' + dept.id + ')" class="text-subtle hover:text-neon text-[12px] transition-colors" title="ทำซ้ำแผนกนี้" aria-label="ทำซ้ำแผนก ' + safeName + '"><i class="fas fa-copy" aria-hidden="true"></i></button>' +
                    '<button onclick="event.stopPropagation();onRemoveDept(' + dept.id + ')" class="text-subtle hover:text-hot text-[12px] transition-colors" title="ลบแผนกนี้" aria-label="ลบแผนก ' + safeName + '"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>' +
                '</span>' +
            '</div>' +
            '<div class="text-[12px] text-muted">' +
                '<span>Hosts: ' + dept.hosts + '</span>' +
                // IPv6 เก็บผลไว้คนละช่องกับ IPv4 และเก็บเป็นข้อความสำเร็จรูปมาแล้ว (cidrText)
                (calc
                    ? '<span class="ml-2" style="color:' + color + '">' +
                        (isV6 ? escapeHtml(calc.subnet6.cidrText) : calc.subnet.network + '/' + calc.subnet.cidr) +
                      '</span>'
                    : '') +
            '</div>' +
            // แผนกที่จัดสรรไม่สำเร็จเคยหายเงียบ ๆ เหลือแค่ toast 2.5 วินาที -> ค้างเหตุผลไว้ตรงนี้ถาวร
            (failed ? '<div class="text-[11px] text-hot mt-1 leading-snug">' + escapeHtml(failed.reason) + '</div>' : '') +
        '</div>';
    }).join('');
}

function renderTable() {
    const thead = document.getElementById('ipTableHead');
    const tbody = document.getElementById('ipTableBody');
    const empty = document.getElementById('tableEmpty');

    if (state.ipMode === 'v6') {
        thead.innerHTML = '<tr class="text-neon text-left">' +
            '<th class="pb-2 pr-3">#</th><th class="pb-2 pr-3">Department</th>' +
            '<th class="pb-2 pr-3">Network / Prefix</th><th class="pb-2 pr-3">Usable Range</th>' +
            '<th class="pb-2">Total Addresses</th></tr>';
        if (state.calculatedV6.length === 0) {
            tbody.innerHTML = '';
            empty.textContent = 'ตั้งค่า Base IPv6 แล้วกด Calculate เพื่อดูผลลัพธ์';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        tbody.innerHTML = state.calculatedV6.map(function(d, i) {
            const s = d.subnet6, color = getDeptColor(d.id); // ผูกสีกับแผนก ไม่ใช่ลำดับในอาเรย์ (ดู getDeptColor ใน devices.js)
            return '<tr class="border-t border-dark-600 hover:bg-dark-700 transition-colors cursor-pointer" onclick="selectNode(' + d.id + ',\'department\')">' +
                '<td class="py-2 pr-3" style="color:' + color + '">' + (i+1) + '</td>' +
                '<td class="py-2 pr-3 font-bold" style="color:' + color + '">' + escapeHtml(d.name) + '</td>' +
                '<td class="py-2 pr-3 text-neon">' + s.cidrText + '</td>' +
                '<td class="py-2 pr-3 text-cyber">' + s.firstUsable + ' – ' + s.lastUsable + '</td>' +
                '<td class="py-2">' + s.totalAddresses + '</td>' +
            '</tr>';
        }).join('');
        return;
    }

    thead.innerHTML = '<tr class="text-neon text-left">' +
        '<th class="pb-2 pr-3">#</th><th class="pb-2 pr-3">Department</th><th class="pb-2 pr-3">Hosts</th>' +
        '<th class="pb-2 pr-3">Network</th><th class="pb-2 pr-3">Broadcast</th><th class="pb-2 pr-3">Usable Range</th>' +
        '<th class="pb-2 pr-3" title="เลขแรกของช่วง ใช้เป็น Default Gateway ให้เครื่องลูกข่ายในแผนกนี้">Gateway</th>' +
        '<th class="pb-2 pr-3">Subnet Mask</th><th class="pb-2 pr-3">CIDR</th><th class="pb-2">Wildcard</th></tr>';
    if (state.calculated.length === 0) {
        // ถ้าทุกแผนกจัดสรรไม่สำเร็จ ต้องยังเห็นแถวเหตุผล ไม่ใช่ขึ้นว่า "เพิ่มแผนกก่อน" ทั้งที่เพิ่มไปแล้ว
        tbody.innerHTML = renderFailedRowsHTML();
        if ((state.failed || []).length > 0) {
            empty.classList.add('hidden');
        } else {
            empty.textContent = 'เพิ่มแผนกและกด Calculate เพื่อดูผลลัพธ์';
            empty.classList.remove('hidden');
        }
        return;
    }
    empty.classList.add('hidden');
    tbody.innerHTML = state.calculated.map(function(d, i) {
        const s = d.subnet, color = getDeptColor(d.id);
        return '<tr class="border-t border-dark-600 hover:bg-dark-700 transition-colors cursor-pointer" onclick="selectNode(' + d.id + ',\'department\')">' +
            '<td class="py-2 pr-3" style="color:' + color + '">' + (i+1) + '</td>' +
            '<td class="py-2 pr-3 font-bold" style="color:' + color + '">' + escapeHtml(d.name) + '</td>' +
            '<td class="py-2 pr-3">' + d.hosts + '</td>' +
            '<td class="py-2 pr-3 text-neon">' + s.network + '/' + s.cidr + '</td>' +
            '<td class="py-2 pr-3 text-hot">' + s.broadcast + '</td>' +
            '<td class="py-2 pr-3 text-cyber">' + s.firstUsable + ' — ' + s.lastUsable + '</td>' +
            '<td class="py-2 pr-3 font-bold" style="color:' + color + '">' + s.firstUsable + '</td>' +
            '<td class="py-2 pr-3">' + s.netmask + '</td>' +
            '<td class="py-2 pr-3">/' + s.cidr + '</td>' +
            '<td class="py-2">' + s.wildcard + '</td>' +
        '</tr>';
    }).join('') + renderFailedRowsHTML();
}

// แถวของแผนกที่จัดสรรไม่สำเร็จ ต่อท้ายตารางเสมอ พร้อมเหตุผลที่อ่านแล้วรู้ว่าต้องแก้อะไร
// เดิมแผนกพวกนี้หายไปจากตาราง/ผัง/CLI ทั้งหมดโดยไม่ทิ้งร่องรอย ผู้ใช้อาจส่งแผนที่ขาดแผนกไปโดยไม่รู้ตัว
function renderFailedRowsHTML() {
    var failed = state.failed || [];
    if (failed.length === 0) return '';
    return failed.map(function(f) {
        return '<tr class="border-t border-dark-600" style="background:rgba(240,87,92,0.06)">' +
            '<td class="py-2 pr-3 text-hot"><i class="fas fa-triangle-exclamation"></i></td>' +
            '<td class="py-2 pr-3 font-bold text-hot">' + escapeHtml(f.name) + '</td>' +
            '<td class="py-2 pr-3 text-hot">' + f.hosts + '</td>' +
            '<td class="py-2 text-hot text-[12px]" colspan="7">จัดสรรไม่สำเร็จ — ' + escapeHtml(f.reason) + '</td>' +
        '</tr>';
    }).join('');
}

/* ----- Focus preservation -----
   renderDetailPanel() เขียนทับ innerHTML ของทั้งพาเนล ซึ่งทำลาย <input> ตัวจริงที่ผู้ใช้กำลังพิมพ์อยู่ทิ้ง
   เดิมทำให้พิมพ์ชื่อแผนก/จำนวน Host ได้ทีละตัวอักษรแล้วเคอร์เซอร์หลุด (oninput -> refreshAll ->
   updateDetailSubnetInfo -> renderDetailPanel -> input ใหม่ที่ไม่มี focus) พิมพ์ต่อเนื่องไม่ได้เลย
   จึงจำ id + ตำแหน่งเคอร์เซอร์ของช่องที่ focus อยู่ไว้ก่อน render แล้วคืนให้ช่องเดิมหลัง render เสร็จ */
function captureDetailFocus() {
    try {
        const active = document.activeElement;
        if (!active || !active.id || active.tagName !== 'INPUT') return null;
        const panel = document.getElementById('detailContent');
        if (!panel || typeof panel.contains !== 'function' || !panel.contains(active)) return null;
        return { id: active.id, start: active.selectionStart, end: active.selectionEnd };
    } catch (e) { return null; }
}

function restoreDetailFocus(snap) {
    if (!snap) return;
    try {
        const el = document.getElementById(snap.id);
        if (!el || typeof el.focus !== 'function') return;
        el.focus();
        // number input บางเบราว์เซอร์ไม่รองรับ setSelectionRange -> ห่อ try ไว้ ไม่ให้ล้มทั้งการ render
        if (snap.start !== null && snap.start !== undefined && typeof el.setSelectionRange === 'function') {
            try { el.setSelectionRange(snap.start, snap.end); } catch (e) { /* type=number ไม่รองรับ ข้ามได้ */ }
        }
    } catch (e) { /* คืน focus ไม่ได้ ไม่ใช่เหตุให้ทั้งพาเนลพัง */ }
}

/* ----- แผงสรุปการใช้พื้นที่ใน Base Block -----
   แสดง 3 ส่วนแทน "efficiency %" ตัวเดียว (ดูเหตุผลใน vlsm.js หัวข้อ 1c)
   ใช้จริง / เสียจากการปัด / สำรองเผื่อโต — พร้อมแถบสัดส่วนให้เห็นภาพทันที */
function renderUtilization() {
    var el = document.getElementById('utilPanel');
    if (!el) return;

    // โหมด IPv6 ใช้คนละแนวคิด (แบ่งเท่ากันทุกแผนก ไม่ปัดตามจำนวน host) จึงมีแผงของตัวเองแยกต่างหาก
    // เดิมซ่อนแผงนี้ไปเฉย ๆ ทำให้พื้นที่วิเคราะห์ทั้งหมดว่างเปล่าเมื่ออยู่โหมด IPv6
    if (state.ipMode === 'v6') { renderUtilizationV6(el); return; }

    if (state.calculated.length === 0) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.classList.remove('hidden');

    var u = calculateUtilization();
    var fmt = function (n) { return n.toLocaleString(); };
    var pct = function (n) { return n.toFixed(1) + '%'; };

    // แนะนำย่อ Base ก็ต่อเมื่อย่อได้จริงและช่วยได้เกิน 5 จุด ไม่งั้นรบกวนเปล่า ๆ
    var canShrink = u.suggestedCidr !== null && u.suggestedCidr > state.baseCidr;
    var wouldBe = canShrink ? (u.used / Math.pow(2, 32 - u.suggestedCidr) * 100) : 0;
    var worthIt = canShrink && (wouldBe - u.usedPct) > 5;

    el.innerHTML =
        '<div class="glow-border rounded-lg p-3">' +
            '<div class="flex items-baseline justify-between mb-2 flex-wrap gap-1">' +
                '<span class="section-label" style="border:none;padding:0;">IP ในช่วง ' + state.baseIp + '/' + state.baseCidr + ' ถูกใช้ไปกับอะไรบ้าง</span>' +
                '<span class="text-[12px] text-muted">มีทั้งหมด ' + fmt(u.total) + ' IP</span>' +
            '</div>' +

            // แถบสัดส่วน 3 ส่วน — ใช้ flex-grow ตาม % จริง ไม่ใช่ width คงที่
            '<div class="flex h-3 rounded overflow-hidden mb-2" style="background:var(--border)">' +
                '<div style="width:' + u.usedPct + '%;background:var(--neon)" title="ใช้งานจริง"></div>' +
                '<div style="width:' + u.roundingPct + '%;background:var(--hot)" title="เสียไปเพราะปัดขนาดขึ้น"></div>' +
                '<div style="width:' + u.reservePct + '%;background:var(--cyber);opacity:.45" title="เหลือไว้เผื่อขยาย"></div>' +
            '</div>' +

            '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--neon)"></span>' +
                    '<span class="text-muted">ใช้งานจริง</span><span class="ml-auto text-neon">' + fmt(u.used) + ' (' + pct(u.usedPct) + ')</span></div>' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--hot)"></span>' +
                    '<span class="text-muted">เสียเพราะปัดขนาด</span><span class="ml-auto text-hot">' + fmt(u.rounding) + ' (' + pct(u.roundingPct) + ')</span></div>' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--cyber);opacity:.45"></span>' +
                    '<span class="text-muted">เหลือเผื่อขยาย</span><span class="ml-auto text-cyber">' + fmt(u.reserve) + ' (' + pct(u.reservePct) + ')</span></div>' +
            '</div>' +

            '<div class="text-[11px] text-subtle mt-2 leading-relaxed">' +
                'ส่วนที่เสียไปเพราะปัดขนาดขึ้นเป็นเรื่องปกติ หลีกเลี่ยงไม่ได้ เพราะขนาดของแต่ละกลุ่มต้องเป็น 2, 4, 8, 16 ไล่ขึ้นไปเรื่อย ๆ เท่านั้น ' +
                'ต่อให้เลือก Base ได้พอดีที่สุดแล้ว ก็ยังใช้ได้สูงสุดแค่ ' + pct(u.ceilingPct) + ' อยู่ดี' +
                '<br>ส่วนที่เหลือไว้เผื่อขยายไม่ถือว่าเสียเปล่า เพราะเป็นพื้นที่ที่กันไว้ให้เพิ่มเครื่องได้ในอนาคต' +
            '</div>' +

            (worthIt
                ? '<div class="text-[12px] mt-2 pt-2" style="border-top:1px solid var(--border)">' +
                  '<i class="fas fa-lightbulb text-neon mr-1"></i>ถ้าเปลี่ยน Base เป็น <span class="text-neon">/' + u.suggestedCidr + '</span> ' +
                  'สัดส่วนที่ได้ใช้จริงจะเพิ่มเป็น <span class="text-neon">' + pct(wouldBe) + '</span> ' +
                  '<button onclick="onSuggestBase()" class="btn-cyber text-[11px] ml-1 px-2 py-0.5">เปลี่ยนให้เลย</button></div>'
                : '') +

            renderHeadroomHTML() +
        '</div>';
}

/* แผงวิเคราะห์ฝั่ง IPv6
   คำถามที่ผู้ใช้อยากรู้ในโหมดนี้ต่างจาก IPv4 คนละเรื่อง:
     IPv4 ถาม "พื้นที่พอไหม เหลือเท่าไหร่" เพราะ address มีจำกัดจริง
     IPv6 ถาม "แบ่งได้กี่ subnet และขนาด prefix ที่ใช้ถูกต้องตามมาตรฐานไหม"
   จำนวน host ไม่ใช่ข้อจำกัดใน IPv6 เลย (/64 เดียวรองรับได้มากกว่าจำนวนอุปกรณ์ทั้งโลกหลายเท่า)
   จึงรายงานเรื่องนั้นให้ชัดแทนที่จะปล่อยพื้นที่ว่าง */
function renderUtilizationV6(el) {
    if (state.calculatedV6.length === 0) {
        el.classList.remove('hidden');
        el.innerHTML = '<div class="glow-border rounded-lg p-3 text-[13px] text-muted">' +
            '<i class="fas fa-circle-info mr-1"></i>ยังไม่ได้ตั้งค่า IPv6 — กรอก Base แล้วกด Calculate ' +
            'หรือกดปุ่ม <i class="fas fa-wand-magic-sparkles text-neon"></i> ให้ระบบเติมค่ามาตรฐานให้อัตโนมัติ</div>';
        return;
    }
    el.classList.remove('hidden');

    var basePrefix = state.basePrefixLen6, newPrefix = state.newPrefixLen6;
    var bits = newPrefix - basePrefix;
    var total = 1n << BigInt(bits);
    var used = BigInt(state.calculatedV6.length);
    var perSubnet = 1n << BigInt(128 - newPrefix);

    var big = function (v) { return v > 1000000000000n ? '2^' + (v === total ? bits : (128 - newPrefix)) : Number(v).toLocaleString(); };
    // ใช้สัดส่วนต่อล้านแทนเปอร์เซ็นต์ เพราะเลขจริงมักน้อยกว่า 0.01% จนแสดงเป็น 0.0% ไปหมด
    var usedRatio = total > 0n ? Number(used * 1000000n / total) / 10000 : 0;
    var barPct = Math.max(usedRatio, 0.8); // ให้แถบยังมองเห็นได้แม้สัดส่วนจริงจะเล็กมาก

    var isStandard64 = newPrefix === 64;

    el.innerHTML =
        '<div class="glow-border rounded-lg p-3">' +
            '<div class="flex items-baseline justify-between mb-2 flex-wrap gap-1">' +
                '<span class="section-label" style="border:none;padding:0;">การใช้พื้นที่ใน ' + escapeHtml(state.baseIp6) + '/' + basePrefix + '</span>' +
                '<span class="text-[12px] text-muted">แบ่งเป็น /' + newPrefix + '</span>' +
            '</div>' +

            '<div class="flex h-3 rounded overflow-hidden mb-2" style="background:var(--border)">' +
                '<div style="width:' + barPct + '%;background:var(--neon)"></div>' +
            '</div>' +

            '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--neon)"></span>' +
                    '<span class="text-muted">ใช้ไป</span><span class="ml-auto text-neon">' + used.toString() + ' subnet</span></div>' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--cyber);opacity:.45"></span>' +
                    '<span class="text-muted">แบ่งได้ทั้งหมด</span><span class="ml-auto text-cyber">' + big(total) + '</span></div>' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--cyber);opacity:.25"></span>' +
                    '<span class="text-muted">เหลือ</span><span class="ml-auto">' + big(total - used) + '</span></div>' +
            '</div>' +

            '<div class="text-[11px] text-subtle mt-2 leading-relaxed">' +
                'แต่ละ /' + newPrefix + ' รองรับ <span class="text-muted">' + big(perSubnet) + ' address</span> ' +
                '— จำนวน Host ไม่ใช่ข้อจำกัดของ IPv6 จึงไม่ต้องกรอกจำนวนเครื่องเหมือนฝั่ง IPv4 ' +
                '(ใช้ไปเพียง ' + (usedRatio < 0.01 ? 'น้อยกว่า 0.01' : usedRatio.toFixed(2)) + '% ของบล็อก ซึ่งเป็นเรื่องปกติและถูกต้อง)' +
            '</div>' +

            (isStandard64
                ? '<div class="text-cyber text-[12px] mt-2"><i class="fas fa-circle-check mr-1"></i>ใช้ /64 ตามมาตรฐาน — SLAAC (การแจก address อัตโนมัติ) ต้องการขนาดนี้พอดีตาม RFC 4291</div>'
                : '<div class="text-hot text-[12px] mt-2"><i class="fas fa-triangle-exclamation mr-1"></i>ใช้ /' + newPrefix + ' ซึ่งไม่ใช่ /64 — SLAAC จะใช้งานไม่ได้ ' +
                  'เหมาะกับลิงก์ point-to-point (เช่น /127) เท่านั้น ไม่ใช่วงของผู้ใช้ทั่วไป</div>') +
        '</div>';
}

// "โควตาที่ได้ฟรี" — subnet ที่จองให้มักรองรับได้มากกว่าที่ขอ เพราะปัดขึ้นเป็น 2 ยกกำลัง n
// บอกผู้ใช้ว่าเพิ่มเครื่องได้อีกกี่ตัวโดยไม่ต้องเปลี่ยนแผนเลย เป็นข้อมูลที่มีอยู่แล้วแต่ไม่เคยถูกแสดง
function renderHeadroomHTML() {
    var rows = state.calculated.map(function (d) {
        var usable = d.subnet.size - 2;
        var free = usable - Number(d.hosts);
        return { name: d.name, free: free, usable: usable, cidr: d.subnet.cidr };
    }).filter(function (r) { return r.free > 0; })
      .sort(function (a, b) { return b.free - a.free; });

    if (rows.length === 0) return '';
    var top = rows.slice(0, 4);
    return '<div class="text-[12px] mt-2 pt-2" style="border-top:1px solid var(--border)">' +
        '<div class="text-muted mb-1"><i class="fas fa-plus-circle mr-1"></i>เพิ่มเครื่องได้อีกฟรี ๆ โดยไม่เปลี่ยนแผน</div>' +
        top.map(function (r) {
            return '<div class="flex justify-between"><span class="text-muted">' + escapeHtml(r.name) + ' (/' + r.cidr + ')</span>' +
                '<span class="text-cyber">+' + r.free + ' เครื่อง (รองรับ ' + r.usable + ')</span></div>';
        }).join('') +
        (rows.length > top.length ? '<div class="text-subtle mt-1">และอีก ' + (rows.length - top.length) + ' แผนก</div>' : '') +
        '</div>';
}

/* ปุ่มไม้กายสิทธิ์ข้าง Calculate
   บั๊กที่แก้: เดิมฟังก์ชันนี้เขียนค่าลง #baseCidrInput (ช่องของ IPv4) แล้วเรียก onBaseChange() ตรง ๆ เสมอ
   แต่ onBaseChange() มีบรรทัดแรกว่า "ถ้าอยู่โหมด v6 ให้ไปทำ onBaseChangeV6() แทน"
   ผลคือกดปุ่มนี้ตอนอยู่หน้า IPv6 -> ไปแก้ Base ของ IPv4 ที่ซ่อนอยู่แบบเงียบ ๆ
   แล้ว toast ก็รายงานเลข /24 ของ IPv4 ออกมาทั้งที่ผู้ใช้กำลังดูหน้า IPv6 อยู่ (ดูภาพที่ผู้ใช้ส่งมา)
   ตอนนี้แยกทางตามโหมดตั้งแต่บรรทัดแรก ไม่ให้ข้ามฝั่งกันอีก */
// เปลี่ยนชื่อ Router สาขา — ชื่อนี้ถูกใช้เป็น hostname ใน CLI และในคำอธิบายลิงก์ WAN ของอีกฝั่งด้วย
function onBranchRouterRename(id, value) {
    if (typeof pushHistory === 'function') pushHistory('เปลี่ยนชื่อ Router');
    try {
        var node = topoNodes.manualNodes.find(function(n) { return n.id === id; });
        if (!node) return;
        var trimmed = String(value).trim();
        if (!trimmed) return; // ชื่อว่างไม่รับ กันไม่ให้ hostname ใน config กลายเป็นค่าว่าง
        node.label = trimmed.slice(0, 40);
        if (typeof requestRedraw === 'function') requestRedraw();
        if (state.activeTab === 'cli') renderCLI();
        scheduleAutosave();
    } catch (err) {
        console.error('onBranchRouterRename error:', err);
    }
}

/* ----- ตาราง WAN — ลิงก์ /30 ระหว่าง Router -----
   แยกออกมาจากตาราง VLSM ของแผนก เพราะเป็นคนละชนิดข้อมูล (ลิงก์ ไม่ใช่เครือข่ายผู้ใช้)
   และผู้ใช้ต้องเห็นเลข IP ทั้งสองฝั่งพร้อมกันถึงจะเอาไปตั้งค่าอุปกรณ์จริงได้ */
function renderWanTable() {
    var el = document.getElementById('wanPanel');
    if (!el) return;
    var links = state.wanLinks || [];
    if (links.length === 0 || state.ipMode === 'v6') {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.classList.remove('hidden');
    var pool = getWanPool();

    el.innerHTML =
        '<div class="glow-border rounded-lg p-3">' +
            '<div class="flex items-baseline justify-between mb-2 flex-wrap gap-2">' +
                '<span class="section-label" style="border:none;padding:0;"><i class="fas fa-link mr-1"></i>ลิงก์ WAN (' + links.length + ')</span>' +
                '<span class="text-[12px] text-muted">Pool ' + pool.ip + '/' + pool.cidr + ' — จองทีละ /30</span>' +
            '</div>' +
            '<div class="overflow-x-auto"><table class="w-full text-[13px] min-w-[640px]">' +
            '<thead><tr class="text-neon text-left"><th class="pb-2 pr-3">Subnet</th><th class="pb-2 pr-3">Netmask</th>' +
            '<th class="pb-2 pr-3">ปลายทาง A</th><th class="pb-2 pr-3">ปลายทาง B</th>' +
            '<th class="pb-2">ฝั่ง DCE</th></tr></thead><tbody>' +
            links.map(function(w) {
                // ป้าย DCE ติดกับปลายที่เป็น DCE เพื่อให้เห็นทันทีว่าคำสั่ง clock rate จะไปอยู่ที่ Router ตัวไหน
                var tag = function(end) {
                    return w.dceId === end.id
                        ? ' <span class="label-tag" style="background:rgba(240,160,32,0.15);border:1px solid rgba(240,160,32,0.5);color:#b8790f;">DCE</span>'
                        : '';
                };
                var dceEnd = w.ends.find(function(e) { return e.id === w.dceId; }) || w.ends[0];
                return '<tr class="border-t border-dark-600">' +
                    '<td class="py-2 pr-3 text-neon">' + w.network + '/30</td>' +
                    '<td class="py-2 pr-3">' + w.netmask + '</td>' +
                    '<td class="py-2 pr-3"><span class="text-cyber">' + w.ends[0].ip + '</span> ' +
                        '<span class="text-muted text-[12px]">' + escapeHtml(w.ends[0].label) + '</span>' + tag(w.ends[0]) + '</td>' +
                    '<td class="py-2 pr-3"><span class="text-cyber">' + w.ends[1].ip + '</span> ' +
                        '<span class="text-muted text-[12px]">' + escapeHtml(w.ends[1].label) + '</span>' + tag(w.ends[1]) + '</td>' +
                    '<td class="py-2"><button onclick="toggleWanDce(\'' + w.linkId + '\')" class="btn-cyber text-[11px] px-2 py-0.5" ' +
                        'title="สลับให้อีกฝั่งเป็น DCE แทน คำสั่ง clock rate จะย้ายตามไปด้วย">' +
                        '<i class="fas fa-right-left mr-1" aria-hidden="true"></i>' + escapeHtml(dceEnd.label) + '</button></td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>' +

            '<div class="text-[11px] text-subtle mt-2">ใช้ /30 เพราะให้ usable address พอดี 2 ตัว ตรงกับลิงก์ point-to-point ที่มีปลายทางสองฝั่ง</div>' +

            // อธิบายเรื่อง DCE ไว้ตรงนี้ เพราะเป็นจุดที่ทำให้สายไม่ขึ้นบ่อยที่สุดตอนต่อในห้องแล็บ
            '<div class="text-[11px] text-subtle mt-1 leading-relaxed">' +
                'สาย Serial ที่เชื่อม Router สองตัว ฝั่งหนึ่งเป็น <b>DCE</b> อีกฝั่งเป็น <b>DTE</b> เฉพาะฝั่ง DCE เท่านั้นที่ต้องมีคำสั่ง ' +
                '<span class="font-mono">clock rate</span> ในคอนฟิก ถ้าฝั่ง DCE ไม่ได้ตั้ง ลิงก์จะไม่ขึ้นทั้งที่ IP ถูกหมดแล้ว' +
                '<br>ใน Packet Tracer ฝั่ง DCE คืออุปกรณ์ตัวที่คลิกก่อนตอนลากสาย <b>Serial DCE</b> โปรแกรมตั้งให้เป็น Router หลักไว้ ' +
                'ถ้าของจริงเสียบกลับด้าน กดปุ่มในคอลัมน์สุดท้ายเพื่อสลับได้เลย' +
            '</div>' +

            '<div class="flex items-center gap-2 mt-2 flex-wrap">' +
                /* ต้องบอกหน่วยทุกที่ที่ตัวเลขนี้โผล่ เดิมมีแต่ตัวเลขเปล่า เช่น 128,000
                   ซึ่งอ่านแล้วเดาไม่ออกว่าเป็นบิตต่อวินาที ไบต์ต่อวินาที หรือกิโลบิตต่อวินาที
                   คำสั่ง clock rate ของ Cisco รับเป็นบิตต่อวินาที (bps) เสมอ */
                '<label class="text-subtle text-[11px]" for="wanClockRate">ค่า clock rate (bps)</label>' +
                '<select id="wanClockRate" class="input-cyber text-[12px] py-1" onchange="onWanClockRateChange(this.value)" ' +
                    'aria-label="ค่า clock rate ของสาย Serial หน่วยเป็นบิตต่อวินาที">' +
                    WAN_CLOCK_RATES.map(function(r) {
                        return '<option value="' + r + '"' + (r === getWanClockRate() ? ' selected' : '') + '>' + r.toLocaleString() + ' bps</option>';
                    }).join('') +
                '</select>' +
                '<span class="text-subtle text-[11px]">bps คือบิตต่อวินาที ค่ามาตรฐานที่ใช้ในห้องแล็บคือ 64,000 bps</span>' +
            '</div>' +
        '</div>';
}

// เปลี่ยนค่า clock rate ของสาย Serial ทุกเส้นพร้อมกัน
// ตั้งเป็นค่าเดียวทั้งโปรเจกต์โดยตั้งใจ เพราะในห้องแล็บใช้ค่าเดียวกันทุกเส้นอยู่แล้ว
// และการให้ตั้งแยกทีละเส้นจะเพิ่มช่องให้ตั้งไม่ตรงกันจนสายไม่ขึ้นโดยไม่จำเป็น
function onWanClockRateChange(value) {
    var v = Number(value);
    if (WAN_CLOCK_RATES.indexOf(v) === -1) return;
    if (typeof pushHistory === 'function') pushHistory('เปลี่ยนค่า clock rate');
    state.wanClockRate = v;
    refreshAll();
    showToast('เปลี่ยน clock rate เป็น ' + v.toLocaleString() + ' bps แล้ว มีผลกับสาย Serial ทุกเส้น', 'info');
}

function onSuggestBase() {
    if (state.ipMode === 'v6') { suggestBaseV6Info(); return; }
    try {
        if (state.departments.length === 0) { showToast('เพิ่มแผนกก่อน ถึงจะแนะนำ Base ได้', 'error'); return; }
        var cidr = suggestBaseCidr(state.departments);
        if (cidr === null) { showToast('คำนวณ Base ที่เหมาะสมไม่ได้', 'error'); return; }
        if (cidr === state.baseCidr) { showToast('Base /' + cidr + " ตอนนี้พอดีที่สุดแล้ว", 'info'); return; }

        document.getElementById('baseCidrInput').value = cidr;
        onBaseChange(); // ให้ทางเดิมเป็นคนตรวจ+ปัด Network Address+คำนวณ ไม่เขียนตรรกะซ้ำ
        showToast('ปรับ Base เป็น /' + cidr + ' ให้แล้ว ซึ่งเป็นขนาดเล็กที่สุดที่ยังพอใช้ครบทุกแผนก', 'success');
    } catch (err) {
        console.error('onSuggestBase error:', err);
        showToast('โปรแกรมแนะนำ Base ไม่สำเร็จ ลองกดปุ่มไม้กายสิทธิ์ใหม่อีกครั้ง', 'error');
    }
}

/* โหมด IPv6 — ปุ่มนี้ต้อง "ลงมือทำ" ไม่ใช่แค่บอกให้ผู้ใช้ไปพิมพ์เอง
   ฝั่ง IPv4 ปุ่มนี้เปลี่ยนค่าให้จริง ฝั่ง IPv6 เดิมแค่ขึ้นข้อความอธิบายแล้วจบ ซึ่งไม่ช่วยอะไร
   สิ่งที่ทำได้จริงกับ IPv6 (ไล่ตามลำดับ แก้ทุกอย่างที่ยังไม่พร้อมแล้วคำนวณให้เลย):
     1. Prefix ตั้งไว้ไม่ถูกต้อง      -> ตั้งเป็นมาตรฐาน /48 -> /64
     2. ยังไม่มี Base IPv6           -> เติม 2001:db8:: (RFC 3849 บล็อกสำหรับเอกสาร/การเรียนการสอน)
     3. Base ไม่ตรงขอบ Block         -> ปัดลงให้ตรง
     4. แบ่ง subnet ได้ไม่พอทุกแผนก  -> ขยาย Base Prefix ให้สั้นลงจนพอ
   ไม่ทำ "ย่อ prefix ให้พอดีเป๊ะ" แบบ IPv4 เพราะพื้นที่ IPv6 ไม่ใช่ทรัพยากรที่ต้องประหยัด
   และ /64 คือขนาด subnet มาตรฐานที่ SLAAC ต้องการ (RFC 4291) — การไล่บีบให้เหลือ /61 คือการสอนสิ่งที่ผิด */
function suggestBaseV6Info() {
    try {
        var count = state.departments.length;
        if (count === 0) { showToast('เพิ่มแผนกก่อน ถึงจะแนะนำค่า IPv6 ได้', 'error'); return; }

        var changes = [];
        var basePrefix = state.basePrefixLen6;
        var newPrefix = state.newPrefixLen6;

        // 1. Prefix ไม่ถูกต้อง -> กลับไปใช้คู่มาตรฐาน
        if (!Number.isInteger(basePrefix) || basePrefix < 1 || basePrefix > 127 ||
            !Number.isInteger(newPrefix) || newPrefix <= basePrefix || newPrefix > 128) {
            basePrefix = 48; newPrefix = 64;
            changes.push('ตั้ง Prefix เป็นมาตรฐาน /48 → /64');
        }

        // 2. ยังไม่มี Base -> เติมให้
        var base = state.baseIp6;
        if (!base || !isValidIpv6(base)) {
            base = '2001:db8::';
            changes.push('เติม Base IPv6 เป็น 2001:db8:: (บล็อกสำหรับเอกสารตาม RFC 3849)');
        }

        // 3. subnet ไม่พอ -> ขยาย Base Prefix ให้สั้นลงจนพอ (ยังคงขนาด subnet ย่อยเดิมไว้)
        var needBits = Math.max(1, Math.ceil(Math.log2(count)));
        if (newPrefix - basePrefix < needBits) {
            var wanted = Math.max(1, newPrefix - needBits);
            changes.push('ขยาย Base Prefix จาก /' + basePrefix + ' เป็น /' + wanted + ' เพื่อให้แบ่งครบ ' + count + ' แผนก');
            basePrefix = wanted;
        }

        // 4. ปัด Base ลงหาขอบ Block (ทำหลังสุด เพราะ basePrefix อาจเพิ่งเปลี่ยนในขั้น 3)
        var normalized = normalizeIpv6Network(base, basePrefix);
        if (normalized !== null && normalized !== base) {
            changes.push('ปัด Base IPv6 ให้ตรงกับจุดเริ่มต้นของก้อน: ' + normalized + '/' + basePrefix);
            base = normalized;
        }

        // เขียนค่ากลับลงช่องกรอกจริง แล้วให้ทางเดิมเป็นคนตรวจ+คำนวณ ไม่เขียนตรรกะซ้ำ
        document.getElementById('baseIp6Input').value = base;
        document.getElementById('basePrefixInput').value = basePrefix;
        document.getElementById('newPrefixInput').value = newPrefix;
        onBaseChangeV6();

        var bits = newPrefix - basePrefix;
        var maxSubnets = 1n << BigInt(bits);
        var maxText = maxSubnets > 1000000000000n ? '2^' + bits : Number(maxSubnets).toLocaleString();

        if (changes.length > 0) {
            showToast('ปรับค่า IPv6 ให้แล้ว:\n• ' + changes.join('\n• '), 'success');
        } else {
            showToast('ตั้งค่า IPv6 ให้แล้ว จาก /' + basePrefix + ' แบ่งเป็น /' + newPrefix + ' ได้ทั้งหมด ' + maxText + ' ชุด ใช้จริง ' + count + ' ชุด' + '\n' +
                'IPv6 ไม่ต้องย่อ Base ให้พอดี เพราะพื้นที่ไม่ใช่ทรัพยากรที่ต้องประหยัด และ /64 คือขนาดมาตรฐานที่ SLAAC ต้องการ (RFC 4291)', 'info');
        }
    } catch (err) {
        console.error('suggestBaseV6Info error:', err);
        showToast('โปรแกรมปรับค่า IPv6 ไม่สำเร็จ ลองกดปุ่มไม้กายสิทธิ์ใหม่อีกครั้ง', 'error');
    }
}

function renderDetailPanel() {
    const focusSnap = captureDetailFocus();
    renderDetailPanelInner();
    restoreDetailFocus(focusSnap);
}

function renderDetailPanelInner() {
    const el = document.getElementById('detailContent');
    if (!state.selectedDeptId && state.selectedNodeType !== 'router') {
        el.innerHTML = '<div class="text-muted text-center py-10 text-[13px]">เลือก Node ในผังเพื่อแก้ไข</div>';
        return;
    }
    if (state.selectedNodeType === 'router') {
        el.innerHTML =
            '<div class="mb-4"><div class="label-tag text-hot mb-2" style="background:rgba(240,87,92,0.1);border:1px solid rgba(240,87,92,0.3);">ROUTER</div>' +
            '<div class="text-lg font-display text-hot mb-3">Router-01</div></div>' +
            '<div class="space-y-3 text-[13px]">' +
                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">BASE NETWORK</div><div class="text-neon text-sm">' + state.baseIp + '/' + state.baseCidr + '</div></div>' +
                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">SUBNET MASK</div><div class="text-cyber text-sm">' + cidrToMask(state.baseCidr) + '</div></div>' +
                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">TOTAL SUBNETS</div><div class="text-neon text-sm">' + state.calculated.length + '</div></div>' +
                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">CONNECTED DEPARTMENTS</div>' +
                '<div class="space-y-1 mt-1">' + state.calculated.map(function(d) { return '<div class="flex justify-between"><span>' + escapeHtml(d.name) + '</span><span class="text-neon">' + d.subnet.network + '/' + d.subnet.cidr + '</span></div>'; }).join('') + '</div></div>' +
            '</div>';
        return;
    }

    if (state.selectedNodeType === 'switch') {
        const sw = topoNodes.switches.find(function(s) { return s.deptId === state.selectedDeptId; });
        const swDept = state.calculated.find(function(d) { return d.id === state.selectedDeptId; });
        if (!sw || !swDept) {
            // Switch นี้หายไปแล้ว (เช่นแผนกถูกลบ/คำนวณใหม่) เคลียร์ selection กันค้างพาเนลเก่า
            el.innerHTML = '<div class="text-muted text-center py-10 text-[13px]">Switch ตัวนี้ถูกลบไปแล้ว ลองคลิกเลือกอุปกรณ์ตัวอื่นในผัง</div>';
            state.selectedDeptId = null;
            state.selectedNodeType = null;
            return;
        }
        el.innerHTML =
            '<div class="mb-4"><div class="label-tag mb-2" style="background:' + sw.color + '15;border:1px solid ' + sw.color + '50;color:' + sw.color + ';">SWITCH</div>' +
            '<div class="text-lg font-display mb-3" style="color:' + sw.color + '">' + escapeHtml(sw.label) + '</div></div>' +
            '<div class="space-y-3 text-[13px]">' +
                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">VLAN ID</div><div class="text-sm" style="color:' + sw.color + '">' + sw.vlanId + '</div></div>' +
                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">CONNECTED DEPARTMENT</div><div class="text-neon text-sm">' + escapeHtml(swDept.name) + '</div></div>' +
                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">TRUNK TO</div><div class="text-hot text-sm">Router-01</div></div>' +
            '</div>';
        return;
    }

    if (state.selectedNodeType === 'router-branch') {
        const br = topoNodes.manualNodes.find(function(n) { return n.id === state.selectedDeptId; });
        if (!br) {
            el.innerHTML = '<div class="text-muted text-center py-10 text-[13px]">Router ตัวนี้ถูกลบไปแล้ว ลองคลิกเลือกอุปกรณ์ตัวอื่นในผัง</div>';
            state.selectedDeptId = null; state.selectedNodeType = null;
            return;
        }
        const wan = getWanLinksOfRouter(br.id);
        const owned = getDeptsOfRouter(br.id);
        // Router สาขาที่ยังไม่มีลิงก์ WAN = ยังใช้งานไม่ได้จริง (ดู isOrphanBranchRouter ใน wan.js)
        // เป็นสภาพที่ผู้ใช้เจอทุกคนตอนวาง Router ตัวแรก เพราะปุ่มบน Canvas วางให้เป็น "สาขา" เสมอ
        // เดิมมีแค่ข้อความบรรทัดเดียวในกล่องลิงก์ WAN ซึ่งอ่านเหมือนรายงานสถานะ ไม่ใช่สิ่งที่ต้องลงมือทำ
        // จึงยกขึ้นมาไว้บนสุดเป็นขั้นตอนที่ทำตามได้ทีละข้อ
        const orphanNotice = wan.length > 0 ? '' :
            '<div class="rounded p-3 mb-3" style="background:rgba(240,160,32,0.1);border:1px solid rgba(240,160,32,0.5);">' +
                '<div class="text-[13px] font-bold mb-1" style="color:#f0a020;">' +
                    '<i class="fas fa-triangle-exclamation mr-1" aria-hidden="true"></i>Router นี้ยังใช้งานไม่ได้</div>' +
                '<div class="text-muted text-[12px] leading-relaxed">' +
                    'Router สาขาต้องมีทางออกก่อน ไม่งั้นจะไม่มี IP ฝั่ง WAN และแผนกที่ย้ายมาอยู่หลังมันจะถูกตัดขาด' +
                    '<div class="mt-2 text-[12px]" style="color:var(--text);">' +
                        '<div class="mb-1"><b>1.</b> กดปุ่ม <b>Connect</b> มุมขวาบนของผัง</div>' +
                        '<div class="mb-1"><b>2.</b> คลิก Router นี้ แล้วคลิก <b>Router-01</b> (ตัวหลัก)</div>' +
                        '<div><b>3.</b> ระบบจะจอง <b>/30</b> ให้เองทันที แล้วคำเตือนนี้จะหายไป</div>' +
                    '</div>' +
                    '<div class="mt-2 text-[12px]">อยากให้ดูแลแผนกไหน ค่อยลากเชื่อมกับ <b>Switch</b> ของแผนกนั้นทีหลังได้</div>' +
                '</div>' +
            '</div>';

        el.innerHTML =
            '<div class="mb-4"><div class="label-tag mb-2" style="background:' + br.color + '15;border:1px solid ' + br.color + '50;color:' + br.color + ';">ROUTER สาขา</div></div>' +
            orphanNotice +
            '<div class="space-y-3">' +
                '<div><label class="text-subtle text-[11px] tracking-wider block mb-1">ชื่ออุปกรณ์</label>' +
                '<input id="detailRouterName" type="text" value="' + escapeHtml(br.label) + '" maxlength="40" class="input-cyber w-full" ' +
                    'oninput="onBranchRouterRename(\'' + br.id + '\', this.value)" /></div>' +

                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">ลิงก์ WAN (' + wan.length + ')</div>' +
                (wan.length === 0
                    ? '<div class="text-muted text-[13px]">ยังไม่ได้เชื่อม — ทำตาม 3 ขั้นตอนด้านบน</div>'
                    : wan.map(function(w) {
                        // เดิมไม่มีทางลบสายทีละเส้นเลย มีแต่ลบทั้งอุปกรณ์ทิ้ง ซึ่งแรงเกินไปเมื่อแค่อยากย้ายสาย
                        return '<div class="text-[13px] mt-1 flex items-start justify-between gap-2">' +
                            '<div><div class="text-neon">' + w.myIp + '/30</div>' +
                            '<div class="text-muted text-[12px]">ไปยัง ' + escapeHtml(w.peerLabel) + ' (' + w.peerIp + ') • subnet ' + w.link.network + '/30</div></div>' +
                            '<button onclick="onRemoveLink(\'' + w.link.linkId + '\')" class="text-subtle hover:text-hot flex-shrink-0" title="ลบสายเส้นนี้" aria-label="ลบลิงก์ WAN ที่ไปยัง ' + escapeHtml(w.peerLabel) + '"><i class="fas fa-unlink" aria-hidden="true"></i></button>' +
                        '</div>';
                    }).join('')) +
                '</div>' +

                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">แผนกที่ดูแล (' + owned.length + ')</div>' +
                (owned.length === 0
                    ? '<div class="text-muted text-[13px]">ยังไม่มี — ลากเชื่อมกับ Switch ของแผนกเพื่อย้ายแผนกนั้นมาอยู่หลัง Router นี้</div>'
                    : owned.map(function(d) {
                        return '<div class="flex justify-between text-[13px]"><span>' + escapeHtml(d.name) + '</span>' +
                            '<span class="text-neon">' + d.subnet.network + '/' + d.subnet.cidr + '</span></div>';
                    }).join('')) +
                '</div>' +

                '<button onclick="onRemoveManualNode(\'' + br.id + '\')" class="btn-hot w-full text-[13px] mt-2"><i class="fas fa-trash mr-1"></i>ลบ Router นี้</button>' +
            '</div>';
        return;
    }

    if (state.selectedNodeType === 'pc' || state.selectedNodeType === 'server') {
        const node = topoNodes.manualNodes.find(function(n) { return n.id === state.selectedDeptId; });
        if (!node) {
            // อุปกรณ์นี้ถูกลบไปแล้ว (เช่นกด Remove จาก Detail Panel เอง) เคลียร์ selection กันค้างพาเนลเก่า
            el.innerHTML = '<div class="text-muted text-center py-10 text-[13px]">อุปกรณ์ตัวนี้ถูกลบไปแล้ว ลองคลิกเลือกอุปกรณ์ตัวอื่นในผัง</div>';
            state.selectedDeptId = null;
            state.selectedNodeType = null;
            return;
        }
        const linkedDept = node.linkedDeptId ? state.calculated.find(function(d) { return d.id === node.linkedDeptId; }) : null;
        const typeLabel = node.type === 'pc' ? 'PC' : 'SERVER';

        // เช็คว่า IP ที่มีอยู่ยังอยู่ในช่วง subnet ปัจจุบันไหม (subnet อาจขยับเพราะแก้ hosts แผนกอื่นทีหลัง)
        var ipOutOfRange = false;
        if (node.ip && linkedDept) {
            var ipL = ipToLong(node.ip);
            ipOutOfRange = ipL < ipToLong(linkedDept.subnet.firstUsable) || ipL > ipToLong(linkedDept.subnet.lastUsable);
        }

        el.innerHTML =
            '<div class="mb-4"><div class="label-tag mb-2" style="background:' + node.color + '15;border:1px solid ' + node.color + '50;color:' + node.color + ';">' + typeLabel + '</div>' +
            '<div class="text-lg font-display mb-3" style="color:' + node.color + '">' + node.label + '</div></div>' +
            '<div class="space-y-3">' +
                '<div><label class="text-subtle text-[11px] tracking-wider block mb-1">IP ADDRESS</label>' +
                '<div class="flex gap-2">' +
                    '<input id="detailManualIp" type="text" value="' + (node.ip || '') + '" placeholder="ยังไม่กำหนด" class="input-cyber flex-1 min-w-0" ' +
                        'oninput="onManualIpInput(\'' + node.id + '\',this.value)" onchange="onManualIpChange(\'' + node.id + '\',this.value)" />' +
                    (linkedDept ? '<button onclick="onSuggestIp(\'' + node.id + '\')" class="btn-neon text-[12px] flex-shrink-0 px-3" title="แนะนำ IP ว่างถัดไปจาก subnet ของ ' + escapeHtml(linkedDept.name) + '" aria-label="แนะนำ IP ว่างถัดไปจาก subnet ของ ' + escapeHtml(linkedDept.name) + '"><i class="fas fa-magic" aria-hidden="true"></i></button>' : '') +
                '</div>' +
                (ipOutOfRange ? '<div class="text-hot text-[12px] mt-1"><i class="fas fa-triangle-exclamation mr-1"></i>IP นี้อยู่นอกช่วง subnet ปัจจุบันแล้ว (subnet เปลี่ยนจากการแก้ไข Host) กด Suggest IP ใหม่</div>' : '') +
                '</div>' +
                '<div class="glow-border rounded p-3"><div class="text-subtle text-[11px] tracking-wider mb-1">CONNECTED DEPARTMENT</div>' +
                '<div class="text-neon text-sm">' + (linkedDept ? escapeHtml(linkedDept.name) + ' (' + linkedDept.subnet.network + '/' + linkedDept.subnet.cidr + ')' : 'ยังไม่ได้เชื่อมกับ Switch ใด — กด Connect แล้วลากมาเชื่อม') + '</div></div>' +
                '<button onclick="onRemoveManualNode(\'' + node.id + '\')" class="btn-hot w-full text-[13px] mt-2"><i class="fas fa-trash mr-1"></i>ลบอุปกรณ์นี้</button>' +
            '</div>';
        return;
    }

    const dept = state.calculated.find(function(d) { return d.id === state.selectedDeptId; }) || state.departments.find(function(d) { return d.id === state.selectedDeptId; });
    if (!dept) return;
    const linkedSw = topoNodes.switches.find(function(s) { return s.deptId === dept.id; });
    const vlanId = linkedSw ? linkedSw.vlanId : null;
    const color = getDeptColor(dept.id);

    const deptV6 = state.calculatedV6.find(function(d) { return d.id === dept.id; });

    el.innerHTML =
        '<div class="mb-4"><div class="label-tag mb-2" style="background:' + color + '15;border:1px solid ' + color + '50;color:' + color + ';">DEPARTMENT</div></div>' +
        '<div class="space-y-3">' +
            '<div><label class="text-subtle text-[11px] tracking-wider block mb-1">DEPARTMENT NAME</label>' +
            '<input id="detailName" type="text" value="' + escapeHtml(dept.name) + '" class="input-cyber w-full" oninput="onDetailInput(' + dept.id + ',\'name\',this.value)" /></div>' +
            '<div><label class="text-subtle text-[11px] tracking-wider block mb-1">REQUIRED HOSTS</label>' +
            '<input id="detailHosts" type="number" value="' + dept.hosts + '" min="1" max="65534" class="input-cyber w-full" oninput="onDetailInput(' + dept.id + ',\'hosts\',parseInt(this.value)||1)" /></div>' +
            '<div class="border-t border-dark-600 pt-3"><div class="section-label mb-2">SUBNET INFO (IPv4)</div>' +
            '<div id="detailSubnetInfo">' + (dept.subnet ? renderSubnetInfoHTML(dept, vlanId, color) : '<div class="text-muted text-[13px]">ยังไม่มีข้อมูล — กด Calculate</div>') + '</div></div>' +
            '<div class="border-t border-dark-600 pt-3"><div class="section-label mb-2">SUBNET INFO (IPv6)</div>' +
            (deptV6 ? renderSubnetInfoV6HTML(deptV6, color) : '<div class="text-muted text-[13px]">ยังไม่มีข้อมูล — สลับโหมด IPv6 แล้วกด Calculate</div>') +
            '</div>' +
        '</div>';
}

function renderSubnetInfoV6HTML(deptV6, color) {
    var s = deptV6.subnet6;
    return '<div class="space-y-2 text-[13px]">' +
        '<div class="glow-border rounded p-2 flex justify-between gap-2"><span class="text-muted flex-shrink-0">Network/Prefix</span><span class="text-neon text-right break-all">' + s.cidrText + '</span></div>' +
        '<div class="glow-border rounded p-2 flex justify-between gap-2"><span class="text-muted flex-shrink-0">Usable</span><span class="text-cyber text-right break-all">' + s.firstUsable + ' – ' + s.lastUsable + '</span></div>' +
        '<div class="glow-border rounded p-2 flex justify-between"><span class="text-muted">Total Addresses</span><span>' + s.totalAddresses + '</span></div>' +
    '</div>';
}

function renderSubnetInfoHTML(dept, vlanId, color) {
    var s = dept.subnet;
    return '<div class="space-y-2 text-[13px]">' +
        '<div class="glow-border rounded p-2 flex justify-between"><span class="text-muted">VLAN</span><span style="color:' + color + '">' + vlanId + '</span></div>' +
        '<div class="glow-border rounded p-2 flex justify-between"><span class="text-muted">Network</span><span class="text-neon">' + s.network + '/' + s.cidr + '</span></div>' +
        '<div class="glow-border rounded p-2 flex justify-between"><span class="text-muted">Broadcast</span><span class="text-hot">' + s.broadcast + '</span></div>' +
        '<div class="glow-border rounded p-2 flex justify-between"><span class="text-muted">Usable</span><span class="text-cyber">' + s.firstUsable + ' — ' + s.lastUsable + '</span></div>' +
        '<div class="glow-border rounded p-2 flex justify-between"><span class="text-muted">Mask</span><span>' + s.netmask + '</span></div>' +
        '<div class="glow-border rounded p-2 flex justify-between"><span class="text-muted">Wildcard</span><span>' + s.wildcard + '</span></div>' +
        '<div class="glow-border rounded p-2 flex justify-between"><span class="text-muted">Subnet Size</span><span>' + s.size + ' addresses</span></div>' +
    '</div>';
}

function updateDetailSubnetInfo() {
    if (!state.detailOpen) return;
    // Panel ของ PC/Server/Department ล้วนมีข้อมูลที่โยงกับผลคำนวณ (IPv4 และ/หรือ IPv6) -> re-render ทั้งพาเนลทุกครั้งที่คำนวณใหม่
    // (เช่น subnet ขยับตำแหน่งเพราะแก้ hosts ของแผนกอื่น หรือคำนวณ IPv6 ใหม่) กันไม่ให้ Panel ค้างข้อมูลเก่า
    if (state.selectedNodeType === 'pc' || state.selectedNodeType === 'server' || state.selectedNodeType === 'department' || state.selectedNodeType === 'router-branch') {
        renderDetailPanel();
    }
}

function onDetailInput(deptId, field, value) {
    if (isEditing) return;
    if (typeof pushHistory === 'function') pushHistory(field === 'name' ? 'เปลี่ยนชื่อแผนก' : 'แก้จำนวน Host');
    isEditing = true;
    try {
        var dept = state.departments.find(function(d) { return d.id === deptId; });
        if (!dept) return;
        if (field === 'name') {
            var trimmed = String(value).trim();
            if (!trimmed) return; // ไม่ยอมให้ชื่อว่างเปล่า กันช่องว่างไปโผล่ในผัง/ตาราง/CLI
            dept.name = trimmed;
        } else if (field === 'hosts') {
            var h = parseInt(value);
            if (isNaN(h)) h = 1;
            dept.hosts = Math.min(Math.max(h, 1), 65534); // กัน Host เยอะเกินจนคำนวณ CIDR พัง
        } else {
            dept[field] = value;
        }
        refreshAll();
        updateDetailSubnetInfo();
    } catch (err) {
        console.error('onDetailInput error:', err);
        if (typeof showToast === 'function') showToast('โปรแกรมแก้ไขไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    } finally {
        isEditing = false;
    }
}

function onBaseChange() {
    if (state.ipMode === 'v6') { onBaseChangeV6(); return; }
    var ip = document.getElementById('baseIpInput').value.trim();
    var cidr = parseInt(document.getElementById('baseCidrInput').value);
    if (!isValidIp(ip)) { showToast('รูปแบบเลข IP ไม่ถูกต้อง ต้องเป็นตัวเลขสี่ชุดคั่นด้วยจุด', 'error'); return; }
    if (isNaN(cidr) || cidr < 8 || cidr > 30) { showToast('ตัวเลขหลังเครื่องหมาย / ต้องอยู่ระหว่าง 8 ถึง 30', 'error'); return; }
    if (typeof pushHistory === 'function') pushHistory('เปลี่ยน Base Network');

    // ปัดลงหาขอบ block ก่อนเสมอ — ใส่ 10.0.0.5/24 ต้องได้ 10.0.0.0/24 ไม่ใช่เริ่มแจกจาก .5
    var normalized = normalizeNetwork(ip, cidr);
    var wasAdjusted = normalized !== ip;
    if (wasAdjusted) {
        ip = normalized;
        document.getElementById('baseIpInput').value = ip; // สะท้อนกลับในช่องกรอกให้ผู้ใช้เห็นว่าระบบใช้ค่าไหนจริง
    }

    state.baseIp = ip;
    state.baseCidr = cidr;
    try {
        refreshAll();
        document.getElementById('statusBar').textContent = 'Base: ' + ip + '/' + cidr + ' | ' + state.calculated.length + ' subnets allocated';
        if (wasAdjusted) showToast('ปรับ Base เป็น Network Address: ' + ip + '/' + cidr, 'info');
        else showToast('คำนวณเรียบร้อยแล้ว', 'success');
    } catch (err) {
        console.error('onBaseChange error:', err);
        showToast('โปรแกรมคำนวณไม่สำเร็จ ลองตรวจชื่อแผนกกับจำนวนเครื่องอีกครั้ง แล้วกด CALCULATE ใหม่', 'error');
    }
}

function onBaseChangeV6() {
    var ip = document.getElementById('baseIp6Input').value.trim();
    var prefix = parseInt(document.getElementById('basePrefixInput').value);
    var newPrefix = parseInt(document.getElementById('newPrefixInput').value);
    if (!isValidIpv6(ip)) { showToast('รูปแบบเลข IPv6 ไม่ถูกต้อง', 'error'); return; }
    if (isNaN(prefix) || prefix < 1 || prefix > 127) { showToast('ความยาว Prefix ของ IPv6 ต้องอยู่ระหว่าง 1 ถึง 127', 'error'); return; }
    if (isNaN(newPrefix) || newPrefix <= prefix || newPrefix > 128) { showToast('Prefix ย่อยต้องมากกว่า Base Prefix และไม่เกิน 128', 'error'); return; }

    // ปัดลงหาขอบ Block ก่อนเสมอ เหมือนที่ฝั่ง IPv4 ทำ
    // เดิมถ้ากรอก 2001:db8:0:5::/48 จะขึ้น error แล้วได้ผลลัพธ์เปล่า ผู้ใช้ต้องไปแก้เองทั้งที่ระบบรู้คำตอบอยู่แล้ว
    var normalized6 = normalizeIpv6Network(ip, prefix);
    var v6Adjusted = normalized6 !== null && normalized6 !== ip;
    if (v6Adjusted) {
        ip = normalized6;
        document.getElementById('baseIp6Input').value = ip; // สะท้อนกลับให้ผู้ใช้เห็นว่าระบบใช้ค่าไหนจริง
    }

    if (typeof pushHistory === 'function') pushHistory('เปลี่ยน Base IPv6');
    state.baseIp6 = ip;
    state.basePrefixLen6 = prefix;
    state.newPrefixLen6 = newPrefix;
    try {
        refreshAll();
        document.getElementById('statusBar').textContent = 'IPv6 Base: ' + ip + '/' + prefix + ' → /' + newPrefix + ' | ' + state.calculatedV6.length + ' subnets allocated';
        if (v6Adjusted) showToast('ปรับ Base IPv6 ให้ตรงกับจุดเริ่มต้นของก้อนแล้ว: ' + ip + '/' + prefix, 'info');
        else showToast('คำนวณ IPv6 เรียบร้อยแล้ว', 'success');
    } catch (err) {
        console.error('onBaseChangeV6 error:', err);
        showToast('โปรแกรมคำนวณ IPv6 ไม่สำเร็จ ลองตรวจ Base IPv6 กับ Prefix อีกครั้ง แล้วกด CALCULATE ใหม่', 'error');
    }
}

function setIpMode(mode, silent) {
    try {
        state.ipMode = mode;
        var v4El = document.getElementById('v4Inputs');
        var v6El = document.getElementById('v6Inputs');
        var btnV4 = document.getElementById('btnModeV4');
        var btnV6 = document.getElementById('btnModeV6');
        if (v4El) v4El.classList.toggle('hidden', mode !== 'v4');
        if (v6El) v6El.classList.toggle('hidden', mode !== 'v6');
        if (btnV4) { btnV4.classList.toggle('btn-neon', mode === 'v4'); btnV4.classList.toggle('btn-cyber', mode !== 'v4'); }
        if (btnV6) { btnV6.classList.toggle('btn-neon', mode === 'v6'); btnV6.classList.toggle('btn-cyber', mode !== 'v6'); }
        renderTable();
        renderWanTable();
        renderUtilization(); // แผงสรุปพื้นที่ใช้เฉพาะโหมด IPv4 — ตัวมันเองเป็นคนซ่อนตัวเองตอนอยู่โหมด v6
        layoutTopology(); // รีเฟรช label บน canvas ให้ตรงกับโหมดที่เพิ่งสลับ
        // silent = true ตอนเรียกจาก applyProjectData() (โหลดโปรเจกต์) — ไม่ใช่ผู้ใช้กดสลับเอง ไม่ควร toast ซ้อนกับ toast โหลดสำเร็จ
        if (!silent) showToast('สลับไปโหมด ' + (mode === 'v6' ? 'IPv6' : 'IPv4'), 'info');
    } catch (err) {
        console.error('setIpMode error:', err);
        showToast('โปรแกรมสลับโหมดไม่สำเร็จ ลองกดปุ่ม IPv4 หรือ IPv6 ใหม่อีกครั้ง', 'error');
    }
}

/* ============================================
   Light/Dark Mode
   CSS variable (--bg, --card, --text, ...) คุมสี HTML/CSS ได้เองผ่าน [data-theme="light"]
   แต่ Canvas (topology.js) กับสีอุปกรณ์ (devices.js) วาดด้วยค่าตรงๆ ไม่ใช่ CSS
   เลยต้องสลับตัวแปร JS คู่ขนาน (DEPT_COLORS, ROUTER_COLOR, CANVAS_BOX_BG, ...) เองตรงนี้ด้วย
   ============================================ */
function applyTheme(mode) {
    try {
        state.theme = mode;
        document.documentElement.setAttribute('data-theme', mode === 'light' ? 'light' : '');
        try { localStorage.setItem('netforge_theme', mode); } catch (e) { /* localStorage อาจใช้ไม่ได้ (private mode, file://, ฯลฯ) — แค่จำข้ามเซสชันไม่ได้ ไม่ใช่เหตุให้สลับธีมล้มเหลว */ }

        DEPT_COLORS = mode === 'light' ? DEPT_COLORS_LIGHT : DEPT_COLORS_DARK;
        ROUTER_COLOR = mode === 'light' ? ROUTER_COLOR_LIGHT : ROUTER_COLOR_DARK;
        PC_COLOR = mode === 'light' ? PC_COLOR_LIGHT : PC_COLOR_DARK;
        SERVER_COLOR = mode === 'light' ? SERVER_COLOR_LIGHT : SERVER_COLOR_DARK;
        BRANCH_COLOR = mode === 'light' ? BRANCH_COLOR_LIGHT : BRANCH_COLOR_DARK;
        CANVAS_BOX_BG = mode === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(15,17,21,0.95)'; // ต้องตรงกับ --card ใน style.css เสมอ (light = #FFFFFF ตั้งแต่รอบปรับ 30 ก.ค. 2569)
        CANVAS_GRID_COLOR = mode === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(0,212,255,0.04)';
        CANVAS_LABEL_COLOR = mode === 'light' ? '#1A1D24' : '#e0e0f0';

        if (typeof requestRedraw === 'function') requestRedraw();
        if (typeof recolorTopology === 'function') recolorTopology(); // ทาสีใหม่ใน node ที่มีอยู่แล้ว ไม่รื้อตำแหน่งที่ลากไว้
        updateThemeButton();
    } catch (err) {
        console.error('applyTheme error:', err);
    }
}

function toggleTheme() {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
    showToast('สลับเป็น' + (state.theme === 'light' ? 'โหมดสว่าง' : 'โหมดมืด'), 'info');
}

function updateThemeButton() {
    var btn = document.getElementById('btnTheme');
    if (!btn) return;
    btn.innerHTML = state.theme === 'light'
        ? '<i class="fas fa-moon mr-1"></i>DARK'
        : '<i class="fas fa-sun mr-1"></i>LIGHT';
}

// สลับแท็บในหน้าคู่มือ — เนื้อหายาวเกินกว่าจะยัดหน้าเดียวหลังเพิ่มฟีเจอร์หลายรอบ
function switchHelpTab(name) {
    document.querySelectorAll('.help-tab').forEach(function(b) {
        b.classList.toggle('active', b.dataset.help === name);
    });
    document.querySelectorAll('.help-pane').forEach(function(p) {
        p.classList.toggle('hidden', p.id !== 'help-' + name);
    });
}

// ----- หน้าคู่มือ: เรียกดูซ้ำได้ทุกเมื่อผ่านปุ่ม HELP หรือกด ? -----
function showOnboarding() {
    var el = document.getElementById('onboardOverlay');
    if (el) el.classList.remove('hidden');
}

function closeOnboarding() {
    var el = document.getElementById('onboardOverlay');
    if (el) el.classList.add('hidden');
    // บันทึกว่าเคยเห็นแล้ว กันไม่ให้เด้งอัตโนมัติอีกครั้งหน้า — บันทึกไม่ได้ก็ปล่อยผ่าน ไม่ block การใช้งาน
    try { localStorage.setItem('netforge_onboarded', '1'); } catch (e) { /* เงียบๆ */ }
}

// เรียกจาก init() เท่านั้น — เช็คว่าเคยปิด Modal นี้ไปแล้วหรือยัง ถ้ายังไม่เคยให้โชว์อัตโนมัติ
function maybeShowOnboardingOnFirstVisit() {
    var seen = false;
    try { seen = localStorage.getItem('netforge_onboarded') === '1'; } catch (e) { /* อ่านไม่ได้ ถือว่ายังไม่เคยเห็น แสดงให้ดูไว้ก่อน */ }
    if (!seen) showOnboarding();
}

function onAddDept() {
    if (isEditing) return;
    if (typeof pushHistory === 'function') pushHistory('เพิ่มแผนก');
    var nameEl = document.getElementById('newDeptName');
    var hostsEl = document.getElementById('newDeptHosts');
    var name = nameEl.value.trim();
    var hosts = parseInt(hostsEl.value);
    if (!name) { showToast('ยังไม่ได้ตั้งชื่อแผนก', 'error'); return; }
    if (isNaN(hosts) || hosts < 1) { showToast('จำนวนเครื่องต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป', 'error'); return; }
    if (hosts > 65534) { showToast('Hosts สูงสุด 65534 (เทียบเท่า /16)', 'error'); return; }
    if (state.departments.length >= MAX_DEPARTMENTS) { showToast('สูงสุด ' + MAX_DEPARTMENTS + ' แผนก', 'error'); return; }
    isEditing = true;
    try {
        state.departments.push({ id: state.nextId++, name: name, hosts: hosts });
        nameEl.value = '';
        hostsEl.value = '';
        refreshAll();
        document.getElementById('statusBar').textContent = 'Added: ' + name + ' (' + hosts + ' hosts)';
        showToast('เพิ่ม ' + name + ' สำเร็จ', 'success');
    } catch (err) {
        console.error('onAddDept error:', err);
        showToast('โปรแกรมเพิ่มแผนกไม่สำเร็จ ลองกดปุ่มเพิ่มแผนกใหม่อีกครั้ง', 'error');
    } finally {
        isEditing = false;
    }
}

/* ทำซ้ำแผนก — เวลาวางแผนจริงมักมีหลายแผนกขนาดใกล้กัน (เช่น Classroom-A/B/C)
   เดิมต้องพิมพ์ชื่อและจำนวนเครื่องใหม่ทุกครั้ง */
function onDuplicateDept(id) {
    if (isEditing) return;
    var src = state.departments.find(function(d) { return d.id === id; });
    if (!src) return;
    if (state.departments.length >= MAX_DEPARTMENTS) { showToast('สูงสุด ' + MAX_DEPARTMENTS + ' แผนก', 'error'); return; }
    if (typeof pushHistory === 'function') pushHistory('ทำซ้ำแผนก');
    isEditing = true;
    try {
        // แทรกต่อท้ายตัวต้นฉบับทันที ไม่ใช่ท้ายรายการ เพื่อให้อ่านง่ายว่าคู่ไหนคู่กัน
        var idx = state.departments.indexOf(src);
        var copy = { id: state.nextId++, name: src.name + '-copy', hosts: src.hosts };
        state.departments.splice(idx + 1, 0, copy);
        refreshAll();
        showToast('ทำซ้ำ ' + src.name + ' แล้ว', 'success');
    } catch (err) {
        console.error('onDuplicateDept error:', err);
        showToast('โปรแกรมทำสำเนาแผนกไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    } finally {
        isEditing = false;
    }
}

/* เลื่อนลำดับแผนก — ลำดับนี้ไม่กระทบการคำนวณ VLSM (ซึ่งเรียงตามขนาดเสมอ)
   แต่กระทบลำดับที่แสดงใน sidebar และการแบ่ง subnet ฝั่ง IPv6 ซึ่งเรียงตามลำดับที่เพิ่ม
   ใช้ปุ่มขึ้น/ลงแทนการลากวาง เพราะทำงานได้ทั้งเมาส์ คีย์บอร์ด และการสัมผัส โดยไม่ต้องเขียน drag-and-drop */
function onMoveDept(id, delta) {
    if (isEditing) return;
    var idx = state.departments.findIndex(function(d) { return d.id === id; });
    var target = idx + delta;
    if (idx < 0 || target < 0 || target >= state.departments.length) return;
    if (typeof pushHistory === 'function') pushHistory('สลับลำดับแผนก');
    isEditing = true;
    try {
        var tmp = state.departments[idx];
        state.departments[idx] = state.departments[target];
        state.departments[target] = tmp;
        refreshAll();
    } catch (err) {
        console.error('onMoveDept error:', err);
    } finally {
        isEditing = false;
    }
}

function onRemoveDept(id) {
    if (isEditing) return;
    if (typeof pushHistory === 'function') pushHistory('ลบแผนก');
    isEditing = true;
    try {
        var dept = state.departments.find(function(d) { return d.id === id; });
        state.departments = state.departments.filter(function(d) { return d.id !== id; });
        if (state.selectedDeptId === id) {
            state.selectedDeptId = null;
            state.selectedNodeType = null;
            closeDetailPanel();
        }
        refreshAll();
        if (typeof detachManualNodesFromDept === 'function') detachManualNodesFromDept(id);
        showToast((dept ? 'ลบ ' + dept.name + ' แล้ว' : 'ลบแผนกแล้ว') + ' ถ้าลบผิดกด Ctrl+Z เพื่อเอากลับคืนได้', 'info');
    } catch (err) {
        console.error('onRemoveDept error:', err);
        showToast('โปรแกรมลบแผนกไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    } finally {
        isEditing = false;
    }
}

// คัดลอกข้อความ พร้อม fallback เผื่อ Clipboard API ใช้ไม่ได้
// (เช่นเปิดผ่าน file:// โดยตรง บาง browser จะ block navigator.clipboard)
function copyToClipboard(text, successMsg) {
    function fallbackCopy() {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) showToast(successMsg, 'success');
            else showToast('คัดลอกอัตโนมัติไม่สำเร็จ ให้ลากเลือกข้อความแล้วกด Ctrl+C เอง', 'error');
        } catch (err) {
            console.error('fallbackCopy error:', err);
            showToast('คัดลอกอัตโนมัติไม่สำเร็จ ให้ลากเลือกข้อความแล้วกด Ctrl+C เอง', 'error');
        }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showToast(successMsg, 'success');
        }).catch(fallbackCopy);
    } else {
        fallbackCopy();
    }
}

function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(function(c) {
        c.classList.toggle('hidden', c.id !== 'tab-' + tab);
    });
    if (tab === 'cli') renderCLI();
    if (tab === 'tools') {
        if (typeof renderSummaryInputs === 'function') renderSummaryInputs();
        if (typeof calcWildcard === 'function') calcWildcard();
    }
    // โหมดฝึกไม่ผูกกับงานที่ทำค้างอยู่เลย จึงวาดตอนเปิดแท็บครั้งแรกก็พอ
    // และตั้งใจไม่สุ่มโจทย์ให้อัตโนมัติ เพราะผู้ใช้อาจแค่กดมาดูว่าแท็บนี้คืออะไร
    if (tab === 'practice') {
        if (typeof renderPractice === 'function') renderPractice();
        // แท็บนี้เนื้อหายาวที่สุดในบรรดาสี่แท็บ (ตารางกรอกสูงสุด 7 แถว + คำอธิบายใต้แถวที่ผิด
        // + ตารางวิธีคิดทีละขั้นอีกชุด) ถ้าไม่ขยายให้ ผู้ใช้จะเห็นแค่สองสามแถวแรกแล้วงงว่าที่เหลือหายไปไหน
        // ขยายให้เลยตั้งแต่เข้าแท็บ แล้วผู้ใช้กดย่อกลับเองได้ถ้าอยากดูผังไปด้วย
        if (!isBottomPanelMaximized()) toggleBottomPanelMax(true);
    } else if (bottomPanelAutoMaxed) {
        // ออกจากแท็บฝึกแล้วคืนความสูงเดิมให้อัตโนมัติ จะได้เห็นผังเหมือนก่อนเข้ามา
        // แต่ถ้าผู้ใช้กดปุ่มขยายเอง (bottomPanelAutoMaxed = false) ต้องปล่อยไว้ อย่าไปย่อให้
        toggleBottomPanelMax(true);
    }
    updateBottomPanelMaxButton();
}

function resetLayout() {
    layoutTopology(true); // force — ปุ่มนี้มีไว้ทิ้งตำแหน่งที่ลากเองโดยเฉพาะ
    // ข้อความบนปุ่มบอกว่า "จัดขนาดหน้าจอกลับเป็นค่าเริ่มต้น" จึงต้องคืนความสูงแผงล่างด้วย
    // ไม่ใช่แค่ตำแหน่งอุปกรณ์บนผัง ไม่งั้นชื่อปุ่มกับสิ่งที่มันทำจะไม่ตรงกัน
    bottomPanelPrevHeight = null;
    bottomPanelAutoMaxed = false;
    setBottomPanelHeight(defaultBottomPanelHeight());
    updateBottomPanelMaxButton();
    showToast('จัดขนาดหน้าจอกลับเป็นค่าเริ่มต้นแล้ว', 'info');
}

/* ---------- ความสูงของแผงด้านล่าง ----------
   ยกออกมาไว้ระดับไฟล์ (เดิมซ่อนอยู่ใน initResizers) เพราะแท็บฝึกทำโจทย์ต้องเรียกใช้ด้วย
   แท็บนั้นมีเนื้อหายาวกว่าแท็บอื่นมาก คือตารางกรอกคำตอบสูงสุด 7 แถว บวกคำอธิบายใต้แถวที่ผิด
   บวกตารางวิธีคิดทีละขั้นอีกชุด ความสูงปกติ 270px อ่านไม่ไหวจริง ๆ */
function setBottomPanelHeight(h) {
    var p = document.getElementById('bottomPanel');
    if (!p) return;
    p.style.height = h + 'px';
    p.style.minHeight = h + 'px';
    p.style.maxHeight = h + 'px';
    if (typeof resizeCanvas === 'function') resizeCanvas();
}

function getBottomPanelHeight() {
    var p = document.getElementById('bottomPanel');
    if (!p) return 270;
    var h = parseInt(p.style.height, 10);
    if (isFinite(h) && h > 0) return h;
    var r = p.getBoundingClientRect ? p.getBoundingClientRect() : null;
    return (r && r.height) ? Math.round(r.height) : 270;
}

/* ---------- ปุ่มขยายแผงล่าง ----------
   ปัญหาที่แก้: แผงล่างสูงคงที่ 270px ซึ่งพอดีสำหรับตาราง IP ไม่กี่แถวเท่านั้น
   พอมีแผนกเยอะ หรือเปิดแท็บฝึกทำโจทย์ที่มีทั้งตารางกรอก คำอธิบาย และวิธีคิดทีละขั้น
   เนื้อหาจะยาวเกินกว่าจะอ่านครบ ทางเดียวที่ทำได้คือลากเส้นแบ่งกลางจอ ซึ่งแทบไม่มีใครสังเกตเห็น
   จึงเพิ่มปุ่มขยายไว้ที่แถบแท็บโดยตรง กดครั้งเดียวเห็นครบ กดอีกครั้งกลับไปดูผัง */
var bottomPanelPrevHeight = null;   // ความสูงก่อนขยาย เก็บไว้คืนตอนกดย่อ
// แยกว่า "ขยายเพราะโปรแกรมขยายให้ตอนเข้าแท็บฝึก" กับ "ขยายเพราะผู้ใช้กดปุ่มเอง"
// เพราะอันแรกควรย่อกลับเองตอนออกจากแท็บ ส่วนอันหลังต้องคาไว้ ผู้ใช้ตั้งใจให้มันใหญ่
var bottomPanelAutoMaxed = false;

function isBottomPanelMaximized() {
    return bottomPanelPrevHeight !== null;
}

/* วัดจากกล่องพื้นที่ทำงานจริง ไม่ใช่จากความสูงหน้าต่าง
   เพราะแถบเครื่องมือบนกับแถบสถานะล่างกินที่ไปเท่าไรขึ้นกับว่าปุ่มตัดบรรทัดหรือยัง
   ถ้าคำนวณจาก window.innerHeight ตรง ๆ แผงจะล้นเลยขอบจอลงไป และส่วนที่ล้นจะอ่านไม่ได้เลย */
function maxBottomPanelHeight() {
    var p = document.getElementById('bottomPanel');
    var parent = p && p.parentElement;
    var avail = 0;
    if (parent && parent.getBoundingClientRect) {
        var r = parent.getBoundingClientRect();
        if (r && r.height) avail = r.height;
    }
    if (!avail) {
        var winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 900;
        avail = winH - 90;
    }
    /* ตอนกดขยายคือตอนที่ผู้ใช้ตั้งใจจะ "อ่านตาราง" ไม่ได้จะดูผัง จึงให้กินพื้นที่เกือบทั้งหมด
       ที่เหลือไว้ 24px คือที่ของเส้นแบ่งบวกแถบบาง ๆ พอให้เห็นว่าผังยังอยู่และลากกลับได้
       ห้ามคืนค่าที่มากกว่าความสูงของกล่องแม่ เพราะส่วนที่เกินจะถูกตัดทิ้ง ไม่ใช่แค่ล้นแล้วเลื่อนดูได้ */
    return Math.max(260, Math.round(avail - 24));
}

/* ---------- ความสูงเริ่มต้นของแผงล่าง ----------
   เดิมตั้งไว้ตายตัว 270px ซึ่งมาจากสมัยที่แผงนี้มีแค่ตาราง IP ไม่กี่แถว
   พอมีแผงวิเคราะห์พื้นที่ ตาราง WAN และแท็บฝึกทำโจทย์เพิ่มเข้ามา 270px กลายเป็นเล็กเกินไปมาก
   ผู้ใช้ต้องมานั่งลากหรือกดขยายทุกครั้งที่เปิดโปรแกรม ซึ่งไม่ควรต้องทำ

   เปลี่ยนมาคิดเป็นสัดส่วนของจอแทน จอใหญ่ก็ได้แผงใหญ่ตาม จอเล็กก็ไม่โดนแผงกินจนไม่เห็นผัง
   45% เป็นค่าที่ทำให้เห็นตาราง IP ครบ 8 แถวพร้อมแผงสรุปบนจอโน้ตบุ๊กทั่วไปได้พอดี */
function defaultBottomPanelHeight() {
    var winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 900;
    return Math.round(Math.max(300, Math.min(560, winH * 0.45)));
}

function toggleBottomPanelMax(silent) {
    if (isBottomPanelMaximized()) {
        setBottomPanelHeight(bottomPanelPrevHeight);
        bottomPanelPrevHeight = null;
        bottomPanelAutoMaxed = false;
        if (!silent) showToast('ย่อแผงกลับแล้ว', 'info');
    } else {
        bottomPanelPrevHeight = getBottomPanelHeight();
        setBottomPanelHeight(maxBottomPanelHeight());
        bottomPanelAutoMaxed = !!silent;   // silent = โปรแกรมขยายให้เอง ไม่ใช่ผู้ใช้กด
        if (!silent) showToast('ขยายแผงเต็มจอแล้ว กดปุ่มเดิมอีกครั้งเพื่อย่อกลับ', 'info');
    }
    updateBottomPanelMaxButton();
}

function updateBottomPanelMaxButton() {
    var btn = document.getElementById('btnPanelMax');
    if (!btn) return;
    var max = isBottomPanelMaximized();
    btn.innerHTML = '<i class="fas ' + (max ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center') +
        ' mr-1" aria-hidden="true"></i>' + (max ? 'ย่อลง' : 'ขยาย');
    btn.title = max ? 'ย่อแผงกลับไปขนาดเดิม' : 'ขยายแผงให้เต็มจอ เพื่ออ่านตารางได้ครบ';
    btn.setAttribute('aria-label', btn.title);
}

function initResizers() {
    const sidebar = document.getElementById('sidebar');
    const resizerX = document.getElementById('resizerX');
    const bottomPanel = document.getElementById('bottomPanel');
    const resizerY = document.getElementById('resizerY');
    const DEFAULT_SIDEBAR_W = 300;
    // ค่าคงที่เดิม 270px เล็กเกินไปตั้งแต่มีแผงวิเคราะห์กับแท็บฝึกทำโจทย์ ดู defaultBottomPanelHeight()

    function setSidebarWidth(w) {
        sidebar.style.width = w + 'px';
        sidebar.style.minWidth = w + 'px';
        sidebar.style.maxWidth = w + 'px';
    }
    function setBottomHeight(h) { setBottomPanelHeight(h); }

    // ตั้งความสูงเริ่มต้นตามขนาดจอทันทีที่เปิดโปรแกรม
    // คลาสใน HTML เป็นแค่ค่าสำรองไว้กันหน้าจอกระพริบระหว่างรอสคริปต์โหลด
    if (bottomPanel) setBottomHeight(defaultBottomPanelHeight());

    // ----- Resizer ฝั่งซ้าย (Sidebar / Control Pane) -----
    if (resizerX && sidebar) {
        let dragging = false, rafPending = false, pendingX = 0;

        function applyX() {
            rafPending = false;
            const maxW = Math.min(560, window.innerWidth - 380); // เผื่อพื้นที่ Canvas อย่างน้อย ~380px เสมอ
            const newW = Math.max(200, Math.min(maxW, pendingX));
            setSidebarWidth(newW);
            if (typeof resizeCanvas === 'function') resizeCanvas();
        }
        function onMove(e) {
            pendingX = e.clientX;
            if (!rafPending) { rafPending = true; requestAnimationFrame(applyX); } // throttle ด้วย rAF ให้ลื่นขึ้น
        }
        function stop() {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizerX.classList.remove('resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', stop);
            window.removeEventListener('blur', stop);
        }
        resizerX.addEventListener('mousedown', function(e) {
            e.preventDefault();
            dragging = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none'; // กันเลือกข้อความเวลาลากเร็วๆ
            resizerX.classList.add('resizing');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', stop);
            window.addEventListener('blur', stop); // กันเมาส์หลุดจอแล้ว resize ค้าง
        });
        resizerX.addEventListener('dblclick', function() {
            setSidebarWidth(DEFAULT_SIDEBAR_W);
            if (typeof resizeCanvas === 'function') resizeCanvas();
            if (typeof showToast === 'function') showToast('ปรับความกว้างแถบด้านซ้ายกลับเป็นค่าเริ่มต้นแล้ว', 'info');
        });
    }

    // ----- Resizer ด้านล่าง (Bottom Panel: IP Table / CLI / Tools) -----
    if (resizerY && bottomPanel) {
        let dragging = false, rafPending = false, pendingY = 0;

        function applyY() {
            rafPending = false;
            // เพดานเดิม 70% และกันที่ให้ผัง 200px ทำให้ลากได้ไม่พอกับตารางยาว ๆ
            // คนที่ลงมือลากคือคนที่ตั้งใจจะอ่านตาราง จึงให้ลากได้ถึง 88% เหลือที่ให้ผังพอเห็นว่ายังอยู่
            const maxH = Math.min(window.innerHeight * 0.88, window.innerHeight - 90);
            const newH = Math.max(120, Math.min(maxH, window.innerHeight - pendingY));
            setBottomHeight(newH);
            if (typeof resizeCanvas === 'function') resizeCanvas();
        }
        function onMove(e) {
            pendingY = e.clientY;
            // ผู้ใช้ลากเอง = ตั้งความสูงเองแล้ว จึงเลิกถือว่า "กำลังขยายอยู่"
            // ไม่งั้นพอสลับแท็บ โปรแกรมจะเผลอย่อกลับไปทับความสูงที่เพิ่งลากไว้
            bottomPanelPrevHeight = null;
            bottomPanelAutoMaxed = false;
            if (typeof updateBottomPanelMaxButton === 'function') updateBottomPanelMaxButton();
            if (!rafPending) { rafPending = true; requestAnimationFrame(applyY); }
        }
        function stop() {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizerY.classList.remove('resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', stop);
            window.removeEventListener('blur', stop);
        }
        resizerY.addEventListener('mousedown', function(e) {
            e.preventDefault();
            dragging = true;
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            resizerY.classList.add('resizing');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', stop);
            window.addEventListener('blur', stop);
        });
        resizerY.addEventListener('dblclick', function() {
            // ลากเองแล้วดับเบิลคลิกเพื่อกลับค่าเริ่มต้น — ต้องล้างสถานะ "ขยายอยู่" ด้วย
            // ไม่งั้นปุ่มบนแถบแท็บจะยังเขียนว่า "ย่อลง" ทั้งที่แผงกลับมาขนาดปกติแล้ว
            bottomPanelPrevHeight = null;
            bottomPanelAutoMaxed = false;
            setBottomHeight(defaultBottomPanelHeight());
            if (typeof updateBottomPanelMaxButton === 'function') updateBottomPanelMaxButton();
            if (typeof showToast === 'function') showToast('ปรับความสูงแผงกลับเป็นค่าเริ่มต้นแล้ว', 'info');
        });
    }
}

function toggleArrows() {
    state.showArrows = !state.showArrows;
    if (typeof requestRedraw === 'function') requestRedraw();
    const btn = document.getElementById('btnToggleArrows');
    if (!btn) return;

    if (state.showArrows) {
        btn.innerHTML = '<i class="fas fa-location-arrow mr-1"></i>ARROWS: ON';
        btn.classList.remove('text-muted');
        btn.classList.add('btn-cyber');
    } else {
        btn.innerHTML = '<i class="fas fa-location-arrow mr-1"></i>ARROWS: OFF';
        btn.classList.remove('btn-cyber');
        btn.classList.add('text-muted');
    }
}

/* ============================================
   2b. PC/Server — โหมดวาง/เชื่อมสายบน Canvas (ปุ่มมุมขวาบน)
   ============================================ */

function updateModeButtons() {
    var pc = document.getElementById('btnAddPc');
    var srv = document.getElementById('btnAddServer');
    var conn = document.getElementById('btnConnect');
    var br = document.getElementById('btnAddRouter');
    [[pc, 'pc'], [srv, 'server'], [br, 'router-branch']].forEach(function(pair) {
        var btn = pair[0], type = pair[1];
        if (!btn) return;
        var active = state.placingType === type;
        btn.classList.toggle('btn-neon', active);
        btn.classList.toggle('btn-cyber', !active);
    });
    if (conn) {
        conn.classList.toggle('btn-neon', state.connectMode);
        conn.classList.toggle('btn-cyber', !state.connectMode);
    }
}

function togglePlacingMode(type) {
    try {
        // ปิดโหมด Connect ไว้ก่อน กันสถานะซ้อนกันจนสับสนว่ากำลังอยู่โหมดไหน
        if (state.connectMode) { state.connectMode = false; state.linkFromId = null; }

        state.placingType = (state.placingType === type) ? null : type; // กดปุ่มเดิมซ้ำ = ยกเลิกโหมด
        updateModeButtons();
        document.getElementById('statusBar').textContent = state.placingType
            ? 'คลิกตำแหน่งบนผังเพื่อวาง ' + (type === 'pc' ? 'PC' : type === 'router-branch' ? 'Router สาขา' : 'Server')
            : 'Ready';
    } catch (err) {
        console.error('togglePlacingMode error:', err);
        showToast('โปรแกรมสลับโหมดวางอุปกรณ์ไม่สำเร็จ ลองกดปุ่มใหม่อีกครั้ง', 'error');
    }
}

function toggleConnectMode() {
    try {
        state.placingType = null; // กันสถานะซ้อนกับโหมดวางอุปกรณ์
        state.connectMode = !state.connectMode;
        state.linkFromId = null;
        updateModeButtons();
        document.getElementById('statusBar').textContent = state.connectMode
            ? 'โหมดเชื่อมสาย: คลิกอุปกรณ์ตัวแรก'
            : 'Ready';
    } catch (err) {
        console.error('toggleConnectMode error:', err);
        showToast('โปรแกรมสลับโหมดเชื่อมสายไม่สำเร็จ ลองกดปุ่ม Connect ใหม่อีกครั้ง', 'error');
    }
}

// เรียกทุกครั้งที่พิมพ์ (oninput) — อัปเดตแบบเงียบๆ เฉพาะตอนที่พิมพ์ครบเป็น IP ที่ถูกรูปแบบแล้วเท่านั้น
// ไม่ toast error ตรงนี้ เพราะระหว่างพิมพ์ IP ทีละตัวอักษร ค่าที่ยังพิมพ์ไม่จบ (เช่น "192.168.1.") จะไม่ผ่าน isValidIp เสมอ
// ถ้า toast ทุกครั้งจะขึ้นถี่เกินไปจนรำคาญ — ปล่อยให้ onManualIpChange (ตอนพิมพ์เสร็จ/ออกจากช่อง) เป็นคนฟันธง+แจ้งเตือนแทน
function onManualIpInput(id, value) {
    if (isEditing) return;
    isEditing = true;
    try {
        var node = topoNodes.manualNodes.find(function(n) { return n.id === id; });
        if (!node) return;
        var trimmed = String(value).trim();
        if (trimmed && isValidIp(trimmed)) node.ip = trimmed;
        else if (!trimmed) node.ip = null;
    } catch (err) {
        console.error('onManualIpInput error:', err);
    } finally {
        isEditing = false;
    }
}

// เรียกตอนพิมพ์เสร็จ/ออกจากช่อง (onchange) — ตรวจแบบเต็มรูปแบบและแจ้งเตือนถ้าไม่ผ่าน
// ครอบคลุม: รูปแบบ IP, อยู่ในช่วง subnet ของแผนกที่เชื่อมอยู่ไหม, ชนกับ Gateway (firstUsable) ไหม, ซ้ำกับอุปกรณ์อื่นไหม
function onManualIpChange(id, value) {
    if (typeof pushHistory === 'function') pushHistory('แก้ IP อุปกรณ์');
    try {
        var node = topoNodes.manualNodes.find(function(n) { return n.id === id; });
        if (!node) return;
        var trimmed = String(value).trim();
        if (!trimmed) { node.ip = null; return; } // เคลียร์ IP ได้ปกติ ไม่ถือเป็นข้อผิดพลาด

        if (!isValidIp(trimmed)) {
            showToast('รูปแบบเลข IP ไม่ถูกต้อง จึงยังไม่ได้บันทึกค่านี้', 'error');
            renderDetailPanel(); // รีเซ็ตช่องกลับไปเป็นค่าล่าสุดที่ถูกต้อง (node.ip เดิม)
            return;
        }

        if (node.linkedDeptId) {
            var dept = state.calculated.find(function(d) { return d.id === node.linkedDeptId; });
            if (dept) {
                var ipLong = ipToLong(trimmed);
                var s = dept.subnet;
                if (ipLong === ipToLong(s.firstUsable)) {
                    showToast('IP นี้เป็น Gateway ของ Router (VLAN ' + dept.name + ') อยู่แล้ว กรุณาเลือก IP อื่น', 'error');
                    renderDetailPanel();
                    return;
                }
                if (ipLong < ipToLong(s.firstUsable) || ipLong > ipToLong(s.lastUsable)) {
                    showToast('IP นี้อยู่นอกช่วงของ subnet แผนก ' + dept.name + ' (' + s.firstUsable + ' – ' + s.lastUsable + ')', 'error');
                    renderDetailPanel();
                    return;
                }
            }
        }

        var dup = topoNodes.manualNodes.some(function(n) { return n.id !== id && n.ip === trimmed; });
        if (dup) {
            showToast('เลข IP นี้ถูกใช้กับอุปกรณ์ตัวอื่นในผังไปแล้ว', 'error');
            renderDetailPanel();
            return;
        }

        node.ip = trimmed;
        showToast('บันทึก IP แล้ว', 'success');
    } catch (err) {
        console.error('onManualIpChange error:', err);
        showToast('โปรแกรมบันทึก IP ไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    }
}

function onSuggestIp(id) {
    if (typeof pushHistory === 'function') pushHistory('แนะนำ IP');
    try {
        var node = topoNodes.manualNodes.find(function(n) { return n.id === id; });
        if (!node || !node.linkedDeptId) { showToast('ต้องลากสายเชื่อมอุปกรณ์นี้เข้ากับ Switch ของแผนกก่อน โปรแกรมถึงจะรู้ว่าควรแนะนำ IP หมายเลขไหน', 'error'); return; }
        var ip = suggestNextIp(node.linkedDeptId);
        if (!ip) { showToast('IP ในแผนกนี้ถูกใช้หมดแล้ว ไม่เหลือหมายเลขว่างให้แนะนำ', 'error'); return; }
        node.ip = ip;
        renderDetailPanel();
        showToast('แนะนำ IP: ' + ip, 'success');
    } catch (err) {
        console.error('onSuggestIp error:', err);
        showToast('โปรแกรมแนะนำ IP ไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    }
}

// ลบสายเชื่อมทีละเส้น
function onRemoveLink(linkId) {
    if (typeof pushHistory === 'function') pushHistory('ลบสายเชื่อม');
    try {
        removeLink(linkId);
        renderDetailPanel();
        showToast('ลบสายเชื่อมแล้ว', 'info');
    } catch (err) {
        console.error('onRemoveLink error:', err);
        showToast('โปรแกรมลบสายเชื่อมไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    }
}

function onRemoveManualNode(id) {
    if (typeof pushHistory === 'function') pushHistory('ลบอุปกรณ์');
    try {
        removeManualNode(id);
        state.selectedDeptId = null;
        state.selectedNodeType = null;
        closeDetailPanel();
        showToast('ลบอุปกรณ์แล้ว ถ้าลบผิดกด Ctrl+Z เพื่อเอากลับคืนได้', 'info');
    } catch (err) {
        console.error('onRemoveManualNode error:', err);
        showToast('โปรแกรมลบอุปกรณ์ไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    }
}