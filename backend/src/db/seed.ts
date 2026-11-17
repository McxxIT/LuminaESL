import "dotenv/config";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { loadEnv } from "../config/env";
import { hashPassword } from "../lib/password";
import {
  assignments,
  courseUnits,
  courses,
  creditEntries,
  lessonPlans,
  settings,
  slotOpenings,
  studentProfiles,
  teacherProfiles,
  users,
} from "./schema";

const env = loadEnv();
const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => undefined });
const db = drizzle(client);

const DEMO_PASSWORD = "Password123!";

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function upsertUser(input: {
  name: string;
  email: string;
  role: "admin" | "manager" | "teacher" | "student";
  avatarColor: string;
}) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [created] = await db
    .insert(users)
    .values({ ...input, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (created) return created;

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (!existing) throw new Error(`Could not load user ${input.email}`);
  return existing;
}

async function main() {
  const admin = await upsertUser({
    name: "Jamie Smith",
    email: "admin@lumina.school",
    role: "admin",
    avatarColor: "#6366f1",
  });
  const manager = await upsertUser({
    name: "Priya Raman",
    email: "manager@lumina.school",
    role: "manager",
    avatarColor: "#8b5cf6",
  });
  await upsertUser({
    name: "Marco Bianchi",
    email: "manager2@lumina.school",
    role: "manager",
    avatarColor: "#10b981",
  });
  const teacher = await upsertUser({
    name: "Alex Johnson",
    email: "teacher@lumina.school",
    role: "teacher",
    avatarColor: "#f97316",
  });
  const student = await upsertUser({
    name: "Mia Chen",
    email: "student@lumina.school",
    role: "student",
    avatarColor: "#6366f1",
  });

  await db
    .insert(teacherProfiles)
    .values({
      userId: teacher.id,
      managerId: manager.id,
      headline: "Business English and conversation coach",
      specializations: [
        "Business English",
        "Conversation",
        "Pronunciation",
        "Interview preparation",
      ],
      languages: ["English", "Mandarin Chinese", "Spanish"],
      bio: "I help ambitious professionals sound clear, calm, and confident in English. My lessons blend real workplace scenarios with focused correction, so students leave with language they can use the same day.",
      hireDate: "2023-01-09",
      weeklyGoalHours: 24,
    })
    .onConflictDoNothing({ target: teacherProfiles.userId });

  await db
    .insert(studentProfiles)
    .values({
      userId: student.id,
      managerId: manager.id,
      level: "B1 Intermediate",
      targetLevel: "B2 Upper intermediate",
      goal: "Lead client meetings with confidence",
      guardianName: "Wei Chen",
      guardianEmail: "wei.chen@example.com",
      guardianRelationship: "Parent",
    })
    .onConflictDoNothing({ target: studentProfiles.userId });

  await db
    .insert(settings)
    .values({ id: 1 })
    .onConflictDoNothing({ target: settings.id });

  const [existingCourse] = await db
    .select()
    .from(courses)
    .where(eq(courses.title, "Everyday Business English"))
    .limit(1);

  let courseId = existingCourse?.id;
  if (!courseId) {
    const [course] = await db
      .insert(courses)
      .values({
        title: "Everyday Business English",
        level: "intermediate",
        summary: "Practical speaking, writing, and meeting skills.",
        objectives: [
          "Lead a short stand-up meeting",
          "Write clear follow-up emails",
        ],
        status: "published",
        ownerId: manager.id,
      })
      .returning();
    if (!course) throw new Error("Failed to seed course");
    courseId = course.id;

    const [unit] = await db
      .insert(courseUnits)
      .values({ courseId, order: 1, title: "Meetings that move work" })
      .returning();
    if (unit) {
      await db.insert(lessonPlans).values([
        {
          unitId: unit.id,
          order: 1,
          title: "Opening a stand-up",
          focus: ["signposting", "past simple"],
          summary: "Warm-up and a two-minute status update.",
          sections: [
            {
              heading: "Warm-up",
              items: ["Share one win from this week"],
            },
          ],
        },
        {
          unitId: unit.id,
          order: 2,
          title: "Clarifying action items",
          focus: ["questions", "modal verbs"],
          summary: "Practise confirming owners and deadlines.",
          sections: [
            {
              heading: "Role play",
              items: ["Confirm who does what by when"],
            },
          ],
        },
      ]);
    }
  }

  const [existingCredit] = await db
    .select({ id: creditEntries.id })
    .from(creditEntries)
    .where(eq(creditEntries.studentId, student.id))
    .limit(1);
  if (!existingCredit) {
    await db.insert(creditEntries).values({
      studentId: student.id,
      hours: 12,
      amount: 12000,
      reason: "purchase",
      description: "Demo starter package",
      actorId: admin.id,
    });
  }

  const [existingSlot] = await db
    .select({ id: slotOpenings.id })
    .from(slotOpenings)
    .limit(1);
  if (!existingSlot) {
    await db.insert(slotOpenings).values([
      {
        teacherId: teacher.id,
        date: isoDate(1),
        time: "09:00",
        openedBy: teacher.id,
      },
      {
        teacherId: teacher.id,
        date: isoDate(2),
        time: "14:30",
        openedBy: teacher.id,
      },
    ]);
  }

  const [existingAssignment] = await db
    .select({ id: assignments.id })
    .from(assignments)
    .limit(1);
  if (!existingAssignment) {
    await db.insert(assignments).values({
      studentId: student.id,
      teacherId: teacher.id,
      title: "Record a 90-second project update",
      type: "recording",
      description: "Use the signposting phrases from class.",
      instructions: "Upload an audio note and include one question.",
      dueLabel: "Before next lesson",
    });
  }

  console.log("Seed complete.");
  console.log("Demo accounts (password: Password123!):");
  console.log("  admin@lumina.school (Jamie Smith)");
  console.log("  manager@lumina.school (Priya Raman)");
  console.log("  manager2@lumina.school (Marco Bianchi)");
  console.log("  teacher@lumina.school (Alex Johnson)");
  console.log("  student@lumina.school (Mia Chen)");
  console.log(`Course id: ${courseId ?? "existing"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
