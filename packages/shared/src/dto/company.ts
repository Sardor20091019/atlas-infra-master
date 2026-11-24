import { z } from 'zod';
import { COMPANY_ROLES, type CompanyRole } from '../access/roles.js';

export interface CompanyDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  website: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyWithRoleDto extends CompanyDto {
  myRole: CompanyRole;
  memberCount: number;
}

export interface CompanyMemberDto {
  id: string;
  companyId: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: CompanyRole;
  joinedAt: string;
}

export interface CompanyDetailDto extends CompanyWithRoleDto {
  members: CompanyMemberDto[];
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const websiteField = z
  .union([
    z.string().trim().url('Website must be a valid URL (including https:// or http://)').max(255),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === '' ? null : v));

export const createCompanySchema = z.strictObject({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters').max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugPattern, 'Slug may only contain lowercase letters, digits, and hyphens')
    .min(2)
    .max(64)
    .optional(),
  description: z.string().trim().max(500).default(''),
  website: websiteField,
});

export const updateCompanySchema = z.strictObject({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters').max(80).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugPattern, 'Slug may only contain lowercase letters, digits, and hyphens')
    .min(2)
    .max(64)
    .optional(),
  description: z.string().trim().max(500).optional(),
  website: websiteField,
});

export const addCompanyMemberSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(COMPANY_ROLES).default('editor'),
});

export const updateCompanyMemberSchema = z.strictObject({
  role: z.enum(COMPANY_ROLES),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type AddCompanyMemberInput = z.infer<typeof addCompanyMemberSchema>;
export type UpdateCompanyMemberInput = z.infer<typeof updateCompanyMemberSchema>;
