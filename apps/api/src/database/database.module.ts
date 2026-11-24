import { Global, Module } from '@nestjs/common';
import { DATABASE_DIALECT, DatabaseService } from './database.service';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_DIALECT,
      useValue: undefined,
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
