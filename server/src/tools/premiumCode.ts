/**
 * Makes Premium activation codes (you sell/give these; each works once, for this installation only).
 *   npm run premium:code -- --months 1 --count 5
 */
import { config } from '../config.js';
import { PremiumStore } from '../premium.js';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  return Number.isInteger(v) && v > 0 ? v : fallback;
};

const months = Math.min(arg('months', 1), 24);
const count = Math.min(arg('count', 1), 100);

if (config.sessionSecret === 'dev-only-secret') {
  console.error('❌ SESSION_SECRET .env da o‘rnatilmagan. Kodlar shu kalit bilan imzolanadi — avval uni o‘rnating.');
  process.exit(1);
}
console.log(`${count} ta kod, har biri ${months} oy Premium:\n`);
for (let i = 0; i < count; i++) console.log(PremiumStore.makeCode(config.sessionSecret, months));
console.log('\nKod faqat shu o‘rnatishda (shu SESSION_SECRET bilan) ishlaydi va bir marta ishlatiladi.');
