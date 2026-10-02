// A tiny GTFS-realtime reader: just enough protobuf to pull subway arrivals (route, stop, time) out of the
// MTA's free feeds, without a protobuf library. Unknown fields (and the MTA's extensions) are skipped.

function reader(buf) {
  let i = 0;
  const varint = () => {
    let v = 0;
    let mul = 1;
    for (;;) {
      const b = buf[i++];
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 128;
    }
  };
  return {
    get done() {
      return i >= buf.length;
    },
    /** The next field as [number, wire type]. */
    tag() {
      const t = varint();
      return [Math.floor(t / 8), t & 7];
    },
    varint,
    bytes() {
      const n = varint();
      const out = buf.subarray(i, i + n);
      i += n;
      return out;
    },
    skip(wire) {
      if (wire === 0) varint();
      else if (wire === 1) i += 8;
      else if (wire === 2) {
        const n = varint(); // read before adding: `i += varint()` would use the old i
        i += n;
      }
      else if (wire === 5) i += 4;
      else throw new Error(`protobuf: wire type ${wire}`);
    },
  };
}

const text = (b) => new TextDecoder().decode(b);

/** Each field of a message: fn(field, wire, r) returns true when it read the value itself. */
function each(buf, fn) {
  const r = reader(buf);
  while (!r.done) {
    const [f, w] = r.tag();
    if (!fn(f, w, r)) r.skip(w);
  }
}

function eventTime(buf) {
  let t = 0;
  each(buf, (f, w, r) => f === 2 && w === 0 && ((t = r.varint()), true));
  return t;
}

/**
 * Arrivals at the wanted stops (GTFS stop ids without the N/S suffix):
 * [{ stop, dir: 'N' | 'S', route, at: unix seconds }].
 */
export function arrivals(buf, wanted) {
  const out = [];
  each(buf, (f, w, r) => {
    if (f !== 2 || w !== 2) return false; // FeedMessage.entity
    each(r.bytes(), (f2, w2, r2) => {
      if (f2 !== 3 || w2 !== 2) return false; // FeedEntity.trip_update
      let route = '';
      const stops = [];
      each(r2.bytes(), (f3, w3, r3) => {
        if (f3 === 1 && w3 === 2) {
          // TripDescriptor.route_id
          each(r3.bytes(), (f4, w4, r4) => f4 === 5 && w4 === 2 && ((route = text(r4.bytes())), true));
          return true;
        }
        if (f3 === 2 && w3 === 2) {
          // StopTimeUpdate: stop_id, arrival, departure
          let stop = '';
          let at = 0;
          each(r3.bytes(), (f5, w5, r5) => {
            if (w5 !== 2) return false;
            if (f5 === 4) stop = text(r5.bytes());
            else if (f5 === 2) at = eventTime(r5.bytes()) || at;
            else if (f5 === 3) at = at || eventTime(r5.bytes());
            else return false;
            return true;
          });
          stops.push([stop, at]);
          return true;
        }
        return false;
      });
      for (const [stop, at] of stops) {
        const base = stop.slice(0, -1);
        const dir = stop.slice(-1);
        if (at && (dir === 'N' || dir === 'S') && wanted.has(base)) out.push({ stop: base, dir, route, at });
      }
      return true;
    });
    return true;
  });
  return out;
}
