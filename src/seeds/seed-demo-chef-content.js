/**
 * Gives the seeded demo chef (chef@chefalio-demo.com) something to look at
 * in their own dashboard/analytics/studio pages — recipes, a cookbook, and
 * a few paid orders. Public recipe/cookbook/chef listings already exclude
 * `isDemo` authors (see recipe.service.ts, cookbook.service.ts,
 * chef.service.ts), so none of this leaks into what a real visitor browses
 * — it only shows up when signed in as the demo chef itself.
 *
 * The buyer on every seeded order is the demo *user* account, never a real
 * registered user — the DB already has real people in it, and attaching a
 * fabricated purchase to a real person's email would be wrong regardless
 * of how harmless it looks.
 *
 * Usage: node src/seeds/seed-demo-chef-content.js
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

const FOOD_IMAGES = [
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80",
];

const RECIPES = [
  {
    title: "Slow-Braised Short Rib Ragu",
    difficulty: "intermediate",
    tags: ["italian", "comfort-food", "dinner"],
    loveTarget: 45,
    saveTarget: 30,
  },
  {
    title: "Charred Miso Eggplant",
    difficulty: "beginner",
    tags: ["vegan", "japanese", "quick"],
    loveTarget: 28,
    saveTarget: 19,
  },
  {
    title: "Herb-Crusted Rack of Lamb",
    difficulty: "advance",
    tags: ["dinner", "holiday"],
    loveTarget: 62,
    saveTarget: 41,
  },
  {
    title: "Brown Butter Gnocchi",
    difficulty: "intermediate",
    tags: ["italian", "vegetarian"],
    loveTarget: 24,
    saveTarget: 17,
  },
  {
    title: "Spiced Chickpea Stew",
    difficulty: "beginner",
    tags: ["vegan", "budget", "soup"],
    loveTarget: 19,
    saveTarget: 13,
  },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(Math.floor(Math.random() * 16) + 7, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

const COOKBOOK = {
  title: "Weeknight Comfort",
  description:
    "Twenty-five recipes built around one idea: real cooking on a weeknight, without the hour-long ingredient list.",
  price: 14.99,
  stockCount: 500,
  discount: 0,
};

async function main() {
  const uri = loadEnvUri();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log("Connected to", db.databaseName);

  const chef = await db.collection("users").findOne({ email: "chef@chefalio-demo.com" });
  const demoUser = await db.collection("users").findOne({ email: "user@chefalio-demo.com" });
  if (!chef || !demoUser) {
    throw new Error("Run seed-demo-accounts.js first — demo chef/user not found.");
  }

  // ── Recipes ─────────────────────────────────────────────────────────────
  await db.collection("recipes").deleteMany({ authorId: chef._id });
  const recipeDocs = RECIPES.map((r, i) => ({
    _id: new ObjectId(),
    title: r.title,
    description: `${r.title} — a demo-catalogue recipe for exploring the chef dashboard.`,
    authorId: chef._id,
    ingredients: ["Ingredient one", "Ingredient two", "Ingredient three"],
    tags: r.tags,
    instructions: [
      { step: 1, instruction: "Prep the ingredients." },
      { step: 2, instruction: "Cook as described." },
      { step: 3, instruction: "Plate and serve." },
    ],
    difficulty: r.difficulty,
    images: [FOOD_IMAGES[i % FOOD_IMAGES.length], FOOD_IMAGES[(i + 1) % FOOD_IMAGES.length], FOOD_IMAGES[(i + 2) % FOOD_IMAGES.length]],
    // Set below, from the actual interaction rows — see the reconciliation
    // pass. A raw counter that disagrees with the interaction data behind
    // it would show different numbers on the dashboard vs. analytics for
    // the same recipe.
    lovedCount: 0,
    savedCount: 0,
    createdAt: new Date(Date.now() - (RECIPES.length - i) * 3 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  }));
  await db.collection("recipes").insertMany(recipeDocs);
  console.log(`Inserted ${recipeDocs.length} recipes for demo chef`);

  // ── Recipe interactions ───────────────────────────────────────────────
  //
  // The chef analytics page's engagement section aggregates from this
  // collection, not from Recipe.lovedCount/savedCount — a recipe with zero
  // interaction rows shows zero engagement there regardless of what the
  // counter says. Each "engager" is a fabricated ObjectId, not a real
  // registered user — it never resolves to an actual person even if
  // looked up, since nothing in the analytics pipeline populates the user
  // beyond counting distinct IDs.
  await db.collection("recipeinteractions").deleteMany({ recipeId: { $in: recipeDocs.map((r) => r._id) } });

  const interactionDocs = [];
  recipeDocs.forEach((recipe, i) => {
    const { loveTarget, saveTarget } = RECIPES[i];
    const poolSize = Math.max(loveTarget, saveTarget) + Math.floor(Math.min(loveTarget, saveTarget) * 0.3);
    const engagerIds = Array.from({ length: poolSize }, () => new ObjectId());

    // Loves fill from the front of the pool, saves from the back — so
    // there's a realistic overlap (people who loved it also saved it)
    // without every engager doing both.
    const lovedSet = new Set(engagerIds.slice(0, loveTarget).map(String));
    const savedSet = new Set(engagerIds.slice(poolSize - saveTarget).map(String));

    for (const id of engagerIds) {
      const isLoved = lovedSet.has(String(id));
      const isSaved = savedSet.has(String(id));
      if (!isLoved && !isSaved) continue;
      const when = daysAgo(Math.floor(Math.random() * 28));
      interactionDocs.push({
        _id: new ObjectId(),
        userId: id,
        recipeId: recipe._id,
        isLoved,
        isSaved,
        lovedAt: isLoved ? when : null,
        savedAt: isSaved ? when : null,
        createdAt: when,
        updatedAt: when,
      });
    }
  });
  // One interaction from the demo user account itself too, so poking around
  // as "user@chefalio-demo.com" shows a saved/loved recipe in its own
  // library rather than an empty one. Pushed in before reconciliation so
  // the recipe's counters include it.
  await db.collection("recipeinteractions").deleteOne({ userId: demoUser._id, recipeId: recipeDocs[0]._id });
  interactionDocs.push({
    _id: new ObjectId(),
    userId: demoUser._id,
    recipeId: recipeDocs[0]._id,
    isSaved: true,
    isLoved: true,
    savedAt: new Date(),
    lovedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.collection("recipeinteractions").insertMany(interactionDocs);
  console.log(`Inserted ${interactionDocs.length} recipe interactions across ${recipeDocs.length} recipes`);

  // Reconcile each recipe's raw counters to match its actual interactions.
  for (const recipe of recipeDocs) {
    const lovedCount = interactionDocs.filter((d) => String(d.recipeId) === String(recipe._id) && d.isLoved).length;
    const savedCount = interactionDocs.filter((d) => String(d.recipeId) === String(recipe._id) && d.isSaved).length;
    await db.collection("recipes").updateOne({ _id: recipe._id }, { $set: { lovedCount, savedCount } });
  }

  // ── Cookbook ────────────────────────────────────────────────────────────
  // Predates every order below by a comfortable margin — a cookbook can't
  // sell before it exists.
  await db.collection("cookbooks").deleteMany({ authorId: chef._id });
  const cookbookDoc = {
    _id: new ObjectId(),
    title: COOKBOOK.title,
    description: COOKBOOK.description,
    authorId: chef._id,
    cookbook_image: FOOD_IMAGES[0],
    price: COOKBOOK.price,
    stockCount: COOKBOOK.stockCount,
    discount: COOKBOOK.discount,
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  };
  await db.collection("cookbooks").insertOne(cookbookDoc);
  console.log("Inserted 1 cookbook for demo chef");

  // ── Orders ───────────────────────────────────────────────────────────
  //
  // Spread across the last 30 days rather than one order every few days —
  // the analytics page's "Orders per day" / "Revenue over time" charts
  // default to a 30-day window, and the daily/weekly period tabs need
  // several distinct days to have something in them at all. Weighted
  // toward the last two weeks so the trend reads as growth, not noise.
  await db.collection("cookbookpurchases").deleteMany({ chefId: chef._id });
  const orderDocs = [];
  let sessionCounter = 0;
  for (let daysBack = 29; daysBack >= 0; daysBack--) {
    const recency = 1 - daysBack / 29; // 0 (oldest) → 1 (today)
    const ordersToday = Math.random() < 0.25 + recency * 0.45 ? (Math.random() < 0.25 ? 2 : 1) : 0;
    for (let k = 0; k < ordersToday; k++) {
      orderDocs.push({
        _id: new ObjectId(),
        cookbookId: cookbookDoc._id,
        buyerId: demoUser._id,
        cookbookTitle: cookbookDoc.title,
        chefId: chef._id,
        cookbookImage: cookbookDoc.cookbook_image,
        price: COOKBOOK.price,
        stripeSessionId: `demo_seed_session_${sessionCounter++}_${Date.now()}`,
        paymentStatus: "paid",
        receiptEmail: demoUser.email,
        createdAt: daysAgo(daysBack),
        updatedAt: new Date(),
      });
    }
  }
  await db.collection("cookbookpurchases").insertMany(orderDocs);
  console.log(`Inserted ${orderDocs.length} orders for demo chef, spread over 30 days`);

  console.log("\nDemo chef now has recipes, a cookbook, and orders to show in its own dashboard.");
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error(err);
    return mongoose.disconnect().finally(() => process.exit(1));
  });
