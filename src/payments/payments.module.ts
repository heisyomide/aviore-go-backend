import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios"; // 🌟 Import HttpModule to fix the dependency error

import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

import { AuthModule } from "../auth/auth.module";
import { NotificationModule } from "src/notification/notification.module";

@Module({
  imports: [
    AuthModule,
    NotificationModule,
    HttpModule, // 🌟 Add it here to make HttpService available to PaymentsService
  ],

  controllers: [
    PaymentsController,
  ],

  providers: [
    PaymentsService,
  ],

  exports: [
    PaymentsService,
  ],
})
export class PaymentsModule {}