import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AffiliatePayoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  payoutDetails?: string;
}

export class AffiliateMarkPaidDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AffiliateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AffiliateActiveDto {
  @IsBoolean()
  active: boolean;
}
