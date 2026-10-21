const mongoose = require('mongoose');

const CATEGORIES = ['General', 'HTML', 'CSS', 'JavaScript', 'Career', 'Lifestyle'];

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, minlength: 3, maxlength: 150 },
    content: { type: String, required: [true, 'Content is required'], trim: true, minlength: 10 },
    category: { type: String, enum: CATEGORIES, default: 'General' },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

blogSchema.index({ createdAt: -1 });

// Shape sent to the frontend
blogSchema.methods.toPublic = function () {
  const a = this.author && this.author.name !== undefined ? this.author : null; // populated?
  return {
    id: this._id.toString(),
    title: this.title,
    content: this.content,
    category: this.category,
    authorId: (a ? a._id : this.author).toString(),
    authorName: a ? a.name : 'Unknown',
    readTime: Math.max(1, Math.ceil(this.content.trim().split(/\s+/).length / 200)),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Blog', blogSchema);
module.exports.CATEGORIES = CATEGORIES;
