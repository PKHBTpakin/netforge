/* ============================================
   7. Backdrop — รูปพื้นหลังผัง (แปลนอาคาร)
   ============================================
   วางรูปแปลนอาคารไว้ใต้ผัง แล้วลากอุปกรณ์ไปทับตำแหน่งจริงในตึกได้ ทำให้ผังตอบคำถามเพิ่มอีกข้อ
   ที่ผังลอย ๆ ตอบไม่ได้: "Switch ตัวนี้ต้องไปติดตั้งตรงไหนของอาคาร"

   ---------- เรื่องขนาดไฟล์ ซึ่งเป็นหัวใจของโมดูลนี้ ----------
   โปรเจกต์ทั้งชิ้นเดิมมีขนาดราว 2 KB จึงเก็บลง localStorage ได้เป็นพันชิ้น (ดู README)
   รูปถ่ายจากมือถือทุกวันนี้ไฟล์ละ 3-8 MB ถ้าเก็บดิบ ๆ ลงไปตรง ๆ จะเกิดสามอย่างพร้อมกัน:
     1. localStorage เต็ม (เพดานราว 5 MB) -> เซฟไม่ได้ทั้งโปรเจกต์ ไม่ใช่แค่รูป
     2. คลังโปรเจกต์เก็บได้ไม่ถึงสิบชิ้น
     3. ลิงก์แชร์ยาวเกินเพดาน URL ทันที
   โมดูลนี้จึงย่อรูปตั้งแต่ตอนนำเข้า ก่อนแตะ state ใด ๆ ทั้งสิ้น:
     - ย่อด้านยาวสุดเหลือ BACKDROP_MAX_EDGE
     - เข้ารหัสใหม่เป็น JPEG คุณภาพ 0.72 (แปลนอาคารเป็นภาพลายเส้น บีบได้ดีมาก)
   ได้ไฟล์ราว 120-350 KB ซึ่งยังอยู่ในวิสัยที่ localStorage รับไหว
   ส่วนลิงก์แชร์ยังใส่ไม่ได้อยู่ดี -> library.js ตัดรูปออกจากลิงก์และแจ้งผู้ใช้ตรง ๆ

   ---------- ระบบพิกัด ----------
   เก็บ x/y/scale เป็นพิกัด world เดียวกับโหนด รูปจึงเลื่อน/ซูมไปพร้อมผังโดยไม่ต้องคำนวณอะไรเพิ่ม
   และตำแหน่งอุปกรณ์เทียบกับแปลนจะไม่เพี้ยนตอนผู้ใช้ซูม
   ============================================ */

const BACKDROP_MAX_EDGE = 1600;   // px ด้านยาวสุดหลังย่อ — พอสำหรับแปลน A3 ที่ซูมดูได้
const BACKDROP_QUALITY = 0.72;    // คุณภาพ JPEG
const BACKDROP_WARN_BYTES = 700 * 1024; // เกินนี้เตือนว่าอาจเซฟลงคลังไม่ได้

// อ็อบเจกต์ Image ที่ใช้วาดจริง — เก็บแยกจาก state เพราะ state ต้อง JSON ได้
// และการโหลดรูปเป็น async ส่วน renderFrame() ต้องวาดแบบ sync ทุกเฟรม
let backdropImg = null;
let backdropLoadedSrc = null; // src ล่าสุดที่โหลดสำเร็จ ใช้กันโหลดซ้ำทุกเฟรม

function defaultBackdrop() {
    return { src: null, x: 0, y: 0, scale: 1, opacity: 0.35, locked: true };
}

function getBackdrop() {
    if (!state.backdrop || typeof state.backdrop !== 'object') state.backdrop = defaultBackdrop();
    return state.backdrop;
}

function hasBackdrop() {
    var b = state.backdrop;
    return !!(b && typeof b.src === 'string' && b.src.length > 0);
}

/* ---------- โหลดรูปเข้าหน่วยความจำ ----------
   เรียกได้บ่อยแค่ไหนก็ได้ ถ้า src เดิมจะไม่ทำอะไรเลย */
function ensureBackdropImage() {
    if (!hasBackdrop()) { backdropImg = null; backdropLoadedSrc = null; return; }
    var b = getBackdrop();
    if (backdropLoadedSrc === b.src && backdropImg) return;

    if (typeof Image !== 'function') return; // สภาพแวดล้อมเทสบน Node ไม่มี Image — ข้ามไปเงียบ ๆ
    var img = new Image();
    img.onload = function () {
        backdropImg = img;
        backdropLoadedSrc = b.src;
        if (typeof requestRedraw === 'function') requestRedraw();
    };
    img.onerror = function () {
        backdropImg = null;
        backdropLoadedSrc = null;
        if (typeof showToast === 'function') showToast('เปิดรูปแปลนอาคารไม่สำเร็จ ไฟล์รูปอาจเสียหาย', 'error');
    };
    img.src = b.src;
}

/* ---------- วาด ----------
   ถูกเรียกจาก renderFrame() ในชั้นพิกัด world ก่อนทุกอย่าง เพื่อให้อยู่ล่างสุดเสมอ */
function drawBackdrop(forExport) {
    if (!backdropImg || !hasBackdrop()) return;
    var b = getBackdrop();
    var prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.max(0.05, Math.min(1, Number(b.opacity) || 0.35));
    var s = Math.max(0.05, Number(b.scale) || 1);
    ctx.drawImage(backdropImg, b.x, b.y, backdropImg.naturalWidth * s, backdropImg.naturalHeight * s);
    ctx.globalAlpha = prevAlpha;

    // ตอนปลดล็อกให้ลากได้ ตีกรอบประให้เห็นขอบเขตรูป ไม่งั้นผู้ใช้ไม่รู้ว่าต้องลากตรงไหน
    // กรอบนี้เป็นเครื่องมือช่วยจัดตำแหน่ง ไม่ใช่ส่วนหนึ่งของผัง จึงห้ามติดไปในรูปที่ export
    if (!b.locked && !forExport) {
        ctx.save();
        ctx.strokeStyle = CANVAS_WARN_COLOR;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(b.x, b.y, backdropImg.naturalWidth * s, backdropImg.naturalHeight * s);
        ctx.restore();
    }
}

// ผู้ใช้กำลังลากรูปอยู่หรือเปล่า — topology.js ถามก่อนตัดสินใจว่าคลิกพื้นที่ว่างคือ "เลื่อนผัง" หรือ "เลื่อนรูป"
function isBackdropDraggable() {
    return hasBackdrop() && !getBackdrop().locked;
}

/* ---------- นำเข้ารูป ----------
   ย่อ + เข้ารหัสใหม่ก่อนเก็บเสมอ ดูเหตุผลเต็มที่หัวไฟล์ */
function onBackdropFile(input) {
    try {
        var file = input && input.files && input.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) {
            showToast('ไฟล์นี้ไม่ใช่รูปภาพ', 'error');
            input.value = '';
            return;
        }

        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                try {
                    var scale = Math.min(1, BACKDROP_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
                    var w = Math.round(img.naturalWidth * scale);
                    var h = Math.round(img.naturalHeight * scale);

                    var cv = document.createElement('canvas');
                    cv.width = w; cv.height = h;
                    var c = cv.getContext('2d');
                    // JPEG ไม่มีช่องโปร่งใส ถ้าต้นฉบับเป็น PNG พื้นโปร่ง จะได้พื้นดำถ้าไม่ทาขาวรองไว้ก่อน
                    c.fillStyle = '#ffffff';
                    c.fillRect(0, 0, w, h);
                    c.drawImage(img, 0, 0, w, h);

                    if (typeof pushHistory === 'function') pushHistory('ใส่แปลนอาคาร');
                    var b = getBackdrop();
                    b.src = cv.toDataURL('image/jpeg', BACKDROP_QUALITY);
                    // วางกึ่งกลางบริเวณที่ผังถูกจัดไว้ตั้งแต่ต้น ไม่ใช่มุมซ้ายบนที่ผู้ใช้ต้องเลื่อนไปหา
                    b.x = 60; b.y = 60;
                    b.scale = 1;
                    b.locked = false; // เพิ่งใส่ = ยังต้องจัดตำแหน่ง ปลดล็อกไว้ให้ลากได้ทันที
                    backdropLoadedSrc = null;
                    ensureBackdropImage();
                    renderBackdropPanel();
                    if (typeof scheduleAutosave === 'function') scheduleAutosave();
                    if (typeof requestRedraw === 'function') requestRedraw();

                    var kb = Math.round(b.src.length * 0.75 / 1024); // base64 พองขึ้นราว 4/3 เท่า
                    showToast('ใส่รูปแปลนอาคารแล้ว (ขนาด ' + w + '×' + h + ' ประมาณ ' + kb + ' KB) ลากที่ตัวรูปเพื่อจัดตำแหน่งได้เลย', 'success');
                    if (b.src.length > BACKDROP_WARN_BYTES) {
                        showToast('รูปนี้ค่อนข้างใหญ่ ถ้าเก็บลงคลังแล้วไม่สำเร็จ ให้ใช้ปุ่ม SAVE บันทึกเป็นไฟล์แทน', 'info');
                    }
                } catch (err) {
                    console.error('backdrop encode error:', err);
                    showToast('ย่อรูปไม่สำเร็จ', 'error');
                }
            };
            img.onerror = function () { showToast('เปิดรูปนี้ไม่ได้ ลองเปลี่ยนเป็นไฟล์ PNG หรือ JPG ดู', 'error'); };
            img.src = e.target.result;
        };
        reader.onerror = function () { showToast('อ่านไฟล์ไม่สำเร็จ', 'error'); };
        reader.readAsDataURL(file);
    } catch (err) {
        console.error('onBackdropFile error:', err);
        showToast('ใส่รูปไม่สำเร็จ', 'error');
    } finally {
        if (input) input.value = ''; // ล้างค่าเพื่อให้เลือกไฟล์เดิมซ้ำได้อีก
    }
}

function removeBackdrop() {
    if (!hasBackdrop()) return;
    if (typeof pushHistory === 'function') pushHistory('ลบแปลนอาคาร');
    state.backdrop = defaultBackdrop();
    backdropImg = null;
    backdropLoadedSrc = null;
    renderBackdropPanel();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof requestRedraw === 'function') requestRedraw();
    showToast('ลบแปลนอาคารแล้ว', 'success');
}

function onBackdropOpacity(value) {
    getBackdrop().opacity = Math.max(0.05, Math.min(1, Number(value) / 100));
    if (typeof requestRedraw === 'function') requestRedraw();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    renderBackdropPanel();
}

function onBackdropScale(value) {
    getBackdrop().scale = Math.max(0.1, Math.min(4, Number(value) / 100));
    if (typeof requestRedraw === 'function') requestRedraw();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    renderBackdropPanel();
}

// ล็อกแล้วรูปจะกลายเป็นพื้นหลังนิ่ง ๆ ที่คลิกทะลุได้ — จำเป็นมาก ไม่งั้นจัดตำแหน่งเสร็จแล้ว
// จะลากผังไม่ได้อีกเลยเพราะการลากพื้นที่ว่างจะไปโดนรูปตลอด
function toggleBackdropLock() {
    if (!hasBackdrop()) return;
    var b = getBackdrop();
    b.locked = !b.locked;
    renderBackdropPanel();
    if (typeof requestRedraw === 'function') requestRedraw();
    showToast(b.locked ? 'ล็อกรูปแล้ว ตอนนี้ลากผังได้ตามปกติ' : 'ปลดล็อกรูปแล้ว ลากที่ตัวรูปเพื่อจัดตำแหน่งได้เลย', 'info');
}

function openBackdropPanel() {
    var el = document.getElementById('backdropPanel');
    if (!el) return;
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) renderBackdropPanel();
}

function renderBackdropPanel() {
    var el = document.getElementById('backdropBody');
    if (!el) return;
    var b = getBackdrop();

    if (!hasBackdrop()) {
        el.innerHTML =
            '<div class="text-muted text-[12px] leading-relaxed mb-2">' +
                'ใส่รูปแปลนอาคารไว้ใต้ผัง แล้วลากอุปกรณ์ไปวางตรงตำแหน่งจริงในตึกได้' +
            '</div>' +
            '<button onclick="document.getElementById(\'backdropFileInput\').click()" class="btn-cyber w-full text-[12px]">' +
                '<i class="fas fa-image mr-1" aria-hidden="true"></i>เลือกรูป (PNG / JPG)</button>' +
            '<div class="text-subtle text-[11px] mt-2">รูปจะถูกย่อให้ด้านยาวสุดไม่เกิน ' + BACKDROP_MAX_EDGE + ' px โดยอัตโนมัติ</div>';
        return;
    }

    var opacityPct = Math.round((Number(b.opacity) || 0.35) * 100);
    var scalePct = Math.round((Number(b.scale) || 1) * 100);
    el.innerHTML =
        '<div class="flex items-center justify-between mb-2">' +
            '<button onclick="toggleBackdropLock()" class="' + (b.locked ? 'btn-cyber' : 'btn-neon') + ' text-[12px] px-2 py-1">' +
                '<i class="fas ' + (b.locked ? 'fa-lock' : 'fa-lock-open') + ' mr-1" aria-hidden="true"></i>' +
                (b.locked ? 'ล็อกอยู่' : 'ลากรูปได้') + '</button>' +
            '<button onclick="removeBackdrop()" class="btn-hot text-[12px] px-2 py-1" title="เอาแปลนอาคารออก">' +
                '<i class="fas fa-trash" aria-hidden="true"></i></button>' +
        '</div>' +

        '<label class="text-subtle text-[11px] tracking-wider block mt-2" for="backdropOpacity">ความจาง — ' + opacityPct + '%</label>' +
        '<input id="backdropOpacity" type="range" min="5" max="100" value="' + opacityPct + '" class="w-full" ' +
            'oninput="onBackdropOpacity(this.value)" aria-label="ความจางของแปลนอาคาร">' +

        '<label class="text-subtle text-[11px] tracking-wider block mt-2" for="backdropScale">ขนาด — ' + scalePct + '%</label>' +
        '<input id="backdropScale" type="range" min="10" max="400" value="' + scalePct + '" class="w-full" ' +
            'oninput="onBackdropScale(this.value)" aria-label="ขนาดของแปลนอาคาร">' +

        '<div class="text-subtle text-[11px] mt-2 leading-relaxed">' +
            (b.locked
                ? 'ล็อกอยู่ — คลิกลากพื้นที่ว่างจะเป็นการเลื่อนผังตามปกติ'
                : 'ลากบนตัวรูปเพื่อย้ายตำแหน่ง กดปุ่มล็อกเมื่อจัดเสร็จ') +
        '</div>' +
        '<div class="text-subtle text-[11px] mt-2">รูปจะติดไปกับไฟล์ .json และรูป PNG ที่ export แต่<b>ไม่ติดไปกับลิงก์แชร์</b> (ใหญ่เกินใส่ใน URL)</div>';
}
