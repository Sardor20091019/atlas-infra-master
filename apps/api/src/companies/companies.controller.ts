import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  addCompanyMemberSchema,
  createCompanySchema,
  updateCompanyMemberSchema,
  updateCompanySchema,
  type AddCompanyMemberInput,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type UpdateCompanyMemberInput,
} from '@atlas/shared';
import type { Request } from 'express';
import type { ResolvedCompanyAccess } from '../access-control/access-control.service';
import { CurrentUser, RequireCompanyRole } from '../access-control/decorators';
import { CompanyRoleGuard } from '../access-control/guards/company-role.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { UserRow } from '../database/database.types';
import { CompaniesService } from './companies.service';

type CompanyRequest = Request & { companyAccess: ResolvedCompanyAccess };

@Controller('companies')
export class CompaniesController {
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) {}

  @Post()
  create(
    @CurrentUser() user: UserRow,
    @Body(new ZodValidationPipe(createCompanySchema)) body: CreateCompanyInput,
  ) {
    return this.companies.createCompany(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: UserRow) {
    return this.companies.listUserCompanies(user.id);
  }

  @UseGuards(CompanyRoleGuard)
  @RequireCompanyRole('owner', 'admin')
  @Get(':id')
  getOne(@Param('id', ParseUuidPipe) id: string, @Req() req: CompanyRequest) {
    return this.companies.getCompanyDetail(id, req.companyAccess.membership.role);
  }

  @UseGuards(CompanyRoleGuard)
  @RequireCompanyRole('owner', 'admin')
  @Patch(':id')
  update(
    @Param('id', ParseUuidPipe) id: string,
    @Req() req: CompanyRequest,
    @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyInput,
  ) {
    return this.companies.updateCompany(id, req.companyAccess.membership.role, body);
  }

  @UseGuards(CompanyRoleGuard)
  @RequireCompanyRole('owner')
  @Delete(':id')
  remove(@Param('id', ParseUuidPipe) id: string) {
    return this.companies.deleteCompany(id);
  }

  @UseGuards(CompanyRoleGuard)
  @RequireCompanyRole('owner', 'admin')
  @Get(':id/members')
  listMembers(@Param('id', ParseUuidPipe) id: string) {
    return this.companies.listMembers(id);
  }

  @UseGuards(CompanyRoleGuard)
  @RequireCompanyRole('owner', 'admin')
  @Post(':id/members')
  addMember(
    @Param('id', ParseUuidPipe) id: string,
    @Req() req: CompanyRequest,
    @Body(new ZodValidationPipe(addCompanyMemberSchema)) body: AddCompanyMemberInput,
  ) {
    return this.companies.addMember(id, req.companyAccess.membership.role, body);
  }

  @UseGuards(CompanyRoleGuard)
  @RequireCompanyRole('owner', 'admin')
  @Patch(':id/members/:userId')
  updateMemberRole(
    @Param('id', ParseUuidPipe) id: string,
    @Param('userId', ParseUuidPipe) userId: string,
    @Req() req: CompanyRequest,
    @Body(new ZodValidationPipe(updateCompanyMemberSchema)) body: UpdateCompanyMemberInput,
  ) {
    return this.companies.updateMemberRole(id, req.companyAccess.membership.role, userId, body);
  }

  @UseGuards(CompanyRoleGuard)
  @RequireCompanyRole('owner', 'admin')
  @Delete(':id/members/:userId')
  removeMember(
    @Param('id', ParseUuidPipe) id: string,
    @Param('userId', ParseUuidPipe) userId: string,
    @Req() req: CompanyRequest,
  ) {
    return this.companies.removeMember(id, req.companyAccess.membership.role, userId);
  }
}
