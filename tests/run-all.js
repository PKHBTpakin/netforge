/* ============================================
   tests/run-all.js — รันชุดทดสอบทั้งหมดในคำสั่งเดียว
   ใช้:  node tests/run-all.js
   คืน exit code 1 ถ้ามีไฟล์ไหน fail (เอาไปต่อ CI ได้ทันที)
   ============================================ */

const { execFileSync } = require('child_process');
const path = require('path');

const FILES = ['save-load.test.js', 'ui-stability.test.js', 'regression-fixes.test.js', 'library-util.test.js', 'ux-features.test.js'];

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
process.exit(failed === 0 ? 0 : 1);
