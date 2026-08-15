/**
 * Three fixed, memorable demo accounts — one per role — for anyone
 * reviewing the project to log straight in without registering. Upserts by
 * email, so re-running this after the account already exists just resets
 * the password hash and role instead of failing on the unique index.
 *
 * Usage: node src/seeds/seed-demo-accounts.js
 */

const mongoose = require("mongoose");
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

// Same demo password already used by seed-admin-demo-data.js, so anyone who
// has poked at the other seeded accounts doesn't need a second password to
// remember for these three.
const DEMO_PASSWORD = "Chefalio123!";

const DEMO_ACCOUNTS = [
  {
    fullName: "Demo User",
    username: "demouser",
    email: "user@chefalio-demo.com",
    role: "user",
  },
  {
    fullName: "Demo Chef",
    username: "demochef",
    email: "chef@chefalio-demo.com",
    role: "chef",
  },
  {
    fullName: "Demo Admin",
    username: "demoadmin",
    email: "admin@chefalio-demo.com",
    role: "admin",
  },
];

async function main() {
  const uri = loadEnvUri();
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log("Connected to", db.databaseName);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date();

  const userIds = {};

  for (const account of DEMO_ACCOUNTS) {
    const result = await db.collection("users").findOneAndUpdate(
      { email: account.email },
      {
        $set: {
          fullName: account.fullName,
          username: account.username,
          email: account.email,
          password: passwordHash,
          role: account.role,
          isActive: true,
          authProvider: "local",
          isEmailVerified: true,
          // Read from server-side by DemoReadOnlyGuard, which blocks every
          // non-GET request from an account carrying this flag — these
          // credentials are published in the sign-in UI, so this is what
          // keeps all three accounts (including their own profile/settings)
          // fixed for the next visitor instead of drifting.
          isDemo: true,
          updatedAt: now,
        },
        $setOnInsert: {
          profile_url:
            "https://i.ibb.co.com/XWqvgyv/Minimalist-Avatar-Illustration.jpg",
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    userIds[account.role] = result.value ?? result._id;
    console.log(`Upserted ${account.role} demo account: ${account.email}`);
  }

  // The chef demo account needs a ChefProfile doc — the chef dashboard and
  // public chef page both read from it, and it isn't created automatically
  // by inserting a `users` row with role "chef".
  const chefUser = await db
    .collection("users")
    .findOne({ email: "chef@chefalio-demo.com" });

  if (chefUser) {
    await db.collection("chefprofiles").updateOne(
      { chefId: chefUser._id },
      {
        $set: {
          chefId: chefUser._id,
          bio: "Demo chef account for exploring the chef dashboard and studio tools.",
          genres: ["comfort-food", "italian"],
          updatedAt: now,
        },
        $setOnInsert: { achievements: [], createdAt: now },
      },
      { upsert: true },
    );
    console.log("Upserted chef profile for demo chef");
  }

  console.log("\nDemo credentials (same password for all three):");
  for (const account of DEMO_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(6)} ${account.email}`);
  }
  console.log(`  password: ${DEMO_PASSWORD}`);
}

main()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error(err);
    return mongoose.disconnect().finally(() => process.exit(1));
  });
