import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { WellPlayedController } from './webhooks/well-played/well-played.controller';

@Module({
  imports: [],
  controllers: [AppController, WellPlayedController],
  providers: [],
})
export class AppModule {}
