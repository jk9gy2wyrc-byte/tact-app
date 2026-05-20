import { db } from './packages/web/src/api/database/index.ts';
import { liveTrades } from './packages/web/src/api/database/schema.ts';
import { eq } from 'drizzle-orm';

// id -> asset mapping from screenshots
const assetMap: Record<number, string> = {
  // March 2026
  3: 'xau',   // #1
  4: 'eur',   // #2
  5: 'ger',   // #3
  6: 'ger',   // #4
  7: 'ger',   // #5
  8: 'gbp',   // #6
  9: 'eur',   // #7
  10: 'eur',  // #8
  11: 'ger',  // #9
  12: 'xau',  // #10
  13: 'ger',  // #11
  14: 'xau',  // #12
  15: 'eur',  // #13
  16: 'xau',  // #14
  17: 'gbp',  // #15
  18: 'ger',  // #16
  19: 'eur',  // #17
  20: 'ger',  // #18
  21: 'eur',  // #19
  // April 2026
  22: 'eur',  // #1
  23: 'gbp',  // #2
  24: 'gbp',  // #3
  25: 'eur',  // #4
  26: 'ger',  // #5
  27: 'ger',  // #6
  28: 'eur',  // #7
  29: 'eur',  // #8
  30: 'xau',  // #9
  31: 'ger',  // #10
  32: 'gbp',  // #11
  33: 'ger',  // #12
  34: 'ger',  // #13
  35: 'eur',  // #14
  36: 'eur',  // #15
  37: 'gbp',  // #16
  38: 'ger',  // #17
  39: 'eur',  // #18
  40: 'gbp',  // #19
  41: 'eur',  // #20
  42: 'gbp',  // #21
  43: 'gbp',  // #22
  // May 2026
  44: 'ger',  // #1
  45: 'ger',  // #2
  46: 'xau',  // #3
  47: 'ger',  // #4
  48: 'eur',  // #5
  49: 'ger',  // #6
  50: 'xau',  // #7
  51: 'ger',  // #8
  52: 'ger',  // #9
  53: 'ger',  // #10
  54: 'xau',  // #11
  55: 'ger',  // #12
  56: 'eur',  // #13
  57: 'gbp',  // #14
  58: 'eur',  // #15
  59: 'eur',  // #16
};

for (const [idStr, asset] of Object.entries(assetMap)) {
  const id = Number(idStr);
  await db.update(liveTrades).set({ asset }).where(eq(liveTrades.id, id));
  console.log(`Updated id=${id} -> ${asset}`);
}

console.log('Done!');
