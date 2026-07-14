// Single source of truth for import match-type badge styling/labels, shared
// by ImportPage and DuplicateImportModal (which previously each defined their
// own identical copy). matchType is one of "new" | "existing" | "contacted".
export const MATCH_VARIANT = { new: "success", existing: "warning", contacted: "destructive" };
export const MATCH_LABEL = { new: "New", existing: "Existing", contacted: "Contacted" };
