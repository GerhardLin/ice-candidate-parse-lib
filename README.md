# ice-candidate-parse-lib

Parses WebRTC ICE candidate strings into foundation, component, protocol,
priority, address, port, type, related address/port, and an extensions map for
the rest.

## Usage

```js
import { parseIceCandidate, normalizeIceCandidate } from 'ice-candidate-parse-lib';

// RTCIceCandidate.candidate value
const c = parseIceCandidate(
  'candidate:842163049 1 udp 1677729535 192.0.2.3 64738 typ host generation 1 ufrag abcd',
);
console.log(c.foundation, c.component, c.transport, c.priority,
  c.address, c.port, c.type, c.extensions);
// 842163049 1 udp 1677729535 192.0.2.3 64738 host { generation: '1', ufrag: 'abcd' }

// Full SDP a= line, or one with the candidate: prefix, or a bare body
const fromSdp = normalizeIceCandidate('a=candidate:842163049 1 udp 1677729535 192.0.2.3 64738 typ host\r\n');
console.log(fromSdp.port); // 64738
```

Exports:
- `parseIceCandidate(candidate: string)` returns `{ foundation, component,
  transport, priority, address, port, type, relAddr, relPort, extensions }`.
  Throws on non-string input, on strings shorter than six fields, and on
  ports or rports outside 0–65535.
- `normalizeIceCandidate(line: string)` strips an optional `a=` prefix and
  optional `candidate:` prefix, then delegates to `parseIceCandidate`.

`component` and `priority` are integers (1 = RTP, 2 = RTCP). `transport` and
`type` are lower-cased. `relAddr` is `''` and `relPort` is `0` when the
candidate has no `raddr`/`rport` pair. Every extension after the typed fields
that is not `raddr` or `rport` lands in `extensions` as a string key and string
value.

## Why

The candidate strings emitted by WebRTC are documented by RFC 5245 but, in
practice, engines append a growing list of extensions (`generation`, `ufrag`,
`tcptype`, `network-id`, `network-cost`, …). A parser that maps a fixed set of
known extensions to fields breaks the moment a new one appears. This library
handles the RFC fields explicitly and sweeps every remaining `key value` pair
into an `extensions` bag, so it keeps working on candidates that did not exist
when it was written.

The trade-off is that callers must know to look in `extensions` for anything
beyond `type`, `relAddr`, and `relPort`. That is deliberate: promoting a few
popular extensions to first-class fields would create a maintenance treadmill
and an inconsistent surface.

## Edge to watch

A candidate with a trailing extension keyword and no value
(`… typ host generation`) is rejected, not silently truncated. If you are
feeding this parser SDP you assembled by hand, make sure every extension has
its value.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

