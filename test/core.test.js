import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIceCandidate, normalizeIceCandidate } from '../src/index.js';

/**
 * Happy path: a typical host candidate in the exact shape RTCIceCandidate
 * exposes via its .candidate property.
 */
test('parseIceCandidate parses a standard host candidate', () => {
  const c = parseIceCandidate(
    'candidate:842163049 1 udp 1677729535 192.0.2.3 64738 typ host generation 1 ufrag abcd network-id 1',
  );
  assert.equal(c.foundation, '842163049');
  assert.equal(c.component, 1);
  assert.equal(c.transport, 'udp');
  assert.equal(c.priority, 1677729535);
  assert.equal(c.address, '192.0.2.3');
  assert.equal(c.port, 64738);
  assert.equal(c.type, 'host');
  assert.equal(c.relAddr, '');
  assert.equal(c.relPort, 0);
  assert.deepEqual(c.extensions, {
    generation: '1',
    ufrag: 'abcd',
    'network-id': '1',
  });
});

/**
 * A srflx candidate carries raddr/rport, which is the awkward pair the parser
 * must special-case rather than dumping into extensions.
 */
test('parseIceCandidate parses a srflx candidate with raddr/rport', () => {
  const c = parseIceCandidate(
    'candidate:842163049 1 udp 1677729534 203.0.113.7 50000 typ srflx raddr 192.0.2.3 rport 64738',
  );
  assert.equal(c.type, 'srflx');
  assert.equal(c.relAddr, '192.0.2.3');
  assert.equal(c.relPort, 64738);
  assert.deepEqual(c.extensions, {});
});

/**
 * TCP candidates carry a tcptype extension. We deliberately do not promote
 * tcptype to a first-class field; it stays in extensions so the field set is
 * stable across engines that add or omit it.
 */
test('parseIceCandidate preserves unknown extensions verbatim', () => {
  const c = parseIceCandidate(
    'candidate:842163049 1 tcp 1518280447 192.0.2.3 9 typ host tcptype active',
  );
  assert.equal(c.transport, 'tcp');
  assert.equal(c.extensions.tcptype, 'active');
});

/**
 * Whitespace handling: SDP lines can carry CRLF and multiple spaces, and
 * the candidate may or may not include the "candidate:" prefix. normalize
 * must accept all of these.
 */
test('normalizeIceCandidate strips SDP framing and CRLF', () => {
  const line = 'a=candidate:842163049 1 udp 1677729535 192.0.2.3 64738 typ host\r\n';
  const c = normalizeIceCandidate(line);
  assert.equal(c.foundation, '842163049');
  assert.equal(c.port, 64738);
  assert.equal(c.type, 'host');
});

test('normalizeIceCandidate accepts a bare candidate body', () => {
  const c = normalizeIceCandidate('842163049 1 udp 1677729535 192.0.2.3 64738 typ host');
  assert.equal(c.foundation, '842163049');
  assert.equal(c.type, 'host');
});

test('normalizeIceCandidate accepts the candidate: prefix without a=', () => {
  const c = normalizeIceCandidate('candidate:842163049 1 udp 1677729535 192.0.2.3 64738 typ host');
  assert.equal(c.foundation, '842163049');
});

/**
 * Type errors come before content errors so a null input produces a clear
 * message rather than a confusing crash inside the tokenizer.
 */

test('parseIceCandidate throws TypeError on non-string', () => {
  assert.throws(() => parseIceCandidate(null), TypeError);
  assert.throws(() => parseIceCandidate(undefined), TypeError);
  assert.throws(() => parseIceCandidate(42), TypeError);
});

/**
 * A candidate shorter than six fields is structurally invalid per RFC 5245.
 */

test('parseIceCandidate rejects strings shorter than six fields', () => {
  assert.throws(() => parseIceCandidate('candidate:1 2 udp 3'), Error);
  assert.throws(() => parseIceCandidate(''), Error);
});

/**
 * Port is the only field whose range is bounded by the protocol; enforcing
 * that boundary here catches mangled inputs early instead of letting a
 * garbage port leak into an SDP rewriter.
 */

test('parseIceCandidate rejects out-of-range port', () => {
  assert.throws(
    () => parseIceCandidate('candidate:1 1 udp 1 192.0.2.3 99999 typ host'),
    /port out of range/,
  );
  assert.throws(
    () => parseIceCandidate('candidate:1 1 udp 1 192.0.2.3 -1 typ host'),
    /port out of range/,
  );
});

/**
 * A trailing extension keyword with no value is malformed; we fail rather
 * than silently dropping it.
 */

test('parseIceCandidate rejects a trailing extension with no value', () => {
  assert.throws(
    () => parseIceCandidate('candidate:1 1 udp 1 192.0.2.3 64738 typ host generation'),
    /extension "generation" has no value/,
  );
});

/**
 * rport has the same range constraint as port.
 */

test('parseIceCandidate rejects out-of-range rport', () => {
  assert.throws(
    () =>
      parseIceCandidate(
        'candidate:1 1 udp 1 203.0.113.7 50000 typ srflx raddr 192.0.2.3 rport 99999',
      ),
    /rport out of range/,
  );
});

/**
 * An IPv6 literal as the connection address. The tokenizer treats colons as
 * part of the token, so no special handling is needed — but we test it to
 * document that fact and guard against a future "smart" split.
 */

test('parseIceCandidate handles IPv6 connection address', () => {
  const c = parseIceCandidate(
    'candidate:842163049 1 udp 1677729535 2001:db8::1 64738 typ host',
  );
  assert.equal(c.address, '2001:db8::1');
  assert.equal(c.port, 64738);
});

/**
 * Multiple spaces between fields occur in hand-munged SDP and must collapse.
 */

test('parseIceCandidate tolerates runs of whitespace', () => {
  const c = parseIceCandidate(
    'candidate:842163049   1   udp   1677729535   192.0.2.3   64738   typ   host',
  );
  assert.equal(c.foundation, '842163049');
  assert.equal(c.port, 64738);
});
