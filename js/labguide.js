/* ============================================================
   labguide.js — สร้างคู่มือทำ Lab จากงานที่ผู้ใช้สร้างไว้ตอนนั้น
   ============================================================

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):

   เดิมโปรแกรมให้เฉพาะ configuration ของอุปกรณ์ ผู้ใช้ที่นำไปวางใน Packet Tracer
   จึงติดตรงที่โปรแกรมไม่ได้บอกเลยว่า

     1. ต้องพิมพ์ enable กับ configure terminal ก่อนวาง และ write memory ปิดท้าย
        ถ้าไม่รู้ คำสั่งทั้งชุดจะถูกปฏิเสธด้วย % Invalid input โดยไม่รู้สาเหตุ
     2. configuration ชุดไหนต้องวางลงอุปกรณ์ตัวใด กล่องเขียนแค่ SWITCH CONFIG
        ผู้ใช้จึงวาง switch config ลง router ได้ง่ายมาก
     3. เครื่องลูกข่ายต้องตั้ง IP อย่างไร Default Gateway ใช้เลขอะไร
        ซึ่งเป็นข้อมูลที่ไม่เคยปรากฏที่ไหนในโปรแกรมเลย

   ทั้งสามข้อนี้พบจากการนำ config ไปทดสอบกับ Packet Tracer จริง ไม่ได้พบจากชุดทดสอบ

   ไฟล์นี้จึงรวบรวมข้อมูลทั้งหมดที่ผู้ใช้ต้องใช้ ให้ออกมาเป็นเอกสารเดียวจบ
   สองรูปแบบคือ .html ที่มีปุ่มคัดลอกทุกบล็อก และ .md สำหรับนำไปทำเอกสารต่อ

   โครงสร้าง:
     buildLabData()   รวบรวมข้อมูลจาก state ให้เป็นออบเจ็กต์เดียว
     labMarkdown()    แปลงออบเจ็กต์เป็น Markdown
     labHtml()        แปลงออบเจ็กต์เป็น HTML ที่เปิดในเบราว์เซอร์ได้เลย
     exportLabMd()    ปุ่มในเมนู EXPORT
     exportLabHtml()  ปุ่มในเมนู EXPORT

   ต้องโหลดหลัง cli.js เพราะเรียก renderCLI() และหลัง wan.js เพราะเรียก getAllRouters()
   ============================================================ */

/* ---------- ตัวช่วย ---------- */

function labEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// วันเวลาแบบไทย ใช้ในหัวเอกสาร
function labStamp() {
    var d = new Date();
    var m = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
             'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + (d.getFullYear() + 543) +
           ' เวลา ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/* ---------- รวบรวมข้อมูล ---------- */

function buildLabData() {
    var data = {
        stamp: labStamp(),
        baseIp: state.baseIp,
        baseCidr: state.baseCidr,
        hasV4: state.calculated.length > 0,
        hasV6: state.calculatedV6.length > 0,
        depts: [],
        routers: [],
        wanLinks: [],
        switchCli: ''
    };

    // ---- แผนก พร้อมข้อมูลที่เครื่องลูกข่ายต้องใช้ ----
    state.calculated.forEach(function (d) {
        var s = d.subnet;
        var sw = topoNodes.switches.find(function (x) { return x.deptId === d.id; });
        var owner = (typeof getDeptOwnerRouter === 'function') ? getDeptOwnerRouter(d.id) : null;
        data.depts.push({
            name: d.name,
            hosts: d.hosts,
            vlan: sw ? sw.vlanId : 0,
            network: s.network,
            cidr: s.cidr,
            netmask: s.netmask,
            wildcard: s.wildcard,
            broadcast: s.broadcast,
            // เลขแรกของช่วงถูกใช้เป็น IP ของ sub-interface บน Router เสมอ (ดู cli.js)
            // จึงเป็น Default Gateway ของเครื่องลูกข่ายในแผนกนี้โดยปริยาย
            gateway: s.firstUsable,
            firstHost: s.firstUsable,
            lastHost: s.lastUsable,
            // ช่วงที่ DHCP จะแจกจริง เริ่มถัดจาก gateway ไปจนสุดช่วง
            // เพราะ configuration มี ip dhcp excluded-address กัน gateway ไว้แล้ว
            // subnet ไม่ได้เก็บ "เลขถัดจาก firstUsable" ไว้ ต้องคำนวณเองด้วย ipToLong/longToIp ใน vlsm.js
            dhcpFrom: longToIp(ipToLong(s.firstUsable) + 1),
            dhcpTo: s.lastUsable,
            router: owner ? (typeof routerDisplayName === 'function' ? routerDisplayName(owner) : owner.id)
                          : 'Router-01'
        });
    });

    // ---- ลิงก์ WAN ----
    (state.wanLinks || []).forEach(function (l) {
        var dce = l.ends.find(function (e) { return e.id === l.dceId; });
        var dte = l.ends.find(function (e) { return e.id !== l.dceId; });
        data.wanLinks.push({
            subnet: l.network + '/' + l.cidr,
            netmask: l.netmask,
            dceLabel: dce ? dce.label : '?',
            dceIp: dce ? dce.ip : '?',
            dteLabel: dte ? dte.label : '?',
            dteIp: dte ? dte.ip : '?',
            clockRate: state.wanClockRate || 64000
        });
    });

    // ---- configuration ของแต่ละ Router ----
    // ต้องสลับ router ทีละตัวแล้วอ่านผลจาก DOM แบบเดียวกับ buildCliText() ใน export.js
    var saved = state.cliRouterId;
    try {
        var routers = (typeof getAllRouters === 'function') ? getAllRouters()
                                                           : [topoNodes.router].filter(Boolean);
        routers.forEach(function (r) {
            state.cliRouterId = r.id;
            renderCLI();
            data.routers.push({
                name: (typeof routerDisplayName === 'function') ? routerDisplayName(r) : 'Router',
                isMain: r === topoNodes.router,
                cli: stripCliHtml(document.getElementById('cliRouterOutput').innerHTML).trim()
            });
        });
        data.switchCli = stripCliHtml(document.getElementById('cliSwitchOutput').innerHTML).trim();
    } finally {
        state.cliRouterId = saved;
        renderCLI();
    }
    return data;
}

/* ---------- ห่อคำสั่งให้วางแล้วใช้ได้ทันที ----------
   เติมสามส่วนที่ configuration เดิมไม่มี คือคำสั่งเข้าโหมด คำสั่งปิดหน้าจอไม่ให้ค้าง
   และคำสั่งบันทึก ผู้ใช้จึงคัดลอกทั้งก้อนไปวางได้โดยไม่ต้องรู้ว่าต้องพิมพ์อะไรเพิ่ม */
function labWrap(cli, hostname) {
    // คู่มือนี้มีไว้ให้นำไปวางใน Packet Tracer โดยเฉพาะ จึงต้องตัดคอมเมนต์ภาษาไทยออกเสมอ
    // ไม่ขึ้นกับว่าผู้ใช้กดปุ่มโหมด PT ไว้หรือไม่ เพราะถ้ามีอักขระนอก ASCII ปนไป
    // ตัวอักษรจะเพี้ยนทั้งหน้าจอและบางรุ่นกินบรรทัดถัดไปหายไปด้วย
    var body = String(cli || '');
    if (typeof stripNonAsciiComments === 'function') body = stripNonAsciiComments(body);
    // หัวข้อคั่นเป็นกรอบสามบรรทัด บรรทัดกลางเป็นภาษาไทยจึงถูกตัดออกไป
    // เหลือเส้นคั่นสองเส้นติดกันโดยไม่มีอะไรอยู่ตรงกลาง ตัดทิ้งทั้งกรอบ
    body = body.replace(/^! =+\s*\n! =+\s*$/gm, '');
    body = body.replace(/\n?end\s*$/, '');   // ตัด end เดิมออกก่อน จะได้ไม่ซ้ำ
    var out = 'enable\nconfigure terminal\nno ip domain-lookup\n';
    // ตัด hostname เดิมทิ้งเฉพาะตอนที่มีชื่อใหม่มาแทน ไม่งั้น Router จะเสียบรรทัด hostname ไปเฉย ๆ
    if (hostname) {
        out += 'hostname ' + hostname + '\n';
        body = body.replace(/^\s*hostname .*$/m, '');
    }
    out += body.replace(/\n{3,}/g, '\n\n').trim();
    out += '\nend\nwrite memory\n';
    return out;
}

// ตรวจว่าไม่มีอักขระนอก ASCII หลงเหลือในบล็อกคำสั่ง
// ใช้ในเทส และเรียกได้จาก console ตอนไล่ปัญหา
function labHasNonAscii(text) {
    return /[^\x00-\x7F]/.test(String(text));
}

/* ---------- Markdown ---------- */

function labMarkdown() {
    var d = buildLabData();
    var L = [];
    var push = function () { for (var i = 0; i < arguments.length; i++) L.push(arguments[i]); };

    push('# NetForge Lab Guide', '',
         'สร้างจากงานในโปรแกรม NetForge เมื่อ ' + d.stamp, '',
         'Base network: **' + d.baseIp + '/' + d.baseCidr + '**', '', '---', '');

    /* ----- ตารางแผนก ----- */
    push('## ตารางการแบ่ง Subnet', '',
         '| VLAN | Department | Hosts | Network | Gateway (Host แรก) | Host สุดท้าย | Subnet Mask | Router |',
         '|---|---|---|---|---|---|---|---|');
    d.depts.forEach(function (x) {
        push('| ' + x.vlan + ' | ' + x.name + ' | ' + x.hosts + ' | ' + x.network + '/' + x.cidr +
             ' | **' + x.gateway + '** | ' + x.lastHost + ' | ' +
             x.netmask + ' | ' + x.router + ' |');
    });
    push('', 'Gateway ของแต่ละแผนกคือ Host หมายเลขแรกของ subnet นั้น ซึ่ง configuration ' +
             'กำหนดให้ sub-interface ของ Router ไว้แล้ว', '');

    /* ----- ตารางตั้งค่าเครื่องลูกข่าย ----- */
    push('## การตั้งค่าเครื่องลูกข่าย (PC)', '',
         'ใน Packet Tracer คลิกที่ PC แล้วไปที่แท็บ **Desktop** เลือก **IP Configuration**', '',
         'configuration ที่โปรแกรมสร้างให้มี DHCP pool อยู่แล้วทุกแผนก ' +
         'จึงเลือก **DHCP** ได้เลย ไม่ต้องกรอกเอง', '',
         '| Department | เลือกโหมด | IP เริ่มต้น | IP สุดท้าย | Subnet Mask | Default Gateway |',
         '|---|---|---|---|---|---|');
    d.depts.forEach(function (x) {
        push('| ' + x.name + ' | DHCP | ' + x.dhcpFrom + ' | ' + x.dhcpTo + ' | ' +
             x.netmask + ' | ' + x.gateway + ' |');
    });
    push('',
         '> ถ้าต้องการตั้งเองแบบ Static ให้เลือก **Static** แล้วกรอกสามช่อง คือ IP Address ' +
         'เลือกเลขใดก็ได้ในช่วงข้างบน, Subnet Mask และ Default Gateway ตามตาราง', '',
         '> Gateway ของแต่ละแผนกคือเลขแรกของช่วง เพราะ configuration กำหนดเลขนี้ให้ sub-interface ' +
         'ของ Router และกันออกจาก DHCP pool ไว้แล้วด้วย `ip dhcp excluded-address`', '');

    /* ----- ตาราง WAN ----- */
    if (d.wanLinks.length) {
        push('## ลิงก์ WAN ระหว่าง Router', '',
             '| Subnet | ฝั่ง DCE | IP | ฝั่ง DTE | IP | Clock Rate |',
             '|---|---|---|---|---|---|');
        d.wanLinks.forEach(function (w) {
            push('| ' + w.subnet + ' | ' + w.dceLabel + ' | ' + w.dceIp + ' | ' +
                 w.dteLabel + ' | ' + w.dteIp + ' | ' + w.clockRate + ' |');
        });
        push('',
             '> ตอนต่อสายใน Packet Tracer ให้ใช้สาย **Serial DCE** และ**คลิกที่ฝั่ง DCE ก่อนเสมอ** ' +
             'ปลายที่คลิกก่อนจะเป็นฝั่งจ่าย clock ถ้าต่อกลับด้าน ลิงก์จะขึ้น up/down ' +
             'โดยไม่มี error message ใด ๆ', '');
    }

    /* ----- configuration ----- */
    push('---', '', '## Configuration', '',
         'แต่ละบล็อกใส่ `enable` และ `configure terminal` นำหน้า กับ `write memory` ปิดท้ายไว้แล้ว ' +
         'คัดลอกทั้งก้อนไปวางได้เลย', '',
         '**วางให้ถูกตัว** ดูชื่อบนแถบหน้าต่างของอุปกรณ์ใน Packet Tracer ก่อนวางทุกครั้ง', '');

    d.routers.forEach(function (r) {
        push('### Router: ' + r.name, '',
             'วางลงที่ Router ชื่อ **' + r.name + '** เท่านั้น', '',
             '```', labWrap(r.cli, null).trim(), '```', '');
    });

    if (d.switchCli) {
        push('### Switch', '',
             'configuration ชุดนี้ใช้ได้กับ Switch ทุกตัว ก่อนวางให้แก้บรรทัด `hostname Sw-01` ' +
             'เป็นชื่อ Switch ตัวที่กำลังตั้งค่าอยู่ เช่น `hostname Sw-HQ`', '',
             '```', labWrap(d.switchCli, 'Sw-01').trim(), '```', '');
    }

    /* ----- ตรวจสอบ ----- */
    push('---', '', '## ตรวจสอบว่าใช้งานได้', '',
         '| ตรวจอะไร | คำสั่ง | ผลที่ต้องได้ |', '|---|---|---|',
         '| Router รับ configuration ครบ | `show ip interface brief` | ทุก sub-interface ขึ้น up/up |',
         '| Switch แยก VLAN ได้ | `show vlan brief` | เห็น VLAN ตามตารางข้างบน |',
         '| เส้นทางครบ | `show ip route` | เห็นเส้นทางไปทุก subnet |');
    if (d.wanLinks.length) {
        push('| clock rate อยู่ฝั่งเดียว | `show controllers serial 0/0/0` | ฝั่ง DCE แสดง DCE พร้อม clock rate ฝั่งตรงข้ามแสดง DTE และไม่มี clock rate |');
    }
    push('| PC ได้ IP | ที่ PC เลือก DHCP | ขึ้น DHCP request successful |',
         '| ติดต่อกันได้ | ที่ PC พิมพ์ `ping <ip ปลายทาง>` | ได้ Reply |', '');

    push('---', '', '## ถ้าติดปัญหา', '',
         '| อาการ | สาเหตุที่พบบ่อย | วิธีแก้ |', '|---|---|---|',
         '| `% Invalid input detected` ทุกบรรทัด | ยังไม่ได้อยู่ในโหมดตั้งค่า | ตรวจว่าหน้าจอขึ้น `(config)#` ถ้าไม่มี ให้พิมพ์ `configure terminal` |',
         '| `%Invalid interface type and number` | วาง configuration ของ Switch ลงใน Router | ดูชื่อบนแถบหน้าต่างก่อนวาง |',
         '| ตัวอักษรเพี้ยน | ไม่ได้กดปุ่มโหมด PT ก่อนคัดลอก | กดปุ่มโหมด PT แล้วคัดลอกใหม่ |',
         '| บรรทัดหายไปตอนวาง | Packet Tracer รับข้อความยาวไม่ทัน | แบ่งวางทีละ 20 ถึง 30 บรรทัด |',
         '| PC ขึ้น DHCP request failed | port บน Switch อยู่ผิด VLAN | `show vlan brief` แล้วตรวจว่า port นั้นอยู่ VLAN ใด |',
         '| Serial ขึ้น up/down | ฝั่ง DCE กลับด้าน | ลบสายแล้วต่อใหม่ คลิกฝั่ง DCE ก่อน |', '',
         '---', '', 'สร้างโดย NetForge  https://pkhbtpakin.github.io/netforge/');

    return L.join('\n');
}

/* ---------- HTML ----------
   ทำเป็นไฟล์เดียวจบ ไม่อ้างอิงไฟล์ภายนอกเลย ผู้ใช้จึงส่งต่อหรือเก็บไว้อ่านออฟไลน์ได้
   ปุ่มคัดลอกใช้ navigator.clipboard และมีทางสำรองด้วย execCommand
   เพราะ clipboard API ใช้ไม่ได้เมื่อเปิดไฟล์ผ่าน file:// ในเบราว์เซอร์บางตัว */
function labHtml() {
    var md = labMarkdown();
    var d = buildLabData();

    var css =
        'body{font-family:"TH Sarabun New","Sarabun",system-ui,sans-serif;font-size:17px;' +
        'line-height:1.6;color:#1a1a1a;max-width:1180px;margin:0 auto;padding:28px 20px 60px}' +
        'h1{font-size:30px;color:#1F3864;border-bottom:3px solid #1F3864;padding-bottom:8px}' +
        'h2{font-size:23px;color:#1F3864;margin-top:34px;border-bottom:1px solid #ccd3db;padding-bottom:4px}' +
        'h3{font-size:19px;color:#1F3864;margin-top:24px}' +
        'table{border-collapse:collapse;width:100%;margin:10px 0 18px;font-size:14.5px}'
        'td,th{white-space:nowrap}td:first-child,th:first-child{white-space:normal}' +
        'th{background:#E8EDF3;color:#1F3864;border:1px solid #9AA5B1;padding:7px 9px;text-align:left}' +
        'td{border:1px solid #C6CDD5;padding:6px 9px;vertical-align:top}' +
        'tr:nth-child(even) td{background:#FAFBFC}' +
        '.cfg{position:relative;margin:10px 0 22px}' +
        'pre{background:#1E2430;color:#E6EAF2;border-radius:6px;padding:14px 16px;overflow-x:auto;' +
        'font-family:Consolas,"DejaVu Sans Mono",monospace;font-size:13.5px;line-height:1.5;margin:0}' +
        '.copy{position:absolute;top:8px;right:8px;background:#2E5C8A;color:#fff;border:0;' +
        'border-radius:5px;padding:6px 14px;font-size:14px;cursor:pointer;font-family:inherit}' +
        '.copy:hover{background:#3B72A8}.copy.ok{background:#1E7D45}' +
        'blockquote{border-left:4px solid #C0502A;background:#FBF3F0;margin:12px 0;padding:8px 14px}' +
        '.tag{display:inline-block;background:#C0502A;color:#fff;border-radius:4px;padding:2px 9px;' +
        'font-size:14px;margin-left:6px}' +
        '.note{background:#EEF1F5;border-left:4px solid #1F3864;padding:10px 14px;margin:14px 0}' +
        'code{background:#EEF1F5;padding:1px 5px;border-radius:3px;font-size:14px}' +
        '@media print{.copy{display:none}pre{background:#f4f5f7;color:#111;border:1px solid #ccc}}';

    var h = [];
    var p = function () { for (var i = 0; i < arguments.length; i++) h.push(arguments[i]); };

    p('<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>NetForge Lab Guide</title><style>', css, '</style></head><body>');

    p('<h1>NetForge Lab Guide</h1>',
      '<p>สร้างจากงานในโปรแกรม NetForge เมื่อ ', labEsc(d.stamp), '<br>',
      'Base network <b>', labEsc(d.baseIp + '/' + d.baseCidr), '</b></p>');

    /* ตารางแผนก */
    p('<h2>ตารางการแบ่ง Subnet</h2><table><tr><th>VLAN</th><th>Department</th><th>Hosts</th>',
      '<th>Network</th><th>Gateway<br><span style="font-weight:400;font-size:13px">Host แรก</span></th>',
      '<th>Host สุดท้าย</th><th>Subnet Mask</th><th>Router</th></tr>');
    d.depts.forEach(function (x) {
        p('<tr><td>', x.vlan, '</td><td>', labEsc(x.name), '</td><td>', x.hosts, '</td><td>',
          labEsc(x.network + '/' + x.cidr), '</td><td><b>', labEsc(x.gateway), '</b></td><td>',
          labEsc(x.lastHost), '</td><td>', labEsc(x.netmask), '</td><td>',
          labEsc(x.router), '</td></tr>');
    });
    p('</table><p style="color:#5A5A5A;font-size:15px">Gateway ของแต่ละแผนกคือ Host หมายเลขแรก',
      'ของ subnet นั้น ซึ่ง configuration กำหนดให้ sub-interface ของ Router ไว้แล้ว</p>');

    /* ตาราง PC */
    p('<h2>การตั้งค่าเครื่องลูกข่าย (PC)</h2>',
      '<div class="note">ใน Packet Tracer คลิกที่ PC ไปที่แท็บ <b>Desktop</b> เลือก ',
      '<b>IP Configuration</b> แล้วเลือก <b>DHCP</b><br>',
      'configuration ที่โปรแกรมสร้างมี DHCP pool ครบทุกแผนกอยู่แล้ว จึงไม่ต้องกรอกเอง</div>',
      '<table><tr><th>Department</th><th>เลือกโหมด</th><th>IP เริ่มต้น</th><th>IP สุดท้าย</th>',
      '<th>Subnet Mask</th><th>Default Gateway</th></tr>');
    d.depts.forEach(function (x) {
        p('<tr><td>', labEsc(x.name), '</td><td>DHCP</td><td>', labEsc(x.dhcpFrom),
          '</td><td>', labEsc(x.dhcpTo), '</td><td>', labEsc(x.netmask),
          '</td><td><b>', labEsc(x.gateway), '</b></td></tr>');
    });
    p('</table>',
      '<blockquote>ถ้าต้องการตั้งเองแบบ Static ให้เลือก <b>Static</b> แล้วกรอกสามช่อง ',
      'คือ IP Address เลือกเลขใดก็ได้ในช่วงข้างบน, Subnet Mask และ Default Gateway ตามตาราง<br><br>',
      'Gateway ของแต่ละแผนกคือเลขแรกของช่วง เพราะ configuration กำหนดเลขนี้ให้ sub-interface ',
      'ของ Router และกันออกจาก DHCP pool ไว้แล้วด้วย <code>ip dhcp excluded-address</code>',
      '</blockquote>');

    /* ตาราง WAN */
    if (d.wanLinks.length) {
        p('<h2>ลิงก์ WAN ระหว่าง Router</h2><table><tr><th>Subnet</th><th>ฝั่ง DCE</th><th>IP</th>',
          '<th>ฝั่ง DTE</th><th>IP</th><th>Clock Rate</th></tr>');
        d.wanLinks.forEach(function (w) {
            p('<tr><td>', labEsc(w.subnet), '</td><td><b>', labEsc(w.dceLabel), '</b></td><td>',
              labEsc(w.dceIp), '</td><td>', labEsc(w.dteLabel), '</td><td>', labEsc(w.dteIp),
              '</td><td>', w.clockRate, '</td></tr>');
        });
        p('</table><blockquote>ตอนต่อสายใน Packet Tracer ใช้สาย <b>Serial DCE</b> และ',
          '<b>คลิกที่ฝั่ง DCE ก่อนเสมอ</b> ปลายที่คลิกก่อนจะเป็นฝั่งจ่าย clock<br>',
          'ถ้าต่อกลับด้าน ลิงก์จะขึ้น up/down โดยไม่มี error message ใด ๆ</blockquote>');
    }

    /* configuration */
    p('<h2>Configuration</h2>',
      '<div class="note">ทุกบล็อกใส่ <code>enable</code> กับ <code>configure terminal</code> ',
      'นำหน้า และ <code>write memory</code> ปิดท้ายไว้แล้ว กดปุ่มคัดลอกแล้วนำไปวางได้ทันที<br>',
      '<b>ดูชื่อบนแถบหน้าต่างของอุปกรณ์ก่อนวางทุกครั้ง</b> วางผิดตัวจะทำให้ IP ชนกันทั้งระบบ</div>');

    var blockId = 0;
    var codeBlock = function (title, tag, body) {
        blockId++;
        p('<h3>', labEsc(title), tag ? '<span class="tag">' + labEsc(tag) + '</span>' : '', '</h3>',
          '<div class="cfg"><button class="copy" onclick="cp(this,\'b', blockId, '\')">คัดลอก</button>',
          '<pre id="b', blockId, '">', labEsc(body), '</pre></div>');
    };

    d.routers.forEach(function (r) {
        codeBlock('Router: ' + r.name, 'วางลงที่ ' + r.name, labWrap(r.cli, null).trim());
    });
    if (d.switchCli) {
        codeBlock('Switch', 'ใช้ได้กับ Switch ทุกตัว  แก้บรรทัด hostname ก่อนวาง',
                  labWrap(d.switchCli, 'Sw-01').trim());
    }

    /* ตรวจสอบ */
    p('<h2>ตรวจสอบว่าใช้งานได้</h2><table><tr><th>ตรวจอะไร</th><th>คำสั่ง</th><th>ผลที่ต้องได้</th></tr>',
      '<tr><td>Router รับ configuration ครบ</td><td><code>show ip interface brief</code></td>',
      '<td>ทุก sub-interface ขึ้น up/up</td></tr>',
      '<tr><td>Switch แยก VLAN ได้</td><td><code>show vlan brief</code></td>',
      '<td>เห็น VLAN ตามตารางข้างบน</td></tr>',
      '<tr><td>เส้นทางครบ</td><td><code>show ip route</code></td>',
      '<td>เห็นเส้นทางไปทุก subnet</td></tr>');
    if (d.wanLinks.length) {
        p('<tr><td>clock rate อยู่ฝั่งเดียว</td><td><code>show controllers serial 0/0/0</code></td>',
          '<td>ฝั่ง DCE แสดง DCE พร้อม clock rate ฝั่งตรงข้ามแสดง DTE และไม่มี clock rate</td></tr>');
    }
    p('<tr><td>PC ได้ IP</td><td>ที่ PC เลือก DHCP</td><td>ขึ้น DHCP request successful</td></tr>',
      '<tr><td>ติดต่อกันได้</td><td>ที่ PC พิมพ์ <code>ping</code> ตามด้วย IP ปลายทาง</td>',
      '<td>ได้ Reply</td></tr></table>');

    /* ปัญหา */
    p('<h2>ถ้าติดปัญหา</h2><table><tr><th>อาการ</th><th>สาเหตุที่พบบ่อย</th><th>วิธีแก้</th></tr>',
      '<tr><td><code>% Invalid input detected</code> ทุกบรรทัด</td><td>ยังไม่ได้อยู่ในโหมดตั้งค่า</td>',
      '<td>ตรวจว่าหน้าจอขึ้น <code>(config)#</code> ถ้าไม่มี ให้พิมพ์ <code>configure terminal</code></td></tr>',
      '<tr><td><code>%Invalid interface type and number</code></td>',
      '<td>วาง configuration ของ Switch ลงใน Router</td><td>ดูชื่อบนแถบหน้าต่างก่อนวาง</td></tr>',
      '<tr><td>ตัวอักษรเพี้ยน</td><td>ไม่ได้กดปุ่มโหมด PT ก่อนคัดลอก</td>',
      '<td>กดปุ่มโหมด PT แล้วคัดลอกใหม่</td></tr>',
      '<tr><td>บรรทัดหายไปตอนวาง</td><td>Packet Tracer รับข้อความยาวไม่ทัน</td>',
      '<td>แบ่งวางทีละ 20 ถึง 30 บรรทัด</td></tr>',
      '<tr><td>PC ขึ้น DHCP request failed</td><td>port บน Switch อยู่ผิด VLAN</td>',
      '<td><code>show vlan brief</code> แล้วตรวจว่า port นั้นอยู่ VLAN ใด</td></tr>',
      '<tr><td>Serial ขึ้น up/down</td><td>ฝั่ง DCE กลับด้าน</td>',
      '<td>ลบสายแล้วต่อใหม่ คลิกฝั่ง DCE ก่อน</td></tr></table>');

    p('<p style="margin-top:34px;color:#5A5A5A;font-size:15px">สร้างโดย NetForge ',
      '<a href="https://pkhbtpakin.github.io/netforge/">pkhbtpakin.github.io/netforge</a></p>');

    // ปุ่มคัดลอก มีทางสำรองเพราะ clipboard API ถูกปิดเมื่อเปิดไฟล์ผ่าน file://
    p('<script>function cp(btn,id){var t=document.getElementById(id).innerText;' +
      'function ok(){btn.textContent="คัดลอกแล้ว";btn.className="copy ok";' +
      'setTimeout(function(){btn.textContent="คัดลอก";btn.className="copy";},1600);}' +
      'if(navigator.clipboard&&navigator.clipboard.writeText){' +
      'navigator.clipboard.writeText(t).then(ok,function(){fb(t,ok);});}else{fb(t,ok);}}' +
      'function fb(t,ok){var a=document.createElement("textarea");a.value=t;' +
      'a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();' +
      'try{document.execCommand("copy");ok();}catch(e){}document.body.removeChild(a);}<\/script>');

    p('</body></html>');
    return h.join('');
}

/* ---------- ปุ่มในเมนู EXPORT ---------- */

function labGuideGuard() {
    if (state.calculated.length === 0 && state.calculatedV6.length === 0) {
        showToast('ยังไม่มีข้อมูลให้สร้างคู่มือ ต้องเพิ่มแผนกและกดคำนวณก่อน', 'error');
        return false;
    }
    return true;
}

function exportLabHtml() {
    try {
        if (!labGuideGuard()) return;
        var blob = new Blob([labHtml()], { type: 'text/html;charset=utf-8;' });
        downloadBlob(blob, 'netforge-lab-' + exportStamp() + '.html');
        showToast('บันทึกคู่มือแบบเปิดในเบราว์เซอร์แล้ว มีปุ่มคัดลอกทุกบล็อก', 'success');
    } catch (err) {
        console.error('exportLabHtml error:', err);
        showToast('โปรแกรมสร้างคู่มือไม่สำเร็จ ลองกด CALCULATE คำนวณใหม่ก่อน แล้วค่อยกดสร้างคู่มืออีกครั้ง', 'error');
    }
}

function exportLabMd() {
    try {
        if (!labGuideGuard()) return;
        var blob = new Blob([labMarkdown()], { type: 'text/markdown;charset=utf-8;' });
        downloadBlob(blob, 'netforge-lab-' + exportStamp() + '.md');
        showToast('บันทึกคู่มือแบบ Markdown แล้ว', 'success');
    } catch (err) {
        console.error('exportLabMd error:', err);
        showToast('โปรแกรมสร้างคู่มือไม่สำเร็จ ลองกด CALCULATE คำนวณใหม่ก่อน แล้วค่อยกดสร้างคู่มืออีกครั้ง', 'error');
    }
}
