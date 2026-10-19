import { z } from "zod";
import { LIMITS } from "@/lib/order/types";

/** Teks bebas: dipangkas, karakter kontrol dibuang, kosong menjadi undefined. Ditampilkan sebagai teks biasa. */
const plainText = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max))
    .transform((value) => (value === "" ? undefined : value))
    .optional();

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/);

export const createOrderSchema = z.object({
  outlet: slug,
  idempotencyKey: z.uuid(),
  orderType: z.enum(["DINE_IN", "TAKEAWAY"]),
  table: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,10}$/)
    .optional()
    .nullable()
    .transform((value) => value ?? undefined),
  nickname: plainText(LIMITS.nicknameMax),
  lines: z
    .array(
      z.object({
        sku: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        quantity: z.int().min(1).max(LIMITS.qtyMax),
        note: plainText(LIMITS.noteMax),
        expectedUnitPrice: z.int().positive(),
      }),
    )
    .min(1)
    .max(LIMITS.linesMax),
  expectedTotal: z.int().positive(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const staffActionSchema = z.object({
  outlet: slug,
  action: z.enum(["confirm-payment", "recall", "defer", "requeue", "cancel", "start", "ready", "recall-ready", "complete"]),
  expectedVersion: z.int().positive(),
  idempotencyKey: z.uuid(),
  reason: plainText(LIMITS.reasonMax),
  method: plainText(40),
});

export const callNextSchema = z.object({ outlet: slug, idempotencyKey: z.uuid() });

export const settingsSchema = z
  .object({
    outlet: slug,
    acceptingOrders: z.boolean().optional(),
    counterReady: z.boolean().optional(),
    autoCallNext: z.boolean().optional(),
  })
  .strict();

export const availabilitySchema = z.object({ outlet: slug, available: z.boolean() }).strict();

export const loginSchema = z.object({
  email: z.email().max(120),
  password: z.string().min(1).max(200),
});

export const slugSchema = slug;
export const uuidSchema = z.uuid();
