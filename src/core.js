/**
 * Parser for SDP "a=candidate:" attribute lines and the bare candidate strings
 * produced by WebRTC's RTCIceCandidate.candidate property.
 *
 * The format we target is the one defined by RFC 5245 section 15.1:
 *
 *   candidate:<foundation> <component-id> <transport> <priority>
 *   <connection-address> <port> [typ <candidate-type>]
 *   [raddr <connection-address>] [rport <port>]
 *   [<extension-name> <extension-value>]*
 *
 * WebRTC engines in the wild emit extensions (tcptype, generation, ufrag,
 * network-id, network-cost, etc.) that are not enumerated by RFC 5245. This
 * parser collects every "key value" pair after the typed fields into an
 * extensions object rather than picking a closed list, so it keeps working
 * when a new extension appears.
 *
 * Interpretation choice: We do NOT validate transport or candidate-type
 * against a fixed enum. The spec's transport is case-insensitive and some
 * stacks emit non-standard values during troubleshooting; rejecting them
 * would make the parser useless precisely when it is most needed. The
 * parser lower-cases transport and type so callers can compare safely,
 * but preserves every other field verbatim.
 */

/**
 * @typedef {Object} IceCandidate
 * @property {string} foundation
 * @property {number} component      1 = RTP, 2 = RTCP per RFC 5245.
 * @property {string} transport    lower-cased, e.g. "udp" or "tcp".
 * @property {number} priority
 * @property {string} address
 * @property {number} port
 * @property {string} type         lower-cased, e.g. "host"; "" when absent.
 * @property {string} relAddr      "" when no raddr extension is present.
 * @property {number} relPort      0 when no rport extension is present.
 * @property {Record<string,string>} extensions  every remaining key/value pair.
 */

/**
 * Splits a candidate string into whitespace-separated tokens. We trim
 * leading/trailing whitespace and collapse internal runs so callers can pass
 * either the trimmed RTCIceCandidate.candidate value or a raw SDP line; the
 * SDP variant can carry trailing CRLF that would otherwise break the port
 * parse.
 *
 * @param {string} raw
 * @returns {string[]}
 */
function tokenize(raw) {
  return String(raw).trim().split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Parses a bare ICE candidate string (the value of
 * RTCIceCandidate.candidate) into its structured fields. Accepts the
 * "candidate:" prefix as emitted by RTCIceCandidate.candidate.
 *
 * @param {string} candidate
 * @returns {IceCandidate}
 * @throws {TypeError} if candidate is not a string.
 * @throws {Error} if the string is too short or the typed extension is
 *   malformed.
 */
export function parseIceCandidate(candidate) {
  if (typeof candidate !== 'string') {
    throw new TypeError('candidate must be a string');
  }

  let body = candidate.trim();
  if (body.startsWith('candidate:')) {
    body = body.slice('candidate:'.length);
  }

  const tokens = tokenize(body);
  if (tokens.length < 6) {
    throw new Error('candidate must have at least 6 fields');
  }

  // RFC 5245: the token after the port is optional and, when present, MUST be
  // the literal "typ" introducing the candidate type. Some stacks emit the
  // type without a typ keyword during debugging; we treat that as malformed
  // rather than guessing, because guessing would silently mislabel extensions.
  let i = 0;
  const foundation = tokens[i++];
  const componentStr = tokens[i++];
  const transport = tokens[i++].toLowerCase();
  const priorityStr = tokens[i++];
  const address = tokens[i++];
  const portStr = tokens[i++];

  const component = Number(componentStr);
  const priority = Number(priorityStr);
  const port = Number(portStr);

  if (!Number.isInteger(component)) {
    throw new Error(`component must be an integer: ${componentStr}`);
  }
  if (!Number.isInteger(priority)) {
    throw new Error(`priority must be an integer: ${priorityStr}`);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`port out of range: ${portStr}`);
  }

  let type = '';
  /** @type {string} */
  let relAddr = '';
  let relPort = 0;
  /** @type {Record<string,string>} */
  const extensions = {};

  while (i < tokens.length) {
    const key = tokens[i++];
    const value = tokens[i++];
    if (value === undefined) {
      throw new Error(`extension "${key}" has no value`);
    }
    if (key === 'typ') {
      type = value.toLowerCase();
    } else if (key === 'raddr') {
      relAddr = value;
    } else if (key === 'rport') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        throw new Error(`rport out of range: ${value}`);
      }
      relPort = n;
    } else {
      extensions[key] = value;
    }
  }

  return {
    foundation,
    component,
    transport,
    priority,
    address,
    port,
    type,
    relAddr,
    relPort,
    extensions,
  };
}

/**
 * Normalizes an SDP "a=candidate:" attribute line and returns the parsed
 * candidate. Accepts the full line, the "candidate:" prefix, or the bare
 * candidate body. This leniency exists because SDP mungers routinely hand
 * us any of the three.
 *
 * @param {string} line
 * @returns {IceCandidate}
 */
export function normalizeIceCandidate(line) {
  if (typeof line !== 'string') {
    throw new TypeError('line must be a string');
  }
  const trimmed = line.trim();
  let body = trimmed;
  if (body.startsWith('a=')) {
    body = body.slice(2);
  }
  if (body.startsWith('candidate:')) {
    body = body.slice('candidate:'.length);
  }
  return parseIceCandidate(body);
}
