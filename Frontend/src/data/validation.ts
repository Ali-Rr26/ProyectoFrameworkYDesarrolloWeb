// Reglas de validación de cuentas (funciones puras). Replican las del backend
// (controllers/validation.go) para avisar al usuario antes de enviar; la validación
// definitiva siempre la hace el servidor.

// Correo simple: usuario@dominio.tld, sin espacios ni nombre entre "< >".
export const isValidEmail = (email: string): boolean =>
  email.length <= 254 && /^[^\s@<>]+@[^\s@<>.]+(\.[^\s@<>.]+)+$/.test(email);

export interface PasswordRule {
  label: string;
  test: (password: string) => boolean;
}

// Contraseña fuerte: 8+ caracteres (máximo 72 bytes para bcrypt), mayúscula,
// minúscula, número y carácter especial.
export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: 'Entre 8 caracteres y 72 bytes',
    test: (p) => [...p].length >= 8 && new TextEncoder().encode(p).length <= 72,
  },
  { label: 'Una letra mayúscula', test: (p) => /\p{Lu}/u.test(p) },
  { label: 'Una letra minúscula', test: (p) => /\p{Ll}/u.test(p) },
  { label: 'Un número', test: (p) => /\p{Nd}/u.test(p) },
  { label: 'Un carácter especial (!@#$%…)', test: (p) => /[\p{P}\p{S}]/u.test(p) },
];

export const isStrongPassword = (password: string): boolean =>
  PASSWORD_RULES.every((rule) => rule.test(password));
