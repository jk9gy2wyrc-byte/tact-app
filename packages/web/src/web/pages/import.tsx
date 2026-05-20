import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uidParam } from "../lib/session";

export default function Import() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; inserted?: number; error?: string } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/import-backtest${uidParam()}`, { method: 'POST', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? 'Import failed');
      return json;
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['backtest-trades'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: any) => setResult({ error: e.message }),
  });

  const handleFile = (file: File) => {
    setResult(null);
    importMutation.mutate(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 700 }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Import Backtest Data</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 28 }}>
        Upload your raw backtest xlsx file. The system auto-detects instrument (EUR/GER/XAU) from sheet names and parses all trades.
        <br />Existing backtest data is kept — duplicates may appear if you import same file twice.
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--blue)' : 'var(--border)'}`,
          borderRadius: 6,
          padding: '48px 32px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#1a1d2a' : 'var(--surface)',
          transition: 'all 0.15s',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
        <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>
          Drop xlsx file here or click to browse
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Supports: Raw Backtest Database sheets (same format as TSCT_source.xlsx)
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>

      {importMutation.isPending && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: 16, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>⏳</span> Parsing file and importing trades...
        </div>
      )}

      {result && (
        <div style={{
          background: result.error ? '#1a0808' : '#081a0f',
          border: `1px solid ${result.error ? 'var(--red)' : 'var(--green)'}`,
          borderRadius: 4, padding: 16,
        }}>
          {result.error ? (
            <div style={{ color: 'var(--red)' }}>❌ Error: {result.error}</div>
          ) : (
            <div style={{ color: 'var(--green)' }}>✅ Imported {result.inserted} trades successfully. Charts and stats updated.</div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div style={{ marginTop: 32, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>Expected format</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          Sheet name must contain <strong style={{ color: 'var(--text)' }}>EUR</strong>, <strong style={{ color: 'var(--text)' }}>GER</strong>, or <strong style={{ color: 'var(--text)' }}>XAU/GOLD</strong><br />
          Columns: <span className="mono" style={{ color: 'var(--text)', fontSize: 11 }}>ID | Date | Direction | RR | Session | Result | GrossR | NetR | Costs | WR</span><br />
          SUMMARY rows are skipped automatically.<br />
          <br />
          <strong style={{ color: 'var(--text)' }}>Adding new backtest year?</strong> Just upload the new xlsx — it appends automatically. No need to clear existing data unless you want to replace completely.
        </div>
      </div>
    </div>
  );
}
