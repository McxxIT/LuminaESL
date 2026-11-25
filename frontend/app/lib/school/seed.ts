import {
  defaultTeacherProfile,
  managerLessonMaterials,
  studentAssignments,
  studentTransactionSeed,
  teacherClosedSlotsSeed,
  teacherCurriculumSeed,
  teacherLessonsSeed,
  teacherOpenedSlotsSeed,
  teacherStudentsSeed,
} from "../data";
import { addMinutes, isoDaysFromNow } from "../student";
import {
  SCHOOL_SCHEMA_VERSION,
  type Course,
  type Assignment,
  type CourseUnit,
  type CreditLedgerEntry,
  type Enrollment,
  type Lesson,
  type LessonPlan,
  type Rating,
  type SchoolData,
  type SchoolRequest,
  type SchoolSettings,
  type SchoolUser,
  type SlotOpening,
  type StudentProfileRecord,
  type TeacherAbsence,
  type TeacherProfileRecord,
} from "./types";

/**
 * Demo school (ADMIN_PLAN.md section 8): 1 admin, 2 managers with 2 teachers each, 12 students,
 * curriculum courses, and Alex Johnson's existing lessons, slots, requests, ratings, and absence.
 * Ids of students and lessons match the old teacher workspace so migration can map them 1:1.
 */

export const SEED_IDS = {
  admin: "admin-jamie",
  managerPriya: "manager-priya",
  managerMarco: "manager-marco",
  teacherAlex: "teacher-alex",
  teacherGrace: "teacher-grace",
  teacherDaniel: "teacher-daniel",
  teacherSara: "teacher-sara",
  coreCourse: "course-core-1to1",
} as const;

export function defaultSchoolSettings(): SchoolSettings {
  return {
    schoolName: "Lumina ESL",
    onTheSpotCancellationHours: 2,
    performanceWindowDays: 30,
    bookingDayStart: "08:00",
    bookingDayEnd: "23:30",
    studentLateCancellationHours: 24,
    refundTeacherCancellations: true,
  };
}

type Collections = SchoolData["collections"];

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function user(id: string, role: SchoolUser["role"], name: string, email: string, avatarColor: string, now: string, status: SchoolUser["status"] = "active"): SchoolUser {
  return { id, role, name, email, status, avatarColor, createdAt: now };
}

/** Name -> id for people referenced by name in the legacy seeds. */
function legacyPersonId(name: string | undefined) {
  if (name === "Alex Johnson") return SEED_IDS.teacherAlex;
  return SEED_IDS.admin; // Legacy reviews/assignments were all made by "Jamie Smith", now the admin.
}

export function createSeedSchool(now = new Date().toISOString()): SchoolData {
  const { admin, managerPriya, managerMarco, teacherAlex, teacherGrace, teacherDaniel, teacherSara, coreCourse } = SEED_IDS;

  // People ----------------------------------------------------------------------------------
  const extraStudents = [
    { id: "student-leo", name: "Leo Fischer", email: "leo.fischer@lumina.school", color: "mint", level: "A2 Elementary", target: "B1 Intermediate", goal: "Order and chat confidently while travelling", teacher: teacherGrace },
    { id: "student-amara", name: "Amara Nwosu", email: "amara.nwosu@lumina.school", color: "lavender", level: "B1 Intermediate", target: "B2 Upper intermediate", goal: "Pass a customer-service job interview", teacher: teacherGrace },
    { id: "student-kenji", name: "Kenji Watanabe", email: "kenji.watanabe@lumina.school", color: "indigo", level: "B2 Upper intermediate", target: "C1 Advanced", goal: "Score 7.0 overall in IELTS", teacher: teacherDaniel },
    { id: "student-isabella", name: "Isabella Rossi", email: "isabella.rossi@lumina.school", color: "peach", level: "B1 Intermediate", target: "B2 Upper intermediate", goal: "Write clear emails to international clients", teacher: teacherSara },
  ];

  const users: SchoolUser[] = [
    user(admin, "admin", "Jamie Smith", "admin@lumina.school", "indigo", now),
    user(managerPriya, "manager", "Priya Raman", "manager@lumina.school", "lavender", now),
    user(managerMarco, "manager", "Marco Bianchi", "manager2@lumina.school", "mint", now),
    user(teacherAlex, "teacher", "Alex Johnson", "teacher@lumina.school", "peach", now),
    user(teacherGrace, "teacher", "Grace Lee", "grace.lee@lumina.school", "mint", now),
    user(teacherDaniel, "teacher", "Daniel Okafor", "daniel.okafor@lumina.school", "indigo", now),
    user(teacherSara, "teacher", "Sara Novak", "sara.novak@lumina.school", "lavender", now),
    ...teacherStudentsSeed.map((student) => user(student.id, "student", student.name, student.email, student.avatarColor, now, student.status === "paused" ? "paused" : "active")),
    ...extraStudents.map((student) => user(student.id, "student", student.name, student.email, student.color, now)),
  ];

  const alexDefaults = defaultTeacherProfile({ email: "teacher@lumina.school", role: "teacher", name: "Alex Johnson" });
  const teacherProfiles: TeacherProfileRecord[] = [
    { id: teacherAlex, userId: teacherAlex, managerId: managerPriya, headline: alexDefaults.headline, specializations: alexDefaults.specializations, languages: alexDefaults.languages, bio: alexDefaults.bio, hireDate: "2023-01-09", weeklyGoalHours: alexDefaults.weeklyGoalHours },
    { id: teacherGrace, userId: teacherGrace, managerId: managerPriya, headline: "Conversation and travel English", specializations: ["Conversation", "Travel English", "Pronunciation"], languages: ["English", "Korean"], bio: "Relaxed, practical lessons that get beginners speaking from minute one.", hireDate: "2024-03-04", weeklyGoalHours: 18 },
    { id: teacherDaniel, userId: teacherDaniel, managerId: managerMarco, headline: "IELTS and academic English", specializations: ["IELTS", "Academic writing", "Exam strategy"], languages: ["English", "Yoruba"], bio: "Former IELTS examiner focused on measurable band-score gains.", hireDate: "2022-09-12", weeklyGoalHours: 22 },
    { id: teacherSara, userId: teacherSara, managerId: managerMarco, headline: "Business writing and email", specializations: ["Business English", "Writing", "Presentations"], languages: ["English", "Czech", "German"], bio: "Helps professionals write and present with clarity.", hireDate: "2025-01-20", weeklyGoalHours: 20 },
  ];

  const guardians: Record<string, StudentProfileRecord["guardian"]> = {
    "student-mia": { name: "Wei Chen", email: "wei.chen@example.com", relationship: "Parent" },
    "student-ava": { name: "Lucia Rodriguez", email: "lucia.rodriguez@example.com", relationship: "Parent" },
    "student-leo": { name: "Anna Fischer", email: "anna.fischer@example.com", relationship: "Parent" },
  };

  const studentProfiles: StudentProfileRecord[] = [
    ...teacherStudentsSeed.map((student) => ({ id: student.id, userId: student.id, managerId: managerPriya, level: student.level, targetLevel: student.targetLevel, goal: student.goal, guardian: guardians[student.id] })),
    ...extraStudents.map((student) => ({
      id: student.id,
      userId: student.id,
      managerId: student.teacher === teacherGrace ? managerPriya : managerMarco,
      level: student.level,
      targetLevel: student.target,
      goal: student.goal,
      guardian: guardians[student.id],
    })),
  ];

  // Curriculum ------------------------------------------------------------------------------
  const courses: Course[] = [];
  const courseUnits: CourseUnit[] = [];
  const lessonPlans: LessonPlan[] = [];

  // Core course built from the manager-assigned lesson materials teachers download today.
  courses.push({ id: coreCourse, title: "Core 1:1 lessons", level: "A2-C1", summary: "Ready-to-teach 25-minute lesson plans used across 1:1 programs.", objectives: ["Speak with more confidence each lesson", "Leave every lesson with corrections and homework"], status: "published", ownerId: admin, createdAt: now, updatedAt: now });
  courseUnits.push({ id: `${coreCourse}-unit-1`, courseId: coreCourse, order: 1, title: "Lesson plans" });
  const uniqueMaterials = [...new Map(Object.values(managerLessonMaterials).map((material) => [material.id, material])).values()];
  uniqueMaterials.forEach((material, index) => {
    lessonPlans.push({ id: `plan-${material.id}`, unitId: `${coreCourse}-unit-1`, order: index + 1, title: material.title, focus: [], summary: material.summary, sections: material.sections, attachmentIds: [], updatedAt: now });
  });

  // One course per legacy curriculum unit (draft units stay draft).
  teacherCurriculumSeed.forEach((unit) => {
    const courseId = `course-${unit.id}`;
    const unitId = `${courseId}-unit-1`;
    courses.push({ id: courseId, title: unit.title, level: unit.level, summary: unit.summary, objectives: unit.objectives, status: unit.status === "published" ? "published" : "draft", ownerId: managerPriya, createdAt: now, updatedAt: now });
    courseUnits.push({ id: unitId, courseId, order: 1, title: "Core sequence" });
    unit.lessons.forEach((lesson, index) => {
      lessonPlans.push({ id: `plan-${lesson.id}`, unitId, order: index + 1, title: lesson.title, focus: [lesson.focus], summary: `${lesson.focus} focus.`, sections: [], attachmentIds: [], updatedAt: now });
    });
  });

  const planIdForTitle = (title: string) => {
    const material = managerLessonMaterials[title];
    return material ? `plan-${material.id}` : undefined;
  };

  // Enrollments: every Alex student follows the core course; other teachers' students too.
  const enrollments: Enrollment[] = [
    ...teacherStudentsSeed.map((student) => ({ id: `enrollment-${student.id}`, studentId: student.id, teacherId: teacherAlex, courseId: coreCourse, nextPlanIndex: 0, status: student.status === "paused" ? "paused" as const : "active" as const, startedAt: now })),
    ...extraStudents.map((student) => ({ id: `enrollment-${student.id}`, studentId: student.id, teacherId: student.teacher, courseId: coreCourse, nextPlanIndex: 0, status: "active" as const, startedAt: now })),
  ];
  const enrollmentFor = (studentId: string | undefined) => enrollments.find((item) => item.studentId === studentId);

  // Lessons and everything hanging off them -------------------------------------------------
  const lessons: Lesson[] = [];
  const requests: SchoolRequest[] = [];
  const ratings: Rating[] = [];
  const absences: TeacherAbsence[] = [];

  teacherLessonsSeed.forEach((legacy) => {
    const studentId = legacy.studentId ?? "";
    lessons.push({
      id: legacy.id,
      enrollmentId: enrollmentFor(studentId)?.id,
      teacherId: teacherAlex,
      studentId,
      date: legacy.date,
      time: legacy.time,
      endTime: legacy.endTime,
      title: legacy.title,
      focus: legacy.focus,
      status: legacy.status,
      roomCode: legacy.roomCode,
      lessonPlanId: planIdForTitle(legacy.title),
      planAttachedBy: legacy.material ? legacyPersonId(legacy.material.assignedBy) : undefined,
      planAttachedAt: legacy.material ? `${legacy.material.assignedAt}T09:00:00.000Z` : undefined,
      notes: legacy.notes,
      homework: legacy.homework,
      attendance: legacy.attendance,
      feedback: legacy.feedback,
      cancelReason: legacy.cancelReason,
      createdBy: studentId || teacherAlex,
      createdAt: now,
    });

    if (legacy.cancellation) {
      const c = legacy.cancellation;
      requests.push({ id: `request-cancel-${legacy.id}`, type: "lesson-cancellation", lessonId: legacy.id, teacherId: teacherAlex, reason: c.reason, comment: c.comment, status: c.status, requestedAt: c.requestedAt, requestedBy: legacyPersonId(c.requestedBy), reviewedBy: c.reviewedBy ? legacyPersonId(c.reviewedBy) : undefined, reviewedAt: c.reviewedAt, reviewNote: c.reviewNote });
    }
    legacy.ratings?.forEach((rating, index) => {
      ratings.push({ id: `rating-${legacy.id}-${index}`, lessonId: legacy.id, teacherId: teacherAlex, studentId, from: rating.from, authorId: rating.from === "student" ? studentId : undefined, authorName: rating.name, score: rating.score, comment: rating.comment, createdAt: `${rating.ratedAt}T12:00:00.000Z` });
    });
    if (legacy.teacherAbsence) {
      absences.push({ id: `absence-${legacy.id}`, lessonId: legacy.id, teacherId: teacherAlex, note: legacy.teacherAbsence.note, reportedBy: SEED_IDS.managerPriya, reportedAt: legacy.teacherAbsence.reportedAt });
    }
  });

  // Upcoming lessons for Mia (the demo student) with Alex, on slots Alex has opened.
  const otherLessons: [string, string, number, string, string, Lesson["status"]][] = [
    ["lesson-mia-1", "student-mia", 1, "14:30", "Business English", "scheduled"],
    ["lesson-mia-2", "student-mia", 2, "14:00", "Conversation practice", "scheduled"],
    // A few lessons for the other teachers so manager views are not empty.
    ["lesson-grace-1", "student-leo", 0, "10:00", "Conversation practice", "scheduled"],
    ["lesson-grace-2", "student-amara", 1, "14:00", "Interview preparation", "scheduled"],
    ["lesson-grace-3", "student-leo", -2, "10:00", "Conversation practice", "completed"],
    ["lesson-daniel-1", "student-kenji", 0, "16:30", "IELTS Speaking", "scheduled"],
    ["lesson-daniel-2", "student-kenji", -3, "16:30", "IELTS Speaking", "completed"],
    ["lesson-sara-1", "student-isabella", 2, "11:00", "Business English", "scheduled"],
  ];
  otherLessons.forEach(([id, studentId, offset, time, title, status]) => {
    const enrollment = enrollmentFor(studentId);
    lessons.push({ id, enrollmentId: enrollment?.id, teacherId: enrollment?.teacherId ?? teacherGrace, studentId, date: isoDaysFromNow(offset), time, endTime: addMinutes(time, 25), title, focus: [title], status, roomCode: `ESL-${2000 + lessons.length}`, lessonPlanId: planIdForTitle(title), planAttachedBy: planIdForTitle(title) ? admin : undefined, planAttachedAt: planIdForTitle(title) ? now : undefined, attendance: status === "completed" ? "attended" : undefined, createdBy: studentId, createdAt: now });
  });
  ratings.push({ id: "rating-lesson-grace-3-0", lessonId: "lesson-grace-3", teacherId: teacherGrace, studentId: "student-leo", from: "parent", authorName: "Anna Fischer", score: 5, comment: "Leo was excited to practise ordering food!", createdAt: now });
  ratings.push({ id: "rating-lesson-daniel-2-0", lessonId: "lesson-daniel-2", teacherId: teacherDaniel, studentId: "student-kenji", from: "student", authorId: "student-kenji", authorName: "Kenji Watanabe", score: 4, createdAt: now });

  // Course progress starts where each student already is: one step per completed lesson that had a plan.
  const corePlanCount = lessonPlans.filter((plan) => plan.unitId === `${coreCourse}-unit-1`).length;
  enrollments.forEach((enrollment) => {
    const taught = lessons.filter((lesson) => lesson.enrollmentId === enrollment.id && lesson.status === "completed" && lesson.lessonPlanId).length;
    enrollment.nextPlanIndex = Math.min(taught, corePlanCount);
  });

  // Slots and closure requests --------------------------------------------------------------
  const slotOpenings: SlotOpening[] = teacherOpenedSlotsSeed.map((opening) => ({ id: opening.id, teacherId: teacherAlex, date: opening.date, time: opening.time, openedAt: opening.openedAt, openedBy: teacherAlex }));
  teacherClosedSlotsSeed.forEach((closure) => {
    requests.push({ id: closure.id, type: "slot-closure", teacherId: teacherAlex, date: closure.date, time: closure.time, reason: closure.reason, status: closure.status, requestedAt: closure.requestedAt, requestedBy: legacyPersonId(closure.requestedBy), reviewedBy: closure.reviewedBy ? legacyPersonId(closure.reviewedBy) : undefined, reviewedAt: closure.reviewedAt, reviewNote: closure.reviewNote });
  });

  // Homework --------------------------------------------------------------------------------
  // Mia's assignments, plus homework already on Alex's roster for his other students. All set by Alex.
  const assignmentState = { pending: "assigned", submitted: "submitted", graded: "reviewed" } as const;
  const assignments: Assignment[] = studentAssignments.map((item) => ({
    id: item.id, studentId: "student-mia", teacherId: teacherAlex, title: item.title, type: item.type, description: item.description,
    instructions: item.instructions, dueLabel: item.dueLabel, status: assignmentState[item.status], response: item.response,
    submittedAt: item.submittedAt ? now : undefined, feedback: item.feedback, grade: item.grade, reviewedAt: item.status === "graded" ? now : undefined, createdAt: now,
  }));
  teacherStudentsSeed.filter((student) => student.id !== "student-mia").forEach((student) => student.homework.forEach((item) => {
    assignments.push({
      id: item.id, studentId: student.id, teacherId: teacherAlex, title: item.title, type: "writing", description: item.title,
      instructions: "Complete the task and submit your work before the next lesson.", dueLabel: item.dueLabel, status: item.status,
      feedback: item.feedback, submittedAt: item.status !== "assigned" ? now : undefined, reviewedAt: item.status === "reviewed" ? now : undefined, createdAt: now,
    });
  }));

  // Credits ---------------------------------------------------------------------------------
  const credits: CreditLedgerEntry[] = [];
  studentTransactionSeed.forEach((txn) => {
    credits.push({ id: `credit-${txn.id}`, studentId: "student-mia", hours: txn.hours, amount: txn.amount, reason: txn.status === "refunded" ? "refund" : "purchase", description: txn.description, actorId: "student-mia", createdAt: new Date(txn.date).toISOString() });
  });
  // Brings Mia to the 24 credits (one per lesson) the student workspace starts with today.
  const miaTotal = studentTransactionSeed.reduce((total, txn) => total + txn.hours, 0);
  credits.push({ id: "credit-mia-reconcile", studentId: "student-mia", hours: Number((24 - miaTotal).toFixed(2)), reason: "adjustment", description: "Lessons booked before the shared ledger", actorId: admin, createdAt: now });
  users.filter((item) => item.role === "student" && item.id !== "student-mia").forEach((student) => {
    credits.push({ id: `credit-${student.id}-start`, studentId: student.id, hours: 10, amount: 140, reason: "purchase", description: "Monthly credit renewal", actorId: student.id, createdAt: now });
  });

  const collections: Collections = {
    users: byId(users),
    teacherProfiles: byId(teacherProfiles),
    studentProfiles: byId(studentProfiles),
    courses: byId(courses),
    courseUnits: byId(courseUnits),
    lessonPlans: byId(lessonPlans),
    attachments: {},
    enrollments: byId(enrollments),
    lessons: byId(lessons),
    slotOpenings: byId(slotOpenings),
    requests: byId(requests),
    absences: byId(absences),
    ratings: byId(ratings),
    assignments: byId(assignments),
    credits: byId(credits),
    activity: byId([{ id: "activity-seed", actorId: admin, action: "school.seeded", targetType: "school", targetId: "lumina", summary: "Demo school created", createdAt: now }]),
  };

  return { version: SCHOOL_SCHEMA_VERSION, seededAt: now, settings: defaultSchoolSettings(), collections };
}
