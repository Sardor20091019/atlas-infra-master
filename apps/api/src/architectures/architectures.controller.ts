import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createArchitectureSchema,
  updateArchitectureSchema,
  type CreateArchitectureInput,
  type UpdateArchitectureInput,
} from '@atlas/shared';
import type { Request } from 'express';
import type { ResolvedArchitectureAccess } from '../access-control/access-control.service';
import {
  CurrentUser,
  Public,
  RequireArchitecturePermission,
} from '../access-control/decorators';
import { ArchitectureAccessGuard } from '../access-control/guards/architecture-access.guard';
import { ParseUuidPipe } from '../common/pipes/parse-uuid.pipe';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { UserRow } from '../database/database.types';
import { ArchitecturesService } from './architectures.service';

type ArchitectureRequest = Request & { architectureAccess: ResolvedArchitectureAccess };

@Controller('architectures')
export class ArchitecturesController {
  constructor(
    @Inject(ArchitecturesService) private readonly architectures: ArchitecturesService,
  ) {}

  @Public()
  @Get()
  list(
    @CurrentUser() user: UserRow | undefined,
    @Query('scope') scope?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.architectures.list(user, { scope, companyId });
  }

  @Public()
  @UseGuards(ArchitectureAccessGuard)
  @RequireArchitecturePermission('read')
  @Get(':idOrSlug')
  getOne(@CurrentUser() user: UserRow | undefined, @Req() req: ArchitectureRequest) {
    return this.architectures.getDetail(req.architectureAccess, user);
  }

  @Post()
  create(
    @CurrentUser() user: UserRow,
    @Body(new ZodValidationPipe(createArchitectureSchema)) body: CreateArchitectureInput,
  ) {
    return this.architectures.create(user, body);
  }

  @UseGuards(ArchitectureAccessGuard)
  @RequireArchitecturePermission('edit')
  @Patch(':id')
  update(
    @Param('id', ParseUuidPipe) _id: string,
    @CurrentUser() user: UserRow,
    @Req() req: ArchitectureRequest,
    @Body(new ZodValidationPipe(updateArchitectureSchema)) body: UpdateArchitectureInput,
  ) {
    return this.architectures.update(user, req.architectureAccess, body);
  }

  @UseGuards(ArchitectureAccessGuard)
  @RequireArchitecturePermission('delete')
  @Delete(':id')
  remove(@Param('id', ParseUuidPipe) id: string) {
    return this.architectures.remove(id);
  }
}
