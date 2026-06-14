import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function UploadPanel() {
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: api.importCsv,
    onSuccess: (data) => {
      setResult({ ok: true, data });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) => {
      setResult({ ok: false, error: err.body?.error || err.message });
    },
  });

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setResult({ ok: false, error: "Please upload a .csv file." });
      return;
    }
    setResult(null);
    importMutation.mutate(file);
  };

  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <h2 className="font-display text-sm font-semibold text-ink">Import leads</h2>
      <p className="mt-1 text-xs text-muted">
        Upload a Google Maps export (.csv). New leads are added; numbers already in your list are skipped.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
          isDragging ? "border-accent bg-accent/5" : "border-line hover:border-muted"
        }`}
      >
        <UploadIcon />
        <p className="text-sm text-ink">
          {importMutation.isPending ? "Importing..." : "Drop a CSV here, or click to browse"}
        </p>
        <p className="text-xs text-muted">Expects columns: title, phone, categoryName, website, ...</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            result.ok ? "border-accent/30 bg-accent/5 text-ink" : "border-danger/30 bg-danger/5 text-danger"
          }`}
        >
          {result.ok ? (
            <div className="space-y-1">
              <p>
                <span className="font-semibold text-accent">{result.data.newLeadsInserted}</span> new leads added.
              </p>
              {result.data.duplicatesSkipped > 0 && (
                <p className="text-muted">
                  {result.data.duplicatesSkipped} number{result.data.duplicatesSkipped === 1 ? "" : "s"} already in your list — skipped.
                </p>
              )}
              {result.data.duplicatesWithinFile > 0 && (
                <p className="text-muted">
                  {result.data.duplicatesWithinFile} duplicate row{result.data.duplicatesWithinFile === 1 ? "" : "s"} within this CSV — skipped.
                </p>
              )}
              {result.data.parsedWithPhone < result.data.totalRows && (
                <p className="text-muted">
                  {result.data.totalRows - result.data.parsedWithPhone} row(s) had no usable phone number.
                </p>
              )}
            </div>
          ) : (
            result.error
          )}
        </div>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-muted">
      <path
        d="M12 16V4M12 4L7 9M12 4l5 5M5 20h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
