import { API_URL } from './api';

// ---------- Basic helpers ----------
// Mongo gives me _id, so I copy it to id to keep the rest of the code simple
export const normalizeUser = (u) => ({ ...u, id: u._id });
export const normalizeEvent = (e) => ({ ...e, id: e._id });
export const normalizeAnnouncement = (a) => ({ ...a, id: a._id });

export const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '');

// sorting by last name first, then first name as the tiebreaker
export const byLastName = (a, b) =>
  (a.lastName || '').localeCompare(b.lastName || '', undefined, { sensitivity: 'base' }) ||
  (a.firstName || '').localeCompare(b.firstName || '', undefined, { sensitivity: 'base' });

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the viewer's own timezone.
// toISOString() gives UTC, which was shifting the time, so I subtract the offset first.
export const toLocalInputValue = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export const formatMonthDay = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });

// ---------- CSV import helpers ----------
// the fields I can import into, plus keywords to guess which spreadsheet column matches.
// the order matters: more specific fields go first so "Summer Address" doesn't get grabbed as "Address"
export const IMPORT_FIELDS = [
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
export const guessMapping = (headers) => {
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

export const buildMembers = (rows, mapping) =>
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

// ---------- Profile picture helper ----------
// shrinks the chosen photo to max 256px so it stays tiny in the database
export function resizeImageToDataUrl(file, maxSize = 256) {
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
export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // same limit as the server
export const MAX_ATTACHMENTS = 5;

export const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// big phone photos get shrunk here so they upload fast and don't eat database space.
// PDFs and GIFs are left alone (re-encoding a GIF would kill the animation)
export function prepareAttachment(file) {
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
export async function uploadAttachment(announcementId, file, token) {
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
export async function fetchFileBlobUrl(fileId, token) {
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
export const escapeHtml = (s) =>
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
export const buildMailLink = (kind, people, useBcc) => {
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
export const printMailingList = (people) => {
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

// ---------- Phone helpers ----------
// formats whatever gets typed into (123)456-7890 as I go, so nobody has to type the symbols
export const formatPhoneInput = (value) => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length > 10 && digits[0] === '1') digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)})${digits.slice(3)}`;
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export const isCompletePhone = (value) => value === '' || /^\(\d{3}\)\d{3}-\d{4}$/.test(value);

// sends a picture for the announcement editor and gives back its id
export async function uploadInlineImage(file, token) {
  let res;
  try {
    res = await fetch(`${API_URL}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-Filename': encodeURIComponent(file.name),
        Authorization: `Bearer ${token}`
      },
      body: file
    });
  } catch (err) {
    throw new Error("Can't reach the server.");
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* response wasn't JSON */ }
  if (!res.ok) throw new Error((data && data.message) || `Upload failed (${res.status})`);
  return data;
}