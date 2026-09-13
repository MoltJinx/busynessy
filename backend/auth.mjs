// Clerk verifica identidad. Este módulo conserva solo el vínculo de negocio
// en Supabase: perfil local, empresa remota y cuentas asociadas.
export const fault = (status, message) => Object.assign(Error(message), { status });

export const publicUser = user => ({
  id: user.clerkId,
  username: user.username,
  companyId: user.customerId,
  primaryAccountId: user.accountIds?.[0] || null,
});

export function createAuthStore(store) {
  if (!store || typeof store.findByClerkId !== 'function') throw Error('El almacén de perfiles no está configurado.');
  return store;
}
