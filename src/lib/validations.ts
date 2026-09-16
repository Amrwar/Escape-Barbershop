import { z } from "zod";
import { OUTFLOW_METHODS, VISIT_PAYMENT_METHODS } from "./payments";

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
  excludeFromCommission: z.boolean().optional().default(false),
  durationMinutes: z.number().int().min(5, "A service must take at least 5 minutes").max(600).optional().default(30),
  bookableOnline: z.boolean().optional().default(true),
});

export const barberSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional().or(z.literal("")),
  isActive: z.boolean().optional().default(true),
  /** Off for anyone who works here but takes no bookings — a manager, the owner. */
  bookableOnline: z.boolean().optional().default(true),
  bio: z.string().max(300).optional().or(z.literal("")),
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
  paymentMethod: z.enum(VISIT_PAYMENT_METHODS),
  discount: z.number().min(0).max(100).optional().default(0),
  notes: z.string().max(500).nullable().optional().or(z.literal("")),
  items: z.array(visitItemSchema).min(1, "At least one service is required"),
  cashAmount: z.number().min(0).optional(),
  cardAmount: z.number().min(0).optional(),
  instapayAmount: z.number().min(0).optional(),
  /** Set when this visit is settling a booked appointment. */
  appointmentId: z.string().optional(),
  tip: z.number().min(0).optional().default(0),
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

export const payMethodSchema = z.enum(["CASH", "CARD"]);
/** Expenses and advances can also go out by InstaPay. */
export const outflowMethodSchema = z.enum(OUTFLOW_METHODS);

export const expenseSchema = z.object({
  date: z.string().min(1, "Date is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  reason: z.string().min(1, "Reason is required").max(500),
  paymentMethod: outflowMethodSchema.default("CASH"),
  category: z.string().max(100).nullable().optional(),
});

export const advanceSchema = z.object({
  barberId: z.string().min(1, "Barber is required"),
  date: z.string().min(1, "Date is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMethod: outflowMethodSchema.default("CASH"),
  notes: z.string().max(500).nullable().optional().or(z.literal("")),
});

export const supplierSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  isActive: z.boolean().optional().default(true),
});

export const purchaseItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantity: z.number().min(0.0001, "Quantity must be greater than 0"),
  unitCost: z.number().min(0, "Cost must be non-negative"),
});

export const purchaseInvoiceSchema = z.object({
  number: z.string().max(50).optional().or(z.literal("")),
  supplierId: z.string().nullable().optional().or(z.literal("")),
  date: z.string().min(1, "Date is required"),
  paymentType: z.enum(["CASH", "CARD", "CREDIT"]),
  notes: z.string().max(500).optional().or(z.literal("")),
  items: z.array(purchaseItemSchema).min(1, "At least one product is required"),
});

export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  date: z.string().min(1, "Date is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  paymentMethod: payMethodSchema.default("CASH"),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const stockTransferSchema = z.object({
  number: z.string().max(50).optional().or(z.literal("")),
  date: z.string().min(1, "Date is required"),
  fromLocation: z.enum(["MAIN", "BRANCH"]).default("MAIN"),
  toLocation: z.enum(["MAIN", "BRANCH"]).default("BRANCH"),
  notes: z.string().max(500).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product is required"),
        quantity: z.number().min(0.0001, "Quantity must be greater than 0"),
      })
    )
    .min(1, "At least one product is required"),
});

export const stockCountSchema = z.object({
  date: z.string().min(1, "Date is required"),
  location: z.enum(["MAIN", "BRANCH"]).default("BRANCH"),
  notes: z.string().max(500).optional().or(z.literal("")),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product is required"),
        countedQty: z.number().min(0, "Counted quantity must be non-negative"),
      })
    )
    .min(1, "At least one product is required"),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
export type AdvanceInput = z.infer<typeof advanceSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type PurchaseInvoiceInput = z.infer<typeof purchaseInvoiceSchema>;
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;
export type StockTransferInput = z.infer<typeof stockTransferSchema>;
export type StockCountInput = z.infer<typeof stockCountSchema>;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  email: z.string().email("Invalid email address").optional(),
});

export const userCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["OWNER", "CASHIER"]),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email("Invalid email address").optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: z.enum(["OWNER", "CASHIER"]).optional(),
});

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export const APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "COMPLETED_UNPAID",
  "CANCELLED",
  "NO_SHOW",
] as const;

export const appointmentSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  /** Null means nobody is assigned yet; the shop can pick a barber later. */
  barberId: z.string().nullable().optional(),
  startAt: z.string().min(1, "A start time is required"),
  serviceIds: z.array(z.string().min(1)).min(1, "At least one service is required"),
  notes: z.string().max(500).nullable().optional().or(z.literal("")),
  source: z.enum(["ONLINE", "PHONE", "WALK_IN", "STAFF"]).optional().default("STAFF"),
});

/** Somebody who has just walked in: no time, only a place in the queue. */
export const walkInSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  /** Null means the next barber free. */
  barberId: z.string().nullable().optional(),
  serviceIds: z.array(z.string().min(1)).min(1, "At least one service is required"),
  notes: z.string().max(500).nullable().optional().or(z.literal("")),
});

/** Moving somebody through the queue: give them a chair, or start them. */
export const queueActionSchema = z.object({
  barberId: z.string().nullable().optional(),
  start: z.boolean().optional(),
});

export const appointmentUpdateSchema = z.object({
  barberId: z.string().nullable().optional(),
  startAt: z.string().optional(),
  serviceIds: z.array(z.string().min(1)).min(1).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  notes: z.string().max(500).nullable().optional().or(z.literal("")),
  cancelReason: z.string().max(200).optional().or(z.literal("")),
});

const dayHoursSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(24 * 60),
    endMinute: z.number().int().min(0).max(24 * 60),
    isOpen: z.boolean().optional().default(true),
  })
  .refine((d) => !d.isOpen || d.endMinute > d.startMinute, {
    message: "Closing time must be after opening time",
  });

export const bookingSettingsSchema = z.object({
  settings: z
    .object({
      slotMinutes: z.number().int().min(5).max(120).optional(),
      minNoticeMinutes: z.number().int().min(0).max(7 * 24 * 60).optional(),
      maxDaysAhead: z.number().int().min(1).max(365).optional(),
      bufferMinutes: z.number().int().min(0).max(120).optional(),
      cancelWindowMinutes: z.number().int().min(0).max(7 * 24 * 60).optional(),
      onlineBookingEnabled: z.boolean().optional(),
    })
    .optional(),
  hours: z.array(dayHoursSchema).max(7).optional(),
});

/** A customer signing themselves up on their phone. */
export const customerRegisterSchema = z.object({
  name: z.string().min(2, "Please enter your name").max(100),
  phone: z.string().min(6, "Please enter your phone number").max(20),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const customerProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6, "Password must be at least 6 characters").optional(),
});

/** What a customer may ask for: their own booking, nobody else's. */
export const customerBookingSchema = z.object({
  barberId: z.string().nullable().optional(),
  startAt: z.string().min(1, "Please choose a time"),
  serviceIds: z.array(z.string().min(1)).min(1, "Please choose a service"),
  notes: z.string().max(300).optional().or(z.literal("")),
});

export const customerRescheduleSchema = z.object({
  startAt: z.string().min(1),
  barberId: z.string().nullable().optional(),
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type BarberInput = z.infer<typeof barberSchema>;
export type VisitInput = z.infer<typeof visitSchema>;
export type PenaltyInput = z.infer<typeof penaltySchema>;
export type SalarySettingsInput = z.infer<typeof salarySettingsSchema>;
export type OpenDrawerInput = z.infer<typeof openDrawerSchema>;
export type CloseDrawerInput = z.infer<typeof closeDrawerSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
