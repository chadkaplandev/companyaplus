import React, { useState } from 'react';
import { X } from 'lucide-react';
import { formatPhoneInput, fullName, isCompletePhone, resizeImageToDataUrl } from '../helpers';
import { Avatar, Field, PasswordInput, inputClass } from './ui';

function PhoneField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <input type="tel" inputMode="tel" value={value} onChange={onChange} placeholder="(123)456-7890" className={inputClass} />
      {!isCompletePhone(value) && <p className="text-xs text-amber-600 mt-1">Enter all 10 digits</p>}
    </Field>
  );
}

export default function MemberModal({ member, currentUser, saving, error, onClose, onSave, onDelete }) {
  const isNew = !member;
  const isSelf = !isNew && currentUser && member.id === currentUser.id;
  const roleLocked = isSelf && member.role === 'admin';
  const [photoError, setPhotoError] = useState('');
  const [initialFd] = useState(() => ({
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
    phoneCell: formatPhoneInput(member?.phoneCell || ''),
    phoneHome: formatPhoneInput(member?.phoneHome || ''),
    phoneSummer: formatPhoneInput(member?.phoneSummer || ''),
    role: member?.role || 'member'
  }));
  const [fd, setFd] = useState(initialFd);

  const set = (key) => (e) => setFd({ ...fd, [key]: e.target.value });
  const setPhone = (key) => (e) => setFd({ ...fd, [key]: formatPhoneInput(e.target.value) });

  const phonesOk = [fd.phoneCell, fd.phoneHome, fd.phoneSummer].every(isCompletePhone);
  const canSubmit =
    fd.firstName.trim() && fd.lastName.trim() && fd.email.trim() && phonesOk && (!isNew || fd.password.trim().length >= 6);

  // if anything was typed, closing asks first so a misclick can't wipe the form
  const dirty = JSON.stringify(fd) !== JSON.stringify(initialFd);
  const requestClose = () => {
    if (dirty && !window.confirm('Close without saving? What you typed will be lost.')) return;
    onClose();
  };

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
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">{isNew ? 'Add Member' : 'Edit Member'}</h2>
            <button onClick={requestClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
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
              <PasswordInput
                value={fd.password}
                onChange={set('password')}
                placeholder={isNew ? 'Min. 6 characters' : '••••••••'}
              />
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
              <PhoneField label="Cell Phone" value={fd.phoneCell} onChange={setPhone('phoneCell')} />
              <PhoneField label="Home Phone" value={fd.phoneHome} onChange={setPhone('phoneHome')} />
              <PhoneField label="Summer Phone" value={fd.phoneSummer} onChange={setPhone('phoneSummer')} />
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