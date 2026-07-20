import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function MatchPassword(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (
    object: Object,
    propertyName: string,
  ) {
    registerDecorator({
      name: 'matchPassword',

      target: object.constructor,

      propertyName,

      constraints: [property],

      options: validationOptions,

      validator: {
        validate(
          value: any,
          args: ValidationArguments,
        ) {
          const [relatedProperty] =
            args.constraints;

          return (
            value ===
            (args.object as any)[
              relatedProperty
            ]
          );
        },

        defaultMessage() {
          return 'Passwords do not match.';
        },
      },
    });
  };
}


export function IsStrongPassword(
  validationOptions?: ValidationOptions,
) {
  return function (
    object: Object,
    propertyName: string,
  ) {
    registerDecorator({
      name: 'isStrongPassword',

      target: object.constructor,

      propertyName,

      options: validationOptions,

      validator: {
        validate(value: string) {
          return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(
            value,
          );
        },

        defaultMessage() {
          return 'Password must contain at least one uppercase letter, one lowercase letter, one number, one special character, and be at least 8 characters long.';
        },
      },
    });
  };
}