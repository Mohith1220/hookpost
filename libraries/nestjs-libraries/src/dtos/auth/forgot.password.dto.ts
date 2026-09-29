import { Transform } from 'class-transformer';
import { IsDefined, IsEmail, IsString } from 'class-validator';

export class ForgotPasswordDto {
  // " Jo@Gmail.com" is the same account as "jo@gmail.com"
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value
  )
  @IsString()
  @IsDefined()
  @IsEmail()
  email: string;
}
