/* ============================================
   5. ข้อมูลตัวอย่าง
   ============================================
   ตัวอย่างส่วนใหญ่มีแค่รายชื่อแผนก (ผังจะถูกจัดให้อัตโนมัติเป็นแบบ Router เดียว)
   ส่วนตัวอย่างที่มีช่อง `topology` เพิ่มมา จะสร้าง Router สาขาและลากสายให้ครบตั้งแต่โหลด
   มีไว้ตอบคำถามที่ถามกันบ่อยที่สุดสองข้อ: "หลาย Router ต้องต่อยังไง" กับ "แผนกไหนอยู่กับใคร"

   รูปแบบของ topology:
     branches: [{ key, label, depts: ['ชื่อแผนก', ...] }]
        key   = ชื่อเรียกภายในตัวอย่างนี้เท่านั้น ใช้อ้างถึงกันในช่อง wan (ไม่ใช่ id จริงบนผัง
                เพราะ id จริงถูกแจกตอนรันไทม์ตามลำดับการวาง)
        depts = ชื่อแผนกที่ Router ตัวนี้รับไปดูแล ต้องสะกดตรงกับในรายการ departments เป๊ะ ๆ
     wan: [['router', 'key-สาขา'], ...]  คู่ปลายทางของลิงก์ WAN โดย 'router' = Router หลัก

   ไม่มีช่องพิกัด x/y โดยตั้งใจ — buildExampleTopology() คำนวณตำแหน่งเองจากผังที่จัดไว้จริง
   (วางสาขาไว้ใต้กลุ่มแผนกของตัวเอง) รอบแรกเคยฝังพิกัดตายตัวไว้แล้วทับกล่องแผนกจนอ่านผังไม่ออก

   ข้อจำกัดที่ตั้งใจ: ตัวอย่างทุกชุดต่อแบบดาว (ทุกสาขาต่อตรงเข้า Router หลัก) ไม่ต่อเป็นลูกโซ่
   เพราะ getStaticRoutesForRouter() มองแค่เพื่อนบ้านที่ต่อตรงกันเท่านั้น ไม่ได้ไล่เส้นทางต่อทอด
   ถ้าต่อเป็นลูกโซ่ HQ—A—B ตัว HQ จะไม่มีเส้นทางไปหาแผนกที่อยู่หลัง B (ดูหัวข้อข้อจำกัดใน README)
   ============================================ */

const EXAMPLES = {
    company: {
        label: 'สำนักงานบริษัททั่วไป',
        hint: 'องค์กรขนาดกลาง 6 แผนก Router ตัวเดียว เหมาะกับการเริ่มต้นทำความเข้าใจ VLSM',
        baseIp: '172.16.0.0',
        baseCidr: 23,
        departments: [
            { name: 'IT-Department', hosts: 50 },
            { name: 'HR', hosts: 20 },
            { name: 'Finance', hosts: 30 },
            { name: 'Marketing', hosts: 40 },
            { name: 'Sales', hosts: 25 },
            { name: 'Management', hosts: 10 }
        ]
    },
    school: {
        label: 'โรงเรียนหรือมหาวิทยาลัย',
        hint: 'ห้องเรียนสองห้องขนาดเท่ากัน ใช้ดูว่าแผนกขนาดเท่ากันได้ช่วงต่อกันพอดีอย่างไร',
        baseIp: '192.168.0.0',
        baseCidr: 22,
        departments: [
            { name: 'Computer-Lab', hosts: 60 },
            { name: 'Library', hosts: 30 },
            { name: 'Admin-Office', hosts: 15 },
            { name: 'Classroom-A', hosts: 45 },
            { name: 'Classroom-B', hosts: 45 }
        ]
    },
    hospital: {
        label: 'โรงพยาบาล',
        hint: 'มีทั้งแผนกเล็กมากและ WiFi ผู้ป่วย 100 เครื่อง ใช้ดูว่า VLSM ประหยัดพื้นที่กว่าการแบ่งเท่ากันแค่ไหน',
        baseIp: '10.10.0.0',
        baseCidr: 21,
        departments: [
            { name: 'Emergency-Room', hosts: 35 },
            { name: 'ICU', hosts: 20 },
            { name: 'Outpatient', hosts: 80 },
            { name: 'Pharmacy', hosts: 15 },
            { name: 'Laboratory', hosts: 25 },
            { name: 'Admin', hosts: 20 },
            { name: 'WiFi-Public', hosts: 100 }
        ]
    },
    small: {
        label: 'สำนักงานขนาดเล็ก',
        hint: 'สามแผนกบน /24 เดียว เล็กที่สุดในชุดตัวอย่าง เหมาะกับการลองครั้งแรก',
        baseIp: '192.168.1.0',
        baseCidr: 24,
        departments: [
            { name: 'Office', hosts: 20 },
            { name: 'CCTV', hosts: 8 },
            { name: 'Guest-WiFi', hosts: 30 }
        ]
    },
    factory: {
        label: 'โรงงานอัจฉริยะ',
        hint: 'มีเซนเซอร์ 120 ตัวและกล้องวงจรปิด 40 ตัว ใช้ดูกรณีที่อุปกรณ์มากกว่าคน',
        baseIp: '10.50.0.0',
        baseCidr: 21,
        departments: [
            { name: 'Production', hosts: 60 },
            { name: 'QA-Dept', hosts: 20 },
            { name: 'Warehouse', hosts: 15 },
            { name: 'Office', hosts: 25 },
            { name: 'IoT-Sensors', hosts: 120 },
            { name: 'Security-Cam', hosts: 40 }
        ]
    },
    enterprise: {
        label: 'องค์กรขนาดใหญ่ 8 แผนก',
        hint: 'แผนกใหญ่สุด 200 เครื่อง เล็กสุด 25 เครื่อง ใช้ดูการเรียงจากใหญ่ไปเล็ก',
        baseIp: '172.20.0.0',
        baseCidr: 22,
        departments: [
            { name: 'Data-Center', hosts: 200 },
            { name: 'Engineering', hosts: 150 },
            { name: 'Sales', hosts: 100 },
            { name: 'Marketing', hosts: 60 },
            { name: 'Guest-WiFi', hosts: 50 },
            { name: 'IT-Operations', hosts: 40 },
            { name: 'Finance', hosts: 35 },
            { name: 'HR', hosts: 25 }
        ]
    },

    /* ---------- ตัวอย่างที่มาพร้อมผังหลาย Router ---------- */

    branch2: {
        label: 'สำนักงานใหญ่ กับ 2 สาขา',
        hint: 'ตัวอย่างการต่อ Router หลายตัว เปิดแท็บคำสั่งแล้วสลับดูทีละตัวได้',
        baseIp: '10.20.0.0',
        baseCidr: 22,
        departments: [
            // อยู่ที่สำนักงานใหญ่ (ไม่ได้ถูกระบุใน depts ของสาขาไหน = Router หลักดูแลเอง)
            { name: 'HQ-Office', hosts: 60 },
            { name: 'HQ-IT', hosts: 30 },
            { name: 'Data-Center', hosts: 40 },
            // ย้ายไปอยู่หลังสาขา
            { name: 'CM-Sales', hosts: 25 },
            { name: 'CM-Stock', hosts: 15 },
            { name: 'KK-Sales', hosts: 20 }
        ],
        topology: {
            branches: [
                { key: 'cm', label: 'ChiangMai', depts: ['CM-Sales', 'CM-Stock'] },
                { key: 'kk', label: 'KhonKaen', depts: ['KK-Sales'] }
            ],
            // ต่อแบบดาว: ทั้งสองสาขาต่อตรงเข้า Router หลัก
            // สาขาได้ default route กลับ HQ / HQ ได้ static route เจาะจงไปหาแต่ละสาขา
            // ทราฟฟิกระหว่างสาขา CM กับ KK จะวิ่งผ่าน HQ ซึ่งถูกต้องตามผังนี้
            wan: [['router', 'cm'], ['router', 'kk']]
        }
    },

    branch3: {
        label: 'บริษัท 3 สาขา ผังครบ',
        hint: 'สาขาละ 1 ถึง 2 แผนก ต่อแบบดาวเข้าศูนย์กลาง เป็นชุดที่ใกล้เคียงงานจริงที่สุด',
        baseIp: '172.31.0.0',
        baseCidr: 21,
        departments: [
            { name: 'HQ-Management', hosts: 20 },
            { name: 'HQ-Finance', hosts: 30 },
            { name: 'HQ-Servers', hosts: 100 },
            { name: 'North-Office', hosts: 40 },
            { name: 'North-Warehouse', hosts: 25 },
            { name: 'South-Office', hosts: 35 },
            { name: 'East-Office', hosts: 50 },
            { name: 'East-Support', hosts: 20 }
        ],
        topology: {
            branches: [
                { key: 'n', label: 'Site-North', depts: ['North-Office', 'North-Warehouse'] },
                { key: 's', label: 'Site-South', depts: ['South-Office'] },
                { key: 'e', label: 'Site-East',  depts: ['East-Office', 'East-Support'] }
            ],
            wan: [['router', 'n'], ['router', 's'], ['router', 'e']]
        }
    },

    /* ---------- ร้านค้าปลีกหลายสาขา ----------
       ดัดแปลงจากลักษณะงานของธุรกิจค้าปลีกไอทีที่มีหน้าร้านกระจายทั่วประเทศ
       ตัวเลขทุกตัวในชุดนี้เป็นข้อมูลสมมติทั้งหมด ไม่ได้มาจากเครือข่ายขององค์กรใด

       ที่ต่างจากตัวอย่างชุดอื่น: ชุดนี้ทุกสาขามีโครงสร้างเหมือนกันเป๊ะ คือจุดขายกับหลังร้าน
       จึงใช้อธิบายได้ว่าถ้าจะขยายไปหลายร้อยสาขา ต้องวางแผนช่วงหมายเลขอย่างไรตั้งแต่ต้น
       และใช้ชี้ให้เห็นเพดานจริงของโปรแกรมได้ด้วย (ดูหัวข้อข้อจำกัดใน README) */
    retail: {
        label: 'ร้านค้าปลีก สำนักงานใหญ่ + 3 สาขา',
        hint: 'ทุกสาขาโครงสร้างเหมือนกัน ใช้ดูว่าถ้าจะขยายเป็นหลายร้อยสาขาต้องวางแผนอย่างไร ตัวเลขทั้งหมดสมมติ',
        baseIp: '10.40.0.0',
        baseCidr: 23,
        departments: [
            // สำนักงานใหญ่
            { name: 'HQ-IT', hosts: 45 },
            { name: 'HQ-Finance', hosts: 35 },
            { name: 'HQ-Purchasing', hosts: 25 },
            { name: 'HQ-Warehouse', hosts: 90 },
            // หน้าร้านแต่ละสาขา ขนาดเท่ากันทุกสาขาโดยตั้งใจ
            { name: 'Ladprao-POS', hosts: 12 },
            { name: 'Ladprao-Office', hosts: 8 },
            { name: 'Rangsit-POS', hosts: 12 },
            { name: 'Rangsit-Office', hosts: 8 },
            { name: 'Korat-POS', hosts: 12 },
            { name: 'Korat-Office', hosts: 8 }
        ],
        topology: {
            branches: [
                { key: 'lp', label: 'Ladprao', depts: ['Ladprao-POS', 'Ladprao-Office'] },
                { key: 'rs', label: 'Rangsit', depts: ['Rangsit-POS', 'Rangsit-Office'] },
                { key: 'kr', label: 'Korat',   depts: ['Korat-POS', 'Korat-Office'] }
            ],
            wan: [['router', 'lp'], ['router', 'rs'], ['router', 'kr']]
        }
    }
};