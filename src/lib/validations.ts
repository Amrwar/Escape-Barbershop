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
  paymentMethod: z.enum(VISIT_PAYMENT_METHODS),
  discount: z.number().min(0).max(100).optional().default(0),
  notes: z.string().max(500).nullable().optional().or(z.literal("")),
  items: z.array(visitItemSchema).min(1, "At least one service is required"),
  cashAmount: z.number().min(0).optional(),
  cardAmount: z.number().min(0).optional(),
  instapayAmount: z.number().min(0).optional(),
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
export type ServiceInput = z.infer<typeof serviceSchema>;
export type BarberInput = z.infer<typeof barberSchema>;
export type VisitInput = z.infer<typeof visitSchema>;
export type PenaltyInput = z.infer<typeof penaltySchema>;
export type SalarySettingsInput = z.infer<typeof salarySettingsSchema>;
export type OpenDrawerInput = z.infer<typeof openDrawerSchema>;
export type CloseDrawerInput = z.infer<typeof closeDrawerSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
