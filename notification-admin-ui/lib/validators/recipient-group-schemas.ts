import { z } from "zod";

export const createRecipientGroupSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  isActive: z.boolean(),
});

export type CreateRecipientGroupFormData = z.infer<typeof createRecipientGroupSchema>;

export const addMemberSchema = z.object({
  email: z.string().min(1, "Email is required").email("Must be a valid email"),
  memberName: z.string().optional(),
  phone: z.string().optional(),
  deviceToken: z.string().optional(),
});

export type AddMemberFormData = z.infer<typeof addMemberSchema>;
