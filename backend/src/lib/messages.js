// Shared lead classification + message generation logic
// Used both when importing CSVs and when sending messages.

const POS_CATEGORIES = [
  "pharmacy",
  "pharmacies",
  "supermarket",
  "mini mart",
  "minimart",
  "provision",
  "convenience store",
  "boutique",
  "cosmetics",
  "electronics",
  "hardware",
  "shopping mall",
  "store",
  "shop",
  "retail",
];

const WEBSITE_CATEGORIES = [
  "restaurant",
  "fast food",
  "eatery",
  "hotel",
  "guest house",
  "lodge",
  "shortlet",
  "motel",
  "barbecue",
  "chophouse",
  "cafe",
  "bar",
];

export function getPitchType(category = "") {
  const lower = (category || "").toLowerCase();
  if (POS_CATEGORIES.some((k) => lower.includes(k))) return "POS";
  if (WEBSITE_CATEGORIES.some((k) => lower.includes(k))) return "WEBSITE";
  return "GENERIC";
}

// Replace {{name}}, {{company}}, {{email}}, {{phone}} in a template body
// with values from the lead. Falls back gracefully when fields are missing.
export function renderTemplate(body, lead = {}) {
  const vars = {
    name: lead.name || "there",
    company: lead.company || lead.name || "",
    email: lead.email || "",
    phone: lead.phone_raw || lead.phone || "",
  };

  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return key in vars ? vars[key] : match;
  });
}

// Normalize a Nigerian phone number to "234XXXXXXXXXX" (digits only, no +)
export function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  if (digits.startsWith("234")) return digits;
  // Assume local number missing leading 0
  if (digits.length === 10) return "234" + digits;
  return digits;
}

export function toWhatsAppId(normalizedPhone) {
  return `${normalizedPhone}@c.us`;
}
