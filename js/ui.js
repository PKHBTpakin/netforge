/* ============================================
   2. UI — ตาราง, แผนก, Detail Panel, Sidebar
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
        el.innerHTML = '<div class="text-muted text-center py-6 text-[13px]">ยังไม่มีแผนก<br><span class="text-subtle text-[12px]">ลองกดปุ่ม EXAMPLE ด้านบน</span></div>';
        return;
    }

    el.innerHTML = state.departments.map(function(dept) {
        const calc = state.calculated.find(function(c) { return c.id === dept.id; });
        const isSel = state.selectedDeptId === dept.id;
        const color = calc ? getDeptColor(dept.id) : 'var(--muted)';
        const failed = (state.failed || []).find(function(f) { return f.id === dept.id; });
        return '<div class="dept-item ' + (isSel ? 'selected' : '') + (failed ? ' dept-failed' : '') + '" onclick="selectNode(' + dept.id + ',\'department\')" style="' + (isSel ? 'border-color:' + color : '') + '">' +
            '<div class="flex items-center justify-between mb-1">' +
                '<span class="text-[14px] font-bold" style="color:' + color + '">' +
                    (failed ? '<i class="fas fa-triangle-exclamation text-hot mr-1"></i>' : '') + escapeHtml(dept.name) + '</span>' +
                '<button onclick="event.stopPropagation();onRemoveDept(' + dept.id + ')" class="text-subtle hover:text-hot text-[12px] transition-colors"><i class="fas fa-trash-alt"></i></button>' +
            '</div>' +
            '<div class="text-[12px] text-muted">' +
                '<span>Hosts: ' + dept.hosts + '</span>' +
                (calc ? '<span class="ml-2" style="color:' + color + '">' + calc.subnet.network + '/' + calc.subnet.cidr + '</span>' : '') +
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
            '<td class="py-2 text-hot text-[12px]" colspan="6">จัดสรรไม่สำเร็จ — ' + escapeHtml(f.reason) + '</td>' +
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

    // โหมด IPv6 ไม่มีแนวคิดนี้ (แบ่งเท่ากันทุกแผนก ไม่มีการปัดตามจำนวน host)
    if (state.ipMode === 'v6' || state.calculated.length === 0) {
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
                '<span class="section-label" style="border:none;padding:0;">การใช้พื้นที่ใน ' + state.baseIp + '/' + state.baseCidr + '</span>' +
                '<span class="text-[12px] text-muted">' + fmt(u.total) + ' addresses</span>' +
            '</div>' +

            // แถบสัดส่วน 3 ส่วน — ใช้ flex-grow ตาม % จริง ไม่ใช่ width คงที่
            '<div class="flex h-3 rounded overflow-hidden mb-2" style="background:var(--border)">' +
                '<div style="width:' + u.usedPct + '%;background:var(--neon)" title="ใช้จริง"></div>' +
                '<div style="width:' + u.roundingPct + '%;background:var(--hot)" title="เสียจากการปัด"></div>' +
                '<div style="width:' + u.reservePct + '%;background:var(--cyber);opacity:.45" title="สำรองเผื่อโต"></div>' +
            '</div>' +

            '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--neon)"></span>' +
                    '<span class="text-muted">ใช้จริง</span><span class="ml-auto text-neon">' + fmt(u.used) + ' (' + pct(u.usedPct) + ')</span></div>' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--hot)"></span>' +
                    '<span class="text-muted">เสียจากการปัด</span><span class="ml-auto text-hot">' + fmt(u.rounding) + ' (' + pct(u.roundingPct) + ')</span></div>' +
                '<div class="flex items-center gap-2"><span class="legend-dot" style="background:var(--cyber);opacity:.45"></span>' +
                    '<span class="text-muted">สำรองเผื่อโต</span><span class="ml-auto text-cyber">' + fmt(u.reserve) + ' (' + pct(u.reservePct) + ')</span></div>' +
            '</div>' +

            '<div class="text-[11px] text-subtle mt-2 leading-relaxed">' +
                '"เสียจากการปัด" เลี่ยงไม่ได้ เพราะ subnet ต้องมีขนาดเป็นกำลังสองเสมอ — ต่อให้เลือก Base พอดีเป๊ะ ' +
                'ก็ใช้ได้สูงสุด ' + pct(u.ceilingPct) + ' &nbsp;•&nbsp; "สำรองเผื่อโต" ไม่ใช่ความสูญเปล่า เป็นพื้นที่รองรับการขยายในอนาคต' +
            '</div>' +

            (worthIt
                ? '<div class="text-[12px] mt-2 pt-2" style="border-top:1px solid var(--border)">' +
                  '<i class="fas fa-lightbulb text-neon mr-1"></i>ถ้าย่อ Base เป็น <span class="text-neon">/' + u.suggestedCidr + '</span> ' +
                  'สัดส่วนใช้จริงจะขึ้นเป็น <span class="text-neon">' + pct(wouldBe) + '</span> ' +
                  '<button onclick="onSuggestBase()" class="btn-cyber text-[11px] ml-1 px-2 py-0.5">ปรับให้</button></div>'
                : '') +

            renderHeadroomHTML() +
        '</div>';
}

// "โควตาที่ได้ฟรี" — subnet ที่จองให้มักรองรับได้มากกว่าที่ขอ เพราะปัดขึ้นกำลังสอง
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
function onSuggestBase() {
    if (state.ipMode === 'v6') { suggestBaseV6Info(); return; }
    try {
        if (state.departments.length === 0) { showToast('เพิ่มแผนกก่อน ถึงจะแนะนำ Base ได้', 'error'); return; }
        var cidr = suggestBaseCidr(state.departments);
        if (cidr === null) { showToast('คำนวณ Base ที่เหมาะสมไม่ได้', 'error'); return; }
        if (cidr === state.baseCidr) { showToast('Base /' + cidr + " ตอนนี้พอดีที่สุดแล้ว", 'info'); return; }

        document.getElementById('baseCidrInput').value = cidr;
        onBaseChange(); // ให้ทางเดิมเป็นคนตรวจ+ปัด Network Address+คำนวณ ไม่เขียนตรรกะซ้ำ
        showToast('ปรับ Base เป็น /' + cidr + ' — เล็กที่สุดที่ยังจองครบทุกแผนก', 'success');
    } catch (err) {
        console.error('onSuggestBase error:', err);
        showToast('แนะนำ Base ไม่สำเร็จ', 'error');
    }
}

/* โหมด IPv6 — แนวคิด "ย่อ Base ให้พอดี" ใช้ไม่ได้และไม่ควรใช้
   IPv4: พื้นที่มีจำกัดจริง การจอง block ใหญ่เกินจำเป็นคือการสิ้นเปลืองที่ต้องระวัง
   IPv6: พื้นที่ไม่ใช่ทรัพยากรที่ต้องประหยัด และ /64 เป็นขนาด subnet มาตรฐานที่ SLAAC ต้องการ (RFC 4291)
         การไล่ย่อ prefix ให้ "พอดี" จึงเป็นการสอนสิ่งที่ผิดหลักปฏิบัติจริง
   ปุ่มนี้ในโหมด v6 จึงเปลี่ยนไปทำสิ่งที่มีประโยชน์จริงแทน: ตรวจว่าค่าที่ตั้งไว้แบ่งได้ครบไหม
   และรายงานว่าเหลือพื้นที่ให้ขยายอีกเท่าไหร่ */
function suggestBaseV6Info() {
    try {
        var count = state.departments.length;
        if (count === 0) { showToast('เพิ่มแผนกก่อน', 'error'); return; }

        var basePrefix = state.basePrefixLen6, newPrefix = state.newPrefixLen6;
        if (!Number.isInteger(basePrefix) || !Number.isInteger(newPrefix) || newPrefix <= basePrefix || newPrefix > 128) {
            showToast('ตั้งค่า Prefix ให้ถูกต้องก่อน — Prefix ย่อยต้องยาวกว่า Base Prefix และไม่เกิน /128', 'error');
            return;
        }

        var bits = newPrefix - basePrefix;
        var maxSubnets = 1n << BigInt(bits); // ใช้ BigInt เพราะ /48 -> /128 คือ 2^80 ซึ่งเกิน Number ปกติ
        var maxText = maxSubnets > 1000000000000n ? '2^' + bits : Number(maxSubnets).toLocaleString();

        if (BigInt(count) > maxSubnets) {
            var needBits = Math.ceil(Math.log2(count));
            showToast('/' + basePrefix + ' แบ่งเป็น /' + newPrefix + ' ได้แค่ ' + maxText + ' subnet แต่มี ' + count + ' แผนก\n' +
                'ลด Base Prefix ลงเหลือ /' + Math.max(newPrefix - needBits, 1) + ' หรือน้อยกว่า จึงจะพอ', 'error');
            return;
        }

        if (!state.baseIp6) {
            showToast('ยังไม่ได้ตั้ง Base IPv6 — กรอกเช่น 2001:db8:: แล้วกด Calculate ก่อน', 'info');
            return;
        }

        showToast('IPv6 ไม่ต้องย่อ Base — /' + basePrefix + ' แบ่งเป็น /' + newPrefix + ' ได้ ' + maxText + ' subnet ใช้จริง ' + count + '\n' +
            'พื้นที่ IPv6 ไม่ใช่ทรัพยากรที่ต้องประหยัด และ /64 คือขนาดมาตรฐานที่ SLAAC ต้องการ (RFC 4291)', 'info');
    } catch (err) {
        console.error('suggestBaseV6Info error:', err);
        showToast('ตรวจสอบค่า IPv6 ไม่สำเร็จ', 'error');
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
            el.innerHTML = '<div class="text-muted text-center py-10 text-[13px]">Switch นี้ไม่มีอยู่แล้ว — เลือก Node อื่นจากผัง</div>';
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

    if (state.selectedNodeType === 'pc' || state.selectedNodeType === 'server') {
        const node = topoNodes.manualNodes.find(function(n) { return n.id === state.selectedDeptId; });
        if (!node) {
            // อุปกรณ์นี้ถูกลบไปแล้ว (เช่นกด Remove จาก Detail Panel เอง) เคลียร์ selection กันค้างพาเนลเก่า
            el.innerHTML = '<div class="text-muted text-center py-10 text-[13px]">อุปกรณ์นี้ไม่มีอยู่แล้ว — เลือก Node อื่นจากผัง</div>';
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
                    (linkedDept ? '<button onclick="onSuggestIp(\'' + node.id + '\')" class="btn-neon text-[12px] flex-shrink-0 px-3" title="แนะนำ IP ว่างถัดไปจาก subnet ของ ' + escapeHtml(linkedDept.name) + '"><i class="fas fa-magic"></i></button>' : '') +
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
    if (state.selectedNodeType === 'pc' || state.selectedNodeType === 'server' || state.selectedNodeType === 'department') {
        renderDetailPanel();
    }
}

function onDetailInput(deptId, field, value) {
    if (isEditing) return;
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
        if (typeof showToast === 'function') showToast('แก้ไขไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    } finally {
        isEditing = false;
    }
}

function onBaseChange() {
    if (state.ipMode === 'v6') { onBaseChangeV6(); return; }
    var ip = document.getElementById('baseIpInput').value.trim();
    var cidr = parseInt(document.getElementById('baseCidrInput').value);
    if (!isValidIp(ip)) { showToast('IP ไม่ถูกต้อง', 'error'); return; }
    if (isNaN(cidr) || cidr < 8 || cidr > 30) { showToast('CIDR ต้อง 8-30', 'error'); return; }

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
        else showToast('VLSM Calculated', 'success');
    } catch (err) {
        console.error('onBaseChange error:', err);
        showToast('คำนวณไม่สำเร็จ ตรวจสอบข้อมูลแผนกอีกครั้ง', 'error');
    }
}

function onBaseChangeV6() {
    var ip = document.getElementById('baseIp6Input').value.trim();
    var prefix = parseInt(document.getElementById('basePrefixInput').value);
    var newPrefix = parseInt(document.getElementById('newPrefixInput').value);
    if (!isValidIpv6(ip)) { showToast('IPv6 ไม่ถูกต้อง', 'error'); return; }
    if (isNaN(prefix) || prefix < 1 || prefix > 127) { showToast('Base Prefix ต้อง 1-127', 'error'); return; }
    if (isNaN(newPrefix) || newPrefix <= prefix || newPrefix > 128) { showToast('Prefix ย่อยต้องมากกว่า Base Prefix และไม่เกิน 128', 'error'); return; }
    state.baseIp6 = ip;
    state.basePrefixLen6 = prefix;
    state.newPrefixLen6 = newPrefix;
    try {
        refreshAll();
        document.getElementById('statusBar').textContent = 'IPv6 Base: ' + ip + '/' + prefix + ' → /' + newPrefix + ' | ' + state.calculatedV6.length + ' subnets allocated';
        showToast('IPv6 Calculated', 'success');
    } catch (err) {
        console.error('onBaseChangeV6 error:', err);
        showToast('คำนวณ IPv6 ไม่สำเร็จ ตรวจสอบข้อมูลอีกครั้ง', 'error');
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
        renderUtilization(); // แผงสรุปพื้นที่ใช้เฉพาะโหมด IPv4 — ตัวมันเองเป็นคนซ่อนตัวเองตอนอยู่โหมด v6
        layoutTopology(); // รีเฟรช label บน canvas ให้ตรงกับโหมดที่เพิ่งสลับ
        // silent = true ตอนเรียกจาก applyProjectData() (โหลดโปรเจกต์) — ไม่ใช่ผู้ใช้กดสลับเอง ไม่ควร toast ซ้อนกับ toast โหลดสำเร็จ
        if (!silent) showToast('สลับไปโหมด ' + (mode === 'v6' ? 'IPv6' : 'IPv4'), 'info');
    } catch (err) {
        console.error('setIpMode error:', err);
        showToast('สลับโหมดไม่สำเร็จ', 'error');
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
    showToast('สลับเป็น ' + (state.theme === 'light' ? 'Light Mode' : 'Dark Mode'), 'info');
}

function updateThemeButton() {
    var btn = document.getElementById('btnTheme');
    if (!btn) return;
    btn.innerHTML = state.theme === 'light'
        ? '<i class="fas fa-moon mr-1"></i>DARK'
        : '<i class="fas fa-sun mr-1"></i>LIGHT';
}

// ----- Onboarding Modal: อธิบาย 4 ขั้นตอนการใช้งานหลัก เรียกดูซ้ำได้ทุกเมื่อผ่านปุ่ม HELP -----
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
    var nameEl = document.getElementById('newDeptName');
    var hostsEl = document.getElementById('newDeptHosts');
    var name = nameEl.value.trim();
    var hosts = parseInt(hostsEl.value);
    if (!name) { showToast('ระบุชื่อแผนก', 'error'); return; }
    if (isNaN(hosts) || hosts < 1) { showToast('Hosts >= 1', 'error'); return; }
    if (hosts > 65534) { showToast('Hosts สูงสุด 65534 (เทียบเท่า /16)', 'error'); return; }
    if (state.departments.length >= 8) { showToast('สูงสุด 8 แผนก', 'error'); return; }
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
        showToast('เพิ่มแผนกไม่สำเร็จ', 'error');
    } finally {
        isEditing = false;
    }
}

function onRemoveDept(id) {
    if (isEditing) return;
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
        showToast('ลบ ' + (dept ? dept.name : 'dept') + ' แล้ว', 'info');
    } catch (err) {
        console.error('onRemoveDept error:', err);
        showToast('ลบแผนกไม่สำเร็จ', 'error');
    } finally {
        isEditing = false;
    }
}

function renderCLI() {
    var routerEl = document.getElementById('cliRouterOutput');
    var switchEl = document.getElementById('cliSwitchOutput');
    // เดิมเช็คแค่ state.calculated (IPv4) ทำให้ถ้าตั้งค่าเฉพาะ IPv6 จะไม่ได้ CLI อะไรเลยทั้งที่คำนวณสำเร็จแล้ว
    if (state.calculated.length === 0 && state.calculatedV6.length === 0) {
        var emptyMsg = '<span class="comment">ยังไม่มีข้อมูล — เพิ่มแผนกและกด Calculate ก่อน</span>';
        routerEl.innerHTML = emptyMsg;
        switchEl.innerHTML = emptyMsg;
        routerEl.classList.add('cli-empty');   // เปลี่ยนจากจอดำทึบเป็นกล่องเส้นประจาง ๆ (ดู .cli-empty ใน style.css)
        switchEl.classList.add('cli-empty');
        return;
    }
    routerEl.classList.remove('cli-empty');
    switchEl.classList.remove('cli-empty');

    // ฝั่ง Switch (VLAN/trunk/access port) ไม่ขึ้นกับเวอร์ชัน IP เลย ใช้รายชื่อแผนกจากฝั่งไหนก็ได้ที่มีข้อมูล
    var deptListForCli = state.calculated.length > 0 ? state.calculated : state.calculatedV6;

    // ----- Router Config (คัดลอกไปวางบน Router ได้ทันที ไม่ปนกับ Switch -----
    var cliRouter = '<span class="comment">! ============================================</span>\n' +
        '<span class="comment">! NetForge — Auto-generated Cisco IOS Config (ROUTER)</span>\n' +
        '<span class="comment">! Base: ' + state.baseIp + '/' + state.baseCidr + '</span>\n' +
        '<span class="comment">! ============================================</span>\n\n' +
        '<span class="cmd">hostname</span> <span class="value">Router-01</span>\n' +
        '<span class="cmd">enable secret</span> <span class="value">cisco</span>\n\n';

    // มี IPv6 คำนวณไว้ด้วย -> เปิด global command ที่จำเป็นเสมอแต่มักลืมใส่
    if (state.calculatedV6.length > 0) {
        cliRouter += '<span class="comment">! เปิดใช้งาน IPv6 Routing (คำสั่งนี้จำเป็นเสมอถ้าจะใช้ IPv6 มักถูกลืม)</span>\n' +
            '<span class="cmd">ipv6 unicast-routing</span>\n\n';
    }

    cliRouter += '<span class="cmd">interface</span> <span class="value">GigabitEthernet0/0</span>\n' +
        ' <span class="cmd">description</span> <span class="value">Trunk to Switch-01</span>\n' +
        ' <span class="cmd">no shutdown</span>\n\n';

    // Dual-Stack: ถ้าแผนกไหนมีทั้ง IPv4 (state.calculated) และ IPv6 (state.calculatedV6) คำนวณไว้แล้ว
    // จะรวม ip address + ipv6 address ไว้ใน Sub-Interface เดียวกัน ตรงกับวิธีตั้งค่า Dual-Stack จริงบน Cisco IOS
    deptListForCli.forEach(function(entry) {
        var d = state.calculated.find(function(x) { return x.id === entry.id; });
        var v6 = state.calculatedV6.find(function(x) { return x.id === entry.id; });
        var sw = topoNodes.switches.find(function(x) { return x.deptId === entry.id; });
        var vlanId = sw ? sw.vlanId : 0;

        cliRouter += '<span class="cmd">interface</span> <span class="value">GigabitEthernet0/0.' + vlanId + '</span>\n' +
            ' <span class="cmd">encapsulation</span> <span class="value">dot1Q ' + vlanId + '</span>\n';
        if (d) {
            cliRouter += ' <span class="cmd">ip address</span> <span class="value">' + d.subnet.firstUsable + ' ' + d.subnet.netmask + '</span>\n';
        }
        if (v6) {
            cliRouter += ' <span class="cmd">ipv6 address</span> <span class="value">' + v6.subnet6.network + '/' + v6.subnet6.prefixLen + '</span>\n' +
                ' <span class="comment">! Link-Local (fe80::/10) จะถูกสร้างอัตโนมัติบน Interface นี้เสมอ ใช้สำหรับ NDP (ไม่ต้องตั้งเอง)</span>\n';
        }
        cliRouter += ' <span class="cmd">description</span> <span class="value">' + escapeHtml(entry.name) + ' VLAN</span>\n\n';
    });

    if (state.calculatedV6.length > 0) {
        cliRouter += '<span class="comment">! --- IPv6: อุปกรณ์ปลายทางจะได้ Address อัตโนมัติผ่าน SLAAC (Router Advertisement) ---</span>\n' +
            '<span class="comment">! ไม่ต้องตั้ง DHCPv6 Pool เพิ่มถ้าใช้ SLAAC เฉยๆ พอ</span>\n\n';
    }

    if (state.calculated.length > 0) {
        cliRouter += '<span class="comment">! --- DHCP Pools (IPv4) ---</span>\n' +
            '<span class="comment">! excluded-address ต้องแยกบรรทัดละช่วง — IOS รับได้แค่ low [high] ต่อหนึ่งคำสั่ง</span>\n';

        // รวม Gateway + Static IP ของ PC/Server ในผัง แล้วยุบเลขที่ติดกันให้เป็นช่วงเดียว
        // เดิมโค้ดต่อ Gateway ทุกแผนกด้วยช่องว่างเป็นบรรทัดเดียว ซึ่งผิด syntax และแปะลง IOS ไม่ผ่าน
        // อีกทั้ง Static IP ที่ผู้ใช้ตั้งให้ PC/Server บน Canvas ไม่เคยถูกกันออกจาก DHCP Pool เลย -> เสี่ยง IP ชนกันจริง
        state.calculated.forEach(function(d) {
            var reserved = [ipToLong(d.subnet.firstUsable)]; // Gateway ของ VLAN นี้
            topoNodes.manualNodes.forEach(function(n) {
                if (n.linkedDeptId === d.id && n.ip && isValidIp(n.ip)) reserved.push(ipToLong(n.ip));
            });
            reserved = reserved.filter(function(v, i, a) { return a.indexOf(v) === i; }).sort(function(a, b) { return a - b; });

            var rangeStart = reserved[0], prev = reserved[0];
            for (var i = 1; i <= reserved.length; i++) {
                if (i < reserved.length && reserved[i] === prev + 1) { prev = reserved[i]; continue; }
                cliRouter += '<span class="cmd">ip dhcp excluded-address</span> <span class="value">' +
                    longToIp(rangeStart) + (prev !== rangeStart ? ' ' + longToIp(prev) : '') + '</span>' +
                    ' <span class="comment">! ' + escapeHtml(d.name) + '</span>\n';
                if (i < reserved.length) { rangeStart = reserved[i]; prev = reserved[i]; }
            }
        });
        cliRouter += '\n';

        state.calculated.forEach(function(d) {
            var s = d.subnet;
            cliRouter += '<span class="cmd">ip dhcp pool</span> <span class="value">' + escapeHtml(d.name) + '</span>\n' +
                ' <span class="cmd">network</span> <span class="value">' + s.network + ' ' + s.netmask + '</span>\n' +
                ' <span class="cmd">default-router</span> <span class="value">' + s.firstUsable + '</span>\n' +
                ' <span class="cmd">dns-server</span> <span class="value">8.8.8.8</span>\n\n';
        });

        // Static IP ของ PC/Server ตั้งบนตัวเครื่องเอง ไม่ใช่บน Router — แต่ต้องมีรายการกำกับไว้ในเอกสาร config
        // ไม่งั้นงานที่ผู้ใช้จัดไว้บน Canvas ทั้งหมดหายไปจาก output
        var statics = topoNodes.manualNodes.filter(function(n) { return n.ip && n.linkedDeptId; });
        if (statics.length > 0) {
            cliRouter += '<span class="comment">! --- Static IP ที่กำหนดไว้บนผัง (ตั้งค่าที่ตัวเครื่องปลายทาง ไม่ใช่บน Router) ---</span>\n';
            statics.forEach(function(n) {
                var dept = state.calculated.find(function(d) { return d.id === n.linkedDeptId; });
                if (!dept) return;
                cliRouter += '<span class="comment">!   ' + escapeHtml(n.label) + '  ' + n.ip +
                    '  mask ' + dept.subnet.netmask + '  gw ' + dept.subnet.firstUsable +
                    '  (' + escapeHtml(dept.name) + ')</span>\n';
            });
            cliRouter += '\n';
        }
    }
    cliRouter += '<span class="cmd">end</span>\n';

    // ----- Switch Config (คัดลอกไปวางบน Switch ได้ทันที ไม่ปนกับ Router) -----
    var cliSwitch = '<span class="comment">! ============================================</span>\n' +
        '<span class="comment">! NetForge — Auto-generated Cisco IOS Config (SWITCH)</span>\n' +
        '<span class="comment">! ============================================</span>\n\n' +
        '<span class="cmd">hostname</span> <span class="value">Switch-01</span>\n\n';
    deptListForCli.forEach(function(d) {
        var sw = topoNodes.switches.find(function(x) { return x.deptId === d.id; });
        var v = sw ? sw.vlanId : 0;
        cliSwitch += '<span class="cmd">vlan</span> <span class="value">' + v + '</span>\n <span class="cmd">name</span> <span class="value">' + escapeHtml(d.name) + '</span>\n';
    });
    cliSwitch += '\n<span class="cmd">interface</span> <span class="value">GigabitEthernet0/1</span>\n' +
        ' <span class="cmd">description</span> <span class="value">Trunk to Router-01</span>\n' +
        ' <span class="cmd">switchport mode trunk</span>\n\n';
    deptListForCli.forEach(function(d, i) {
        var sw = topoNodes.switches.find(function(x) { return x.deptId === d.id; });
        var v = sw ? sw.vlanId : 0, p = i + 2;
        cliSwitch += '<span class="cmd">interface</span> <span class="value">FastEthernet0/' + p + '</span>\n' +
            ' <span class="cmd">description</span> <span class="value">' + escapeHtml(d.name) + ' Access Port</span>\n' +
            ' <span class="cmd">switchport mode access</span>\n' +
            ' <span class="cmd">switchport access vlan</span> <span class="value">' + v + '</span>\n\n';
    });
    cliSwitch += '<span class="cmd">end</span>\n';

    routerEl.innerHTML = cliRouter;
    switchEl.innerHTML = cliSwitch;
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
            else showToast('คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกข้อความแล้วกด Ctrl+C เอง', 'error');
        } catch (err) {
            console.error('fallbackCopy error:', err);
            showToast('คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกข้อความแล้วกด Ctrl+C เอง', 'error');
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

function copyCLI(target) {
    var elId = target === 'switch' ? 'cliSwitchOutput' : 'cliRouterOutput';
    var label = target === 'switch' ? 'Switch' : 'Router';
    var el = document.getElementById(elId);
    if (!el) return;
    copyToClipboard(el.innerText, 'Copied ' + label + ' Config to clipboard');
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
}

function resetLayout() {
    layoutTopology(true); // force — ปุ่มนี้มีไว้ทิ้งตำแหน่งที่ลากเองโดยเฉพาะ
    showToast('Layout reset', 'info');
}

function initResizers() {
    const sidebar = document.getElementById('sidebar');
    const resizerX = document.getElementById('resizerX');
    const bottomPanel = document.getElementById('bottomPanel');
    const resizerY = document.getElementById('resizerY');
    const DEFAULT_SIDEBAR_W = 300;
    const DEFAULT_BOTTOM_H = 270;

    function setSidebarWidth(w) {
        sidebar.style.width = w + 'px';
        sidebar.style.minWidth = w + 'px';
        sidebar.style.maxWidth = w + 'px';
    }
    function setBottomHeight(h) {
        bottomPanel.style.height = h + 'px';
        bottomPanel.style.minHeight = h + 'px';
        bottomPanel.style.maxHeight = h + 'px';
    }

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
            if (typeof showToast === 'function') showToast('รีเซ็ตขนาด Sidebar แล้ว', 'info');
        });
    }

    // ----- Resizer ด้านล่าง (Bottom Panel: IP Table / CLI / Tools) -----
    if (resizerY && bottomPanel) {
        let dragging = false, rafPending = false, pendingY = 0;

        function applyY() {
            rafPending = false;
            const maxH = Math.min(window.innerHeight * 0.7, window.innerHeight - 200); // เผื่อพื้นที่ Canvas ด้านบนเสมอ
            const newH = Math.max(120, Math.min(maxH, window.innerHeight - pendingY));
            setBottomHeight(newH);
            if (typeof resizeCanvas === 'function') resizeCanvas();
        }
        function onMove(e) {
            pendingY = e.clientY;
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
            setBottomHeight(DEFAULT_BOTTOM_H);
            if (typeof resizeCanvas === 'function') resizeCanvas();
            if (typeof showToast === 'function') showToast('รีเซ็ตขนาด Bottom Panel แล้ว', 'info');
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
    [[pc, 'pc'], [srv, 'server']].forEach(function(pair) {
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
            ? 'คลิกตำแหน่งบน Canvas เพื่อวาง ' + (type === 'pc' ? 'PC' : 'Server')
            : 'Ready';
    } catch (err) {
        console.error('togglePlacingMode error:', err);
        showToast('สลับโหมดวางอุปกรณ์ไม่สำเร็จ', 'error');
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
        showToast('สลับโหมดเชื่อมสายไม่สำเร็จ', 'error');
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
    try {
        var node = topoNodes.manualNodes.find(function(n) { return n.id === id; });
        if (!node) return;
        var trimmed = String(value).trim();
        if (!trimmed) { node.ip = null; return; } // เคลียร์ IP ได้ปกติ ไม่ถือเป็นข้อผิดพลาด

        if (!isValidIp(trimmed)) {
            showToast('รูปแบบ IP ไม่ถูกต้อง — ยังไม่บันทึกค่านี้', 'error');
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
            showToast('IP นี้ถูกใช้กับอุปกรณ์อื่นในผังอยู่แล้ว', 'error');
            renderDetailPanel();
            return;
        }

        node.ip = trimmed;
        showToast('บันทึก IP แล้ว', 'success');
    } catch (err) {
        console.error('onManualIpChange error:', err);
        showToast('แก้ไข IP ไม่สำเร็จ', 'error');
    }
}

function onSuggestIp(id) {
    try {
        var node = topoNodes.manualNodes.find(function(n) { return n.id === id; });
        if (!node || !node.linkedDeptId) { showToast('ต้องเชื่อมกับ Switch ก่อนถึงจะแนะนำ IP ได้', 'error'); return; }
        var ip = suggestNextIp(node.linkedDeptId);
        if (!ip) { showToast('Subnet เต็มแล้ว ไม่เหลือ IP ให้แนะนำ', 'error'); return; }
        node.ip = ip;
        renderDetailPanel();
        showToast('แนะนำ IP: ' + ip, 'success');
    } catch (err) {
        console.error('onSuggestIp error:', err);
        showToast('แนะนำ IP ไม่สำเร็จ', 'error');
    }
}

function onRemoveManualNode(id) {
    try {
        removeManualNode(id);
        state.selectedDeptId = null;
        state.selectedNodeType = null;
        closeDetailPanel();
        showToast('ลบอุปกรณ์แล้ว', 'info');
    } catch (err) {
        console.error('onRemoveManualNode error:', err);
        showToast('ลบอุปกรณ์ไม่สำเร็จ', 'error');
    }
}