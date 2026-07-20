import {
  Equals,
} from 'class-validator';

export class CreateStep7Dto {
  @Equals(true)
  acceptedTerms!: boolean;

  @Equals(true)
  acceptedCommission!: boolean;

  @Equals(true)
  acceptedDeliveryPolicy!: boolean;

  @Equals(true)
  agreeToPrivacyPolicy!: boolean;
}