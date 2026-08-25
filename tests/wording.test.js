/* ============================================
   tests/wording.test.js — คำศัพท์ที่ผู้ใช้เห็นบนหน้าจอ (25 ส.ค. 2569)
   ============================================
   วิธีรัน:   node tests/wording.test.js
   ต้องมี:    Node.js เท่านั้น ไม่ต้อง npm install

   ทำไมต้องมีไฟล์นี้ (อ่านก่อนลบ/ย้าย):

   หน้าจอเคยใช้คำที่แปลตรงตัวจากอังกฤษ ซึ่งไม่มีใครในสาขาใช้จริง และค้นหาต่อไม่เจอ
   ผู้จัดทำเองยังอ่านหัวข้อในหน้ากฎการคำนวณแล้วไม่เข้าใจว่าหมายถึงอะไร

     "วง"                  ที่จริงคือ subnet
     "เบอร์"                ที่จริงคือ IP
     "สายอนุกรม"            ที่จริงคือ สาย Serial
     "สัญญาณนาฬิกา"         ที่จริงคือ clock rate
     "กำลังสอง"             แปลผิดความหมาย ภาษาไทยแปลว่ายกกำลัง 2 (4, 9, 16, 25)
                            แต่ที่ต้องการสื่อคือ 2 ยกกำลัง n (2, 4, 8, 16, 32)

   ปัญหานี้จับด้วยข้อทดสอบแบบ "ต้องมีสิ่งนี้อยู่" ไม่ได้เลย เพราะข้อความก็แสดงผลได้ปกติ
   ไม่มี error ไม่มีอะไรพัง แค่คนอ่านไม่เข้าใจ จึงต้องถามกลับด้านว่า
   "ต้องไม่มีคำเหล่านี้หลงเหลืออยู่ในไฟล์ใดเลย"

   ครอบคลุม:
   W. ไม่มีคำที่แปลตรงตัวหลงเหลือใน index.html และ js/*.js
   T. ศัพท์เฉพาะทางที่ถูกต้องปรากฏจริงในหน้าจอ (กันการลบคำผิดทิ้งเฉย ๆ โดยไม่ใส่คำถูกแทน)
   ============================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['index.html'].concat(
    fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
);

/* คำไทยที่ถูกต้องซึ่งบังเอิญมีคำต้องห้ามเป็นส่วนประกอบ ต้องยกเว้นไว้ก่อนตรวจ
   ไม่งั้น "ล่วงหน้า" กับ "วงจรปิด" จะถูกจับว่าเป็นคำว่า "วง" ที่แปลว่า subnet */
const ALLOW = ['ล่วงหน้า', 'วงจรปิด', 'วงวน', 'วงลูป', 'ม่วง', 'แล้วงง', 'ช่วง', 'บ่วง', 'ร่วง'];

const BANNED = [
    { word: 'วง',            should: 'subnet' },
    { word: 'เบอร์',          should: 'IP หรือ หมายเลข' },
    { word: 'อนุกรม',         should: 'Serial' },
    { word: 'สัญญาณนาฬิกา',   should: 'clock rate' },
    { word: 'กำลังสอง',       should: '2 ยกกำลัง n' },
    { word: 'กำลังของสอง',    should: '2 ยกกำลัง n' }
];

const results = [];
function check(label, cond, detail) {
    results.push({ label, pass: !!cond, detail: detail !== undefined ? String(detail) : '' });
}

/* ===== W. ต้องไม่มีคำที่แปลตรงตัวหลงเหลือ ===== */

function scrub(line) {
    let s = line;
    ALLOW.forEach(w => { s = s.split(w).join(''); });
    return s;
}

BANNED.forEach(function (b, i) {
    const hits = [];
    FILES.forEach(function (f) {
        const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
        lines.forEach(function (ln, n) {
            if (scrub(ln).indexOf(b.word) !== -1) hits.push(f + ':' + (n + 1));
        });
    });
    check('W' + (i + 1) + ': ไม่มีคำว่า "' + b.word + '" เหลืออยู่ ต้องใช้ ' + b.should + ' แทน',
        hits.length === 0, hits.slice(0, 5).join(', ') || '-');
});

/* ===== T. คำที่ถูกต้องต้องอยู่บนหน้าจอจริง =====
   กันกรณีแก้ปัญหาด้วยการลบประโยคทิ้งไปเลย ซึ่งจะทำให้ W ผ่านแต่ผู้ใช้เสียข้อมูล */

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rules = html.slice(html.indexOf('id="help-rules"'), html.indexOf('id="help-rules"') + 9000);

const MUST = [
    ['Network Address', 'ชื่อเรียก IP หมายเลขแรกของ subnet'],
    ['Broadcast Address', 'ชื่อเรียก IP หมายเลขสุดท้ายของ subnet'],
    ['subnet', 'คำแทน "วง"'],
    ['clock rate', 'คำสั่งที่ต้องใส่ฝั่ง DCE'],
    ['DCE', 'ฝั่งที่ต้องมี clock rate'],
    ['DTE', 'ฝั่งตรงข้ามของ DCE'],
    ['Serial', 'ชนิดของสายที่เชื่อม Router สองตัว'],
    ['SLAAC', 'เหตุผลที่ IPv6 ต้องเป็น /64']
];
MUST.forEach(function (m, i) {
    check('T' + (i + 1) + ': หน้ากฎการคำนวณพูดถึง ' + m[0] + ' (' + m[1] + ')',
        rules.indexOf(m[0]) !== -1);
});

// หัวข้อที่ผู้จัดทำอ่านแล้วไม่เข้าใจ ต้องเปลี่ยนไปแล้วจริง ๆ ไม่ใช่แค่แก้เนื้อความข้างใน
check('T9: หัวข้อบอกขนาด subnet ด้วยตัวเลขจริง ไม่ใช้ศัพท์คณิตศาสตร์',
    rules.indexOf('ขนาด subnet มีให้เลือกแค่ 2, 4, 8, 16, 32, 64') !== -1);
check('T10: หัวข้อ clock rate ระบุชัดว่าใส่ที่ฝั่ง DCE',
    rules.indexOf('clock rate ใส่ที่ฝั่ง DCE ฝั่งเดียว') !== -1);

// หน้าเริ่มใช้งานต้องบอกวิธีดูว่าฝั่งไหนเป็น DCE ใน Packet Tracer
// เดิมบอกแค่ว่า "โปรแกรมเดาให้" ซึ่งไม่ช่วยตอนผู้ใช้ยืนอยู่หน้า Packet Tracer จริง
check('T11: หน้าเริ่มใช้งานบอกวิธีระบุฝั่ง DCE ใน Packet Tracer',
    html.indexOf('อุปกรณ์ตัวที่คุณคลิกก่อน') !== -1);

/* ===== สรุปผล ===== */
let pass = 0;
results.forEach(function (r) {
    if (r.pass) { pass++; console.log('  ok  ' + r.label); }
    else console.log('FAIL  ' + r.label + (r.detail ? '   [' + r.detail + ']' : ''));
});
console.log('\n' + pass + '/' + results.length + ' passed');
process.exit(pass === results.length ? 0 : 1);
