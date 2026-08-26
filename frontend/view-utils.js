export function validateTenderCode(value) {
  const code = value.trim().toUpperCase();
  if (/^\d+-\d+-COT\d{2}$/.test(code)) throw new Error('Ese código es de Compra Ágil. Este módulo consulta licitaciones; la conexión Compra Ágil v2 está pendiente de validación.');
  if (!/^\d{1,12}-\d{1,12}-[A-Z][A-Z0-9]{0,3}\d{2}$/.test(code)) throw new Error('Ingresa un código de licitación válido, copiado desde Mercado Público.');
  return code;
}

export function validateApiUrl(value) {
  const url = new URL(value.trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Usa una URL HTTPS del Worker, sin credenciales, rutas ni parámetros. HTTP solo se permite para desarrollo local.');
  return url.origin;
}

export function formatOfficialDate(value) {
  if (!value) return 'No informada';
  // Preserve the wall-clock value and any explicit offset; never assume a time zone.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]} · ${match[4]}:${match[5]}:${match[6]}${match[7] ? ` (${match[7]})` : ''}`;
}
