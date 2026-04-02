import { processBormeDate } from "../src/lib/borme";

const date = process.argv[2] ?? new Date().toISOString().slice(0,10).replace(/-/g,"");
console.log(`Procesando BORME del ${date}...`);
processBormeDate(date)
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(console.error);
