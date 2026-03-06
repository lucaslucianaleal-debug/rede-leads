/**
 * Normalize Brazilian phone to last 11 digits (DDD + number)
 * This is the canonical key used for phoneAliasMap and API calls
 * Input: "5517991164762", "(17) 99116-4762", "+55 17 99116-4762", "1733256789"
 * Output: "17991164762" (11 digits) or original if cannot normalize
 */
export function normalizePhoneTo11Digits(phone: string): string {
  if (!phone) {
    console.warn(`[normalizePhoneTo11Digits] Input vazio`);
    return "";
  }
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  console.log(`[normalizePhoneTo11Digits] Input: "${phone}" → Dígitos: "${digits}" (${digits.length} chars)`);
  
  // If already 11 digits, return as-is
  if (digits.length === 11) {
    console.log(`[normalizePhoneTo11Digits] ✓ Retorno direto: ${digits}`);
    return digits;
  }
  
  // If has country code (55), remove it and verify length
  if (digits.startsWith("55")) {
    const withoutCC = digits.slice(2);
    if (withoutCC.length === 11) {
      console.log(`[normalizePhoneTo11Digits] ✓ Removido código país: ${withoutCC}`);
      return withoutCC;
    }
  }
  
  // If has country code and is 13 digits total, extract last 11
  if (digits.length === 13 && digits.startsWith("55")) {
    const last11 = digits.slice(-11);
    console.log(`[normalizePhoneTo11Digits] ✓ Extraído últimos 11 de 13 dígitos: ${last11}`);
    return last11;
  }
  
  // If length >= 11, take last 11 digits (safety fallback)
  if (digits.length >= 11) {
    const last11 = digits.slice(-11);
    console.log(`[normalizePhoneTo11Digits] ⚠ Fallback: tomados últimos 11 de ${digits.length}: ${last11}`);
    return last11;
  }
  
  // Cannot normalize - return original (will be handled by backend)
  console.warn(`[normalizePhoneTo11Digits] ✗ Insuficiente dígitos (${digits.length}): ${phone}`);
  return phone;
}

/**
 * Format Brazilian phone number
 * Input: "5517991164762", "(17) 99116-4762", "+55 17 99116-4762", "1733256789"
 * Output: "(17) 99116-4762" or "(17) 3256-1234" depending on number length
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return "";
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  
  // Remove country code if present (55)
  let cleaned = digits;
  if (cleaned.startsWith("55") && cleaned.length > 11) {
    cleaned = cleaned.slice(2);
  }
  
  // Remove leading 0 if present
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }
  
  // Format based on length
  if (cleaned.length === 11) {
    // (XX) XXXXX-XXXX (5 dígitos + 4 dígitos)
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length === 10) {
    // (XX) XXXX-XXXX (4 dígitos + 4 dígitos)
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  
  // Return as-is if doesn't match expected format
  return phone;
}
