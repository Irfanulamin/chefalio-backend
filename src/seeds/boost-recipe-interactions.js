/**
 * Tops up every recipe's loved/saved counts to a healthy, distinct-per-metric
 * range (each recipe lands somewhere in the 20s–40s for loves, a separately
 * randomized 20s–30s for saves, deliberately not equal to each other) so the
 * admin dashboard's engagement charts and each recipe's own counters read as
 * an active platform rather than a handful of test clicks.
 *
 * Additive only — never deletes or overwrites an existing interaction doc,
 * just fills the gap with new users who haven't interacted with that recipe
 * yet, then resyncs the denormalized Recipe.lovedCount/savedCount fields.
 *
 * Usage: node src/seeds/boost-recipe-interactions.js
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
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randInt(7, 22), randInt(0, 59), 0, 0);
  return d;
}

async function main() {
  const uri = loadEnvUri();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log("Connected to", db.databaseName);

  const users = await db.collection("users").find({}, { projection: { _id: 1 } }).toArray();
  const userIds = users.map((u) => u._id.toString());
  const recipes = await db
    .collection("recipes")
    .find({}, { projection: { _id: 1, authorId: 1, title: 1 } })
    .toArray();

  const currentCounts = await db
    .collection("recipeinteractions")
    .aggregate([
      {
        $group: {
          _id: "$recipeId",
          loved: { $sum: { $cond: ["$isLoved", 1, 0] } },
          saved: { $sum: { $cond: ["$isSaved", 1, 0] } },
          userIds: { $push: "$userId" },
        },
      },
    ])
    .toArray();
  const countsByRecipe = new Map(currentCounts.map((c) => [c._id.toString(), c]));

  let totalNewDocs = 0;
  const insertOps = [];

  for (const recipe of recipes) {
    const key = recipe._id.toString();
    const existing = countsByRecipe.get(key);
    const currentLoved = existing?.loved ?? 0;
    const currentSaved = existing?.saved ?? 0;
    const alreadyInteracted = new Set(
      (existing?.userIds ?? []).map((id) => id.toString()),
    );
    if (recipe.authorId) alreadyInteracted.add(recipe.authorId.toString());

    // Distinct-per-metric targets: loves skew a bit higher than saves, both
    // comfortably past the 20 floor, and never equal to each other.
    let targetLoved = randInt(24, 42);
    let targetSaved = randInt(20, 36);
    if (targetLoved === targetSaved) targetSaved = Math.max(20, targetSaved - randInt(4, 8));

    const loveAddNeeded = Math.max(0, targetLoved - currentLoved);
    const saveAddNeeded = Math.max(0, targetSaved - currentSaved);
    if (loveAddNeeded === 0 && saveAddNeeded === 0) continue;

    const candidatePool = shuffle(userIds.filter((id) => !alreadyInteracted.has(id)));
    const loveRecipients = new Set(candidatePool.slice(0, loveAddNeeded));
    const saveRecipients = new Set(shuffle(candidatePool).slice(0, saveAddNeeded));

    const perUser = new Map();
    for (const id of loveRecipients) perUser.set(id, { isLoved: true, isSaved: false });
    for (const id of saveRecipients) {
      const prev = perUser.get(id) ?? { isLoved: false, isSaved: false };
      perUser.set(id, { ...prev, isSaved: true });
    }

    for (const [userId, flags] of perUser) {
      const when = daysAgo(randInt(0, 35));
      insertOps.push({
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        recipeId: recipe._id,
        isSaved: flags.isSaved,
        isLoved: flags.isLoved,
        savedAt: flags.isSaved ? when : null,
        lovedAt: flags.isLoved ? when : null,
        createdAt: when,
        updatedAt: when,
      });
    }
    totalNewDocs += perUser.size;
  }

  if (insertOps.length) {
    // Chunk the insert — a single insertMany of several thousand docs is
    // fine for Atlas, but chunking keeps any single request well under the
    // driver's default batch/message-size limits.
    const CHUNK = 1000;
    for (let i = 0; i < insertOps.length; i += CHUNK) {
      await db.collection("recipeinteractions").insertMany(insertOps.slice(i, i + CHUNK));
    }
  }
  console.log(`Inserted ${totalNewDocs} new interaction docs across ${recipes.length} recipes`);

  // Resync denormalized counts from the full, now-topped-up interaction set.
  const counts = await db
    .collection("recipeinteractions")
    .aggregate([
      {
        $group: {
          _id: "$recipeId",
          loved: { $sum: { $cond: ["$isLoved", 1, 0] } },
          saved: { $sum: { $cond: ["$isSaved", 1, 0] } },
        },
      },
    ])
    .toArray();
  const bulkOps = counts.map((c) => ({
    updateOne: {
      filter: { _id: c._id },
      update: { $set: { lovedCount: c.loved, savedCount: c.saved } },
    },
  }));
  if (bulkOps.length) await db.collection("recipes").bulkWrite(bulkOps);
  console.log(`Resynced loved/saved counts on ${bulkOps.length} recipes`);

  const sample = await db
    .collection("recipes")
    .find({}, { projection: { title: 1, lovedCount: 1, savedCount: 1 } })
    .limit(8)
    .toArray();
  console.table(sample.map((r) => ({ title: r.title, loved: r.lovedCount, saved: r.savedCount })));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
