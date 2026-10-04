// Run: node pim/test.js
const assert = require('node:assert');
const { pimUrl } = require('./lib.js');
const BLADE = 'view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/aadmigratedroles';
const T = 'BF0A4E50-44D8-4492-B6DE-7CF8C8FDB929';

assert.strictEqual(pimUrl(), `https://portal.azure.com/#${BLADE}`);
assert.strictEqual(pimUrl(['ACALLIGARO.WORK (acalligarometsys.onmicrosoft.com)', T]), `https://portal.azure.com/#@${T.toLowerCase()}/${BLADE}`);
assert.strictEqual(pimUrl(['contoso.onmicrosoft.com']), `https://portal.azure.com/#@contoso.onmicrosoft.com/${BLADE}`);
assert.strictEqual(pimUrl(['Contoso Ltd', 'x/../y']), `https://portal.azure.com/#${BLADE}`); // display names never reach the URL
console.log('pim: all checks passed');
