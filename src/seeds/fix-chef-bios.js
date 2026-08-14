/**
 * Fixes chef bios in two passes:
 *
 * 1. Dedupe: some chefs ended up with two `chefprofiles` docs for the same
 *    chefId (one real, one a generic boilerplate placeholder inserted at
 *    some earlier point, e.g. chef-application approval). `findOne` on a
 *    duplicated key returns whichever Mongo happens to pick, so the same
 *    chef could show a real bio one query and boilerplate the next. Keeps
 *    the richer doc (has achievements, or a non-boilerplate bio), deletes
 *    the rest.
 * 2. Replace: the boilerplate bio ("Passionate chef dedicated to sharing
 *    culinary expertise...") reads as "no bio" to a user because it's
 *    identical across every chef that has it. Treats that exact string
 *    the same as a missing bio and replaces it with a real templated one,
 *    same templates used for `seed-follows-and-bios.js`.
 *
 * Usage: node src/seeds/fix-chef-bios.js
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

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

const BOILERPLATE_BIO =
  "Passionate chef dedicated to sharing culinary expertise and inspiring home cooks through creative, flavour-forward recipes.";

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

  const chefs = await db
    .collection("users")
    .find({ role: "chef", isActive: true })
    .project({ fullName: 1, username: 1 })
    .toArray();
  const chefById = new Map(chefs.map((c) => [String(c._id), c]));

  // ── 1. Dedupe ────────────────────────────────────────────────────────────
  const allProfiles = await db.collection("chefprofiles").find({}).toArray();
  const byChef = new Map();
  for (const p of allProfiles) {
    const key = String(p.chefId);
    if (!byChef.has(key)) byChef.set(key, []);
    byChef.get(key).push(p);
  }

  let deduped = 0;
  for (const [chefIdStr, docs] of byChef) {
    if (docs.length <= 1) continue;
    // Prefer: has achievements > non-boilerplate bio > longer bio > oldest.
    const score = (d) =>
      (d.achievements?.length ? 1000 : 0) +
      (d.bio && d.bio !== BOILERPLATE_BIO ? 100 : 0) +
      (d.bio?.length ?? 0);
    const sorted = [...docs].sort((a, b) => score(b) - score(a));
    const keep = sorted[0];
    const drop = sorted.slice(1);
    await db.collection("chefprofiles").deleteMany({
      _id: { $in: drop.map((d) => d._id) },
    });
    deduped += drop.length;
    const chef = chefById.get(chefIdStr);
    console.log(
      `Deduped ${chef ? chef.username : chefIdStr}: kept ${keep._id}, dropped ${drop.length}`,
    );
  }
  console.log(`Dropped ${deduped} duplicate profile doc(s)`);

  // ── 2. Replace boilerplate bios with real ones ──────────────────────────
  const profilesAfterDedupe = await db.collection("chefprofiles").find({}).toArray();
  let replaced = 0;
  for (const profile of profilesAfterDedupe) {
    const chef = chefById.get(String(profile.chefId));
    if (!chef) continue;
    if (profile.bio && profile.bio !== BOILERPLATE_BIO) continue;

    const specialty = rand(SPECIALTIES);
    const bio = rand(BIO_TEMPLATES)(chef.fullName.split(" ")[0], specialty.toLowerCase());
    const update = { bio, updatedAt: new Date() };
    if (!profile.genres?.length) update.genres = [specialty];

    await db.collection("chefprofiles").updateOne(
      { _id: profile._id },
      { $set: update },
    );
    replaced++;
  }
  console.log(`Replaced boilerplate bio for ${replaced} chef(s)`);

  // ── 3. Enforce the unique index so duplicates can't recur ───────────────
  try {
    await db.collection("chefprofiles").createIndex({ chefId: 1 }, { unique: true });
    console.log("Unique index on chefId confirmed");
  } catch (err) {
    console.error("Failed to create unique index (duplicates may remain):", err.message);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
