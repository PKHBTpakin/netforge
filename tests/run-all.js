/* ============================================
   tests/run-all.js — รันชุดทดสอบทั้งหมดในคำสั่งเดียว
   ใช้:  node tests/run-all.js
   คืน exit code 1 ถ้ามีไฟล์ไหน fail (เอาไปต่อ CI ได้ทันที)

   ทำไมทุกไฟล์ในโฟลเดอร์นี้ต้องใช้ process.exitCode ไม่ใช่ process.exit()
   (7 ต.ค. 2569 — ห้ามเปลี่ยนกลับโดยไม่อ่านย่อหน้านี้ก่อน)

   process.exit() สั่งให้ Node จบทันทีโดยไม่รอให้ stdout เขียนออกไปจนครบ
   ตอนรันไฟล์เทสตรง ๆ ในเทอร์มินัล stdout เป็น TTY ซึ่งเขียนแบบรอจนเสร็จ จึงไม่เคยเห็นปัญหา
   แต่ตอนถูกเรียกจากไฟล์นี้ stdout เป็น pipe ซึ่งเขียนแบบไม่รอ ข้อความท้าย ๆ จึงหายได้

   อาการที่เจอจริง: library-util.test.js (stdout 23,288 ไบต์ มากที่สุดในชุด)
   รายงานกลับมาเป็น "ไม่พบบรรทัดสรุปผล" เป็นครั้งคราว ทำให้ยอดรวมขาดไป 172 ข้อ
   กลายเป็น 573/745 ทั้งที่ทุกไฟล์ผ่านหมดและ exit code เป็น 0

   พิสูจน์ด้วยสคริปต์จำลองที่พิมพ์แล้ว process.exit() เหมือนกัน รันอย่างละ 20 รอบ:
     23 KB -> หาย 1 ครั้ง · 128 KB -> หาย 1 ครั้ง · 256 KB -> หาย 20 ครั้ง · 512 KB -> หาย 20 ครั้ง
   เปลี่ยนเป็น process.exitCode แล้วรันแบบเดียวกัน หายไป 0 ครั้งทุกขนาด

   ที่อันตรายกว่ายอดรวมเพี้ยนคือ ถ้าโดนตอนมีเทส fail จริง บรรทัด FAIL อาจหายไปด้วย
   แล้วบรรทัดสรุปจะขึ้นว่า ok ทั้งที่มีข้อไม่ผ่าน
   ชุดทดสอบ tests/device-model.test.js หมวด G ล็อกเรื่องนี้ไว้แล้ว
   ============================================ */

const { execFileSync } = require('child_process');
const path = require('path');

const FILES = ['save-load.test.js', 'ui-stability.test.js', 'regression-fixes.test.js', 'library-util.test.js', 'ux-features.test.js', 'cli-naming.test.js', 'scenarios.test.js', 'labguide.test.js', 'wording.test.js', 'practice-steps.test.js'];

let failed = 0, totalPass = 0, totalAll = 0;

FILES.forEach(function (f) {
    let out = '', ok = true;
    try {
        out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
    } catch (e) {
        ok = false;
        out = (e.stdout || '') + (e.stderr || '');
    }

    const summary = (out.match(/(\d+)\/(\d+) passed/) || []);
    if (summary.length) { totalPass += Number(summary[1]); totalAll += Number(summary[2]); }

    const fails = out.split('\n').filter(l => l.indexOf('FAIL') === 0);
    console.log((ok && fails.length === 0 ? '  ok  ' : ' FAIL ') + f + '  —  ' + (summary[0] || 'ไม่พบบรรทัดสรุปผล'));
    fails.forEach(l => console.log('        ' + l));
    if (!ok || fails.length) failed++;
});

console.log('\nรวม ' + totalPass + '/' + totalAll + ' assertions — ' + (failed === 0 ? 'ผ่านทั้งหมด' : failed + ' ไฟล์มีปัญหา'));
// จบด้วย process.exitCode ไม่ใช่การสั่งให้โปรเซสตายทันที — เหตุผลเต็มอยู่ใน tests/run-all.js
process.exitCode = failed === 0 ? 0 : 1;
