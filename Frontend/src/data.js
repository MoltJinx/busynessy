export const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(value);
export const types = { deposit: 'Depósito', withdrawal: 'Retiro', purchase: 'Compra', bill: 'Factura' };
export const statuses = { completed: 'Completado', pending: 'Pendiente', cancelled: 'Cancelado', recurring: 'Recurrente' };
export function totals(movements) {
  const completed = movements.filter(m => m.status === 'completed');
  const income = completed.filter(m => m.type === 'deposit').reduce((s, m) => s + Math.round(m.amount * 100), 0) / 100;
  const expenses = completed.filter(m => m.type !== 'deposit').reduce((s, m) => s + Math.round(m.amount * 100), 0) / 100;
  return { income, expenses, net: Math.round((income - expenses) * 100) / 100 };
}
