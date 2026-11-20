import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  addDaysIso,
  generateVerificationHash,
  sanitizeRefId,
  todayIsoDate,
} from '../types/zacma';

const STUDENT_PORTRAIT_1 = '/src/assets/images/zacma_student_1_1795086158889.jpg';
const STUDENT_PORTRAIT_2 = '/src/assets/images/zacma_student_2_1795086147731.jpg';
const STUDENT_PORTRAIT_3 = '/src/assets/images/zacma_student_3_1795086144545.jpg';
const STUDENT_PORTRAIT_4 = '/src/assets/images/zacma_student_4_1795086144533.jpg';

export async function ensureSeededDatabase(adminUid: string, adminName: string): Promise<void> {
  try {
    const existingCourses = await getDocs(query(collection(db, 'courses'), limit(1)));
    if (!existingCourses.empty) {
      return;
    }

    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const today = todayIsoDate();

    // 1. Canonical Roles
    const roles = [
      {
        id: 'role_admin',
        code: 'ADMIN',
        name: 'System Administrator',
        description:
          'Full institutional oversight: approve registrations and payments, manage courses, fees, staff roles, financial reports, attendance, and audit logs.',
        permissions: [
          'approve_registrations',
          'approve_payments',
          'manage_courses',
          'manage_staff',
          'view_reports',
          'manage_expenses',
          'manage_attendance',
          'view_audit_logs',
        ],
      },
      {
        id: 'role_accountant',
        code: 'ACCOUNTANT',
        name: 'Accountant & Registrar',
        description:
          'Registers students, selects payment plans, records fee submissions for admin approval, tracks balances, and prints official approved receipts.',
        permissions: [
          'register_students',
          'record_payments',
          'view_balances',
          'print_approved_receipts',
        ],
      },
      {
        id: 'role_instructor',
        code: 'INSTRUCTOR',
        name: 'Course Instructor',
        description:
          'Views assigned classes and enrolled students, records daily attendance, and reviews attendance reports with zero financial access.',
        permissions: ['view_assigned_classes', 'record_attendance', 'view_attendance_reports'],
      },
      {
        id: 'role_general_staff',
        code: 'GENERAL_STAFF',
        name: 'General Operations Staff',
        description:
          'Supports campus scheduling, student directory coordination, and non-financial administrative tasks with zero financial ledger access.',
        permissions: ['view_courses', 'view_student_directory', 'view_attendance_summary'],
      },
      {
        id: 'role_student',
        code: 'STUDENT',
        name: 'Enrolled Student',
        description:
          'Isolated self-service portal access limited strictly to the student’s own fee balance, payment history, installment deadlines, reminders, and official receipts.',
        permissions: ['view_own_balance', 'view_own_receipts', 'view_own_reminders'],
      },
    ];
    for (const r of roles) {
      const { id, ...data } = r;
      batch.set(doc(db, 'roles', id), data);
    }

    // 2. Sample Staff Profiles (Accountant + 2 Instructors)
    const staffProfiles = [
      {
        id: 'staff_acc_tigist',
        uid: 'staff_acc_tigist',
        email: 'tigist.bekele@zacma.edu.et',
        fullName: 'Tigist Bekele',
        phone: '+251 911 248 910',
        role: 'ACCOUNTANT',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'staff_inst_dawit',
        uid: 'staff_inst_dawit',
        email: 'dawit.hailu@zacma.edu.et',
        fullName: 'Dawit Hailu',
        phone: '+251 912 674 320',
        role: 'INSTRUCTOR',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'staff_inst_meron',
        uid: 'staff_inst_meron',
        email: 'meron.tadesse@zacma.edu.et',
        fullName: 'Meron Tadesse',
        phone: '+251 913 551 890',
        role: 'INSTRUCTOR',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'staff_gen_helina',
        uid: 'staff_gen_helina',
        email: 'helina.teshome@zacma.edu.et',
        fullName: 'Helina Teshome',
        phone: '+251 911 804 221',
        role: 'GENERAL_STAFF',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const p of staffProfiles) {
      const { id, ...data } = p;
      batch.set(doc(db, 'profiles', id), data);
    }

    // 3. Payment Plans
    const paymentPlans = [
      {
        id: 'plan_full',
        code: 'FULL',
        name: 'Full Payment (Single Settlement)',
        installmentCount: 1,
        intervalDays: 0,
        description: 'Complete course tuition paid upfront upon enrollment.',
        isActive: true,
      },
      {
        id: 'plan_monthly',
        code: 'MONTHLY',
        name: 'Monthly Plan (4 Installments)',
        installmentCount: 4,
        intervalDays: 30,
        description: 'Equal monthly payments billed every 30 days.',
        isActive: true,
      },
      {
        id: 'plan_two_month',
        code: 'TWO_MONTH',
        name: 'Two-Month Split (2 Installments)',
        installmentCount: 2,
        intervalDays: 60,
        description: 'Two equal payments spaced 60 days apart.',
        isActive: true,
      },
      {
        id: 'plan_three_month',
        code: 'THREE_MONTH',
        name: 'Three-Month Plan (3 Installments)',
        installmentCount: 3,
        intervalDays: 30,
        description: 'Three monthly installments over a quarter.',
        isActive: true,
      },
      {
        id: 'plan_six_month',
        code: 'SIX_MONTH',
        name: 'Six-Month Extended (6 Installments)',
        installmentCount: 6,
        intervalDays: 30,
        description: 'Six structured monthly installments for diploma tracks.',
        isActive: true,
      },
      {
        id: 'plan_custom',
        code: 'CUSTOM',
        name: 'Custom Payment Schedule',
        installmentCount: 2,
        intervalDays: 45,
        description: 'Custom installment count and interval defined at registration.',
        isActive: true,
      },
    ];
    for (const plan of paymentPlans) {
      const { id, ...data } = plan;
      batch.set(doc(db, 'payment_plans', id), data);
    }

    // 4. Default ZACMA Courses
    const courses = [
      {
        id: 'crs_web_dev',
        code: 'ZAC-WD101',
        name: 'Web Development',
        category: 'Software Engineering',
        durationWeeks: 16,
        feeEtb: 24000,
        schedule: 'Mon, Wed, Fri · 09:00–12:00',
        instructorId: 'staff_inst_dawit',
        instructorName: 'Dawit Hailu',
        description: 'Full-stack modern web development with HTML, CSS, TypeScript, React, and backend APIs.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'crs_graphics',
        code: 'ZAC-GD102',
        name: 'Graphics Design',
        category: 'Creative & Design',
        durationWeeks: 12,
        feeEtb: 16000,
        schedule: 'Tue, Thu, Sat · 14:00–17:00',
        instructorId: 'staff_inst_meron',
        instructorName: 'Meron Tadesse',
        description: 'Brand identity, print layout, typography, Photoshop, Illustrator, and commercial portfolio.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'crs_digital_mkt',
        code: 'ZAC-DM103',
        name: 'Digital Marketing',
        category: 'Business & Growth',
        durationWeeks: 8,
        feeEtb: 12000,
        schedule: 'Mon, Wed · 17:30–19:30',
        instructorId: 'staff_inst_meron',
        instructorName: 'Meron Tadesse',
        description: 'Social media strategy, SEO, paid campaign analytics, and conversion copywriting.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'crs_comp_basics',
        code: 'ZAC-CB104',
        name: 'Computer Basics',
        category: 'Foundational IT',
        durationWeeks: 6,
        feeEtb: 6500,
        schedule: 'Mon–Fri · 08:30–10:30',
        instructorId: 'staff_inst_dawit',
        instructorName: 'Dawit Hailu',
        description: 'Essential office productivity, spreadsheets, document formatting, and digital literacy.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'crs_comp_maint',
        code: 'ZAC-CM105',
        name: 'Computer Maintenance',
        category: 'Hardware & Systems',
        durationWeeks: 10,
        feeEtb: 14500,
        schedule: 'Tue, Thu · 09:00–12:00',
        instructorId: 'staff_inst_dawit',
        instructorName: 'Dawit Hailu',
        description: 'PC diagnostics, motherboard troubleshooting, OS deployment, and LAN networking.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'crs_photo_video',
        code: 'ZAC-PV106',
        name: 'Photography and Videography',
        category: 'Media Production',
        durationWeeks: 12,
        feeEtb: 18000,
        schedule: 'Sat, Sun · 09:00–13:00',
        instructorId: 'staff_inst_meron',
        instructorName: 'Meron Tadesse',
        description: 'DSLR studio lighting, commercial video shooting, color grading, and Premiere editing.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'crs_languages',
        code: 'ZAC-LN107',
        name: 'Language Courses (Business English)',
        category: 'Language & Communication',
        durationWeeks: 10,
        feeEtb: 9000,
        schedule: 'Mon, Wed, Fri · 17:30–19:00',
        instructorId: 'staff_inst_meron',
        instructorName: 'Meron Tadesse',
        description: 'Professional speaking, technical writing, and workplace communication fluency.',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const c of courses) {
      const { id, ...data } = c;
      batch.set(doc(db, 'courses', id), data);
    }

    // 5. Expense Categories
    const expenseCategories = [
      { id: 'expcat_rent', name: 'Campus Facility Rent', description: 'Monthly training center lease and space charges', isActive: true },
      { id: 'expcat_stipend', name: 'Instructor Salaries & Stipends', description: 'Monthly faculty compensation and teaching allowances', isActive: true },
      { id: 'expcat_utilities', name: 'Utilities & Fiber Internet', description: 'Electricity, water, and high-speed campus broadband', isActive: true },
      { id: 'expcat_hardware', name: 'Lab Equipment & Maintenance', description: 'Workstations, cameras, projectors, and software licenses', isActive: true },
      { id: 'expcat_marketing', name: 'Admissions Marketing', description: 'Digital ads, brochures, and community workshops', isActive: true },
      { id: 'expcat_supplies', name: 'Office & Stationery Supplies', description: 'Printing paper, ID cards, receipt books, and markers', isActive: true },
    ];
    for (const cat of expenseCategories) {
      const { id, ...data } = cat;
      batch.set(doc(db, 'expense_categories', id), data);
    }

    // 6. Seeded Students, Enrollments, Installments, Payments & Receipts
    const dMinus75 = addDaysIso(today, -75);
    const dMinus55 = addDaysIso(today, -55);
    const dMinus40 = addDaysIso(today, -40);
    const dMinus25 = addDaysIso(today, -25);
    const dMinus12 = addDaysIso(today, -12);
    const dMinus5 = addDaysIso(today, -5);
    const dMinus2 = addDaysIso(today, -2);
    const dPlus4 = addDaysIso(today, 4);
    const dPlus20 = addDaysIso(today, 20);

    const students = [
      {
        id: 'stu_001',
        studentCode: 'ZAC-2026-0001',
        fullName: 'Selamawit Tesfaye',
        gender: 'Female',
        phone: '+251 911 432 876',
        altPhone: '+251 922 108 441',
        address: 'Bole Sub-City, Woreda 03, Addis Ababa',
        photoUrl: STUDENT_PORTRAIT_1,
        courseId: 'crs_web_dev',
        courseName: 'Web Development',
        enrollmentDate: dMinus75,
        courseFeeEtb: 24000,
        paymentPlanCode: 'MONTHLY',
        registrationStatus: 'APPROVED',
        registeredBy: 'staff_acc_tigist',
        registeredByName: 'Tigist Bekele',
        approvedBy: adminUid,
        approvedByName: adminName,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu_002',
        studentCode: 'ZAC-2026-0002',
        fullName: 'Bereket Alemu',
        gender: 'Male',
        phone: '+251 912 885 210',
        address: 'Yeka Sub-City, Megenagna, Addis Ababa',
        photoUrl: STUDENT_PORTRAIT_2,
        courseId: 'crs_graphics',
        courseName: 'Graphics Design',
        enrollmentDate: dMinus55,
        courseFeeEtb: 16000,
        paymentPlanCode: 'TWO_MONTH',
        registrationStatus: 'APPROVED',
        registeredBy: 'staff_acc_tigist',
        registeredByName: 'Tigist Bekele',
        approvedBy: adminUid,
        approvedByName: adminName,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu_003',
        studentCode: 'ZAC-2026-0003',
        fullName: 'Hanna Girma',
        gender: 'Female',
        phone: '+251 913 704 119',
        address: 'Kirkos Sub-City, Kazanchis, Addis Ababa',
        photoUrl: STUDENT_PORTRAIT_3,
        courseId: 'crs_digital_mkt',
        courseName: 'Digital Marketing',
        enrollmentDate: dMinus40,
        courseFeeEtb: 12000,
        paymentPlanCode: 'FULL',
        registrationStatus: 'APPROVED',
        registeredBy: 'staff_acc_tigist',
        registeredByName: 'Tigist Bekele',
        approvedBy: adminUid,
        approvedByName: adminName,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu_004',
        studentCode: 'ZAC-2026-0004',
        fullName: 'Yonas Kebede',
        gender: 'Male',
        phone: '+251 911 903 552',
        altPhone: '+251 911 220 019',
        address: 'Arada Sub-City, Piassa, Addis Ababa',
        photoUrl: STUDENT_PORTRAIT_4,
        courseId: 'crs_photo_video',
        courseName: 'Photography and Videography',
        enrollmentDate: dMinus40,
        courseFeeEtb: 18000,
        paymentPlanCode: 'THREE_MONTH',
        registrationStatus: 'APPROVED',
        registeredBy: 'staff_acc_tigist',
        registeredByName: 'Tigist Bekele',
        approvedBy: adminUid,
        approvedByName: adminName,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu_005',
        studentCode: 'ZAC-2026-0005',
        fullName: 'Kidist Mekonnen',
        gender: 'Female',
        phone: '+251 914 331 902',
        address: 'Nifas Silk-Lafto, Sarbet, Addis Ababa',
        courseId: 'crs_comp_maint',
        courseName: 'Computer Maintenance',
        enrollmentDate: dMinus25,
        courseFeeEtb: 14500,
        paymentPlanCode: 'TWO_MONTH',
        registrationStatus: 'APPROVED',
        registeredBy: 'staff_acc_tigist',
        registeredByName: 'Tigist Bekele',
        approvedBy: adminUid,
        approvedByName: adminName,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu_006',
        studentCode: 'ZAC-2026-0006',
        fullName: 'Abel Fikadu',
        gender: 'Male',
        phone: '+251 911 670 432',
        address: 'Lideta Sub-City, Mexico, Addis Ababa',
        courseId: 'crs_languages',
        courseName: 'Language Courses (Business English)',
        enrollmentDate: dMinus12,
        courseFeeEtb: 9000,
        paymentPlanCode: 'FULL',
        registrationStatus: 'APPROVED',
        registeredBy: 'staff_acc_tigist',
        registeredByName: 'Tigist Bekele',
        approvedBy: adminUid,
        approvedByName: adminName,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu_007',
        studentCode: 'ZAC-2026-0007',
        fullName: 'Rahel Solomon',
        gender: 'Female',
        phone: '+251 923 482 115',
        address: 'Bole Bulbula, Addis Ababa',
        courseId: 'crs_web_dev',
        courseName: 'Web Development',
        enrollmentDate: today,
        courseFeeEtb: 24000,
        paymentPlanCode: 'MONTHLY',
        registrationStatus: 'PENDING',
        registeredBy: 'staff_acc_tigist',
        registeredByName: 'Tigist Bekele',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'stu_008',
        studentCode: 'ZAC-2026-0008',
        fullName: 'Natnael Desta',
        gender: 'Male',
        phone: '+251 918 773 004',
        address: 'CMC Michael, Addis Ababa',
        courseId: 'crs_graphics',
        courseName: 'Graphics Design',
        enrollmentDate: today,
        courseFeeEtb: 16000,
        paymentPlanCode: 'THREE_MONTH',
        registrationStatus: 'PENDING',
        registeredBy: 'staff_acc_tigist',
        registeredByName: 'Tigist Bekele',
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const s of students) {
      const { id, ...data } = s;
      batch.set(doc(db, 'students', id), data);
    }

    const enrollments = [
      {
        id: 'enr_001',
        studentId: 'stu_001',
        studentCode: 'ZAC-2026-0001',
        studentName: 'Selamawit Tesfaye',
        courseId: 'crs_web_dev',
        courseName: 'Web Development',
        instructorId: 'staff_inst_dawit',
        paymentPlanCode: 'MONTHLY',
        paymentPlanName: 'Monthly Plan (4 Installments)',
        enrollmentDate: dMinus75,
        agreedFeeEtb: 24000,
        approvedPaidEtb: 18000,
        remainingBalanceEtb: 6000,
        status: 'ACTIVE',
        registeredBy: 'staff_acc_tigist',
        approvedBy: adminUid,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'enr_002',
        studentId: 'stu_002',
        studentCode: 'ZAC-2026-0002',
        studentName: 'Bereket Alemu',
        courseId: 'crs_graphics',
        courseName: 'Graphics Design',
        instructorId: 'staff_inst_meron',
        paymentPlanCode: 'TWO_MONTH',
        paymentPlanName: 'Two-Month Split (2 Installments)',
        enrollmentDate: dMinus55,
        agreedFeeEtb: 16000,
        approvedPaidEtb: 8000,
        remainingBalanceEtb: 8000,
        status: 'ACTIVE',
        registeredBy: 'staff_acc_tigist',
        approvedBy: adminUid,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'enr_003',
        studentId: 'stu_003',
        studentCode: 'ZAC-2026-0003',
        studentName: 'Hanna Girma',
        courseId: 'crs_digital_mkt',
        courseName: 'Digital Marketing',
        instructorId: 'staff_inst_meron',
        paymentPlanCode: 'FULL',
        paymentPlanName: 'Full Payment (Single Settlement)',
        enrollmentDate: dMinus40,
        agreedFeeEtb: 12000,
        approvedPaidEtb: 12000,
        remainingBalanceEtb: 0,
        status: 'ACTIVE',
        registeredBy: 'staff_acc_tigist',
        approvedBy: adminUid,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'enr_004',
        studentId: 'stu_004',
        studentCode: 'ZAC-2026-0004',
        studentName: 'Yonas Kebede',
        courseId: 'crs_photo_video',
        courseName: 'Photography and Videography',
        instructorId: 'staff_inst_meron',
        paymentPlanCode: 'THREE_MONTH',
        paymentPlanName: 'Three-Month Plan (3 Installments)',
        enrollmentDate: dMinus40,
        agreedFeeEtb: 18000,
        approvedPaidEtb: 6000,
        remainingBalanceEtb: 12000,
        status: 'ACTIVE',
        registeredBy: 'staff_acc_tigist',
        approvedBy: adminUid,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'enr_005',
        studentId: 'stu_005',
        studentCode: 'ZAC-2026-0005',
        studentName: 'Kidist Mekonnen',
        courseId: 'crs_comp_maint',
        courseName: 'Computer Maintenance',
        instructorId: 'staff_inst_dawit',
        paymentPlanCode: 'TWO_MONTH',
        paymentPlanName: 'Two-Month Split (2 Installments)',
        enrollmentDate: dMinus25,
        agreedFeeEtb: 14500,
        approvedPaidEtb: 7500,
        remainingBalanceEtb: 7000,
        status: 'ACTIVE',
        registeredBy: 'staff_acc_tigist',
        approvedBy: adminUid,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'enr_006',
        studentId: 'stu_006',
        studentCode: 'ZAC-2026-0006',
        studentName: 'Abel Fikadu',
        courseId: 'crs_languages',
        courseName: 'Language Courses (Business English)',
        instructorId: 'staff_inst_meron',
        paymentPlanCode: 'FULL',
        paymentPlanName: 'Full Payment (Single Settlement)',
        enrollmentDate: dMinus12,
        agreedFeeEtb: 9000,
        approvedPaidEtb: 9000,
        remainingBalanceEtb: 0,
        status: 'ACTIVE',
        registeredBy: 'staff_acc_tigist',
        approvedBy: adminUid,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'enr_007',
        studentId: 'stu_007',
        studentCode: 'ZAC-2026-0007',
        studentName: 'Rahel Solomon',
        courseId: 'crs_web_dev',
        courseName: 'Web Development',
        instructorId: 'staff_inst_dawit',
        paymentPlanCode: 'MONTHLY',
        paymentPlanName: 'Monthly Plan (4 Installments)',
        enrollmentDate: today,
        agreedFeeEtb: 24000,
        approvedPaidEtb: 0,
        remainingBalanceEtb: 24000,
        status: 'PENDING',
        registeredBy: 'staff_acc_tigist',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'enr_008',
        studentId: 'stu_008',
        studentCode: 'ZAC-2026-0008',
        studentName: 'Natnael Desta',
        courseId: 'crs_graphics',
        courseName: 'Graphics Design',
        instructorId: 'staff_inst_meron',
        paymentPlanCode: 'THREE_MONTH',
        paymentPlanName: 'Three-Month Plan (3 Installments)',
        enrollmentDate: today,
        agreedFeeEtb: 16000,
        approvedPaidEtb: 0,
        remainingBalanceEtb: 16000,
        status: 'PENDING',
        registeredBy: 'staff_acc_tigist',
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const enr of enrollments) {
      const { id, ...data } = enr;
      batch.set(doc(db, 'enrollments', id), data);
    }

    // Installments (including approaching due in 4 days and overdue 5 days ago)
    const installments = [
      { id: 'inst_001_1', enrollmentId: 'enr_001', studentId: 'stu_001', studentCode: 'ZAC-2026-0001', studentName: 'Selamawit Tesfaye', courseId: 'crs_web_dev', courseName: 'Web Development', installmentNumber: 1, dueDate: dMinus75, amountDueEtb: 6000, amountPaidEtb: 6000, status: 'PAID', createdAt: now, updatedAt: now },
      { id: 'inst_001_2', enrollmentId: 'enr_001', studentId: 'stu_001', studentCode: 'ZAC-2026-0001', studentName: 'Selamawit Tesfaye', courseId: 'crs_web_dev', courseName: 'Web Development', installmentNumber: 2, dueDate: dMinus40, amountDueEtb: 6000, amountPaidEtb: 6000, status: 'PAID', createdAt: now, updatedAt: now },
      { id: 'inst_001_3', enrollmentId: 'enr_001', studentId: 'stu_001', studentCode: 'ZAC-2026-0001', studentName: 'Selamawit Tesfaye', courseId: 'crs_web_dev', courseName: 'Web Development', installmentNumber: 3, dueDate: dMinus12, amountDueEtb: 6000, amountPaidEtb: 6000, status: 'PAID', createdAt: now, updatedAt: now },
      { id: 'inst_001_4', enrollmentId: 'enr_001', studentId: 'stu_001', studentCode: 'ZAC-2026-0001', studentName: 'Selamawit Tesfaye', courseId: 'crs_web_dev', courseName: 'Web Development', installmentNumber: 4, dueDate: dPlus4, amountDueEtb: 6000, amountPaidEtb: 0, status: 'UNPAID', createdAt: now, updatedAt: now },
      { id: 'inst_002_1', enrollmentId: 'enr_002', studentId: 'stu_002', studentCode: 'ZAC-2026-0002', studentName: 'Bereket Alemu', courseId: 'crs_graphics', courseName: 'Graphics Design', installmentNumber: 1, dueDate: dMinus55, amountDueEtb: 8000, amountPaidEtb: 8000, status: 'PAID', createdAt: now, updatedAt: now },
      { id: 'inst_002_2', enrollmentId: 'enr_002', studentId: 'stu_002', studentCode: 'ZAC-2026-0002', studentName: 'Bereket Alemu', courseId: 'crs_graphics', courseName: 'Graphics Design', installmentNumber: 2, dueDate: dMinus5, amountDueEtb: 8000, amountPaidEtb: 0, status: 'OVERDUE', createdAt: now, updatedAt: now },
      { id: 'inst_003_1', enrollmentId: 'enr_003', studentId: 'stu_003', studentCode: 'ZAC-2026-0003', studentName: 'Hanna Girma', courseId: 'crs_digital_mkt', courseName: 'Digital Marketing', installmentNumber: 1, dueDate: dMinus40, amountDueEtb: 12000, amountPaidEtb: 12000, status: 'PAID', createdAt: now, updatedAt: now },
      { id: 'inst_004_1', enrollmentId: 'enr_004', studentId: 'stu_004', studentCode: 'ZAC-2026-0004', studentName: 'Yonas Kebede', courseId: 'crs_photo_video', courseName: 'Photography and Videography', installmentNumber: 1, dueDate: dMinus40, amountDueEtb: 6000, amountPaidEtb: 6000, status: 'PAID', createdAt: now, updatedAt: now },
      { id: 'inst_004_2', enrollmentId: 'enr_004', studentId: 'stu_004', studentCode: 'ZAC-2026-0004', studentName: 'Yonas Kebede', courseId: 'crs_photo_video', courseName: 'Photography and Videography', installmentNumber: 2, dueDate: dMinus2, amountDueEtb: 6000, amountPaidEtb: 0, status: 'OVERDUE', createdAt: now, updatedAt: now },
      { id: 'inst_004_3', enrollmentId: 'enr_004', studentId: 'stu_004', studentCode: 'ZAC-2026-0004', studentName: 'Yonas Kebede', courseId: 'crs_photo_video', courseName: 'Photography and Videography', installmentNumber: 3, dueDate: dPlus20, amountDueEtb: 6000, amountPaidEtb: 0, status: 'UNPAID', createdAt: now, updatedAt: now },
      { id: 'inst_005_1', enrollmentId: 'enr_005', studentId: 'stu_005', studentCode: 'ZAC-2026-0005', studentName: 'Kidist Mekonnen', courseId: 'crs_comp_maint', courseName: 'Computer Maintenance', installmentNumber: 1, dueDate: dMinus25, amountDueEtb: 7500, amountPaidEtb: 7500, status: 'PAID', createdAt: now, updatedAt: now },
      { id: 'inst_005_2', enrollmentId: 'enr_005', studentId: 'stu_005', studentCode: 'ZAC-2026-0005', studentName: 'Kidist Mekonnen', courseId: 'crs_comp_maint', courseName: 'Computer Maintenance', installmentNumber: 2, dueDate: dPlus4, amountDueEtb: 7000, amountPaidEtb: 0, status: 'UNPAID', createdAt: now, updatedAt: now },
      { id: 'inst_006_1', enrollmentId: 'enr_006', studentId: 'stu_006', studentCode: 'ZAC-2026-0006', studentName: 'Abel Fikadu', courseId: 'crs_languages', courseName: 'Language Courses (Business English)', installmentNumber: 1, dueDate: dMinus12, amountDueEtb: 9000, amountPaidEtb: 9000, status: 'PAID', createdAt: now, updatedAt: now },
    ];
    for (const inst of installments) {
      const { id, ...data } = inst;
      batch.set(doc(db, 'payment_installments', id), data);
    }

    // 7. Approved Payments + Official Receipts + Pending & Rejected Payments
    const approvedPayments = [
      {
        id: 'pay_001',
        transactionRef: 'CBE-2026-88101',
        enrollmentId: 'enr_001',
        studentId: 'stu_001',
        studentCode: 'ZAC-2026-0001',
        studentName: 'Selamawit Tesfaye',
        studentPhone: '+251 911 432 876',
        courseId: 'crs_web_dev',
        courseName: 'Web Development',
        amountEtb: 12000,
        previousBalanceEtb: 24000,
        remainingBalanceEtb: 12000,
        paymentDate: dMinus75,
        paymentMethod: 'CBE Birr' as const,
        receiptId: 'rcp_001',
        receiptNumber: 'RCP-2026-0001',
      },
      {
        id: 'pay_002',
        transactionRef: 'TLB-2026-44109',
        enrollmentId: 'enr_002',
        studentId: 'stu_002',
        studentCode: 'ZAC-2026-0002',
        studentName: 'Bereket Alemu',
        studentPhone: '+251 912 885 210',
        courseId: 'crs_graphics',
        courseName: 'Graphics Design',
        amountEtb: 8000,
        previousBalanceEtb: 16000,
        remainingBalanceEtb: 8000,
        paymentDate: dMinus55,
        paymentMethod: 'Telebirr' as const,
        receiptId: 'rcp_002',
        receiptNumber: 'RCP-2026-0002',
      },
      {
        id: 'pay_003',
        transactionRef: 'BNK-2026-77312',
        enrollmentId: 'enr_003',
        studentId: 'stu_003',
        studentCode: 'ZAC-2026-0003',
        studentName: 'Hanna Girma',
        studentPhone: '+251 913 704 119',
        courseId: 'crs_digital_mkt',
        courseName: 'Digital Marketing',
        amountEtb: 12000,
        previousBalanceEtb: 12000,
        remainingBalanceEtb: 0,
        paymentDate: dMinus40,
        paymentMethod: 'Bank Transfer' as const,
        receiptId: 'rcp_003',
        receiptNumber: 'RCP-2026-0003',
      },
      {
        id: 'pay_004',
        transactionRef: 'CSH-2026-10291',
        enrollmentId: 'enr_004',
        studentId: 'stu_004',
        studentCode: 'ZAC-2026-0004',
        studentName: 'Yonas Kebede',
        studentPhone: '+251 911 903 552',
        courseId: 'crs_photo_video',
        courseName: 'Photography and Videography',
        amountEtb: 6000,
        previousBalanceEtb: 18000,
        remainingBalanceEtb: 12000,
        paymentDate: dMinus40,
        paymentMethod: 'Cash' as const,
        receiptId: 'rcp_004',
        receiptNumber: 'RCP-2026-0004',
      },
      {
        id: 'pay_005',
        transactionRef: 'CBE-2026-99142',
        enrollmentId: 'enr_005',
        studentId: 'stu_005',
        studentCode: 'ZAC-2026-0005',
        studentName: 'Kidist Mekonnen',
        studentPhone: '+251 914 331 902',
        courseId: 'crs_comp_maint',
        courseName: 'Computer Maintenance',
        amountEtb: 7500,
        previousBalanceEtb: 14500,
        remainingBalanceEtb: 7000,
        paymentDate: dMinus25,
        paymentMethod: 'CBE Birr' as const,
        receiptId: 'rcp_005',
        receiptNumber: 'RCP-2026-0005',
      },
      {
        id: 'pay_006',
        transactionRef: 'TLB-2026-55301',
        enrollmentId: 'enr_001',
        studentId: 'stu_001',
        studentCode: 'ZAC-2026-0001',
        studentName: 'Selamawit Tesfaye',
        studentPhone: '+251 911 432 876',
        courseId: 'crs_web_dev',
        courseName: 'Web Development',
        amountEtb: 6000,
        previousBalanceEtb: 12000,
        remainingBalanceEtb: 6000,
        paymentDate: dMinus12,
        paymentMethod: 'Telebirr' as const,
        receiptId: 'rcp_006',
        receiptNumber: 'RCP-2026-0006',
      },
      {
        id: 'pay_007',
        transactionRef: 'BNK-2026-88420',
        enrollmentId: 'enr_006',
        studentId: 'stu_006',
        studentCode: 'ZAC-2026-0006',
        studentName: 'Abel Fikadu',
        studentPhone: '+251 911 670 432',
        courseId: 'crs_languages',
        courseName: 'Language Courses (Business English)',
        amountEtb: 9000,
        previousBalanceEtb: 9000,
        remainingBalanceEtb: 0,
        paymentDate: dMinus12,
        paymentMethod: 'Bank Transfer' as const,
        receiptId: 'rcp_007',
        receiptNumber: 'RCP-2026-0007',
      },
    ];

    for (const p of approvedPayments) {
      batch.set(doc(db, 'payments', p.id), {
        transactionRef: p.transactionRef,
        enrollmentId: p.enrollmentId,
        studentId: p.studentId,
        studentCode: p.studentCode,
        studentName: p.studentName,
        courseId: p.courseId,
        courseName: p.courseName,
        amountEtb: p.amountEtb,
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
        recordedBy: 'staff_acc_tigist',
        recordedByName: 'Tigist Bekele',
        status: 'APPROVED',
        approvedBy: adminUid,
        approvedByName: adminName,
        approvalDate: p.paymentDate,
        receiptId: p.receiptId,
        receiptNumber: p.receiptNumber,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(doc(db, 'payment_refs', sanitizeRefId(p.transactionRef)), {
        paymentId: p.id,
        transactionRef: p.transactionRef,
        recordedBy: 'staff_acc_tigist',
        createdAt: now,
      });

      batch.set(doc(db, 'receipts', p.receiptId), {
        receiptNumber: p.receiptNumber,
        paymentId: p.id,
        transactionRef: p.transactionRef,
        studentId: p.studentId,
        studentCode: p.studentCode,
        studentName: p.studentName,
        studentPhone: p.studentPhone,
        courseName: p.courseName,
        previousBalanceEtb: p.previousBalanceEtb,
        amountPaidEtb: p.amountEtb,
        remainingBalanceEtb: p.remainingBalanceEtb,
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
        authorizedBy: adminName,
        verificationHash: generateVerificationHash(p.receiptNumber, p.transactionRef, p.amountEtb),
        issuedAt: now,
      });
    }

    // Pending Payments (Waiting for Admin approval — NOT counted in official income!)
    const pendingPayments = [
      {
        id: 'pay_008',
        transactionRef: 'TLB-2026-61920',
        enrollmentId: 'enr_002',
        studentId: 'stu_002',
        studentCode: 'ZAC-2026-0002',
        studentName: 'Bereket Alemu',
        courseId: 'crs_graphics',
        courseName: 'Graphics Design',
        amountEtb: 4000,
        paymentDate: today,
        paymentMethod: 'Telebirr' as const,
        notes: 'Partial installment #2 submitted at front desk.',
      },
      {
        id: 'pay_009',
        transactionRef: 'CBE-2026-99511',
        enrollmentId: 'enr_004',
        studentId: 'stu_004',
        studentCode: 'ZAC-2026-0004',
        studentName: 'Yonas Kebede',
        courseId: 'crs_photo_video',
        courseName: 'Photography and Videography',
        amountEtb: 6000,
        paymentDate: today,
        paymentMethod: 'CBE Birr' as const,
        notes: 'Second installment transfer awaiting bank slip verification.',
      },
    ];
    for (const p of pendingPayments) {
      batch.set(doc(db, 'payments', p.id), {
        transactionRef: p.transactionRef,
        enrollmentId: p.enrollmentId,
        studentId: p.studentId,
        studentCode: p.studentCode,
        studentName: p.studentName,
        courseId: p.courseId,
        courseName: p.courseName,
        amountEtb: p.amountEtb,
        paymentDate: p.paymentDate,
        paymentMethod: p.paymentMethod,
        recordedBy: 'staff_acc_tigist',
        recordedByName: 'Tigist Bekele',
        status: 'PENDING',
        notes: p.notes,
        createdAt: now,
        updatedAt: now,
      });
      batch.set(doc(db, 'payment_refs', sanitizeRefId(p.transactionRef)), {
        paymentId: p.id,
        transactionRef: p.transactionRef,
        recordedBy: 'staff_acc_tigist',
        createdAt: now,
      });
    }

    // Rejected Payment Sample
    batch.set(doc(db, 'payments', 'pay_010'), {
      transactionRef: 'CSH-2026-10998',
      enrollmentId: 'enr_005',
      studentId: 'stu_005',
      studentCode: 'ZAC-2026-0005',
      studentName: 'Kidist Mekonnen',
      courseId: 'crs_comp_maint',
      courseName: 'Computer Maintenance',
      amountEtb: 3500,
      paymentDate: dMinus5,
      paymentMethod: 'Bank Transfer',
      recordedBy: 'staff_acc_tigist',
      recordedByName: 'Tigist Bekele',
      status: 'REJECTED',
      approvedBy: adminUid,
      approvedByName: adminName,
      approvalDate: dMinus5,
      rejectionReason: 'Bank reference slip amount did not match transfer confirmation.',
      createdAt: now,
      updatedAt: now,
    });
    batch.set(doc(db, 'payment_refs', sanitizeRefId('CSH-2026-10998')), {
      paymentId: 'pay_010',
      transactionRef: 'CSH-2026-10998',
      recordedBy: 'staff_acc_tigist',
      createdAt: now,
    });

    // 8. Institutional Expenses
    const expenses = [
      { id: 'exp_001', categoryId: 'expcat_rent', categoryName: 'Campus Facility Rent', title: 'Bole Main Training Campus Monthly Lease', amountEtb: 18000, expenseDate: dMinus55, paymentMethod: 'Bank Transfer', referenceNo: 'EXP-RENT-01', recordedBy: adminUid, recordedByName: adminName, notes: 'Monthly lease payment', createdAt: now },
      { id: 'exp_002', categoryId: 'expcat_stipend', categoryName: 'Instructor Salaries & Stipends', title: 'Faculty Monthly Payroll — Senior Trainers', amountEtb: 15500, expenseDate: dMinus25, paymentMethod: 'Bank Transfer', referenceNo: 'EXP-PAY-02', recordedBy: adminUid, recordedByName: adminName, notes: 'Web Dev and Design cohorts', createdAt: now },
      { id: 'exp_003', categoryId: 'expcat_utilities', categoryName: 'Utilities & Fiber Internet', title: 'Ethio Telecom Enterprise Fiber + Electricity', amountEtb: 4200, expenseDate: dMinus12, paymentMethod: 'CBE Birr', referenceNo: 'EXP-UTL-03', recordedBy: adminUid, recordedByName: adminName, notes: 'Lab 1 & Lab 2 connectivity', createdAt: now },
      { id: 'exp_004', categoryId: 'expcat_hardware', categoryName: 'Lab Equipment & Maintenance', title: 'Workstation RAM Upgrades & Studio Softbox', amountEtb: 6800, expenseDate: dMinus5, paymentMethod: 'Cash', referenceNo: 'EXP-LAB-04', recordedBy: adminUid, recordedByName: adminName, notes: 'Graphics & Video lab maintenance', createdAt: now },
    ];
    for (const e of expenses) {
      const { id, ...data } = e;
      batch.set(doc(db, 'expenses', id), data);
    }

    // 9. Attendance Records
    const attendanceRows = [
      { id: `att_enr_001_${dMinus2}`, enrollmentId: 'enr_001', studentId: 'stu_001', studentCode: 'ZAC-2026-0001', studentName: 'Selamawit Tesfaye', courseId: 'crs_web_dev', courseName: 'Web Development', attendanceDate: dMinus2, status: 'PRESENT', recordedBy: 'staff_inst_dawit', recordedByName: 'Dawit Hailu', remarks: 'Completed React lab exercise', createdAt: now, updatedAt: now },
      { id: `att_enr_001_${today}`, enrollmentId: 'enr_001', studentId: 'stu_001', studentCode: 'ZAC-2026-0001', studentName: 'Selamawit Tesfaye', courseId: 'crs_web_dev', courseName: 'Web Development', attendanceDate: today, status: 'PRESENT', recordedBy: 'staff_inst_dawit', recordedByName: 'Dawit Hailu', createdAt: now, updatedAt: now },
      { id: `att_enr_002_${dMinus2}`, enrollmentId: 'enr_002', studentId: 'stu_002', studentCode: 'ZAC-2026-0002', studentName: 'Bereket Alemu', courseId: 'crs_graphics', courseName: 'Graphics Design', attendanceDate: dMinus2, status: 'LATE', recordedBy: 'staff_inst_meron', recordedByName: 'Meron Tadesse', remarks: 'Arrived 15 mins late', createdAt: now, updatedAt: now },
      { id: `att_enr_003_${dMinus2}`, enrollmentId: 'enr_003', studentId: 'stu_003', studentCode: 'ZAC-2026-0003', studentName: 'Hanna Girma', courseId: 'crs_digital_mkt', courseName: 'Digital Marketing', attendanceDate: dMinus2, status: 'PRESENT', recordedBy: 'staff_inst_meron', recordedByName: 'Meron Tadesse', createdAt: now, updatedAt: now },
      { id: `att_enr_004_${dMinus2}`, enrollmentId: 'enr_004', studentId: 'stu_004', studentCode: 'ZAC-2026-0004', studentName: 'Yonas Kebede', courseId: 'crs_photo_video', courseName: 'Photography and Videography', attendanceDate: dMinus2, status: 'EXCUSED', recordedBy: 'staff_inst_meron', recordedByName: 'Meron Tadesse', remarks: 'Submitted medical note', createdAt: now, updatedAt: now },
      { id: `att_enr_005_${today}`, enrollmentId: 'enr_005', studentId: 'stu_005', studentCode: 'ZAC-2026-0005', studentName: 'Kidist Mekonnen', courseId: 'crs_comp_maint', courseName: 'Computer Maintenance', attendanceDate: today, status: 'PRESENT', recordedBy: 'staff_inst_dawit', recordedByName: 'Dawit Hailu', createdAt: now, updatedAt: now },
      { id: `att_enr_006_${today}`, enrollmentId: 'enr_006', studentId: 'stu_006', studentCode: 'ZAC-2026-0006', studentName: 'Abel Fikadu', courseId: 'crs_languages', courseName: 'Language Courses (Business English)', attendanceDate: today, status: 'ABSENT', recordedBy: 'staff_inst_meron', recordedByName: 'Meron Tadesse', remarks: 'No prior notice', createdAt: now, updatedAt: now },
    ];
    for (const a of attendanceRows) {
      const { id, ...data } = a;
      batch.set(doc(db, 'attendance', id), data);
    }

    // 10. Notifications
    const notifications = [
      {
        id: 'not_001',
        type: 'PENDING_REGISTRATION',
        title: '2 Student Registrations Awaiting Approval',
        message: 'Rahel Solomon (ZAC-2026-0007) and Natnael Desta (ZAC-2026-0008) were submitted by Tigist Bekele for review.',
        targetRole: 'ADMIN',
        entityType: 'student',
        entityId: 'stu_007',
        isRead: false,
        createdAt: now,
      },
      {
        id: 'not_002',
        type: 'PENDING_PAYMENT',
        title: '2 Payments Pending Admin Verification',
        message: 'ETB 4,000.00 (Bereket Alemu) and ETB 6,000.00 (Yonas Kebede) require approval before receipts can be issued.',
        targetRole: 'ADMIN',
        entityType: 'payment',
        entityId: 'pay_008',
        isRead: false,
        createdAt: now,
      },
      {
        id: 'not_003',
        type: 'REJECTED_PAYMENT',
        title: 'Payment CSH-2026-10998 Rejected',
        message: 'Kidist Mekonnen ETB 3,500.00 rejected: Bank reference slip amount did not match transfer confirmation.',
        targetRole: 'ACCOUNTANT',
        entityType: 'payment',
        entityId: 'pay_010',
        isRead: false,
        createdAt: now,
      },
      {
        id: 'not_004',
        type: 'OVERDUE_BALANCE',
        title: 'Overdue Installment Alert',
        message: 'Bereket Alemu (ZAC-2026-0002) and Yonas Kebede (ZAC-2026-0004) have overdue installments requiring follow-up.',
        targetRole: 'ALL',
        entityType: 'installment',
        entityId: 'inst_002_2',
        isRead: false,
        createdAt: now,
      },
      {
        id: 'not_005',
        type: 'DEADLINE_APPROACHING',
        title: 'Upcoming Payment Deadlines (Next 7 Days)',
        message: 'Selamawit Tesfaye (ETB 6,000) and Kidist Mekonnen (ETB 7,000) have installments due in 4 days.',
        targetRole: 'ALL',
        entityType: 'installment',
        entityId: 'inst_001_4',
        isRead: false,
        createdAt: now,
      },
    ];
    for (const n of notifications) {
      const { id, ...data } = n;
      batch.set(doc(db, 'notifications', id), data);
    }

    // 11. Initial Immutable Audit Log
    batch.set(doc(db, 'audit_logs', 'audit_init_001'), {
      actorId: adminUid,
      actorName: adminName,
      actorRole: 'ADMIN',
      action: 'SYSTEM_INITIALIZED',
      entityType: 'system',
      entityId: 'zacma_portal',
      summary: 'Initialized ZACMA Technology & Training Institute course catalog, payment plans, and baseline ledger.',
      createdAt: now,
    });

    // 12. Baseline Schema Migration Record
    batch.set(doc(db, 'schema_migrations', '0001_initial_zacma_schema'), {
      version: '0001',
      name: '0001_initial_zacma_schema',
      appliedAt: now,
      appliedBy: adminName,
      status: 'APPLIED',
      notes: 'Baseline ZACMA institutional collections, courses, students, enrollments, payments, receipts, expenses, attendance, and audit logs.',
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'seed_initialization');
  }
}
