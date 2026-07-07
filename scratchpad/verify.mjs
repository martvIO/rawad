import { toLocalIL, parseGuestLines } from "file:///Users/mrwen/Documents/Github/rawad/shared/src/utils/bulkGuests.js";

const arabic = "٠٥٢٤٢٦٤٠٩٤";
console.log("toLocalIL(arabic) =", JSON.stringify(toLocalIL(arabic)));
console.log("toLocalIL(western) =", JSON.stringify(toLocalIL("0524264094")));

const parsed = parseGuestLines("Mohammed Ahmad, " + arabic);
console.log("parseGuestLines stats:", JSON.stringify(parsed.stats));
console.log("row[0]:", JSON.stringify(parsed.rows[0]));
