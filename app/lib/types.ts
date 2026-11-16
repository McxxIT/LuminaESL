export type Role = "admin" | "manager" | "teacher" | "student";

export type Account = {
  email: string;
  role: Role;
  name: string;
};

export type StudentLessonStatus = "upcoming" | "completed" | "cancelled";

export type StudentLesson = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  duration: number;
  title: string;
  tutor: string;
  /** Teacher's user id in the shared school store. */
  tutorId?: string;
  tutorInitials: string;
  tutorColor: string;
  focus: string[];
  status: StudentLessonStatus;
  roomCode?: string;
  notes?: string;
  homework?: string;
  feedback?: string;
  corrections?: { from: string; to: string }[];
  scores?: { label: string; value: number }[];
  cancelReason?: string;
  attendance?: "attended" | "no-show";
  /** Ratings this lesson received from the student and/or their parent. */
  ratings?: { from: "student" | "parent"; score: number; comment?: string }[];
};

export type AssignmentStatus = "pending" | "submitted" | "graded";

export type AssignmentType = "recording" | "quiz" | "reading" | "writing";

export type StudentAssignment = {
  id: string;
  title: string;
  type: AssignmentType;
  dueLabel: string;
  tutor: string;
  description: string;
  instructions: string;
  status: AssignmentStatus;
  grade?: string;
  feedback?: string;
  response?: string;
  submittedAt?: string;
};

export type StudentSkill = {
  key: string;
  label: string;
  value: number;
  note: string;
  tone: "primary" | "secondary" | "tertiary";
};

export type StudentAchievement = {
  id: string;
  icon: string;
  title: string;
  detail: string;
  unlocked: boolean;
};

export type PracticeQuestion = {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type PracticeActivity = {
  id: string;
  title: string;
  description: string;
  duration: number;
  category: "Speaking" | "Listening" | "Vocabulary" | "Grammar";
  icon: string;
  tone: "blue" | "violet" | "green" | "orange";
  questions: PracticeQuestion[];
};

export type PracticeResult = {
  activityId: string;
  completedAt: string;
  score: number;
  total: number;
  minutes: number;
};

export type StudentProfile = {
  name: string;
  email: string;
  phone: string;
  country: string;
  nativeLanguage: string;
  timezone: string;
  bio: string;
  currentLevel: string;
  targetLevel: string;
  learningGoal: string;
  weeklyGoal: number;
  memberSince: string;
};

export type StudentSettings = {
  emailNotifications: boolean;
  lessonReminders: boolean;
  weeklySummary: boolean;
  productUpdates: boolean;
  autoJoinReminder: boolean;
  compactSchedule: boolean;
  showLocalTimezone: boolean;
  defaultDuration: "25";
  language: "English" | "Spanish" | "Japanese" | "Korean";
  theme: "light" | "system";
};

export type CreditTransaction = {
  id: string;
  date: string;
  description: string;
  hours: number;
  amount: number;
  status: "paid" | "refunded";
};

export type StudentWorkspaceState = {
  profile: StudentProfile;
  settings: StudentSettings;
  lessons: StudentLesson[];
  assignments: StudentAssignment[];
  completedTasks: string[];
  practiceResults: PracticeResult[];
  creditHours: number;
  transactions: CreditTransaction[];
};

export type TeacherLessonStatus = "scheduled" | "live" | "completed" | "cancelled";

export type TeacherAttendance = "attended" | "no-show";

export type TeacherLessonCancellationStatus = "pending" | "approved" | "rejected";

export type TeacherLessonAttachment = {
  name: string;
  type: string;
  dataUrl: string;
};

export type TeacherLessonRatingSource = "student" | "parent";

/** Post-lesson rating left by the student or a parent (1–5 stars). */
export type TeacherLessonRating = {
  from: TeacherLessonRatingSource;
  name: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  ratedAt: string;
};

/** Recorded by the manager when the teacher missed a lesson the student attended. */
export type TeacherLessonAbsence = {
  note: string;
  reportedBy: string;
  reportedAt: string;
};

export type TeacherLessonMaterialSection = {
  heading: string;
  items: string[];
};

/** Lesson plan the manager assigns to a booked lesson; teachers download it from the lesson details. */
export type TeacherLessonMaterial = {
  id: string;
  title: string;
  fileName: string;
  summary: string;
  sections: TeacherLessonMaterialSection[];
  assignedBy: string;
  assignedAt: string;
  attachment?: TeacherLessonAttachment;
  /** The course this plan belongs to, and its place in it (e.g. plan 3 of 7). */
  courseTitle?: string;
  position?: number;
  total?: number;
  /** Files uploaded to the lesson plan (bytes loaded on demand by `storageKey`). */
  files?: { id: string; name: string; type: string; size: number; storageKey: string }[];
};

export type TeacherLessonCancellation = {
  reason: string;
  comment: string;
  attachment?: TeacherLessonAttachment;
  status: TeacherLessonCancellationStatus;
  requestedAt: string;
  requestedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
};

export type TeacherProfile = {
  name: string;
  email: string;
  phone: string;
  country: string;
  timezone: string;
  headline: string;
  bio: string;
  specializations: string[];
  languages: string[];
  yearsExperience: number;
  certifications: string;
  memberSince: string;
  weeklyGoalHours: number;
};

export type TeacherSettings = {
  emailNotifications: boolean;
  lessonReminders: boolean;
  newBookingAlerts: boolean;
  studentMessages: boolean;
  weeklySummary: boolean;
  autoAcceptBookings: boolean;
  compactSchedule: boolean;
  showLocalTimezone: boolean;
  defaultDuration: "25";
  bufferMinutes: "0" | "15" | "30";
  language: "English" | "Spanish" | "Japanese" | "Korean";
  theme: "light" | "system";
};

export type TeacherSlotClosureStatus = "pending" | "approved" | "rejected";

export type TeacherSlotClosure = {
  id: string;
  date: string;
  time: string;
  reason: string;
  status: TeacherSlotClosureStatus;
  requestedAt: string;
  requestedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
};

export type TeacherSlotOpening = {
  id: string;
  date: string;
  time: string;
  openedAt: string;
  openedBy?: string;
};

export type TeacherStudentNote = {
  id: string;
  date: string;
  body: string;
};

export type TeacherHomeworkStatus = "assigned" | "submitted" | "reviewed";

export type TeacherHomework = {
  id: string;
  title: string;
  assignedAt: string;
  dueLabel: string;
  status: TeacherHomeworkStatus;
  feedback?: string;
};

export type TeacherStudentStatus = "active" | "at-risk" | "paused";

export type TeacherStudent = {
  id: string;
  name: string;
  initials: string;
  email: string;
  avatarColor: string;
  level: string;
  targetLevel: string;
  goal: string;
  progress: number;
  attendance: number;
  lessonsCompleted: number;
  status: TeacherStudentStatus;
  notes: TeacherStudentNote[];
  homework: TeacherHomework[];
};

export type TeacherLesson = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  duration: number;
  title: string;
  focus: string[];
  studentId?: string;
  studentName: string;
  studentInitials: string;
  studentColor: string;
  status: TeacherLessonStatus;
  roomCode?: string;
  notes?: string;
  homework?: string;
  attendance?: TeacherAttendance;
  feedback?: string;
  cancelReason?: string;
  cancellation?: TeacherLessonCancellation;
  material?: TeacherLessonMaterial;
  ratings?: TeacherLessonRating[];
  teacherAbsence?: TeacherLessonAbsence;
};

export type TeacherTask = {
  id: string;
  title: string;
  detail: string;
  dueLabel: string;
  done: boolean;
};

export type CurriculumLesson = {
  id: string;
  title: string;
  focus: string;
  minutes: number;
};

export type CurriculumUnit = {
  id: string;
  title: string;
  level: string;
  summary: string;
  objectives: string[];
  lessons: CurriculumLesson[];
  status: "published" | "draft";
  order: number;
  updatedAt: string;
};

export type TeacherWorkspaceState = {
  profile: TeacherProfile;
  settings: TeacherSettings;
  closedSlots: TeacherSlotClosure[];
  openedSlots: TeacherSlotOpening[];
  lessons: TeacherLesson[];
  students: TeacherStudent[];
  tasks: TeacherTask[];
};
