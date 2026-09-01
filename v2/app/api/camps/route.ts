import { desc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { getD1, getDb } from "../../../db";
import { camps, confirmations } from "../../../db/schema";

export const dynamic = "force-dynamic";

const createCampSchema = z.object({
  label: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(500).default(""),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const confirmCampSchema = z.object({
  campId: z.number().int().positive(),
  verdict: z.enum(["still_here", "not_there", "needs_followup"]),
  note: z.string().trim().max(300).default(""),
});

async function actor() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const id = requestHeaders.get("oai-authenticated-user-id") ?? "unknown";
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  const name =
    encodedName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedName)
      : null;
  return { id, displayName: name ?? email ?? "Outreach worker" };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return Response.json(
      { error: "The shared location database is being prepared. Please try again shortly." },
      { status: 503 },
    );
  }
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const rows = await getDb()
      .select({
        id: camps.id,
        label: camps.label,
        notes: camps.notes,
        latitude: camps.latitude,
        longitude: camps.longitude,
        status: camps.status,
        createdBy: camps.createdBy,
        createdAt: camps.createdAt,
        updatedAt: camps.updatedAt,
        lastConfirmedAt: camps.lastConfirmedAt,
        confirmationCount: sql<number>`count(${confirmations.id})`,
      })
      .from(camps)
      .leftJoin(confirmations, eq(confirmations.campId, camps.id))
      .groupBy(camps.id)
      .orderBy(desc(camps.updatedAt));
    return Response.json({ camps: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createCampSchema.parse(await request.json());
    const user = await actor();
    const [camp] = await getDb()
      .insert(camps)
      .values({ ...payload, createdBy: user.displayName, createdById: user.id })
      .returning();
    return Response.json({ camp: { ...camp, confirmationCount: 0 } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Please check the location details." }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = confirmCampSchema.parse(await request.json());
    const user = await actor();
    const status =
      payload.verdict === "still_here"
        ? "active"
        : payload.verdict === "not_there"
          ? "inactive"
          : "needs_check";
    const database = getD1();
    await database.batch([
      database
        .prepare(
          `INSERT INTO confirmations
            (camp_id, verdict, note, confirmed_by, confirmed_by_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(payload.campId, payload.verdict, payload.note, user.displayName, user.id),
      database
        .prepare(
          `UPDATE camps
           SET status = ?, last_confirmed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(status, payload.campId),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Please choose a confirmation." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
