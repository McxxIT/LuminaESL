export type Role = "admin" | "teacher" | "student";

export type LessonState = "booked" | "open" | "live";

export type Lesson = {
  time: string;
  title: string;
  student: string;
  state: LessonState;
};

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
  defaultDuration: "30" | "45" | "60";
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
  defaultDuration: "30" | "45" | "60";
  bufferMinutes: "0" | "15" | "30";
  language: "English" | "Spanish" | "Japanese" | "Korean";
  theme: "light" | "system";
};

export type TeacherAvailability = {
  id: string;
  day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string;
  endTime: string;
  active: boolean;
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
  availability: TeacherAvailability[];
  lessons: TeacherLesson[];
  students: TeacherStudent[];
  tasks: TeacherTask[];
  curriculum: CurriculumUnit[];
};
