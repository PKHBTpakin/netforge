/* ============================================
   6. CLI Generator — สร้าง config Cisco IOS จากผลคำนวณ
   ============================================
   แยกออกมาจาก ui.js เมื่อ 31 ก.ค. 2569 ตอนนั้น ui.js ยาว 1,569 บรรทัดและทำ 5 หน้าที่ในไฟล์เดียว
   (ตาราง, แผงรายละเอียด, ธีม, CLI, layout/resizer) ทำให้หาโค้ดยากและแก้ชนกันเองง่าย

   ก้อน CLI เป็นก้อนที่ผ่าออกได้สะอาดที่สุด เพราะมันแค่อ่าน state แล้วคืนข้อความ
   ไม่ได้ถือ state ของตัวเองเลย ยกเว้น state.cliRouterId ที่บอกว่ากำลังดู Router ตัวไหนอยู่

   ลำดับการโหลด (ห้ามสลับ):
     - ต้องอยู่หลัง ui.js  — ใช้ escapeHtml() ที่นิยามไว้ที่นั่น
     - ต้องอยู่หลัง wan.js — ใช้ getWanLinksOfRouter/getStaticRoutesForRouter/routerHostname
     - ต้องอยู่ก่อน export.js — buildCliText() ในนั้นเรียก renderCLI() ของไฟล์นี้ซ้ำทีละ Router
   ============================================ */

/* ---------- ชื่อที่ Cisco IOS รับได้ ----------
   คู่กับ escapeHtml() ข้างบน: ทั้งคู่แปลง free text ที่ผู้ใช้พิมพ์เองให้ปลอดภัยกับปลายทางหนึ่ง ๆ
   escapeHtml = ปลายทาง HTML, toCiscoName = ปลายทางบรรทัดคำสั่งบนอุปกรณ์

   IOS รับชื่อ (hostname, ip dhcp pool) เป็น "คำเดียว" อักขระ ASCII เท่านั้น
   แต่ชื่อแผนกกับชื่อ Router สาขาเป็นช่องพิมพ์อิสระ ไม่มีการกรองที่ต้นทางเลย
   ถ้าปล่อยชื่อดิบลง config:
     "IT Support"  -> ip dhcp pool IT Support  -> IOS ตอบ % Invalid input detected
     "ฝ่ายไอที"     -> ip dhcp pool ฝ่ายไอที     -> IOS ไม่รับ non-ASCII บน CLI
   ผลคือ pool ไม่ถูกสร้าง = แผนกนั้นแจก DHCP ไม่ได้เลย และเป็นความผิดพลาดที่เงียบมาก
   เพราะคนที่ copy config ไปแปะมักไม่ได้ไล่อ่านทีละบรรทัดว่าบรรทัดไหนโดนปฏิเสธ

   fallback จำเป็นเสมอ: ชื่อภาษาไทยล้วนจะถูกตัดจนเหลือค่าว่าง ถ้าไม่มีชื่อสำรอง
   จะได้ `ip dhcp pool` เปล่า ๆ ซึ่งพังหนักกว่าเดิม */
function toCiscoName(str, fallback) {
    var clean = function (v) {
        return String(v == null ? '' : v)
            .trim()
            .replace(/\s+/g, '-')            // เว้นวรรค -> ขีด (ยังพออ่านออกว่าเป็นแผนกไหน ดีกว่าตัดทิ้ง)
            .replace(/[^A-Za-z0-9_-]/g, '')  // ตัดอักขระที่ IOS ไม่รับ (รวมภาษาไทยและสัญลักษณ์)
            .replace(/-+/g, '-')             // ขีดที่ติดกันหลายตัวหลังการตัด -> เหลือตัวเดียว
            .replace(/^-+|-+$/g, '')         // ขีดหัวท้ายที่เหลือค้าง
            .slice(0, 32);                   // เพดานความยาวชื่อ pool บน IOS
    };
    // ล้าง fallback ด้วยเงื่อนไขเดียวกัน — ผู้เรียกส่ง id หรือค่าที่ประกอบขึ้นมาเอง
    // ถ้าวันหลังรูปแบบ id เปลี่ยนไปมีอักขระแปลก ๆ จะได้ไม่หลุดออกไปเป็นคำสั่งพัง
    return clean(str) || clean(fallback) || 'POOL';
}

/* ชื่อ pool ต้องไม่ซ้ำกันภายใน Router ตัวเดียว — IOS ถือว่าชื่อเดียวกันคือ pool เดียว
   การประกาศชื่อซ้ำจึงไม่ error แต่ไปแก้ pool เดิมแทน = แผนกหลังสุดกินทับแผนกแรกเงียบ ๆ
   ชนกันได้จริงหลังผ่าน toCiscoName เช่น "IT Support" กับ "IT-Support" เหลือชื่อเดียวกัน
   หรือหลายแผนกที่ตั้งชื่อไทยล้วนแล้วถูกตัดจนว่างเหมือนกันหมด
   แก้ด้วยการต่อท้ายด้วย id ของแผนก ซึ่งไม่ซ้ำกันอยู่แล้วโดยนิยาม */
function buildPoolNames(depts) {
    var used = Object.create(null), map = Object.create(null);
    (depts || []).forEach(function (d) {
        var name = toCiscoName(d.name, 'DEPT-' + d.id);
        if (used[name]) name = (name + '-' + d.id).slice(0, 32);
        used[name] = true;
        map[d.id] = name;
    });
    return map;
}

/* ----- ตัวเลือก Router สำหรับดู config -----
   พอมี Router ได้หลายตัว การยัด config ทุกตัวลงกล่องเดียวจะยาวจนคัดลอกผิดตัวได้ง่าย
   จึงให้เลือกดูทีละตัว เหมือนการเข้าไปตั้งค่าอุปกรณ์จริงทีละเครื่อง
   ซ่อนแถบนี้เมื่อมี Router ตัวเดียว เพื่อไม่ให้รกในกรณีใช้งานปกติ */
function renderCliRouterPicker() {
    var el = document.getElementById('cliRouterPicker');
    if (!el) return;
    var routers = getAllRouters();
    if (routers.length <= 1) {
        el.classList.add('hidden');
        el.innerHTML = '';
        state.cliRouterId = 'router';
        return;
    }
    el.classList.remove('hidden');
    el.innerHTML = routers.map(function(r) {
        var active = r.id === state.cliRouterId;
        var count = getDeptsOfRouter(r.id).length;
        return '<button onclick="selectCliRouter(\'' + r.id + '\')" class="' + (active ? 'btn-neon' : 'btn-cyber') + ' text-[11px] px-2 py-0.5">' +
            escapeHtml(routerDisplayName(r)) + ' <span class="opacity-70">(' + count + ')</span></button>';
    }).join('');
}

function selectCliRouter(id) {
    state.cliRouterId = id;
    renderCLI();
}

// แถว WAN + static route ต่อท้าย config ของ Router แต่ละตัว
function buildWanSectionHTML(myWan, myRoutes, target) {
    var out = '';
    if (myWan.length > 0) {
        out += '<span class="comment">! --- ลิงก์ WAN (จอง /30 ให้อัตโนมัติ 2 usable address พอดีกับ point-to-point) ---</span>\n';
        myWan.forEach(function(wl, i) {
            out += '<span class="cmd">interface</span> <span class="value">Serial0/' + i + '/0</span>\n' +
                ' <span class="cmd">description</span> <span class="value">WAN to ' + escapeHtml(wl.peerLabel) + '</span>\n' +
                ' <span class="cmd">ip address</span> <span class="value">' + wl.myIp + ' ' + wl.link.netmask + '</span>\n';

            /* สายอนุกรมต้องมีฝั่งหนึ่งจ่ายสัญญาณนาฬิกา (ฝั่ง DCE) อีกฝั่งเป็นฝ่ายรับ (ฝั่ง DTE)
               ถ้าฝั่ง DCE ไม่ตั้ง clock rate สายจะไม่ขึ้นเลย ทั้งที่ใส่ IP ถูกทุกอย่างแล้ว
               ซึ่งเป็นอาการที่หาสาเหตุยากมากเพราะไม่มี error อะไรขึ้นมาบอก
               ฝั่งไหนเป็น DCE ขึ้นกับการเสียบสายจริง ไม่ใช่เรื่องที่คำนวณจากผังได้
               โปรแกรมจึงเดาให้ตามธรรมเนียมห้องแล็บแล้วให้สลับเองได้ (ดู resolveDceEnd ใน wan.js) */
            if (wl.isDce) {
                out += ' <span class="cmd">clock rate</span> <span class="value">' + getWanClockRate() + '</span>\n';
            }
            out += ' <span class="cmd">no shutdown</span>\n';

            if (wl.isDce) {
                out += '<span class="comment">!   ฝั่งนี้เป็น DCE คือฝั่งที่จ่ายสัญญาณนาฬิกา จึงต้องมี clock rate</span>\n';
            } else {
                out += '<span class="comment">!   ฝั่งนี้เป็น DTE คือฝั่งรับสัญญาณนาฬิกา จึงไม่ต้องมี clock rate</span>\n' +
                       '<span class="comment">!   ถ้าเสียบสายกลับด้าน ให้ไปสลับฝั่ง DCE ที่ตาราง WAN ใต้แท็บ IP TABLE</span>\n';
            }
            out += '<span class="comment">!   ปลายทาง ' + escapeHtml(wl.peerLabel) + ' = ' + wl.peerIp + ' (subnet ' + wl.link.network + '/30)</span>\n\n';
        });
    }

    // สาขาที่มีทางออกทางเดียว (stub network) ใช้ default route เป็นมาตรฐานปฏิบัติ
    // อ่านง่ายกว่าและไม่ต้องแก้ทุกครั้งที่สำนักงานใหญ่เพิ่มวงใหม่
    // ส่วนสำนักงานใหญ่ต้องรู้เส้นทางเจาะจงของแต่ละสาขา เพราะมีหลายทางให้เลือก
    // หมายเหตุกำกับแต่ละเส้นทางต้องอยู่ "บรรทัดของตัวเอง" เหนือคำสั่ง ห้ามต่อท้าย
    // IOS ไม่มีคอมเมนต์ท้ายบรรทัด — `!` เป็นคอมเมนต์เฉพาะตอนขึ้นต้นบรรทัดเท่านั้น
    // ถ้าต่อท้าย parser จะอ่านเป็น argument เกินแล้วปฏิเสธทั้งบรรทัด = เส้นทางไม่ถูกเพิ่มจริง
    // (เดิมทั้งสามจุดในบล็อกนี้ต่อท้ายหมด ซึ่งแปลว่า config ส่วน route แปะลงอุปกรณ์ไม่ผ่านเลย)
    if (target.id !== 'router' && myWan.length === 1) {
        out += '<span class="comment">! --- Default Route: สาขานี้มีทางออกทางเดียว จึงชี้ทุกอย่างที่ไม่รู้จักกลับต้นทาง ---</span>\n' +
            '<span class="comment">! ออกทาง ' + escapeHtml(myWan[0].peerLabel) + '</span>\n' +
            '<span class="cmd">ip route</span> <span class="value">0.0.0.0 0.0.0.0 ' + myWan[0].peerIp + '</span>\n\n';
    } else if (myRoutes.length > 0) {
        out += '<span class="comment">! --- Static Route ไปยังเครือข่ายที่อยู่หลัง Router ตัวอื่น ---</span>\n';
        myRoutes.forEach(function(r) {
            out += '<span class="comment">! ' + escapeHtml(r.deptName) + ' ผ่าน ' + escapeHtml(r.via) + '</span>\n' +
                '<span class="cmd">ip route</span> <span class="value">' + r.network + ' ' + r.netmask + ' ' + r.nextHop + '</span>\n';
        });
        out += '\n';
    } else if (myWan.length > 0 && target.id !== 'router') {
        // สาขาที่ยังไม่มีเส้นทางเจาะจง ใช้ default route ชี้กลับสำนักงานใหญ่ ซึ่งเป็นวิธีมาตรฐานของ stub network
        out += '<span class="comment">! --- ยังไม่มีเครือข่ายอื่นให้ route เจาะจง ใช้ default route ชี้กลับต้นทาง ---</span>\n' +
            '<span class="comment">! ออกทาง ' + escapeHtml(myWan[0].peerLabel) + '</span>\n' +
            '<span class="cmd">ip route</span> <span class="value">0.0.0.0 0.0.0.0 ' + myWan[0].peerIp + '</span>\n\n';
    }
    return out;
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

    renderCliRouterPicker();

    // Router ที่กำลังเลือกดู config อยู่ — ค่าปกติคือ Router หลัก
    var target = getAllRouters().find(function(r) { return r.id === state.cliRouterId; }) || topoNodes.router;
    if (!target) return;
    state.cliRouterId = target.id;

    // แผนกที่ Router ตัวนี้ดูแล (Router หลักได้ทุกแผนกที่ไม่มีสาขารับไป — ดู getDeptsOfRouter ใน wan.js)
    var myDepts = getDeptsOfRouter(target.id);
    // โหมด IPv6 ล้วน: state.calculated ว่าง แต่ยังต้องออก config ให้ได้ -> ถอยไปใช้รายชื่อจากฝั่ง v6
    var deptListForCli = myDepts.length > 0 ? myDepts
        : (state.calculated.length === 0 && target.id === 'router' ? state.calculatedV6 : []);

    var myWan = getWanLinksOfRouter(target.id);
    var myRoutes = getStaticRoutesForRouter(target.id);

    // ----- Router Config (คัดลอกไปวางบน Router ได้ทันที ไม่ปนกับ Switch -----
    var cliRouter = '<span class="comment">! ============================================</span>\n' +
        '<span class="comment">! NetForge — Auto-generated Cisco IOS Config (ROUTER)</span>\n' +
        '<span class="comment">! ' + escapeHtml(routerDisplayName(target)) +
            (target.id === 'router' ? ' — Base: ' + state.baseIp + '/' + state.baseCidr : ' — Router สาขา') + '</span>\n' +
        '<span class="comment">! ============================================</span>\n\n' +
        '<span class="cmd">hostname</span> <span class="value">' + escapeHtml(routerHostname(target)) + '</span>\n' +
        // รหัสผ่านนี้เป็นค่าตั้งต้นสำหรับใช้ในห้องแล็บ/Packet Tracer ให้ config รันได้ครบจบในตัว
        // แต่ config ที่ export ออกไปมักถูก copy ต่อโดยไม่ได้อ่านทุกบรรทัด จึงต้องเตือนตรงจุดที่ตาไปหยุด
        // ไม่ใส่ service password-encryption ให้อัตโนมัติ เพราะ type 7 ถอดกลับได้ในไม่กี่วินาที
        // การใส่ไว้จะให้ความรู้สึกปลอดภัยผิด ๆ ซึ่งแย่กว่าการเห็นรหัสเป็นตัวเปล่าแล้วรู้ตัวว่าต้องเปลี่ยน
        '<span class="comment">! รหัสผ่านตัวอย่างสำหรับห้องแล็บเท่านั้น — เปลี่ยนก่อนนำไปใช้กับอุปกรณ์จริงเสมอ</span>\n' +
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

    // ต้องใช้ myDepts ไม่ใช่ state.calculated ทั้งหมด
    // ไม่งั้น Router สาขาจะแจก DHCP และกัน address ของเครือข่ายที่ตัวเองไม่ได้ดูแล
    // ซึ่งบนอุปกรณ์จริงคือการตั้งค่าที่ผิด และทำให้เครื่องปลายทางได้ IP ผิดวง
    if (myDepts.length > 0) {
        cliRouter += '<span class="comment">! --- DHCP Pools (IPv4) ---</span>\n' +
            '<span class="comment">! excluded-address ต้องแยกบรรทัดละช่วง — IOS รับได้แค่ low [high] ต่อหนึ่งคำสั่ง</span>\n';

        // รวม Gateway + Static IP ของ PC/Server ในผัง แล้วยุบเลขที่ติดกันให้เป็นช่วงเดียว
        // เดิมโค้ดต่อ Gateway ทุกแผนกด้วยช่องว่างเป็นบรรทัดเดียว ซึ่งผิด syntax และแปะลง IOS ไม่ผ่าน
        // อีกทั้ง Static IP ที่ผู้ใช้ตั้งให้ PC/Server บน Canvas ไม่เคยถูกกันออกจาก DHCP Pool เลย -> เสี่ยง IP ชนกันจริง
        myDepts.forEach(function(d) {
            var reserved = [ipToLong(d.subnet.firstUsable)]; // Gateway ของ VLAN นี้
            topoNodes.manualNodes.forEach(function(n) {
                if (n.linkedDeptId === d.id && n.ip && isValidIp(n.ip)) reserved.push(ipToLong(n.ip));
            });
            reserved = reserved.filter(function(v, i, a) { return a.indexOf(v) === i; }).sort(function(a, b) { return a - b; });

            // IOS ไม่มีคอมเมนต์ท้ายบรรทัด — `!` เป็นคอมเมนต์เฉพาะเมื่อขึ้นต้นบรรทัดเท่านั้น
            // เดิมต่อ '! ชื่อแผนก' ไว้ท้าย excluded-address ทำให้ parser อ่านเป็น argument เกิน
            // แล้วปฏิเสธทั้งบรรทัด (% Invalid input detected) = address ที่ตั้งใจกันไว้ไม่ถูกกันจริง
            // ย้ายชื่อแผนกมาเป็นคอมเมนต์บรรทัดของตัวเองเหนือกลุ่มของแผนกนั้น ได้ข้อมูลเท่าเดิมแต่แปะได้จริง
            cliRouter += '<span class="comment">! ' + escapeHtml(d.name) + '</span>\n';

            var rangeStart = reserved[0], prev = reserved[0];
            for (var i = 1; i <= reserved.length; i++) {
                if (i < reserved.length && reserved[i] === prev + 1) { prev = reserved[i]; continue; }
                cliRouter += '<span class="cmd">ip dhcp excluded-address</span> <span class="value">' +
                    longToIp(rangeStart) + (prev !== rangeStart ? ' ' + longToIp(prev) : '') + '</span>\n';
                if (i < reserved.length) { rangeStart = reserved[i]; prev = reserved[i]; }
            }
        });
        cliRouter += '\n';

        // ชื่อ pool ผ่าน toCiscoName() เสมอ ห้ามใช้ d.name ดิบ — ดูเหตุผลเต็มที่หัวฟังก์ชันใน ui.js
        var poolNames = buildPoolNames(myDepts);
        myDepts.forEach(function(d) {
            var s = d.subnet;
            var pool = poolNames[d.id];
            // ถ้าชื่อถูกแปลงจนไม่เหมือนเดิม กำกับชื่อจริงไว้ในคอมเมนต์ ไม่งั้นผู้ใช้ที่ตั้งชื่อไทย
            // จะเปิด config มาแล้วไล่ไม่ออกว่า pool ชื่อ DEPT-3 คือแผนกไหน
            // คอมเมนต์ (`!`) ถูก IOS ทิ้งตั้งแต่ตอน parse จึงใส่ภาษาไทยตรงนี้ได้โดยไม่กระทบคำสั่ง
            if (pool !== String(d.name)) {
                cliRouter += '<span class="comment">! ' + escapeHtml(d.name) + '</span>\n';
            }
            cliRouter += '<span class="cmd">ip dhcp pool</span> <span class="value">' + escapeHtml(pool) + '</span>\n' +
                ' <span class="cmd">network</span> <span class="value">' + s.network + ' ' + s.netmask + '</span>\n' +
                ' <span class="cmd">default-router</span> <span class="value">' + s.firstUsable + '</span>\n' +
                ' <span class="cmd">dns-server</span> <span class="value">8.8.8.8</span>\n\n';
        });

        // Static IP ของ PC/Server ตั้งบนตัวเครื่องเอง ไม่ใช่บน Router — แต่ต้องมีรายการกำกับไว้ในเอกสาร config
        // ไม่งั้นงานที่ผู้ใช้จัดไว้บน Canvas ทั้งหมดหายไปจาก output
        var statics = topoNodes.manualNodes.filter(function(n) {
            return n.ip && n.linkedDeptId && myDepts.some(function(d) { return d.id === n.linkedDeptId; });
        });
        if (statics.length > 0) {
            cliRouter += '<span class="comment">! --- Static IP ที่กำหนดไว้บนผัง (ตั้งค่าที่ตัวเครื่องปลายทาง ไม่ใช่บน Router) ---</span>\n';
            statics.forEach(function(n) {
                var dept = myDepts.find(function(d) { return d.id === n.linkedDeptId; });
                if (!dept) return;
                cliRouter += '<span class="comment">!   ' + escapeHtml(n.label) + '  ' + n.ip +
                    '  mask ' + dept.subnet.netmask + '  gw ' + dept.subnet.firstUsable +
                    '  (' + escapeHtml(dept.name) + ')</span>\n';
            });
            cliRouter += '\n';
        }
    }
    cliRouter += buildWanSectionHTML(myWan, myRoutes, target);
    cliRouter += '<span class="cmd">end</span>\n';

    // ----- Switch Config (คัดลอกไปวางบน Switch ได้ทันที ไม่ปนกับ Router) -----
    var cliSwitch = '<span class="comment">! ============================================</span>\n' +
        '<span class="comment">! NetForge — Auto-generated Cisco IOS Config (SWITCH)</span>\n' +
        '<span class="comment">! ============================================</span>\n\n' +
        '<span class="cmd">hostname</span> <span class="value">Switch-01</span>\n\n';
    var allDeptsForSwitch = state.calculated.length > 0 ? state.calculated : state.calculatedV6;
    allDeptsForSwitch.forEach(function(d) {
        var sw = topoNodes.switches.find(function(x) { return x.deptId === d.id; });
        var v = sw ? sw.vlanId : 0;
        cliSwitch += '<span class="cmd">vlan</span> <span class="value">' + v + '</span>\n <span class="cmd">name</span> <span class="value">' + escapeHtml(d.name) + '</span>\n';
    });
    cliSwitch += '\n<span class="cmd">interface</span> <span class="value">GigabitEthernet0/1</span>\n' +
        ' <span class="cmd">description</span> <span class="value">Trunk to Router-01</span>\n' +
        ' <span class="cmd">switchport mode trunk</span>\n\n';
    allDeptsForSwitch.forEach(function(d, i) {
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

/* ---------- โหมดคัดลอกสำหรับวางลง Packet Tracer ----------
   คอมเมนต์ในคำสั่งเป็นภาษาไทย ซึ่งอ่านง่ายมากตอนดูบนหน้าจอและตอนส่งเป็นเอกสาร
   แต่หน้าต่าง CLI ของ Packet Tracer กับสายคอนโซลจริงรับได้เฉพาะอักขระ ASCII
   ถ้าวางข้อความที่มีอักขระไทยลงไป จะได้ตัวอักษรเพี้ยนเต็มหน้าจอ และบางรุ่นจะกินบรรทัดถัดไปหายไปด้วย
   ซึ่งเป็นอาการที่หาสาเหตุยากมากตอนกำลังสาธิตอยู่หน้าห้อง

   โหมดนี้จึงตัดคอมเมนต์ที่มีอักขระนอก ASCII ออกก่อนคัดลอก เหลือเฉพาะบรรทัดที่เป็นคำสั่งจริง
   กับคอมเมนต์ที่เป็นภาษาอังกฤษล้วน ผลลัพธ์วางลง Packet Tracer ได้ตรง ๆ โดยไม่ต้องแก้อะไร */
var cliAsciiOnly = false;

function toggleCliAsciiOnly() {
    cliAsciiOnly = !cliAsciiOnly;
    var btn = document.getElementById('btnCliAscii');
    if (btn) {
        btn.className = (cliAsciiOnly ? 'btn-neon' : 'btn-cyber') + ' text-[12px]';
        btn.title = cliAsciiOnly
            ? 'กำลังคัดลอกแบบตัดคอมเมนต์ภาษาไทยออก เหมาะกับการวางลง Packet Tracer'
            : 'กดเพื่อตัดคอมเมนต์ภาษาไทยออกตอนคัดลอก เวลาจะเอาไปวางใน Packet Tracer';
    }
    showToast(cliAsciiOnly
        ? 'เปลี่ยนเป็นโหมดสำหรับ Packet Tracer แล้ว เวลากดคัดลอกจะตัดคอมเมนต์ภาษาไทยออกให้'
        : 'กลับเป็นโหมดปกติแล้ว เวลากดคัดลอกจะได้คอมเมนต์ภาษาไทยไปด้วย', 'info');
}

// ตัดบรรทัดคอมเมนต์ที่มีอักขระนอก ASCII ออก เก็บบรรทัดคำสั่งไว้ครบทุกบรรทัด
// ตัดเฉพาะบรรทัดที่ขึ้นต้นด้วย ! เท่านั้น บรรทัดคำสั่งจริงไม่มีอักขระไทยอยู่แล้ว
// (มีเทสคุมไว้ใน cli-naming.test.js ว่าคำสั่งต้องเป็น ASCII เสมอ)
function stripNonAsciiComments(text) {
    return String(text).split('\n')
        .filter(function (line) {
            var t = line.trim();
            if (t.charAt(0) !== '!') return true;      // บรรทัดคำสั่ง เก็บไว้เสมอ
            return !/[^\x00-\x7F]/.test(line);          // คอมเมนต์ที่เป็น ASCII ล้วน เก็บไว้ได้
        })
        .join('\n');
}

function copyCLI(target) {
    var elId = target === 'switch' ? 'cliSwitchOutput' : 'cliRouterOutput';
    var label = target === 'switch' ? 'Switch' : 'Router';
    var el = document.getElementById(elId);
    if (!el) return;
    var text = el.innerText;
    if (cliAsciiOnly) text = stripNonAsciiComments(text);
    copyToClipboard(text, 'คัดลอกคำสั่งของ ' + label + ' แล้ว' +
        (cliAsciiOnly ? ' (ตัดคอมเมนต์ภาษาไทยออกให้แล้ว วางลง Packet Tracer ได้เลย)' : ''));
}
