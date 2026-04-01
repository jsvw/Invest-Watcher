import pg from "pg";

const { Client } = pg;

const TABLES_REVERSE_ORDER = [
  "trading212_dividends",
  "trading212_holdings",
  "dashboard_filters",
  "email_imports",
  "email_settings",
  "scraper_configs",
  "asset_repayments",
  "asset_valuations",
  "assets",
  "valuations",
  "withdrawals",
  "investments",
  "platforms",
  "users",
];

const TABLES_FORWARD_ORDER = [...TABLES_REVERSE_ORDER].reverse();

const SEQUENCE_MAP: Record<string, string> = {
  users: "users_id_seq",
  platforms: "platforms_id_seq",
  investments: "investments_id_seq",
  withdrawals: "withdrawals_id_seq",
  valuations: "valuations_id_seq",
  assets: "assets_id_seq",
  asset_valuations: "asset_valuations_id_seq",
  asset_repayments: "asset_repayments_id_seq",
  email_settings: "email_settings_id_seq",
  email_imports: "email_imports_id_seq",
  scraper_configs: "scraper_configs_id_seq",
  trading212_holdings: "trading212_holdings_id_seq",
  trading212_dividends: "trading212_dividends_id_seq",
  dashboard_filters: "dashboard_filters_id_seq",
};

async function main() {
  const devUrl = process.env.DATABASE_URL;
  const prodUrl = process.env.PROD_DATABASE_URL;

  if (!prodUrl) {
    console.error("ERROR: PROD_DATABASE_URL is not set. Exiting.");
    process.exit(1);
  }

  if (!devUrl) {
    console.error("ERROR: DATABASE_URL is not set. Exiting.");
    process.exit(1);
  }

  console.log("Connecting to production and development databases...");

  const prodClient = new Client({ connectionString: prodUrl });
  const devClient = new Client({ connectionString: devUrl });

  await prodClient.connect();
  await devClient.connect();

  console.log("Connected.\n");

  try {
    console.log("Reading all data from production...");
    const prodData: Record<string, Record<string, unknown>[]> = {};
    for (const table of TABLES_FORWARD_ORDER) {
      const { rows } = await prodClient.query(`SELECT * FROM "${table}" ORDER BY id`);
      prodData[table] = rows;
      console.log(`  ${table}: ${rows.length} rows fetched`);
    }
    console.log();

    console.log("Applying import inside a dev transaction (all-or-nothing)...");
    await devClient.query("BEGIN");
    try {
      console.log("  Truncating dev tables in reverse FK order...");
      for (const table of TABLES_REVERSE_ORDER) {
        await devClient.query(`TRUNCATE TABLE "${table}" CASCADE`);
      }

      console.log("  Inserting rows in forward FK order...");
      const rowCounts: Record<string, number> = {};
      for (const table of TABLES_FORWARD_ORDER) {
        const rows = prodData[table];
        rowCounts[table] = rows.length;

        if (rows.length === 0) {
          console.log(`    ${table}: 0 rows (skipped)`);
          continue;
        }

        const columns = Object.keys(rows[0]);
        const columnList = columns.map((c) => `"${c}"`).join(", ");

        const BATCH_SIZE = 500;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const placeholders = batch.map(
            (_, rowIdx) =>
              `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(", ")})`
          );
          const values = batch.flatMap((row) => columns.map((col) => row[col]));
          await devClient.query(
            `INSERT INTO "${table}" (${columnList}) VALUES ${placeholders.join(", ")}`,
            values
          );
        }

        console.log(`    ${table}: ${rows.length} rows inserted`);
      }

      console.log("  Resetting sequences to match max IDs...");
      for (const table of TABLES_FORWARD_ORDER) {
        const seqName = SEQUENCE_MAP[table];
        if (!seqName) continue;

        const { rows } = await devClient.query(`SELECT MAX(id) AS max_id FROM "${table}"`);
        const maxId = rows[0]?.max_id;

        if (maxId != null) {
          await devClient.query(`SELECT setval('${seqName}', $1)`, [maxId]);
          console.log(`    ${seqName} → ${maxId}`);
        } else {
          await devClient.query(`SELECT setval('${seqName}', 1, false)`);
          console.log(`    ${seqName} → reset to 1 (table empty)`);
        }
      }

      await devClient.query("COMMIT");
      console.log("  Transaction committed.\n");

      console.log("=== Import Summary ===");
      let totalRows = 0;
      for (const table of TABLES_FORWARD_ORDER) {
        const count = rowCounts[table] ?? 0;
        totalRows += count;
        console.log(`  ${table.padEnd(30)} ${String(count).padStart(6)} rows`);
      }
      console.log(`  ${"TOTAL".padEnd(30)} ${String(totalRows).padStart(6)} rows`);
      console.log("\nDone! Dev database now mirrors production.");
    } catch (txErr) {
      await devClient.query("ROLLBACK");
      console.error("Transaction rolled back. Dev database is unchanged.");
      throw txErr;
    }
  } finally {
    await prodClient.end();
    await devClient.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
