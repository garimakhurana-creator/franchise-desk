import { parseRules } from "../lib/chat/rules";
const ds = { applications: [{ key: "APP-12", id: "APP-012", pin: "575002", space: "Rented", size: 350, floor: "Ground" }, { key: "APP-1", id: "APP-001" }], territories: [] } as never;
for (const m of process.argv.slice(2)) console.log(m, "\n  ", JSON.stringify(parseRules(m, ds, { lastIds: [], lastTerritories: [] }).commands));
