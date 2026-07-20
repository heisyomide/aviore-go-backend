// backend: src/rider/dto/complete-profile.dto.ts
import { 
  IsNotEmpty, 
  IsString, 
  Length, 
  IsOptional, 
  IsBoolean, 
  IsEmail
} from 'class-validator';

export class CompleteProfileDto {
  // --- Basic Profile Info (Step 1) ---
  @IsEmail({}, { message: "Please provide a valid email address" })
  @IsNotEmpty({ message: "Email is required for application submission" })
  email!: string; // 🌟 Added to track core registration identities

  @IsString()
  @IsNotEmpty({ message: "Phone number is required for application submission" })
  phoneNumber!: string; // 🌟 Added to track core registration identities

  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() middleName?: string;

  // --- Personal Information (Step 2) ---
  @IsString() @IsOptional() dateOfBirth?: string;
  @IsString() @IsOptional() gender?: string;
  @IsString() @IsOptional() residentialAddress?: string;
  @IsString() @IsOptional() state?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() lga?: string; // Maps to localGovernment in prisma

  // --- Emergency Contact ---
  @IsString() @IsOptional() emergencyContactName?: string;
  @IsString() @IsOptional() emergencyContactPhone?: string;
  @IsString() @IsOptional() emergencyContactRelationship?: string;

  // --- Identity Validation (Step 3) ---
  @IsString() @IsOptional() idType?: string;
  @IsString() @IsOptional() idNumber?: string;
  @IsString() @IsOptional() idFrontImage?: string;
  @IsString() @IsOptional() idBackImage?: string;
  @IsString() @IsOptional() selfieImage?: string;

  // --- Vehicle Parameters (Step 4) ---
  @IsString() @IsOptional() vehicleType?: string;
  @IsString() @IsOptional() plateNumber?: string;
  @IsString() @IsOptional() vehicleBrand?: string;
  @IsString() @IsOptional() vehicleModel?: string;
  @IsString() @IsOptional() vehicleColor?: string;
  @IsOptional() vehicleYear?: any;
  @IsString() @IsOptional() vehiclePhoto?: string;

  // --- Documents (Step 5) ---
  @IsString() @IsOptional() driversLicenseDoc?: string;
  @IsString() @IsOptional() vehiclePaperDoc?: string;
  @IsString() @IsOptional() insuranceDoc?: string;
  @IsString() @IsOptional() roadWorthinessDoc?: string;

  // --- Financial Settlement Data (Step 6) ---
  @IsString() @IsOptional() bankName?: string;
  
  @IsString({ message: "bankCode must be a string" })
  @IsNotEmpty({ message: "bankCode should not be empty" })
  bankCode!: string;

  @IsString()
  @IsNotEmpty()
  @Length(10, 10, { message: 'Account number must be exactly 10 digits.' })
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  accountName!: string;

  

  // --- Agreements & Disclosures ---
  @IsBoolean() @IsOptional() acceptedTerms?: boolean;
  @IsBoolean() @IsOptional() acceptedCommission?: boolean;
  @IsBoolean() @IsOptional() acceptedPrivacy?: boolean;
}