import type { Architecture, CompanyRole, UserRole } from '@atlas/shared';
import type { ColumnType, Generated, Insertable, JSONColumnType, Selectable, Updateable } from 'kysely';

export type TimestampColumn = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  avatar_url: string | null;
  google_id: string;
  role: ColumnType<UserRole, UserRole | undefined, UserRole>;
  active_company_id: string | null;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  updated_at: TimestampColumn;
}

export interface CompaniesTable {
  id: Generated<string>;
  name: string;
  slug: string;
  description: ColumnType<string, string | undefined, string>;
  website: string | null;
  owner_id: string;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  updated_at: TimestampColumn;
}

export interface CompanyMembersTable {
  id: Generated<string>;
  company_id: string;
  user_id: string;
  role: CompanyRole;
  joined_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface ArchitecturesTable {
  id: Generated<string>;
  slug: string;
  title: string;
  summary: ColumnType<string, string | undefined, string>;
  is_public: ColumnType<boolean, boolean | undefined, boolean>;
  is_reference: ColumnType<boolean, boolean | undefined, boolean>;
  owner_user_id: string | null;
  company_id: string | null;
  dsl_json: JSONColumnType<Architecture, Architecture | string, Architecture | string>;
  yaml_source: string;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  updated_at: TimestampColumn;
}

export interface Database {
  users: UsersTable;
  companies: CompaniesTable;
  company_members: CompanyMembersTable;
  architectures: ArchitecturesTable;
}

export type UserRow = Selectable<UsersTable>;
export type NewUserRow = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type CompanyRow = Selectable<CompaniesTable>;
export type NewCompanyRow = Insertable<CompaniesTable>;
export type CompanyUpdate = Updateable<CompaniesTable>;

export type CompanyMemberRow = Selectable<CompanyMembersTable>;
export type NewCompanyMemberRow = Insertable<CompanyMembersTable>;

export type ArchitectureRow = Selectable<ArchitecturesTable>;
export type NewArchitectureRow = Insertable<ArchitecturesTable>;
export type ArchitectureUpdate = Updateable<ArchitecturesTable>;
