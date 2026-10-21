const express = require('express');
const mongoose = require('mongoose');
const Blog = require('../models/Blog');
const auth = require('../middleware/auth');

const router = express.Router();
const str = (v) => (typeof v === 'string' ? v : '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title: { title: 1 },
};

// Reject malformed ids with a clean 400 instead of a Mongoose CastError
function validId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid blog id.' });
  next();
}

// Build the Mongo filter from ?search= & ?category=
function buildFilter(query, base = {}) {
  const filter = { ...base };
  const search = str(query.search).trim();
  const category = str(query.category).trim();
  if (category && Blog.CATEGORIES.includes(category)) filter.category = category;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { content: rx }];
  }
  return filter;
}
const sortOf = (query) => SORTS[str(query.sort)] || SORTS.newest;

/* ----------------------------- READ ----------------------------- */

// GET /api/blogs/categories  -> every category with its blog count (public)
router.get('/categories', async (req, res, next) => {
  try {
    const rows = await Blog.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
    const counts = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    const categories = Blog.CATEGORIES.map((name) => ({ name, count: counts[name] || 0 }));
    res.json({ categories, total: categories.reduce((n, c) => n + c.count, 0) });
  } catch (err) {
    next(err);
  }
});

// GET /api/blogs?search=&category=&sort=newest|oldest|title&page=1&limit=9  (public)
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 9, 1), 50);
    const filter = buildFilter(req.query);

    const [total, blogs] = await Promise.all([
      Blog.countDocuments(filter),
      Blog.find(filter)
        .collation({ locale: 'en' })
        .sort(sortOf(req.query))
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'name'),
    ]);

    res.json({ blogs: blogs.map((b) => b.toPublic()), page, pages: Math.max(Math.ceil(total / limit), 1), total });
  } catch (err) {
    next(err);
  }
});

// GET /api/blogs/mine?search=&category=&sort=  (protected) - declared before /:id
router.get('/mine', auth, async (req, res, next) => {
  try {
    const filter = buildFilter(req.query, { author: req.user._id });
    const blogs = await Blog.find(filter).collation({ locale: 'en' }).sort(sortOf(req.query)).populate('author', 'name');
    res.json({ blogs: blogs.map((b) => b.toPublic()), total: blogs.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/blogs/:id  (public)
router.get('/:id', validId, async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id).populate('author', 'name');
    if (!blog) return res.status(404).json({ message: 'Blog not found.' });
    res.json({ blog: blog.toPublic() });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- CREATE ---------------------------- */

// POST /api/blogs  (protected)
router.post('/', auth, async (req, res, next) => {
  try {
    const blog = await Blog.create({
      title: str(req.body.title),
      content: str(req.body.content),
      category: str(req.body.category) || 'General',
      author: req.user._id,
    });
    await blog.populate('author', 'name');
    res.status(201).json({ message: 'Blog created successfully.', blog: blog.toPublic() });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- UPDATE ---------------------------- */

// PUT /api/blogs/:id  (protected, owner only) - also accepts partial bodies
router.put('/:id', auth, validId, async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: 'Blog not found.' });
    if (!blog.author.equals(req.user._id)) return res.status(403).json({ message: 'You can only edit your own posts.' });

    if (req.body.title !== undefined) blog.title = str(req.body.title);
    if (req.body.content !== undefined) blog.content = str(req.body.content);
    if (req.body.category !== undefined) blog.category = str(req.body.category);
    await blog.save(); // runs schema validation
    await blog.populate('author', 'name');
    res.json({ message: 'Blog updated successfully.', blog: blog.toPublic() });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- DELETE ---------------------------- */

// DELETE /api/blogs/:id  (protected, owner only)
router.delete('/:id', auth, validId, async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: 'Blog not found.' });
    if (!blog.author.equals(req.user._id)) return res.status(403).json({ message: 'You can only delete your own posts.' });
    await blog.deleteOne();
    res.json({ message: 'Blog deleted successfully.', id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
