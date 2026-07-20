import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export function IsNIN(
  validationOptions?: ValidationOptions,
) {
  return function (
    object: Object,
    propertyName: string,
  ) {
    registerDecorator({
      name: 'isNIN',

      target: object.constructor,

      propertyName,

      options: validationOptions,

      validator: {
        validate(value: string) {
          return /^[0-9]{11}$/.test(value);
        },

        defaultMessage() {
          return 'NIN must contain exactly 11 digits.';
        },
      },
    });
  };
}