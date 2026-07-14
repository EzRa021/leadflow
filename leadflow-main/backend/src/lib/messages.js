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

// Replace {{name}}, {{company}}, {{email}}, {{phone}}, {{city}}, {{state}},
// {{category}}, {{rating}}, {{reviews_count}} in a template body with values
// from the lead. Known variables fall back gracefully when the field is
// missing (empty string, or "there" for name). UNKNOWN variables are left
// as the literal "{{typo}}" rather than silently rendered as blank — a typo
// like {{compnay}} then shows up visibly in the template Preview (and in the
// send log) so it gets caught, instead of producing an invisible gap in a
// message sent to a real business.
export function renderTemplate(body, lead = {}) {
  const vars = {
    name: lead.name || "there",
    company: lead.company || lead.name || "",
    email: lead.email || "",
    phone: lead.phone_raw || lead.phone || "",
    city: lead.city || "",
    state: lead.state || "",
    category: lead.category || "",
    rating: lead.total_score != null ? String(lead.total_score) : "",
    reviews_count: lead.reviews_count != null ? String(lead.reviews_count) : "",
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
  // Anything else: only accept it if it's a plausible full international
  // number (>= 11 digits). Shorter junk returns null so import rejects and
  // flags the row instead of building a broken "…@c.us" id that silently
  // fails at send time with an opaque WhatsApp error.
  if (digits.length >= 11) return digits;
  return null;
}

export function toWhatsAppId(normalizedPhone) {
  return `${normalizedPhone}@c.us`;
}

const BUSINESS_NOISE_WORDS = new Set([
  "ltd", "limited", "inc", "incorporated", "llc", "plc",
  "enterprise", "enterprises", "nigeria", "nig", "company", "co",
  "stores", "store", "shop", "shops", "group", "global",
  "international", "intl", "plaza", "mall", "the", "and", "of",
]);

// Fuzzy business-name normalization, used to catch near-duplicate leads
// that were scraped twice with slightly different formatting (e.g.
// "Jane's Boutique Ltd" vs "JANE'S BOUTIQUE") even when the phone
// number differs or wasn't parsed identically.
export function normalizeBusinessName(name = "") {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !BUSINESS_NOISE_WORDS.has(w))
    .join(" ")
    .trim();
}
