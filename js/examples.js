/* ============================================
   5. ข้อมูลตัวอย่างทั้ง 6 สถานการณ์
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
    }
};