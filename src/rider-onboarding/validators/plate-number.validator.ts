import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export function IsPlateNumber(
  validationOptions?: ValidationOptions,
) {
  return function (
    object: Object,
    propertyName: string,
  ) {
    registerDecorator({
      name: 'isPlateNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string) {
          if (!value) return false;

          // Nigerian plate formats like ABC-123AA or ABC123AA
          return /^[A-Z]{3}-?[0-9]{3}[A-Z]{2}$/i.test(
            value.trim(),
          );
        },

        defaultMessage() {
          return 'Invalid vehicle plate number.';
        },
      },
    });
  };
}