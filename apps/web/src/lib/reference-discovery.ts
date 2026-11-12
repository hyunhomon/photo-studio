// Curated, generic words only: never send names, prompts or photos to search.
export const referenceSearchStyles = [
  {
    value: "catalog",
    label: "담백한 스튜디오",
    words: "fashion lookbook studio photography natural fabric shadows",
  },
  {
    value: "daylight",
    label: "창가 자연광",
    words: "fashion editorial window daylight photography contact shadows",
  },
  {
    value: "street",
    label: "거리와 건축",
    words: "fashion lookbook street architecture photography natural light",
  },
] as const;

export function pinterestSearchUrl(garment: string, style: string) {
  const category = [
    [/후드|hood/i, "hoodie"],
    [/셔츠|shirt/i, "shirt"],
    [/코트|coat/i, "coat"],
    [/니트|knit|스웨터/i, "knitwear"],
    [/바지|팬츠|trouser|pants/i, "trousers"],
    [/스커트|skirt/i, "skirt"],
    [/원피스|dress/i, "dress"],
  ] as const;
  const keyword =
    category.find(([pattern]) => pattern.test(garment))?.[1] ?? "clothing";
  const selected =
    referenceSearchStyles.find((s) => s.value === style) ??
    referenceSearchStyles[0];
  return `https://www.pinterest.com/search/pins/?${new URLSearchParams({ q: `${keyword} ${selected.words}` })}`;
}
