import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class SocketAuthDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}