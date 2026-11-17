export const previewSizes = [160, 960] as const;
export type PreviewSize = (typeof previewSizes)[number];
export const previewQuality = 82;
export const previewSuffix = (size: PreviewSize) =>
  `.preview-v2-${size}-q${previewQuality}`;
export const previewDeletionSuffixes = [
  ".preview-v1-160",
  ".preview-v1-1024",
  ...previewSizes.map(previewSuffix),
];
export const previewCacheControl = "private, max-age=0, must-revalidate";
