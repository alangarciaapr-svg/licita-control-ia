export function validateTenderCode(value) {
  const code = value.trim().toUpperCase();
  if (/^\d+-\d+-COT\d{2}$/.test(code)) throw new Error('Ese código es de Compra Ágil. Este módulo consulta licitaciones; la conexión Compra Ágil v2 está pendiente de validación.');
  if (!/^\d{1,12}-\d{1,12}-[A-Z][A-Z0-9]{0,3}\d{2}$/.test(code)) throw new Error('Ingresa un código de licitación válido, copiado desde Mercado Público.');
  return code;
}

export function validateAgileCode(value) {
  const code = value.trim().toUpperCase();
  if (!/^\d{1,12}-\d{1,12}-COT\d{2}$/.test(code)) throw new Error('Ingresa un código COT válido, copiado desde Mercado Público.');
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

function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
}

function splitTerms(value) {
  return [...new Set(String(value || '').split(',').map((term) => term.trim()).filter(Boolean))].slice(0, 20);
}

function wordVariants(word) {
  const variants = new Set([word]);
  if (word.length > 3 && word.endsWith('s')) variants.add(word.slice(0, -1));
  if (word.length > 4 && word.endsWith('es')) variants.add(word.slice(0, -2));
  return variants;
}

function textMatchesTerm(text, term) {
  const textWords = normalizeSearchText(text).match(/[a-z0-9]+/g) || [];
  const termWords = normalizeSearchText(term).match(/[a-z0-9]+/g) || [];
  if (!termWords.length || termWords.length > textWords.length) return false;
  return textWords.some((_, start) => termWords.every((termWord, offset) => {
    const textWord = textWords[start + offset];
    if (!textWord) return false;
    const textVariants = wordVariants(textWord);
    return [...wordVariants(termWord)].some((variant) => textVariants.has(variant));
  }));
}

export function buildCommercialProfile(keywordsValue, exclusionsValue, regionsValue, minimumLeadDaysValue) {
  const keywords = splitTerms(keywordsValue);
  if (!keywords.length) throw new Error('Agrega al menos una palabra o frase que describa lo que vende tu empresa.');
  const minimumLeadDays = Number(minimumLeadDaysValue);
  if (!Number.isInteger(minimumLeadDays) || minimumLeadDays < 0 || minimumLeadDays > 90) throw new Error('El plazo mínimo debe ser un número entre 0 y 90 días.');
  return {
    keywords,
    exclusions: splitTerms(exclusionsValue),
    regions: splitTerms(regionsValue),
    minimumLeadDays,
  };
}

function daysBetween(dateValue, referenceDate) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateValue || ''));
  const referenceMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDate);
  if (!dateMatch || !referenceMatch) return null;
  const toUtc = (parts) => Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  return Math.ceil((toUtc(dateMatch) - toUtc(referenceMatch)) / 86400000);
}

export function scoreOpportunity(opportunity, profile, referenceDate) {
  const searchable = normalizeSearchText([opportunity.name, opportunity.description, opportunity.buyer, opportunity.type].filter(Boolean).join(' '));
  const matchedKeywords = profile.keywords.filter((term) => textMatchesTerm(searchable, term));
  const matchedExclusions = profile.exclusions.filter((term) => textMatchesTerm(searchable, term));
  const regionText = normalizeSearchText(opportunity.region);
  const matchedRegions = profile.regions.filter((term) => textMatchesTerm(regionText, term));
  const daysRemaining = daysBetween(opportunity.closing, referenceDate);
  const insufficientTime = daysRemaining !== null && daysRemaining < profile.minimumLeadDays;
  const eligible = matchedKeywords.length > 0 && matchedExclusions.length === 0 && !insufficientTime;
  const score = eligible ? Math.min(100,
    Math.min(70, matchedKeywords.length * 25)
      + (matchedRegions.length ? 15 : 0)
      + (daysRemaining !== null && daysRemaining >= profile.minimumLeadDays ? 10 : 0)
      + (normalizeSearchText(opportunity.status) === 'publicada' ? 5 : 0)) : 0;
  return { daysRemaining, eligible, matchedExclusions, matchedKeywords, matchedRegions, score };
}
