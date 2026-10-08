import express from "express";
import morgan from "morgan";
import quoteApi from "./quote-api/index.ts";

const creator = "@yusifaliyevpro - Yusif Aliyev";

const app = express();
app.disable("x-powered-by");
app.set("json spaces", 2);
// Images arrive inline as base64 data URLs; Vercel caps request bodies at 4.5 MB anyway
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.json({ creator, msg: { script: "https://github.com/yusifaliyevpro/sticker-generator" } });
});

app.post("/", async (req, res) => {
  try {
    const data = await quoteApi(req.body);
    if (!data.image) return res.json({ creator, status: false, msg: "Something went wrong!" });
    res.json({ creator, status: true, data });
  } catch (error) {
    res.json({ creator, status: false, msg: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/{*splat}", (_req, res) => {
  res.json({ status: false });
});

// Vercel runs the exported app itself
if (!process.env.VERCEL) {
  const port = process.env.PORT || 8080;
  app.listen(port, () => console.log(`Quote-API (based on https://github.com/neoxr/quote-generator) listening on port ${port}`));
}

export default app;
