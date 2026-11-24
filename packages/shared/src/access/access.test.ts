import { describe, expect, it } from 'vitest';
import {
  canCreateCompanyArchitecture,
  canDeleteArchitecture,
  canDeleteCompany,
  canEditArchitecture,
  canManageCompany,
  canReadArchitecture,
  getArchitecturePermissions,
} from './roles.js';
import { referenceArchitectures, validateReferenceArchitectures } from '../architectures/index.js';
import { createArchitectureSchema, createCompanySchema } from '../index.js';

describe('reference architectures', () => {
  it('validates all four built-in reference architectures cleanly', () => {
    expect(() => validateReferenceArchitectures()).not.toThrow();
    expect(referenceArchitectures.map((a) => a.id)).toEqual([
      'web-evolution',
      'simple-web-app',
      'k8s-prod-cluster',
      'three-tier-network',
    ]);
  });
});

describe('access control policy predicates', () => {
  const userA = { id: 'user-a', role: 'user' as const };
  const userB = { id: 'user-b', role: 'user' as const };
  const sysAdmin = { id: 'sys-admin', role: 'admin' as const };

  const refArch = { isPublic: true, isReference: true, ownerUserId: null, companyId: null };
  const privatePersonal = { isPublic: false, isReference: false, ownerUserId: 'user-a', companyId: null };
  const publicPersonal = { isPublic: true, isReference: false, ownerUserId: 'user-a', companyId: null };
  const privateCompany = { isPublic: false, isReference: false, ownerUserId: 'user-a', companyId: 'comp-1' };

  it('allows anyone to read reference and public architectures, but blocks editing reference for non-admins', () => {
    expect(canReadArchitecture(null, refArch)).toBe(true);
    expect(canEditArchitecture(null, refArch)).toBe(false);
    expect(canEditArchitecture(userA, refArch)).toBe(false);
    expect(canDeleteArchitecture(userA, refArch)).toBe(false);
    expect(canEditArchitecture(sysAdmin, refArch)).toBe(true);
  });

  it('enforces personal ownership on private and public personal architectures', () => {
    expect(canReadArchitecture(null, privatePersonal)).toBe(false);
    expect(canReadArchitecture(userB, privatePersonal)).toBe(false);
    expect(canReadArchitecture(userA, privatePersonal)).toBe(true);
    expect(canEditArchitecture(userA, privatePersonal)).toBe(true);
    expect(canDeleteArchitecture(userA, privatePersonal)).toBe(true);

    expect(canReadArchitecture(null, publicPersonal)).toBe(true);
    expect(canEditArchitecture(userB, publicPersonal)).toBe(false);
    expect(canDeleteArchitecture(userB, publicPersonal)).toBe(false);
  });

  it('enforces company membership roles accurately', () => {
    expect(canReadArchitecture(userB, privateCompany, null)).toBe(false);
    expect(canReadArchitecture(userB, privateCompany, 'viewer')).toBe(true);
    expect(canEditArchitecture(userB, privateCompany, 'viewer')).toBe(false);
    expect(canDeleteArchitecture(userB, privateCompany, 'viewer')).toBe(false);

    expect(canEditArchitecture(userB, privateCompany, 'editor')).toBe(true);
    expect(canDeleteArchitecture(userB, privateCompany, 'editor')).toBe(false);

    expect(canEditArchitecture(userB, privateCompany, 'admin')).toBe(true);
    expect(canDeleteArchitecture(userB, privateCompany, 'admin')).toBe(true);

    expect(canEditArchitecture(userB, privateCompany, 'owner')).toBe(true);
    expect(canDeleteArchitecture(userB, privateCompany, 'owner')).toBe(true);
  });

  it('computes company role helpers and permission reasons', () => {
    expect(canDeleteCompany('owner')).toBe(true);
    expect(canDeleteCompany('admin')).toBe(false);
    expect(canManageCompany('admin')).toBe(true);
    expect(canManageCompany('editor')).toBe(false);
    expect(canCreateCompanyArchitecture('editor')).toBe(true);
    expect(canCreateCompanyArchitecture('viewer')).toBe(false);

    const viewerPerms = getArchitecturePermissions(userB, privateCompany, 'viewer');
    expect(viewerPerms).toMatchObject({
      canView: true,
      canEdit: false,
      canDelete: false,
      source: 'company',
    });
    expect(viewerPerms.reason).toContain('Viewer');
  });
});

describe('DTO schemas', () => {
  it('validates company input and normalizes empty website', () => {
    const parsed = createCompanySchema.parse({ name: 'Acme Infra', website: '' });
    expect(parsed.website).toBeNull();
    expect(parsed.description).toBe('');
  });

  it('requires yamlSource or dslJson on createArchitectureSchema', () => {
    const bad = createArchitectureSchema.safeParse({ title: 'Empty' });
    expect(bad.success).toBe(false);
  });
});
