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
