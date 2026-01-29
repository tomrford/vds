import { createApp } from "./api/app.ts";
import { createDb } from "./db/client.ts";
import { migrate } from "./db/migrate.ts";

const port = Number(process.env.VDS_PORT ?? 3000);
const db = createDb();

await migrate(db);

const app = createApp(db);

console.log(`VDS server listening on http://localhost:${port}`);
export default { port, fetch: app.fetch };
