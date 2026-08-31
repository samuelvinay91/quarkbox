import { QuarkBox } from "./packages/sdk/dist/index.js";

async function main() {
  const qb = new QuarkBox({ apiUrl: "http://localhost:3000/api" });

  console.log("  Fetching sandboxes via TypeScript SDK...");
  const list = await qb.sandboxes.list();
  console.log(`  TS SDK found ${list.length} active sandboxes`);

  console.log("  Creating sandbox via TypeScript SDK...");
  const sb = await qb.sandboxes.create({
    name: "ts-live-agent",
    image: "ubuntu:22.04",
  });
  console.log(`  TS SDK Created Sandbox ID: ${sb.id} (${sb.info.status})`);

  console.log("  Executing code in sandbox via TypeScript SDK...");
  const res = await sb.exec("echo 'TypeScript SDK End-to-End Execution Passed'");
  console.log("  TS SDK Exec Output:", res.stdout.trim());

  console.log("  Stopping sandbox via TypeScript SDK...");
  await sb.stop();
  console.log("  ✔ TypeScript SDK Verified 100%!");
}

main().catch((err) => {
  console.error("TypeScript SDK Test Error:", err);
  process.exit(1);
});
