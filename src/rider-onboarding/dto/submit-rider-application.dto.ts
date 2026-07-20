import { Equals } from 'class-validator';

export class SubmitRiderApplicationDto {
  @Equals(true)
  submit!: boolean;
}