export const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(value);
export const initialCompanies = [{ id: 'cafe', name: 'Café Nube' }, { id: 'zara', name: 'Zara' }];
export const initialAccounts = [{ id: 'operativa', companyId: 'cafe', name: 'Cuenta operativa' }, { id: 'zara-operativa', companyId: 'zara', name: 'Cuenta operativa' }];
export const types = { deposit: 'Depósito', withdrawal: 'Retiro', purchase: 'Compra', bill: 'Factura' };
export const statuses = { completed: 'Completado', pending: 'Pendiente', cancelled: 'Cancelado', recurring: 'Recurrente' };
export const initialMovements = [
  { id: 'demo-1', accountId: 'operativa', type: 'deposit', description: 'Pago de cliente', amount: 6200, date: '2026-09-12', status: 'completed' },
  { id: 'demo-2', accountId: 'operativa', type: 'purchase', description: 'Inventario', amount: 1450, date: '2026-09-12', status: 'completed' },
  { id: 'demo-3', accountId: 'operativa', type: 'withdrawal', description: 'Servicios', amount: 320, date: '2026-09-11', status: 'completed' },
  { id: 'demo-4', accountId: 'operativa', type: 'bill', description: 'Renta del local', amount: 3500, date: '2026-09-20', status: 'pending' },
];
export function totals(movements) {
  const completed = movements.filter(m => m.status === 'completed');
  const income = completed.filter(m => m.type === 'deposit').reduce((s, m) => s + Math.round(m.amount * 100), 0) / 100;
  const expenses = completed.filter(m => m.type !== 'deposit').reduce((s, m) => s + Math.round(m.amount * 100), 0) / 100;
  return { income, expenses, net: income - expenses, projected: income - expenses * 1.15 };
}
