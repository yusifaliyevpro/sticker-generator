require("./lib/system/config.js");
const express = require("express");
const PORT = process.env.PORT || 8080;
const runServer = async () => {
  const app = express();
  app
    .set("json spaces", 2)
    // Images arrive inline as base64 data URLs; Vercel caps request bodies at 4.5 MB anyway
    .use(express.json({ limit: "10mb" }))
    .use(require("morgan")("dev"))
    .use("/", await require("./handler"))
    .get("/{*splat}", (req, res) =>
      res.json({
        status: false,
      })
    );
  app.disable("x-powered-by");
  app.listen(PORT, () => {
    console.log(`Quote-API (based on https://github.com/neoxr/quote-generator) listening on port ${PORT}`);
  });
};

runServer().catch(() => runServer());
