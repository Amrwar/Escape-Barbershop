import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const customerSchema = z.object({
  name: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const serviceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  arabicName: z.string().max(100).optional(),
  defaultPrice: z.number().min(0, "Price must be non-negative"),
  isActive: z.boolean().optional().default(true),
});

export const barberSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional().or(z.literal("")),
  isActive: z.boolean().optional().default(true),
});

export const visitItemSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  priceAtTime: z.number().min(0, "Price must be non-negative"),
});

export const visitSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  barberId: z.string().min(1, "Barber is required"),
  visitAt: z.string().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "MIXED"]),
  discount: z.number().min(0).max(100).optional().default(0),
  notes: z.string().max(500).nullable().optional().or(z.literal("")),
  items: z.array(visitItemSchema).min(1, "At least one service is required"),
  cashAmount: z.number().min(0).optional(),
  cardAmount: z.number().min(0).optional(),
});

export const openDrawerSchema = z.object({
  openingCash: z.number().min(0),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const closeDrawerSchema = z.object({
  closingCashCounted: z.number().min(0),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const cashMovementSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: z.number().min(0.01),
  reason: z.string().min(1).max(500),
});

export const penaltySchema = z.object({
  barberId: z.string().min(1, "Barber is required"),
  date: z.string().min(1, "Date is required"),
  amount: z.number().min(0.01, "Amount must be positive"),
  reason: z.string().min(1, "Reason is required").max(500),
});

export const salarySettingsSchema = z.object({
  baseSalary: z.number().min(0, "Base salary must be non-negative"),
  commissionType: z.enum(["PERCENT", "FIXED_PER_VISIT"]),
  commissionValue: z.number().min(0, "Commission value must be non-negative"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type BarberInput = z.infer<typeof barberSchema>;
export type VisitInput = z.infer<typeof visitSchema>;
export type PenaltyInput = z.infer<typeof penaltySchema>;
export type SalarySettingsInput = z.infer<typeof salarySettingsSchema>;
export type OpenDrawerInput = z.infer<typeof openDrawerSchema>;
export type CloseDrawerInput = z.infer<typeof closeDrawerSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
