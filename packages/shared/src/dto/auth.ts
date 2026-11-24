import { z } from 'zod';
import type { UserRole } from '../access/roles.js';

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  activeCompanyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionDto {
  user: AuthUserDto | null;
}

export const updateActiveCompanySchema = z.strictObject({
  companyId: z.string().uuid('Invalid company id').nullable(),
});

export type UpdateActiveCompanyInput = z.infer<typeof updateActiveCompanySchema>;
