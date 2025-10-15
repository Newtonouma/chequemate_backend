/**
 * Phone number validation middleware for Kenyan phone numbers
 * Accepts formats: 0712345678, +254712345678, 254712345678
 * Valid prefixes: 07xx, 01xx (Safaricom, Airtel, Telkom)
 */

const validatePhoneNumber = (phone) => {
  if (!phone) return { valid: false, error: "Phone number is required" };

  // Remove all spaces and special characters except +
  const cleaned = phone.toString().replace(/[\s\-()]/g, "");

  // Pattern 1: 0712345678 (10 digits starting with 0)
  if (/^0[17]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: "+254" + cleaned.substring(1) };
  }

  // Pattern 2: +254712345678 (13 characters with +)
  if (/^\+254[17]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }

  // Pattern 3: 254712345678 (12 digits without +)
  if (/^254[17]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: "+" + cleaned };
  }

  // Pattern 4: 712345678 (9 digits without country code or 0)
  if (/^[17]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: "+254" + cleaned };
  }

  return {
    valid: false,
    error: `Invalid phone number format: "${phone}". Use format: 0712345678 or +254712345678`,
    example: "0712345678 or +254712345678",
  };
};

export const validatePhone = (req, res, next) => {
  const { phoneNumber, challengerPhone, opponentPhone } = req.body;

  // Collect all phone fields that need validation
  const phoneFields = [
    { name: "phoneNumber", value: phoneNumber },
    { name: "challengerPhone", value: challengerPhone },
    { name: "opponentPhone", value: opponentPhone },
  ].filter((field) => field.value);

  // Validate each phone number
  for (const field of phoneFields) {
    const result = validatePhoneNumber(field.value);

    if (!result.valid) {
      console.error(`❌ [VALIDATION] Invalid ${field.name}: ${field.value}`);
      return res.status(400).json({
        success: false,
        error: "INVALID_PHONE_FORMAT",
        field: field.name,
        message: result.error,
        example: result.example,
        received: field.value,
      });
    }

    // Replace with normalized version
    req.body[field.name] = result.normalized;
    console.log(
      `✅ [VALIDATION] ${field.name} normalized: ${field.value} → ${result.normalized}`
    );
  }

  next();
};

export default { validatePhone, validatePhoneNumber };
