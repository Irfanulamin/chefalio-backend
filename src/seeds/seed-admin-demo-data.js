/**
 * Populates the admin console with realistic, internally-consistent demo
 * data: members, chefs (+ profiles), recipes, cookbooks, chef applications,
 * cookbook purchases, and recipe interactions (likes/saves).
 *
 * Runs against whatever MONGODB_URI is in .env — confirmed with the team to
 * be a dev cluster, safe to seed directly. Native MongoDB driver, not
 * Mongoose, so timestamps land exactly where each chart's date window
 * expects them (several admin aggregations hard-filter to "last 30 days",
 * so backdated-but-not-*too*-backdated `createdAt` values matter — a flat
 * `new Date()` for everything would bunch every chart's data into a single
 * bar).
 *
 * Usage: node src/seeds/seed-admin-demo-data.js
 */

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const bcrypt = require("bcrypt");
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

// ── Fixed placeholder media — the user will swap these for real assets ──────
const FOOD_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";
const avatar = (n) => `https://i.pravatar.cc/150?img=${n}`;

// ── Name pools ────────────────────────────────────────────────────────────
const MEMBER_NAMES = [
  "Ava Thompson","Liam Carter","Sophia Bennett","Noah Martinez","Isabella Reyes",
  "Ethan Walker","Mia Sanders","Lucas Coleman","Amelia Foster","Mason Price",
  "Harper Wells","Logan Brooks","Ella Simmons","Jack Hughes","Grace Patterson",
  "Henry Ramirez","Chloe Bishop","Owen Fisher","Zoe Grant","Sebastian Hale",
  "Lily Fleming","Nathan Cross","Aria Whitfield","Caleb Dunn","Nora Sutton",
  "Wyatt Pierce","Layla Marsh","Dylan Chambers","Hannah Booth","Ryan Ellison",
];
const CHEF_NAMES = [
  { name: "Marco Alderighi", specialty: "Northern Italian" },
  { name: "Priya Nandakumar", specialty: "South Indian" },
  { name: "Kenji Watanabe", specialty: "Modern Japanese" },
  { name: "Elena Vasquez", specialty: "Latin Fusion" },
  { name: "Samuel Okafor", specialty: "West African" },
  { name: "Camille Laurent", specialty: "French Pastry" },
  { name: "Dmitri Volkov", specialty: "Eastern European" },
  { name: "Fatima Al-Sayed", specialty: "Levantine" },
  { name: "Jonas Berg", specialty: "New Nordic" },
  { name: "Isabella Conti", specialty: "Sicilian Coastal" },
  { name: "Malik Reeves", specialty: "Southern BBQ" },
  { name: "Yuki Tanaka", specialty: "Ramen & Noodles" },
  { name: "Sofia Herrera", specialty: "Mexican Street Food" },
  { name: "Adrian Voss", specialty: "German Comfort" },
  { name: "Nia Adeyemi", specialty: "Plant-Based" },
];

const CUISINE_TAGS = [
  "italian","mexican","japanese","indian","french","vegan","dessert","seafood",
  "bbq","breakfast","quick","healthy","comfort-food","spicy","baking","vegetarian",
  "gluten-free","street-food","soup","salad","grill","holiday","budget","one-pot",
];
const DIFFICULTIES = ["beginner", "intermediate", "advance"];

const DISH_NAMES = [
  "Slow-Braised Short Rib Ragu","Charred Miso Eggplant","Lemon Herb Roast Chicken",
  "Smoky Black Bean Tacos","Truffle Mushroom Risotto","Crispy Skin Salmon with Fennel",
  "Spiced Chickpea Stew","Brown Butter Gnocchi","Harissa Roasted Cauliflower",
  "Coconut Curry Noodle Soup","Grilled Peach & Burrata Salad","Sticky Ginger Pork Ribs",
  "Wild Mushroom Tart","Saffron Seafood Paella","Blistered Shishito Peppers",
  "Roasted Beet & Goat Cheese Salad","Pan-Seared Duck Breast","Charred Corn Elote",
  "Braised Lamb Shanks","Whipped Feta Dip with Chili Oil","Miso Glazed Cod",
  "Smoked Brisket Sandwich","Butternut Squash Galette","Herb-Crusted Rack of Lamb",
  "Spicy Tuna Poke Bowl","Caramelized Onion Tart","Grilled Halloumi Skewers",
  "Sourdough Discard Pancakes","Chili Crisp Dumplings","Roasted Garlic Hummus",
  "Blackened Catfish Po'boy","Ricotta Stuffed Zucchini Blossoms","Five-Spice Braised Pork Belly",
  "Charred Broccolini with Almonds","Pistachio Crusted Rack of Lamb","Tomato Confit Toast",
];

const COOKBOOK_TITLES = [
  "Weeknight Comfort","The Slow Sunday Table","Fire & Smoke: A Grilling Journal",
  "Roots & Greens","Coastal Kitchen Notes","Spice Route Favorites",
  "The Minimalist Pantry","Sunday Bakes","Broths, Stews & Slow Braises",
  "Street Food at Home","The Fermentation Diaries","Feast for Six",
  "Small Plates, Big Flavor","The Weekend Baker","Garden to Table",
];

// ── Utilities ─────────────────────────────────────────────────────────────
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(randInt(0, copy.length - 1), 1)[0]);
  }
  return out;
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(randInt(7, 22), randInt(0, 59), 0, 0);
  return d;
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function uniqueUsername(base, taken) {
  let candidate = slugify(base);
  let i = 1;
  while (taken.has(candidate)) {
    candidate = `${slugify(base)}${i++}`;
  }
  taken.add(candidate);
  return candidate;
}

async function main() {
  const uri = loadEnvUri();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log("Connected to", db.databaseName);

  const usernamesInUse = new Set(
    (await db.collection("users").find({}, { projection: { username: 1 } }).toArray()).map(
      (u) => u.username,
    ),
  );
  const emailsInUse = new Set(
    (await db.collection("users").find({}, { projection: { email: 1 } }).toArray()).map(
      (u) => u.email,
    ),
  );

  const passwordHash = await bcrypt.hash("Chefalio123!", 10);

  // ── 1. Member users ───────────────────────────────────────────────────
  const memberDocs = MEMBER_NAMES.map((fullName, i) => {
    const username = uniqueUsername(fullName, usernamesInUse);
    let email = `${username}@chefalio-demo.com`;
    while (emailsInUse.has(email)) email = `${username}${randInt(1, 999)}@chefalio-demo.com`;
    emailsInUse.add(email);
    return {
      _id: new ObjectId(),
      fullName,
      username,
      email,
      password: passwordHash,
      role: "user",
      profile_url: avatar((i % 70) + 1),
      isActive: Math.random() > 0.08, // a handful inactive, for the filter to have something to show
      authProvider: "local",
      isEmailVerified: true,
      createdAt: daysAgo(randInt(0, 45)),
      updatedAt: new Date(),
    };
  });

  // ── 2. Chef users ─────────────────────────────────────────────────────
  const chefDocs = CHEF_NAMES.map(({ name }, i) => {
    const username = uniqueUsername(name, usernamesInUse);
    let email = `${username}@chefalio-demo.com`;
    while (emailsInUse.has(email)) email = `${username}${randInt(1, 999)}@chefalio-demo.com`;
    emailsInUse.add(email);
    return {
      _id: new ObjectId(),
      fullName: name,
      username,
      email,
      password: passwordHash,
      role: "chef",
      profile_url: avatar(((i + 30) % 70) + 1),
      isActive: Math.random() > 0.05,
      authProvider: "local",
      isEmailVerified: true,
      createdAt: daysAgo(randInt(10, 60)),
      updatedAt: new Date(),
    };
  });

  await db.collection("users").insertMany([...memberDocs, ...chefDocs]);
  console.log(`Inserted ${memberDocs.length} members + ${chefDocs.length} chefs`);

  // ── 3. Chef profiles ──────────────────────────────────────────────────
  const chefProfileDocs = chefDocs.map((chef, i) => ({
    _id: new ObjectId(),
    chefId: chef._id,
    bio: `${CHEF_NAMES[i].specialty} specialist with a focus on seasonal, ingredient-driven cooking.`,
    genres: sample(CUISINE_TAGS, 3),
    achievements: Math.random() > 0.5
      ? [{ title: rand(["Regional Chef of the Year", "James Beard Semifinalist", "Best New Kitchen"]), year: randInt(2019, 2025) }]
      : [],
    createdAt: chef.createdAt,
    updatedAt: new Date(),
  }));
  await db.collection("chefprofiles").insertMany(chefProfileDocs);
  console.log(`Inserted ${chefProfileDocs.length} chef profiles`);

  // ── 4. Recipes — dated within the last 30 days so the admin upload-trend
  //      chart (hard `createdAt >= now-30d` filter) actually has data ─────
  const usedDishNames = new Set();
  const recipeCount = 32;
  const recipeDocs = [];
  for (let i = 0; i < recipeCount; i++) {
    const chef = rand(chefDocs);
    let title = rand(DISH_NAMES);
    let attempt = 0;
    while (usedDishNames.has(title) && attempt++ < 10) title = rand(DISH_NAMES);
    usedDishNames.add(title + i); // allow repeats across chefs, just avoid same-chef dupes in this loop
    const difficulty = rand(DIFFICULTIES);
    recipeDocs.push({
      _id: new ObjectId(),
      title,
      description: `A ${difficulty === "advance" ? "restaurant-caliber" : difficulty === "beginner" ? "simple, approachable" : "weeknight-friendly"} take on ${title.toLowerCase()}, built around seasonal ingredients.`,
      authorId: chef._id,
      ingredients: sample(
        ["olive oil","garlic","kosher salt","black pepper","fresh herbs","lemon","onion","chili flakes","butter","stock"],
        randInt(5, 8),
      ),
      tags: sample(CUISINE_TAGS, randInt(2, 4)),
      instructions: [
        { step: 1, instruction: "Prep all ingredients and bring to room temperature." },
        { step: 2, instruction: "Sear or sauté the base components until golden." },
        { step: 3, instruction: "Combine, season to taste, and simmer until developed." },
        { step: 4, instruction: "Plate and finish with fresh herbs before serving." },
      ],
      difficulty,
      images: [FOOD_IMAGE, FOOD_IMAGE, FOOD_IMAGE],
      lovedCount: 0,
      savedCount: 0,
      createdAt: daysAgo(randInt(0, 29)),
      updatedAt: new Date(),
    });
  }
  await db.collection("recipes").insertMany(recipeDocs);
  console.log(`Inserted ${recipeDocs.length} recipes`);

  // ── 5. Cookbooks ──────────────────────────────────────────────────────
  const cookbookDocs = sample(COOKBOOK_TITLES, COOKBOOK_TITLES.length).map((title) => {
    const chef = rand(chefDocs);
    return {
      _id: new ObjectId(),
      title,
      description: `A curated collection from ${chef.fullName} — recipes built for a real home kitchen.`,
      authorId: chef._id,
      cookbook_image: FOOD_IMAGE,
      price: randInt(12, 45),
      stockCount: randInt(0, 60),
      discount: rand([0, 0, 0, 5, 10, 15]),
      createdAt: daysAgo(randInt(5, 70)),
      updatedAt: new Date(),
    };
  });
  await db.collection("cookbooks").insertMany(cookbookDocs);
  console.log(`Inserted ${cookbookDocs.length} cookbooks`);

  // ── 6. Chef applications — mostly pending, so the review queue has real
  //      work in it (existing data had zero pending) ──────────────────────
  const applicants = sample(memberDocs, 10);
  const KYC_TYPES = ["passport", "nid", "driving_license"];
  const chefApplicationDocs = applicants.map((user, i) => {
    let status = "pending";
    if (i === 8) status = "approved";
    if (i === 9) status = "rejected";
    return {
      _id: new ObjectId(),
      userId: user._id,
      status,
      fullName: user.fullName,
      bio: `Home cook turned aspiring professional, ${randInt(2, 12)} years of hands-on kitchen experience.`,
      specialty: rand(CHEF_NAMES).specialty,
      yearsOfExperience: randInt(2, 15),
      kycType: rand(KYC_TYPES),
      kycDocumentUrl: FOOD_IMAGE,
      referenceUrl: "https://chefalio-demo.com/portfolio",
      achievements: Math.random() > 0.6 ? ["Local Cook-Off Winner"] : [],
      rejectionNote: status === "rejected" ? "Portfolio didn't demonstrate enough professional experience yet." : undefined,
      reviewedAt: status !== "pending" ? daysAgo(randInt(1, 10)) : undefined,
      createdAt: daysAgo(randInt(0, 25)),
      updatedAt: new Date(),
    };
  });
  await db.collection("chefapplications").insertMany(chefApplicationDocs);
  console.log(`Inserted ${chefApplicationDocs.length} chef applications (${chefApplicationDocs.filter(a=>a.status==="pending").length} pending)`);

  // ── 7. Cookbook purchases — recent dates, realistic status mix ─────────
  const existingCookbooks = await db.collection("cookbooks").find({}).limit(50).toArray();
  const allCookbooksForPurchase = [...cookbookDocs, ...existingCookbooks];
  const allBuyers = [...memberDocs, ...chefDocs];
  const STATUS_WEIGHTS = [
    ["paid", 60], ["pending", 12], ["failed", 8], ["shipped", 12], ["delivered", 8],
  ];
  function weightedStatus() {
    const total = STATUS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [status, w] of STATUS_WEIGHTS) {
      if (r < w) return status;
      r -= w;
    }
    return "paid";
  }
  const purchaseCount = 65;
  const purchaseDocs = [];
  for (let i = 0; i < purchaseCount; i++) {
    const cookbook = rand(allCookbooksForPurchase);
    const buyer = rand(allBuyers);
    const price = cookbook.price ?? randInt(12, 45);
    purchaseDocs.push({
      _id: new ObjectId(),
      cookbookId: cookbook._id,
      buyerId: buyer._id,
      cookbookTitle: cookbook.title,
      chefId: cookbook.authorId,
      cookbookImage: cookbook.cookbook_image ?? FOOD_IMAGE,
      price,
      stripeSessionId: `seed_sess_${new ObjectId().toString()}`,
      paymentStatus: weightedStatus(),
      billingAddress: {
        name: buyer.fullName,
        address: `${randInt(10, 999)} ${rand(["Maple St", "Oak Ave", "5th Ave", "Sunset Blvd", "Elm St"])}`,
        city: rand(["Austin", "Portland", "Denver", "Chicago", "Brooklyn", "Seattle"]),
        state: rand(["TX", "OR", "CO", "IL", "NY", "WA"]),
        postalCode: String(randInt(10000, 99999)),
        country: "USA",
      },
      receiptEmail: buyer.email,
      createdAt: daysAgo(randInt(0, 35)),
      updatedAt: new Date(),
    });
  }
  await db.collection("cookbookpurchases").insertMany(purchaseDocs);
  console.log(`Inserted ${purchaseDocs.length} cookbook purchases`);

  // ── 8. Recipe interactions (likes/saves) ───────────────────────────────
  const existingRecipes = await db.collection("recipes").find({}).limit(60).toArray();
  const allRecipesForInteraction = [...recipeDocs, ...existingRecipes];
  const seenPairs = new Set();
  const interactionDocs = [];
  const interactionCount = 220;
  let attempts = 0;
  while (interactionDocs.length < interactionCount && attempts < interactionCount * 4) {
    attempts++;
    const user = rand(allBuyers);
    const recipe = rand(allRecipesForInteraction);
    const key = `${user._id}:${recipe._id}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const isLoved = Math.random() > 0.35;
    const isSaved = Math.random() > 0.5;
    if (!isLoved && !isSaved) continue;
    const when = daysAgo(randInt(0, 40));
    interactionDocs.push({
      _id: new ObjectId(),
      userId: user._id,
      recipeId: recipe._id,
      isSaved,
      isLoved,
      savedAt: isSaved ? when : null,
      lovedAt: isLoved ? when : null,
      createdAt: when,
      updatedAt: when,
    });
  }
  await db.collection("recipeinteractions").insertMany(interactionDocs);
  console.log(`Inserted ${interactionDocs.length} recipe interactions`);

  // ── 9. Resync denormalized lovedCount/savedCount from ALL interactions
  //      (existing + seeded) so the recipe cards and analytics agree ──────
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
  if (bulkOps.length) {
    await db.collection("recipes").bulkWrite(bulkOps);
  }
  console.log(`Resynced loved/saved counts on ${bulkOps.length} recipes`);

  console.log("\nDone. Seed login password for all new demo accounts: Chefalio123!");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
