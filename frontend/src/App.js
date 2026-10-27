// npm start

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, MapPin, Users, Plus, ChevronLeft, ChevronRight, User, LogOut, X, Cake, Heart, Phone, Mail, Megaphone, Sun, Gift, Upload, Paperclip, FileText, Printer, Copy } from 'lucide-react';
import Papa from 'papaparse';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ---------- API helper ----------
async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new Error(`Can't reach the server at ${API_URL}. Is the backend running?`);
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body is fine */ }

  if (!res.ok) throw new Error((data && data.message) || `Request failed (${res.status})`);
  return data;
}

// ---------- Helpers ----------
// Mongo gives me _id, so I copy it to id to keep the rest of the code simple
const normalizeUser = (u) => ({ ...u, id: u._id });
const normalizeEvent = (e) => ({ ...e, id: e._id });
const normalizeAnnouncement = (a) => ({ ...a, id: a._id });

const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '');

// sorting by last name first, then first name as the tiebreaker
const byLastName = (a, b) =>
  (a.lastName || '').localeCompare(b.lastName || '', undefined, { sensitivity: 'base' }) ||
  (a.firstName || '').localeCompare(b.firstName || '', undefined, { sensitivity: 'base' });

// the fields I can import into, plus keywords to guess which spreadsheet column matches.
// the order matters: more specific fields go first so "Summer Address" doesn't get grabbed as "Address"
const IMPORT_FIELDS = [
  { key: 'firstName', label: 'First Name', hints: ['first name', 'first'] },
  { key: 'lastName', label: 'Last Name', hints: ['last name', 'surname', 'last'] },
  { key: 'spouse', label: 'Spouse / Significant Other', hints: ['spouse', 'significant', 'partner'] },
  { key: 'email', label: 'Email', hints: ['email', 'e-mail'] },
  { key: 'anniversary', label: 'Anniversary', hints: ['anniversary'] },
  { key: 'birthday', label: 'Birthday', hints: ['birthday', 'birth', 'dob'] },
  { key: 'summerAddress', label: 'Summer Address', hints: ['summer address', 'summer home', 'seasonal address'] },
  { key: 'address', label: 'Address', hints: ['address'] },
  { key: 'phoneSummer', label: 'Summer Phone', hints: ['summer phone', 'summer number', 'summer'] },
  { key: 'phoneHome', label: 'Home Phone', hints: ['home phone', 'home number', 'home'] },
  { key: 'phoneCell', label: 'Cell Phone', hints: ['cell', 'mobile', 'phone'] },
  { key: 'fullName', label: 'Full Name (only if there are no first/last columns)', hints: ['full name', 'name'] }
];

// each spreadsheet column can only be used once, so I track which ones are already taken
const guessMapping = (headers) => {
  const mapping = {};
  const used = new Set();
  IMPORT_FIELDS.forEach((f) => {
    if (f.key === 'fullName' && mapping.firstName && mapping.lastName) return;
    const match = headers.find((h) => !used.has(h) && f.hints.some((hint) => h.toLowerCase().includes(hint)));
    if (match) {
      mapping[f.key] = match;
      used.add(match);
    }
  });
  return mapping;
};

// turns what people typed into the form into YYYY-MM-DD, or '' if I can't read it
const toIsoDate = (value) => {
  const v = (value || '').trim();
  if (!v) return '';
  const pad = (n) => String(n).padStart(2, '0');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const full = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (full) return `${full[3]}-${pad(full[1])}-${pad(full[2])}`;
  // no year given (like "4/26"), so I use 2000 as a placeholder since only month and day get shown
  const short = v.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (short) return `2000-${pad(short[1])}-${pad(short[2])}`;
  const d = new Date(v);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return '';
};

// last word becomes the last name, everything before it is the first name
const splitName = (full) => {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts.pop() : '';
  return { firstName: parts.join(' '), lastName: last };
};

const buildMembers = (rows, mapping) =>
  rows.map((row) => {
    const get = (key) => (mapping[key] ? String(row[mapping[key]] || '').trim() : '');
    const names = mapping.firstName || mapping.lastName
      ? { firstName: get('firstName'), lastName: get('lastName') }
      : splitName(get('fullName'));
    const birthday = toIsoDate(get('birthday'));
    const anniversary = toIsoDate(get('anniversary'));
    return {
      ...names,
      email: get('email'),
      spouse: get('spouse'),
      birthday,
      anniversary,
      address: get('address'),
      summerAddress: get('summerAddress'),
      phoneCell: get('phoneCell'),
      phoneHome: get('phoneHome'),
      phoneSummer: get('phoneSummer'),
      // flagging dates I couldn't read so the preview can warn about them
      badDate: Boolean((get('birthday') && !birthday) || (get('anniversary') && !anniversary))
    };
  });

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the viewer's own timezone.
// toISOString() gives UTC, which was shifting the time, so I subtract the offset first.
const toLocalInputValue = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const formatMonthDay = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });

// shrinks the chosen photo to max 256px so it stays tiny in the database
function resizeImageToDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be loaded.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // white behind transparent PNGs so they don't turn black
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Attachment helpers ----------
const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // same limit as the server
const MAX_ATTACHMENTS = 5;

const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// big phone photos get shrunk here so they upload fast and don't eat database space.
// PDFs and GIFs are left alone (re-encoding a GIF would kill the animation)
function prepareAttachment(file) {
  const shrinkable = file.type.startsWith('image/') && file.type !== 'image/gif';
  if (!shrinkable || file.size <= 1024 * 1024) return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`"${file.name}" could not be read as an image.`));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // white behind transparent PNGs
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error(`"${file.name}" could not be processed.`));
        const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        resolve(new File([blob], newName, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    };
    img.src = url;
  });
}

// sends the raw file as the request body (apiFetch only does JSON)
async function uploadAttachment(announcementId, file, token) {
  let res;
  try {
    res = await fetch(`${API_URL}/announcements/${announcementId}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-Filename': encodeURIComponent(file.name),
        Authorization: `Bearer ${token}`
      },
      body: file
    });
  } catch (err) {
    throw new Error("can't reach the server");
  }
  if (!res.ok) {
    let message = `upload failed (${res.status})`;
    try { message = (await res.json()).message || message; } catch (e) { /* response wasn't JSON */ }
    throw new Error(message);
  }
}

// files need the login token, so a plain <img src> won't work.
// I download with the token and make a temporary local URL instead
async function fetchFileBlobUrl(fileId, token) {
  let res;
  try {
    res = await fetch(`${API_URL}/attachments/${fileId}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new Error("Can't reach the server.");
  }
  if (!res.ok) throw new Error('Could not load that file.');
  return URL.createObjectURL(await res.blob());
}

// ---------- Mailing list helpers ----------
const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// "First Last <email>" so the email app shows names.
// commas and quotes in a name would break the address list, so I strip them out
const recipientString = (u) => {
  const label = fullName(u).replace(/["<>,;]/g, '').trim();
  return label ? `${label} <${u.email}>` : u.email;
};

// email apps and Gmail choke on really long links, so these are the limits I stay under.
// ~2000 is the usual safe ceiling for mailto links, and Gmail's was about 4096 in what I read
const MAILTO_LIMIT = 1900;
const GMAIL_LIMIT = 4000;

// builds the link with names, falls back to plain addresses if it's too long,
// and reports if it's STILL too long so the screen can warn about it
const buildMailLink = (kind, people, useBcc) => {
  const limit = kind === 'gmail' ? GMAIL_LIMIT : MAILTO_LIMIT;
  const field = useBcc ? 'bcc' : 'to';
  const make = (items) => {
    // literal commas between addresses, each address encoded on its own
    const list = items.map(encodeURIComponent).join(',');
    if (kind === 'gmail') return `https://mail.google.com/mail/?view=cm&fs=1&${field}=${list}`;
    return useBcc ? `mailto:?bcc=${list}` : `mailto:${list}`;
  };

  const withNames = make(people.map(recipientString));
  if (withNames.length <= limit) return { url: withNames, namesDropped: false, tooLong: false };

  const plain = make(people.map((u) => u.email));
  return { url: plain, namesDropped: true, tooLong: plain.length > limit };
};

// prints through a hidden iframe so there's no popup to get blocked.
// in the print window just pick "Save as PDF" as the printer to get a PDF
const printMailingList = (people) => {
  const rows = people
    .map((u, i) => `<tr><td class="num">${i + 1}</td><td>${escapeHtml(fullName(u))}</td><td>${escapeHtml(u.email)}</td></tr>`)
    .join('');
  const emailLine = escapeHtml(people.map((u) => u.email).join(', '));
  const today = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Mailing List</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 13px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; }
  th { border-bottom: 2px solid #999; }
  td.num { color: #888; width: 36px; }
  .all { margin-top: 24px; font-size: 12px; }
  .all strong { display: block; margin-bottom: 4px; }
  .all p { word-break: break-all; margin: 0; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
  <h1>Mailing List</h1>
  <div class="sub">${people.length} recipient${people.length === 1 ? '' : 's'} · ${escapeHtml(today)}</div>
  <table>
    <thead><tr><th></th><th>Name</th><th>Email</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="all"><strong>All addresses (copy and paste)</strong><p>${emailLine}</p></div>
</body>
</html>`;

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const cleanup = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  frame.contentWindow.onafterprint = cleanup;
  // giving the iframe a moment to lay out before printing, and a backup cleanup in case afterprint never fires
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  }, 250);
  setTimeout(cleanup, 60000);
};

const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Avatar({ user, size = 'md' }) {
  const sizes = {
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-24 h-24 text-2xl'
  };
  const initials = `${(user.firstName || '?')[0]}${(user.lastName || '')[0] || ''}`.toUpperCase();

  if (user.profilePicture) {
    return <img src={user.profilePicture} alt={fullName(user)} className={`${sizes[size]} rounded-full object-cover flex-shrink-0`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
      <span className="whitespace-pre-line break-words min-w-0">
        {label && <span className="text-gray-400">{label}: </span>}
        {children}
      </span>
    </div>
  );
}

// ---------- Login ----------
function Login({ onSubmit, onForgot }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);

  const handleLogin = async () => {
    setError('');
    setSlow(false);
    setLoading(true);
    // if sign-in takes over 4 seconds the server is probably waking up, so I tell the person
    const timer = setTimeout(() => setSlow(true), 4000);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      clearTimeout(timer);
      setSlow(false);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-indigo-100 rounded-full mb-4">
            <Calendar className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Company A+</h1>
          <p className="text-gray-600 mt-2">Sign in to continue</p>
        </div>
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
          {slow && <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm">The server is waking up. The first sign-in after a quiet period can take up to a minute.</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <button onClick={onForgot} className="text-xs text-indigo-600 hover:underline">Forgot password?</button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Forgot Password ----------
function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setStatus('sending');
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-indigo-100 rounded-full mb-4">
            <Calendar className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Reset your password</h1>
          <p className="text-gray-600 mt-2 text-sm">Enter your email and we'll send you a reset link.</p>
        </div>

        {status === 'sent' ? (
          <div className="space-y-4">
            <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </div>
            <button onClick={onBack} className="w-full border border-gray-300 py-2 rounded-lg hover:bg-gray-50 font-medium">
              Back to Sign In
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
            <button
              onClick={submit}
              disabled={status === 'sending' || !email.trim()}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send Reset Link'}
            </button>
            <button onClick={onBack} className="w-full text-sm text-gray-500 hover:underline">Back to Sign In</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Reset Password ----------
function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setStatus('saving');
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: { token, password } });
      setStatus('done');
    } catch (err) {
      setStatus('idle');
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-indigo-100 rounded-full mb-4">
            <Calendar className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Set a new password</h1>
        </div>

        {status === 'done' ? (
          <div className="space-y-4">
            <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm">
              Your password has been updated. You can now sign in.
            </div>
            <button onClick={onDone} className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium">
              Go to Sign In
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()} className={inputClass} />
            </div>
            <button
              onClick={submit}
              disabled={status === 'saving'}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-60"
            >
              {status === 'saving' ? 'Saving…' : 'Set New Password'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Event Modal ----------
function EventModal({ event, isAdmin, currentUser, saving, error, onClose, onSave, onDelete, onRsvp }) {
  const isNew = !event;
  const [fd, setFd] = useState({
    title: event?.title || '',
    description: event?.description || '',
    date: event?.date ? toLocalInputValue(event.date) : '',
    location: event?.location || ''
  });
  const [editing, setEditing] = useState(isNew);

  const myRsvp = event?.rsvps?.[currentUser.id];
  const rsvpCounts = event ? Object.values(event.rsvps).reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {}) : {};
  const canSubmit = fd.title.trim() && fd.date;

  // names come from the server with each event, so members can see them too
  const namesFor = (status) =>
    Object.entries(event.rsvps)
      .filter(([, s]) => s === status)
      .map(([uid]) => (event.rsvpNames && event.rsvpNames[uid]) || 'A member')
      .sort((a, b) => a.localeCompare(b));

  return (
    // while I'm typing in the form, clicking outside does nothing. when I'm just viewing, it still closes
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={editing ? undefined : onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">
              {isNew ? 'Create Event' : editing ? 'Edit Event' : event.title}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          {editing ? (
            <div className="space-y-4">
              <Field label="Title">
                <input type="text" value={fd.title} onChange={(e) => setFd({ ...fd, title: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Date & Time">
                <input type="datetime-local" value={fd.date} onChange={(e) => setFd({ ...fd, date: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Location">
                <input type="text" value={fd.location} onChange={(e) => setFd({ ...fd, location: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Description">
                <textarea value={fd.description} onChange={(e) => setFd({ ...fd, description: e.target.value })} className={`${inputClass} h-24`} />
              </Field>
              <div className="flex gap-3 pt-2">
                <button
                  disabled={!canSubmit || saving}
                  onClick={() => onSave({ ...fd, id: event?.id })}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : isNew ? 'Create Event' : 'Save Changes'}
                </button>
                {!isNew && (
                  <button onClick={() => setEditing(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center text-gray-600">
                <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>{new Date(event.date).toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {event.location && (
                <div className="flex items-center text-gray-600">
                  <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.description && <p className="text-gray-700">{event.description}</p>}

              <div className="pt-4 border-t">
                <h4 className="font-semibold text-gray-800 mb-3">Your RSVP</h4>
                <div className="flex gap-2">
                  {['yes', 'maybe', 'no'].map(status => (
                    <button
                      key={status}
                      disabled={saving}
                      onClick={() => onRsvp(event.id, status)}
                      className={`flex-1 py-2 rounded-lg font-medium capitalize transition-colors disabled:opacity-60 ${myRsvp === status
                        ? status === 'yes' ? 'bg-green-600 text-white' : status === 'no' ? 'bg-red-600 text-white' : 'bg-yellow-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  RSVPs — {rsvpCounts.yes || 0} yes, {rsvpCounts.maybe || 0} maybe, {rsvpCounts.no || 0} no
                </h4>
                <div className="space-y-2 mt-3">
                  {['yes', 'maybe', 'no'].map(status => {
                    const names = namesFor(status);
                    if (names.length === 0) return null;
                    return (
                      <div key={status}>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${status === 'yes' ? 'text-green-600' : status === 'no' ? 'text-red-600' : 'text-yellow-600'
                          }`}>
                          {status} ({names.length})
                        </p>
                        <p className="text-sm text-gray-700">{names.join(', ')}</p>
                      </div>
                    );
                  })}
                  {Object.keys(event.rsvps).length === 0 && (
                    <p className="text-sm text-gray-400">No responses yet.</p>
                  )}
                </div>
              </div>

              {isAdmin && (
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditing(true)} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium">
                    Edit
                  </button>
                  <button disabled={saving} onClick={() => onDelete(event.id)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-60">
                    {saving ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Member Modal ----------
function MemberModal({ member, currentUser, saving, error, onClose, onSave, onDelete }) {
  const isNew = !member;
  const isSelf = !isNew && currentUser && member.id === currentUser.id;
  const roleLocked = isSelf && member.role === 'admin';
  const [photoError, setPhotoError] = useState('');
  const [fd, setFd] = useState({
    firstName: member?.firstName || '',
    lastName: member?.lastName || '',
    email: member?.email || '',
    password: '',
    profilePicture: member?.profilePicture || '',
    spouse: member?.spouse || '',
    birthday: member?.birthday || '',
    anniversary: member?.anniversary || '',
    address: member?.address || '',
    summerAddress: member?.summerAddress || '',
    phoneCell: member?.phoneCell || '',
    phoneHome: member?.phoneHome || '',
    phoneSummer: member?.phoneSummer || '',
    role: member?.role || 'member'
  });

  const set = (key) => (e) => setFd({ ...fd, [key]: e.target.value });

  const canSubmit =
    fd.firstName.trim() && fd.lastName.trim() && fd.email.trim() && (!isNew || fd.password.trim().length >= 6);

  const handlePhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // so picking the same file twice still triggers onChange
    if (!file) return;
    setPhotoError('');
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setFd((prev) => ({ ...prev, profilePicture: dataUrl }));
    } catch (err) {
      setPhotoError(err.message);
    }
  };

  return (
    // no click-outside-to-close here so a stray click can't throw away the form
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">{isNew ? 'Add Member' : 'Edit Member'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar user={{ firstName: fd.firstName, lastName: fd.lastName, profilePicture: fd.profilePicture }} size="xl" />
              <div>
                <label htmlFor="photo-upload" className="inline-block px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                  {fd.profilePicture ? 'Change photo' : 'Upload photo'}
                </label>
                <input id="photo-upload" type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                {fd.profilePicture && (
                  <button onClick={() => setFd({ ...fd, profilePicture: '' })} className="ml-3 text-sm text-red-600 hover:underline">
                    Remove
                  </button>
                )}
                {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
                <p className="text-xs text-gray-400 mt-1">Photos are resized automatically.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First Name">
                <input type="text" value={fd.firstName} onChange={set('firstName')} className={inputClass} />
              </Field>
              <Field label="Last Name">
                <input type="text" value={fd.lastName} onChange={set('lastName')} className={inputClass} />
              </Field>
            </div>

            <Field label="Spouse / Significant Other">
              <input type="text" value={fd.spouse} onChange={set('spouse')} className={inputClass} />
            </Field>

            <Field label="Email">
              <input type="email" value={fd.email} onChange={set('email')} className={inputClass} />
            </Field>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isNew ? 'Temporary Password' : 'Reset Password'}
                {!isNew && <span className="text-gray-400 font-normal"> (leave blank to keep current)</span>}
              </label>
              <input type="password" value={fd.password} onChange={set('password')}
                placeholder={isNew ? 'Min. 6 characters' : '••••••••'} className={inputClass} />
              {isNew && <p className="text-xs text-gray-400 mt-1">Share this with the member directly. They'll use it to log in.</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Birthday">
                <input type="date" value={fd.birthday} onChange={set('birthday')} className={inputClass} />
              </Field>
              <Field label="Anniversary">
                <input type="date" value={fd.anniversary} onChange={set('anniversary')} className={inputClass} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Cell Phone">
                <input type="tel" value={fd.phoneCell} onChange={set('phoneCell')} className={inputClass} />
              </Field>
              <Field label="Home Phone">
                <input type="tel" value={fd.phoneHome} onChange={set('phoneHome')} className={inputClass} />
              </Field>
              <Field label="Summer Phone">
                <input type="tel" value={fd.phoneSummer} onChange={set('phoneSummer')} className={inputClass} />
              </Field>
            </div>

            <Field label="Address">
              <textarea value={fd.address} onChange={set('address')} className={`${inputClass} h-20`} />
            </Field>
            <Field label="Summer Address">
              <textarea value={fd.summerAddress} onChange={set('summerAddress')} className={`${inputClass} h-20`} />
            </Field>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={fd.role}
                disabled={roleLocked}
                onChange={set('role')}
                className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-400`}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              {roleLocked && (
                <p className="text-xs text-gray-500 mt-1">
                  You can't change your own role while logged in. Ask another admin to do this if needed.
                </p>
              )}
              {!roleLocked && !isNew && fd.role !== member.role && (
                <p className="text-xs text-amber-600 mt-1">
                  {fd.role === 'admin'
                    ? `Saving will give ${fullName(member)} full admin access, including managing members.`
                    : `Saving will remove ${fullName(member)}'s admin access.`}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                disabled={!canSubmit || saving}
                onClick={() => onSave({ ...fd, id: member?.id })}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : isNew ? 'Add Member' : 'Save Changes'}
              </button>
              {!isNew && (
                <button
                  onClick={() => onDelete(member.id)}
                  disabled={isSelf || saving}
                  title={isSelf ? "You can't delete your own account while logged in" : undefined}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-600"
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

function Attachments({ files, token }) {
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
function AnnouncementModal({ announcement, saving, error, onClose, onSave, onDelete }) {
  const isNew = !announcement;
  const [fd, setFd] = useState({
    title: announcement?.title || '',
    body: announcement?.body || ''
  });
  const [removedIds, setRemovedIds] = useState([]); // existing files taken off, actually deleted when they hit save
  const [newFiles, setNewFiles] = useState([]);     // files picked but not uploaded yet
  const [fileError, setFileError] = useState('');
  const [processing, setProcessing] = useState(false);

  const keptFiles = (announcement?.attachments || []).filter((f) => !removedIds.includes(f._id));
  const totalFiles = keptFiles.length + newFiles.length;
  const atLimit = totalFiles >= MAX_ATTACHMENTS;
  const canSubmit = fd.title.trim() && fd.body.trim() && !processing;

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
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">{isNew ? 'New Announcement' : 'Edit Announcement'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">{error}</div>}

          <div className="space-y-4">
            <Field label="Title">
              <input type="text" value={fd.title} onChange={(e) => setFd({ ...fd, title: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Message">
              <textarea value={fd.body} onChange={(e) => setFd({ ...fd, body: e.target.value })} className={`${inputClass} h-32`} />
            </Field>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
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
              <p className="text-xs text-gray-400 mt-1">Up to 5 files, 5 MB each. Big photos are shrunk automatically.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                disabled={!canSubmit || saving}
                onClick={() => onSave({ ...fd, id: announcement?.id, newFiles, removedIds })}
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

// ---------- Import Modal ----------
function ImportModal({ onClose, onImport }) {
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

  return (
    // no click-outside-to-close so I can't lose my column choices by accident
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">Import Members from CSV</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
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
                <button onClick={onClose} disabled={importing} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
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

// ---------- Mailing List Modal ----------
function MailingListModal({ users, onClose }) {
  const sorted = [...users].sort(byLastName);
  // everybody starts checked and I can uncheck anyone who shouldn't get the email
  const [selectedIds, setSelectedIds] = useState(() => new Set(users.map((u) => u.id)));
  const [useBcc, setUseBcc] = useState(true);
  const [separator, setSeparator] = useState(', ');
  const [note, setNote] = useState('');
  const [manualText, setManualText] = useState('');

  const chosen = sorted.filter((u) => selectedIds.has(u.id));
  const mailtoInfo = buildMailLink('mailto', chosen, useBcc);
  const gmailInfo = buildMailLink('gmail', chosen, useBcc);
  const plural = chosen.length === 1 ? '' : 'es';

  const toggle = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setNote('');
    setManualText('');
  };

  const selectAll = () => { setSelectedIds(new Set(users.map((u) => u.id))); setNote(''); setManualText(''); };
  const selectNone = () => { setSelectedIds(new Set()); setNote(''); setManualText(''); };

  const openEmailApp = () => {
    setNote('If nothing opened, this computer may not have a default email app set up. Try the Gmail button or Copy instead.');
    window.location.href = mailtoInfo.url;
  };

  const openGmail = () => {
    window.open(gmailInfo.url, '_blank', 'noopener');
  };

  const copyEmails = async () => {
    const text = chosen.map((u) => u.email).join(separator);
    try {
      await navigator.clipboard.writeText(text);
      setManualText('');
      setNote(`Copied ${chosen.length} address${plural}. Paste them into the ${useBcc ? 'BCC' : 'To'} field of your email.`);
    } catch (err) {
      // some browsers block automatic copying, so I show the text to copy by hand
      setManualText(text);
      setNote("Your browser wouldn't let me copy automatically. Select the addresses below and copy them yourself.");
    }
  };

  let linkNotice = '';
  if (chosen.length > 0) {
    if (mailtoInfo.tooLong && gmailInfo.tooLong) {
      linkNotice = "This list is too long to open in an email directly. Use Copy and paste the addresses into your email, or uncheck some people.";
    } else if (mailtoInfo.tooLong) {
      linkNotice = "This list is too long for the email app button, but the Gmail button and Copy will still work.";
    } else if (mailtoInfo.namesDropped) {
      linkNotice = "The list is long, so the email app button uses addresses only (no names) to keep the link short.";
    }
  }

  return (
    // no click-outside-to-close so my checkbox choices don't disappear
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">Mailing List</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-gray-500">There are no members yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{chosen.length} of {users.length} selected</span>
                <span className="space-x-3">
                  <button onClick={selectAll} className="text-indigo-600 hover:underline">Select all</button>
                  <button onClick={selectNone} className="text-indigo-600 hover:underline">Select none</button>
                </span>
              </div>

              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y">
                {sorted.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggle(u.id)} />
                    <span className="font-medium text-gray-800">{fullName(u)}</span>
                    <span className="text-gray-500 truncate">{u.email}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-2 text-sm">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={useBcc} onChange={(e) => setUseBcc(e.target.checked)} className="mt-1" />
                  <span>
                    Put everyone in BCC
                    <span className="block text-xs text-gray-400">Recommended. Recipients won't see each other's addresses. Turn off to use the To field.</span>
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-gray-600">When copying, separate addresses with</span>
                  <select value={separator} onChange={(e) => setSeparator(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-lg text-sm">
                    <option value=", ">commas (Gmail and most apps)</option>
                    <option value="; ">semicolons (some Outlook setups)</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={openEmailApp}
                  disabled={chosen.length === 0 || mailtoInfo.tooLong}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" /> Open in email app
                </button>
                <button
                  onClick={openGmail}
                  disabled={chosen.length === 0 || gmailInfo.tooLong}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" /> Open in Gmail
                </button>
                <button
                  onClick={copyEmails}
                  disabled={chosen.length === 0}
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Copy className="w-4 h-4" /> Copy emails
                </button>
                <button
                  onClick={() => printMailingList(chosen)}
                  disabled={chosen.length === 0}
                  className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Printer className="w-4 h-4" /> Print / Save as PDF
                </button>
              </div>

              {linkNotice && <p className="text-xs text-amber-600">{linkNotice}</p>}
              {note && <p className="text-xs text-gray-600">{note}</p>}
              {manualText && (
                <textarea
                  readOnly
                  value={manualText}
                  onFocus={(e) => e.target.select()}
                  className={`${inputClass} h-24 text-xs`}
                />
              )}
            </div>
          )}

          <button onClick={onClose} className="w-full mt-5 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Calendar ----------
function MonthCalendar({ viewDate, events, onEventClick }) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const eventsForDay = (day) => {
    if (!day) return [];
    const dateStr = new Date(year, month, day).toDateString();
    return events.filter(e => new Date(e.date).toDateString() === dateStr)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  return (
    <div className="grid grid-cols-7 gap-2">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
        <div key={d} className="text-center text-sm font-semibold text-gray-500 py-2">{d}</div>
      ))}
      {cells.map((day, i) => {
        const dayEvents = eventsForDay(day);
        const isToday = day && new Date().toDateString() === new Date(year, month, day).toDateString();
        return (
          <div
            key={i}
            className={`min-h-[6rem] p-2 rounded-lg border ${day ? 'bg-white border-gray-200' : 'bg-gray-50 border-transparent'} ${isToday ? 'ring-2 ring-indigo-400' : ''}`}
          >
            {day && (
              <>
                <div className={`text-sm font-medium mb-1 ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>{day}</div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(e => (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className="w-full text-left text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded truncate hover:bg-indigo-200 transition-colors"
                    >
                      {e.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && <div className="text-xs text-gray-400 pl-1">+{dayEvents.length - 3} more</div>}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ currentUser, token, onLogout }) {
  const [tab, setTab] = useState('calendar');
  const [viewDate, setViewDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [showEventModal, setShowEventModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMailingModal, setShowMailingModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = currentUser.role === 'admin';

  const loadEvents = useCallback(async () => {
    try {
      const data = await apiFetch('/events', { token });
      const normalized = data.map(normalizeEvent);
      setEvents(normalized);
      setLoadError('');
      return normalized;
    } catch (err) {
      setLoadError(err.message);
      return [];
    }
  }, [token]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiFetch('/users', { token });
      setUsers(data.map(normalizeUser));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [token]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await apiFetch('/announcements', { token });
      setAnnouncements(data.map(normalizeAnnouncement));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [token]);

  useEffect(() => { loadEvents(); loadUsers(); loadAnnouncements(); }, [loadEvents, loadUsers, loadAnnouncements]);

  const changeMonth = (delta) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));

  // ----- events -----
  const openEvent = (evt) => { setSelectedEvent(evt); setModalError(''); setShowEventModal(true); };
  const openNewEvent = () => { setSelectedEvent(null); setModalError(''); setShowEventModal(true); };
  const closeEventModal = () => { setShowEventModal(false); setSelectedEvent(null); setModalError(''); };

  const saveEvent = async (data) => {
    setSaving(true);
    setModalError('');
    try {
      const body = {
        title: data.title,
        description: data.description,
        // the input gives me local time with no timezone, so I turn it into a real UTC timestamp here.
        // this is the line that fixes the "4 hours early" bug
        date: new Date(data.date).toISOString(),
        location: data.location
      };
      if (data.id) {
        await apiFetch(`/events/${data.id}`, { method: 'PUT', token, body });
      } else {
        await apiFetch('/events', { method: 'POST', token, body });
      }
      await loadEvents();
      closeEventModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    setSaving(true);
    setModalError('');
    try {
      await apiFetch(`/events/${id}`, { method: 'DELETE', token });
      await loadEvents();
      closeEventModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rsvp = async (eventId, status) => {
    setSaving(true);
    setModalError('');
    try {
      await apiFetch(`/events/${eventId}/rsvp`, { method: 'POST', token, body: { status } });
      const normalized = await loadEvents();
      setSelectedEvent(normalized.find(e => e.id === eventId) || null);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ----- members -----
  const openMember = (m) => { setSelectedMember(m); setModalError(''); setShowMemberModal(true); };
  const openNewMember = () => { setSelectedMember(null); setModalError(''); setShowMemberModal(true); };
  const closeMemberModal = () => { setShowMemberModal(false); setSelectedMember(null); setModalError(''); };

  const saveMember = async (data) => {
    setSaving(true);
    setModalError('');
    try {
      const body = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        profilePicture: data.profilePicture,
        spouse: data.spouse,
        birthday: data.birthday,
        anniversary: data.anniversary,
        address: data.address,
        summerAddress: data.summerAddress,
        phoneCell: data.phoneCell,
        phoneHome: data.phoneHome,
        phoneSummer: data.phoneSummer,
        role: data.role
      };
      if (data.password) body.password = data.password;

      if (data.id) {
        await apiFetch(`/users/${data.id}`, { method: 'PUT', token, body });
      } else {
        await apiFetch('/users', { method: 'POST', token, body });
      }
      await loadUsers();
      closeMemberModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const importMembers = async (members) => {
    const data = await apiFetch('/users/import', { method: 'POST', token, body: { members } });
    await loadUsers();
    return data;
  };

  const deleteMember = async (id) => {
    if (!window.confirm('Delete this member? This cannot be undone.')) return;
    setSaving(true);
    setModalError('');
    try {
      await apiFetch(`/users/${id}`, { method: 'DELETE', token });
      await loadUsers();
      closeMemberModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ----- announcements -----
  const openAnnouncement = (a) => { setSelectedAnnouncement(a); setModalError(''); setShowAnnouncementModal(true); };
  const openNewAnnouncement = () => { setSelectedAnnouncement(null); setModalError(''); setShowAnnouncementModal(true); };
  const closeAnnouncementModal = () => { setShowAnnouncementModal(false); setSelectedAnnouncement(null); setModalError(''); };

  const saveAnnouncement = async (data) => {
    setSaving(true);
    setModalError('');
    try {
      const body = { title: data.title, body: data.body };
      let announcementId = data.id;
      if (data.id) {
        await apiFetch(`/announcements/${data.id}`, { method: 'PUT', token, body });
      } else {
        const created = await apiFetch('/announcements', { method: 'POST', token, body });
        announcementId = created._id;
      }

      // file problems get collected instead of stopping everything, otherwise a retry
      // could post the same announcement twice
      const problems = [];
      for (const attId of data.removedIds || []) {
        try {
          await apiFetch(`/announcements/${announcementId}/attachments/${attId}`, { method: 'DELETE', token });
        } catch (err) {
          problems.push(`a file couldn't be removed (${err.message})`);
        }
      }
      for (const file of data.newFiles || []) {
        try {
          await uploadAttachment(announcementId, file, token);
        } catch (err) {
          problems.push(`${file.name} didn't upload (${err.message})`);
        }
      }

      await loadAnnouncements();
      closeAnnouncementModal();
      if (problems.length) {
        setLoadError(`The announcement was saved, but ${problems.join('; ')}. Edit it to try again.`);
      }
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (id) => {
    if (!window.confirm('Delete this announcement? This cannot be undone.')) return;
    setSaving(true);
    setModalError('');
    try {
      await apiFetch(`/announcements/${id}`, { method: 'DELETE', token });
      await loadAnnouncements();
      closeAnnouncementModal();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Calendar className="w-7 h-7 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800">Event Manager</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-gray-700 text-sm">
              <User className="w-4 h-4" />
              <span className="font-medium">{fullName(currentUser)}</span>
              <span className="text-gray-400">({currentUser.role})</span>
            </div>
            <button onClick={onLogout} className="flex items-center space-x-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {loadError && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 text-center border-b border-red-100">
          {loadError}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4">
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('calendar')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'calendar' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
            Calendar
          </button>
          <button onClick={() => setTab('announcements')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'announcements' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
            Announcements
          </button>
          <button onClick={() => setTab('members')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'members' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
            Members
          </button>
        </div>

        {tab === 'calendar' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
                <h2 className="text-lg font-semibold text-gray-800 min-w-[10rem] text-center">
                  {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
              </div>
              {isAdmin && (
                <button onClick={openNewEvent} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                  <Plus className="w-4 h-4" /> New Event
                </button>
              )}
            </div>
            <MonthCalendar viewDate={viewDate} events={events} onEventClick={openEvent} />
          </div>
        )}

        {tab === 'announcements' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-indigo-600" />
                Announcements
              </h2>
              {isAdmin && (
                <button onClick={openNewAnnouncement} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                  <Plus className="w-4 h-4" /> New Announcement
                </button>
              )}
            </div>
            {announcements.length === 0 ? (
              <p className="text-gray-400 text-sm">No announcements yet.</p>
            ) : (
              <div className="space-y-4">
                {announcements.map(a => (
                  <div key={a.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-800">{a.title}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {a.createdBy ? `Posted by ${fullName(a.createdBy)}` : 'Posted'} · {new Date(a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      {isAdmin && (
                        <button onClick={() => openAnnouncement(a)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex-shrink-0">
                          Edit
                        </button>
                      )}
                    </div>
                    <p className="text-gray-700 mt-2 whitespace-pre-wrap">{a.body}</p>
                    <Attachments files={a.attachments} token={token} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'members' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <h2 className="text-lg font-semibold text-gray-800">
                Members <span className="text-gray-400 font-normal text-sm">({users.length})</span>
              </h2>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowMailingModal(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
                    <Mail className="w-4 h-4" /> Mailing List
                  </button>
                  <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
                    <Upload className="w-4 h-4" /> Import CSV
                  </button>
                  <button onClick={openNewMember} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                    <Plus className="w-4 h-4" /> Add Member
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[...users].sort(byLastName).map(u => (
                <div key={u.id} className="border border-gray-200 rounded-xl p-4 flex gap-4">
                  <Avatar user={u} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-800 truncate">{fullName(u)}</h3>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`}>
                          {u.role}
                        </span>
                      </div>
                      {isAdmin && (
                        <button onClick={() => openMember(u)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex-shrink-0">
                          Edit
                        </button>
                      )}
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-gray-600">
                      {u.spouse && <Detail icon={Heart} label="Spouse/SO">{u.spouse}</Detail>}
                      <Detail icon={Mail}>{u.email}</Detail>
                      {u.phoneCell && <Detail icon={Phone} label="Cell">{u.phoneCell}</Detail>}
                      {u.phoneHome && <Detail icon={Phone} label="Home">{u.phoneHome}</Detail>}
                      {u.phoneSummer && <Detail icon={Phone} label="Summer">{u.phoneSummer}</Detail>}
                      {u.birthday && <Detail icon={Cake} label="Birthday">{formatMonthDay(u.birthday)}</Detail>}
                      {u.anniversary && <Detail icon={Gift} label="Anniversary">{formatMonthDay(u.anniversary)}</Detail>}
                      {u.address && <Detail icon={MapPin} label="Address">{u.address}</Detail>}
                      {u.summerAddress && <Detail icon={Sun} label="Summer address">{u.summerAddress}</Detail>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showEventModal && (
        <EventModal
          event={selectedEvent}
          isAdmin={isAdmin}
          currentUser={currentUser}
          saving={saving}
          error={modalError}
          onClose={closeEventModal}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onRsvp={rsvp}
        />
      )}

      {showMemberModal && (
        <MemberModal
          member={selectedMember}
          currentUser={currentUser}
          saving={saving}
          error={modalError}
          onClose={closeMemberModal}
          onSave={saveMember}
          onDelete={deleteMember}
        />
      )}

      {showAnnouncementModal && (
        <AnnouncementModal
          announcement={selectedAnnouncement}
          saving={saving}
          error={modalError}
          onClose={closeAnnouncementModal}
          onSave={saveAnnouncement}
          onDelete={deleteAnnouncement}
        />
      )}

      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} onImport={importMembers} />
      )}

      {showMailingModal && (
        <MailingListModal users={users} onClose={() => setShowMailingModal(false)} />
      )}
    </div>
  );
}

// ---------- App ----------
export default function App() {
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'reset' | 'app'
  const [resetToken, setResetToken] = useState(null);
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (window.location.pathname.includes('reset-password') && t) {
      setResetToken(t);
      setView('reset');
    }
  }, []);

  // pinging the backend as soon as the site loads so it starts waking up while the person types their login
  useEffect(() => {
    fetch(`${API_URL}/health`).catch(() => {});
  }, []);

  const login = async (email, password) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setCurrentUser(normalizeUser(data.user));
    setView('app');
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    setView('login');
  };

  const backToLogin = () => {
    window.history.replaceState({}, '', '/');
    setResetToken(null);
    setView('login');
  };

  if (view === 'forgot') return <ForgotPassword onBack={() => setView('login')} />;
  if (view === 'reset') return <ResetPassword token={resetToken} onDone={backToLogin} />;
  if (view === 'app' && currentUser) return <Dashboard currentUser={currentUser} token={token} onLogout={logout} />;

  return <Login onSubmit={login} onForgot={() => setView('forgot')} />;
}