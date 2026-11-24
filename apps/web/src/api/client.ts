import type {
  AddCompanyMemberInput,
  ArchitectureRecordDto,
  AuthUserDto,
  CompanyDetailDto,
  CompanyMemberDto,
  CompanyWithRoleDto,
  CreateArchitectureInput,
  CreateCompanyInput,
  Diagnostic,
  UpdateArchitectureInput,
  UpdateCompanyInput,
  UpdateCompanyMemberInput,
} from '@atlas/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly diagnostics?: Diagnostic[];

  constructor(status: number, message: string, diagnostics?: Diagnostic[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.diagnostics = diagnostics;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let diagnostics: Diagnostic[] | undefined;
    try {
      const data = (await res.json()) as {
        message?: string | string[];
        diagnostics?: Diagnostic[];
      };
      if (Array.isArray(data.message)) {
        message = data.message.join(', ');
      } else if (typeof data.message === 'string' && data.message.trim()) {
        message = data.message;
      }
      diagnostics = data.diagnostics;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new ApiError(res.status, message, diagnostics);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  auth: {
    getGoogleLoginUrl: () => '/api/auth/google',
    async getMe(): Promise<AuthUserDto | null> {
      try {
        const res = await request<{ user: AuthUserDto }>('/api/auth/me');
        return res.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    async logout(): Promise<void> {
      await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    },
    async setActiveCompany(companyId: string | null): Promise<AuthUserDto> {
      const res = await request<{ user: AuthUserDto }>('/api/auth/active-company', {
        method: 'PATCH',
        body: JSON.stringify({ companyId }),
      });
      return res.user;
    },
  },

  companies: {
    list: () => request<CompanyWithRoleDto[]>('/api/companies'),
    create: (input: CreateCompanyInput) =>
      request<CompanyWithRoleDto>('/api/companies', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    getDetail: (id: string) => request<CompanyDetailDto>(`/api/companies/${encodeURIComponent(id)}`),
    update: (id: string, input: UpdateCompanyInput) =>
      request<CompanyWithRoleDto>(`/api/companies/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      request<{ ok: boolean; id: string }>(`/api/companies/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    listMembers: (companyId: string) =>
      request<CompanyMemberDto[]>(`/api/companies/${encodeURIComponent(companyId)}/members`),
    addMember: (companyId: string, input: AddCompanyMemberInput) =>
      request<CompanyMemberDto>(`/api/companies/${encodeURIComponent(companyId)}/members`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    updateMember: (companyId: string, userId: string, input: UpdateCompanyMemberInput) =>
      request<CompanyMemberDto>(
        `/api/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      ),
    removeMember: (companyId: string, userId: string) =>
      request<{ ok: boolean; userId: string }>(
        `/api/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
        },
      ),
  },

  architectures: {
    list: (params?: { scope?: string; companyId?: string }) => {
      const qs = new URLSearchParams();
      if (params?.scope) qs.set('scope', params.scope);
      if (params?.companyId) qs.set('companyId', params.companyId);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<ArchitectureRecordDto[]>(`/api/architectures${suffix}`);
    },
    getOne: (idOrSlug: string) =>
      request<ArchitectureRecordDto>(`/api/architectures/${encodeURIComponent(idOrSlug)}`),
    create: (input: CreateArchitectureInput) =>
      request<ArchitectureRecordDto>('/api/architectures', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, input: UpdateArchitectureInput) =>
      request<ArchitectureRecordDto>(`/api/architectures/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      request<{ ok: boolean; id: string }>(`/api/architectures/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
};
