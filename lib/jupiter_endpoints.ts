export const JUP_QUOTE_BASE =
  process.env.JUP_QUOTE_BASE?.trim() || 'https://lite-api.jup.ag/swap/v1/quote';
export const JUP_SWAP_BASE =
  process.env.JUP_SWAP_BASE?.trim()  || 'https://lite-api.jup.ag/swap/v1/swap';

export function logJupiterBases() {
  console.log(`🔁 JUP_QUOTE_BASE override: ${JUP_QUOTE_BASE}`);
  console.log(`🔁 JUP_SWAP_BASE override:  ${JUP_SWAP_BASE}`);
}





