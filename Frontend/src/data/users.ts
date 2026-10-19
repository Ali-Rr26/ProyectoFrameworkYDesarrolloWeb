import type { Role } from '../context/auth';

// Cuenta tal como la entrega GET /api/users (el hash de la contraseña nunca viaja)
export interface UserAccount {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  // Patrocinador en la red (null si es raíz o no está afiliado)
  sponsor_id: number | null;
  // Código para invitar a otros (null si no está afiliado)
  referral_code: string | null;
}

// Cuerpo de POST /api/users (registro público). El código de referido es opcional.
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  referral_code?: string;
}

// Cuerpo de PATCH /api/users/:id (solo admin): los campos omitidos no cambian.
export interface UpdateUserPayload {
  role?: Role;
  active?: boolean;
}
