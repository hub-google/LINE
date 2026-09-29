import { prisma } from "@/lib/prisma";

const TZ = "Asia/Taipei";

function taipeiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return { year: Number(value("year")), month: Number(value("month")), day: Number(value("day")) };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function billingMonthKey(date = new Date()) {
  const { year, month } = taipeiParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function effectivePayDay(payDay: number, date = new Date()) {
  const { year, month } = taipeiParts(date);
  return Math.min(Math.max(payDay, 1), daysInMonth(year, month));
}

export function isReminderDay(payDay: number, date = new Date()) {
  const { year, month, day } = taipeiParts(date);
  const due = Math.min(Math.max(payDay, 1), daysInMonth(year, month));
  return day === Math.max(1, due - 3);
}

export async function ensureMonthlyTransaction(projectId: string, payerId: string, amount: unknown) {
  const billingMonth = billingMonthKey();
  return prisma.transaction.upsert({
    where: { projectId_payerId_billingMonth: { projectId, payerId, billingMonth } },
    update: {},
    create: {
      projectId,
      payerId,
      billingMonth,
      amount: amount as never,
      status: "UNPAID",
    },
  });
}
