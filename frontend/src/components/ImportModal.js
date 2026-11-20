import React, { useState } from 'react';
import { X } from 'lucide-react';
import Papa from 'papaparse';
import { IMPORT_FIELDS, buildMembers, guessMapping } from '../helpers';
import { Field, inputClass } from './ui';

export default function ImportModal({ onClose, onImport }) {
  const [stage, setStage] = useState('pick'); // 'pick' | 'review' | 'done'
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // so choosing the same file again still works
    if (!file) return;
    setError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const found = res.meta.fields || [];
        if (found.length === 0 || res.data.length === 0) {
          setError('That file looks empty. Make sure it is the CSV downloaded from your Google Sheet.');
          return;
        }
        setHeaders(found);
        setRows(res.data);
        setMapping(guessMapping(found));
        setStage('review');
      },
      error: () => setError('Could not read that file.')
    });
  };

  const members = buildMembers(rows, mapping);
  const readyCount = members.filter((m) => m.firstName && m.lastName && m.email).length;
  const badDateCount = members.filter((m) => m.badDate).length;

  const runImport = async () => {
    setImporting(true);
    setError('');
    try {
      setResult(await onImport(members));
      setStage('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const requestClose = () => {
    if (stage === 'review' && !importing && !window.confirm('Close without importing? The columns you matched will be lost.')) return;
    onClose();
  };

  return (
    // no click-outside-to-close so I can't lose my column choices by accident
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">Import Members from CSV</h2>
            <button onClick={requestClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          {stage === 'pick' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Choose the CSV you downloaded from your Google Form's response sheet. Nothing is saved until you
                review it on the next screen. Members who are already in the app (matched by email) are skipped.
              </p>
              <label htmlFor="csv-upload" className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-indigo-700">
                Choose CSV file
              </label>
              <input id="csv-upload" type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </div>
          )}

          {stage === 'review' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                I matched your spreadsheet columns to the member fields. Check them over and fix any that are wrong.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {IMPORT_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <select
                      value={mapping[f.key] || ''}
                      onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">(skip)</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </Field>
                ))}
              </div>

              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-medium text-gray-800">
                  {readyCount} of {members.length} rows are ready to import.
                </p>
                {members.length - readyCount > 0 && (
                  <p className="text-xs text-amber-600">
                    {members.length - readyCount} row(s) are missing a first name, last name, or email and will be reported as failed.
                  </p>
                )}
                {badDateCount > 0 && (
                  <p className="text-xs text-amber-600">
                    {badDateCount} row(s) have a birthday or anniversary I couldn't read. Those dates will be left blank.
                  </p>
                )}
                <div className="text-xs text-gray-500 space-y-0.5">
                  {members.slice(0, 3).map((m, i) => (
                    <div key={i}>{m.firstName} {m.lastName} · {m.email || 'no email'}{m.birthday ? ` · born ${m.birthday}` : ''}</div>
                  ))}
                  {members.length > 3 && <div>…and {members.length - 3} more</div>}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  disabled={readyCount === 0 || importing}
                  onClick={runImport}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {importing ? 'Importing…' : `Import ${readyCount} member${readyCount === 1 ? '' : 's'}`}
                </button>
                <button onClick={requestClose} disabled={importing} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {stage === 'done' && result && (
            <div className="space-y-4">
              <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
                Imported {result.created} member{result.created === 1 ? '' : 's'}.
              </div>
              {result.skipped.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700">Skipped ({result.skipped.length})</p>
                  <ul className="text-sm text-gray-600 list-disc pl-5 max-h-32 overflow-y-auto">
                    {result.skipped.map((s, i) => <li key={i}>Row {s.row} ({s.who}): {s.reason}</li>)}
                  </ul>
                </div>
              )}
              {result.failed.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-red-600">Failed ({result.failed.length})</p>
                  <ul className="text-sm text-gray-600 list-disc pl-5 max-h-32 overflow-y-auto">
                    {result.failed.map((f, i) => <li key={i}>Row {f.row} ({f.who}): {f.reason}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-sm text-gray-600">
                Everyone imported has a random password. Tell them to open the site, click "Forgot password?", and set their own.
              </p>
              <button onClick={onClose} className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}