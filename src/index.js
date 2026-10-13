/**
 * Public surface for ice-candidate-parse-lib.
 *
 * Re-exports parseIceCandidate and normalizeIceCandidate so callers can import
 * from a single entry point. Keeping the surface narrow means downstream users
 * depend only on the documented contract, not on internal helpers.
 */
import { parseIceCandidate, normalizeIceCandidate } from './core.js';

export { parseIceCandidate, normalizeIceCandidate };
