/** Title key used to drop duplicates and to match Last.fm tracks to our seed tracks. Pure. */
export function titleKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((?:feat|ft|with)[^)]*\)|\[(?:feat|ft|with)[^\]]*\]/g, " ")
    .replace(/\s[-–]\s(?:remaster(?:ed)?|\d{4} remaster|single version|radio edit|album version|mono|stereo).*$/g, " ")
    .replace(/\((?:remaster(?:ed)?|\d{4} remaster(?:ed)?|radio edit|album version|single version|mono|stereo)[^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

