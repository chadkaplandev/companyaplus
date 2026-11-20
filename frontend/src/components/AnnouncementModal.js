import React, { useState, useEffect } from 'react';
import { X, Paperclip, FileText } from 'lucide-react';
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  fetchFileBlobUrl,
  formatSize,
  prepareAttachment
} from '../helpers';
import { Field, inputClass } from './ui';
import RichTextEditor from './RichTextEditor';
import { bodyToHtml } from './AnnouncementBody';

// ---------- Attachment display ----------
function ImageAttachment({ file, token }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url = '';
    let cancelled = false;
    fetchFileBlobUrl(file._id, token)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else { url = u; setSrc(u); }
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file._id, token]);

  if (failed) return <div className="text-xs text-red-600">Couldn't load {file.filename}</div>;
  if (!src) return <div className="w-32 h-24 rounded-lg bg-gray-100 animate-pulse" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" title={file.filename}>
      <img src={src} alt={file.filename} className="max-h-56 max-w-full rounded-lg border border-gray-200" />
    </a>
  );
}

function PdfAttachment({ file, token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const openPdf = async () => {
    setError('');
    // opening the tab right away, before the download, so popup blockers don't stop it
    const tab = window.open('', '_blank');
    if (!tab) {
      setError('Your browser blocked the new tab. Allow pop-ups for this site and try again.');
      return;
    }
    setLoading(true);
    try {
      const url = await fetchFileBlobUrl(file._id, token);
      tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    } catch (err) {
      tab.close();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={openPdf}
        disabled={loading}
        className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
        <span className="truncate max-w-[16rem]">{file.filename}</span>
        <span className="text-gray-400">{formatSize(file.size)}</span>
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function Attachments({ files, token }) {
  if (!files || files.length === 0) return null;
  const images = files.filter((f) => f.contentType.startsWith('image/'));
  const docs = files.filter((f) => !f.contentType.startsWith('image/'));
  return (
    <div className="mt-3 space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((f) => <ImageAttachment key={f._id} file={f} token={token} />)}
        </div>
      )}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {docs.map((f) => <PdfAttachment key={f._id} file={f} token={token} />)}
        </div>
      )}
    </div>
  );
}

// ---------- Announcement Modal ----------
export default function AnnouncementModal({ announcement, token, saving, error, onClose, onSave, onDelete }) {
  const isNew = !announcement;
  const [initialTitle] = useState(announcement?.title || '');
  const [initialHtml] = useState(() => (announcement ? bodyToHtml(announcement.body) : ''));
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState({ html: initialHtml, isEmpty: isNew });
  const [bodyTouched, setBodyTouched] = useState(false); // only true once I actually edit the text
  const [removedIds, setRemovedIds] = useState([]); // existing files taken off, actually deleted when they hit save
  const [newFiles, setNewFiles] = useState([]);     // files picked but not uploaded yet
  const [fileError, setFileError] = useState('');
  const [processing, setProcessing] = useState(false);

  const keptFiles = (announcement?.attachments || []).filter((f) => !removedIds.includes(f._id));
  const totalFiles = keptFiles.length + newFiles.length;
  const atLimit = totalFiles >= MAX_ATTACHMENTS;
  const canSubmit = title.trim() && !body.isEmpty && !processing;

  const dirty = title !== initialTitle || bodyTouched || newFiles.length > 0 || removedIds.length > 0;
  const requestClose = () => {
    if (dirty && !window.confirm('Close without saving? What you typed will be lost.')) return;
    onClose();
  };

  const handleBodyChange = (value) => {
    setBody(value);
    setBodyTouched(true);
  };

  const handleFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // so picking the same file again still works
    if (picked.length === 0) return;

    setFileError('');
    setProcessing(true);
    const accepted = [];
    let problem = '';

    for (const file of picked) {
      if (!ATTACHMENT_TYPES.includes(file.type)) {
        problem = `"${file.name}" isn't a supported type. Use JPG, PNG, GIF, WEBP, or PDF.`;
        continue;
      }
      try {
        const ready = await prepareAttachment(file);
        if (ready.size > MAX_ATTACHMENT_BYTES) {
          problem = `"${file.name}" is over the 5 MB limit.`;
          continue;
        }
        accepted.push(ready);
      } catch (err) {
        problem = err.message;
      }
    }

    const room = MAX_ATTACHMENTS - totalFiles;
    if (accepted.length > room) problem = `Only ${MAX_ATTACHMENTS} files fit on one announcement, so I left the extras off.`;
    setNewFiles((prev) => [...prev, ...accepted.slice(0, Math.max(0, room))]);
    setFileError(problem);
    setProcessing(false);
  };

  return (
    // no click-outside-to-close here so a stray click can't throw away what I typed
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">{isNew ? 'New Announcement' : 'Edit Announcement'}</h2>
            <button onClick={requestClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          <div className="space-y-4">
            <Field label="Title">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </Field>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <RichTextEditor initialHtml={initialHtml} token={token} onChange={handleBodyChange} />
              <p className="text-xs text-gray-400 mt-1">Use the picture button to place a photo anywhere in the text. Click a picture to change its size or position.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File attachments (shown at the bottom)</label>
              {(keptFiles.length > 0 || newFiles.length > 0) && (
                <ul className="space-y-1 mb-2">
                  {keptFiles.map((f) => (
                    <li key={f._id} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <span className="truncate">{f.filename} <span className="text-gray-400">({formatSize(f.size)})</span></span>
                      <button onClick={() => setRemovedIds([...removedIds, f._id])} title="Remove" className="text-gray-400 hover:text-red-600 flex-shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                  {newFiles.map((f, i) => (
                    <li key={`new-${i}`} className="flex items-center justify-between gap-2 text-sm bg-indigo-50 rounded-lg px-3 py-2">
                      <span className="truncate">{f.name} <span className="text-gray-400">({formatSize(f.size)}) · new</span></span>
                      <button onClick={() => setNewFiles(newFiles.filter((_, idx) => idx !== i))} title="Remove" className="text-gray-400 hover:text-red-600 flex-shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label
                htmlFor="attachment-upload"
                className={`inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm ${atLimit || processing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                  }`}
              >
                <Paperclip className="w-4 h-4" />
                {processing ? 'Preparing…' : 'Add images or PDFs'}
              </label>
              <input
                id="attachment-upload"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                onChange={handleFiles}
                disabled={atLimit || processing}
                className="hidden"
              />
              {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
              <p className="text-xs text-gray-400 mt-1">Up to 5 files, 5 MB each. Good for PDFs.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                disabled={!canSubmit || saving}
                onClick={() => onSave({ title, body: body.html, id: announcement?.id, newFiles, removedIds })}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : isNew ? 'Post Announcement' : 'Save Changes'}
              </button>
              {!isNew && (
                <button
                  onClick={() => onDelete(announcement.id)}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-60"
                >
                  {saving ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}