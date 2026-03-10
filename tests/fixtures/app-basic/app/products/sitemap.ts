import type { MetadataRoute } from "next";

export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }];
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  return [
    {
      url: `https://example.com/products/batch-${id}/item-1`,
      lastModified: new Date("2025-03-01"),
    },
    {
      url: `https://example.com/products/batch-${id}/item-2`,
      lastModified: new Date("2025-03-01"),
    },
  ];
}
