/** Describes an untrusted value for an error message without losing precision or leaking content. */
export function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'object') return value === null ? 'null' : Object.prototype.toString.call(value);
  if (typeof value === 'function' || typeof value === 'symbol') return typeof value;
  return String(value);
}
