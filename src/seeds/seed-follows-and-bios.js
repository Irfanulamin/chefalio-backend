/**
 * Tops up any chef missing a bio, and seeds realistic Follow relationships
 * so the follow feature and its notification gating have real data to
 * demo against — some chefs popular, some barely followed, the way a real
 * platform's distribution actually looks (a handful of chefs pull most of
 * the follows, most sit in a long tail).
 *
 * Additive only: never overwrites an existing bio, never deletes a follow.
 *
 * Usage: node src/seeds/seed-follows-and-bios.js
 */

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const fs = require("fs");
const path = require("path");

function loadEnvUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envPath = path.join(__dirname, "..", "..", ".env");
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/MONGODB_URI=(.*)/);
  if (!match) throw new Error("MONGODB_URI not found in .env");
  return match[1].trim();
}

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const BIO_TEMPLATES = [
  (name, specialty) =>
    `${name} has spent a career chasing the exact version of ${specialty || "the dish"} that made them fall in love with cooking in the first place — seasonal, ingredient-first, and never over-plated.`,
  (name, specialty) =>
    `Trained in classical technique and unafraid to break from it, ${name} builds every menu around what's actually good that week rather than what's expected.`,
  (name) =>
    `${name} believes the best meals are the ones that don't try too hard — clean flavors, honest technique, and a plate that respects the ingredient more than the trend.`,
  (name, specialty) =>
    `Known for a ${specialty || "distinctive"} style built over a decade in professional kitchens, ${name} now shares that same discipline with home cooks here on Chefalio.`,
  (name) =>
    `${name} cooks the way they were taught to eat: with patience, a heavy hand on seasoning, and zero interest in shortcuts that cost flavor.`,
];

const SPECIALTIES = [
  "Northern Italian", "South Indian", "Modern Japanese", "Latin Fusion",
  "West African", "French Pastry", "Southern BBQ", "Ramen & Noodles",
  "Mexican Street Food", "Plant-Based", "New Nordic", "Levantine",
];

async function main() {
  const uri = loadEnvUri();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log("Connected to", db.databaseName);

  // ── 1. Top up missing bios ──────────────────────────────────────────────
  const chefs = await db
    .collection("users")
    .find({ role: "chef", isActive: true })
    .project({ fullName: 1, username: 1 })
    .toArray();
  const existingProfiles = await db.collection("chefprofiles").find({}).toArray();
  const profileByChef = new Map(existingProfiles.map((p) => [String(p.chefId), p]));

  let biosFilled = 0;
  for (const chef of chefs) {
    const existing = profileByChef.get(String(chef._id));
    if (existing?.bio) continue;

    const specialty = rand(SPECIALTIES);
    const bio = rand(BIO_TEMPLATES)(chef.fullName.split(" ")[0], specialty.toLowerCase());

    if (existing) {
      await db.collection("chefprofiles").updateOne(
        { _id: existing._id },
        { $set: { bio, updatedAt: new Date() }, $setOnInsert: {} },
      );
    } else {
      await db.collection("chefprofiles").insertOne({
        _id: new ObjectId(),
        chefId: chef._id,
        bio,
        genres: [specialty],
        achievements: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    biosFilled++;
  }
  console.log(`Filled bio for ${biosFilled} chef(s)`);

  // ── 2. Seed realistic follow relationships ──────────────────────────────
  const allUsers = await db
    .collection("users")
    .find({ isActive: true })
    .project({ _id: 1 })
    .toArray();
  const allUserIds = allUsers.map((u) => u._id.toString());

  const existingFollows = await db.collection("follows").find({}).toArray();
  const existingPairs = new Set(
    existingFollows.map((f) => `${f.followerId}:${f.chefId}`),
  );

  const followDocs = [];
  for (const chef of chefs) {
    const chefIdStr = chef._id.toString();
    // Popularity skew: most chefs get a modest following, a few "break out".
    const isPopular = Math.random() < 0.25;
    const targetFollowers = isPopular ? randInt(30, 65) : randInt(3, 22);

    const candidates = shuffle(allUserIds.filter((id) => id !== chefIdStr));
    let added = 0;
    for (const followerId of candidates) {
      if (added >= targetFollowers) break;
      const key = `${followerId}:${chefIdStr}`;
      if (existingPairs.has(key)) continue;
      existingPairs.add(key);
      followDocs.push({
        _id: new ObjectId(),
        followerId: new ObjectId(followerId),
        chefId: chef._id,
        createdAt: new Date(Date.now() - randInt(0, 60) * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });
      added++;
    }
  }

  if (followDocs.length) {
    const CHUNK = 1000;
    for (let i = 0; i < followDocs.length; i += CHUNK) {
      await db.collection("follows").insertMany(followDocs.slice(i, i + CHUNK));
    }
  }
  console.log(`Inserted ${followDocs.length} follow relationships across ${chefs.length} chefs`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
