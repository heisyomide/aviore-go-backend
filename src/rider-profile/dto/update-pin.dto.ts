import {
  IsString,
  Length,
} from 'class-validator';

export class UpdatePinDto {
  @IsString()
  @Length(4, 6)
  currentPin!: string;

  @IsString()
  @Length(4, 6)
  newPin!: string;

  @IsString()
  @Length(4, 6)
  confirmPin!: string;
}