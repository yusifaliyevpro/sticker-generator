export const loadImageFromUrl = async (url: string): Promise<Buffer> => {
  // data: URLs carry the image itself, so the caller doesn't need to host it publicly
  if (url.startsWith("data:")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load image (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
};
