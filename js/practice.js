/* ============================================
   8. โหมดฝึกทำโจทย์ — ให้ผู้ใช้คำนวณเอง แล้วโปรแกรมตรวจให้
   ============================================
   ทำไมต้องมีโหมดนี้:
   ส่วนอื่นของโปรแกรมทำงานแทนผู้ใช้ทั้งหมด ซึ่งดีเวลาต้องการผลลัพธ์เร็ว แต่ถ้าเป้าหมายคือ "เข้าใจ"
   การได้คำตอบมาเลยกลับไม่ช่วยอะไร เพราะไม่ได้ผ่านขั้นตอนคิดด้วยตัวเอง
   โหมดนี้จึงกลับทิศทาง: โปรแกรมออกโจทย์ ผู้ใช้คำนวณเอง แล้วโปรแกรมตรวจทีละช่อง
   พร้อมบอกว่าพลาดที่ขั้นตอนไหนของ 5 ขั้นที่อธิบายไว้ในคู่มือ ไม่ใช่แค่บอกว่าผิด

   จุดออกแบบที่สำคัญที่สุด:
   เฉลยมาจาก solveVLSM() ใน vlsm.js ซึ่งเป็นฟังก์ชันตัวเดียวกับที่ใช้คำนวณงานจริง
   ไม่ได้เขียนโค้ดเฉลยขึ้นมาใหม่ จึงไม่มีทางที่เฉลยจะไม่ตรงกับสิ่งที่โปรแกรมทำจริง
   ถ้าวันหนึ่งแก้เครื่องคำนวณ เฉลยจะเปลี่ยนตามเองอัตโนมัติ
   ============================================ */

/* ---------- ระดับความยาก ----------
   ค่าพวกนี้เลือกมาให้โจทย์ "แก้ได้จริงเสมอ" ไม่ใช่สุ่มลอย ๆ แล้วหวังว่าจะพอดี
   generatePracticeProblem() ตรวจซ้ำอีกชั้นว่าโจทย์ที่สุ่มได้จัดสรรครบทุกแผนกจริง ก่อนส่งออกไป */
const PRACTICE_LEVELS = {
    easy: {
        label: 'ง่าย',
        detail: '3 แผนก บนช่วง /24 ตัวเลขลงตัวสวย เหมาะกับการทำครั้งแรก',
        deptCount: 3, baseCidr: 24, hostRange: [10, 50]
    },
    medium: {
        label: 'ปานกลาง',
        detail: '5 แผนก บนช่วง /23 เริ่มมีขนาดที่ปัดขึ้นแล้วเหลือเศษเยอะ',
        deptCount: 5, baseCidr: 23, hostRange: [8, 120]
    },
    hard: {
        label: 'ยาก',
        detail: '7 แผนก บนช่วง /22 ขนาดต่างกันมาก ต้องระวังลำดับการจัดสรรเป็นพิเศษ',
        deptCount: 7, baseCidr: 22, hostRange: [5, 250]
    }
};

// ชื่อแผนกสำหรับสุ่มโจทย์ ใช้ชื่อที่ IOS รับได้อยู่แล้วเพื่อไม่ให้เรื่องชื่อมากวนสมาธิจากการคำนวณ
const PRACTICE_DEPT_NAMES = [
    'Sales', 'Marketing', 'Finance', 'HR', 'IT-Support', 'Warehouse', 'Production',
    'QA-Lab', 'Research', 'Customer-Care', 'Logistics', 'Security'
];

// ช่วง IP ตั้งต้นที่หยิบมาสุ่ม ทั้งหมดอยู่ในช่วงสำหรับเครือข่ายภายในตาม RFC 1918
const PRACTICE_BASES = ['192.168.0.0', '192.168.10.0', '10.10.0.0', '10.50.0.0', '172.16.0.0', '172.20.0.0'];

var practiceState = {
    level: 'easy',
    problem: null,   // { baseIp, baseCidr, departments:[{id,name,hosts}], answer:[...] }
    answers: {},     // deptId -> { network, cidr, first, last, broadcast }
    checked: false,
    revealed: false,
    score: null      // { correct, total, byDept:{} }
};

/* ---------- สุ่มโจทย์ ---------- */

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generatePracticeProblem(levelKey) {
    var lv = PRACTICE_LEVELS[levelKey] || PRACTICE_LEVELS.easy;

    // สุ่มไม่เกิน 40 รอบ ถ้ายังได้โจทย์ที่จัดสรรไม่ครบก็ถอยไปใช้ชุดที่คำนวณขนาดมาแล้วว่าพอแน่
    // ป้องกันวนไม่รู้จบในกรณีที่ค่าความยากถูกแก้ในอนาคตจนสุ่มยังไงก็ไม่พอดี
    for (var attempt = 0; attempt < 40; attempt++) {
        var baseIp = PRACTICE_BASES[randInt(0, PRACTICE_BASES.length - 1)];
        var names = PRACTICE_DEPT_NAMES.slice().sort(function () { return Math.random() - 0.5; });
        var depts = [];
        for (var i = 0; i < lv.deptCount; i++) {
            depts.push({ id: i + 1, name: names[i], hosts: randInt(lv.hostRange[0], lv.hostRange[1]) });
        }
        var solved = solveVLSM(baseIp, lv.baseCidr, depts);
        // ต้องจัดสรรได้ครบทุกแผนก ไม่งั้นผู้ใช้จะเจอโจทย์ที่ไม่มีคำตอบ ซึ่งไม่ใช่สิ่งที่ต้องการฝึกในโหมดนี้
        if (solved.failed.length === 0 && solved.results.length === lv.deptCount) {
            return {
                baseIp: normalizeNetwork(baseIp, lv.baseCidr),
                baseCidr: lv.baseCidr,
                departments: depts,
                answer: solved.results
            };
        }
    }

    // ทางถอย: ใช้ขนาดเล็กคงที่ซึ่งพอแน่นอนบน /24
    var fallbackDepts = [];
    for (var j = 0; j < lv.deptCount; j++) {
        fallbackDepts.push({ id: j + 1, name: PRACTICE_DEPT_NAMES[j], hosts: 10 });
    }
    var fb = solveVLSM('192.168.0.0', 24, fallbackDepts);
    return { baseIp: '192.168.0.0', baseCidr: 24, departments: fallbackDepts, answer: fb.results };
}

/* ---------- ตรวจคำตอบ ----------
   ตรวจทีละช่อง ไม่ใช่ตรวจทั้งแถวแล้วบอกว่าผิด เพราะผู้ใช้ที่คิดถูก 4 ช่องผิดช่องเดียว
   ควรได้รู้ว่าพลาดตรงไหน ไม่ใช่โดนตีว่าผิดทั้งแถว */

/* เทียบ IP โดยไม่ถือสาเรื่องรูปแบบการพิมพ์
   ตัดช่องว่างหัวท้าย และตัดเลขศูนย์นำหน้าออก เช่น 192.168.001.000 ถือว่าตรงกับ 192.168.1.0

   ทำไมต้องผ่อนตรงนี้ ทั้งที่ isValidIp() ของแอปเข้มกว่านี้:
   ช่องกรอกในโหมดฝึกวัด "ความเข้าใจเรื่องการแบ่ง Subnet" ไม่ได้วัดว่าพิมพ์ IP ตามรูปแบบมาตรฐานเป็นไหม
   คนที่คิดถูกทุกขั้นแต่พิมพ์ 001 ตามความเคยชิน ไม่ควรถูกตัดว่าผิด
   ส่วนช่องกรอกของงานจริงยังใช้ isValidIp() ที่เข้มเหมือนเดิม เพราะที่นั่นค่าจะถูกเอาไปสร้างคำสั่งจริง */
function samePracticeIp(a, b) {
    var t = String(a === null || a === undefined ? '' : a).trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return false;
    // ตัดศูนย์นำหน้าทีละส่วน แล้วค่อยส่งให้ตัวตรวจมาตรฐานอีกชั้น
    var norm = t.split('.').map(function (x) { return String(parseInt(x, 10)); }).join('.');
    if (!isValidIp(norm)) return false;
    return ipToLong(norm) === ipToLong(b);
}

function checkPracticeAnswers() {
    if (!practiceState.problem) return;
    var byDept = {};
    var correct = 0, total = 0;

    practiceState.problem.answer.forEach(function (a) {
        var given = practiceState.answers[a.id] || {};
        var fields = {
            network: samePracticeIp(given.network, a.subnet.network),
            cidr: String(given.cidr || '').trim().replace(/^\//, '') === String(a.subnet.cidr),
            first: samePracticeIp(given.first, a.subnet.firstUsable),
            last: samePracticeIp(given.last, a.subnet.lastUsable),
            broadcast: samePracticeIp(given.broadcast, a.subnet.broadcast)
        };
        Object.keys(fields).forEach(function (k) { total++; if (fields[k]) correct++; });
        byDept[a.id] = { fields: fields, hint: practiceHintFor(a, given, fields) };
    });

    practiceState.checked = true;
    practiceState.score = { correct: correct, total: total, byDept: byDept };
    renderPractice();

    var pct = total > 0 ? Math.round(correct / total * 100) : 0;
    showToast('ตรวจแล้ว ถูก ' + correct + ' จาก ' + total + ' ช่อง คิดเป็น ' + pct + ' เปอร์เซ็นต์',
        pct === 100 ? 'success' : 'info');
}

/* ไล่เลขสองยกกำลังให้เห็นว่าทำไมต้องปัดขึ้นเป็นขนาดนี้ ไม่ใช่ขนาดอื่น
   คืนเฉพาะสองขั้นสุดท้าย คือตัวที่ยังไม่พอ กับตัวที่พอ เพราะไล่ตั้งแต่ 4 จะยาวเกินอ่าน
   แยกเป็นฟังก์ชันเดี่ยวเพราะทั้งคำใบ้และเฉลยเรียกใช้ร่วมกัน แก้ที่เดียวเปลี่ยนทั้งสองที่ */
function practicePow2Trace(need) {
    var steps = [];
    for (var k = 2; k <= 20; k++) {
        var val = Math.pow(2, k);
        steps.push({ exp: k, val: val, ok: val >= need });
        if (val >= need) break;
    }
    return steps.slice(-2);
}

function practicePow2Text(need) {
    return practicePow2Trace(need).map(function (s) {
        return '2 ยกกำลัง ' + s.exp + ' = ' + s.val + (s.ok ? ' พอ' : ' ไม่พอ');
    }).join(' · ');
}

/* บอกว่าพลาดที่ขั้นตอนไหน แทนที่จะบอกแค่ว่าผิด
   ไล่ตรวจจากสาเหตุที่ "ต้นทาง" ที่สุดก่อน เพราะถ้าขนาดผิดตั้งแต่แรก ช่องอื่นจะผิดตามหมด
   การบอกว่าผิด 4 ช่องทั้งที่พลาดเรื่องเดียวจะทำให้ผู้ใช้ท้อโดยไม่จำเป็น */
function practiceHintFor(ans, given, fields) {
    if (fields.network && fields.cidr && fields.first && fields.last && fields.broadcast) return null;

    var wantSize = ans.subnet.size;
    var need = ans.hosts + 2;
    var hostBits = 32 - ans.subnet.cidr;
    var gotCidr = parseInt(String(given.cidr || '').replace(/^\//, ''), 10);

    if (!fields.cidr) {
        if (!isFinite(gotCidr)) {
            return 'ยังไม่ได้กรอกขนาด หรือกรอกในรูปแบบที่อ่านไม่ออก ให้ใส่เป็นตัวเลขหลังเครื่องหมายทับ เช่น 27';
        }
        // กันค่านอกช่วงก่อนเอาไปเข้าสูตร ไม่งั้น Math.pow จะได้เลขประหลาดไปโชว์ผู้ใช้
        if (gotCidr < 1 || gotCidr > 32) {
            return 'เลขหลังเครื่องหมายทับต้องอยู่ระหว่าง 1 ถึง 32 เท่านั้น เพราะหมายเลข IP มีทั้งหมด 32 บิต · คุณใส่ ' + gotCidr;
        }
        var why = 'ขั้นที่ 1 เรื่องขนาด ยังไม่ผ่าน · ' +
            'แผนกนี้ขอ ' + ans.hosts + ' เครื่อง ต้องบวกอีก 2 ให้ Network Address กับ Broadcast Address รวมเป็น ' + need + ' หมายเลข · ' +
            'ปัดขึ้นเป็นเลขสองยกกำลังที่ครอบได้ ' + practicePow2Text(need) + ' · ' +
            'จึงกัน ' + hostBits + ' บิตไว้ไล่นับเครื่อง แล้วเอา 32 ลบ ' + hostBits + ' ได้ /' + ans.subnet.cidr;
        var gotSize = Math.pow(2, 32 - gotCidr);
        return why + ' · คุณใส่ /' + gotCidr + ' ซึ่งมี ' + gotSize + ' หมายเลข ' +
               (gotCidr > ans.subnet.cidr ? 'เล็กเกินไป' : 'ใหญ่เกินจำเป็น');
    }

    if (!fields.network) {
        return 'ขั้นที่ 2 เรื่องจุดเริ่ม ยังไม่ผ่าน · ขนาด /' + ans.subnet.cidr + ' ถูกแล้ว · ' +
               'แผนกนี้ต้องเริ่มที่หมายเลขถัดจาก Broadcast Address ของแผนกก่อนหน้าพอดี ห้ามเว้นช่องว่างและห้ามทับกัน · ' +
               'อีกข้อคือจุดเริ่มต้องหารด้วยขนาด ' + wantSize + ' ลงตัวเสมอ · คำตอบที่ถูกคือ ' + ans.subnet.network;
    }

    if (!fields.broadcast) {
        return 'ขั้นที่ 3 เรื่อง Broadcast ยังไม่ผ่าน · Broadcast Address คือหมายเลขสุดท้ายของช่วง · ' +
               'คิดจาก Network บวกขนาดแล้วลบหนึ่ง คือ ' + ans.subnet.network + ' บวก ' + wantSize +
               ' ลบ 1 เท่ากับ ' + ans.subnet.broadcast;
    }

    if (!fields.first || !fields.last) {
        return 'ขั้นที่ 4 เรื่องช่วงที่จ่ายให้เครื่อง ยังไม่ผ่าน · ' +
               'Host แรก คือ Network บวกหนึ่ง ได้ ' + ans.subnet.firstUsable + ' · ' +
               'Host สุดท้าย คือ Broadcast ลบหนึ่ง ได้ ' + ans.subnet.lastUsable + ' · ' +
               'จ่ายให้เครื่องได้จริง ' + (wantSize - 2) + ' หมายเลข ซึ่งพอกับ ' + ans.hosts + ' เครื่องที่ขอมา';
    }

    return null;
}

/* ---------- การกระทำจากหน้าจอ ---------- */

function startPractice(levelKey) {
    if (levelKey && PRACTICE_LEVELS[levelKey]) practiceState.level = levelKey;
    practiceState.problem = generatePracticeProblem(practiceState.level);
    practiceState.answers = {};
    practiceState.checked = false;
    practiceState.revealed = false;
    practiceState.score = null;
    renderPractice();
    showToast('ออกโจทย์ใหม่แล้ว ระดับ' + PRACTICE_LEVELS[practiceState.level].label +
        ' ลองคำนวณเองก่อนกดตรวจนะครับ', 'info');
}

function onPracticeInput(deptId, field, value) {
    if (!practiceState.answers[deptId]) practiceState.answers[deptId] = {};
    practiceState.answers[deptId][field] = value;
    // ไม่ตรวจทันทีระหว่างพิมพ์ เพราะจะเป็นการเฉลยไปในตัวและทำให้ไม่ได้คิดเอง
}

function revealPracticeAnswer() {
    if (!practiceState.problem) return;
    practiceState.revealed = true;
    if (!practiceState.checked) checkPracticeAnswers();
    else renderPractice();
    showToast('เปิดเฉลยแล้ว ลองอ่านทีละขั้นว่าต่างจากที่คิดไว้ตรงไหน', 'info');
}

// ย้ายโจทย์ที่ฝึกอยู่ไปเป็นงานจริงบนหน้าหลัก เพื่อดูผังและคำสั่งที่ได้จากโจทย์ข้อนี้
function usePracticeProblemAsProject() {
    if (!practiceState.problem) return;
    if (typeof pushHistory === 'function') pushHistory('ใช้โจทย์ฝึกเป็นงานจริง');
    var p = practiceState.problem;
    state.baseIp = p.baseIp;
    state.baseCidr = p.baseCidr;
    resetVlanRegistry();
    resetWanRegistry();
    resetManualTopology();
    state.departments = p.departments.map(function (d) {
        return { id: state.nextId++, name: d.name, hosts: d.hosts };
    });
    document.getElementById('baseIpInput').value = p.baseIp;
    document.getElementById('baseCidrInput').value = p.baseCidr;
    refreshAll(true);
    switchTab('table');
    showToast('ย้ายโจทย์ข้อนี้มาเป็นงานจริงแล้ว ดูผังและคำสั่งที่ได้ต่อได้เลย', 'success');
}

/* ---------- แสดงผล ---------- */

function renderPractice() {
    var el = document.getElementById('practiceBody');
    if (!el) return;

    var levelBtns = Object.keys(PRACTICE_LEVELS).map(function (k) {
        var active = practiceState.level === k;
        return '<button onclick="startPractice(\'' + k + '\')" class="' + (active ? 'btn-neon' : 'btn-cyber') +
            ' text-[12px] px-3 py-1">' + PRACTICE_LEVELS[k].label + '</button>';
    }).join('');

    var headerHtml =
        '<div class="flex items-center gap-2 flex-wrap mb-2">' +
            '<span class="text-subtle text-[11px] tracking-wider">ระดับความยาก</span>' + levelBtns +
            '<button onclick="startPractice()" class="btn-cyber text-[12px] px-3 py-1 ml-auto">' +
                '<i class="fas fa-rotate mr-1" aria-hidden="true"></i>สุ่มโจทย์ใหม่</button>' +
        '</div>' +
        '<div class="text-subtle text-[11px] mb-3">' + escapeHtml(PRACTICE_LEVELS[practiceState.level].detail) + '</div>';

    if (!practiceState.problem) {
        el.innerHTML = headerHtml +
            '<div class="glow-border rounded p-4 text-center">' +
                '<div class="text-[14px] mb-2" style="color:var(--text);">ฝึกคำนวณ VLSM ด้วยตัวเอง</div>' +
                '<div class="text-muted text-[12px] leading-relaxed mb-3">' +
                    'โปรแกรมจะออกโจทย์ให้ แล้วให้คุณคำนวณเอง เสร็จแล้วกดตรวจ<br>' +
                    'ถ้าตอบผิด จะบอกด้วยว่าพลาดที่ขั้นตอนไหน ไม่ใช่แค่บอกว่าผิด' +
                '</div>' +
                '<button onclick="startPractice()" class="btn-neon text-[13px]">เริ่มทำโจทย์</button>' +
            '</div>';
        return;
    }

    var p = practiceState.problem;
    var sc = practiceState.score;

    // ตารางโจทย์: เรียงตามชื่อแผนกที่ผู้ใช้เห็น ไม่ได้เรียงตามลำดับเฉลย
    // เพราะการเรียงจากใหญ่ไปเล็กคือส่วนหนึ่งของสิ่งที่ต้องคิดเอง ถ้าเรียงให้ก็เท่ากับใบ้ข้อแรกไปแล้ว
    var rows = p.departments.map(function (d) {
        var ans = p.answer.find(function (a) { return a.id === d.id; });
        var res = sc && sc.byDept[d.id];
        var given = practiceState.answers[d.id] || {};

        var cell = function (field, placeholder, correctValue) {
            var ok = res && res.fields[field];
            var cls = 'input-cyber w-full text-[12px]';
            var style = '';
            if (practiceState.checked) {
                style = ok ? 'border-color:var(--ok);' : 'border-color:var(--hot);';
            }
            return '<td class="py-1 pr-2">' +
                '<input type="text" value="' + escapeHtml(given[field] || '') + '" placeholder="' + placeholder + '" ' +
                    'class="' + cls + '" style="' + style + '" ' +
                    'oninput="onPracticeInput(' + d.id + ',\'' + field + '\',this.value)" ' +
                    'aria-label="' + escapeHtml(d.name) + ' ' + placeholder + '">' +
                (practiceState.revealed
                    ? '<div class="text-[11px] mt-0.5" style="color:var(--ok);">' + correctValue + '</div>'
                    : '') +
            '</td>';
        };

        /* คำอธิบายจะขึ้นเฉพาะแถวที่ "ลงมือตอบแล้วแต่ผิด" เท่านั้น
           แถวที่ปล่อยว่างทั้งแถวไม่ต้องขึ้น เพราะจะได้ข้อความเดียวกันซ้ำทุกแถว
           ตอนกดตรวจโดยยังไม่กรอกอะไรเลย ซึ่งกินพื้นที่ไปหลายร้อยพิกเซลโดยไม่ให้ข้อมูลอะไรเพิ่ม
           (โจทย์ระดับยากมี 7 แถว = คำอธิบายซ้ำ 7 บรรทัด ยาวกว่าตัวตารางเองอีก) */
        var answeredSomething = ['network', 'cidr', 'first', 'last', 'broadcast']
            .some(function (k) { return String(given[k] || '').trim() !== ''; });
        var hintRow = '';
        if (practiceState.checked && res && res.hint && answeredSomething) {
            hintRow = '<tr><td colspan="6" class="pb-2">' +
                '<div class="text-[11px] rounded px-2 py-1.5" style="background:rgba(240,160,32,0.1);border:1px solid rgba(240,160,32,0.4);color:var(--text);">' +
                    '<i class="fas fa-lightbulb mr-1" aria-hidden="true" style="color:var(--warn);"></i>' + escapeHtml(res.hint) +
                '</div></td></tr>';
        }

        return '<tr class="border-t border-dark-600">' +
            '<td class="py-1 pr-2 align-top">' +
                '<div class="text-[13px]" style="color:var(--text);">' + escapeHtml(d.name) + '</div>' +
                '<div class="text-subtle text-[11px]">' + d.hosts + ' เครื่อง</div></td>' +
            cell('network', 'Network', ans.subnet.network) +
            cell('cidr', '/xx', '/' + ans.subnet.cidr) +
            cell('first', 'Host แรกที่ใช้ได้', ans.subnet.firstUsable) +
            cell('last', 'Host สุดท้ายที่ใช้ได้', ans.subnet.lastUsable) +
            cell('broadcast', 'Broadcast', ans.subnet.broadcast) +
        '</tr>' + hintRow;
    }).join('');

    var scoreHtml = '';
    if (sc) {
        var pct = sc.total > 0 ? Math.round(sc.correct / sc.total * 100) : 0;
        var color = pct === 100 ? 'var(--ok)' : (pct >= 60 ? 'var(--warn)' : 'var(--hot)');
        /* ถ้ากดตรวจโดยยังไม่กรอกอะไรเลย ต้องบอกตรง ๆ ว่ายังไม่ได้ตอบ
           ไม่ใช่บอกว่า "ดูคำอธิบายใต้แถวที่ผิด" ทั้งที่ตอนนี้ไม่มีคำอธิบายขึ้นสักแถว */
        var blank = p.departments.every(function (d) {
            var g = practiceState.answers[d.id] || {};
            return ['network', 'cidr', 'first', 'last', 'broadcast']
                .every(function (k) { return String(g[k] || '').trim() === ''; });
        });
        scoreHtml =
            '<div class="rounded p-3 mb-3" style="background:var(--item-bg);border:1px solid var(--border);">' +
                '<span class="text-[15px] font-bold" style="color:' + color + ';">ถูก ' + sc.correct + ' จาก ' + sc.total + ' ช่อง (' + pct + '%)</span>' +
                (blank
                    ? '<span class="text-muted text-[12px] ml-2">ยังไม่ได้กรอกคำตอบสักช่อง ลองเติมในตารางด้านล่างแล้วกดตรวจอีกครั้ง</span>'
                    : pct === 100
                        ? '<span class="text-[12px] ml-2" style="color:var(--ok);">ถูกหมดทุกช่อง ลองเพิ่มระดับความยากดูได้</span>'
                        : '<span class="text-muted text-[12px] ml-2">ดูคำอธิบายใต้แถวที่ผิด แล้วแก้แล้วกดตรวจใหม่ได้</span>') +
            '</div>';
    }

    el.innerHTML = headerHtml +
        '<div class="glow-border rounded p-3 mb-3">' +
            '<div class="text-[13px] mb-1" style="color:var(--text);">' +
                '<b>โจทย์</b> องค์กรหนึ่งได้รับช่วง IP <span class="text-neon font-mono">' + p.baseIp + '/' + p.baseCidr + '</span> ' +
                'ให้แบ่งให้ครบทุกแผนกตามจำนวนเครื่องที่ระบุ โดยใช้พื้นที่อย่างประหยัดที่สุด</div>' +
            '<div class="text-subtle text-[11px]">เติมคำตอบลงในตารางด้านล่าง ' +
                'ช่องขนาดให้ใส่เป็นตัวเลขหลังเครื่องหมายทับ เช่น 27</div>' +
        '</div>' +

        scoreHtml +

        '<div class="overflow-x-auto"><table class="w-full text-[13px] min-w-[820px]">' +
        '<thead><tr class="text-neon text-left">' +
            '<th class="pb-2 pr-2">แผนก</th><th class="pb-2 pr-2">Network</th><th class="pb-2 pr-2">ขนาด</th>' +
            '<th class="pb-2 pr-2">Host แรกที่ใช้ได้</th><th class="pb-2 pr-2">Host สุดท้ายที่ใช้ได้</th><th class="pb-2">Broadcast</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +

        '<div class="flex gap-2 mt-3 flex-wrap">' +
            '<button onclick="checkPracticeAnswers()" class="btn-neon text-[13px]">' +
                '<i class="fas fa-check mr-1" aria-hidden="true"></i>ตรวจคำตอบ</button>' +
            '<button onclick="revealPracticeAnswer()" class="btn-cyber text-[13px]">' +
                '<i class="fas fa-eye mr-1" aria-hidden="true"></i>ดูเฉลย</button>' +
            '<button onclick="usePracticeProblemAsProject()" class="btn-cyber text-[13px]">' +
                '<i class="fas fa-arrow-right mr-1" aria-hidden="true"></i>เอาโจทย์นี้ไปทำต่อเป็นงานจริง</button>' +
        '</div>' +

        (practiceState.revealed ? renderPracticeSteps() : '');
}

/* อธิบายวิธีคิดทีละขั้นของโจทย์ข้อนี้ ไม่ใช่แค่โชว์คำตอบ
   ใช้ลำดับเดียวกับ 5 ขั้นในคู่มือ เพื่อให้ผู้ใช้เชื่อมโยงกับสิ่งที่อ่านมาแล้วได้ */
function renderPracticeSteps() {
    var p = practiceState.problem;
    if (!p || !p.answer || !p.answer.length) return '';

    var orderLine = p.answer.map(function (a) {
        return escapeHtml(a.name) + ' ' + a.hosts;
    }).join('  >  ');

    /* การ์ดอธิบาย 6 ขั้นของแต่ละแผนก เรียงตามลำดับที่จัดสรรจริง
       ทุกค่ามาจาก a.subnet ที่ solveVLSM() คำนวณให้ ไม่ได้คิดเลขใหม่เอง
       เฉลยจึงไม่มีทางขัดกับสิ่งที่ระบบหลักทำ */
    var cards = p.answer.map(function (a, i) {
        var need = a.hosts + 2;
        var bits = 32 - a.subnet.cidr;
        var prev = i > 0 ? p.answer[i - 1] : null;
        var aligned = (ipToLong(a.subnet.network) % a.subnet.size) === 0;

        var row = function (no, title, body) {
            return '<tr class="align-top" style="border-top:1px solid var(--border);">' +
                '<td class="py-2 pr-3 text-subtle whitespace-nowrap align-top">ขั้น ' + no + '</td>' +
                '<td class="py-2 pr-4 whitespace-nowrap align-top" style="color:var(--text);">' + title + '</td>' +
                '<td class="py-2 leading-relaxed" style="color:var(--text);">' + body + '</td></tr>';
        };

        return '<div class="rounded p-3 mb-3" style="background:var(--item-bg);border:1px solid var(--border);">' +
            '<div class="text-[17px] mb-2" style="color:var(--text);">' +
                '<b>' + escapeHtml(a.name) + '</b> <span class="text-subtle">' + a.hosts + ' เครื่อง</span> ' +
                '<span class="text-neon">ลำดับที่ ' + (i + 1) + ' จาก ' + p.answer.length + '</span></div>' +
            '<table class="w-full text-[16px]"><tbody>' +
            row(1, 'ทำไมได้คิวนี้', i === 0
                ? 'ใช้เครื่องมากที่สุดในโจทย์ จึงต้องจัดสรรก่อน'
                : 'รองลงมาจาก ' + escapeHtml(prev.name) + ' ที่มี ' + prev.hosts + ' เครื่อง') +
            row(2, 'ต้องการเท่าไหร่', '<span class="font-mono">' + a.hosts + ' + 2 = ' + need + '</span> เผื่อ Network กับ Broadcast') +
            row(3, 'ปัดขึ้นเป็น', '<span class="font-mono">' + practicePow2Text(need) + '</span> จึงกัน ' + bits + ' บิตไว้นับเครื่อง') +
            row(4, 'เลขทับ', '<span class="font-mono">32 − ' + bits + ' = /' + a.subnet.cidr + '</span> คือ ' + a.subnet.netmask) +
            row(5, 'วางตรงไหน', (prev
                ? 'ถัดจาก Broadcast ของ ' + escapeHtml(prev.name) + ' (<span class="font-mono">' + prev.subnet.broadcast + '</span>)'
                : 'แผนกแรก เริ่มที่ต้นช่วงที่ได้รับมา') +
                ' → <span class="font-mono">' + a.subnet.network + '</span>' +
                (aligned ? ' <span class="text-subtle">หารด้วย ' + a.subnet.size + ' ลงตัว</span>' : '')) +
            row(6, 'เติม 5 ช่อง',
                '<div class="py-0.5"><span class="font-mono">Network ' + a.subnet.network + '</span> <span class="text-subtle">ตัวแรกของช่วง</span></div>' +
                '<div class="py-0.5"><span class="font-mono">Host แรก ' + a.subnet.firstUsable + '</span> <span class="text-subtle">ตัวแรก + 1</span></div>' +
                '<div class="py-0.5"><span class="font-mono">Host สุดท้าย ' + a.subnet.lastUsable + '</span> <span class="text-subtle">ตัวสุดท้าย − 1</span></div>' +
                '<div class="py-0.5"><span class="font-mono">Broadcast ' + a.subnet.broadcast + '</span> <span class="text-subtle">' +
                    a.subnet.network + ' + ' + a.subnet.size + ' − 1</span></div>') +
            '</tbody></table></div>';
    }).join('');

    /* ===== ตารางสรุปเดิม คงไว้ทั้งก้อน ไม่ได้แก้อะไรเลย ===== */
    var lines = p.answer.map(function (a, i) {
        var need = a.hosts + 2;
        return '<tr class="border-t border-dark-600">' +
            '<td class="py-1 pr-2 text-subtle">' + (i + 1) + '</td>' +
            '<td class="py-1 pr-2">' + escapeHtml(a.name) + '</td>' +
            '<td class="py-1 pr-2" style="color:var(--text);">' + a.hosts + ' + 2 = ' + need + '</td>' +
            '<td class="py-1 pr-2" style="color:var(--text);">ปัดขึ้นเป็น ' + a.subnet.size + '</td>' +
            '<td class="py-1 pr-2 text-neon font-mono">/' + a.subnet.cidr + '</td>' +
            '<td class="py-1 font-mono">' + a.subnet.network + ' ถึง ' + a.subnet.broadcast + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="glow-border rounded p-3 mt-3">' +
        '<div class="text-[17px] mb-2" style="color:var(--text);"><b>วิธีคิดทีละขั้น</b></div>' +
        '<div class="text-[14px] mb-3 leading-relaxed" style="color:var(--text);">' +
            'ขั้นแรกของทุกโจทย์คือเรียงจากแผนกใหญ่ไปเล็ก &nbsp;<span class="font-mono" style="color:var(--text);">' + orderLine + '</span><br>' +
            'เพราะช่วงใหญ่ต้องวางก่อน ถ้าแจกตัวเล็กก่อนจะเกิดช่องว่างแทรกที่ช่วงใหญ่ลงไม่ได้' +
        '</div>' + cards +
        '<div class="overflow-x-auto mt-1"><table class="w-full text-[14px] min-w-[640px]">' +
        '<thead><tr class="text-muted text-left"><th class="pb-1 pr-2">ลำดับ</th><th class="pb-1 pr-2">แผนก</th>' +
        '<th class="pb-1 pr-2">ต้องการจริง</th><th class="pb-1 pr-2">ขนาดที่ได้</th><th class="pb-1 pr-2">คือ</th>' +
        '<th class="pb-1">ช่วงที่ได้</th></tr></thead><tbody>' + lines + '</tbody></table></div>' +
        '</div>';
}
