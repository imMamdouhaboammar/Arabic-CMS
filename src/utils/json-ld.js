/**
 * Serialize structured data for raw insertion into an HTML script element.
 * Escaping "<" prevents HTML script-tokenizer sequences such as </script>
 * from terminating the JSON-LD block while preserving valid JSON semantics.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function serializeJsonLd(value) {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new TypeError("JSON-LD value must be JSON-serializable");
  }

  return json.replace(/</g, "\\u003C");
}
