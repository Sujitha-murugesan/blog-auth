// Usage: npm run seed  -> creates a demo user and 3 sample blogs
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Blog = require('../models/Blog');

(async () => {
  await connectDB();
  let user = await User.findOne({ email: 'demo@blogapp.com' });
  if (!user) user = await User.create({ name: 'Demo User', email: 'demo@blogapp.com', password: 'demo1234' });

  if ((await Blog.countDocuments({ author: user._id })) === 0) {
    await Blog.insertMany([
      { title: 'Welcome to BlogApp', category: 'General', author: user._id,
        content: 'This post is stored in MongoDB. Register an account, open your dashboard and write your own posts.\n\nEvery blog you see here is fetched from the database through the REST API.' },
      { title: 'JavaScript basics every beginner should know', category: 'JavaScript', author: user._id,
        content: 'Start with variables, functions, arrays and objects.\n\nThen learn the DOM and events, and finally asynchronous code with promises and async/await.' },
      { title: 'Getting started with responsive design', category: 'CSS', author: user._id,
        content: 'Design mobile-first, use flexible units, and let CSS Grid rearrange cards with auto-fill and minmax.\n\nAdd media queries only where the layout truly needs to change.' },
    ]);
  }
  console.log('Seed complete. Demo login: demo@blogapp.com / demo1234');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
