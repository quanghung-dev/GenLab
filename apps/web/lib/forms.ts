export function formString(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === 'string' ? value.trim() : '';
}
