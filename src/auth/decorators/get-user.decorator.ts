import {
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";

export const GetUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    console.log("REQUEST USER:", request.user);

    return request.user;
  },
);