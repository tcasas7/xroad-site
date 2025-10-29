export function joinUrl(...parts: (string | undefined | null)[]) {
  const s = parts.filter(Boolean).join('/');
  return s.replace(/\/{2,}/g, '/').replace(':/', '://');
}
