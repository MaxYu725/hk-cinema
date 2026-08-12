const FLIGHT_CHUNK_PATTERN = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)\s*<\/script>/g;

function cineartError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function decodeCineArtFlightPayload(input) {
  const source = String(input || "");

  if (!source.includes("self.__next_f.push")) {
    return source;
  }

  const chunks = [];
  FLIGHT_CHUNK_PATTERN.lastIndex = 0;
  let match = null;

  while ((match = FLIGHT_CHUNK_PATTERN.exec(source))) {
    try {
      const decoded = JSON.parse(match[1]);
      if (typeof decoded === "string") chunks.push(decoded);
    } catch {
      // Ignore malformed/non-string Flight chunks and keep scanning.
    }
  }

  if (!chunks.length) {
    throw cineartError(
      "CINEART_FLIGHT_PAYLOAD_NOT_FOUND",
      "CineArt Next.js Flight payload was not found"
    );
  }

  return chunks.join("");
}

function extractBalancedObject(source, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }

  return null;
}

function findPropsObject(flight, predicate) {
  let cursor = 0;

  while ((cursor = flight.indexOf('{"lng":', cursor)) !== -1) {
    const raw = extractBalancedObject(flight, cursor);
    if (!raw) {
      cursor += 7;
      continue;
    }

    try {
      const value = JSON.parse(raw);
      if (predicate(value)) return value;
    } catch {
      // Continue scanning because Flight contains many independent JSON records.
    }

    cursor += 7;
  }

  return null;
}

export function parseCineArtHomePayload(input) {
  const flight = decodeCineArtFlightPayload(input);
  const props = findPropsObject(
    flight,
    value =>
      Array.isArray(value?.shows) &&
      Array.isArray(value?.movies) &&
      Array.isArray(value?.showSites) &&
      Array.isArray(value?.houseList)
  );

  if (!props) {
    throw cineartError(
      "CINEART_HOME_PROPS_NOT_FOUND",
      "CineArt home Flight props were not found"
    );
  }

  return { flight, props };
}

export function parseCineArtShowPayload(input) {
  const flight = decodeCineArtFlightPayload(input);
  const props = findPropsObject(
    flight,
    value => value?.showDetail?.show && value?.showId != null && value?.seatStatus
  );

  if (!props) {
    throw cineartError(
      "CINEART_SHOW_PROPS_NOT_FOUND",
      "CineArt show Flight props were not found"
    );
  }

  return { flight, props };
}

function utf8CodePointLength(codePoint) {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function sliceUtf8Bytes(source, startIndex, byteLength) {
  let bytes = 0;
  let endIndex = startIndex;

  while (endIndex < source.length && bytes < byteLength) {
    const codePoint = source.codePointAt(endIndex);
    const charLength = codePoint > 0xffff ? 2 : 1;
    bytes += utf8CodePointLength(codePoint);
    endIndex += charLength;
  }

  return bytes === byteLength ? source.slice(startIndex, endIndex) : null;
}

export function resolveCineArtFlightTextReference(flightInput, reference) {
  const flight = decodeCineArtFlightPayload(flightInput);
  const ref = String(reference || "");

  if (!/^\$[0-9a-f]+$/i.test(ref)) return null;

  const id = ref.slice(1).toLowerCase();
  const pattern = new RegExp(`(?:^|\\n)${id}:T([0-9a-f]+),`, "i");
  const match = pattern.exec(flight);
  if (!match) return null;

  const byteLength = Number.parseInt(match[1], 16);
  if (!Number.isFinite(byteLength) || byteLength < 0) return null;

  const startIndex = match.index + match[0].length;
  const raw = sliceUtf8Bytes(flight, startIndex, byteLength);
  if (raw == null) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
