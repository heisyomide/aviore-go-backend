export const FLUTTERWAVE_BASE_URL =
  'https://api.flutterwave.com/v3';

export const FLUTTERWAVE_CURRENCY = 'NGN';

export const FLUTTERWAVE_PAYMENT_REDIRECT =
  '/payments/verify';

export const FLUTTERWAVE_DEFAULT_NARRATION =
  'Aviore Go Payment';

export const FLUTTERWAVE_WITHDRAWAL_NARRATION =
  'Aviore Rider Withdrawal';

export const FLUTTERWAVE_TIMEOUT = 30000;

export const FLUTTERWAVE_HEADERS = (
  secretKey: string,
) => ({
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
});