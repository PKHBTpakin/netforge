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
        label: 'Corporate Network',
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
        label: 'School / University',
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
        label: 'Hospital Network',
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
        label: 'Small Office (SMB)',
        baseIp: '192.168.1.0',
        baseCidr: 24,
        departments: [
            { name: 'Office', hosts: 20 },
            { name: 'CCTV', hosts: 8 },
            { name: 'Guest-WiFi', hosts: 30 }
        ]
    },
    factory: {
        label: 'Smart Factory',
        baseIp: '10.50.0.0',
        baseCidr: 21,
        departments: [
            { name: 'Production-Line', hosts: 60 },
            { name: 'QA-Dept', hosts: 20 },
            { name: 'Warehouse', hosts: 15 },
            { name: 'Office', hosts: 25 },
            { name: 'IoT-Sensors', hosts: 120 },
            { name: 'Security-Cam', hosts: 40 }
        ]
    },
    enterprise: {
        label: 'Enterprise HQ (8 Depts)',
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
        label: 'สำนักงานใหญ่ + 2 สาขา',
        hint: 'ตัวอย่างการต่อ Router หลายตัว — ดูแท็บ CLI Config แล้วสลับดูทีละ Router',
        baseIp: '10.20.0.0',
        baseCidr: 22,
        departments: [
            // อยู่ที่สำนักงานใหญ่ (ไม่ได้ถูกระบุใน depts ของสาขาไหน = Router หลักดูแลเอง)
            { name: 'HQ-Office', hosts: 60 },
            { name: 'HQ-IT', hosts: 30 },
            { name: 'Data-Center', hosts: 40 },
            // ย้ายไปอยู่หลังสาขา
            { name: 'Branch-CM-Sales', hosts: 25 },
            { name: 'Branch-CM-Stock', hosts: 15 },
            { name: 'Branch-KK-Sales', hosts: 20 }
        ],
        topology: {
            branches: [
                { key: 'cm', label: 'Branch-ChiangMai', depts: ['Branch-CM-Sales', 'Branch-CM-Stock'] },
                { key: 'kk', label: 'Branch-KhonKaen', depts: ['Branch-KK-Sales'] }
            ],
            // ต่อแบบดาว: ทั้งสองสาขาต่อตรงเข้า Router หลัก
            // สาขาได้ default route กลับ HQ / HQ ได้ static route เจาะจงไปหาแต่ละสาขา
            // ทราฟฟิกระหว่างสาขา CM กับ KK จะวิ่งผ่าน HQ ซึ่งถูกต้องตามผังนี้
            wan: [['router', 'cm'], ['router', 'kk']]
        }
    },

    branch3: {
        label: 'บริษัท 3 สาขา (ผังครบ)',
        hint: 'สาขาละ 1-2 แผนก ต่อดาวเข้าศูนย์กลาง — ตัวอย่างที่ใกล้เคียงงานจริงที่สุด',
        baseIp: '172.31.0.0',
        baseCidr: 21,
        departments: [
            { name: 'HQ-Management', hosts: 20 },
            { name: 'HQ-Finance', hosts: 30 },
            { name: 'HQ-Server-Farm', hosts: 100 },
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
    }
};