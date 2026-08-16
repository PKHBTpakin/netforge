/* ============================================
   tests/e2e/smoke.spec.js — เทสบนเบราว์เซอร์จริง (Playwright)
   ============================================
   วิธีรัน:  npx playwright install --with-deps chromium  แล้ว  npm run test:e2e

   หลักการเลือกว่าอะไรควรอยู่ในไฟล์นี้:
   **เฉพาะสิ่งที่ชุดเทส Node (tests/*.test.js) ทำไม่ได้เท่านั้น**
   logic ล้วน ๆ เช่นคณิตศาสตร์ VLSM หรือกฎการตั้งชื่อ pool ให้อยู่ในชุดเดิมต่อไป เพราะเร็วกว่า
   หลายสิบเท่าและชี้จุดพังได้ตรงกว่า ไฟล์นี้เอาไว้ตอบคำถามที่ stub ตอบไม่ได้จริง ๆ:

     1. หน้าเว็บโหลดขึ้นไหม สคริปต์ 13 ไฟล์เรียงถูกไหม (stub โหลดเองตามลิสต์ ไม่ได้อ่าน index.html)
     2. CSS ที่ build มา ครอบคลุมคลาสที่ใช้จริงหรือเปล่า (stub ไม่มี CSS เลย)
     3. CSP ที่ประกาศไว้ บล็อกอะไรของตัวเองไปด้วยหรือไม่ (stub ไม่มี CSP)
     4. Canvas วาดออกมาจริงไหม ลากแล้วขยับจริงไหม (stub ใช้ context ปลอมที่ไม่วาดอะไรเลย)
     5. localStorage บน origin http จริง ทำงานเหมือนที่คาดไหม
     6. ปุ่มดาวน์โหลดได้ไฟล์ออกมาจริงไหม

   หมายเหตุ: บั๊กที่เคยหลุดไปเจอ "บนเว็บที่ deploy แล้ว" 12 ข้อ (29-30 ก.ค.) ล้วนอยู่ในหมวด 1-4
   ทั้งสิ้น ทั้งที่ตอนนั้นเทส Node ผ่านครบ — นั่นคือเหตุผลที่ไฟล์นี้มีอยู่
   ============================================ */

const { test, expect } = require('@playwright/test');

/* เก็บ error ของหน้าไว้ตลอดทุกเทส
   แยกสองกอง: pageerror = JS โยน exception จริง / console = ข้อความที่โค้ดหรือเบราว์เซอร์พ่นออกมา
   การละเมิด CSP จะโผล่มาทาง console ในรูปข้อความที่ขึ้นต้นว่า "Refused to ..." เสมอ */
function watchErrors(page) {
    const jsErrors = [];
    const consoleErrors = [];
    page.on('pageerror', e => jsErrors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    return {
        jsErrors,
        consoleErrors,
        csp: () => consoleErrors.filter(t => /Content Security Policy|Refused to/i.test(t))
    };
}

// ปิดหน้าคู่มือที่เด้งขึ้นเองครั้งแรกที่เปิดแอป ไม่งั้นมันบังทุกอย่างที่จะกดต่อ
async function dismissOnboarding(page) {
    const overlay = page.locator('#onboardOverlay');
    if (await overlay.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await expect(overlay).toBeHidden();
    }
}

test.describe('เปิดหน้าเว็บ', () => {

    test('โหลดขึ้นครบ ไม่มี error และไม่โดน CSP บล็อกของตัวเอง', async ({ page }) => {
        const errs = watchErrors(page);
        await page.goto('/index.html');

        // init() ทำงานจบแล้วจะเขียนข้อความลง statusBar — ใช้เป็นสัญญาณว่า app.js รันถึงท้ายจริง
        await expect(page.locator('#statusBar')).toContainText(/Ready|Loaded|กู้คืน/);
        await expect(page).toHaveTitle(/NetForge/);

        // ข้อนี้สำคัญที่สุดของไฟล์: CSP ที่เพิ่งใส่ ต้องไม่บล็อกทรัพยากรของแอปเอง
        expect(errs.csp(), 'CSP บล็อกของที่แอปต้องใช้:\n' + errs.csp().join('\n')).toEqual([]);
        expect(errs.jsErrors, 'JS โยน exception:\n' + errs.jsErrors.join('\n')).toEqual([]);
    });

    test('สคริปต์ทั้ง 13 ไฟล์โหลดครบและเรียงถูก', async ({ page }) => {
        await page.goto('/index.html');
        // ถ้าลำดับใน index.html สลับ ไฟล์ที่โหลดก่อนจะอ้างถึงของที่ยังไม่มี แล้วพังตอน init()
        // เช็คด้วยการถามหาฟังก์ชันตัวแทนจากทุกไฟล์ว่ามีอยู่บน window ครบไหม
        const missing = await page.evaluate(() => {
            const needed = {
                'examples.js': 'loadExample', 'vlsm.js': 'calculateVLSM', 'vlsm6.js': 'calculateIPv6Subnets',
                'devices.js': 'resetVlanRegistry', 'topology.js': 'addManualNode', 'ui.js': 'escapeHtml',
                'wan.js': 'routerHostname', 'cli.js': 'renderCLI', 'tools.js': 'parseCidrText',
                'library.js': 'buildShareUrl', 'history.js': 'clearHistory', 'export.js': 'exportCliTxt',
                'app.js': 'refreshAll'
            };
            return Object.entries(needed).filter(([, fn]) => typeof window[fn] !== 'function').map(([f]) => f);
        });
        expect(missing, 'ไฟล์ที่ฟังก์ชันหลักหายไป').toEqual([]);
    });
});

test.describe('CSS ที่ build มา', () => {

    test('Tailwind ถูกใช้งานจริง ไม่ใช่ไฟล์เปล่า', async ({ page }) => {
        await page.goto('/index.html');
        // ถ้าลืมรัน `npm run build:css` หรือไฟล์โหลดไม่ขึ้น คลาส flex/utility จะไม่มีผลเลย
        const display = await page.locator('header').evaluate(el => getComputedStyle(el).display);
        expect(display).toBe('flex');
    });

    test('พื้นหลังกึ่งโปร่งของ header มีจริง (เคยหายไปเงียบ ๆ)', async ({ page }) => {
        await page.goto('/index.html');
        // เดิมใช้คลาส bg-dark-900/90 ซึ่ง Tailwind สร้างไม่ได้เพราะสีเป็น var() -> ไม่มีพื้นหลังเลย
        // ตอนนี้ย้ายไปใช้ .bg-app-90 (color-mix) ใน style.css แล้ว ต้องได้สีที่ไม่โปร่งสนิท
        const bg = await page.locator('header').evaluate(el => getComputedStyle(el).backgroundColor);
        expect(bg).not.toBe('rgba(0, 0, 0, 0)');
        expect(bg).not.toBe('transparent');
    });

    test('สลับธีมแล้วสีเปลี่ยนจริงและกลับมาเหมือนเดิมได้', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        const bodyBg = () => page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);

        const before = await bodyBg();
        await page.locator('#btnTheme').click();
        const after = await bodyBg();
        expect(after, 'กดสลับธีมแล้วสีพื้นไม่เปลี่ยน').not.toBe(before);

        await page.locator('#btnTheme').click();
        expect(await bodyBg()).toBe(before);
    });
});

test.describe('Canvas', () => {

    test('วาดผังออกมาจริง ไม่ใช่พื้นที่ว่างเปล่า', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('company'); });

        // stub ใน Node ใช้ context ปลอมที่ไม่วาดอะไรเลย จึงไม่มีทางจับข้อนี้ได้
        // อ่านพิกเซลจริงแล้วนับจำนวนสีที่ต่างกัน ถ้าผังวาดขึ้นจริงต้องมีมากกว่าสีพื้นสีเดียว
        const distinctColors = await page.evaluate(() => {
            const c = document.getElementById('topoCanvas');
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            const seen = new Set();
            for (let i = 0; i < d.length; i += 4 * 37) { // สุ่มอ่านแบบกระโดด พอสำหรับนับความหลากหลาย
                seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
                if (seen.size > 5) break;
            }
            return seen.size;
        });
        expect(distinctColors, 'Canvas มีสีเดียวทั้งผืน = ไม่ได้วาดอะไรเลย').toBeGreaterThan(1);
    });

    test('ลากอุปกรณ์แล้วตำแหน่งขยับตาม', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('company'); });

        const posOf = () => page.evaluate(() => ({ x: topoNodes.router.x, y: topoNodes.router.y }));
        const before = await posOf();

        // แปลงพิกัด world -> พิกัดบนจอ แล้วลากด้วยเมาส์จริง (ไม่ได้เรียกฟังก์ชันภายใน)
        const box = await page.locator('#topoCanvas').boundingBox();
        const screen = await page.evaluate(() => {
            const c = document.getElementById('topoCanvas');
            const r = c.getBoundingClientRect();
            const scale = r.width / c.width;
            return { x: (topoNodes.router.x * viewZoom + viewPanX) * scale, y: (topoNodes.router.y * viewZoom + viewPanY) * scale };
        });

        await page.mouse.move(box.x + screen.x, box.y + screen.y);
        await page.mouse.down();
        await page.mouse.move(box.x + screen.x + 60, box.y + screen.y + 40, { steps: 8 });
        await page.mouse.up();

        const after = await posOf();
        expect(after.x !== before.x || after.y !== before.y, 'ลากแล้ว Router ไม่ขยับ').toBe(true);
    });
});

test.describe('การเก็บข้อมูลบน origin จริง', () => {

    test('Autosave กู้คืนได้หลังรีเฟรช', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        // scheduleAutosave() หน่วง 600ms ก่อนเขียนจริง (กันเขียนรัวตอนผู้ใช้พิมพ์)
        // ต้องรอให้พ้นช่วงนั้นก่อนรีเฟรช ไม่งั้นเทสจะพังแบบสุ่มทั้งที่โค้ดถูก
        await page.evaluate(() => { loadExample('company'); scheduleAutosave(); });
        await page.waitForTimeout(900);

        await page.reload();
        const count = await page.evaluate(() => state.departments.length);
        expect(count, 'รีเฟรชแล้วข้อมูลหาย').toBe(6);
    });

    test('ลิงก์แชร์เปิดงานเดิมได้จาก URL จริง', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        const url = await page.evaluate(() => {
            state.departments = [{ id: 1, name: 'ฝ่ายทดสอบ', hosts: 42 }];
            refreshAll();
            return buildShareUrl();
        });

        // เปิดเป็นหน้าใหม่ทั้งหน้า ให้ tryLoadFromUrl() ทำงานจากศูนย์เหมือนคนที่ได้ลิงก์ไป
        await page.goto(url);
        const dept = await page.evaluate(() => state.departments[0]);
        expect(dept.name).toBe('ฝ่ายทดสอบ');   // ชื่อไทยต้องรอด base64 ไป-กลับ
        expect(dept.hosts).toBe(42);
    });
});

test.describe('Export', () => {

    test('ปุ่มบันทึก CSV ได้ไฟล์ออกมาจริง', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('company'); });

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.evaluate(() => exportTableCSV())
        ]);
        expect(download.suggestedFilename()).toMatch(/^netforge-ip-plan-.*\.csv$/);
    });

    test('ปุ่มบันทึกรูปผังได้ไฟล์ .png ออกมาจริง', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('company'); });

        // toBlob() ของ Canvas เป็น async และไม่มีใน stub เลย — ข้อนี้ทดสอบได้เฉพาะบนเบราว์เซอร์จริง
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.evaluate(() => exportTopologyPNG())
        ]);
        expect(download.suggestedFilename()).toMatch(/^netforge-topology-.*\.png$/);
    });
});

test.describe('ผังหลาย Router', () => {

    test('ตัวอย่างพร้อมผังโหลดแล้วได้สาขาครบ ต่อสายครบ', async ({ page }) => {
        const errs = watchErrors(page);
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('branch2'); });

        const info = await page.evaluate(() => ({
            branches: getBranchRouters().length,
            wan: state.wanLinks.length,
            orphans: getOrphanBranchRouters().length
        }));
        expect(info.branches).toBe(2);
        expect(info.wan).toBe(2);
        expect(info.orphans, 'ตัวอย่างต้องต่อสายมาให้ครบ ไม่ควรมี Router ที่ยังลอย').toBe(0);
        expect(errs.jsErrors).toEqual([]);
    });

    test('ปุ่มสลับฝั่ง DCE ย้ายคำสั่ง clock rate ไปอีกฝั่งจริง', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('branch2'); });

        // ค่าเริ่มต้น: Router หลักเป็นฝั่งจ่ายสัญญาณนาฬิกา
        await page.locator('.tab-btn[data-tab="cli"]').click();
        await expect(page.locator('#cliRouterOutput')).toContainText('clock rate 64000');

        // ปุ่มสลับอยู่ในตาราง WAN ซึ่งอยู่ใต้แท็บ IP TABLE
        await page.locator('.tab-btn[data-tab="table"]').click();
        await expect(page.locator('#wanPanel')).toContainText('DCE');
        await page.locator('#wanPanel button').first().click();

        // สลับแล้ว Router หลักต้องเหลือ clock rate น้อยลงหนึ่งสาย
        const counts = await page.evaluate(() => {
            const strip = h => String(h).replace(/<[^>]*>/g, '');
            selectCliRouter('router'); renderCLI();
            const hq = (strip(document.getElementById('cliRouterOutput').innerHTML)
                .match(/^ *clock rate /gm) || []).length;
            selectCliRouter(getBranchRouters()[0].id); renderCLI();
            const br = (strip(document.getElementById('cliRouterOutput').innerHTML)
                .match(/^ *clock rate /gm) || []).length;
            return { hq, br };
        });
        expect(counts.hq, 'สำนักงานใหญ่ควรเหลือ clock rate สายเดียว').toBe(1);
        expect(counts.br, 'สาขาที่ถูกสลับควรได้ clock rate มาแทน').toBe(1);
    });

    test('วาง Router สาขาแล้วขึ้นเตือน และเตือนหายเมื่อเชื่อม', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('small'); });

        // วางผ่านปุ่มจริงแล้วคลิกบน Canvas จริง — เส้นทางเดียวกับที่ผู้ใช้เจอปัญหา
        await page.locator('#btnAddRouter').click();
        const box = await page.locator('#topoCanvas').boundingBox();
        await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.35);

        expect(await page.evaluate(() => getOrphanBranchRouters().length)).toBe(1);
        // แผงรายละเอียดต้องเปิดขึ้นเองพร้อมวิธีแก้ ไม่ใช่ให้ผู้ใช้ไปหาเอง
        await expect(page.locator('#detailContent')).toContainText('ยังใช้งานไม่ได้');
        await expect(page.locator('#detailContent')).toContainText('Connect');

        await page.evaluate(() => {
            const br = getBranchRouters()[0];
            addLink('router', br.id);
            refreshAll();
            selectNode(br.id, 'router-branch');
        });
        expect(await page.evaluate(() => getOrphanBranchRouters().length)).toBe(0);
        await expect(page.locator('#detailContent')).not.toContainText('ยังใช้งานไม่ได้');
    });
});

test.describe('รูปแปลนอาคาร', () => {

    test('ปุ่มแปลนเปิดแผงและมีปุ่มเลือกรูป', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);

        await expect(page.locator('#backdropPanel')).toBeHidden();
        await page.locator('#btnBackdrop').click();
        await expect(page.locator('#backdropPanel')).toBeVisible();
        await expect(page.locator('#backdropBody')).toContainText('เลือกรูป');
    });

    test('ใส่รูปแล้ววาดลงผังและติดไปกับไฟล์ที่บันทึก', async ({ page }) => {
        const errs = watchErrors(page);
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('small'); });

        // สร้างรูปจริงในเบราว์เซอร์แล้วยิงเข้า input file — ครอบเส้นทางย่อ/เข้ารหัสจริงทั้งเส้น
        // ซึ่ง stub ใน Node ทำไม่ได้เลยเพราะไม่มี Canvas จริงและไม่มี FileReader จริง
        await page.setInputFiles('#backdropFileInput', {
            name: 'floorplan.png',
            mimeType: 'image/png',
            // PNG 1x1 สีขาว
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
        });

        await expect.poll(() => page.evaluate(() => hasBackdrop())).toBe(true);
        const src = await page.evaluate(() => state.backdrop.src);
        expect(src.startsWith('data:image/jpeg'), 'ต้องถูกเข้ารหัสใหม่เป็น JPEG ไม่ใช่เก็บไฟล์ต้นฉบับดิบ ๆ').toBe(true);

        // ต้องอยู่ใน snapshot ที่บันทึก แต่ต้องไม่อยู่ในลิงก์แชร์
        expect(await page.evaluate(() => !!buildProjectSnapshot().backdrop)).toBe(true);
        expect(await page.evaluate(() => snapshotForShare().backdrop)).toBe(null);
        expect(await page.evaluate(() => buildShareUrl().length)).toBeLessThan(30000);

        expect(errs.jsErrors).toEqual([]);
        expect(errs.csp(), 'การอ่านไฟล์รูปต้องไม่ชน CSP').toEqual([]);
    });
});

test.describe('โครงหน้าจอต้องไม่มีอะไรบังกัน', () => {

    /* บั๊กที่เจอจากการใช้จริง และเทสชุดเดิมจับไม่ได้เลย:
       แถบสถานะล่างเคยเป็น position:absolute bottom-0 จึงลอยทับเนื้อหาแถวล่างสุดราว 30px
       ผู้ใช้เลื่อนจนสุดแล้วก็ยังอ่านบรรทัดท้ายไม่ได้ เพราะมันถูกบัง ไม่ใช่เพราะเลื่อนไม่ถึง
       และความสูงพื้นที่ทำงานเคยตั้งเป็น calc(100vh - 56px) โดยเดาว่าแถบบนสูง 56px เป๊ะ
       ซึ่งไม่จริงเมื่อปุ่มตัดขึ้นบรรทัดใหม่บนจอแคบ
       เทสนี้วัดตำแหน่งจริงบนจอ จึงเป็นด่านเดียวที่จับเรื่องแบบนี้ได้ */

    test('แถบสถานะไม่ทับแผงล่าง และทุกอย่างอยู่ในจอพอดี', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('enterprise'); });

        const box = await page.evaluate(() => {
            const panel = document.getElementById('bottomPanel').getBoundingClientRect();
            const status = document.getElementById('statusBar').parentElement.getBoundingClientRect();
            return { panelBottom: panel.bottom, statusTop: status.top, statusBottom: status.bottom, winH: window.innerHeight };
        });
        expect(box.panelBottom, 'ขอบล่างของแผงต้องไม่เลยขอบบนของแถบสถานะ').toBeLessThanOrEqual(box.statusTop + 1);
        expect(box.statusBottom, 'แถบสถานะต้องอยู่ในจอ ไม่ล้นลงไปข้างล่าง').toBeLessThanOrEqual(box.winH + 1);
    });

    test('ปุ่มบนแถบเครื่องมือตัดบรรทัดแล้วเนื้อหายังอยู่ในจอ', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        // บีบหน้าต่างให้แคบจนปุ่มด้านบนต้องตัดขึ้นบรรทัดใหม่ ซึ่งเป็นเงื่อนไขที่ทำให้ของเดิมพัง
        await page.setViewportSize({ width: 900, height: 700 });
        await page.evaluate(() => { loadExample('enterprise'); });

        const fits = await page.evaluate(() => {
            const header = document.querySelector('header').getBoundingClientRect();
            const status = document.getElementById('statusBar').parentElement.getBoundingClientRect();
            return { headerH: header.height, statusBottom: status.bottom, winH: window.innerHeight };
        });
        expect(fits.headerH, 'ตั้งใจให้แถบบนตัดบรรทัดจริงในเทสนี้').toBeGreaterThan(56);
        expect(fits.statusBottom, 'ถึงแถบบนจะสูงขึ้น แถบสถานะก็ยังต้องอยู่ในจอ').toBeLessThanOrEqual(fits.winH + 1);
    });

    test('เลื่อนจนสุดแล้วต้องเห็นบรรทัดสุดท้ายจริง ๆ', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('branch2'); });   // มีตาราง WAN + คำอธิบายท้ายสุด

        await page.locator('#btnPanelMax').click();
        // เลื่อนกล่องเนื้อหาลงจนสุด แล้วดูว่าบรรทัดสุดท้ายโผล่พ้นแถบสถานะไหม
        const visible = await page.evaluate(() => {
            const box = document.getElementById('tab-table');
            box.scrollTop = box.scrollHeight;
            const kids = box.querySelectorAll('div');
            const last = kids[kids.length - 1].getBoundingClientRect();
            const status = document.getElementById('statusBar').parentElement.getBoundingClientRect();
            return { lastBottom: last.bottom, boxBottom: box.getBoundingClientRect().bottom, statusTop: status.top };
        });
        expect(visible.lastBottom, 'บรรทัดสุดท้ายต้องไม่โดนแถบสถานะบัง')
            .toBeLessThanOrEqual(visible.statusTop + 1);
        expect(visible.lastBottom, 'บรรทัดสุดท้ายต้องอยู่ในกรอบที่เลื่อนถึง')
            .toBeLessThanOrEqual(visible.boxBottom + 1);
    });
});

test.describe('แผงล่างต้องอ่านข้อมูลได้ครบ', () => {

    // ปัญหาที่เจอจากการใช้จริง: แผงล่างสูงคงที่ ทำให้ตารางยาว ๆ ถูกตัดจนอ่านไม่ครบ
    // เทสนี้วัด "แถวสุดท้ายของตารางอยู่ในกรอบที่มองเห็นจริงไหม" ซึ่ง stub ใน Node ทำไม่ได้
    test('ตาราง IP ยาว ๆ อ่านครบได้หลังกดปุ่มขยาย', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('enterprise'); });   // 8 แผนก ตารางยาวสุด

        const lastRow = page.locator('#ipTableBody tr').last();
        await expect(lastRow).toBeVisible();

        // ก่อนขยาย: แถวสุดท้ายควรอยู่นอกกรอบที่มองเห็น (ต้องเลื่อนถึงจะเห็น)
        const panel = page.locator('#bottomPanel');
        const before = await panel.evaluate(el => el.getBoundingClientRect().height);

        await page.locator('#btnPanelMax').click();
        const after = await panel.evaluate(el => el.getBoundingClientRect().height);
        expect(after, 'กดขยายแล้วแผงต้องสูงขึ้นจริง').toBeGreaterThan(before);

        // แถวสุดท้ายต้องอยู่ในกรอบของแผงจริง ๆ ไม่ใช่แค่มีอยู่ใน DOM
        const fits = await page.evaluate(() => {
            const rows = document.querySelectorAll('#ipTableBody tr');
            const last = rows[rows.length - 1].getBoundingClientRect();
            const box = document.getElementById('tab-table').getBoundingClientRect();
            return last.bottom <= box.bottom + 1;
        });
        expect(fits, 'หลังขยายแล้วแถวสุดท้ายต้องอยู่ในกรอบที่มองเห็น').toBe(true);
    });

    test('แท็บฝึกทำโจทย์ขยายแผงให้เองและอ่านเฉลยได้ครบ', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);

        const h0 = await page.locator('#bottomPanel').evaluate(el => el.getBoundingClientRect().height);
        await page.locator('.tab-btn[data-tab="practice"]').click();
        const h1 = await page.locator('#bottomPanel').evaluate(el => el.getBoundingClientRect().height);
        expect(h1, 'เข้าแท็บฝึกแล้วแผงต้องขยายให้เอง').toBeGreaterThan(h0);

        // ระดับยากสุด (7 แผนก) แล้วกดดูเฉลย ซึ่งเป็นเนื้อหาที่ยาวที่สุดในแอป
        await page.getByRole('button', { name: 'เริ่มทำโจทย์' }).click();
        await page.getByRole('button', { name: 'ยาก', exact: true }).click();
        await page.getByRole('button', { name: /ดูเฉลย/ }).click();

        // ตารางวิธีคิดทีละขั้นต้องมีครบ 7 แถว และเลื่อนไปอ่านแถวสุดท้ายได้
        await expect(page.locator('#practiceBody')).toContainText('วิธีคิดทีละขั้น');
        const stepRows = await page.evaluate(() => practiceState.problem.answer.length);
        expect(stepRows).toBe(7);

        const lastStep = page.locator('#practiceBody table').last().locator('tbody tr').last();
        await lastStep.scrollIntoViewIfNeeded();
        await expect(lastStep).toBeVisible();

        // ออกจากแท็บแล้วต้องย่อกลับให้เอง
        await page.locator('.tab-btn[data-tab="table"]').click();
        const h2 = await page.locator('#bottomPanel').evaluate(el => el.getBoundingClientRect().height);
        expect(Math.abs(h2 - h0), 'ออกจากแท็บฝึกแล้วต้องกลับความสูงเดิม').toBeLessThan(5);
    });
});

test.describe('โหมดฝึกทำโจทย์', () => {

    test('ออกโจทย์ กรอกถูกทุกช่อง แล้วได้คะแนนเต็ม', async ({ page }) => {
        const errs = watchErrors(page);
        await page.goto('/index.html');
        await dismissOnboarding(page);

        await page.locator('.tab-btn[data-tab="practice"]').click();
        await expect(page.locator('#practiceBody')).toContainText('ฝึกคำนวณ VLSM ด้วยตัวเอง');

        await page.getByRole('button', { name: 'เริ่มทำโจทย์' }).click();
        await expect(page.locator('#practiceBody')).toContainText('โจทย์');

        // กรอกคำตอบผ่านช่องกรอกจริงบนหน้าจอ ไม่ใช่ยัดค่าเข้า state ตรง ๆ
        const answers = await page.evaluate(() => practiceState.problem.answer.map(a => ({
            id: a.id, net: a.subnet.network, cidr: String(a.subnet.cidr),
            first: a.subnet.firstUsable, last: a.subnet.lastUsable, bc: a.subnet.broadcast
        })));
        for (const a of answers) {
            const row = page.locator('tr').filter({ has: page.locator(`input[oninput*="(${a.id},"]`) }).first();
            const boxes = row.locator('input');
            await boxes.nth(0).fill(a.net);
            await boxes.nth(1).fill(a.cidr);
            await boxes.nth(2).fill(a.first);
            await boxes.nth(3).fill(a.last);
            await boxes.nth(4).fill(a.bc);
        }

        await page.getByRole('button', { name: /ตรวจคำตอบ/ }).click();
        await expect(page.locator('#practiceBody')).toContainText('ถูกหมดทุกช่อง');
        expect(errs.jsErrors).toEqual([]);
    });

    test('ตอบผิดแล้วได้คำอธิบายว่าพลาดขั้นตอนไหน', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.locator('.tab-btn[data-tab="practice"]').click();
        await page.getByRole('button', { name: 'เริ่มทำโจทย์' }).click();

        // กรอกขนาดเล็กเกินไปหนึ่งช่อง ที่เหลือปล่อยว่าง
        const first = await page.evaluate(() => {
            const a = practiceState.problem.answer[0];
            return { id: a.id, tooSmall: String(a.subnet.cidr + 1) };
        });
        const row = page.locator('tr').filter({ has: page.locator(`input[oninput*="(${first.id},"]`) }).first();
        await row.locator('input').nth(1).fill(first.tooSmall);
        await page.getByRole('button', { name: /ตรวจคำตอบ/ }).click();

        await expect(page.locator('#practiceBody')).toContainText('ขนาดที่ให้เล็กเกินไป');
        await expect(page.locator('#practiceBody')).toContainText('ต้องบวกอีก 2 เบอร์');
    });

    test('เอาโจทย์ไปทำต่อเป็นงานจริงแล้วผลตรงกับเฉลย', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.locator('.tab-btn[data-tab="practice"]').click();
        await page.getByRole('button', { name: 'เริ่มทำโจทย์' }).click();

        const expected = await page.evaluate(() =>
            practiceState.problem.answer.map(a => a.subnet.network + '/' + a.subnet.cidr).sort().join(','));

        await page.getByRole('button', { name: /เอาโจทย์นี้ไปทำต่อ/ }).click();

        // ต้องสลับกลับไปแท็บตาราง และผังต้องถูกสร้างขึ้นจริง
        await expect(page.locator('#tab-table')).toBeVisible();
        const got = await page.evaluate(() =>
            state.calculated.map(d => d.subnet.network + '/' + d.subnet.cidr).sort().join(','));
        expect(got).toBe(expected);
        expect(await page.evaluate(() => topoNodes.switches.length)).toBeGreaterThan(0);
    });
});

test.describe('CLI บนหน้าจอจริง', () => {

    test('แท็บ CLI แสดง config ที่แปะลงอุปกรณ์ได้', async ({ page }) => {
        await page.goto('/index.html');
        await dismissOnboarding(page);
        await page.evaluate(() => { loadExample('company'); });
        await page.locator('.tab-btn[data-tab="cli"]').click();

        const text = await page.locator('#cliRouterOutput').innerText();
        expect(text).toContain('hostname Router-01');
        expect(text).toContain('ip dhcp pool');

        // กฎเดียวกับ tests/cli-naming.test.js แต่ตรวจบนข้อความที่ผู้ใช้เห็น/คัดลอกจริง
        // (innerText ผ่านการ render ของเบราว์เซอร์แล้ว ต่างจาก innerHTML ที่เทส Node อ่าน)
        const badLines = text.split('\n')
            .filter(l => l.trim() && l.trim()[0] !== '!' && l.trim().indexOf('description ') !== 0)
            .filter(l => l.includes('!'));
        expect(badLines, 'มีคอมเมนต์ต่อท้ายบรรทัดคำสั่ง IOS จะปฏิเสธทั้งบรรทัด').toEqual([]);
    });
});
