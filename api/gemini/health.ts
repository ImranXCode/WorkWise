export default async function handler(req: any, res: any) {
  // Only allow GET requests
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    return;
  }

  // Set standard security headers
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const available = !!(apiKey && !apiKey.includes("YOUR_") && apiKey.length > 0);

  res.status(200).json({ available });
}
