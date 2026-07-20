import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export function IsNigerianPhone(
  validationOptions?: ValidationOptions,
) {
  return function (
    object: Object,
    propertyName: string,
  ) {
    registerDecorator({
      name: 'isNigerianPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string) {
          return /^(\+234|0)[789][01]\d{8}$/.test(
            value,
          );
        },

        defaultMessage() {
          return 'Invalid Nigerian phone number.';
        },
      },
    });
  };
}