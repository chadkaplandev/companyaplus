// npm run dev

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// ---------- DB Connection ----------
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ---------- Schemas ----------
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  spouse: { type: String, default: '' },
  birthday: { type: String, default: '' }, // stored as 'YYYY-MM-DD'
  role: { type: String, enum: ['admin', 'member'], default: 'member' }
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

const Announcement = mongoose.model('Announcement', announcementSchema);

const User = mongoose.model('User', userSchema);
const Event = mongoose.model('Event', eventSchema);

// ---------- Helpers ----------
const sanitizeUser = (userDoc) => {
  const u = userDoc.toObject ? userDoc.toObject() : userDoc;
  delete u.password;
  return u;
};

const sanitizeEvent = (eventDoc) => {
  const e = eventDoc.toObject ? eventDoc.toObject() : eventDoc;
  // Convert Mongoose Map to plain object for JSON responses
  e.rsvps = e.rsvps instanceof Map ? Object.fromEntries(e.rsvps) : (e.rsvps || {});
  return e;
};

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

// ---------- Auth Routes ----------

// One-time bootstrap: creates the first admin account. Locks itself once an admin exists.
app.post('/api/setup/admin', async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({ message: 'An admin account already exists. This setup route is now disabled.' });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const admin = await User.create({ name, email, password: hashed, role: 'admin' });

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

// ---------- User (Member) Routes — Admin only ----------

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ name: 1 });
    res.json(users.map(sanitizeUser));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, phone, spouse, birthday, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name, email, password: hashed, phone, spouse, birthday,
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
    const { name, email, password, phone, spouse, birthday, role } = req.body;
    const update = { name, email, phone, spouse, birthday, role: role === 'admin' ? 'admin' : 'member' };

    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }

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

// All authenticated users (admin + member) can view events
app.get('/api/events', authenticate, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json(events.map(sanitizeEvent));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.get('/api/events/:id', authenticate, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(sanitizeEvent(event));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Admin only: create, update, delete
app.post('/api/events', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, description, date, location } = req.body;
    if (!title || !date) return res.status(400).json({ message: 'title and date are required' });

    const event = await Event.create({ title, description, date, location, createdBy: req.userId });
    res.status(201).json(sanitizeEvent(event));
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
    res.json(sanitizeEvent(event));
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

// RSVP — any authenticated user sets their own status on an event
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

    res.json(sanitizeEvent(event));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ---------- Announcement Routes ----------

// Anyone logged in (admin or member) can read announcements
app.get('/api/announcements', authenticate, async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).populate('createdBy', 'name');
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Admin only: create, update, delete
app.post('/api/announcements', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'title and body are required' });
    const announcement = await Announcement.create({ title, body, createdBy: req.userId });
    await announcement.populate('createdBy', 'name');
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
    ).populate('createdBy', 'name');
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
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ---------- Health check (useful for Render/uptime pings) ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));