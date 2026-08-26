/* ============================================
   10. Export — เอางานออกไปใช้ต่อในรายงาน/สไลด์/Excel
   ============================================
   ปัญหาที่ไฟล์นี้แก้:
   เดิม export ได้ 3 ทาง (ไฟล์ .json, คัดลอก CLI, ลิงก์แชร์) ซึ่ง "เอาไปใส่รายงานไม่ได้เลยสักทาง"
   ผู้ใช้ต้องกด Print Screen แล้วครอบตัดเอง (ได้ภาพติดขอบเบราว์เซอร์) และพิมพ์ตัวเลขใส่ Excel เองทีละช่อง

   เพิ่ม 3 ทางที่ใช้ต่อได้จริง:
     PNG  — ภาพผังความละเอียดสูง ครอบเฉพาะอุปกรณ์ ไม่มีขอบเบราว์เซอร์ แปะลงรายงาน/สไลด์ได้ทันที
     CSV  — ตาราง IP + ลิงก์ WAN เปิดด้วย Excel ได้ตรง ๆ
     TXT  — คำสั่ง CLI ทุก Router/Switch รวมในไฟล์เดียว
   ============================================ */

// ตัวช่วยกลาง: สร้างไฟล์แล้วสั่งดาวน์โหลด (รูปแบบเดียวกับ exportProject() ใน app.js)
function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function exportStamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/* ---------- PNG ของผัง ---------- */

// อ่านสีพื้นหลังจากธีมปัจจุบัน — ภาพที่พื้นโปร่งใสจะอ่านไม่ออกเมื่อวางบนสไลด์สีเข้ม
function currentBgColor() {
    try {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
        if (v) return v;
    } catch (e) { /* สภาพแวดล้อมทดสอบไม่มี getComputedStyle */ }
    return state.theme === 'light' ? '#EDF1F7' : '#0f1115';
}

/* วาดผังลง canvas ใหม่แล้วบันทึกเป็น PNG
   ใช้วิธี "สลับตัวแปรมุมมองชั่วคราว" แทนการเขียนโค้ดวาดชุดที่สอง
   เพราะฟังก์ชัน drawXxx ทั้งหมดอ้าง ctx/cW/cH/viewZoom/viewPan จาก scope เดียวกันอยู่แล้ว
   ถ้าเขียนโค้ดวาดแยกอีกชุด ภาพที่ export กับที่เห็นบนจอจะค่อย ๆ หลุดจากกันเมื่อแก้โค้ดในอนาคต */
function exportTopologyPNG(scale) {
    scale = scale || 2; // 2 เท่าเพื่อให้คมเมื่อพิมพ์ลงกระดาษหรือฉายจอใหญ่
    try {
        var nodes = [topoNodes.router]
            .concat(topoNodes.switches, topoNodes.departments, topoNodes.manualNodes)
            .filter(Boolean);
        if (nodes.length === 0 || (state.calculated.length === 0 && topoNodes.manualNodes.length === 0)) {
            showToast('ยังไม่มีผังให้บันทึกเป็นรูป', 'error');
            return;
        }

        // กรอบที่ครอบทุกอุปกรณ์ + เผื่อขอบให้ป้ายใต้กล่องไม่โดนตัด
        var pad = 70;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(function (n) {
            minX = Math.min(minX, n.x - n.w / 2); maxX = Math.max(maxX, n.x + n.w / 2);
            minY = Math.min(minY, n.y - n.h / 2); maxY = Math.max(maxY, n.y + n.h / 2);
        });
        // ถ้ามีรูปแปลนอาคาร ต้องขยายกรอบให้ครอบรูปด้วย ไม่งั้นแปลนจะถูกตัดเหลือเฉพาะส่วนที่มีอุปกรณ์วางอยู่
        // ซึ่งทำให้รูปที่ export ออกไปอ่านไม่รู้เรื่อง (เห็นผนังครึ่งเดียว ไม่เห็นว่าห้องไหนเป็นห้องไหน)
        if (typeof backdropImg !== 'undefined' && backdropImg && typeof hasBackdrop === 'function' && hasBackdrop()) {
            var b = state.backdrop;
            var bs = Math.max(0.05, Number(b.scale) || 1);
            minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + backdropImg.naturalWidth * bs);
            maxY = Math.max(maxY, b.y + backdropImg.naturalHeight * bs);
        }

        var w = (maxX - minX) + pad * 2;
        var h = (maxY - minY) + pad * 2;

        var out = document.createElement('canvas');
        out.width = Math.ceil(w * scale);
        out.height = Math.ceil(h * scale);
        var octx = out.getContext('2d');
        if (!octx) { showToast('เบราว์เซอร์นี้สร้างรูปไม่ได้', 'error'); return; }

        octx.fillStyle = currentBgColor();
        octx.fillRect(0, 0, out.width, out.height);

        // สลับตัวแปรมุมมองไปชี้ที่ canvas ใหม่ชั่วคราว แล้วคืนค่าเดิมเสมอใน finally
        var saved = { ctx: ctx, cW: cW, cH: cH, dpr: dpr, z: viewZoom, px: viewPanX, py: viewPanY, grid: gridKey };
        try {
            ctx = octx;
            cW = w; cH = h; dpr = scale;
            viewZoom = 1;
            viewPanX = -minX + pad;
            viewPanY = -minY + pad;
            gridKey = ''; // บังคับสร้างตารางใหม่ให้ตรงขนาดภาพ

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawGrid();
            ctx.setTransform(dpr * viewZoom, 0, 0, dpr * viewZoom, viewPanX * dpr, viewPanY * dpr);
            if (typeof drawBackdrop === 'function') drawBackdrop(true); // ล่างสุดเหมือนตอนวาดบนจอ (true = ไม่เอากรอบประช่วยจัดตำแหน่ง)
            drawConnections();
            drawRouterNode();
            drawSwitchNodes();
            drawDeptNodes();
            drawManualNodes();
            // ไม่วาด drawFlowArrows() — ลูกศรวิ่งเป็นภาพเคลื่อนไหว จับภาพนิ่งแล้วดูเหมือนจุดรบกวน
        } finally {
            ctx = saved.ctx; cW = saved.cW; cH = saved.cH; dpr = saved.dpr;
            viewZoom = saved.z; viewPanX = saved.px; viewPanY = saved.py;
            gridKey = ''; // ตารางที่แคชไว้เป็นของขนาดภาพ ต้องสร้างใหม่ให้ตรงจอ
            if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            requestRedraw();
        }

        var name = 'netforge-topology-' + exportStamp() + '.png';
        if (out.toBlob) {
            out.toBlob(function (blob) {
                if (!blob) { showToast('โปรแกรมสร้างไฟล์รูปไม่สำเร็จ ผังอาจใหญ่เกินไป ลองย่อขนาดผังลงแล้วกดใหม่อีกครั้ง', 'error'); return; }
                downloadBlob(blob, name);
                showToast('บันทึกรูปผังแล้ว (' + out.width + '×' + out.height + ' px)', 'success');
            }, 'image/png');
        } else {
            var a = document.createElement('a');
            a.href = out.toDataURL('image/png');
            a.download = name;
            a.click();
            showToast('บันทึกรูปผังแล้ว', 'success');
        }
    } catch (err) {
        console.error('exportTopologyPNG error:', err);
        showToast('โปรแกรมบันทึกรูปผังไม่สำเร็จ ลองย่อขนาดผังลงแล้วกดใหม่อีกครั้ง', 'error');
    }
}

/* ---------- CSV ของตาราง IP ---------- */

// ครอบค่าด้วยเครื่องหมายคำพูดเมื่อมีอักขระที่ทำให้คอลัมน์เพี้ยน (ชื่อแผนกเป็น free text)
function csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvRow(arr) { return arr.map(csvCell).join(','); }

function buildCsv() {
    var lines = [];
    lines.push('NetForge — แผนการจัดสรร IP');
    lines.push('สร้างเมื่อ,' + csvCell(new Date().toLocaleString('th-TH')));
    lines.push('');

    if (state.calculated.length > 0) {
        lines.push('ตาราง IPv4 (Base ' + state.baseIp + '/' + state.baseCidr + ')');
        lines.push(csvRow(['#', 'แผนก', 'VLAN', 'Hosts ที่ขอ', 'Network', 'CIDR', 'Subnet Mask',
                           'Broadcast', 'First Usable', 'Last Usable', 'Wildcard', 'ขนาด', 'อยู่กับ Router']));
        state.calculated.forEach(function (d, i) {
            var sw = topoNodes.switches.find(function (x) { return x.deptId === d.id; });
            var owner = (typeof getDeptOwnerRouter === 'function' && getDeptOwnerRouter(d.id));
            lines.push(csvRow([i + 1, d.name, sw ? sw.vlanId : '', d.hosts,
                d.subnet.network, '/' + d.subnet.cidr, d.subnet.netmask, d.subnet.broadcast,
                d.subnet.firstUsable, d.subnet.lastUsable, d.subnet.wildcard, d.subnet.size,
                owner ? owner.label : 'Router-01']));
        });
        lines.push('');
    }

    // แผนกที่จัดสรรไม่สำเร็จต้องอยู่ในไฟล์ด้วย ไม่งั้นคนอ่านรายงานจะไม่รู้ว่ามีแผนกตกหล่น
    if ((state.failed || []).length > 0) {
        lines.push('แผนกที่จัดสรรไม่สำเร็จ');
        lines.push(csvRow(['แผนก', 'Hosts ที่ขอ', 'เหตุผล']));
        state.failed.forEach(function (f) { lines.push(csvRow([f.name, f.hosts, f.reason])); });
        lines.push('');
    }

    if (state.calculatedV6.length > 0) {
        lines.push('ตาราง IPv6 (Base ' + state.baseIp6 + '/' + state.basePrefixLen6 + ')');
        lines.push(csvRow(['#', 'แผนก', 'Network/Prefix', 'First Usable', 'Last Usable', 'จำนวน Address']));
        state.calculatedV6.forEach(function (d, i) {
            lines.push(csvRow([i + 1, d.name, d.subnet6.cidrText, d.subnet6.firstUsable,
                d.subnet6.lastUsable, d.subnet6.totalAddresses]));
        });
        lines.push('');
    }

    if ((state.wanLinks || []).length > 0) {
        lines.push('ลิงก์ WAN ระหว่าง Router');
        lines.push(csvRow(['Subnet', 'Netmask', 'ปลายทาง A', 'IP ฝั่ง A', 'ปลายทาง B', 'IP ฝั่ง B']));
        state.wanLinks.forEach(function (w) {
            lines.push(csvRow([w.network + '/30', w.netmask,
                w.ends[0].label, w.ends[0].ip, w.ends[1].label, w.ends[1].ip]));
        });
        lines.push('');
    }

    var statics = topoNodes.manualNodes.filter(function (n) { return n.ip && n.linkedDeptId; });
    if (statics.length > 0) {
        lines.push('อุปกรณ์ที่กำหนด IP คงที่บนผัง');
        lines.push(csvRow(['อุปกรณ์', 'ชนิด', 'IP', 'อยู่ในแผนก']));
        statics.forEach(function (n) {
            var d = state.calculated.find(function (x) { return x.id === n.linkedDeptId; });
            lines.push(csvRow([n.label, n.type === 'pc' ? 'PC' : 'Server', n.ip, d ? d.name : '-']));
        });
    }

    return lines.join('\r\n'); // CRLF เพื่อให้ Excel บน Windows ขึ้นบรรทัดถูก
}

function exportTableCSV() {
    try {
        if (state.calculated.length === 0 && state.calculatedV6.length === 0) {
            showToast('ยังไม่มีตารางให้บันทึก ต้องเพิ่มแผนกและกดคำนวณก่อน', 'error');
            return;
        }
        // ﻿ (BOM) จำเป็นสำหรับ Excel บน Windows ไม่งั้นภาษาไทยจะกลายเป็นอักขระเพี้ยนทั้งไฟล์
        var blob = new Blob(['﻿' + buildCsv()], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, 'netforge-ip-plan-' + exportStamp() + '.csv');
        showToast('บันทึกตารางเป็นไฟล์ CSV แล้ว เปิดด้วย Excel ได้เลย', 'success');
    } catch (err) {
        console.error('exportTableCSV error:', err);
        showToast('โปรแกรมบันทึกไฟล์ CSV ไม่สำเร็จ ลองกดใหม่อีกครั้ง ถ้ายังไม่ได้ให้ตรวจว่าเบราว์เซอร์บล็อกการดาวน์โหลดอยู่หรือเปล่า', 'error');
    }
}

/* ---------- CLI เป็นไฟล์ข้อความ ---------- */

// ถอดแท็ก HTML ที่ใช้ระบายสีออก ให้เหลือคำสั่งดิบที่แปะลงอุปกรณ์ได้ทันที
function stripCliHtml(html) {
    return String(html)
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

function buildCliText() {
    var parts = [];
    var savedTarget = state.cliRouterId;
    try {
        var routers = (typeof getAllRouters === 'function') ? getAllRouters() : [topoNodes.router].filter(Boolean);
        routers.forEach(function (r) {
            state.cliRouterId = r.id;
            renderCLI();
            parts.push('! ==========================================================');
            // หัวข้อคั่นในไฟล์ .txt เป็นคอมเมนต์ ไม่ใช่คำสั่ง จึงใช้ชื่อที่ผู้ใช้ตั้งไว้จริง (ไทยได้)
            // ส่วนบรรทัด hostname ข้างในใช้ชื่อที่ IOS รับได้ ซึ่ง renderCLI() จัดการให้แล้ว
            parts.push('!  ' + (typeof routerDisplayName === 'function' ? routerDisplayName(r) : 'Router'));
            parts.push('! ==========================================================');
            parts.push(stripCliHtml(document.getElementById('cliRouterOutput').innerHTML));
            parts.push('');
        });
        parts.push('! ==========================================================');
        parts.push('!  Switch-01');
        parts.push('! ==========================================================');
        parts.push(stripCliHtml(document.getElementById('cliSwitchOutput').innerHTML));
    } finally {
        state.cliRouterId = savedTarget; // คืนตัวที่ผู้ใช้เลือกดูอยู่เสมอ
        renderCLI();
    }
    return parts.join('\n');
}

function exportCliTxt() {
    try {
        if (state.calculated.length === 0 && state.calculatedV6.length === 0) {
            showToast('ยังไม่มีคำสั่งให้บันทึก ต้องเพิ่มแผนกและกดคำนวณก่อน', 'error');
            return;
        }
        var blob = new Blob([buildCliText()], { type: 'text/plain;charset=utf-8;' });
        downloadBlob(blob, 'netforge-cli-' + exportStamp() + '.txt');
        showToast('บันทึกคำสั่ง CLI ของทุกอุปกรณ์เป็นไฟล์แล้ว', 'success');
    } catch (err) {
        console.error('exportCliTxt error:', err);
        showToast('โปรแกรมบันทึกไฟล์คำสั่งไม่สำเร็จ ลองกดใหม่อีกครั้ง ถ้ายังไม่ได้ให้ตรวจว่าเบราว์เซอร์บล็อกการดาวน์โหลดอยู่หรือเปล่า', 'error');
    }
}
