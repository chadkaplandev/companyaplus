import React, { useState } from 'react';
import { X, Mail, Copy, Printer } from 'lucide-react';
import { buildMailLink, byLastName, fullName, printMailingList } from '../helpers';
import { inputClass } from './ui';

export default function MailingListModal({ users, onClose }) {
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