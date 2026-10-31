/* prefill from the query (IkoLearn's "Support & feedback" link): plain text only, one line, length-capped. React escapes
   it as a value; this also drops control characters and angle brackets so nothing odd lands in the form or the email */
export function cleanPrefill(v: unknown, max: number): string {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return "";
  return s.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}
