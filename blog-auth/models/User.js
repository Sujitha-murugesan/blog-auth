const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: [2, 'Name must be at least 2 characters'], maxlength: [60, 'Name must be 60 characters or fewer'] },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    },
    // select:false => the hash is never returned unless explicitly requested
    password: { type: String, required: true, minlength: 8, select: false },
    bio: { type: String, trim: true, maxlength: [200, 'Bio must be 200 characters or fewer'], default: '' },
    // Incremented on password change / "sign out everywhere" -> invalidates all older JWTs
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    bio: this.bio || '',
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt || null,
  };
};

module.exports = mongoose.model('User', userSchema);
