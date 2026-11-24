import { describe, expect, it } from 'vitest';
import type { ArchitectureRecordDto, AuthUserDto } from '@atlas/shared';
import { BLANK_TEMPLATE, parseArchitectureText } from '@atlas/shared';
import { evaluateCanEdit } from './useCanEdit';
import { CUSTOM_ID } from './useAtlasStore';

const mockUser: AuthUserDto = {
  id: 'u-1',
  email: 'user@example.com',
  name: 'User',
  avatarUrl: null,
  role: 'user',
  activeCompanyId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeCloudArch(canEdit: boolean, reason?: string): ArchitectureRecordDto {
  const parsed = parseArchitectureText(BLANK_TEMPLATE).arch!;
  return {
    id: 'arch-cloud-1',
    slug: 'cloud-1',
    title: 'Cloud 1',
    summary: '',
    isPublic: false,
    isReference: false,
    ownerUserId: 'u-1',
    ownerName: 'User',
    companyId: 'c-1',
    companyName: 'Acme',
    companySlug: 'acme',
    dslJson: parsed,
    yamlSource: BLANK_TEMPLATE,
    permissions: {
      canView: true,
      canEdit,
      canDelete: false,
      canManageVisibility: canEdit,
      source: 'company',
      ...(reason ? { reason } : {}),
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('evaluateCanEdit', () => {
  it('allows editing local scratch draft in build mode when clean', () => {
    const res = evaluateCanEdit({
      architectureId: CUSTOM_ID,
      appMode: 'build',
      diagnostics: [],
      traceId: null,
      user: null,
      cloudArchitectures: [],
    });
    expect(res.canEdit).toBe(true);
  });

  it('blocks editing in explore mode or on reference architectures', () => {
    expect(
      evaluateCanEdit({
        architectureId: CUSTOM_ID,
        appMode: 'explore',
        diagnostics: [],
        traceId: null,
        user: null,
        cloudArchitectures: [],
      }).canEdit,
    ).toBe(false);

    expect(
      evaluateCanEdit({
        architectureId: 'web-evolution',
        appMode: 'build',
        diagnostics: [],
        traceId: null,
        user: mockUser,
        cloudArchitectures: [],
      }).canEdit,
    ).toBe(false);
  });

  it('reflects cloud permissions accurately for editor vs viewer', () => {
    const editable = makeCloudArch(true);
    const readOnly = makeCloudArch(false, 'Your company role is Viewer (read-only).');

    expect(
      evaluateCanEdit({
        architectureId: editable.id,
        appMode: 'build',
        diagnostics: [],
        traceId: null,
        user: mockUser,
        cloudArchitectures: [editable],
      }).canEdit,
    ).toBe(true);

    const viewerRes = evaluateCanEdit({
      architectureId: readOnly.id,
      appMode: 'build',
      diagnostics: [],
      traceId: null,
      user: mockUser,
      cloudArchitectures: [readOnly],
    });
    expect(viewerRes.canEdit).toBe(false);
    expect(viewerRes.reason).toContain('Viewer');
  });

  it('blocks visual editing when YAML has errors or trace is playing', () => {
    expect(
      evaluateCanEdit({
        architectureId: CUSTOM_ID,
        appMode: 'build',
        diagnostics: [{ from: 0, to: 1, line: 1, severity: 'error', message: 'Syntax error' }],
        traceId: null,
        user: null,
        cloudArchitectures: [],
      }).canEdit,
    ).toBe(false);

    expect(
      evaluateCanEdit({
        architectureId: CUSTOM_ID,
        appMode: 'build',
        diagnostics: [],
        traceId: 'request',
        user: null,
        cloudArchitectures: [],
      }).canEdit,
    ).toBe(false);
  });
});
