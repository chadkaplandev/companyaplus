// npm run dev

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(cors());
// profile pictures come in as small base64 strings, so I raised the body limit from the default
app.use(express.json({ limit: '1mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// stripping trailing slashes so the reset link never turns into "//reset-password"
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Event Manager';

// ---------- Schemas ----------
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, default: '', trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  profilePicture: { type: String, default: '' }, // small resized image stored as a base64 data URL
  spouse: { type: String, default: '' },         // spouse or significant other
  birthday: { type: String, default: '' },       // 'YYYY-MM-DD'
  anniversary: { type: String, default: '' },    // 'YYYY-MM-DD'
  address: { type: String, default: '' },
  summerAddress: { type: String, default: '' },
  phoneCell: { type: String, default: '' },
  phoneHome: { type: String, default: '' },
  phoneSummer: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  resetTokenHash: { type: String, default: null },
  resetTokenExpires: { type: Date, default: null }
}, { timestamps: true });

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: Date, required: true },
  location: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // rsvps: map of userId -> 'yes' | 'no' | 'maybe'
  rsvps: { type: Map, of: String, default: {} }
}, { timestamps: true });

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// files live in their own collection so the announcement list stays small and fast
const attachmentSchema = new mongoose.Schema({
  announcement: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement', required: true, index: true },
  filename: { type: String, required: true },
  contentType: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Event = mongoose.model('Event', eventSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const Attachment = mongoose.model('Attachment', attachmentSchema);

const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_ATTACHMENTS_PER_ANNOUNCEMENT = 5;

// ---------- Helpers ----------
const sanitizeUser = (userDoc) => {
  const u = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete u.password;
  delete u.resetTokenHash;
  delete u.resetTokenExpires;
  return u;
};

// the simple text fields that every member has, so I don't repeat them in each route
const PROFILE_FIELDS = ['spouse', 'birthday', 'anniversary', 'address', 'summerAddress', 'phoneCell', 'phoneHome', 'phoneSummer'];
const pickProfileFields = (body) => {
  const out = {};
  PROFILE_FIELDS.forEach((f) => {
    if (body[f] !== undefined) out[f] = typeof body[f] === 'string' ? body[f].trim() : '';
  });
  return out;
};

// returns '' for no picture, the string if it's a valid small image, or null if it's invalid
const cleanPicture = (pic) => {
  if (!pic) return '';
  if (typeof pic !== 'string' || !pic.startsWith('data:image/') || pic.length > 300000) return null;
  return pic;
};

// looks up the names of everyone who RSVP'd so members can see them without needing the full member list
const loadNamesFor = async (eventDocs) => {
  const ids = new Set();
  eventDocs.forEach((ev) => ev.rsvps.forEach((_, uid) => ids.add(uid)));
  const validIds = [...ids].filter((id) => mongoose.isValidObjectId(id));
  const people = await User.find({ _id: { $in: validIds } }).select('firstName lastName');
  const map = {};
  people.forEach((p) => {
    map[p._id.toString()] = [p.firstName, p.lastName].filter(Boolean).join(' ');
  });
  return map;
};

const sanitizeEvent = (eventDoc, namesById = {}) => {
  const e = eventDoc.toObject ? eventDoc.toObject() : eventDoc;
  e.rsvps = e.rsvps instanceof Map ? Object.fromEntries(e.rsvps) : (e.rsvps || {});
  e.rsvpNames = {};
  Object.keys(e.rsvps).forEach((uid) => {
    e.rsvpNames[uid] = namesById[uid] || 'Former member';
  });
  return e;
};

const eventToJson = async (eventDoc) => sanitizeEvent(eventDoc, await loadNamesFor([eventDoc]));

// tacks a list of file info (never the file data itself) onto each announcement
const withAttachments = async (announcements) => {
  const ids = announcements.map((a) => a._id);
  const files = await Attachment.find({ announcement: { $in: ids } })
    .select('announcement filename contentType size')
    .sort({ createdAt: 1 });

  const byAnnouncement = {};
  files.forEach((f) => {
    const key = f.announcement.toString();
    (byAnnouncement[key] = byAnnouncement[key] || []).push({
      _id: f._id, filename: f.filename, contentType: f.contentType, size: f.size
    });
  });

  return announcements.map((a) => {
    const obj = a.toObject ? a.toObject() : a;
    obj.attachments = byAnnouncement[a._id.toString()] || [];
    return obj;
  });
};

// ---------- One-time migration for accounts made before the new fields ----------
const migrateOldFields = async () => {
  const oldDocs = await User.collection.find({
    $or: [
      { firstName: { $exists: false } },
      { phone: { $exists: true }, phoneCell: { $exists: false } }
    ]
  }).toArray();

  for (const doc of oldDocs) {
    const set = {};
    if (doc.firstName === undefined) {
      // splitting the old single "name" on spaces, last word becomes the last name
      const parts = (doc.name || '').trim().split(/\s+/).filter(Boolean);
      const last = parts.length > 1 ? parts.pop() : '';
      set.firstName = parts.join(' ');
      set.lastName = last;
    }
    if (doc.phoneCell === undefined && doc.phone !== undefined) {
      set.phoneCell = doc.phone;
    }
    if (Object.keys(set).length) {
      // leaving the old name/phone fields alone on purpose, just in case
      await User.collection.updateOne({ _id: doc._id }, { $set: set });
    }
  }
  if (oldDocs.length) console.log(`Migrated ${oldDocs.length} older member record(s)`);
};

// ---------- DB Connection ----------
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    try {
      await migrateOldFields();
    } catch (err) {
      console.error('Migration problem:', err);
    }
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// ---------- Auth Middleware ----------
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.userId = payload.id;
    req.userRole = payload.role;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

// ---------- Email Helper (Brevo) ----------
const sendResetEmail = async (toEmail, toName, resetUrl) => {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    console.warn('Brevo not configured, skipping email send. Reset URL:', resetUrl);
    return;
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: toEmail, name: toName }],
      subject: 'Reset your Event Manager password',
      htmlContent: `
        <p>Hi ${toName},</p>
        <p>We received a request to reset your password. Click the link below to choose a new one. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `
    })
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Brevo send failed:', res.status, body);
    throw new Error('Failed to send reset email');
  }
};

// ---------- Auth Routes ----------

// One-time bootstrap for the very first admin. Disables itself once an admin exists.
app.post('/api/setup/admin', async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({ message: 'An admin account already exists. This setup route is now disabled.' });
    }

    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'firstName, lastName, email, and password are required' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const admin = await User.create({ firstName, lastName, email, password: hashed, role: 'admin' });
    res.status(201).json({ message: 'Admin account created', user: sanitizeUser(admin) });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email already in use' });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(sanitizeUser(user));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const genericResponse = { message: 'If an account with that email exists, a reset link has been sent.' };
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase().trim() });
    if (!user) return res.json(genericResponse);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetTokenHash = tokenHash;
    user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}`;
    await sendResetEmail(user.email, user.firstName, resetUrl);

    res.json(genericResponse);
  } catch (err) {
    console.error('forgot-password error:', err);
    res.json(genericResponse);
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 6) {
      return res.status(400).json({ message: 'A valid token and a password of at least 6 characters are required' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpires: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ message: 'This reset link is invalid or has expired' });

    user.password = await bcrypt.hash(password, 10);
    user.resetTokenHash = null;
    user.resetTokenExpires = null;
    await user.save();

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ---------- Bulk import (admin only) ----------
app.post('/api/users/import', authenticate, requireAdmin, async (req, res) => {
  try {
    const { members } = req.body;
    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ message: 'There are no members to import' });
    }
    if (members.length > 300) {
      return res.status(400).json({ message: 'Please import 300 members or fewer at a time' });
    }

    // grabbing the emails that already exist so I can skip them instead of failing the whole import
    const emails = members.map((m) => String((m && m.email) || '').toLowerCase().trim()).filter(Boolean);
    const existing = await User.find({ email: { $in: emails } }).select('email');
    const existingEmails = new Set(existing.map((u) => u.email));
    const seenInFile = new Set();

    let created = 0;
    const skipped = [];
    const failed = [];

    for (let i = 0; i < members.length; i++) {
      const m = members[i] || {};
      const row = i + 1;
      const firstName = String(m.firstName || '').trim();
      const lastName = String(m.lastName || '').trim();
      const email = String(m.email || '').toLowerCase().trim();
      const who = email || `${firstName} ${lastName}`.trim() || '(blank row)';

      if (!firstName || !lastName || !email) {
        failed.push({ row, who, reason: 'Missing a first name, last name, or email' });
        continue;
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        failed.push({ row, who, reason: 'That email does not look valid' });
        continue;
      }
      if (existingEmails.has(email)) {
        skipped.push({ row, who, reason: 'Already a member' });
        continue;
      }
      if (seenInFile.has(email)) {
        skipped.push({ row, who, reason: 'Listed more than once in the file' });
        continue;
      }
      seenInFile.add(email);

      try {
        // random password that nobody knows, members pick their own with "Forgot password?".
        // it's 128 random bits so I use a cheap bcrypt cost to keep a big import fast
        const hashed = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
        await User.create({
          firstName,
          lastName,
          email,
          password: hashed,
          role: 'member',
          ...pickProfileFields(m)
        });
        created++;
      } catch (err) {
        failed.push({ row, who, reason: err.message });
      }
    }

    res.json({ created, skipped, failed });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ---------- Member Routes ----------
// everyone logged in can read the member list, only admins can change it
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const users = await User.find().sort({ lastName: 1, firstName: 1 });
    res.json(users.map(sanitizeUser));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, profilePicture } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'First name, last name, email, and password are required' });
    }

    const picture = cleanPicture(profilePicture);
    if (picture === null) return res.status(400).json({ message: 'Profile picture must be a small image file' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashed,
      profilePicture: picture,
      ...pickProfileFields(req.body),
      role: role === 'admin' ? 'admin' : 'member'
    });

    res.status(201).json(sanitizeUser(user));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email already in use' });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.put('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, profilePicture } = req.body;
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ message: 'First name, last name, and email are required' });
    }

    const newRole = role === 'admin' ? 'admin' : 'member';
    // same safeguard as the frontend: admins can't demote themselves
    if (req.params.id === req.userId && newRole !== 'admin') {
      return res.status(400).json({ message: "You can't remove your own admin access" });
    }

    const update = { firstName, lastName, email, role: newRole, ...pickProfileFields(req.body) };

    if (profilePicture !== undefined) {
      const picture = cleanPicture(profilePicture);
      if (picture === null) return res.status(400).json({ message: 'Profile picture must be a small image file' });
      update.profilePicture = picture;
    }
    if (password) update.password = await bcrypt.hash(password, 10);

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(sanitizeUser(user));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Email already in use' });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.delete('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.userId) {
      return res.status(400).json({ message: 'You cannot delete your own account while logged in' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ---------- Event Routes ----------
app.get('/api/events', authenticate, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    const names = await loadNamesFor(events);
    res.json(events.map((e) => sanitizeEvent(e, names)));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.get('/api/events/:id', authenticate, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(await eventToJson(event));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.post('/api/events', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, description, date, location } = req.body;
    if (!title || !date) return res.status(400).json({ message: 'title and date are required' });

    const event = await Event.create({ title, description, date, location, createdBy: req.userId });
    res.status(201).json(await eventToJson(event));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.put('/api/events/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, description, date, location } = req.body;
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { title, description, date, location },
      { new: true, runValidators: true }
    );
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(await eventToJson(event));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.delete('/api/events/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// any logged-in user sets their own RSVP
app.post('/api/events/:id/rsvp', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['yes', 'no', 'maybe'].includes(status)) {
      return res.status(400).json({ message: "status must be 'yes', 'no', or 'maybe'" });
    }

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    event.rsvps.set(req.userId, status);
    await event.save();

    res.json(await eventToJson(event));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ---------- Announcement Routes ----------
app.get('/api/announcements', authenticate, async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).populate('createdBy', 'firstName lastName');
    res.json(await withAttachments(announcements));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.post('/api/announcements', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'title and body are required' });
    const announcement = await Announcement.create({ title, body, createdBy: req.userId });
    await announcement.populate('createdBy', 'firstName lastName');
    res.status(201).json(announcement);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.put('/api/announcements/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, body } = req.body;
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { title, body },
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName');
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    res.json(announcement);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.delete('/api/announcements/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    await Attachment.deleteMany({ announcement: announcement._id }); // cleaning up its files too
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ---------- Attachment Routes ----------

// upload one file (the browser sends the raw file as the request body)
app.post(
  '/api/announcements/:id/attachments',
  authenticate,
  requireAdmin,
  express.raw({ type: ALLOWED_ATTACHMENT_TYPES, limit: MAX_ATTACHMENT_BYTES }),
  async (req, res) => {
    try {
      const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) {
        return res.status(400).json({ message: 'Only images (JPG, PNG, GIF, WEBP) and PDFs can be attached' });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ message: 'That file was empty' });
      }

      const announcement = await Announcement.findById(req.params.id);
      if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

      const count = await Attachment.countDocuments({ announcement: announcement._id });
      if (count >= MAX_ATTACHMENTS_PER_ANNOUNCEMENT) {
        return res.status(400).json({ message: `An announcement can have up to ${MAX_ATTACHMENTS_PER_ANNOUNCEMENT} attachments` });
      }

      // cleaning up the filename so odd characters can't cause trouble later
      let filename = 'attachment';
      try { filename = decodeURIComponent(req.headers['x-filename'] || '') || filename; } catch (e) { /* keep the default */ }
      filename = filename.replace(/[\\/\r\n"]/g, '_').slice(0, 150);

      const file = await Attachment.create({
        announcement: announcement._id,
        filename,
        contentType,
        size: req.body.length,
        data: req.body
      });

      res.status(201).json({ _id: file._id, filename: file.filename, contentType: file.contentType, size: file.size });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// download a file (any logged-in user)
app.get('/api/attachments/:id', authenticate, async (req, res) => {
  try {
    const file = await Attachment.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'Attachment not found' });

    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600'
    });
    res.send(file.data);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// remove one file from an announcement
app.delete('/api/announcements/:id/attachments/:attachmentId', authenticate, requireAdmin, async (req, res) => {
  try {
    const file = await Attachment.findOneAndDelete({ _id: req.params.attachmentId, announcement: req.params.id });
    if (!file) return res.status(404).json({ message: 'Attachment not found' });
    res.json({ message: 'Attachment removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ---------- Health check ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---------- Error handler (keeps errors as JSON so the frontend can show them) ----------
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'That file is too large' });
  }
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));