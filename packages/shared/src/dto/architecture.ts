import { z } from 'zod';
import type { ArchitecturePermissions } from '../access/roles.js';
import { architectureSchema } from '../dsl/schema.js';
import type { Architecture } from '../dsl/types.js';

export interface ArchitectureRecordDto {
  id: string;
  slug: string;
  title: string;
  summary: string;
  isPublic: boolean;
  isReference: boolean;
  ownerUserId: string | null;
  ownerName: string | null;
  companyId: string | null;
  companyName: string | null;
  companySlug: string | null;
  dslJson: Architecture;
  yamlSource: string;
  permissions: ArchitecturePermissions;
  createdAt: string;
  updatedAt: string;
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createArchitectureSchema = z
  .strictObject({
    title: z.string().trim().min(1, 'Title is required').max(120).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugPattern, 'Slug may only contain lowercase letters, digits, and hyphens')
      .min(2)
      .max(96)
      .optional(),
    summary: z.string().trim().max(1000).optional(),
    isPublic: z.boolean().default(false),
    companyId: z.string().uuid('Invalid company id').nullable().optional(),
    yamlSource: z.string().min(1).optional(),
    dslJson: architectureSchema.optional(),
  })
  .refine((data) => Boolean(data.yamlSource || data.dslJson), {
    message: 'Either yamlSource or dslJson is required',
  });

export const updateArchitectureSchema = z.strictObject({
  title: z.string().trim().min(1, 'Title cannot be empty').max(120).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugPattern, 'Slug may only contain lowercase letters, digits, and hyphens')
    .min(2)
    .max(96)
    .optional(),
  summary: z.string().trim().max(1000).optional(),
  isPublic: z.boolean().optional(),
  companyId: z.string().uuid('Invalid company id').nullable().optional(),
  yamlSource: z.string().min(1).optional(),
  dslJson: architectureSchema.optional(),
});

export type CreateArchitectureInput = z.infer<typeof createArchitectureSchema>;
export type UpdateArchitectureInput = z.infer<typeof updateArchitectureSchema>;
