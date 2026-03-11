/**
 * Normalize Brazilian phone to last 11 digits (DDD + number)
 * This is the canonical key used for phoneAliasMap and API calls
 * Input: "5517991164762", "(17) 99116-4762", "+55 17 99116-4762", "1733256789"
 * Output: "17991164762" (11 digits) or original if cannot normalize
 */
// Deprecated: previously returned 11-digit form. For frontend we now standardize on
// the 10-digit canonical form (DDD + number without the extra leading '9').
// Keep this function as a safe alias that returns the 10-digit canonical value.
export function normalizePhoneTo11Digits(phone: string): string {
  // Delegate to the 10-digit normalizer to avoid accidental 11-digit usage.
  return normalizePhoneTo10Digits(phone);
}

/**
 * Normalize Brazilian phone to canonical 10 digits (DDD + number) by removing
 * country code 55 and removing the extra leading '9' for mobile numbers when present.
 * Returns empty string on invalid input.
 */
export function normalizePhoneTo10Digits(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  let d = digits;
  if (d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') {
    return d.slice(0,2) + d.slice(3);
  }
  if (d.length === 10) return d;
  // fallback: if longer, take last 10
  if (d.length > 10) return d.slice(-10);
  return "";
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
