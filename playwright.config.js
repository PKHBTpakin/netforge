/* ============================================
   playwright.config.js — ตั้งค่าเทสที่รันบนเบราว์เซอร์จริง
   ============================================
   ชุดเทสใน tests/*.test.js รันบน Node ล้วนโดย stub DOM/Canvas ขึ้นมาเอง ซึ่งเร็วมากและครอบ logic
   ได้ลึก แต่ตามนิยามแล้วมันไม่ใช่เบราว์เซอร์ ของที่ stub จับไม่ได้เลยมีอยู่จริงและเคยหลุดมาแล้ว:
     - บั๊ก 9 ข้อ (29 ก.ค.) และอีก 3 ข้อ (30 ก.ค.) เจอ "จากการใช้งานจริงบนเว็บที่ deploy แล้ว"
       ทั้งที่ตอนนั้นเทส Node ผ่านหมด
     - เลย์เอาต์จริง, การวาดลง Canvas จริง, ลำดับการโหลดสคริปต์, CSS ที่ build มาครบหรือไม่,
       และ CSP ที่เพิ่งใส่เข้าไป — สี่อย่างนี้ stub ไม่มีทางรู้เรื่องเลย
   ไฟล์นี้จึงเป็นตาข่ายชั้นที่สอง ไม่ได้มาแทนชุดเดิม

   วิธีรันครั้งแรก:
     npm install
     npx playwright install --with-deps chromium
     npm run test:e2e

   ============================================ */

const { defineConfig, devices } = require('@playwright/test');

const PORT = 8000;
const BASE_URL = 'http://127.0.0.1:' + PORT;

module.exports = defineConfig({
    testDir: './tests/e2e',
    // เทสในไฟล์เดียวกันแชร์ localStorage ของ origin เดียวกัน ถ้ารันขนานกันจะกวนกันเอง
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : [['list']],

    use: {
        baseURL: BASE_URL,
        // เก็บ trace ไว้เฉพาะตอนที่ retry แล้วยังพัง — ไฟล์ใหญ่ ไม่ต้องเก็บทุกครั้ง
        trace: 'on-first-retry',
        screenshot: 'only-on-failure'
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
        // เพิ่ม firefox / webkit ได้ตามต้องการ แต่ต้องรัน `npx playwright install` ให้ครบก่อน
        // และเวลารันใน CI จะนานขึ้นราวสามเท่า จึงยังไม่เปิดไว้เป็นค่าเริ่มต้น
    ],

    // ต้องเสิร์ฟผ่าน http จริง ไม่ใช่ file:// เพราะพฤติกรรมของ localStorage บน file://
    // ไม่ได้ถูกกำหนดในมาตรฐาน (ดูหัวข้อ "ทำไมไม่ควรเปิดด้วย file://" ใน README)
    // python3 มีติดมากับ ubuntu-latest ของ GitHub Actions อยู่แล้ว ไม่ต้องลงเพิ่ม
    webServer: {
        command: 'python3 -m http.server ' + PORT,
        url: BASE_URL + '/index.html',
        reuseExistingServer: !process.env.CI,
        timeout: 30 * 1000
    }
});
