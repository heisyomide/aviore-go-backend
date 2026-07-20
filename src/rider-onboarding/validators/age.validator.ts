import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsAdult(
  validationOptions?: ValidationOptions,
) {
  return function (
    object: Object,
    propertyName: string,
  ) {
    registerDecorator({
      name: 'isAdult',

      target: object.constructor,

      propertyName,

      options: validationOptions,

      validator: {
        validate(value: any) {
          if (!value) return false;

          const birthDate = new Date(value);

          const today = new Date();

          let age =
            today.getFullYear() -
            birthDate.getFullYear();

          const month =
            today.getMonth() -
            birthDate.getMonth();

          if (
            month < 0 ||
            (month === 0 &&
              today.getDate() <
                birthDate.getDate())
          ) {
            age--;
          }

          return age >= 18;
        },

        defaultMessage() {
          return 'Rider must be at least 18 years old.';
        },
      },
    });
  };
}