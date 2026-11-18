import type {
  Account,
  CreditTransaction,
  CurriculumUnit,
  PracticeActivity,
  StudentAchievement,
  StudentAssignment,
  StudentLesson,
  StudentProfile,
  StudentSettings,
  StudentSkill,
  TeacherLesson,
  TeacherLessonMaterial,
  TeacherLessonRating,
  TeacherSlotClosure,
  TeacherSlotOpening,
  TeacherProfile,
  TeacherSettings,
  TeacherStudent,
  TeacherTask,
} from "./types";
import { addMinutes, isoDaysFromNow } from "./student";

/** Manager sidebar. The admin gets the same pages school-wide, plus Managers and School settings. */
export const managerNavItems = [
  { label: "Overview", icon: "grid" as const },
  { label: "Teachers", icon: "users" as const },
  { label: "Students", icon: "user" as const },
  { label: "Curriculum", icon: "book" as const },
  { label: "Schedule", icon: "calendar" as const },
  { label: "Approvals", icon: "check" as const },
  { label: "Performance", icon: "chart" as const },
];

export const adminNavItems = [
  { label: "Overview", icon: "grid" as const },
  { label: "Managers", icon: "shield" as const },
  { label: "Teachers", icon: "users" as const },
  { label: "Students", icon: "user" as const },
  { label: "Curriculum", icon: "book" as const },
  { label: "Schedule", icon: "calendar" as const },
  { label: "Approvals", icon: "check" as const },
  { label: "Performance", icon: "chart" as const },
  { label: "School settings", icon: "sliders" as const },
];

export const studentNavItems = [
  { label: "Overview", icon: "grid" as const },
  { label: "Lessons", icon: "calendar" as const },
  { label: "Practice", icon: "book" as const },
  { label: "Assignments", icon: "check" as const },
  { label: "Progress", icon: "chart" as const },
  { label: "Billing", icon: "wallet" as const },
];

export const teacherNavItems = [
  { label: "Overview", icon: "grid" as const },
  { label: "Booking slots", icon: "clock" as const },
  { label: "Lessons", icon: "video" as const },
  { label: "Students", icon: "users" as const },
  { label: "Analytics", icon: "chart" as const },
];

export const studyTasks = [
  "Complete vocabulary review",
  "Practice listening for 15 min",
  "Review teacher feedback",
  "Prepare questions for your next lesson",
];

export const studentLessons: StudentLesson[] = [
  {
    id: "lesson-1",
    date: isoDaysFromNow(0),
    time: "09:00",
    endTime: "10:00",
    duration: 60,
    title: "Conversation practice",
    tutor: "Jamie Smith",
    tutorInitials: "JS",
    tutorColor: "indigo",
    focus: ["Speaking", "Fluency"],
    status: "upcoming",
    roomCode: "ESL-8821",
    notes: "Warm-up conversation, then a short discussion about your weekend and travel plans.",
    homework: "Review five travel idioms before class.",
  },
  {
    id: "lesson-2",
    date: isoDaysFromNow(1),
    time: "10:00",
    endTime: "11:00",
    duration: 60,
    title: "Vocabulary workshop",
    tutor: "Alex Johnson",
    tutorInitials: "AJ",
    tutorColor: "peach",
    focus: ["Vocabulary", "Business English"],
    status: "upcoming",
    roomCode: "ESL-8834",
    notes: "Practice 20 high-frequency phrasal verbs used in meetings.",
    homework: "Complete the vocabulary quiz in Assignments.",
  },
  {
    id: "lesson-3",
    date: isoDaysFromNow(2),
    time: "14:00",
    endTime: "14:45",
    duration: 45,
    title: "Pronunciation clinic",
    tutor: "Jamie Smith",
    tutorInitials: "JS",
    tutorColor: "indigo",
    focus: ["Pronunciation", "Listening"],
    status: "upcoming",
    roomCode: "ESL-8850",
    notes: "Focus on connected speech and the sounds /θ/ and /ð/.",
  },
  {
    id: "lesson-4",
    date: isoDaysFromNow(4),
    time: "09:30",
    endTime: "10:30",
    duration: 60,
    title: "IELTS speaking mock",
    tutor: "Ava Rodriguez",
    tutorInitials: "AR",
    tutorColor: "lavender",
    focus: ["IELTS", "Speaking"],
    status: "upcoming",
    roomCode: "ESL-8862",
    notes: "Full Part 1–3 speaking mock with band score feedback.",
  },
  {
    id: "lesson-5",
    date: isoDaysFromNow(-2),
    time: "14:00",
    endTime: "14:50",
    duration: 50,
    title: "Structuring persuasive arguments",
    tutor: "Jamie Smith",
    tutorInitials: "JS",
    tutorColor: "indigo",
    focus: ["Speaking", "C1 Prep"],
    status: "completed",
    notes: "Mock debate with counter-argument practice.",
    feedback: "Excellent use of hedging phrases during the mock debate. Your response to counter-arguments was structured and calm. Next, focus on tightening third and mixed conditionals when speculating on past outcomes.",
    corrections: [
      { from: "If I would know", to: "If I had known" },
      { from: "Explain me", to: "Explain to me" },
    ],
    scores: [
      { label: "Fluency", value: 4.5 },
      { label: "Grammar", value: 4.0 },
      { label: "Pronunciation", value: 4.8 },
    ],
  },
  {
    id: "lesson-6",
    date: isoDaysFromNow(-6),
    time: "10:00",
    endTime: "10:50",
    duration: 50,
    title: "Executive email etiquette",
    tutor: "Alex Johnson",
    tutorInitials: "AJ",
    tutorColor: "peach",
    focus: ["Writing", "Business English"],
    status: "completed",
    notes: "Editing a stakeholder update for clarity and concision.",
    feedback: "You cut unnecessary preambles and produced a clear, confident update. Keep using short paragraphs and a direct closing line.",
    scores: [
      { label: "Writing", value: 4.8 },
      { label: "Cohesion", value: 4.6 },
      { label: "Tone", value: 4.9 },
    ],
  },
  {
    id: "lesson-7",
    date: isoDaysFromNow(-9),
    time: "17:00",
    endTime: "17:50",
    duration: 50,
    title: "Idioms in the boardroom",
    tutor: "Jamie Smith",
    tutorInitials: "JS",
    tutorColor: "indigo",
    focus: ["Idioms", "Listening"],
    status: "completed",
    notes: "Cross-cultural idiom decoding and rapid response practice.",
    feedback: "Your comprehension of idiomatic language improved noticeably. Continue noting new expressions in context rather than memorising isolated lists.",
    scores: [
      { label: "Idioms", value: 4.2 },
      { label: "Comprehension", value: 4.7 },
    ],
  },
  {
    id: "lesson-8",
    date: isoDaysFromNow(-4),
    time: "11:00",
    endTime: "11:45",
    duration: 45,
    title: "Grammar intensive",
    tutor: "Alex Johnson",
    tutorInitials: "AJ",
    tutorColor: "peach",
    focus: ["Grammar"],
    status: "cancelled",
    cancelReason: "Tutor unavailable due to a scheduling conflict. Your lesson credit was returned.",
  },
];

export const studentAssignments: StudentAssignment[] = [
  {
    id: "assignment-1",
    title: "Audio recording: 2-minute elevator pitch",
    type: "recording",
    dueLabel: "Due in 5 hours",
    tutor: "Jamie Smith",
    description: "Record a concise project value proposition using hedging and signposting language.",
    instructions: "Upload a 2-minute recording. Include an opening hook, one clear value statement, and a confident close.",
    status: "pending",
  },
  {
    id: "assignment-2",
    title: "Vocabulary quiz: 20 business phrasal verbs",
    type: "quiz",
    dueLabel: "Due tomorrow",
    tutor: "Alex Johnson",
    description: "Test your mastery of 'iron out', 'ramp up', 'draw up', and 'phase in'.",
    instructions: "Complete all 15 questions. You can retake the quiz once before your next lesson.",
    status: "pending",
  },
  {
    id: "assignment-3",
    title: "Reading: cross-cultural negotiations",
    type: "reading",
    dueLabel: "Due in 5 days",
    tutor: "Jamie Smith",
    description: "Read the article extract and answer five comprehension prompts.",
    instructions: "Read at a target speed of 240 words per minute, then write short answers in full sentences.",
    status: "pending",
  },
  {
    id: "assignment-4",
    title: "Writing: stakeholder status update",
    type: "writing",
    dueLabel: "Submitted yesterday",
    tutor: "Alex Johnson",
    description: "Rewrite a long status email into a concise executive update.",
    instructions: "Keep the response under 150 words and include three actionable bullet points.",
    status: "graded",
    grade: "A-",
    feedback: "Clear structure and a confident close. Watch the tense shift in the second paragraph.",
    response: "Subject: November project status\n\nWe are on track for the December launch. Three decisions need your approval this week...",
    submittedAt: "Yesterday at 18:42",
  },
  {
    id: "assignment-5",
    title: "Listening: accent and nuance lab",
    type: "recording",
    dueLabel: "Submitted 3 days ago",
    tutor: "Jamie Smith",
    description: "Identify key details in three short regional accent clips.",
    instructions: "Listen once for the main idea, then replay for detail and intonation.",
    status: "submitted",
    response: "Completed all three clips. The Scottish clip was the most challenging.",
    submittedAt: "3 days ago",
  },
];

export const studentSkills: StudentSkill[] = [
  { key: "speaking", label: "Speaking", value: 72, note: "Fluency and intonation are strong; keep expanding discourse markers.", tone: "primary" },
  { key: "listening", label: "Listening", value: 81, note: "Comfortable with fast speech and regional accents.", tone: "tertiary" },
  { key: "writing", label: "Writing", value: 56, note: "Focus on concise paragraphs and cohesive linking.", tone: "secondary" },
  { key: "grammar", label: "Grammar", value: 64, note: "Conditionals and reported speech need more practice.", tone: "primary" },
];

export const studentAchievements: StudentAchievement[] = [
  { id: "streak", icon: "star", title: "12-day streak", detail: "Practiced every day this month", unlocked: true },
  { id: "consistent", icon: "check", title: "Consistent learner", detail: "Attended 18 lessons", unlocked: true },
  { id: "speaking", icon: "chart", title: "Speaking improved", detail: "+12% since your last review", unlocked: true },
  { id: "target", icon: "target", title: "B2 checkpoint", detail: "Reach 75% overall to unlock", unlocked: false },
];

export const studentPracticeActivities: PracticeActivity[] = [
  {
    id: "practice-listening",
    title: "Listening lab",
    description: "Train your ear with a short workplace conversation.",
    duration: 10,
    category: "Listening",
    icon: "headphones",
    tone: "blue",
    questions: [
      { prompt: "The speaker says the meeting was 'pushed back'. What happened?", options: ["It was cancelled", "It moved to a later time", "It started early", "It moved online"], answer: 1, explanation: "'Pushed back' means moved to a later time." },
      { prompt: "Why is the client calling?", options: ["To confirm a deadline", "To complain about an invoice", "To request a new team member", "To reschedule a holiday"], answer: 0, explanation: "The client asks whether the deadline is still Friday." },
      { prompt: "Which phrase signals a polite disagreement?", options: ["That works for me", "I see your point, however", "Absolutely, no problem", "Let's move on"], answer: 1, explanation: "'I see your point, however' acknowledges and then disagrees." },
    ],
  },
  {
    id: "practice-vocabulary",
    title: "Vocabulary builder",
    description: "Review 20 words from your recent lessons.",
    duration: 15,
    category: "Vocabulary",
    icon: "book",
    tone: "violet",
    questions: [
      { prompt: "To 'iron out' a problem means to…", options: ["Ignore it", "Resolve it", "Repeat it", "Report it"], answer: 1, explanation: "'Iron out' means to resolve small problems." },
      { prompt: "Which word means 'to increase gradually'?", options: ["Ramp up", "Phase out", "Draw up", "Scale back"], answer: 0, explanation: "'Ramp up' means to increase, often gradually." },
      { prompt: "Choose the best synonym for 'concise'.", options: ["Lengthy", "Brief and clear", "Confusing", "Formal"], answer: 1, explanation: "Concise means brief but complete." },
    ],
  },
  {
    id: "practice-speaking",
    title: "Speaking prompt",
    description: "Practice answering an everyday interview question.",
    duration: 5,
    category: "Speaking",
    icon: "mic",
    tone: "green",
    questions: [
      { prompt: "Which opening is strongest for a 60-second answer?", options: ["Um, let me think…", "One example that comes to mind is…", "I don't really know.", "That's a difficult question."], answer: 1, explanation: "A concrete example gives your answer direction immediately." },
      { prompt: "What should you do before finishing a speaking answer?", options: ["Add unrelated detail", "Summarise your main point", "Speak faster", "Change topic"], answer: 1, explanation: "A short summary makes your answer easy to follow." },
      { prompt: "Which phrase buys thinking time naturally?", options: ["Actually, that's a great point.", "What I mean is…", "That's all.", "Never mind."], answer: 1, explanation: "'What I mean is…' gives you a moment while sounding fluent." },
    ],
  },
  {
    id: "practice-grammar",
    title: "Conditionals drill",
    description: "Practise third and mixed conditionals in context.",
    duration: 8,
    category: "Grammar",
    icon: "check",
    tone: "orange",
    questions: [
      { prompt: "If I ___ known, I would have called you.", options: ["would have", "had", "have", "would"], answer: 1, explanation: "Third conditional uses 'if + past perfect'." },
      { prompt: "Choose the correct sentence.", options: ["She explained me the plan.", "She explained to me the plan.", "She explained me about the plan.", "She explained at me the plan."], answer: 1, explanation: "Explain takes 'to' before the person." },
      { prompt: "If I were more organised, I ___ finished yesterday.", options: ["would have", "will have", "had", "have"], answer: 0, explanation: "Mixed conditional: present condition, past result." },
    ],
  },
];

export const defaultStudentProfile = (account: Account): StudentProfile => ({
  name: account.name,
  email: account.email,
  phone: "+65 8123 4567",
  country: "Singapore",
  nativeLanguage: "Mandarin Chinese",
  timezone: "Asia/Singapore (UTC+8)",
  bio: "I am preparing for leadership conversations in English and want to sound more confident in meetings. I enjoy short daily practice and feedback from my tutors.",
  currentLevel: "B1 Intermediate",
  targetLevel: "B2 Upper intermediate",
  learningGoal: "Lead client meetings with confidence",
  weeklyGoal: 5,
  memberSince: "March 2025",
});

export const defaultStudentSettings: StudentSettings = {
  emailNotifications: true,
  lessonReminders: true,
  weeklySummary: true,
  productUpdates: false,
  autoJoinReminder: true,
  compactSchedule: false,
  showLocalTimezone: true,
  defaultDuration: "25",
  language: "English",
  theme: "light",
};

export const studentTransactionSeed: CreditTransaction[] = [
  { id: "txn-1", date: "Nov 1, 2026", description: "Monthly credit renewal", hours: 10, amount: 140, status: "paid" },
  { id: "txn-2", date: "Oct 18, 2026", description: "Lesson credits top-up", hours: 5, amount: 75, status: "paid" },
  { id: "txn-3", date: "Oct 1, 2026", description: "Monthly credit renewal", hours: 10, amount: 140, status: "paid" },
  { id: "txn-4", date: "Sep 22, 2026", description: "Cancelled lesson credit return", hours: 1, amount: 0, status: "refunded" },
];

export const creditPackages = [
  { hours: 5, price: 75, label: "5 lesson hours", detail: "5 twenty-five-minute sessions" },
  { hours: 10, price: 140, label: "10 lesson hours", detail: "10 twenty-five-minute sessions · most popular" },
  { hours: 20, price: 260, label: "20 lesson hours", detail: "20 twenty-five-minute sessions · best value" },
];

export const studentTutors = [
  { name: "Jamie Smith", initials: "JS", color: "indigo", specialty: "Conversation and pronunciation" },
  { name: "Alex Johnson", initials: "AJ", color: "peach", specialty: "Business English and writing" },
  { name: "Ava Rodriguez", initials: "AR", color: "lavender", specialty: "IELTS and academic English" },
  { name: "Lucas Martin", initials: "LM", color: "mint", specialty: "Grammar and fluency" },
];

export const teacherFocusOptions = ["Conversation practice", "Business English", "IELTS speaking", "Pronunciation clinic", "Grammar foundations", "Academic writing", "Vocabulary workshop", "Interview preparation"];

export const teacherLevelOptions = ["A1 Beginner", "A2 Elementary", "B1 Intermediate", "B2 Upper intermediate", "C1 Advanced", "C2 Proficient"];

export const defaultTeacherProfile = (account: Account): TeacherProfile => ({
  name: account.name,
  email: account.email,
  phone: "+65 9123 7788",
  country: "Singapore",
  timezone: "Asia/Singapore (UTC+8)",
  headline: "Business English and conversation coach",
  bio: "I help ambitious professionals sound clear, calm, and confident in English. My lessons blend real workplace scenarios with focused correction, so students leave with language they can use the same day.",
  specializations: ["Business English", "Conversation", "Pronunciation", "Interview preparation"],
  languages: ["English", "Mandarin Chinese", "Spanish"],
  yearsExperience: 8,
  certifications: "CELTA · Cambridge DELTA Module 1",
  memberSince: "January 2023",
  weeklyGoalHours: 24,
});

export const defaultTeacherSettings: TeacherSettings = {
  emailNotifications: true,
  lessonReminders: true,
  newBookingAlerts: true,
  studentMessages: true,
  weeklySummary: true,
  autoAcceptBookings: false,
  compactSchedule: false,
  showLocalTimezone: true,
  defaultDuration: "25",
  bufferMinutes: "15",
  language: "English",
  theme: "light",
};

export const teacherClosedSlotsSeed: TeacherSlotClosure[] = [
  {
    id: "closure-seed-1",
    date: isoDaysFromNow(1),
    time: "15:30",
    reason: "Medical appointment",
    status: "pending",
    requestedAt: new Date().toISOString(),
    requestedBy: "Alex Johnson",
  },
];

const openedSlotTimes = ["09:00", "09:30", "10:00", "10:30", "11:30", "13:30", "14:00", "14:30", "15:00"];

export const teacherOpenedSlotsSeed: TeacherSlotOpening[] = [0, 1, 2].flatMap((offset) =>
  openedSlotTimes.map((time) => ({
    id: `opening-${offset}-${time}`,
    date: isoDaysFromNow(offset),
    time,
    openedAt: new Date().toISOString(),
    openedBy: "Alex Johnson",
  })),
);

export const teacherStudentsSeed: TeacherStudent[] = [
  {
    id: "student-mia",
    name: "Mia Chen",
    initials: "MC",
    email: "student@lumina.school",
    avatarColor: "indigo",
    level: "B1 Intermediate",
    targetLevel: "B2 Upper intermediate",
    goal: "Lead client meetings with confidence",
    progress: 68,
    attendance: 96,
    lessonsCompleted: 18,
    status: "active",
    notes: [
      { id: "note-mia-1", date: "Nov 12, 2026", body: "Prefers spoken feedback before written corrections. Responds well to role-play." },
      { id: "note-mia-2", date: "Nov 3, 2026", body: "Fluency is strong. Keep drilling third and mixed conditionals when speculating." },
    ],
    homework: [
      { id: "homework-mia-1", title: "Record a 2-minute elevator pitch", assignedAt: "Nov 12, 2026", dueLabel: "Due today", status: "submitted" },
    ],
  },
  {
    id: "student-ava",
    name: "Ava Rodriguez",
    initials: "AR",
    email: "ava.rodriguez@lumina.school",
    avatarColor: "lavender",
    level: "B2 Upper intermediate",
    targetLevel: "C1 Advanced",
    goal: "Score 7.5 in IELTS speaking",
    progress: 74,
    attendance: 92,
    lessonsCompleted: 22,
    status: "active",
    notes: [
      { id: "note-ava-1", date: "Nov 10, 2026", body: "Targets band 7.5. Part 3 fluency is the main lever; push longer, more abstract answers." },
    ],
    homework: [
      { id: "homework-ava-1", title: "Part 3 speaking practice questions", assignedAt: "Nov 13, 2026", dueLabel: "Due in 2 days", status: "assigned" },
    ],
  },
  {
    id: "student-noah",
    name: "Noah Williams",
    initials: "NW",
    email: "noah.williams@lumina.school",
    avatarColor: "mint",
    level: "A2 Elementary",
    targetLevel: "B1 Intermediate",
    goal: "Speak comfortably while travelling",
    progress: 54,
    attendance: 88,
    lessonsCompleted: 12,
    status: "at-risk",
    notes: [
      { id: "note-noah-1", date: "Nov 8, 2026", body: "Missed two lessons this month. Check whether work is blocking his usual slot." },
    ],
    homework: [
      { id: "homework-noah-1", title: "Conditionals worksheet", assignedAt: "Nov 10, 2026", dueLabel: "Overdue", status: "assigned" },
    ],
  },
  {
    id: "student-lucas",
    name: "Lucas Martin",
    initials: "LM",
    email: "lucas.martin@lumina.school",
    avatarColor: "peach",
    level: "B1 Intermediate",
    targetLevel: "B2 Upper intermediate",
    goal: "Present product updates in English",
    progress: 61,
    attendance: 91,
    lessonsCompleted: 15,
    status: "active",
    notes: [
      { id: "note-lucas-1", date: "Nov 6, 2026", body: "Very motivated by product examples. Bring one real slide deck to each lesson." },
    ],
    homework: [
      { id: "homework-lucas-1", title: "Draft a stakeholder update", assignedAt: "Nov 11, 2026", dueLabel: "Due tomorrow", status: "submitted" },
    ],
  },
  {
    id: "student-sofia",
    name: "Sofia Patel",
    initials: "SP",
    email: "sofia.patel@lumina.school",
    avatarColor: "indigo",
    level: "B2 Upper intermediate",
    targetLevel: "C1 Advanced",
    goal: "Sound persuasive in negotiations",
    progress: 83,
    attendance: 97,
    lessonsCompleted: 26,
    status: "active",
    notes: [],
    homework: [
      { id: "homework-sofia-1", title: "Negotiation vocabulary review", assignedAt: "Nov 9, 2026", dueLabel: "Reviewed", status: "reviewed", feedback: "Good range. Keep drilling hedged disagreement phrases." },
    ],
  },
  {
    id: "student-ethan",
    name: "Ethan Kim",
    initials: "EK",
    email: "ethan.kim@lumina.school",
    avatarColor: "lavender",
    level: "B2 Upper intermediate",
    targetLevel: "C1 Advanced",
    goal: "Write clearer academic essays",
    progress: 71,
    attendance: 90,
    lessonsCompleted: 19,
    status: "active",
    notes: [
      { id: "note-ethan-1", date: "Nov 9, 2026", body: "Argument structure is logical; cohesion between paragraphs still needs work." },
    ],
    homework: [
      { id: "homework-ethan-1", title: "Rewrite an essay introduction", assignedAt: "Nov 7, 2026", dueLabel: "Due in 3 days", status: "assigned" },
    ],
  },
  {
    id: "student-olivia",
    name: "Olivia Smith",
    initials: "OS",
    email: "olivia.smith@lumina.school",
    avatarColor: "peach",
    level: "A2 Elementary",
    targetLevel: "B1 Intermediate",
    goal: "Speak clearly in job interviews",
    progress: 47,
    attendance: 84,
    lessonsCompleted: 9,
    status: "at-risk",
    notes: [
      { id: "note-olivia-1", date: "Nov 14, 2026", body: "Cancelled her last session. Follow up with a shorter, low-pressure booking option." },
    ],
    homework: [
      { id: "homework-olivia-1", title: "Interview question outline", assignedAt: "Nov 8, 2026", dueLabel: "Overdue", status: "assigned" },
    ],
  },
  {
    id: "student-hana",
    name: "Hana Sato",
    initials: "HS",
    email: "hana.sato@lumina.school",
    avatarColor: "mint",
    level: "B1 Intermediate",
    targetLevel: "B2 Upper intermediate",
    goal: "Prepare for a university interview",
    progress: 58,
    attendance: 94,
    lessonsCompleted: 11,
    status: "active",
    notes: [],
    homework: [],
  },
  {
    id: "student-diego",
    name: "Diego Alvarez",
    initials: "DA",
    email: "diego.alvarez@lumina.school",
    avatarColor: "peach",
    level: "A2 Elementary",
    targetLevel: "B1 Intermediate",
    goal: "Build confidence for everyday conversations",
    progress: 39,
    attendance: 71,
    lessonsCompleted: 6,
    status: "paused",
    notes: [
      { id: "note-diego-1", date: "Oct 21, 2026", body: "Paused lessons for a work trip. Rebook a light conversation session when he returns." },
    ],
    homework: [],
  },
];

function lessonRoomCode(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return `ESL-${1000 + (hash % 9000)}`;
}

const MANAGER_NAME = "Jamie Smith";

const lessonMaterial = (
  id: string,
  title: string,
  summary: string,
  sections: TeacherLessonMaterial["sections"],
  assignedDayOffset = -2,
): TeacherLessonMaterial => ({
  id,
  title,
  fileName: `${id}.txt`,
  summary,
  sections,
  assignedBy: MANAGER_NAME,
  assignedAt: isoDaysFromNow(assignedDayOffset),
});

/** Manager-assigned lesson plans keyed by lesson title. Pronunciation clinic is intentionally unassigned. */
export const managerLessonMaterials: Record<string, TeacherLessonMaterial> = {
  "Conversation practice": lessonMaterial("conversation-practice-plan", "Conversation practice: everyday fluency", "Build turn-taking and follow-up questions around a familiar topic.", [
    { heading: "Warm-up (5 min)", items: ["Ask about the student's week and pick one topic to expand.", "Model two follow-up questions."] },
    { heading: "Main task (15 min)", items: ["Role-play planning a weekend trip.", "Student must ask at least three follow-up questions.", "Note recurring errors for the wrap-up."] },
    { heading: "Wrap-up (5 min)", items: ["Review three corrections.", "Set a short recording task as homework."] },
  ]),
  "IELTS Speaking": lessonMaterial("ielts-speaking-part-1-plan", "IELTS Speaking Part 1: first impressions", "Natural, extended Part 1 answers with band-score feedback.", [
    { heading: "Warm-up (5 min)", items: ["Quick-fire familiar questions: home, work, hobbies."] },
    { heading: "Main task (15 min)", items: ["Six Part 1 questions, timed.", "Push for reason + example in every answer.", "Score fluency, lexis, grammar, and pronunciation."] },
    { heading: "Wrap-up (5 min)", items: ["Share an estimated band and one priority to improve."] },
  ]),
  "Grammar foundations": lessonMaterial("grammar-conditionals-plan", "Grammar foundations: conditionals", "Review form and use of first, second, and third conditionals.", [
    { heading: "Warm-up (5 min)", items: ["Elicit 'What would you do if…' answers."] },
    { heading: "Main task (15 min)", items: ["Controlled gap-fill, then free sentences about past regrets.", "Correct form errors on the spot."] },
    { heading: "Wrap-up (5 min)", items: ["Student summarises the three patterns in their own words."] },
  ]),
  "Business English": lessonMaterial("business-stakeholder-update-plan", "Business English: stakeholder updates", "Write and edit a clear, concise status update.", [
    { heading: "Warm-up (5 min)", items: ["Discuss what makes an update easy to read."] },
    { heading: "Main task (15 min)", items: ["Edit a sample update down to three sentences.", "Student drafts their own update for a real project."] },
    { heading: "Wrap-up (5 min)", items: ["Compare drafts and agree on one rewrite rule."] },
  ]),
  "Academic writing": lessonMaterial("academic-essay-introduction-plan", "Academic writing: argument introductions", "Rebuild a C1 essay introduction with a clear position.", [
    { heading: "Warm-up (5 min)", items: ["Identify the thesis in two sample introductions."] },
    { heading: "Main task (15 min)", items: ["Rewrite the student's introduction: hook, context, thesis.", "Add linking language between ideas."] },
    { heading: "Wrap-up (5 min)", items: ["Checklist review and homework: rewrite one body paragraph."] },
  ]),
  "Negotiation practice": lessonMaterial("negotiation-supplier-roleplay-plan", "Negotiation practice: supplier role-play", "Hedged disagreement and conditional offers in a negotiation.", [
    { heading: "Warm-up (5 min)", items: ["Review hedging phrases: 'I'm not sure that works for us…'"] },
    { heading: "Main task (15 min)", items: ["Supplier negotiation role-play with a target price.", "Student must make two conditional offers."] },
    { heading: "Wrap-up (5 min)", items: ["Debrief language used and what could be softer."] },
  ]),
  "Interview preparation": lessonMaterial("interview-star-stories-plan", "Interview preparation: STAR stories", "Structure concise, vivid answers to behavioural questions.", [
    { heading: "Warm-up (5 min)", items: ["Review the STAR structure."] },
    { heading: "Main task (15 min)", items: ["Three behavioural questions, 90 seconds each.", "Give feedback on structure and specificity."] },
    { heading: "Wrap-up (5 min)", items: ["Pick one story to polish as homework."] },
  ]),
};
managerLessonMaterials["IELTS speaking clinic"] = managerLessonMaterials["IELTS Speaking"];
managerLessonMaterials["IELTS speaking mock"] = managerLessonMaterials["IELTS Speaking"];

/** ISO timestamp relative to a seeded lesson's start, e.g. -40 = 40 minutes before it began. */
function lessonStartISO(dayOffset: number, time: string, minutesFromStart = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours, minutes + minutesFromStart, 0, 0);
  return date.toISOString();
}

const lessonRating = (
  from: TeacherLessonRating["from"],
  student: TeacherStudent,
  score: TeacherLessonRating["score"],
  dayOffset: number,
  comment?: string,
): TeacherLessonRating => ({
  from,
  name: from === "parent" ? `Parent of ${student.name.split(" ")[0]}` : student.name,
  score,
  comment,
  ratedAt: isoDaysFromNow(dayOffset),
});

const teacherLessonSeed = (
  id: string,
  dayOffset: number,
  time: string,
  duration: number,
  title: string,
  student: TeacherStudent,
  status: TeacherLesson["status"],
  focus: string[],
  extra: Partial<TeacherLesson> = {},
): TeacherLesson => ({
  id,
  date: isoDaysFromNow(dayOffset),
  time,
  endTime: addMinutes(time, duration),
  duration,
  title,
  focus,
  studentId: student.id,
  studentName: student.name,
  studentInitials: student.initials,
  studentColor: student.avatarColor,
  status,
  roomCode: lessonRoomCode(id),
  material: managerLessonMaterials[title],
  ...extra,
});

export const teacherLessonsSeed: TeacherLesson[] = [
  teacherLessonSeed("teacher-lesson-1", 0, "09:15", 25, "Conversation practice", teacherStudentsSeed[0], "completed", ["Speaking", "Fluency"], {
    attendance: "attended",
    notes: "Warm-up conversation, then a short discussion about weekend travel plans.",
    feedback: "Mia led the warm-up with much more confidence today. Keep working on past-modality phrases when reflecting on decisions.",
    homework: "Review five travel idioms before the next lesson.",
    ratings: [
      lessonRating("student", teacherStudentsSeed[0], 5, 0, "Really fun warm-up, I felt confident speaking."),
      lessonRating("parent", teacherStudentsSeed[0], 5, 0, "Mia talks about her lessons every week. Thank you!"),
    ],
  }),
  teacherLessonSeed("teacher-lesson-2", 0, "11:20", 25, "IELTS Speaking", teacherStudentsSeed[1], "live", ["IELTS", "Speaking"], {
    notes: "Focused Part 1 speaking practice with band score feedback.",
  }),
  teacherLessonSeed("teacher-lesson-3", 0, "13:50", 25, "Grammar foundations", teacherStudentsSeed[2], "scheduled", ["Grammar", "Accuracy"], {
    notes: "Third conditional review and controlled practice.",
  }),
  teacherLessonSeed("teacher-lesson-4", 1, "10:05", 25, "Business English", teacherStudentsSeed[3], "scheduled", ["Writing", "Business English"], {
    notes: "Editing a stakeholder update for clarity and concision.",
  }),
  teacherLessonSeed("teacher-lesson-5", 1, "13:25", 25, "Pronunciation clinic", teacherStudentsSeed[6], "scheduled", ["Pronunciation", "Listening"], {
    notes: "Connected speech and the sounds /θ/ and /ð/.",
  }),
  teacherLessonSeed("teacher-lesson-6", 2, "09:40", 25, "Academic writing", teacherStudentsSeed[5], "scheduled", ["Writing", "Cohesion"], {
    notes: "Rebuild the introduction to a C1 argument essay.",
  }),
  teacherLessonSeed("teacher-lesson-7", 3, "10:55", 25, "IELTS speaking clinic", teacherStudentsSeed[1], "scheduled", ["IELTS", "Fluency"], {
    notes: "Part 3 follow-up questions and abstract topics.",
  }),
  teacherLessonSeed("teacher-lesson-8", 4, "10:05", 25, "Negotiation practice", teacherStudentsSeed[4], "scheduled", ["Speaking", "Business English"], {
    notes: "Role-play a supplier negotiation with hedged disagreement.",
  }),
  teacherLessonSeed("teacher-lesson-9", -1, "09:15", 25, "Conversation practice", teacherStudentsSeed[0], "completed", ["Speaking", "Fluency"], {
    attendance: "attended",
    feedback: "Clear improvement in turn-taking. Try recording a two-minute summary before Thursday.",
    ratings: [lessonRating("student", teacherStudentsSeed[0], 4, -1)],
  }),
  teacherLessonSeed("teacher-lesson-10", -1, "11:20", 25, "Grammar foundations", teacherStudentsSeed[2], "completed", ["Grammar"], {
    attendance: "no-show",
    notes: "No-show. Follow up to confirm the next slot.",
  }),
  teacherLessonSeed("teacher-lesson-11", -1, "14:15", 25, "Pronunciation clinic", teacherStudentsSeed[6], "cancelled", ["Pronunciation"], {
    cancelReason: "Student rescheduled due to a work conflict.",
  }),
  teacherLessonSeed("teacher-lesson-12", -2, "10:05", 25, "Business English", teacherStudentsSeed[3], "completed", ["Business English", "Writing"], {
    attendance: "attended",
    feedback: "Tightened the stakeholder update well. Keep paragraphs under four lines.",
    ratings: [lessonRating("student", teacherStudentsSeed[3], 5, -2, "Practical and directly useful for work.")],
  }),
  teacherLessonSeed("teacher-lesson-13", -2, "13:25", 25, "Academic writing", teacherStudentsSeed[5], "completed", ["Writing", "Argument"], {
    attendance: "attended",
    feedback: "The claim is clear. Add one more linking sentence between evidence and interpretation.",
    ratings: [lessonRating("student", teacherStudentsSeed[5], 3, -2, "Helpful, but I wanted more time on my own essay.")],
  }),
  teacherLessonSeed("teacher-lesson-14", -3, "09:40", 25, "IELTS speaking mock", teacherStudentsSeed[1], "completed", ["IELTS", "Speaking"], {
    attendance: "attended",
    feedback: "Band 7.0 range. Part 3 answers need another layer of development and examples.",
    ratings: [
      lessonRating("student", teacherStudentsSeed[1], 5, -3, "The band score breakdown was exactly what I needed."),
      lessonRating("parent", teacherStudentsSeed[1], 4, -3),
    ],
  }),
  teacherLessonSeed("teacher-lesson-15", -4, "15:05", 25, "Negotiation practice", teacherStudentsSeed[4], "completed", ["Speaking", "Negotiation"], {
    attendance: "attended",
    feedback: "Confident framing and excellent use of conditional offers.",
    ratings: [lessonRating("student", teacherStudentsSeed[4], 2, -4, "The lesson felt rushed at the end.")],
  }),
  teacherLessonSeed("teacher-lesson-16", -4, "16:20", 25, "Interview preparation", teacherStudentsSeed[7], "completed", ["Interview preparation", "Fluency"], {
    attendance: "attended",
    feedback: "Stories are vivid. Practise a 90-second version of the leadership example.",
    ratings: [lessonRating("student", teacherStudentsSeed[7], 5, -4)],
  }),
  teacherLessonSeed("teacher-lesson-17", -6, "11:20", 25, "Conversation practice", teacherStudentsSeed[0], "completed", ["Speaking", "Fluency"], {
    attendance: "attended",
    feedback: "Great use of discourse markers. Watch the tense shift when telling anecdotes.",
    ratings: [lessonRating("parent", teacherStudentsSeed[0], 5, -6, "Clear notes after every class.")],
  }),
  teacherLessonSeed("teacher-lesson-18", -5, "11:30", 25, "Business English", teacherStudentsSeed[3], "cancelled", ["Business English"], {
    cancelReason: "Teacher cancelled 40 minutes before the start.",
    cancellation: {
      reason: "Personal emergency",
      comment: "Family emergency came up right before class.",
      status: "approved",
      requestedAt: lessonStartISO(-5, "11:30", -40),
      requestedBy: "Alex Johnson",
      reviewedAt: lessonStartISO(-5, "11:30", -25),
      reviewedBy: MANAGER_NAME,
    },
  }),
  teacherLessonSeed("teacher-lesson-19", -9, "10:00", 25, "Academic writing", teacherStudentsSeed[5], "cancelled", ["Writing"], {
    cancelReason: "Teacher did not join; the student waited in the classroom.",
    teacherAbsence: {
      note: "Did not join the classroom; the student waited 15 minutes.",
      reportedBy: MANAGER_NAME,
      reportedAt: lessonStartISO(-9, "10:00", 30),
    },
  }),
];

export const teacherTasksSeed: TeacherTask[] = [
  { id: "task-1", title: "Review Mia's homework", detail: "Elevator pitch recording · submitted", dueLabel: "Today", done: false },
  { id: "task-2", title: "Add feedback for Ava", detail: "IELTS speaking mock · yesterday", dueLabel: "Today", done: false },
  { id: "task-3", title: "Check in with Olivia", detail: "Low attendance this month", dueLabel: "This week", done: false },
  { id: "task-4", title: "Review slot closure requests", detail: "Awaiting manager approval", dueLabel: "This week", done: false },
  { id: "task-5", title: "Download lesson materials", detail: "Assigned by your manager", dueLabel: "Before class", done: false },
];

/** Curriculum is owned by the manager; kept as seed data for the future admin curriculum screen. */
export const teacherCurriculumSeed: CurriculumUnit[] = [
  {
    id: "unit-1",
    title: "Conversation confidence",
    level: "B1 Intermediate",
    summary: "Build fluency for everyday and workplace conversations through structured role-play and targeted correction.",
    objectives: ["Sustain a 10-minute conversation with fewer pauses", "Use discourse markers to organise longer answers", "Self-correct common tense slips"],
    lessons: [
      { id: "unit-1-lesson-1", title: "Small talk that goes somewhere", focus: "Fluency", minutes: 60 },
      { id: "unit-1-lesson-2", title: "Telling a clear story", focus: "Narrative", minutes: 60 },
      { id: "unit-1-lesson-3", title: "Agreeing and disagreeing politely", focus: "Interaction", minutes: 45 },
      { id: "unit-1-lesson-4", title: "Confidence review and recording", focus: "Review", minutes: 45 },
    ],
    status: "published",
    order: 1,
    updatedAt: "Nov 10, 2026",
  },
  {
    id: "unit-2",
    title: "Business English essentials",
    level: "B2 Upper intermediate",
    summary: "Practical language for meetings, stakeholder updates, and persuasive product conversations.",
    objectives: ["Lead a short meeting with a clear agenda", "Write concise stakeholder updates", "Handle objections without losing rapport"],
    lessons: [
      { id: "unit-2-lesson-1", title: "Opening a meeting with purpose", focus: "Meetings", minutes: 45 },
      { id: "unit-2-lesson-2", title: "Status updates in three sentences", focus: "Writing", minutes: 60 },
      { id: "unit-2-lesson-3", title: "Making and defending a proposal", focus: "Persuasion", minutes: 60 },
      { id: "unit-2-lesson-4", title: "Handling objections calmly", focus: "Interaction", minutes: 60 },
      { id: "unit-2-lesson-5", title: "Mock client review", focus: "Simulation", minutes: 60 },
    ],
    status: "published",
    order: 2,
    updatedAt: "Nov 8, 2026",
  },
  {
    id: "unit-3",
    title: "IELTS speaking intensive",
    level: "B2 Upper intermediate",
    summary: "A focused speaking programme for candidates targeting band 7.0 and above.",
    objectives: ["Extend Part 3 answers with reasons and examples", "Use a wider range of topic vocabulary", "Maintain fluency under timed conditions"],
    lessons: [
      { id: "unit-3-lesson-1", title: "Part 1: natural first impressions", focus: "Fluency", minutes: 45 },
      { id: "unit-3-lesson-2", title: "Part 2: story planning", focus: "Long turn", minutes: 60 },
      { id: "unit-3-lesson-3", title: "Part 3: abstract reasoning", focus: "Discussion", minutes: 60 },
      { id: "unit-3-lesson-4", title: "Lexical range for common topics", focus: "Vocabulary", minutes: 45 },
      { id: "unit-3-lesson-5", title: "Timed mock and feedback", focus: "Assessment", minutes: 60 },
      { id: "unit-3-lesson-6", title: "Band score recovery plan", focus: "Review", minutes: 45 },
    ],
    status: "draft",
    order: 3,
    updatedAt: "Nov 13, 2026",
  },
  {
    id: "unit-4",
    title: "Grammar foundations",
    level: "A2 Elementary",
    summary: "Core grammar repair for students who can communicate but need more accuracy and confidence.",
    objectives: ["Use past simple and present perfect accurately", "Form conditionals with confidence", "Notice and fix common article errors"],
    lessons: [
      { id: "unit-4-lesson-1", title: "Past simple vs present perfect", focus: "Tense", minutes: 45 },
      { id: "unit-4-lesson-2", title: "First and second conditionals", focus: "Conditionals", minutes: 45 },
      { id: "unit-4-lesson-3", title: "Articles in everyday speech", focus: "Accuracy", minutes: 45 },
      { id: "unit-4-lesson-4", title: "Error correction workshop", focus: "Review", minutes: 45 },
    ],
    status: "published",
    order: 4,
    updatedAt: "Nov 5, 2026",
  },
];
